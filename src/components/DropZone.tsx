import type { ReactNode } from 'react';

type Props = {
  busy: boolean;
  onPick: () => void;
  onSample: () => void;
  hint?: ReactNode;
  title?: string;
};

export function DropZone({ busy, onPick, onSample, hint, title }: Props) {
  return (
    <div className="dropzone">
      <svg className="dropzone-art" viewBox="0 0 64 80" aria-hidden="true">
        <path
          d="M8 4h30l18 18v54H8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path d="M38 4v18h18" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M20 44h24M20 54h24M20 64h14" stroke="currentColor" strokeWidth="2.5" />
      </svg>

      <h2>{title ?? 'ลากไฟล์ PDF มาวางตรงนี้'}</h2>
      <p className="dropzone-sub">
        {hint ?? 'ลบหน้า · จัดลำดับใหม่ · แยกหน้า — ไฟล์ไม่ถูกอัปโหลดขึ้นเซิร์ฟเวอร์'}
      </p>

      <div className="dropzone-actions">
        <button type="button" className="button-primary button-large" onClick={onPick} disabled={busy}>
          เปิดไฟล์ PDF
        </button>
        <button type="button" className="button-ghost" onClick={onSample} disabled={busy}>
          ดูไฟล์ตัวอย่าง 12 หน้า
        </button>
      </div>
    </div>
  );
}
