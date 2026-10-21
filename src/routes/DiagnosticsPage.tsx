/**
 * Self-test page for self-hosted deployments. It answers the only question that
 * matters when thumbnails do not show up: which layer is broken — the worker,
 * the canvas, the fonts, or the API?
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PDFDocument } from '@cantoo/pdf-lib';

import { describeWorkerSetup, loadPdfForRendering } from '../lib/pdfjs';

type CheckState = 'pending' | 'pass' | 'warn' | 'fail';

type Check = {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
};

const INITIAL: Check[] = [
  { id: 'worker', label: 'pdf.js worker', state: 'pending', detail: '' },
  { id: 'render', label: 'เรนเดอร์หน้าทดสอบ', state: 'pending', detail: '' },
  { id: 'canvas', label: 'Canvas 2D', state: 'pending', detail: '' },
  { id: 'fonts', label: 'ฟอนต์ Noto Sans Thai / Krub', state: 'pending', detail: '' },
  { id: 'api', label: 'API (/api/health)', state: 'pending', detail: '' },
  { id: 'env', label: 'สภาพแวดล้อม', state: 'pending', detail: '' },
];

async function makeTestPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 120]);
  return doc.save();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([
    promise,
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms)),
  ]);
}

/** Renders one page and reports whether any non-white pixel was painted. */
async function renderSelfTest(): Promise<{ ok: boolean; detail: string }> {
  const bytes = await makeTestPdf();
  const loaded = await loadPdfForRendering(bytes);
  try {
    const page = await loaded.document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) return { ok: false, detail: 'canvas 2d ไม่พร้อมใช้งาน' };
    context.fillStyle = '#123456';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const rendered = await withTimeout(
      page.render({ canvasContext: context, viewport }).promise,
      12_000,
    );
    if (rendered === 'timeout') {
      return { ok: false, detail: 'เรนเดอร์ไม่จบใน 12 วินาที (แท็บอาจไม่ได้แสดงผลอยู่)' };
    }
    const pixel = context.getImageData(0, 0, 1, 1).data;
    const ok = pixel[0] === 255 && pixel[1] === 255 && pixel[2] === 255;
    return {
      ok,
      detail: `${canvas.width}×${canvas.height} · พิกเซลแรก rgb(${pixel[0]},${pixel[1]},${pixel[2]})`,
    };
  } finally {
    await loaded.destroy();
  }
}

export function DiagnosticsPage() {
  const [checks, setChecks] = useState<Check[]>(INITIAL);
  const [copied, setCopied] = useState(false);

  const setCheck = useCallback((id: string, state: CheckState, detail: string) => {
    setChecks((current) => current.map((check) => (check.id === id ? { ...check, state, detail } : check)));
  }, []);

  const run = useCallback(() => {
    setChecks(INITIAL);
    setCopied(false);

    const setup = describeWorkerSetup();
    setCheck('worker', 'pass', `workerSrc = ${setup.workerSrc || '(ไม่ได้ตั้ง — ใช้ worker ที่บันเดิลมา)'}`);

    const canvas = document.createElement('canvas');
    setCheck(
      'canvas',
      canvas.getContext('2d') ? 'pass' : 'fail',
      canvas.getContext('2d') ? 'มี context 2d' : 'เบราว์เซอร์ไม่ให้ canvas 2d',
    );

    void document.fonts
      .load('600 16px Krub')
      .then(() => document.fonts.load('400 16px "Noto Sans Thai"'))
      .then((faces) =>
        setCheck(
          'fonts',
          faces.length > 0 ? 'pass' : 'warn',
          faces.length > 0 ? 'โหลด Noto Sans Thai + Krub ได้' : 'โหลดฟอนต์ไทยไม่ได้ (ใช้ฟอนต์ระบบแทน)',
        ),
      )
      .catch((error: unknown) =>
        setCheck('fonts', 'warn', error instanceof Error ? error.message : 'โหลดฟอนต์ไม่สำเร็จ'),
      );

    setCheck(
      'env',
      window.isSecureContext ? 'pass' : 'warn',
      `${window.location.origin} · base=${import.meta.env.BASE_URL} · secure=${String(window.isSecureContext)}`,
    );

    void renderSelfTest().then(
      (result) =>
        setCheck(
          'render',
          result.ok ? 'pass' : result.detail.includes('ไม่จบใน') ? 'warn' : 'fail',
          result.detail,
        ),
      (error: unknown) =>
        setCheck('render', 'fail', error instanceof Error ? error.message : String(error)),
    );

    void fetch('/api/health', { headers: { accept: 'application/json' } })
      .then(async (response) => {
        const type = response.headers.get('content-type') ?? '';
        if (!type.includes('application/json')) {
          throw new Error(`ได้ ${response.status} content-type=${type} (proxy /api ชี้ผิดที่?)`);
        }
        const body = (await response.json()) as { ok?: boolean; db?: string };
        setCheck(
          'api',
          body.ok ? 'pass' : 'fail',
          body.ok ? `ok · db=${body.db ?? '?'}` : `ตอบ ${response.status} แต่ไม่พร้อม`,
        );
      })
      .catch((error: unknown) =>
        setCheck('api', 'fail', error instanceof Error ? error.message : String(error)),
      );
  }, [setCheck]);

  useEffect(() => {
    run();
  }, [run]);

  const worst = useMemo<CheckState>(() => {
    if (checks.some((check) => check.state === 'fail')) return 'fail';
    if (checks.some((check) => check.state === 'warn')) return 'warn';
    if (checks.some((check) => check.state === 'pending')) return 'pending';
    return 'pass';
  }, [checks]);

  const copy = () => {
    const text = checks
      .map((check) => `${check.state.toUpperCase()} ${check.label}: ${check.detail}`)
      .join('\n');
    const written = navigator.clipboard?.writeText(`${text}\n${navigator.userAgent}`);
    void written?.then(() => setCopied(true));
  };

  return (
    <main className="diagnostics">
      <header className="diagnostics-head">
        <h2>ตรวจระบบ</h2>
        <p>ใช้หน้านี้เมื่อหน้าตัวอย่าง PDF ไม่ขึ้น — จะบอกว่าชั้นไหนมีปัญหา</p>
        <div className="diagnostics-actions">
          <button type="button" className="button-primary" onClick={run}>
            ตรวจใหม่
          </button>
          <button type="button" onClick={copy}>
            {copied ? 'คัดลอกแล้ว' : 'คัดลอกผล'}
          </button>
        </div>
      </header>

      <p className="diagnostics-summary" data-tone={worst}>
        {worst === 'pass' && 'ทุกอย่างพร้อมใช้งาน'}
        {worst === 'warn' && 'ใช้งานได้ แต่มีข้อที่ควรปรับ'}
        {worst === 'fail' && 'มีข้อที่ล้มเหลว — ดูรายละเอียดด้านล่าง'}
        {worst === 'pending' && 'กำลังตรวจ…'}
      </p>

      <ul className="diagnostics-list">
        {checks.map((check) => (
          <li key={check.id} data-state={check.state}>
            <span className="diagnostics-dot" aria-hidden="true" />
            <div>
              <strong>{check.label}</strong>
              <p>{check.detail || '…'}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="side-note">
        ถ้า worker หรือ render ล้มเหลว ให้ตรวจ `Content-Security-Policy` ของ reverse proxy ว่ามี{' '}
        <code>worker-src 'self' blob:</code> และไฟล์ worker ถูกเสิร์ฟด้วย{' '}
        <code>Content-Type: application/javascript</code>
      </p>
    </main>
  );
}
