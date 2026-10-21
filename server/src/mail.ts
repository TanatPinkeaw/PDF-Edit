/**
 * Outgoing mail. Security codes leave through the operator's own SMTP server,
 * so there is no vendor account to create.
 *
 * Three modes decide what "send" means:
 *
 * - `smtp`     — SMTP_URL is set; the code is delivered for real.
 * - `log`      — no SMTP_URL outside production: the code is written to the API
 *                log and echoed to the browser so local testing needs no inbox,
 *                while the requirement stays on.
 * - `disabled` — no SMTP_URL in production: nothing can be delivered, so the
 *                requirement is switched off instead of locking every account
 *                out of its own credits.
 */

import nodemailer from 'nodemailer';

import type { Env } from './env.ts';
import { ApiError } from './http.ts';

export type MailMode = 'smtp' | 'log' | 'disabled';

/** A code is only valid for the action it was issued for. */
export type CodePurpose = 'verify' | 'reset';

export type SecurityMail = {
  to: string;
  code: string;
  expiresInMinutes: number;
  purpose: CodePurpose;
};

export type Mailer = {
  mode: MailMode;
  /** Whether an unverified email should stop the wallet from being spent. */
  enforced: boolean;
  sendCode(mail: SecurityMail): Promise<void>;
};

function securityMessage(mail: SecurityMail): {
  subject: string;
  text: string;
  html: string;
} {
  const reset = mail.purpose === 'reset';
  const subject = reset
    ? `ตั้งรหัสผ่านใหม่ PDF Studio: ${mail.code}`
    : `รหัสยืนยัน PDF Studio: ${mail.code}`;
  const intro = reset ? 'รหัสสำหรับตั้งรหัสผ่านใหม่ของคุณคือ' : 'รหัสยืนยันอีเมลของคุณคือ';
  const footer = reset
    ? 'ถ้าคุณไม่ได้ขอตั้งรหัสผ่านใหม่ ไม่ต้องทำอะไร — รหัสผ่านเดิมยังใช้ได้'
    : 'ถ้าคุณไม่ได้สมัคร PDF Studio ไม่ต้องทำอะไร — ไม่มีข้อมูลใดถูกเปลี่ยนแปลง';

  const text = [
    `${intro} ${mail.code}`,
    '',
    `รหัสใช้ได้ภายใน ${mail.expiresInMinutes} นาที และใช้ได้ครั้งเดียว`,
    footer,
  ].join('\n');
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#14110d">',
    `<p>${intro}</p>`,
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0">${mail.code}</p>`,
    `<p>รหัสใช้ได้ภายใน ${mail.expiresInMinutes} นาที และใช้ได้ครั้งเดียว</p>`,
    `<p style="color:#6b6151">${footer}</p>`,
    '</div>',
  ].join('');
  return { subject, text, html };
}

export function createMailer(env: Pick<Env, 'smtpUrl' | 'mailFrom' | 'isProduction'>): Mailer {
  if (!env.smtpUrl) {
    if (env.isProduction) {
      console.warn(
        '[mail] ไม่ได้ตั้ง SMTP_URL — ส่งอีเมลไม่ได้ ระบบจะไม่บังคับยืนยันอีเมลจนกว่าจะตั้งค่า',
      );
      return {
        mode: 'disabled',
        enforced: false,
        async sendCode() {
          throw new ApiError(503, 'mail_not_configured', 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SMTP');
        },
      };
    }

    return {
      mode: 'log',
      enforced: true,
      async sendCode(mail) {
        // No inbox in local development: the code is the log line, and the API
        // also returns it while `mode` is `log`.
        console.info(
          `[mail:dev] ${mail.purpose === 'reset' ? 'รหัสตั้งรหัสผ่านใหม่' : 'OTP'} สำหรับ ${mail.to}: ${mail.code} (หมดอายุใน ${mail.expiresInMinutes} นาที)`,
        );
      },
    };
  }

  const transport = nodemailer.createTransport(env.smtpUrl);
  return {
    mode: 'smtp',
    enforced: true,
    async sendCode(mail) {
      try {
        await transport.sendMail({ from: env.mailFrom, to: mail.to, ...securityMessage(mail) });
      } catch (error) {
        throw new ApiError(
          502,
          'mail_failed',
          `ส่งอีเมลไม่สำเร็จ: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    },
  };
}
