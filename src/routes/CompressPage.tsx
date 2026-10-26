import { useCallback, useRef, useState, type ChangeEvent } from 'react';

import { DropOverlay } from '../components/DropOverlay';
import { OutputNameField } from '../components/OutputNameField';
import { ToolPage } from '../components/ToolPage';
import { useFileDrop } from '../hooks/useFileDrop';
import { useOutputName } from '../hooks/useOutputName';
import { compressedFileName, downloadBytes } from '../lib/download';
import { dropRejectedMessage, isPdfFile } from '../lib/dropped-files';
import { COMPRESS_PRESETS, compressPdf, describeSaving, type CompressQuality } from '../lib/pdf/compress';
import { inspectPdf } from '../lib/pdf-ops';

type Status = { tone: 'info' | 'error'; text: string } | null;

type Result = {
  bytes: Uint8Array;
  originalBytes: number;
};

const QUALITIES: CompressQuality[] = ['screen', 'balanced', 'print'];

export function CompressPage() {
  const [pdf, setPdf] = useState<{ name: string; bytes: Uint8Array; pages: number } | null>(null);
  const outputName = useOutputName(compressedFileName(pdf?.name ?? 'document.pdf'));
  const [quality, setQuality] = useState<CompressQuality>('balanced');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openFile = useCallback(async (file: File) => {
    setBusy(true);
    setStatus(null);
    setResult(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const inspection = await inspectPdf(bytes);
      if (inspection.encrypted) throw new Error('ไฟล์นี้มีรหัสผ่าน — ปลดล็อกก่อนแล้วค่อยบีบอัด');
      setPdf({ name: file.name, bytes, pages: inspection.pageCount });
    } catch (error) {
      setPdf(null);
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'เปิดไฟล์ไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void openFile(file);
  };

  const drop = useFileDrop({
    enabled: !busy,
    onFiles: (files) => {
      const pdfFile = files.find(isPdfFile);
      if (!pdfFile) {
        setStatus({ tone: 'error', text: dropRejectedMessage(files, 'PDF') });
        return;
      }
      void openFile(pdfFile);
    },
  });

  const run = async () => {
    if (!pdf) return;
    setBusy(true);
    setStatus(null);
    setResult(null);
    setProgress({ done: 0, total: pdf.pages });
    try {
      const compressed = await compressPdf(pdf.bytes, quality, (done, total) => setProgress({ done, total }));
      setResult({ bytes: compressed.bytes, originalBytes: compressed.originalBytes });
      const saving = describeSaving(compressed.originalBytes, compressed.bytes.byteLength);
      setStatus({
        tone: 'info',
        text:
          compressed.bytes.byteLength >= compressed.originalBytes
            ? `${saving} — ไฟล์ต้นฉบับเล็กอยู่แล้ว ลองระดับ “เล็กสุด” หรือเก็บไฟล์เดิมไว้`
            : `เสร็จแล้ว — ${saving}`,
      });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'บีบอัดไม่สำเร็จ' });
    } finally {
      setProgress(null);
      setBusy(false);
    }
  };

  const save = () => {
    if (!result) return;
    const name = outputName.resolved;
    downloadBytes(name, result.bytes);
    setStatus({ tone: 'info', text: `ดาวน์โหลด ${name} แล้ว` });
  };

  return (
    <ToolPage
      title="Compress PDF"
      description="ลดขนาดไฟล์ด้วยการเรนเดอร์หน้าใหม่ — ข้อความจะคัดลอกไม่ได้หลังบีบอัด"
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
          <div className="dropzone" data-dragging={drop.dragging || undefined}>
            <h2>ลากไฟล์ PDF หรือโฟลเดอร์มาวางตรงนี้</h2>
            <p className="dropzone-sub">เลือกคุณภาพแล้วบีบอัด — ไฟล์ไม่ออกจากเครื่อง</p>
            <div className="dropzone-actions">
              <button type="button" className="button-primary button-large" onClick={() => inputRef.current?.click()} disabled={busy}>
                เลือกไฟล์ PDF
              </button>
            </div>
          </div>
        ) : (
          <div className="simple-grid">
            <section className="panel">
              <header className="panel-head">
                <h2>ไฟล์ต้นฉบับ</h2>
                <span className="panel-note">
                  {(pdf.bytes.byteLength / 1024 / 1024).toFixed(2)} MB · {pdf.pages} หน้า
                </span>
              </header>
              <p className="export-meta">{pdf.name}</p>

              <label className="field-label">ระดับคุณภาพ</label>
              <div className="quality-list">
                {QUALITIES.map((value) => {
                  const preset = COMPRESS_PRESETS[value];
                  return (
                    <label key={value} className="check-row">
                      <input
                        type="radio"
                        name="quality"
                        value={value}
                        checked={quality === value}
                        onChange={() => setQuality(value)}
                      />
                      <span>
                        <strong>{preset.label}</strong>
                        <small>{preset.hint}</small>
                      </span>
                    </label>
                  );
                })}
              </div>

              {progress && (
                <p className="export-meta" role="status">
                  กำลังบีบอัดหน้า {progress.done}/{progress.total}…
                </p>
              )}

              <button type="button" className="button-primary button-large" onClick={() => void run()} disabled={busy}>
                {busy ? 'กำลังบีบอัด…' : 'บีบอัดไฟล์'}
              </button>

              <button type="button" className="button-secondary" onClick={() => inputRef.current?.click()}>
                เปลี่ยนไฟล์
              </button>
            </section>

            <section className="panel">
              <header className="panel-head">
                <h2>ผลลัพธ์</h2>
                {result && <span className="panel-note">{describeSaving(result.originalBytes, result.bytes.byteLength)}</span>}
              </header>

              {result ? (
                <>
                  <p className="export-meta">
                    {(result.originalBytes / 1024 / 1024).toFixed(2)} MB →{' '}
                    {(result.bytes.byteLength / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <OutputNameField name={outputName} disabled={busy} />
                  <button type="button" className="button-primary button-large" onClick={save}>
                    ดาวน์โหลดไฟล์ที่บีบอัด
                  </button>
                </>
              ) : (
                <p className="hint">ยังไม่มีผลลัพธ์ — เลือกคุณภาพแล้วกด “บีบอัดไฟล์”</p>
              )}
            </section>
          </div>
        )}

        {status && (
          <div className="status" role="status" data-tone={status.tone}>
            <span>{status.text}</span>
          </div>
        )}
      </div>

      <DropOverlay drop={drop} />
    </ToolPage>
  );
}
