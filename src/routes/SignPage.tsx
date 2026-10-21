import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { ToolPage } from '../components/ToolPage';
import { downloadBytes, signedFileName } from '../lib/download';
import { inspectPdf } from '../lib/pdf-ops';
import { signPdf, type SignatureCorner } from '../lib/pdf/sign';

type Status = { tone: 'info' | 'error'; text: string } | null;

type Scope = 'all' | 'first' | 'last';

const CORNERS: { value: SignatureCorner; label: string }[] = [
  { value: 'bottom-right', label: 'ล่างขวา' },
  { value: 'bottom-left', label: 'ล่างซ้าย' },
  { value: 'top-right', label: 'บนขวา' },
  { value: 'top-left', label: 'บนซ้าย' },
];

export function SignPage() {
  const [pdf, setPdf] = useState<{ name: string; bytes: Uint8Array; pages: number } | null>(null);
  const [signature, setSignature] = useState<{ name: string; bytes: Uint8Array; url: string } | null>(null);
  const [corner, setCorner] = useState<SignatureCorner>('bottom-right');
  const [widthRatio, setWidthRatio] = useState(28);
  const [scope, setScope] = useState<Scope>('last');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const signatureInput = useRef<HTMLInputElement>(null);

  const handlePdf = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setStatus(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const inspection = await inspectPdf(bytes);
      if (inspection.encrypted) {
        throw new Error('ไฟล์นี้มีรหัสผ่าน — ปลดล็อกก่อนแล้วค่อยเซ็น');
      }
      setPdf({ name: file.name, bytes, pages: inspection.pageCount });
    } catch (error) {
      setPdf(null);
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'เปิดไฟล์ PDF ไม่สำเร็จ',
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSignature = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type !== 'image/png') {
      setStatus({ tone: 'error', text: 'ลายเซ็นต้องเป็น PNG พื้นหลังโปร่งใส' });
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (signature) URL.revokeObjectURL(signature.url);
    setSignature({ name: file.name, bytes, url: URL.createObjectURL(file) });
    setStatus(null);
  };

  const apply = async () => {
    if (!pdf || !signature) return;
    setBusy(true);
    setStatus(null);
    try {
      const pageIndices =
        scope === 'all' ? [] : scope === 'first' ? [0] : [pdf.pages - 1];
      const bytes = await signPdf(pdf.bytes, signature.bytes, {
        widthRatio: widthRatio / 100,
        corner,
        margin: 36,
        pageIndices,
      });
      const name = signedFileName(pdf.name);
      downloadBytes(name, bytes);
      setStatus({ tone: 'info', text: `ดาวน์โหลด ${name} แล้ว` });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'เซ็นไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  };

  const pagesLabel = useMemo(() => {
    if (!pdf) return '';
    if (scope === 'all') return `ทั้ง ${pdf.pages} หน้า`;
    return scope === 'first' ? 'หน้าแรก' : `หน้าสุดท้าย (หน้า ${pdf.pages})`;
  }, [pdf, scope]);

  return (
    <ToolPage
      title="Sign PDF"
      description="วางลายเซ็น PNG ลงบนหน้า — เลือกมุม ขนาด และหน้าเป้าหมายได้ ไฟล์ไม่ออกจากเครื่อง"
    >
      <div className="simple-tool">
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          onChange={(event) => void handlePdf(event)}
          aria-label="เลือกไฟล์ PDF"
          tabIndex={-1}
        />
        <input
          ref={signatureInput}
          type="file"
          accept="image/png"
          className="visually-hidden"
          onChange={(event) => void handleSignature(event)}
          aria-label="เลือกลายเซ็น PNG"
          tabIndex={-1}
        />

        <div className="sign-layout">
          <section className="panel">
            <header className="panel-head">
              <h2>1 · ไฟล์ PDF</h2>
              <span className="panel-note">{pdf ? `${pdf.pages} หน้า` : 'ยังไม่ได้เลือก'}</span>
            </header>
            <p className="export-meta">{pdf ? pdf.name : 'เลือกไฟล์ที่ต้องการเซ็น'}</p>
            <button type="button" className="button-secondary" onClick={() => pdfInput.current?.click()} disabled={busy}>
              {pdf ? 'เปลี่ยนไฟล์' : 'เลือกไฟล์ PDF'}
            </button>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>2 · ลายเซ็น</h2>
              <span className="panel-note">PNG โปร่งใส</span>
            </header>
            {signature ? (
              <div className="sign-preview">
                <img src={signature.url} alt="ลายเซ็นที่เลือก" />
              </div>
            ) : (
              <p className="export-meta">ยังไม่มีลายเซ็น</p>
            )}
            <button
              type="button"
              className="button-secondary"
              onClick={() => signatureInput.current?.click()}
            >
              {signature ? 'เปลี่ยนลายเซ็น' : 'อัปโหลดลายเซ็น'}
            </button>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>3 · ตำแหน่ง</h2>
              <span className="panel-note">{pagesLabel || '—'}</span>
            </header>

            <label className="field-label" htmlFor="sign-scope">
              วางบน
            </label>
            <div className="segmented" id="sign-scope">
              {(
                [
                  ['last', 'หน้าสุดท้าย'],
                  ['first', 'หน้าแรก'],
                  ['all', 'ทุกหน้า'],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}>
                  {label}
                </button>
              ))}
            </div>

            <label className="field-label" htmlFor="sign-corner">
              มุม
            </label>
            <div className="segmented" id="sign-corner">
              {CORNERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={corner === option.value}
                  onClick={() => setCorner(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="field-label" htmlFor="sign-width">
              ขนาด · {widthRatio}% ของความกว้างหน้า
            </label>
            <input
              id="sign-width"
              type="range"
              min={10}
              max={60}
              step={2}
              value={widthRatio}
              onChange={(event) => setWidthRatio(Number(event.target.value))}
            />

            <button
              type="button"
              className="button-primary button-large"
              onClick={() => void apply()}
              disabled={!pdf || !signature || busy}
            >
              {busy ? 'กำลังเซ็น…' : 'เซ็นและดาวน์โหลด'}
            </button>
          </section>
        </div>

        {status && (
          <div className="status" role="status" data-tone={status.tone}>
            <span>{status.text}</span>
          </div>
        )}
      </div>
    </ToolPage>
  );
}
