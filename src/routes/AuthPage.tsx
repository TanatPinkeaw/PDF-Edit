import { useState, type FormEvent } from 'react';

import { navigate } from '../lib/router';
import { useAccount } from '../state/account-context';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

export type AuthMode = 'signin' | 'signup';

export function AuthPage({ mode }: { mode: AuthMode }) {
  const { user, busy, error, authConfigured, signUp, signIn, signInWithGoogle, signOut } =
    useAccount();

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

  const google = async () => {
    setLocalError(null);
    await signInWithGoogle();
  };

  return (
    <main className="auth-page">
      <div className="auth-card panel">
        {user ? (
          <>
            <h1 className="panel-title">เข้าสู่ระบบอยู่แล้ว</h1>
            <p className="hint">{user.email} · ใช้เครื่องมือได้ฟรีไม่จำกัด</p>
            <div className="auth-actions">
              <a className="button-secondary" href="#/activity">
                ดูประวัติการใช้งาน
              </a>
              <a className="button-secondary" href="#/password">
                เปลี่ยนรหัสผ่าน
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
              ใช้เครื่องมือ PDF ทั้งหมดฟรีไม่จำกัด — เข้าสู่ระบบด้วย Google หรืออีเมลก็ได้
              ไฟล์ยังประมวลผลในแท็บนี้
            </p>

            {authConfigured ? (
              <div className="auth-google-primary">
                <button
                  type="button"
                  className="button-primary button-large"
                  onClick={() => void google()}
                  disabled={busy}
                >
                  {busy ? 'กำลังเข้าสู่ระบบ…' : 'ดำเนินการต่อด้วย Google'}
                </button>
                <p className="hint">
                  ครั้งแรกที่ใช้ Google ระบบจะสร้างบัญชีให้ทันที ไม่ต้องกรอกฟอร์ม
                </p>
              </div>
            ) : (
              <p className="form-error">
                ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID — เพิ่ม client id ใน .env แล้วรีสตาร์ท API
                ระหว่างนี้ใช้การเข้าสู่ระบบด้วยอีเมลและรหัสผ่านได้
              </p>
            )}

            <p className="auth-divider">
              <span>หรือใช้อีเมลและรหัสผ่าน</span>
            </p>

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
              {isSignUp ? 'สมัครฟรี ไม่มีการหักเครดิตและไม่ต้องยืนยันอีเมลก่อนใช้งาน · ' : ''}
              {!isSignUp && (
                <span>
                  ลืมรหัสผ่าน? <a href="#/forgot">ตั้งรหัสผ่านใหม่ด้วยรหัสทางอีเมล</a> ·{' '}
                </span>
              )}
              บัญชีที่สมัครด้วย Google ไม่มีรหัสผ่าน
            </p>
          </>
        )}
      </div>
    </main>
  );
}
