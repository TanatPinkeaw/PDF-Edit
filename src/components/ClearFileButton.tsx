import { useEffect, useState } from 'react';

import { isDocModified } from '../lib/session';
import { useWorkspace } from '../state/workspace-context';

/**
 * Drops the open document from the shared workspace so the user can pick a new
 * file. The PDF only ever lived in memory, so nothing else has to be cleaned up.
 * When pages were deleted or reordered the button asks first, because clearing
 * throws that arrangement away.
 */
export function ClearFileButton() {
  const { session } = useWorkspace();
  const { doc, busy } = session;
  const [confirming, setConfirming] = useState(false);

  // A new document (or none) starts a fresh question.
  useEffect(() => {
    setConfirming(false);
  }, [doc]);

  if (!doc) return null;

  const clear = () => {
    session.close();
    session.notify('info', 'ล้างไฟล์แล้ว — เปิดไฟล์ใหม่ได้เลย');
  };

  if (confirming) {
    return (
      <span className="clear-file-confirm" role="group" aria-label="ยืนยันการล้างไฟล์">
        <span className="clear-file-question">ล้างที่แก้ไว้?</span>
        <button type="button" className="button-danger clear-file-yes" onClick={clear} disabled={busy}>
          ล้างเลย
        </button>
        <button type="button" className="button-ghost" onClick={() => setConfirming(false)}>
          ยกเลิก
        </button>
      </span>
    );
  }

  const modified = isDocModified(doc);

  return (
    <button
      type="button"
      className="button-ghost clear-file"
      onClick={() => (modified ? setConfirming(true) : clear())}
      disabled={busy}
      title={
        modified
          ? `ปิด ${doc.fileName} — มีการแก้ไขหน้าไว้ ระบบจะถามยืนยันก่อน`
          : `ปิด ${doc.fileName} และกลับไปหน้าเลือกไฟล์`
      }
      aria-label={`ล้างไฟล์ ${doc.fileName} เพื่อเปิดไฟล์ใหม่`}
    >
      <span className="clear-file-mark" aria-hidden="true">
        ×
      </span>
      ล้างไฟล์
    </button>
  );
}
