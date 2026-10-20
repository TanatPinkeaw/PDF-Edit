type Props = {
  total: number;
  selectedCount: number;
  modified: boolean;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  allowDelete?: boolean;
  onSelectAll: () => void;
  onInvert: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
};

export function Toolbar({
  total,
  selectedCount,
  modified,
  canUndo,
  canRedo,
  busy,
  allowDelete = true,
  onSelectAll,
  onInvert,
  onClearSelection,
  onDeleteSelected,
  onUndo,
  onRedo,
  onReset,
}: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-info">
        <strong>{total}</strong> หน้า
        {selectedCount > 0 && (
          <span className="toolbar-selected">· เลือก {selectedCount}</span>
        )}
        {modified && <span className="chip">แก้ไขแล้ว</span>}
      </div>

      <div className="toolbar-actions">
        <div className="button-group" role="group" aria-label="เลือกหน้า">
          <button type="button" onClick={onSelectAll} disabled={busy}>
            ทั้งหมด
          </button>
          <button type="button" onClick={onInvert} disabled={busy || total === 0}>
            กลับด้าน
          </button>
          <button type="button" onClick={onClearSelection} disabled={selectedCount === 0}>
            ล้าง
          </button>
        </div>

        {allowDelete && (
          <button
            type="button"
            className="danger"
            onClick={onDeleteSelected}
            disabled={busy || selectedCount === 0 || selectedCount === total}
            title={
              selectedCount === total ? 'ลบทุกหน้าไม่ได้ — ต้องเหลืออย่างน้อย 1 หน้า' : undefined
            }
          >
            ลบที่เลือก{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
        )}

        <div className="button-group" role="group" aria-label="ประวัติการแก้ไข">
          <button type="button" onClick={onUndo} disabled={!canUndo} title="ย้อนกลับ (Ctrl+Z)">
            ↶
          </button>
          <button type="button" onClick={onRedo} disabled={!canRedo} title="ทำซ้ำ (Ctrl+Shift+Z)">
            ↷
          </button>
        </div>

        {allowDelete && (
          <button type="button" onClick={onReset} disabled={!modified || busy}>
            รีเซ็ตลำดับ
          </button>
        )}
      </div>
    </div>
  );
}
