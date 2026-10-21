/**
 * Outgoing mail. Security codes leave through the operator's own SMTP server,
 * so there is no vendor account to create.
 *
 * The template mirrors the site: cream paper, ink borders, an orange marker
 * accent and a monospace code block. Everything is inline and table-based
 * because mail clients strip stylesheets; no webfont is required (Krub is used
 * when the reader has it, Thai system fonts otherwise).
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

const INK = '#14110d';
const PAPER = '#f4ecdd';
const SURFACE = '#fffdf4';
const ACCENT = '#ef5b20';
const ACCENT_SOFT = '#ffe1cc';
const MUTED = '#6b6151';
const LINE = '#d9c9aa';
const DISPLAY = "Krub, 'Noto Sans Thai', 'Segoe UI', Tahoma, sans-serif";
const BODY = "'Noto Sans Thai', 'Segoe UI', Tahoma, Arial, sans-serif";
const MONO = "'Cascadia Code', Consolas, 'Courier New', monospace";

export type RenderedMail = { subject: string; text: string; html: string };

/** Exported so a preview file (and tests) can render exactly what is sent. */
export function renderSecurityEmail(mail: SecurityMail, appOrigin: string): RenderedMail {
  const reset = mail.purpose === 'reset';
  const title = reset ? 'ตั้งรหัสผ่านใหม่' : 'ยืนยันอีเมล';
  const subject = reset
    ? `ตั้งรหัสผ่านใหม่ PDF Studio: ${mail.code}`
    : `รหัสยืนยัน PDF Studio: ${mail.code}`;
  const intro = reset
    ? 'มีคนขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ ใช้รหัสด้านล่างเพื่อตั้งรหัสผ่านใหม่'
    : 'ใช้รหัสด้านล่างเพื่อยืนยันอีเมลนี้ แล้วจึงใช้เครดิตของบัญชีได้';
  const footer = reset
    ? 'ถ้าคุณไม่ได้ขอตั้งรหัสผ่านใหม่ ไม่ต้องทำอะไร — รหัสผ่านเดิมยังใช้ได้'
    : 'ถ้าคุณไม่ได้สมัคร PDF Studio ไม่ต้องทำอะไร — ไม่มีข้อมูลใดถูกเปลี่ยนแปลง';
  const base = appOrigin.replace(/\/$/, '');
  const path = reset ? '/#/forgot' : '/#/activity';
  const url = `${base}${path}`;

  const text = [
    `PDF Studio — ${title}`,
    '',
    intro,
    '',
    mail.code,
    '',
    `รหัสใช้ได้ภายใน ${mail.expiresInMinutes} นาที และใช้ได้ครั้งเดียว`,
    `เปิด PDF Studio: ${url}`,
    '',
    footer,
    'ไฟล์ PDF ประมวลผลในเบราว์เซอร์ของคุณ — เซิร์ฟเวอร์เก็บเฉพาะประวัติและเครดิต',
  ].join('\n');

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${PAPER};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">รหัส ${mail.code} สำหรับ${title} — ใช้ได้ ${mail.expiresInMinutes} นาที</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAPER};padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:${SURFACE};border:3px solid ${INK};border-radius:14px;">
            <tr>
              <td style="padding:22px 24px 0 24px;">
                <div style="font-family:${DISPLAY};font-size:13px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:${INK};">
                  PDF Studio
                </div>
                <div style="height:3px;width:132px;background-color:${ACCENT};border-radius:2px;margin-top:6px;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px 0 24px;">
                <h1 style="margin:0 0 8px 0;font-family:${DISPLAY};font-size:24px;line-height:1.3;font-weight:600;color:${INK};">
                  ${title}
                </h1>
                <p style="margin:0;font-family:${BODY};font-size:14px;line-height:1.65;color:${MUTED};">
                  ${intro}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 0 24px;">
                <div style="padding:16px 10px 16px 18px;background-color:${ACCENT_SOFT};border:2px solid ${INK};border-radius:10px;text-align:center;font-family:${MONO};font-size:30px;font-weight:700;letter-spacing:8px;color:${INK};">
                  ${mail.code}
                </div>
                <p style="margin:10px 0 0 0;font-family:${BODY};font-size:12px;line-height:1.6;color:${MUTED};">
                  รหัสใช้ได้ภายใน ${mail.expiresInMinutes} นาที และใช้ได้ครั้งเดียว
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 0 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background-color:${INK};border-radius:999px;">
                      <a href="${url}" style="display:inline-block;padding:11px 22px;font-family:${BODY};font-size:13.5px;font-weight:700;color:${SURFACE};text-decoration:none;">
                        ${reset ? 'ไปหน้าตั้งรหัสผ่าน' : 'ไปที่บัญชีของฉัน'}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 24px 0 24px;">
                <div style="height:1px;background-color:${LINE};"></div>
                <p style="margin:14px 0 0 0;font-family:${BODY};font-size:12px;line-height:1.65;color:${MUTED};">
                  ${footer}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px 24px 24px;">
                <p style="margin:0;font-family:${BODY};font-size:11.5px;line-height:1.6;color:${MUTED};">
                  PDF Studio · ไฟล์ PDF ประมวลผลในเบราว์เซอร์ของคุณ<br />
                  เซิร์ฟเวอร์เก็บเฉพาะประวัติ เครดิต และลิงก์แชร์ที่คุณสร้างเอง
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:14px 0 0 0;font-family:${BODY};font-size:11px;color:${MUTED};">
            ส่งจาก ${base.replace(/^https?:\/\//, '')} — ไม่ต้องตอบกลับอีเมลนี้
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

export function createMailer(
  env: Pick<Env, 'smtpUrl' | 'mailFrom' | 'isProduction' | 'appOrigin'>,
): Mailer {
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
        const message = renderSecurityEmail(mail, env.appOrigin);
        await transport.sendMail({
          from: env.mailFrom,
          to: mail.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
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
