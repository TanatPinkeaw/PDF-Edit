import type { ReactNode } from 'react';

import { useAccount } from '../state/account-context';

/**
 * Product gate for the tool pages: credits are shelved, so the account is what
 * unlocks them. The PDF work still happens in this tab — only the run record
 * needs a session.
 *
 * An unreachable API passes through: the work is local, so blocking it would
 * only punish a broken server.
 */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const { status, user, requireSignIn, authConfigured, busy, error, signInWithGoogle } =
    useAccount();

  if (!requireSignIn || user || status === 'offline') return <>{children}</>;

  if (status === 'loading') {
    return (
      <main className="signin-wall">
        <p className="hint">กำลังตรวจสอบบัญชี…</p>
      </main>
    );
  }

  return (
    <main className="signin-wall">
      <div className="panel signin-wall-card">
        <p className="eyebrow">ใช้ฟรีไม่จำกัด</p>
        <h1>เข้าสู่ระบบเพื่อเริ่มใช้เครื่องมือ</h1>
        <p className="hint">
          เข้าสู่ระบบด้วยบัญชี Google แล้วใช้เครื่องมือ PDF ได้ทั้งหมดโดยไม่จำกัดจำนวนครั้ง —
          ไฟล์ยังประมวลผลในแท็บนี้ ไม่มีการอัปโหลด
        </p>

        <div className="signin-wall-actions">
          {authConfigured ? (
            <button
              type="button"
              className="button-primary button-large"
              onClick={() => void signInWithGoogle()}
              disabled={busy}
            >
              {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วย Google'}
            </button>
          ) : (
            <p className="form-error">
              ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID — ใช้การเข้าสู่ระบบด้วยอีเมลและรหัสผ่านไปก่อน
            </p>
          )}
          <a className="button-secondary" href="#/signin">
            ใช้อีเมลและรหัสผ่าน
          </a>
        </div>

        {error && <p className="form-error">{error}</p>}
        <p className="hint">ยังไม่มีบัญชี? การเข้าสู่ระบบด้วย Google จะสร้างบัญชีให้ทันที</p>
      </div>
    </main>
  );
}
