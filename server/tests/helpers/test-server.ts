import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { buildServer } from '../../src/app.ts';
import type { GoogleVerifier } from '../../src/auth.ts';
import { createDb, type Db } from '../../src/db.ts';
import { ensureDatabase } from '../../src/db/create.ts';
import { runMigrations } from '../../src/db/migrate.ts';
import { DEFAULT_TEST_DATABASE_URL, readEnv, type Env } from '../../src/env.ts';
import { ApiError } from '../../src/http.ts';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

let sharedDb: Db | null = null;

export async function testDb(): Promise<Db> {
  if (sharedDb) return sharedDb;
  await ensureDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL, { max: 4 });
  await runMigrations(db);
  sharedDb = db;
  return db;
}

export async function closeTestDb(): Promise<void> {
  if (!sharedDb) return;
  await sharedDb.close();
  sharedDb = null;
}

export async function truncateAll(db: Db): Promise<void> {
  await db.query(
    'truncate app_user, workspace, auth_session, job_run, preset, artifact, share_link restart identity cascade',
  );
}

export function testEnv(overrides: Record<string, string | undefined> = {}): Env {
  return readEnv({
    DATABASE_URL: TEST_DATABASE_URL,
    GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
    ANON_DAILY_LIMIT: '3',
    SHARE_MAX_BYTES: '1048576',
    SHARE_TTL_DAYS: '7',
    ...overrides,
  });
}

export function workspaceToken(): string {
  return randomBytes(32).toString('base64url');
}

export function originHeaders(token: string): Record<string, string> {
  return {
    'x-workspace-token': token,
    origin: 'http://127.0.0.1:5174',
  };
}

export async function createTestApp(options: {
  db?: Db;
  env?: Env;
  googleVerifier?: GoogleVerifier | null;
} = {}): Promise<{ app: FastifyInstance; db: Db; env: Env }> {
  const db = options.db ?? (await testDb());
  const env = options.env ?? testEnv();
  const app = await buildServer({
    env,
    db,
    googleVerifier:
      options.googleVerifier === undefined ? null : options.googleVerifier,
  });
  return { app, db, env };
}

/** Verifier stub: only `valid-credential` signs in. */
export function googleVerifierFor(
  sub = 'google-sub-1',
  email = 'tester@example.com',
): GoogleVerifier {
  return async (credential) => {
    if (credential !== 'valid-credential') {
      throw new ApiError(401, 'unauthorized', 'Google token ไม่ผ่านการตรวจสอบ');
    }
    return { sub, email, emailVerified: true, name: 'Tester', pictureUrl: null };
  };
}
