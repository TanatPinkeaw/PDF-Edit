import { useState, type FormEvent } from 'react';

import { apiFetch } from '../lib/api';
import { navigate } from '../lib/router';
import { useAccount } from '../state/account-context';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
}

/**
 * Step 1 asks for a code without revealing whether the address has an account;
 * step 2 trades the code + a new password for a fresh session.
 */
export function ForgotPasswordPage() {
  const { busy, refresh } = useAccount();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const requestCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const clean = email.trim();
    if (!EMAIL_PATTERN.test(clean)) {
      setError('อีเมลไม่ถูกต้อง');
      return;
    }

    setWorking(true);
    try {
      const response = await apiFetch<{ ok: boolean; devCode?: string }>('/api/auth/password/forgot', {
        method: 'POST',
        body: { email: clean },
      });
      setDevCode(response.devCode ?? null);
      setNote('ถ้าอีเมลนี้มีบัญชี เราได้ส่งรหัส 6 หลักไปแล้ว — รหัสใช้ได้ 10 นาที');
      setStep('code');
    } catch (requestError) {
      setError(describe(requestError));
    } finally {
      setWorking(false);
    }
  };

  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const clean = email.trim();
    if (!/^\d{6}$/.test(code)) {
      setError('รหัสต้องเป็นตัวเลข 6 หลัก');
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setError(`รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัวอักษร`);
      return;
    }

    setWorking(true);
    try {
      await apiFetch('/api/auth/password/reset', {
        method: 'POST',
        body: { email: clean, code, password },
      });
      await refresh();
      navigate('/activity');
    } catch (resetError) {
      setError(describe(resetError));
    } finally {
      setWorking(false);
    }
  };

  const disabled = working || busy;

  return (
    <main className="auth-page">
      <div className="auth-card panel">
        <a className="back-link" href="#/signin">
          ← กลับไปหน้าเข้าสู่ระบบ
        </a>
        <h1 className="panel-title">ตั้งรหัสผ่านใหม่</h1>

        {step === 'email' ? (
          <>
            <p className="hint">
              ใส่อีเมลที่ใช้สมัคร ระบบจะส่งรหัส 6 หลักไปให้ — ใช้ได้ครั้งเดียวและหมดอายุใน 10 นาที
              (บัญชีที่สมัครด้วย Google ไม่มีรหัสผ่านให้ตั้งใหม่)
            </p>
            <form className="auth-form" onSubmit={(event) => void requestCode(event)}>
              <label className="field">
                <span className="field-label">อีเมล</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>

              {error && <p className="form-error">{error}</p>}

              <button type="submit" className="button-primary button-large" disabled={disabled}>
                {working ? 'กำลังส่ง…' : 'ส่งรหัส'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="hint">{note}</p>
            {devCode && (
              <p className="hint verify-bar-dev">
                โหมด dev (ยังไม่ตั้ง SMTP_URL) — รหัสคือ <code>{devCode}</code>
              </p>
            )}
            <form className="auth-form" onSubmit={(event) => void resetPassword(event)}>
              <label className="field">
                <span className="field-label">รหัส 6 หลัก</span>
                <input
                  type="text"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
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
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <span className="hint">อย่างน้อย {PASSWORD_MIN} ตัวอักษร</span>
              </label>

              {error && <p className="form-error">{error}</p>}

              <button type="submit" className="button-primary button-large" disabled={disabled}>
                {working ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่านใหม่'}
              </button>
              <button
                type="button"
                className="button-ghost"
                onClick={() => setStep('email')}
                disabled={disabled}
              >
                เปลี่ยนอีเมล
              </button>
            </form>
            <p className="hint auth-note">
              หลังตั้งรหัสผ่านใหม่ ทุกอุปกรณ์ที่ล็อกอินค้างไว้จะถูกออกจากระบบ
            </p>
          </>
        )}
      </div>
    </main>
  );
}
