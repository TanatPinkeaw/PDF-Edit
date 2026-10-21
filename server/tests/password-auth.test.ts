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

const PASSWORD = 'correct horse battery';

function sessionCookie(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) throw new Error('ไม่มี Set-Cookie ในคำตอบ');
  return value.split(';')[0] ?? '';
}

function signUp(
  email = 'new@example.com',
  password = PASSWORD,
  token = workspaceToken(),
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    headers: originHeaders(token),
    payload: { email, password, name: 'คุณใหม่' },
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

describe('signup', () => {
  it('creates an account with the signup bonus and a session', async () => {
    const response = await signUp('New@Example.com');

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user).toMatchObject({ email: 'new@example.com', name: 'คุณใหม่' });
    expect(body.credits).toMatchObject({ balance: 20, allowance: null, member: true });
    expect(body.recentEntries[0]).toMatchObject({ delta: 20, reason: 'signup_bonus' });

    const cookie = sessionCookie(response);
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.json().user.email).toBe('new@example.com');
    expect(me.json().credits.balance).toBe(20);
  });

  it('stores only a scrypt hash, never the password', async () => {
    await signUp();
    const rows = await db.query<{ password_hash: string | null }>('select password_hash from app_user');
    const hash = rows.rows[0]?.password_hash ?? '';

    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(hash).not.toContain(PASSWORD);
  });

  it('rejects a duplicate email regardless of case', async () => {
    expect((await signUp('dup@example.com')).statusCode).toBe(201);
    const second = await signUp('DUP@example.com');

    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('email_taken');
  });

  it('validates the email and password', async () => {
    expect((await signUp('not-an-email')).statusCode).toBe(400);
    expect((await signUp('short@example.com', 'short')).statusCode).toBe(400);

    const users = await db.query('select 1 from app_user');
    expect(users.rowCount).toBe(0);
  });

  it('carries the anonymous credits and history into the new account', async () => {
    const token = workspaceToken();
    const headers = originHeaders(token);
    await app.inject({ method: 'POST', url: '/api/runs', headers, payload: { tool: 'rotate' } });

    const response = await signUp('carry@example.com', PASSWORD, token);
    expect(response.statusCode).toBe(201);
    // 20 bonus + the 2 anonymous credits left after one run.
    expect(response.json().credits.balance).toBe(22);

    const cookie = sessionCookie(response);
    const history = await app.inject({ method: 'GET', url: '/api/runs', headers: { cookie } });
    expect(history.json().runs).toHaveLength(1);
    expect(history.json().credits.balance).toBe(22);
  });
});

describe('signin', () => {
  it('signs in with the right password', async () => {
    await signUp('member@example.com');
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/signin',
      headers: originHeaders(workspaceToken()),
      payload: { email: 'member@example.com', password: PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe('member@example.com');
    expect(sessionCookie(response)).toMatch(/^pdfstudio_session=/);
  });

  it('answers the same way for a wrong password and an unknown email', async () => {
    await signUp('member@example.com');

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/signin',
      headers: originHeaders(workspaceToken()),
      payload: { email: 'member@example.com', password: 'wrong password' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/auth/signin',
      headers: originHeaders(workspaceToken()),
      payload: { email: 'nobody@example.com', password: 'wrong password' },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json().error.code).toBe('invalid_credentials');
    expect(unknownEmail.json().error.code).toBe('invalid_credentials');
    expect(wrongPassword.json().error.message).toBe(unknownEmail.json().error.message);
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
  });

  it('slows down repeated failures', async () => {
    // The limiter is keyed by email+IP, so this account is used by no other test.
    await signUp('ratelimit@example.com');
    const headers = originHeaders(workspaceToken());
    const payload = { email: 'ratelimit@example.com', password: 'definitely wrong' };

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/signin',
        headers,
        payload,
      });
      expect(response.statusCode).toBe(401);
    }

    const blocked = await app.inject({ method: 'POST', url: '/api/auth/signin', headers, payload });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('too_many_attempts');
  });

  it('does not leak history between accounts', async () => {
    await signUp('a@example.com');
    await signUp('b@example.com');

    const signInB = await app.inject({
      method: 'POST',
      url: '/api/auth/signin',
      headers: originHeaders(workspaceToken()),
      payload: { email: 'b@example.com', password: PASSWORD },
    });

    const history = await app.inject({
      method: 'GET',
      url: '/api/runs',
      headers: { cookie: sessionCookie(signInB) },
    });
    expect(history.json().runs).toHaveLength(0);
    expect(history.json().credits.balance).toBe(20);
  });
});

describe('sign-out', () => {
  it('does not hand out a fresh anonymous allowance each time', async () => {
    const token = workspaceToken();
    const headers = originHeaders(token);
    const signup = await signUp('loop@example.com', PASSWORD, token);
    const cookie = sessionCookie(signup);
    const balanceAfterSignup = (signup.json().credits.balance as number);

    for (let round = 0; round < 2; round += 1) {
      const signedOut = await app.inject({
        method: 'POST',
        url: '/api/auth/signout',
        headers: { ...headers, cookie },
      });
      expect(signedOut.statusCode).toBe(200);

      // Signed out on the same browser: the allowance was already spent.
      const anonymous = await app.inject({ method: 'POST', url: '/api/bootstrap', headers });
      expect(anonymous.json().credits).toMatchObject({ member: false, balance: 0 });

      const signin = await app.inject({
        method: 'POST',
        url: '/api/auth/signin',
        headers,
        payload: { email: 'loop@example.com', password: PASSWORD },
      });
      expect(signin.json().credits.balance).toBe(balanceAfterSignup);
    }
  });
});

describe('account deletion', () => {
  it('removes the account, its wallet and its ledger', async () => {
    const response = await signUp('gone@example.com');
    const cookie = sessionCookie(response);

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: { cookie, 'x-workspace-token': workspaceToken(), origin: 'http://127.0.0.1:5174' },
    });
    expect(deleted.statusCode).toBe(200);

    expect((await db.query('select 1 from app_user')).rowCount).toBe(0);
    expect((await db.query('select 1 from credit_wallet')).rowCount).toBe(0);
    expect((await db.query('select 1 from credit_entry')).rowCount).toBe(0);
  });
});
