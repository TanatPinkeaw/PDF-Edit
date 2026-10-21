import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db.ts';
import type { RecordingMailer } from './helpers/test-server.ts';
import {
  closeTestDb,
  createTestApp,
  originHeaders,
  recordingMailer,
  truncateAll,
  workspaceToken,
} from './helpers/test-server.ts';

let app: FastifyInstance;
let db: Db;
let mailer: RecordingMailer;

const OLD_PASSWORD = 'old horse battery';
const NEW_PASSWORD = 'new horse battery';

function sessionCookie(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) throw new Error('ไม่มี Set-Cookie ในคำตอบ');
  return value.split(';')[0] ?? '';
}

async function signUp(email: string): Promise<{ headers: Record<string, string>; cookie: string }> {
  const token = workspaceToken();
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    headers: originHeaders(token),
    payload: { email, password: OLD_PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  const cookie = sessionCookie(response);
  return { headers: { ...originHeaders(token), cookie }, cookie };
}

function forgot(email: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/password/forgot',
    headers: originHeaders(workspaceToken()),
    payload: { email },
  });
}

function reset(email: string, code: string, password = NEW_PASSWORD) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/password/reset',
    headers: originHeaders(workspaceToken()),
    payload: { email, code, password },
  });
}

function signIn(email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/signin',
    headers: originHeaders(workspaceToken()),
    payload: { email, password },
  });
}

beforeAll(async () => {
  mailer = recordingMailer();
  const created = await createTestApp({ mailer });
  app = created.app;
  db = created.db;
});

beforeEach(async () => {
  await truncateAll(db);
  mailer.sent.length = 0;
});

afterAll(async () => {
  await app.close();
  await closeTestDb();
});

describe('forgot password', () => {
  it('answers the same way for an unknown address without sending mail', async () => {
    const response = await forgot('nobody@example.com');

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(0);
  });

  it('mails a reset code to an address that has a password', async () => {
    await signUp('reset@example.com');
    mailer.sent.length = 0;

    const response = await forgot('Reset@Example.com');

    expect(response.statusCode).toBe(202);
    expect(response.json().ok).toBe(true);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.lastPurpose()).toBe('reset');
    expect(mailer.lastCode()).toMatch(/^\d{6}$/);
    // Local mail is logged only, so the code comes back for the test.
    expect(response.json().devCode).toBe(mailer.lastCode());
  });

  it('swallows the unknown-account case for Google-only accounts', async () => {
    await db.query(
      `insert into app_user (google_sub, email, email_verified) values ('g-1', 'google@example.com', true)`,
    );

    const response = await forgot('google@example.com');

    expect(response.statusCode).toBe(202);
    expect(mailer.sent).toHaveLength(0);
  });

  it('throttles repeated requests per address', async () => {
    await signUp('throttle@example.com');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await forgot('throttle@example.com')).statusCode).toBe(202);
    }

    const blocked = await forgot('throttle@example.com');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('too_many_attempts');
  });
});

describe('reset password', () => {
  it('changes the password only with the code that was mailed', async () => {
    await signUp('change@example.com');
    await forgot('change@example.com');
    const code = mailer.lastCode();
    const wrong = code === '000000' ? '111111' : '000000';

    const rejected = await reset('change@example.com', wrong);
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error.code).toBe('code_invalid');

    // Nothing changed yet.
    expect((await signIn('change@example.com', OLD_PASSWORD)).statusCode).toBe(200);
    expect((await signIn('change@example.com', NEW_PASSWORD)).statusCode).toBe(401);

    const accepted = await reset('change@example.com', code);
    expect(accepted.statusCode).toBe(200);
    expect(sessionCookie(accepted)).toContain('pdfstudio_session');

    expect((await signIn('change@example.com', OLD_PASSWORD)).statusCode).toBe(401);
    expect((await signIn('change@example.com', NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('signs out every older device', async () => {
    const { cookie: oldCookie } = await signUp('devices@example.com');
    await forgot('devices@example.com');
    const response = await reset('devices@example.com', mailer.lastCode());
    expect(response.statusCode).toBe(200);

    const stillThere = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: oldCookie },
    });
    expect(stillThere.statusCode).toBe(401);

    const fresh = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: sessionCookie(response) },
    });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json().user.email).toBe('devices@example.com');
  });

  it('cannot be driven by a verification code or an unknown account', async () => {
    const { headers } = await signUp('cross@example.com');

    // Ask for a *verification* code, then try to spend it on a reset.
    const verify = await app.inject({ method: 'POST', url: '/api/auth/verify/send', headers });
    expect(verify.statusCode).toBe(202);
    const verifyCode = mailer.lastCode();

    const mismatched = await reset('cross@example.com', verifyCode);
    expect(mismatched.statusCode).toBe(400);
    expect(mismatched.json().error.code).toBe('code_missing');

    // A reset code must not be able to mark the email verified either.
    await forgot('cross@example.com');
    const resetCode = mailer.lastCode();
    const misplaced = await app.inject({
      method: 'POST',
      url: '/api/auth/verify/confirm',
      headers,
      payload: { code: resetCode },
    });
    expect(misplaced.statusCode).toBe(400);
    // The open verification code does not match a reset code.
    expect(misplaced.json().error.code).toBe('code_invalid');

    const unknown = await reset('nobody@example.com', '123456');
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('code_invalid');
  });

  it('requires a password long enough to be worth setting', async () => {
    await signUp('short@example.com');
    await forgot('short@example.com');

    const response = await reset('short@example.com', mailer.lastCode(), 'short');
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('invalid_request');
  });
});
