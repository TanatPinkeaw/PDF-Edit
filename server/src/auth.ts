/**
 * Identity for the API: anonymous workspaces (a token kept in the browser) and
 * optional Google sign-in (a httpOnly session cookie).
 *
 * Only hashes are stored; the raw workspace token never reaches the database.
 */

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { Db } from './db.ts';
import { ApiError } from './http.ts';

export const WORKSPACE_HEADER = 'x-workspace-token';
export const SESSION_COOKIE = 'pdfstudio_session';
const WORKSPACE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function isValidWorkspaceToken(token: string): boolean {
  return WORKSPACE_TOKEN_PATTERN.test(token);
}

export type Workspace = { id: string; userId: string | null };

/** Finds the workspace for a browser token, creating it on first use. */
export async function findOrCreateWorkspace(db: Db, token: string): Promise<Workspace> {
  const tokenHash = hashToken(token);
  const inserted = await db.query<{ id: string; user_id: string | null }>(
    `insert into workspace (token_hash) values ($1)
     on conflict (token_hash) do update set token_hash = excluded.token_hash
     returning id, user_id`,
    [tokenHash],
  );
  const row = inserted.rows[0];
  if (!row) throw new ApiError(500, 'internal', 'สร้าง workspace ไม่สำเร็จ');
  return { id: row.id, userId: row.user_id };
}

export async function attachWorkspaceToUser(db: Db, workspaceId: string, userId: string): Promise<void> {
  await db.query('update workspace set user_id = $2 where id = $1', [workspaceId, userId]);
}

/**
 * Passwords: scrypt from the standard library, so no native dependency is
 * needed. Parameters are stored inside the hash string, which keeps old hashes
 * verifiable after a future cost increase.
 */
const SCRYPT = { N: 16_384, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 } as const;
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Emails are matched case-insensitively, so they are stored normalised. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password.normalize('NFKC'), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number.parseInt(parts[1] ?? '', 10);
  const r = Number.parseInt(parts[2] ?? '', 10);
  const p = Number.parseInt(parts[3] ?? '', 10);
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || expected.length === 0) {
    return false;
  }

  const actual = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
    N,
    r,
    p,
    maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Verifying a password for an email that does not exist still costs one scrypt
 * run, so response time does not reveal which emails have accounts.
 */
const DUMMY_PASSWORD_HASH_PROMISE = hashPassword('pdf-studio-dummy-password');

export async function burnPasswordCheck(password: string): Promise<void> {
  await verifyPassword(password, await DUMMY_PASSWORD_HASH_PROMISE);
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  pictureUrl: string | null;
};

export type GoogleVerifier = (credential: string) => Promise<GoogleProfile>;

