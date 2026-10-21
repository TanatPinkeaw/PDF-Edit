/**
 * Security codes for members: a six-digit code proves control of the mailbox.
 * Two purposes share this machinery — verifying the address before credits can
 * be spent, and setting a new password.
 *
 * Codes are stored as `sha256(user id + code)` only, live for ten minutes, allow
 * five wrong guesses, and are rate-limited per account so the endpoint cannot be
 * used as a mail relay. A code only works for the purpose it was issued for.
 */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import type { RequestContext } from './auth.ts';
import type { CodePurpose } from './mail.ts';
import type { Db } from './db.ts';
import { ApiError, badRequest } from './http.ts';
import type { Mailer } from './mail.ts';

export const CODE_TTL_MINUTES = 10;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_SENDS_PER_HOUR = 5;
export const MAX_ATTEMPTS = 5;

export type VerificationStatus = {
  verified: boolean;
  /** True when an unverified email stops credit spending (false if mail is off). */
  enforced: boolean;
  mailMode: Mailer['mode'];
  /** When the code already sent stops working; null when nothing is pending. */
  pendingExpiresAt: string | null;
  /** When asking for another code becomes allowed again. */
  resendAt: string | null;
};

type PendingCode = {
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
  created_at: Date;
};

export type VerifiableUser = { id: string; email: string };

function hashCode(userId: string, code: string): string {
  return createHash('sha256').update(`${userId}:${code}`, 'utf8').digest('hex');
}

