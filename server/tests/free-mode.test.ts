import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db.ts';
import {
  closeTestDb,
  createTestApp,
  originHeaders,
  testEnv,
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

async function signUp(
  email = 'free@example.com',
  token = workspaceToken(),
): Promise<Record<string, string>> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    headers: originHeaders(token),
    payload: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  return { ...originHeaders(token), cookie: sessionCookie(response) };
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

describe('free mode (shipped default)', () => {
  it('reports no wallet and a required account on bootstrap', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/bootstrap',
      headers: originHeaders(workspaceToken()),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      credits: null,
      creditsEnabled: false,
      requireSignIn: true,
      recentEntries: [],
    });
  });

  it('does not mount the wallet endpoints', async () => {
    const headers = originHeaders(workspaceToken());
    const read = await app.inject({ method: 'GET', url: '/api/credits', headers });
    expect(read.statusCode).toBe(404);

    const redeem = await app.inject({
      method: 'POST',
      url: '/api/credits/redeem',
      headers,
      payload: { code: 'AAAA-BBBB-CCCC' },
    });
    expect(redeem.statusCode).toBe(404);
  });

  it('refuses a run from a browser with no session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: originHeaders(workspaceToken()),
      payload: { tool: 'rotate' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('sign_in_required');
  });

  it('runs unlimited once signed in, and still records history', async () => {
    const headers = await signUp();

    for (let index = 0; index < 25; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/runs',
        headers,
        payload: { tool: 'crop', params: { run: index } },
      });
      expect(response.statusCode).toBe(201);
    }

    const history = await app.inject({ method: 'GET', url: '/api/runs?limit=100', headers });
    expect(history.json().runs).toHaveLength(25);

    expect((await db.query('select 1 from credit_wallet')).rowCount).toBe(0);
    expect((await db.query('select 1 from credit_entry')).rowCount).toBe(0);
  });
});

describe('credit switch', () => {
  it('brings the wallet and the 402 back with one flag', async () => {
    const created = await createTestApp({
      db,
      env: testEnv({ CREDITS_ENABLED: 'true', REQUIRE_SIGN_IN: 'false' }),
    });

    try {
      const headers = originHeaders(workspaceToken());
      const credits = await created.app.inject({ method: 'GET', url: '/api/credits', headers });
      expect(credits.statusCode).toBe(200);
      expect(credits.json().credits).toMatchObject({ balance: 3, allowance: 3 });

      for (let index = 0; index < 3; index += 1) {
        const started = await created.app.inject({
          method: 'POST',
          url: '/api/runs',
          headers,
          payload: { tool: 'rotate' },
        });
        expect(started.statusCode).toBe(201);
      }

      const blocked = await created.app.inject({
        method: 'POST',
        url: '/api/runs',
        headers,
        payload: { tool: 'rotate' },
      });
      expect(blocked.statusCode).toBe(402);
      expect(blocked.json().error.code).toBe('insufficient_credits');
    } finally {
      await created.app.close();
    }
  });

  it('keeps the sign-in gate when credits come back on', async () => {
    const created = await createTestApp({
      db,
      env: testEnv({ CREDITS_ENABLED: 'true', REQUIRE_SIGN_IN: 'true' }),
    });

    try {
      const response = await created.app.inject({
        method: 'POST',
        url: '/api/runs',
        headers: originHeaders(workspaceToken()),
        payload: { tool: 'rotate' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('sign_in_required');
    } finally {
      await created.app.close();
    }
  });
});
