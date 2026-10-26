import { useRef, useState, type ChangeEvent } from 'react';

import { DropOverlay } from '../components/DropOverlay';
import { OutputNameField } from '../components/OutputNameField';
import { ToolPage } from '../components/ToolPage';
import { useFileDrop } from '../hooks/useFileDrop';
import { useOutputName } from '../hooks/useOutputName';
import { downloadBytes } from '../lib/download';
import { dropRejectedMessage } from '../lib/dropped-files';

export type ConvertKind = 'word-to-pdf' | 'pdf-to-word';

type Status = { tone: 'info' | 'error'; text: string } | null;

const CONFIG: Record<
  ConvertKind,
  { title: string; description: string; accept: string; pickLabel: string; note: string; prefix: string }
> = {
  'word-to-pdf': {
    title: 'Word to PDF',
    description: 'แปลงไฟล์ .docx / .doc เป็น PDF ด้วย LibreOffice บนเซิร์ฟเวอร์ของคุณ',
    accept: '.docx,.doc,.odt,.rtf',
    pickLabel: 'เลือกไฟล์ Word',
    note: 'ไฟล์ถูกส่งไปยัง API ของคุณเพื่อแปลงด้วย LibreOffice แล้วลบทิ้งทันทีหลังแปลงเสร็จ',
    prefix: 'ไม่เกิน 50 MB',
  },
  'pdf-to-word': {
    title: 'PDF to Word',
    description: 'แปลง PDF เป็น .docx เพื่อแก้ไขต่อ — คุณภาพขึ้นกับโครงสร้างต้นฉบับ',
    accept: 'application/pdf,.pdf',
    pickLabel: 'เลือกไฟล์ PDF',
    note: 'ไฟล์ถูกส่งไปยัง API ของคุณเพื่อแปลงด้วย LibreOffice แล้วลบทิ้งทันทีหลังแปลงเสร็จ',
    prefix: 'ไม่เกิน 50 MB',
  },
};

/** True when the file matches one of the accept tokens (`ext` or MIME type). */
function matchesAccept(file: File, accept: string): boolean {
  return accept.split(',').some((token) => {
    const value = token.trim().toLowerCase();
    if (value === '') return false;
    return value.startsWith('.')
      ? file.name.toLowerCase().endsWith(value)
      : file.type.toLowerCase() === value;
  });
}

function fileNameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  const plain = /filename="([^"]+)"/i.exec(header)?.[1];
  return plain ?? fallback;
}

export function ConvertPage({ kind }: { kind: ConvertKind }) {
  const config = CONFIG[kind];
  const [file, setFile] = useState<File | null>(null);
  const extension = kind === 'word-to-pdf' ? 'pdf' : 'docx';
  const suggestedName = file
    ? file.name.replace(/\.(docx?|odt|rtf|pdf)$/i, `.${extension}`)
    : `document.${extension}`;
  const outputName = useOutputName(suggestedName, extension);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    setFile(picked);
    setStatus(null);
  };

  const drop = useFileDrop({
    enabled: !busy,
    onFiles: (files) => {
      const picked = files.find((item) => matchesAccept(item, config.accept));
      if (!picked) {
        setStatus({ tone: 'error', text: dropRejectedMessage(files, config.accept) });
        return;
      }
      setFile(picked);
      setStatus(null);
    },
  });

  const convert = async () => {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/convert/${kind}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name),
        },
        body: await file.arrayBuffer(),
        credentials: 'same-origin',
      });

      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok) {
        const message = contentType.includes('application/json')
          ? ((await response.json()) as { error?: { message?: string } }).error?.message
          : null;
        throw new Error(message ?? `แปลงไม่สำเร็จ (HTTP ${response.status})`);
      }

      // A static host without an /api proxy answers 200 with index.html; saving
      // that as a .docx would look like success and produce a broken file.
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        throw new Error('โดเมนนี้ไม่ได้ proxy /api ไปที่เซิร์ฟเวอร์ — ตรวจการตั้งค่า Nginx');
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      const fallback = file.name.replace(
        /\.(docx?|odt|rtf|pdf)$/i,
        kind === 'word-to-pdf' ? '.pdf' : '.docx',
      );
      const serverName = fileNameFromDisposition(
        response.headers.get('content-disposition'),
        fallback,
      );
      // Keep the server's name unless the user typed their own.
      const name = outputName.dirty ? outputName.resolved : serverName;
      downloadBytes(name, bytes);
      setStatus({ tone: 'info', text: `ดาวน์โหลด ${name} แล้ว` });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'แปลงไฟล์ไม่สำเร็จ',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage title={config.title} description={config.description}>
      <div className="simple-tool">
        <input
          ref={inputRef}
          type="file"
          accept={config.accept}
          className="visually-hidden"
          onChange={handleFile}
          aria-label={config.pickLabel}
          tabIndex={-1}
        />

        <div className="simple-grid">
          <section className="panel">
            <header className="panel-head">
              <h2>ไฟล์ต้นฉบับ</h2>
              <span className="panel-note">{config.prefix}</span>
            </header>
            <p className="export-meta">{file ? file.name : 'ยังไม่ได้เลือกไฟล์'}</p>
            {file && <OutputNameField name={outputName} disabled={busy} />}
            <button type="button" className="button-secondary" onClick={() => inputRef.current?.click()}>
              {file ? 'เปลี่ยนไฟล์' : config.pickLabel}
            </button>
            <button
              type="button"
              className="button-primary button-large"
              onClick={() => void convert()}
              disabled={!file || busy}
            >
              {busy ? 'กำลังแปลง…' : 'แปลงและดาวน์โหลด'}
            </button>
            <p className="side-note">{config.note}</p>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>สิ่งที่ต้องมีบนเซิร์ฟเวอร์</h2>
            </header>
            <ul className="hint">
              <li>container ของ API ต้องมี LibreOffice (`soffice`)</li>
              <li>ตั้ง `SOFFICE_PATH` ถ้าไบนารีไม่ได้ชื่อ `soffice`</li>
              <li>ตรวจว่า `/api/health` ตอบปกติก่อนใช้งาน</li>
            </ul>
            <p className="side-note">
              ถ้าเซิร์ฟเวอร์ยังไม่มี LibreOffice ระบบจะตอบว่า “เรียก LibreOffice ไม่ได้” — เครื่องมืออื่นทั้งหมดยังใช้งานได้ปกติ
            </p>
          </section>
        </div>

        {status && (
          <div className="status" role="status" data-tone={status.tone}>
            <span>{status.text}</span>
          </div>
        )}
      </div>

      <DropOverlay drop={drop} label="วางไฟล์หรือโฟลเดอร์เพื่อแปลง" />
    </ToolPage>
  );
}