function sameHash(stored: string, candidate: string): boolean {
  const left = Buffer.from(stored, 'hex');
  const right = Buffer.from(candidate, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function isEmailVerified(db: Db, userId: string): Promise<boolean> {
  const result = await db.query<{ email_verified: boolean }>(
    'select email_verified from app_user where id = $1',
    [userId],
  );
  return result.rows[0]?.email_verified === true;
}

async function pendingCode(db: Db, userId: string, purpose: CodePurpose): Promise<PendingCode | null> {
  const result = await db.query<PendingCode>(
    `select id, code_hash, attempts, expires_at, created_at
       from email_verification
      where user_id = $1 and purpose = $2 and consumed_at is null
      order by created_at desc
      limit 1`,
    [userId, purpose],
  );
  return result.rows[0] ?? null;
}

function resendAtOf(pending: PendingCode | null): string | null {
  if (!pending) return null;
  return new Date(pending.created_at.getTime() + RESEND_COOLDOWN_SECONDS * 1000).toISOString();
}

export async function describeVerification(
  db: Db,
  mailer: Mailer,
  user: VerifiableUser,
): Promise<VerificationStatus> {
  const verified = await isEmailVerified(db, user.id);
  const pending = verified ? null : await pendingCode(db, user.id, 'verify');
  return {
    verified,
    enforced: mailer.enforced,
    mailMode: mailer.mode,
    pendingExpiresAt: pending ? pending.expires_at.toISOString() : null,
    resendAt: resendAtOf(pending),
  };
}

/**
 * Issues a code for one purpose and cancels whatever was open before, so two
 * codes never work at once. A row is removed again if the mail service rejects
 * it — a broken SMTP must not also rate-limit the retry.
 */
async function issueCode(
  db: Db,
  mailer: Mailer,
  user: VerifiableUser,
  purpose: CodePurpose,
): Promise<{ devCode?: string }> {
  if (mailer.mode === 'disabled') {
    throw new ApiError(503, 'mail_not_configured', 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SMTP จึงส่งรหัสไม่ได้');
  }

  const latest = await pendingCode(db, user.id, purpose);
  if (latest) {
    const waitMs = latest.created_at.getTime() + RESEND_COOLDOWN_SECONDS * 1000 - Date.now();
    if (waitMs > 0) {
      const seconds = Math.ceil(waitMs / 1000);
      throw new ApiError(429, 'too_many_attempts', `ขอรหัสใหม่ได้ในอีก ${seconds} วินาที`, {
        retryAfterSeconds: seconds,
      });
    }
  }

  const recent = await db.query<{ count: string }>(
    `select count(*)::text as count
       from email_verification
      where user_id = $1 and created_at > now() - interval '1 hour'`,
    [user.id],
  );
  if (Number(recent.rows[0]?.count ?? 0) >= MAX_SENDS_PER_HOUR) {
    throw new ApiError(
      429,
      'too_many_attempts',
      'ขอยืนยันบ่อยเกินไป — ลองใหม่ในอีก 1 ชั่วโมง',
      { retryAfterSeconds: 3600 },
    );
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);

  await db.query(
    'update email_verification set consumed_at = now() where user_id = $1 and purpose = $2 and consumed_at is null',
    [user.id, purpose],
  );
  const inserted = await db.query<{ id: string }>(
    `insert into email_verification (user_id, code_hash, expires_at, purpose)
     values ($1, $2, $3, $4)
     returning id`,
    [user.id, hashCode(user.id, code), expiresAt.toISOString(), purpose],
  );
  const id = inserted.rows[0]?.id;

  try {
    await mailer.sendCode({
      to: user.email,
      code,
      expiresInMinutes: CODE_TTL_MINUTES,
      purpose,
    });
  } catch (error) {
    if (id) await db.query('delete from email_verification where id = $1', [id]);
    throw error;
  }

  return mailer.mode === 'log' ? { devCode: code } : {};
}

/**
 * Checks the newest open code for a purpose and consumes it on success.
 * Wrong guesses are counted on the row itself, so a restart cannot reset them.
 */
async function consumeCode(
  db: Db,
  user: VerifiableUser,
  rawCode: string,
  purpose: CodePurpose,
): Promise<void> {
  const code = rawCode.trim();
  if (!/^\d{6}$/.test(code)) throw badRequest('รหัสต้องเป็นตัวเลข 6 หลัก');

  const pending = await pendingCode(db, user.id, purpose);
  if (!pending) {
    throw new ApiError(400, 'code_missing', 'ยังไม่มีรหัสที่รออยู่ — กดขอรหัสใหม่ก่อน');
  }
  if (pending.expires_at.getTime() <= Date.now()) {
    await db.query('update email_verification set consumed_at = now() where id = $1', [pending.id]);
    throw new ApiError(400, 'code_expired', 'รหัสหมดอายุแล้ว — ขอรหัสใหม่');
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    throw new ApiError(429, 'too_many_attempts', 'กรอกรหัสผิดหลายครั้งเกินไป — ขอรหัสใหม่');
  }

  if (!sameHash(pending.code_hash, hashCode(user.id, code))) {
    const attempts = pending.attempts + 1;
    await db.query('update email_verification set attempts = $2 where id = $1', [pending.id, attempts]);
    const left = Math.max(0, MAX_ATTEMPTS - attempts);
    throw new ApiError(
      400,
      'code_invalid',
      left > 0 ? `รหัสไม่ถูกต้อง — เหลืออีก ${left} ครั้ง` : 'รหัสไม่ถูกต้อง — ขอรหัสใหม่',
      { attemptsLeft: left },
    );
  }

  await db.query('update email_verification set consumed_at = now() where id = $1', [pending.id]);
}

/** Sends a verification code and returns the new state. */
export async function sendVerificationCode(
  db: Db,
  mailer: Mailer,
  user: VerifiableUser,
): Promise<{ status: VerificationStatus; devCode?: string }> {
  if (await isEmailVerified(db, user.id)) {
    throw new ApiError(409, 'already_verified', 'อีเมลนี้ยืนยันแล้ว');
  }
  const issued = await issueCode(db, mailer, user, 'verify');
  return { status: await describeVerification(db, mailer, user), ...issued };
}

/** Confirms the newest verification code and flips `app_user.email_verified`. */
export async function confirmVerification(
  db: Db,
  mailer: Mailer,
  user: VerifiableUser,
  rawCode: string,
): Promise<VerificationStatus> {
  if (await isEmailVerified(db, user.id)) {
    return describeVerification(db, mailer, user);
  }
  await consumeCode(db, user, rawCode, 'verify');
  await db.query('update app_user set email_verified = true where id = $1', [user.id]);
  return describeVerification(db, mailer, user);
}

/** Sends a password-reset code. Sign-in state is untouched. */
export async function sendPasswordResetCode(
  db: Db,
  mailer: Mailer,
  user: VerifiableUser,
): Promise<{ devCode?: string }> {
  return issueCode(db, mailer, user, 'reset');
}

/** Consumes a reset code; the caller writes the new password hash. */
export async function confirmPasswordResetCode(
  db: Db,
  user: VerifiableUser,
  rawCode: string,
): Promise<void> {
  await consumeCode(db, user, rawCode, 'reset');
}

/**
 * The product gate: an unverified member cannot charge a run or redeem credits.
 * Signed-out browsers never reach it — their allowance is already one-off.
 */
export async function assertCanSpendCredits(
  db: Db,
  mailer: Mailer,
  context: RequestContext,
): Promise<void> {
  if (!mailer.enforced || !context.user) return;
  if (await isEmailVerified(db, context.user.id)) return;
  throw new ApiError(
    403,
    'email_unverified',
    'ยืนยันอีเมลก่อนใช้เครดิต — กดรับรหัส 6 หลักที่แถบยืนยันด้านบนของหน้า',
  );
}
