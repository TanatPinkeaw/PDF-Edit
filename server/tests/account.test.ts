import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db.ts';
import {
  closeTestDb,
  createTestApp,
  googleVerifierFor,
  originHeaders,
  truncateAll,
  workspaceToken,
} from './helpers/test-server.ts';

let app: FastifyInstance;
let db: Db;

function sessionCookie(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) throw new Error('ไม่มี Set-Cookie ในคำตอบ');
  return value.split(';')[0] ?? '';
}

beforeAll(async () => {
  const created = await createTestApp({ googleVerifier: googleVerifierFor() });
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

describe('Google sign-in', () => {
  it('signs in, attaches the anonymous workspace and lifts the quota', async () => {
    const token = workspaceToken();
    const headers = originHeaders(token);

    await app.inject({ method: 'POST', url: '/api/runs', headers, payload: { tool: 'rotate' } });

    const signIn = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      headers,
      payload: { credential: 'valid-credential' },
    });

    expect(signIn.statusCode).toBe(200);
    expect(signIn.json().user).toMatchObject({
      email: 'tester@example.com',
      name: 'Tester',
    });
    expect(signIn.json().quota.unlimited).toBe(true);

    const cookie = sessionCookie(signIn);
    expect(cookie).toMatch(/^pdfstudio_session=/);

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('tester@example.com');
    expect(me.json().quota).toMatchObject({ unlimited: true, remaining: null });
    expect(me.json().authConfigured).toBe(true);

    const history = await app.inject({ method: 'GET', url: '/api/runs', headers: { cookie } });
    expect(history.json().runs).toHaveLength(1);

    const workspace = await db.query<{ user_id: string | null }>(
      'select user_id from workspace where user_id is not null',
    );
    expect(workspace.rowCount).toBe(1);
  });

  it('allows more than three runs after signing in', async () => {
    const headers = originHeaders(workspaceToken());
    const signIn = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      headers,
      payload: { credential: 'valid-credential' },
    });
    const cookie = sessionCookie(signIn);

    for (let index = 0; index < 5; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/runs',
        headers: { ...headers, cookie },
        payload: { tool: 'watermark' },
      });
      expect(response.statusCode).toBe(201);
    }
  });

  it('rejects a credential the verifier does not accept', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      headers: originHeaders(workspaceToken()),
      payload: { credential: 'forged' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('returns 503 when no Google client id is configured', async () => {
    const withoutAuth = await createTestApp({ db, googleVerifier: null });
    try {
      const response = await withoutAuth.app.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: originHeaders(workspaceToken()),
        payload: { credential: 'valid-credential' },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('auth_not_configured');
    } finally {
      await withoutAuth.app.close();
    }
  });

  it('signs out and falls back to the anonymous workspace', async () => {
    const token = workspaceToken();
    const headers = originHeaders(token);
    const signIn = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      headers,
      payload: { credential: 'valid-credential' },
    });
    const cookie = sessionCookie(signIn);

    const signOut = await app.inject({
      method: 'POST',
      url: '/api/auth/signout',
      headers: { cookie, 'x-workspace-token': token, origin: 'http://127.0.0.1:5174' },
    });
    expect(signOut.statusCode).toBe(200);

    const me = await app.inject({ method: 'GET', url: '/api/me', headers });
    expect(me.json().user).toBeNull();
    expect(me.json().quota.unlimited).toBe(false);
  });

  it('keeps separate Google accounts separate', async () => {
    const first = await createTestApp({
      db,
      googleVerifier: googleVerifierFor('sub-a', 'a@example.com'),
    });
    const second = await createTestApp({
      db,
      googleVerifier: googleVerifierFor('sub-b', 'b@example.com'),
    });

    try {
      const a = await first.app.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: originHeaders(workspaceToken()),
        payload: { credential: 'valid-credential' },
      });
      const b = await second.app.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: originHeaders(workspaceToken()),
        payload: { credential: 'valid-credential' },
      });

      expect(a.json().user.email).toBe('a@example.com');
      expect(b.json().user.email).toBe('b@example.com');

      const historyA = await first.app.inject({
        method: 'GET',
        url: '/api/runs',
        headers: { cookie: sessionCookie(a) },
      });
      expect(historyA.json().runs).toHaveLength(0);
    } finally {
      await first.app.close();
      await second.app.close();
    }
  });

  it('deletes the account, its workspace and its jobs', async () => {
    const headers = originHeaders(workspaceToken());
    const signIn = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      headers,
      payload: { credential: 'valid-credential' },
    });
    const cookie = sessionCookie(signIn);
    await app.inject({ method: 'POST', url: '/api/runs', headers: { cookie, ...headers }, payload: { tool: 'merge' } });

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: { cookie, ...originHeaders(workspaceToken()) },
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().deletedWorkspaces).toBe(1);

    const users = await db.query('select 1 from app_user');
    expect(users.rowCount).toBe(0);
    const jobs = await db.query('select 1 from job_run');
    expect(jobs.rowCount).toBe(0);
  });
});
