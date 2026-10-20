import { useEffect, useId, useRef, useState } from 'react';

import { useWorkspace } from '../state/workspace-context';

export function PasswordDialog() {
  const { session } = useWorkspace();
  const pending = session.pendingPassword;
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    setPassword('');
    if (pending) inputRef.current?.focus();
  }, [pending?.fileName]);

  if (!pending) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={session.cancelPassword}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>ไฟล์นี้มีรหัสผ่าน</h2>
        <p className="modal-sub">
          <code>{pending.fileName}</code> ถูกเข้ารหัสไว้ — ใส่รหัสเพื่อเปิดและแก้ไข
          ไฟล์ที่ดาวน์โหลดออกมาจะไม่มีรหัสผ่าน
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (password !== '') void session.submitPassword(password);
          }}
        >
          <label className="field-label" htmlFor="pdf-password">
            รหัสผ่าน
          </label>
          <input
            id="pdf-password"
            ref={inputRef}
            type="password"
            className="range-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            disabled={session.busy}
            aria-invalid={pending.error !== null}
          />
          {pending.error && (
            <p className="form-error" role="alert">
              {pending.error}
            </p>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={session.cancelPassword}
              disabled={session.busy}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="button-primary"
              disabled={password === '' || session.busy}
            >
              {session.busy ? 'กำลังเปิด…' : 'ปลดล็อกและเปิด'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
