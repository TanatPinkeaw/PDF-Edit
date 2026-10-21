import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export type Env = {
  databaseUrl: string;
  port: number;
  host: string;
  appOrigin: string;
  googleClientId: string | null;
  /** Credits a browser gets before signing up (one-off, never reset). */
  anonCredits: number;
  /** Credits a new account receives the first time it opens a wallet. */
  signupBonusCredits: number;
  shareMaxBytes: number;
  shareTtlDays: number;
  sessionTtlDays: number;
  /** Headless LibreOffice binary used by the Word/PDF conversion routes. */
  sofficePath: string;
  isProduction: boolean;
};

export const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/pdf_studio';
export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:5432/pdf_studio_test';

export const MIGRATIONS_DIR = resolve(HERE, '../migrations');

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
    anonCredits: readInt(source.ANON_CREDITS, 3, 'ANON_CREDITS'),
    signupBonusCredits: readInt(source.SIGNUP_BONUS_CREDITS, 20, 'SIGNUP_BONUS_CREDITS'),
    shareMaxBytes: readInt(source.SHARE_MAX_BYTES, 26_214_400, 'SHARE_MAX_BYTES'),
    shareTtlDays: readInt(source.SHARE_TTL_DAYS, 7, 'SHARE_TTL_DAYS'),
    sessionTtlDays: readInt(source.SESSION_TTL_DAYS, 30, 'SESSION_TTL_DAYS'),
    sofficePath: source.SOFFICE_PATH?.trim() || 'soffice',
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
