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

/** Signs up a member and returns headers for that browser + session. */
async function signUp(email = 'runner@example.com'): Promise<Record<string, string>> {
  const token = workspaceToken();
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

describe('health', () => {
  it('reports the database as up', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, db: 'up' });
  });
});

describe('workspace bootstrap', () => {
  it('reports free mode: no wallet and a required account', async () => {
    const token = workspaceToken();
    const response = await app.inject({
      method: 'POST',
      url: '/api/bootstrap',
      headers: originHeaders(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.workspaceId).toMatch(/[0-9a-f-]{36}/);
    expect(body.credits).toBeNull();
    expect(body.recentEntries).toEqual([]);
    expect(body.creditsEnabled).toBe(false);
    expect(body.requireSignIn).toBe(true);
    expect(body.authConfigured).toBe(false);
  });

  it('rejects a token that is too short', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/bootstrap',
      headers: originHeaders('short'),
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a foreign origin on mutations', async () => {
    const token = workspaceToken();
    const response = await app.inject({
      method: 'POST',
      url: '/api/bootstrap',
      headers: { 'x-workspace-token': token, origin: 'http://evil.example' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('forbidden_origin');
  });
});

describe('job runs', () => {
  it('refuses a run without a session and writes nothing', async () => {
    const headers = originHeaders(workspaceToken());
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers,
      payload: { tool: 'rotate' },
    });

    expect(blocked.statusCode).toBe(401);
    expect(blocked.json().error.code).toBe('sign_in_required');

    const runs = await db.query('select 1 from job_run');
    expect(runs.rowCount).toBe(0);
  });

  it('records a run, exposes it in history and finishes it', async () => {
    const headers = await signUp();

    const started = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers,
      payload: { tool: 'rotate', params: { angle: 90 }, input: { name: 'a.pdf', pages: 12 } },
    });

    expect(started.statusCode).toBe(201);
    const runId = started.json().run.id as string;
    expect(started.json().run.status).toBe('running');
    // Free mode: no balance to report, and nothing was charged.
    expect(started.json().credits).toBeNull();

    const finished = await app.inject({
      method: 'PATCH',
      url: `/api/runs/${runId}`,
      headers,
      payload: { status: 'succeeded', output: { name: 'a-rotated.pdf', bytes: 1234 } },
    });

    expect(finished.statusCode).toBe(200);
    expect(finished.json().run.status).toBe('succeeded');
    expect(finished.json().run.outputName).toBe('a-rotated.pdf');
    expect(finished.json().run.durationMs).toBeGreaterThanOrEqual(0);

    const history = await app.inject({ method: 'GET', url: '/api/runs', headers });
    expect(history.statusCode).toBe(200);
    expect(history.json().runs).toHaveLength(1);
    expect(history.json().runs[0].params).toEqual({ angle: 90 });
    expect(history.json().credits).toBeNull();
  });

  it('never charges: ten runs in a row create no wallet or ledger rows', async () => {
    const headers = await signUp();

    for (let index = 0; index < 10; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/runs',
        headers,
        payload: { tool: 'watermark' },
      });
      expect(response.statusCode).toBe(201);
    }

    const runs = await db.query('select 1 from job_run');
    expect(runs.rowCount).toBe(10);
    const wallets = await db.query('select 1 from credit_wallet');
    expect(wallets.rowCount).toBe(0);
    const ledger = await db.query('select 1 from credit_entry');
    expect(ledger.rowCount).toBe(0);
    const owners = await db.query<{ credit_wallet_id: string | null }>(
      'select credit_wallet_id from job_run',
    );
    expect(owners.rows.every((row) => row.credit_wallet_id === null)).toBe(true);
  });

  it('is idempotent for the same client run id', async () => {
    const headers = await signUp();
    const payload = { tool: 'merge', clientRunId: 'tab-1-run-1' };

    const first = await app.inject({ method: 'POST', url: '/api/runs', headers, payload });
    const second = await app.inject({ method: 'POST', url: '/api/runs', headers, payload });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().run.id).toBe(first.json().run.id);

    const runs = await db.query('select 1 from job_run');
    expect(runs.rowCount).toBe(1);
  });

  it('keeps workspaces isolated', async () => {
    const owner = await signUp('owner@example.com');
    const stranger = await signUp('stranger@example.com');

    const started = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: owner,
      payload: { tool: 'merge' },
    });
    const runId = started.json().run.id as string;

    const denied = await app.inject({
      method: 'PATCH',
      url: `/api/runs/${runId}`,
      headers: stranger,
      payload: { status: 'succeeded', output: { name: 'x.pdf' } },
    });
    expect(denied.statusCode).toBe(404);

    const strangerHistory = await app.inject({ method: 'GET', url: '/api/runs', headers: stranger });
    expect(strangerHistory.json().runs).toHaveLength(0);
  });

  it('marks runs abandoned after ten minutes', async () => {
    const headers = await signUp();
    await app.inject({ method: 'POST', url: '/api/runs', headers, payload: { tool: 'rotate' } });

    await db.query(
      "update job_run set started_at = now() - interval '11 minutes' where tool = 'rotate'",
    );

    const history = await app.inject({ method: 'GET', url: '/api/runs', headers });
    expect(history.json().runs[0].status).toBe('abandoned');
    expect(history.json().credits).toBeNull();
  });

  it('drops rows older than the retention window', async () => {
    const headers = await signUp('retention@example.com');

    await app.inject({ method: 'POST', url: '/api/runs', headers, payload: { tool: 'rotate' } });
    await app.inject({ method: 'POST', url: '/api/runs', headers, payload: { tool: 'crop' } });
    await db.query(
      "update job_run set started_at = now() - interval '31 days' where tool = 'rotate'",
    );

    const history = await app.inject({ method: 'GET', url: '/api/runs', headers });
    expect(history.json().retentionDays).toBe(30);
    expect(history.json().runs.map((run: { tool: string }) => run.tool)).toEqual(['crop']);

    const rows = await db.query('select tool from job_run');
    expect(rows.rows).toEqual([{ tool: 'crop' }]);
  });

  it('clears history for the current scope only', async () => {
    const owner = await signUp('clear-a@example.com');
    const other = await signUp('clear-b@example.com');

    await app.inject({ method: 'POST', url: '/api/runs', headers: owner, payload: { tool: 'merge' } });
    await app.inject({ method: 'POST', url: '/api/runs', headers: other, payload: { tool: 'merge' } });

    const cleared = await app.inject({ method: 'DELETE', url: '/api/runs', headers: owner });
    expect(cleared.json().deleted).toBe(1);

    const otherHistory = await app.inject({ method: 'GET', url: '/api/runs', headers: other });
    expect(otherHistory.json().runs).toHaveLength(1);
  });

  it('validates the tool name and params size', async () => {
    const headers = await signUp();

    const badTool = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers,
      payload: { tool: 'Not A Tool' },
    });
    expect(badTool.statusCode).toBe(400);

    const hugeParams = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers,
      payload: { tool: 'rotate', params: { note: 'x'.repeat(9_000) } },
    });
    expect(hugeParams.statusCode).toBe(400);
  });
});
