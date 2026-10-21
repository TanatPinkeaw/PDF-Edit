import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../src/http.ts';
import { createMailer } from '../src/mail.ts';

const mail = { to: 'member@example.com', code: '123456', expiresInMinutes: 10, purpose: 'verify' as const };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createMailer', () => {
  it('logs the code instead of sending when SMTP is absent in development', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const mailer = createMailer({ smtpUrl: null, mailFrom: 'x@y.z', isProduction: false });

    await mailer.sendCode(mail);

    expect(mailer.mode).toBe('log');
    expect(mailer.enforced).toBe(true);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('123456'));
  });

  it('turns the requirement off when production has no SMTP', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mailer = createMailer({ smtpUrl: null, mailFrom: 'x@y.z', isProduction: true });

    expect(mailer.mode).toBe('disabled');
    expect(mailer.enforced).toBe(false);
    await expect(mailer.sendCode(mail)).rejects.toMatchObject({
      statusCode: 503,
      code: 'mail_not_configured',
    });
  });

  it('surfaces a broken SMTP server as mail_failed', async () => {
    // Port 1 on loopback refuses immediately, so this stays a fast unit test.
    const mailer = createMailer({
      smtpUrl: 'smtp://127.0.0.1:1',
      mailFrom: 'x@y.z',
      isProduction: false,
    });

    expect(mailer.mode).toBe('smtp');
    await expect(mailer.sendCode(mail)).rejects.toSatisfy(
      (error: unknown) => error instanceof ApiError && error.code === 'mail_failed',
    );
  });
});
