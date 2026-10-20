import { useEffect, useMemo, useState } from 'react';

import { PresetPicker } from '../components/PresetPicker';
import { QuotaNotice } from '../components/QuotaNotice';
import { StampPreview } from '../components/StampPreview';
import { ToolPage } from '../components/ToolPage';
import { Workbench } from '../components/Workbench';
import { useCurrentDocument } from '../hooks/useCurrentDocument';
import { useToolRun } from '../hooks/useToolRun';
import { numberedFileName } from '../lib/download';
import { PdfError } from '../lib/pdf-ops';
import type { FontWeight } from '../lib/pdf/fonts';
import {
  DEFAULT_TEMPLATE,
  addPageNumbers,
  templateError,
  type PageNumbersOptions,
} from '../lib/pdf/page-numbers';
import { POSITION_LABELS, isHexColor, type StampPosition } from '../lib/pdf/paint';
import { takeReplay } from '../lib/replay';
import { selectedPageNumbers } from '../lib/session';
import { useWorkspace } from '../state/workspace-context';

type Scope = 'all' | 'selected';
/** Page numbers cannot be tiled. */
type LabelPosition = Exclude<StampPosition, 'tile'>;

const POSITIONS = (Object.keys(POSITION_LABELS) as StampPosition[]).filter(
  (position): position is LabelPosition => position !== 'tile',
);

