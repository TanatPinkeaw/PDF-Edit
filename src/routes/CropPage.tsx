import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { PDFDocument } from '@cantoo/pdf-lib';

import { ToolPage } from '../components/ToolPage';
import { croppedFileName, downloadBytes } from '../lib/download';
import { cropPdf } from '../lib/pdf/crop';
import { inspectPdf } from '../lib/pdf-ops';

type Status = { tone: 'info' | 'error'; text: string } | null;

type Percent = { top: number; right: number; bottom: number; left: number };

const INITIAL: Percent = { top: 6, right: 6, bottom: 6, left: 6 };

const FIELDS: { key: keyof Percent; label: string }[] = [
  { key: 'top', label: 'บน' },
  { key: 'right', label: 'ขวา' },
  { key: 'bottom', label: 'ล่าง' },
  { key: 'left', label: 'ซ้าย' },
];

export function CropPage() {
  const [pdf, setPdf] = useState<{ name: string; bytes: Uint8Array; pages: number; width: number; height: number } | null>(null);
  const [percent, setPercent] = useState<Percent>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const inspection = await inspectPdf(bytes);
      if (inspection.encrypted) throw new Error('ไฟล์นี้มีรหัสผ่าน — ปลดล็อกก่อนแล้วค่อยครอป');
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      const first = doc.getPages()[0];
      setPdf({
        name: file.name,
        bytes,
        pages: inspection.pageCount,
        width: first ? Math.round(first.getWidth()) : 595,
        height: first ? Math.round(first.getHeight()) : 842,
      });
    } catch (error) {
      setPdf(null);
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'เปิดไฟล์ไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  }, []);

  const apply = async () => {
    if (!pdf) return;
    setBusy(true);
    setStatus(null);
    try {
      const insets = {
        top: (pdf.height * percent.top) / 100,
        right: (pdf.width * percent.right) / 100,
        bottom: (pdf.height * percent.bottom) / 100,
        left: (pdf.width * percent.left) / 100,
      };
      const targets = Array.from({ length: pdf.pages }, (_, pageIndex) => ({ pageIndex, insets }));
      const bytes = await cropPdf(pdf.bytes, targets);
      const name = croppedFileName(pdf.name);
      downloadBytes(name, bytes);
      setStatus({ tone: 'info', text: `ดาวน์โหลด ${name} แล้ว — ${pdf.pages} หน้า` });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'ครอปไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  };

  const guideStyle = {
    top: `${percent.top}%`,
    right: `${percent.right}%`,
    bottom: `${percent.bottom}%`,
    left: `${percent.left}%`,
  };

  return (
    <ToolPage
      title="Crop PDF"
      description="ครอปขอบทุกหน้าเพื่อตัดที่ว่างหรือขอบสแกน — เนื้อหาส่วนที่ถูกตัดยังอยู่ในไฟล์ (ใช้ Redact เมื่อต้องลบข้อมูลจริง)"
    >
      <div className="simple-tool">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          onChange={(event) => void handleFile(event)}
          aria-label="เลือกไฟล์ PDF"
          tabIndex={-1}
        />

        {!pdf ? (
          <div className="dropzone">
            <h2>ลากไฟล์ PDF มาวางตรงนี้</h2>
            <p className="dropzone-sub">ตั้งขอบทั้ง 4 ด้าน แล้วบันทึกเป็นไฟล์ใหม่</p>
            <div className="dropzone-actions">
              <button type="button" className="button-primary button-large" onClick={() => inputRef.current?.click()} disabled={busy}>
                เลือกไฟล์ PDF
              </button>
            </div>
          </div>
        ) : (
          <div className="simple-grid">
            <div className="crop-stage">
              <div className="crop-page" style={{ aspectRatio: `${pdf.width} / ${pdf.height}` }}>
                <div className="crop-keep" style={guideStyle}>
                  <span>พื้นที่เก็บไว้</span>
                </div>
              </div>
              <p className="export-meta">
                {pdf.name} · {pdf.pages} หน้า · หน้าแรก {pdf.width}×{pdf.height} pt
              </p>
            </div>

            <aside className="panel">
              <header className="panel-head">
                <h2>ระยะครอป</h2>
                <span className="panel-note">% ของด้าน</span>
              </header>

              {FIELDS.map((field) => (
                <div key={field.key} className="crop-field">
                  <label htmlFor={`crop-${field.key}`}>
                    {field.label} · {percent[field.key]}%
                  </label>
                  <input
                    id={`crop-${field.key}`}
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={percent[field.key]}
                    onChange={(event) =>
                      setPercent((current) => ({ ...current, [field.key]: Number(event.target.value) }))
                    }
                  />
                </div>
              ))}

              <button type="button" className="button-ghost" onClick={() => setPercent(INITIAL)}>
                รีเซ็ตค่า
              </button>

              <button
                type="button"
                className="button-primary button-large"
                onClick={() => void apply()}
                disabled={busy || percent.left + percent.right >= 100 || percent.top + percent.bottom >= 100}
              >
                {busy ? 'กำลังครอป…' : 'ครอปและดาวน์โหลด'}
              </button>

              <button type="button" className="button-secondary" onClick={() => inputRef.current?.click()}>
                เปลี่ยนไฟล์
              </button>
            </aside>
          </div>
        )}

        {status && (
          <div className="status" role="status" data-tone={status.tone}>
            <span>{status.text}</span>
          </div>
        )}
      </div>
    </ToolPage>
  );
}
