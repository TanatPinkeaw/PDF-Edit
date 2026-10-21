import { useState, type FormEvent } from 'react';

import { apiFetch } from '../lib/api';
import { useAccount } from '../state/account-context';

const PASSWORD_MIN = 8;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
}

/**
 * Changing a password requires the current one, so a stolen session alone is not
 * enough. Every other device is signed out; this browser stays logged in.
 */
export function ChangePasswordPage() {
  const { user, passwordSet, busy } = useAccount();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setDone(null);

    if (next.length < PASSWORD_MIN) {
      setError(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัวอักษร`);
      return;
    }
    if (next !== confirm) {
      setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
      return;
    }

    setWorking(true);
    try {
      const response = await apiFetch<{ ok: boolean; signedOutSessions: number }>(
        '/api/auth/password/change',
        { method: 'POST', body: { currentPassword: current, password: next } },
      );
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(
        response.signedOutSessions > 0
          ? `เปลี่ยนรหัสผ่านแล้ว — ออกจากระบบ ${response.signedOutSessions} อุปกรณ์อื่นให้ด้วย`
          : 'เปลี่ยนรหัสผ่านแล้ว',
      );
    } catch (changeError) {
      setError(describe(changeError));
    } finally {
      setWorking(false);
    }
  };

  const disabled = working || busy;

  return (
    <main className="auth-page">
      <div className="auth-card panel">
        <a className="back-link" href="#/activity">
          ← กลับไปหน้าประวัติ
        </a>
        <h1 className="panel-title">เปลี่ยนรหัสผ่าน</h1>

        {!user ? (
          <>
            <p className="hint">ต้องเข้าสู่ระบบก่อนจึงจะเปลี่ยนรหัสผ่านได้</p>
            <div className="auth-actions">
              <a className="button-primary" href="#/signin">
                เข้าสู่ระบบ
              </a>
            </div>
          </>
        ) : passwordSet === false ? (
          <p className="hint">
            บัญชีนี้สมัครด้วย Google จึงไม่มีรหัสผ่านให้เปลี่ยน — ใช้ปุ่ม “เข้าสู่ระบบด้วย Google”
            ได้เลย
          </p>
        ) : (
          <>
            <p className="hint">
              ใส่รหัสผ่านปัจจุบันเพื่อยืนยัน — เมื่อเปลี่ยนแล้ว อุปกรณ์อื่นที่ล็อกอินค้างไว้จะถูกออกจากระบบ
            </p>
            <form className="auth-form" onSubmit={(event) => void submit(event)}>
              <label className="field">
                <span className="field-label">รหัสผ่านปัจจุบัน</span>
                <input
                  type="password"
                  name="currentPassword"
                  autoComplete="current-password"
                  required
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">รหัสผ่านใหม่</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  required
                  minLength={PASSWORD_MIN}
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                />
                <span className="hint">อย่างน้อย {PASSWORD_MIN} ตัวอักษร และต่างจากรหัสเดิม</span>
              </label>

              <label className="field">
                <span className="field-label">ยืนยันรหัสผ่านใหม่</span>
                <input
                  type="password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  required
                  minLength={PASSWORD_MIN}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </label>

              {error && <p className="form-error">{error}</p>}
              {done && <p className="form-ok">{done}</p>}

              <button type="submit" className="button-primary button-large" disabled={disabled}>
                {working ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}
              </button>
            </form>
            <p className="hint auth-note">
              ลืมรหัสปัจจุบัน? ออกจากระบบแล้วใช้{' '}
              <a href="#/forgot">ตั้งรหัสผ่านใหม่ทางอีเมล</a>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
