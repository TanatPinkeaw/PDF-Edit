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
  it('creates an account and a session without opening a wallet', async () => {
    const response = await signUp('New@Example.com');

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user).toMatchObject({ email: 'new@example.com', name: 'คุณใหม่' });
    expect(body.credits).toBeNull();
    expect(body.recentEntries).toEqual([]);
    expect(body.creditsEnabled).toBe(false);

    const cookie = sessionCookie(response);
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.json().user.email).toBe('new@example.com');
    expect(me.json().credits).toBeNull();
    expect((await db.query('select 1 from credit_wallet')).rowCount).toBe(0);
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

  it('adopts the browser workspace so history follows the account', async () => {
    const token = workspaceToken();

    const response = await signUp('carry@example.com', PASSWORD, token);
    expect(response.statusCode).toBe(201);
    expect(response.json().credits).toBeNull();

    const cookie = sessionCookie(response);
    const started = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: { ...originHeaders(token), cookie },
      payload: { tool: 'rotate' },
    });
    expect(started.statusCode).toBe(201);

    const history = await app.inject({ method: 'GET', url: '/api/runs', headers: { cookie } });
    expect(history.json().runs).toHaveLength(1);
    expect(history.json().credits).toBeNull();
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
    expect(history.json().credits).toBeNull();
  });
});

describe('sign-out', () => {
  it('keeps the account intact and never mints a wallet on the way out', async () => {
    const token = workspaceToken();
    const headers = originHeaders(token);
    const signup = await signUp('loop@example.com', PASSWORD, token);
    const cookie = sessionCookie(signup);

    for (let round = 0; round < 2; round += 1) {
      const signedOut = await app.inject({
        method: 'POST',
        url: '/api/auth/signout',
        headers: { ...headers, cookie },
      });
      expect(signedOut.statusCode).toBe(200);

      const anonymous = await app.inject({ method: 'POST', url: '/api/bootstrap', headers });
      expect(anonymous.json().user).toBeNull();
      expect(anonymous.json().credits).toBeNull();

      const signin = await app.inject({
        method: 'POST',
        url: '/api/auth/signin',
        headers,
        payload: { email: 'loop@example.com', password: PASSWORD },
      });
      expect(signin.statusCode).toBe(200);
      expect(signin.json().credits).toBeNull();
    }

    expect((await db.query('select 1 from credit_wallet')).rowCount).toBe(0);
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
