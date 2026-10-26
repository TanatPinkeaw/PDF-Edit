import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { PresetPicker } from '../components/PresetPicker';
import { CreditNotice } from '../components/CreditNotice';
import { OutputNameField } from '../components/OutputNameField';
import { StampPreview } from '../components/StampPreview';
import { ToolPage } from '../components/ToolPage';
import { Workbench } from '../components/Workbench';
import { useCurrentDocument } from '../hooks/useCurrentDocument';
import { useOutputName } from '../hooks/useOutputName';
import { useToolRun } from '../hooks/useToolRun';
import { watermarkedFileName } from '../lib/download';
import { PdfError } from '../lib/pdf-ops';
import type { FontWeight } from '../lib/pdf/fonts';
import { POSITION_LABELS, isHexColor, type StampPosition } from '../lib/pdf/paint';
import { takeReplay } from '../lib/replay';
import {
  watermarkPdf,
  type WatermarkImageOptions,
  type WatermarkTextOptions,
} from '../lib/pdf/watermark';
import { selectedPageNumbers } from '../lib/session';
import { useWorkspace } from '../state/workspace-context';

type Scope = 'all' | 'selected';
type Kind = 'text' | 'image';

type ImageSource = {
  name: string;
  bytes: Uint8Array;
  type: 'png' | 'jpeg';
};

const POSITIONS = Object.keys(POSITION_LABELS) as StampPosition[];

function imageTypeOf(file: File): 'png' | 'jpeg' | null {
  if (file.type === 'image/png' || /\.png$/i.test(file.name)) return 'png';
  if (file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)) return 'jpeg';
  return null;
}

