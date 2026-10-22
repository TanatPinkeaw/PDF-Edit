import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export type Env = {
  databaseUrl: string;
  port: number;
  host: string;
  appOrigin: string;
  googleClientId: string | null;
  /**
   * Product switch for the credit wallet. Off (the default) means every run is
   * free and the wallet is left untouched; the credit code and tables stay for
   * when this is turned back on.
   */
  creditsEnabled: boolean;
  /** When true, only signed-in accounts may create a run. */
  requireSignIn: boolean;
  /** Credits a browser gets before signing up (one-off, never reset). */
  anonCredits: number;
  /** Credits a new account receives the first time it opens a wallet. */
  signupBonusCredits: number;
  shareMaxBytes: number;
  shareTtlDays: number;
  /** How long a run stays in the history before the row is pruned. */
  historyTtlDays: number;
  sessionTtlDays: number;
  /** Headless LibreOffice binary used by the Word/PDF conversion routes. */
  sofficePath: string;
  /**
   * `smtp://user:pass@host:587` or `smtps://user:pass@host:465`. Missing means
   * no mail can be sent: dev logs the code, production refuses to start a send.
   */
  smtpUrl: string | null;
  /** Envelope sender for verification mail. */
  mailFrom: string;
  isProduction: boolean;
};

export const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/pdf_studio';
export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:5432/pdf_studio_test';

export const MIGRATIONS_DIR = resolve(HERE, '../migrations');

function readBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error(`ค่าบูลีนไม่ถูกต้อง (ได้ "${raw}")`);
}

function readInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${name} ต้องเป็นจำนวนเต็มบวก (ได้ "${raw}")`);
  }
  return value;
}

/**
 * Reads server configuration. `.env` is loaded by Node's `--env-file`, so this
 * function only validates and fills defaults.
 */
export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  const databaseUrl = source.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
  const googleClientId = source.GOOGLE_CLIENT_ID?.trim() || null;
  const isProduction = source.NODE_ENV === 'production';

  return {
    databaseUrl,
    port: readInt(source.API_PORT, 8787, 'API_PORT'),
    host: source.API_HOST?.trim() || '127.0.0.1',
    appOrigin: (source.APP_ORIGIN?.trim() || 'http://127.0.0.1:5174').replace(/\/$/, ''),
    googleClientId,
    // Free mode is the shipped default: no charging, no wallet in the UI. Set
    // CREDITS_ENABLED=true to bring the old economics back without a migration.
    creditsEnabled: readBool(source.CREDITS_ENABLED, false),
    // Tools are free, but the account is the product gate.
    requireSignIn: readBool(source.REQUIRE_SIGN_IN, true),
    anonCredits: readInt(source.ANON_CREDITS, 3, 'ANON_CREDITS'),
    signupBonusCredits: readInt(source.SIGNUP_BONUS_CREDITS, 20, 'SIGNUP_BONUS_CREDITS'),
    shareMaxBytes: readInt(source.SHARE_MAX_BYTES, 26_214_400, 'SHARE_MAX_BYTES'),
    shareTtlDays: readInt(source.SHARE_TTL_DAYS, 7, 'SHARE_TTL_DAYS'),
    historyTtlDays: readInt(source.HISTORY_TTL_DAYS, 30, 'HISTORY_TTL_DAYS'),
    sessionTtlDays: readInt(source.SESSION_TTL_DAYS, 30, 'SESSION_TTL_DAYS'),
    sofficePath: source.SOFFICE_PATH?.trim() || 'soffice',
    smtpUrl: source.SMTP_URL?.trim() || null,
    mailFrom: source.MAIL_FROM?.trim() || 'PDF Studio <no-reply@localhost>',
    isProduction,
  };
}

/** Fails early with an actionable message when the local database is unreachable. */
export function describeDbFailure(error: unknown, databaseUrl: string): Error {
  const reason = error instanceof Error ? error.message : String(error);
  const safeUrl = databaseUrl.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
  return new Error(
    `เชื่อมต่อ PostgreSQL ไม่ได้ (${safeUrl}): ${reason}\n` +
      'ตรวจว่า service PostgreSQL รันอยู่ และ DATABASE_URL ใน .env ถูกต้อง — ' +
      'สร้างฐานข้อมูลด้วย `pnpm db:create && pnpm db:migrate`',
  );
}
