import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../src/http.ts';
import { createMailer, renderSecurityEmail } from '../src/mail.ts';

const mail = { to: 'member@example.com', code: '123456', expiresInMinutes: 10, purpose: 'verify' as const };
const settings = {
  smtpUrl: null,
  mailFrom: 'x@y.z',
  appOrigin: 'https://pdf.example.com',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createMailer', () => {
  it('logs the code instead of sending when SMTP is absent in development', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const mailer = createMailer({ ...settings, isProduction: false });

    await mailer.sendCode(mail);

    expect(mailer.mode).toBe('log');
    expect(mailer.enforced).toBe(true);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('123456'));
  });

  it('turns the requirement off when production has no SMTP', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mailer = createMailer({ ...settings, isProduction: true });

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
      ...settings,
      smtpUrl: 'smtp://127.0.0.1:1',
      isProduction: false,
    });

    expect(mailer.mode).toBe('smtp');
    await expect(mailer.sendCode(mail)).rejects.toSatisfy(
      (error: unknown) => error instanceof ApiError && error.code === 'mail_failed',
    );
  });
});

describe('renderSecurityEmail', () => {
  it('carries the brand palette, the code and a link back to the app', () => {
    const message = renderSecurityEmail({ ...mail, purpose: 'reset' }, 'https://pdf.example.com/');

    expect(message.subject).toContain('123456');
    expect(message.text).toContain('123456');
    expect(message.html).toContain('#14110d');
    expect(message.html).toContain('#ef5b20');
    expect(message.html).toContain('123456');
    // The trailing slash of APP_ORIGIN must not become a double slash.
    expect(message.html).toContain('href="https://pdf.example.com/#/forgot"');
    expect(message.html).not.toContain('example.com//');
    expect(message.html).toContain('ตั้งรหัสผ่านใหม่');
  });

  it('links verification mail to the account page and keeps the copy distinct', () => {
    const message = renderSecurityEmail(mail, 'https://pdf.example.com');

    expect(message.subject).toContain('รหัสยืนยัน');
    expect(message.html).toContain('href="https://pdf.example.com/#/activity"');
    expect(message.text).toContain('ยืนยันอีเมล');
  });
});
