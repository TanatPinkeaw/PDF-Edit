import { useState, type FormEvent } from 'react';

import { navigate } from '../lib/router';
import { useAccount } from '../state/account-context';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

export type AuthMode = 'signin' | 'signup';

export function AuthPage({ mode }: { mode: AuthMode }) {
  const {
    user,
    credits,
    busy,
    error,
    authConfigured,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
  } = useAccount();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const isSignUp = mode === 'signup';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    const cleanEmail = email.trim();
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setLocalError('อีเมลไม่ถูกต้อง');
      return;
    }
    if (password === '') {
      setLocalError('ต้องระบุรหัสผ่าน');
      return;
    }
    if (isSignUp && password.length < PASSWORD_MIN) {
      setLocalError(`รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัวอักษร`);
      return;
    }

    const ok = isSignUp
      ? await signUp(cleanEmail, password, name.trim())
      : await signIn(cleanEmail, password);
    if (ok) navigate('/');
  };

  return (
    <main className="auth-page">
      <div className="auth-card panel">
        {user ? (
          <>
            <h1 className="panel-title">เข้าสู่ระบบอยู่แล้ว</h1>
            <p className="hint">
              {user.email} · เหลือ {credits.balance} เครดิต
            </p>
            <div className="auth-actions">
              <a className="button-secondary" href="#/activity">
                ดูประวัติและเครดิต
              </a>
              <button type="button" className="button-ghost" onClick={() => void signOut()} disabled={busy}>
                ออกจากระบบ
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-tabs" role="tablist" aria-label="เลือกโหมด">
              <a href="#/signin" role="tab" aria-selected={!isSignUp} data-active={!isSignUp || undefined}>
                เข้าสู่ระบบ
              </a>
              <a href="#/signup" role="tab" aria-selected={isSignUp} data-active={isSignUp || undefined}>
                สมัครสมาชิก
              </a>
            </div>

            <h1 className="panel-title">{isSignUp ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h1>
            <p className="hint">
              {isSignUp
                ? 'สมัครฟรี รับเครดิตเริ่มต้นทันที และยกเครดิตทดลองที่เหลืออยู่ไปบัญชีใหม่ให้'
                : 'เข้าสู่ระบบเพื่อเก็บเครดิตและประวัติไว้กับบัญชี ใช้ได้ทุกเบราว์เซอร์'}
            </p>
            {!isSignUp && !user && (
              <p className="hint">
                ตอนนี้ใช้โหมดไม่ระบุตัวตน · เหลือ {credits.balance} เครดิต
              </p>
            )}

            <form className="auth-form" onSubmit={(event) => void submit(event)}>
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

              {isSignUp && (
                <label className="field">
                  <span className="field-label">ชื่อที่แสดง (ไม่บังคับ)</span>
                  <input
                    type="text"
                    name="name"
                    autoComplete="nickname"
                    maxLength={80}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              )}

              <label className="field">
                <span className="field-label">รหัสผ่าน</span>
                <input
                  type="password"
                  name="password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  required
                  minLength={isSignUp ? PASSWORD_MIN : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                {isSignUp && <span className="hint">อย่างน้อย {PASSWORD_MIN} ตัวอักษร</span>}
              </label>

              {(localError ?? error) && <p className="form-error">{localError ?? error}</p>}

              <button type="submit" className="button-primary button-large" disabled={busy}>
                {busy ? 'กำลังดำเนินการ…' : isSignUp ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'}
              </button>
            </form>

            <p className="hint auth-note">
              {isSignUp
                ? 'หลังสมัครจะส่งรหัส 6 หลักไปที่อีเมลคุณ ยืนยันแล้วจึงใช้เครดิตได้'
                : 'ลืมรหัสผ่าน? '}
              {!isSignUp && <a href="#/forgot">ตั้งรหัสผ่านใหม่ด้วยรหัสทางอีเมล</a>}
            </p>

            {authConfigured && (
              <div className="auth-google">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void signInWithGoogle()}
                  disabled={busy}
                >
                  ใช้บัญชี Google แทน
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
