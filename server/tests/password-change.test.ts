import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db.ts';
import {
  closeTestDb,
  createTestApp,
  originHeaders,
  truncateAll,
  workspaceToken,
} from './helpers/test-server.ts';

let app: FastifyInstance;
let db: Db;

const OLD_PASSWORD = 'old horse battery';
const NEW_PASSWORD = 'new horse battery';

function sessionCookie(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) throw new Error('ไม่มี Set-Cookie ในคำตอบ');
  return value.split(';')[0] ?? '';
}

async function signUp(email = 'change@example.com'): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    headers: originHeaders(workspaceToken()),
    payload: { email, password: OLD_PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  return sessionCookie(response);
}

function signIn(email = 'change@example.com', password = OLD_PASSWORD) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/signin',
    headers: originHeaders(workspaceToken()),
    payload: { email, password },
  });
}

function change(cookie: string | null, body: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/password/change',
    headers: cookie ? { cookie } : originHeaders(workspaceToken()),
    payload: body,
  });
}

beforeAll(async () => {
  const created = await createTestApp();
  app = created.app;
  db = created.db;
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await app.close();
  await closeTestDb();
});

describe('change password', () => {
  it('needs a session', async () => {
    const response = await change(null, { currentPassword: OLD_PASSWORD, password: NEW_PASSWORD });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('unauthorized');
  });

  it('requires the current password, which keeps a stolen session from taking over', async () => {
    const cookie = await signUp();

    const wrong = await change(cookie, { currentPassword: 'not my password', password: NEW_PASSWORD });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('invalid_credentials');

    // Nothing changed.
    expect((await signIn()).statusCode).toBe(200);
  });

  it('rejects a new password that is the same or too short', async () => {
    const cookie = await signUp();

    const same = await change(cookie, { currentPassword: OLD_PASSWORD, password: OLD_PASSWORD });
    expect(same.statusCode).toBe(400);

    const short = await change(cookie, { currentPassword: OLD_PASSWORD, password: 'short' });
    expect(short.statusCode).toBe(400);
    expect(short.json().error.code).toBe('invalid_request');

    expect((await signIn()).statusCode).toBe(200);
  });

  it('changes the password, keeps this browser and signs out the others', async () => {
    const first = await signUp();
    const secondResponse = await signIn();
    expect(secondResponse.statusCode).toBe(200);
    const second = sessionCookie(secondResponse);

    const response = await change(first, { currentPassword: OLD_PASSWORD, password: NEW_PASSWORD });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, signedOutSessions: 1 });

    expect((await signIn('change@example.com', OLD_PASSWORD)).statusCode).toBe(401);
    expect((await signIn('change@example.com', NEW_PASSWORD)).statusCode).toBe(200);

    // The browser that changed it stays signed in; the other one is gone.
    const keep = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: first } });
    expect(keep.statusCode).toBe(200);
    const dropped = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: second } });
    expect(dropped.statusCode).toBe(401);
  });

  it('refuses accounts that only have Google sign-in', async () => {
    await db.query(
      `insert into app_user (google_sub, email, email_verified) values ('g-2', 'google@example.com', true)`,
    );
    const userId = (
      await db.query<{ id: string }>("select id from app_user where email = 'google@example.com'")
    ).rows[0]?.id;
    expect(userId).toBeTypeOf('string');

    // Sign in through Google would need a real token, so the session is created directly.
    const { createSession } = await import('../src/auth.ts');
    const session = await createSession(db, userId ?? '', 30);
    const response = await change(
      `pdfstudio_session=${session.token}`,
      { currentPassword: OLD_PASSWORD, password: NEW_PASSWORD },
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('no_password');
  });

  it('throttles guessing the current password', async () => {
    const cookie = await signUp();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await change(cookie, {
        currentPassword: `guess-${attempt}`,
        password: NEW_PASSWORD,
      });
      expect(response.statusCode).toBe(401);
    }

    const blocked = await change(cookie, { currentPassword: OLD_PASSWORD, password: NEW_PASSWORD });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('too_many_attempts');
    // The real password still works once the throttle is the only thing blocking.
    expect((await signIn()).statusCode).toBe(200);
  });
});
