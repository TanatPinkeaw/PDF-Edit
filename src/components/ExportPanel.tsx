import { editedFileName } from '../lib/download';

type Props = {
  fileName: string;
  total: number;
  busy: boolean;
  onDownload: () => void;
};

export function ExportPanel({ fileName, total, busy, onDownload }: Props) {
  return (
    <section className="panel panel-export" aria-labelledby="export-title">
      <header className="panel-head">
        <h2 id="export-title">ดาวน์โหลด</h2>
        <span className="panel-note">ไฟล์ไม่ออกจากเครื่อง</span>
      </header>

      <button
        type="button"
        className="button-primary button-large"
        onClick={onDownload}
        disabled={busy || total === 0}
      >
        {busy ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลด PDF ที่แก้แล้ว'}
      </button>

      <p className="export-meta">
        {total} หน้า · <code>{editedFileName(fileName)}</code>
      </p>
      <p className="hint">
        ลำดับและหน้าที่ถูกลบจะถูกบันทึกเป็นไฟล์ใหม่ ต้นฉบับบนเครื่องไม่ถูกแก้ไข
      </p>
    </section>
  );
}