export function PageNumbersPage() {
  const { session } = useWorkspace();
  const { run, quotaMessage, clearQuotaMessage } = useToolRun();
  const current = useCurrentDocument();

  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [start, setStart] = useState(1);
  const [skipFirst, setSkipFirst] = useState(0);
  const [position, setPosition] = useState<LabelPosition>('bottom-center');
  const [fontSize, setFontSize] = useState(10);
  const [margin, setMargin] = useState(24);
  const [weight, setWeight] = useState<FontWeight>('regular');
  const [color, setColor] = useState('#333333');
  const [opacity, setOpacity] = useState(0.9);
  const [thaiDigits, setThaiDigits] = useState(false);
  const [scope, setScope] = useState<Scope>('all');

  const doc = session.doc;
  const selected = selectedPageNumbers(session.state);
  const total = doc?.entries.length ?? 0;
  const problem = templateError(template);

  const previewIndex = scope === 'selected' ? Math.max(0, (selected[0] ?? 1) - 1) : 0;
  const previewSkipped = previewIndex < skipFirst;
  const previewTemplate = template.replace(/\{total\}/g, String(total));

  const previewSignature = JSON.stringify([
    template,
    start,
    skipFirst,
    position,
    fontSize,
    margin,
    weight,
    color,
    opacity,
    thaiDigits,
    scope,
    previewIndex,
    total,
    selected,
  ]);

  const previewBuild = useMemo(
    () =>
      async (pageBytes: Uint8Array): Promise<Uint8Array> => {
        if (previewSkipped) return pageBytes;
        return addPageNumbers(pageBytes, {
          template: previewTemplate,
          start: start + Math.max(0, previewIndex - skipFirst),
          skipFirst: 0,
          position,
          fontSize,
          margin,
          weight,
          color,
          opacity,
          thaiDigits,
        });
      },
    [
      color,
      fontSize,
      margin,
      opacity,
      position,
      previewIndex,
      previewSkipped,
      previewTemplate,
      skipFirst,
      start,
      thaiDigits,
      weight,
    ],
  );

  const exportNumbers = async () => {
    if (!doc || !current) return;
    if (problem) {
      session.notify('error', problem);
      return;
    }
    if (scope === 'selected' && selected.length === 0) {
      session.notify('error', 'ยังไม่ได้เลือกหน้า — เลือกอย่างน้อย 1 หน้า');
      return;
    }

    const options: PageNumbersOptions = {
      template,
      start,
      skipFirst,
      position,
      fontSize,
      margin,
      weight,
      color,
      opacity,
      thaiDigits,
      pages: scope === 'selected' ? selected : null,
    };

    await run(
      'page-numbers',
      {
        template,
        start,
        skipFirst,
        position,
        fontSize,
        margin,
        weight,
        color,
        opacity,
        thaiDigits,
        scope,
        pages: options.pages,
      },
      async () => {
        if (!current) throw new PdfError('invalid', 'เอกสารยังไม่พร้อม');
        const bytes = await addPageNumbers(current, options);
        return { name: numberedFileName(doc.fileName), bytes };
      },
      { name: doc.fileName, pages: total, bytes: session.bytes?.byteLength ?? 0 },
    );
  };

  const applyPreset = (params: Record<string, unknown>) => {
    if (typeof params.template === 'string') setTemplate(params.template);
    if (typeof params.start === 'number') setStart(Math.max(1, Math.round(params.start)));
    if (typeof params.skipFirst === 'number') setSkipFirst(Math.max(0, Math.round(params.skipFirst)));
    if (typeof params.position === 'string' && POSITIONS.includes(params.position as LabelPosition)) {
      setPosition(params.position as LabelPosition);
    }
    if (typeof params.fontSize === 'number') setFontSize(params.fontSize);
    if (typeof params.margin === 'number') setMargin(params.margin);
    if (params.weight === 'regular' || params.weight === 'bold') setWeight(params.weight);
    if (typeof params.color === 'string' && isHexColor(params.color)) setColor(params.color);
    if (typeof params.opacity === 'number') setOpacity(params.opacity);
    if (typeof params.thaiDigits === 'boolean') setThaiDigits(params.thaiDigits);
    if (params.scope === 'all' || params.scope === 'selected') setScope(params.scope);
  };

  useEffect(() => {
    const replay = takeReplay<Record<string, unknown>>('page-numbers');
    if (replay) applyPreset(replay);
    // Replay is consumed once per navigation from the history page.
  }, []);

  return (
    <ToolPage
      title="Page numbers"
      description="ใส่เลขหน้าแบบกำหนดเอง รองรับเลขไทยและฟอนต์ Sarabun — เห็นตัวอย่างจริงก่อนดาวน์โหลด"
    >
      <Workbench
        allowDelete={false}
        aside={
          <>
            <section className="panel" aria-labelledby="numbers-title">
              <header className="panel-head">
                <h2 id="numbers-title">เลขหน้า</h2>
                <span className="panel-note">{total} หน้า</span>
              </header>

              {doc && current && (
                <StampPreview
                  bytes={current}
                  pageIndex={previewIndex}
                  signature={previewSignature}
                  build={previewBuild}
                />
              )}

              <label className="field-label" htmlFor="pn-template">
                รูปแบบ
              </label>
              <input
                id="pn-template"
                className="range-input"
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
                placeholder="{n} / {total}"
                spellCheck={false}
                disabled={session.busy}
                aria-invalid={problem !== null}
              />
              {problem ? (
                <p className="form-error">{problem}</p>
              ) : (
                <p className="hint">
                  ใช้ <code>{'{n}'}</code> แทนเลขหน้า และ <code>{'{total}'}</code> แทนจำนวนหน้าทั้งหมด
                </p>
              )}

              <div className="field-grid">
                <label className="field">
                  <span className="field-label">เริ่มที่เลข</span>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={start}
                    onChange={(event) => setStart(Math.max(1, Number(event.target.value) || 1))}
                    disabled={session.busy}
                  />
                </label>

                <label className="field">
                  <span className="field-label">ข้ามหน้าแรก</span>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(0, total - 1)}
                    value={skipFirst}
                    onChange={(event) =>
                      setSkipFirst(Math.max(0, Math.min(total - 1, Number(event.target.value) || 0)))
                    }
                    disabled={session.busy || scope === 'selected'}
                    title={scope === 'selected' ? 'ใช้กับการเลือกหน้าแทน' : undefined}
                  />
                </label>
              </div>

              <label className="field-label" htmlFor="pn-position">
                ตำแหน่ง
              </label>
              <select
                id="pn-position"
                value={position}
                onChange={(event) => setPosition(event.target.value as LabelPosition)}
                disabled={session.busy}
              >
                {POSITIONS.map((option) => (
                  <option key={option} value={option}>
                    {POSITION_LABELS[option]}
                  </option>
                ))}
              </select>

              <div className="field-grid">
                <label className="field">
                  <span className="field-label">ขนาดตัวอักษร</span>
                  <input
                    type="number"
                    min={6}
                    max={72}
                    value={fontSize}
                    onChange={(event) => setFontSize(Number(event.target.value) || 10)}
                    disabled={session.busy}
                  />
                </label>
                <label className="field">
                  <span className="field-label">ระยะขอบ (pt)</span>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={margin}
                    onChange={(event) => setMargin(Number(event.target.value) || 0)}
                    disabled={session.busy}
                  />
                </label>
              </div>

              <div className="control-row">
                <span className="field-label">ฟอนต์</span>
                <div className="segmented" role="group" aria-label="น้ำหนักฟอนต์">
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

              <div className="field-grid">
                <label className="field">
                  <span className="field-label">สี</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    disabled={session.busy}
                  />
                </label>
                <label className="field">
                  <span className="field-label">ความทึบ {Math.round(opacity * 100)}%</span>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={opacity}
                    onChange={(event) => setOpacity(Number(event.target.value))}
                    disabled={session.busy}
                  />
                </label>
              </div>

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={thaiDigits}
                  onChange={(event) => setThaiDigits(event.target.checked)}
                  disabled={session.busy}
                />
                ใช้เลขไทย (๑ ๒ ๓)
              </label>

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

              <button
                type="button"
                className="button-primary button-large"
                onClick={() => void exportNumbers()}
                disabled={!doc || !current || session.busy || problem !== null}
              >
                {session.busy ? 'กำลังใส่เลขหน้า…' : 'ใส่เลขหน้าและดาวน์โหลด'}
              </button>

              <p className="hint">
                ไฟล์ผลลัพธ์ชื่อ <code>{doc ? numberedFileName(doc.fileName) : 'document-numbered.pdf'}</code>
              </p>
            </section>

            <QuotaNotice message={quotaMessage} onDismiss={clearQuotaMessage} />

            <PresetPicker
              tool="page-numbers"
              params={{
                template,
                start,
                skipFirst,
                position,
                fontSize,
                margin,
                weight,
                color,
                opacity,
                thaiDigits,
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
