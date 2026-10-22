import { useEffect, useState, type FormEvent } from 'react';

import { ApiError } from '../lib/api';
import { useAccount } from '../state/account-context';

function secondsUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
}

/**
 * Credit-mode only: while credits are shelved nothing is gated on a verified
 * mailbox, so the bar stays hidden. Disappears on success, and never renders
 * for anonymous browsers or deployments without SMTP.
 */
export function VerifyEmailBar() {
  const {
    user,
    verification,
    creditsEnabled,
    devCode,
    busy,
    sendVerificationCode,
    confirmEmailCode,
  } = useAccount();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const pending = Boolean(verification?.pendingExpiresAt) && secondsUntil(verification?.pendingExpiresAt ?? null) > 0;

  // The resend countdown has to tick even while nothing else changes.
  useEffect(() => {
    if (!pending || !verification?.resendAt) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [pending, verification?.resendAt]);

  if (!creditsEnabled || !user || !verification || verification.verified || !verification.enforced) {
    return null;
  }

  const cooldown = secondsUntil(verification.resendAt);

  const send = async () => {
    setMessage(null);
    try {
      await sendVerificationCode();
    } catch (error) {
      setMessage(describe(error));
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    try {
      await confirmEmailCode(code);
      setCode('');
    } catch (error) {
      setMessage(describe(error));
    }
  };

  return (
    <section className="verify-bar" aria-live="polite">
      <div className="verify-bar-copy">
        <strong>ยืนยันอีเมลก่อนใช้เครดิต</strong>
        <p className="hint">
          ส่งรหัส 6 หลักไปที่ {user.email} — รหัสใช้ได้ 10 นาที และใช้ได้ครั้งเดียว
          {verification.pendingExpiresAt ? ` (โค้ดปัจจุบันเหลือ ${secondsUntil(verification.pendingExpiresAt)} วินาที)` : ''}
        </p>
        {message && <p className="verify-bar-error">{message}</p>}
        {devCode && (
          <p className="hint verify-bar-dev">
            โหมด dev (ยังไม่ตั้ง SMTP_URL) — รหัสคือ <code>{devCode}</code>
          </p>
        )}
      </div>

      {pending ? (
        <form className="verify-bar-form" onSubmit={(event) => void submit(event)}>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-label="รหัสยืนยัน 6 หลัก"
            placeholder="123456"
          />
          <button type="submit" className="button-primary" disabled={busy || code.length !== 6}>
            ยืนยัน
          </button>
          <button
            type="button"
            className="button-ghost"
            onClick={() => void send()}
            disabled={busy || cooldown > 0}
          >
            {cooldown > 0 ? `ส่งใหม่ใน ${cooldown}s` : 'ส่งรหัสใหม่'}
          </button>
        </form>
      ) : (
        <div className="verify-bar-form">
          <button type="button" className="button-primary" onClick={() => void send()} disabled={busy}>
            {busy ? 'กำลังส่ง…' : 'ส่งรหัสยืนยัน'}
          </button>
        </div>
      )}
    </section>
  );
}