export function WatermarkPage() {
  const { session } = useWorkspace();
  const { run, creditMessage, clearCreditMessage } = useToolRun();
  const current = useCurrentDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<Kind>('text');
  const [text, setText] = useState('ห้ามเผยแพร่');
  const [fontSize, setFontSize] = useState(56);
  const [weight, setWeight] = useState<FontWeight>('bold');
  const [color, setColor] = useState('#8a3a1c');
  const [opacity, setOpacity] = useState(0.16);
  const [rotation, setRotation] = useState(-30);
  const [position, setPosition] = useState<StampPosition>('middle-center');
  const [gap, setGap] = useState(90);
  const [widthRatio, setWidthRatio] = useState(0.35);
  const [image, setImage] = useState<ImageSource | null>(null);
  const [scope, setScope] = useState<Scope>('all');

  const doc = session.doc;
  const outputName = useOutputName(watermarkedFileName(doc?.fileName ?? 'document.pdf'));
  const selected = selectedPageNumbers(session.state);
  const previewIndex = scope === 'selected' ? Math.max(0, (selected[0] ?? 1) - 1) : 0;

  const buildOptions = useMemo<(pages: readonly number[] | null) => WatermarkTextOptions | WatermarkImageOptions | null>(() => {
    if (kind === 'text') {
      return (pages) => ({
        kind: 'text',
        text,
        fontSize,
        weight,
        color,
        opacity,
        rotation,
        position,
        gap,
        pages,
      });
    }
    if (!image) return () => null;
    return (pages) => ({
      kind: 'image',
      bytes: image.bytes,
      type: image.type,
      widthRatio,
      opacity,
      rotation,
      position,
      gap,
      pages,
    });
  }, [color, fontSize, gap, image, kind, opacity, position, rotation, weight, widthRatio]);

  const previewSignature = JSON.stringify([
    kind,
    text,
    fontSize,
    weight,
    color,
    opacity,
    rotation,
    position,
    gap,
    widthRatio,
    image ? `${image.name}:${image.bytes.byteLength}` : null,
    scope,
    previewIndex,
    selected,
  ]);

  const previewBuild = useMemo(
    () => async (pageBytes: Uint8Array): Promise<Uint8Array> => {
      const options = buildOptions(null);
      if (!options) return pageBytes;
      return watermarkPdf(pageBytes, options);
    },
    [buildOptions],
  );

  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const type = imageTypeOf(file);
    if (!type) {
      session.notify('error', 'รองรับเฉพาะรูป PNG และ JPG');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    setImage({ name: file.name, bytes, type });
    setKind('image');
  };

  const exportWatermark = async () => {
    if (!doc || !current) return;
    if (kind === 'text' && text.trim() === '') {
      session.notify('error', 'ยังไม่ได้พิมพ์ข้อความลายน้ำ');
      return;
    }
    if (kind === 'image' && !image) {
      session.notify('error', 'ยังไม่ได้เลือกรูปสำหรับลายน้ำ');
      return;
    }
    if (scope === 'selected' && selected.length === 0) {
      session.notify('error', 'ยังไม่ได้เลือกหน้า — เลือกอย่างน้อย 1 หน้า');
      return;
    }

    const pages = scope === 'selected' ? selected : null;
    const options = buildOptions(pages);
    if (!options) return;

    await run(
      'watermark',
      {
        kind,
        text: kind === 'text' ? text : undefined,
        imageName: kind === 'image' ? image?.name : undefined,
        fontSize,
        weight,
        color,
        opacity,
        rotation,
        position,
        gap,
        widthRatio,
        scope,
        pages,
      },
      async () => {
        if (!current) throw new PdfError('invalid', 'เอกสารยังไม่พร้อม');
        const bytes = await watermarkPdf(current, options);
        return { name: outputName.resolved, bytes };
      },
      { name: doc.fileName, pages: doc.entries.length, bytes: session.bytes?.byteLength ?? 0 },
    );
  };

  const applyPreset = (params: Record<string, unknown>) => {
    if (typeof params.text === 'string') {
      setText(params.text);
      setKind('text');
    }
    if (typeof params.fontSize === 'number') setFontSize(params.fontSize);
    if (params.weight === 'regular' || params.weight === 'bold') setWeight(params.weight);
    if (typeof params.color === 'string' && isHexColor(params.color)) setColor(params.color);
    if (typeof params.opacity === 'number') setOpacity(params.opacity);
    if (typeof params.rotation === 'number') setRotation(params.rotation);
    if (typeof params.position === 'string' && POSITIONS.includes(params.position as StampPosition)) {
      setPosition(params.position as StampPosition);
    }
    if (typeof params.gap === 'number') setGap(params.gap);
    if (params.scope === 'all' || params.scope === 'selected') setScope(params.scope);
  };

  useEffect(() => {
    const replay = takeReplay<Record<string, unknown>>('watermark');
    if (replay) applyPreset(replay);
    // Replay is consumed once per navigation from the history page.
  }, []);

  return (
    <ToolPage
      title="Watermark"
      description="ประทับข้อความหรือรูปบนหน้า PDF ปรับความทึบ มุม และปูซ้ำทั่วหน้า — ตัวอย่างเป็นการเรนเดอร์จริง"
    >
      <Workbench
        allowDelete={false}
        aside={
          <>
            <section className="panel" aria-labelledby="watermark-title">
              <header className="panel-head">
                <h2 id="watermark-title">ลายน้ำ</h2>
                <span className="panel-note">{doc?.entries.length ?? 0} หน้า</span>
              </header>

              <div className="segmented segmented-wide" role="group" aria-label="ชนิดลายน้ำ">
                <button
                  type="button"
                  className="segment"
                  aria-pressed={kind === 'text'}
                  onClick={() => setKind('text')}
                  disabled={session.busy}
                >
                  ข้อความ
                </button>
                <button
                  type="button"
                  className="segment"
                  aria-pressed={kind === 'image'}
                  onClick={() => setKind('image')}
                  disabled={session.busy}
                >
                  รูปภาพ
                </button>
              </div>

              {doc && current && (
                <StampPreview
                  bytes={current}
                  pageIndex={previewIndex}
                  signature={previewSignature}
                  build={previewBuild}
                />
              )}

              {kind === 'text' ? (
                <>
                  <label className="field-label" htmlFor="wm-text">
                    ข้อความ
                  </label>
                  <input
                    id="wm-text"
                    className="range-input"
                    value={text}
                    maxLength={120}
                    onChange={(event) => setText(event.target.value)}
                    disabled={session.busy}
                  />

                  <div className="field-grid">
                    <label className="field">
                      <span className="field-label">ขนาด</span>
                      <input
                        type="number"
                        min={8}
                        max={200}
                        value={fontSize}
                        onChange={(event) => setFontSize(Number(event.target.value) || 48)}
                        disabled={session.busy}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">มุม (องศา)</span>
                      <input
                        type="number"
                        min={-180}
                        max={180}
                        step={5}
                        value={rotation}
                        onChange={(event) => setRotation(Number(event.target.value) || 0)}
                        disabled={session.busy}
                      />
                    </label>
                  </div>

                  <div className="control-row">
                    <span className="field-label">น้ำหนัก</span>
                    <div className="segmented" role="group" aria-label="น้ำหนักฟอนต์ลายน้ำ">
                      <button
                        type="button"
                        className="segment"
                        aria-pressed={weight === 'regular'}
                        onClick={() => setWeight('regular')}
                        disabled={session.busy}
                      >
                        ปกติ
                      </button>
                      <button
                        type="button"
                        className="segment"
                        aria-pressed={weight === 'bold'}
                        onClick={() => setWeight('bold')}
                        disabled={session.busy}
                      >
                        หนา
                      </button>
                    </div>
                  </div>

                  <label className="field">
                    <span className="field-label">สี</span>
                    <input
                      type="color"
                      value={color}
                      onChange={(event) => setColor(event.target.value)}
                      disabled={session.busy}
                    />
                  </label>
                </>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                    className="visually-hidden"
                    onChange={(event) => void handleImage(event)}
                    aria-label="เลือกรูปลายน้ำ"
                    tabIndex={-1}
                  />
                  <div className="image-picker">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={session.busy}
                    >
                      เลือกรูป PNG / JPG
                    </button>
                    <span className="panel-note">{image ? image.name : 'ยังไม่ได้เลือก'}</span>
                  </div>

                  <label className="field">
                    <span className="field-label">
                      ความกว้าง {Math.round(widthRatio * 100)}% ของหน้า
                    </span>
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={widthRatio}
                      onChange={(event) => setWidthRatio(Number(event.target.value))}
                      disabled={session.busy}
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">มุม (องศา)</span>
                    <input
                      type="number"
                      min={-180}
                      max={180}
                      step={5}
                      value={rotation}
                      onChange={(event) => setRotation(Number(event.target.value) || 0)}
                      disabled={session.busy}
                    />
                  </label>
                </>
              )}

              <div className="field-grid">
                <label className="field">
                  <span className="field-label">ความทึบ {Math.round(opacity * 100)}%</span>
                  <input
                    type="range"
                    min={0.02}
                    max={1}
                    step={0.02}
                    value={opacity}
                    onChange={(event) => setOpacity(Number(event.target.value))}
                    disabled={session.busy}
                  />
                </label>
                <label className="field">
                  <span className="field-label">ระยะห่าง (ปูทั้งหน้า)</span>
                  <input
                    type="number"
                    min={0}
                    max={400}
                    value={gap}
                    onChange={(event) => setGap(Number(event.target.value) || 0)}
                    disabled={session.busy || position !== 'tile'}
                  />
                </label>
              </div>

              <label className="field-label" htmlFor="wm-position">
                ตำแหน่ง
              </label>
              <select
                id="wm-position"
                value={position}
                onChange={(event) => setPosition(event.target.value as StampPosition)}
                disabled={session.busy}
              >
                {POSITIONS.map((option) => (
                  <option key={option} value={option}>
                    {POSITION_LABELS[option]}
                  </option>
                ))}
              </select>

              <div className="control-row">
                <span className="field-label">ขอบเขต</span>
                <div className="segmented" role="group" aria-label="ขอบเขตหน้า">
                  <button
                    type="button"
                    className="segment"
                    aria-pressed={scope === 'all'}
                    onClick={() => setScope('all')}
                    disabled={session.busy}
                  >
                    ทุกหน้า
                  </button>
                  <button
                    type="button"
                    className="segment"
                    aria-pressed={scope === 'selected'}
                    onClick={() => setScope('selected')}
                    disabled={session.busy}
                  >
                    ที่เลือก ({selected.length})
                  </button>
                </div>
              </div>

              <OutputNameField name={outputName} disabled={session.busy} />

              <button
                type="button"
                className="button-primary button-large"
                onClick={() => void exportWatermark()}
                disabled={!doc || !current || session.busy}
              >
                {session.busy ? 'กำลังประทับลายน้ำ…' : 'ใส่ลายน้ำและดาวน์โหลด'}
              </button>
            </section>

            <CreditNotice message={creditMessage} onDismiss={clearCreditMessage} />

            <PresetPicker
              tool="watermark"
              params={{
                text,
                fontSize,
                weight,
                color,
                opacity,
                rotation,
                position,
                gap,
                scope,
              }}
              onApply={applyPreset}
              disabled={session.busy}
            />
          </>
        }
      />
    </ToolPage>
  );
}
