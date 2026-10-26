import type { OutputName } from '../hooks/useOutputName';
import { OutputNameField } from './OutputNameField';

type Props = {
  total: number;
  busy: boolean;
  outputName: OutputName;
  onDownload: () => void;
};

export function ExportPanel({ total, busy, outputName, onDownload }: Props) {
  return (
    <section className="panel panel-export" aria-labelledby="export-title">
      <header className="panel-head">
        <h2 id="export-title">ดาวน์โหลด</h2>
        <span className="panel-note">ไฟล์ไม่ออกจากเครื่อง</span>
      </header>

      <OutputNameField name={outputName} disabled={busy} />

      <button
        type="button"
        className="button-primary button-large"
        onClick={onDownload}
        disabled={busy || total === 0}
      >
        {busy ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลด PDF ที่แก้แล้ว'}
      </button>

      <p className="export-meta">{total} หน้า · ชื่อนี้ใช้กับการแยกหน้าและส่งออกภาพด้วย</p>
      <p className="hint">
        ลำดับและหน้าที่ถูกลบจะถูกบันทึกเป็นไฟล์ใหม่ ต้นฉบับบนเครื่องไม่ถูกแก้ไข
      </p>
    </section>
  );
}
