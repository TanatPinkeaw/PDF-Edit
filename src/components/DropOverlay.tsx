import type { FileDropState } from '../hooks/useFileDrop';

type Props = {
  drop: FileDropState;
  label?: string;
};

/** Full-window hint shown while a file or folder is hovering the page. */
export function DropOverlay({ drop, label = 'วางไฟล์ PDF หรือโฟลเดอร์' }: Props) {
  if (!drop.dragging && !drop.reading) return null;

  return (
    <div className="drop-overlay" aria-hidden="true">
      <div>{drop.reading ? 'กำลังอ่านโฟลเดอร์…' : label}</div>
    </div>
  );
}