/** Verifies a Google Identity Services ID token against Google's public JWKS. */
export function createGoogleVerifier(clientId: string): GoogleVerifier {
  const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  return async (credential: string): Promise<GoogleProfile> => {
    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(credential, jwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: clientId,
      });
      payload = verified.payload;
    } catch (error) {
      throw new ApiError(
        401,
        'unauthorized',
        `Google token ไม่ผ่านการตรวจสอบ: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    if (sub === '' || email === '') {
      throw new ApiError(401, 'unauthorized', 'Google token ไม่มี sub หรือ email');
    }
    if (payload.email_verified !== true) {
      throw new ApiError(401, 'unauthorized', 'อีเมลของบัญชี Google ยังไม่ยืนยัน');
    }

    return {
      sub,
      email,
      emailVerified: true,
      name: typeof payload.name === 'string' ? payload.name : null,
      pictureUrl: typeof payload.picture === 'string' ? payload.picture : null,
    };
  };
}

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
};

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
};

function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, name: row.name, pictureUrl: row.picture_url };
}

/** Postgres unique-violation, used to turn duplicates into a friendly 409. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

export async function upsertUser(db: Db, profile: GoogleProfile): Promise<PublicUser> {
  let rows: UserRow[];
  try {
    const result = await db.query<UserRow>(
      `insert into app_user (google_sub, email, email_verified, name, picture_url)
       values ($1, $2, $3, $4, $5)
       on conflict (google_sub) do update set
         email = excluded.email,
         email_verified = excluded.email_verified,
         name = excluded.name,
         picture_url = excluded.picture_url,
         last_seen_at = now()
       returning id, email, name, picture_url`,
      [profile.sub, normalizeEmail(profile.email), profile.emailVerified, profile.name, profile.pictureUrl],
    );
    rows = result.rows;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        'email_taken',
        'อีเมลนี้มีบัญชีที่สมัครด้วยรหัสผ่านอยู่แล้ว — เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน',
      );
    }
    throw error;
  }

  const row = rows[0];
  if (!row) throw new ApiError(500, 'internal', 'บันทึกบัญชีผู้ใช้ไม่สำเร็จ');
  return toPublicUser(row);
}

export async function createPasswordUser(
  db: Db,
  input: { email: string; name: string | null; passwordHash: string },
): Promise<PublicUser> {
  let rows: UserRow[];
  try {
    const result = await db.query<UserRow>(
      `insert into app_user (email, name, password_hash)
       values ($1, $2, $3)
       returning id, email, name, picture_url`,
      [normalizeEmail(input.email), input.name, input.passwordHash],
    );
    rows = result.rows;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, 'email_taken', 'อีเมลนี้ถูกสมัครไว้แล้ว — เข้าสู่ระบบแทน');
    }
    throw error;
  }

  const row = rows[0];
  if (!row) throw new ApiError(500, 'internal', 'สร้างบัญชีไม่สำเร็จ');
  return toPublicUser(row);
}

/** Sign-in needs the hash, but it never leaves this module. */
export async function findUserByEmail(
  db: Db,
  email: string,
): Promise<{ user: PublicUser; passwordHash: string | null } | null> {
  const result = await db.query<UserRow & { password_hash: string | null }>(
    `select id, email, name, picture_url, password_hash
       from app_user
      where lower(email) = $1`,
    [normalizeEmail(email)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { user: toPublicUser(row), passwordHash: row.password_hash };
}

/** Google-only accounts have no password to change or reset. */
export async function userHasPassword(db: Db, userId: string): Promise<boolean> {
  const result = await db.query<{ has_password: boolean }>(
    'select password_hash is not null as has_password from app_user where id = $1',
    [userId],
  );
  return result.rows[0]?.has_password === true;
}

export async function findUserById(db: Db, id: string): Promise<PublicUser | null> {
  const result = await db.query<UserRow>(
    'select id, email, name, picture_url from app_user where id = $1',
    [id],
  );
  const row = result.rows[0];
  return row ? toPublicUser(row) : null;
}

export async function createSession(
  db: Db,
  userId: string,
  ttlDays: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken(32);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await db.query(
    'insert into auth_session (user_id, token_hash, expires_at) values ($1, $2, $3)',
    [userId, hashToken(token), expiresAt.toISOString()],
  );
  return { token, expiresAt };
}

export async function resolveSessionUser(db: Db, token: string): Promise<PublicUser | null> {
  const result = await db.query<{
    id: string;
    email: string;
    name: string | null;
    picture_url: string | null;
  }>(
    `select u.id, u.email, u.name, u.picture_url
       from auth_session s
       join app_user u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, pictureUrl: row.picture_url };
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.query('delete from auth_session where token_hash = $1', [hashToken(token)]);
}

export type RequestContext = {
  user: PublicUser | null;
  workspaceId: string | null;
};

/**
 * Resolves the caller: a signed-in user from the session cookie, and/or the
 * anonymous workspace from the `x-workspace-token` header.
 */
export async function resolveContext(db: Db, request: FastifyRequest): Promise<RequestContext> {
  const sessionToken = request.cookies?.[SESSION_COOKIE];
  const user = sessionToken ? await resolveSessionUser(db, sessionToken) : null;

  const rawWorkspace = request.headers[WORKSPACE_HEADER];
  const workspaceToken = Array.isArray(rawWorkspace) ? rawWorkspace[0] : rawWorkspace;
  let workspaceId: string | null = null;
  if (typeof workspaceToken === 'string' && workspaceToken !== '') {
    if (!isValidWorkspaceToken(workspaceToken)) {
      throw new ApiError(400, 'invalid_request', 'workspace token มีรูปแบบไม่ถูกต้อง');
    }
    const workspace = await findOrCreateWorkspace(db, workspaceToken);
    workspaceId = workspace.id;
  }

  return { user, workspaceId };
}

export function requireWorkspace(context: RequestContext): string {
  if (!context.workspaceId) {
    throw new ApiError(401, 'unauthorized', 'ต้องส่ง x-workspace-token');
  }
  return context.workspaceId;
}

export function requireUser(context: RequestContext): PublicUser {
  if (!context.user) throw new ApiError(401, 'unauthorized', 'ต้องเข้าสู่ระบบก่อน');
  return context.user;
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure });
}
