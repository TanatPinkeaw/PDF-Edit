import type { FastifyInstance } from 'fastify';
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
  it('creates a workspace with the anonymous credits', async () => {
    const token = workspaceToken();
    const response = await app.inject({
      method: 'POST',
      url: '/api/bootstrap',
      headers: originHeaders(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.workspaceId).toMatch(/[0-9a-f-]{36}/);
    expect(body.credits).toMatchObject({ balance: 3, allowance: 3, member: false });
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
  it('records a run, exposes it in history and finishes it', async () => {
    const token = workspaceToken();
    const headers = originHeaders(token);

    const started = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers,
      payload: { tool: 'rotate', params: { angle: 90 }, input: { name: 'a.pdf', pages: 12 } },
    });

    expect(started.statusCode).toBe(201);
    const runId = started.json().run.id as string;
    expect(started.json().run.status).toBe('running');
    expect(started.json().credits.balance).toBe(2);

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
  });

  it('blocks the fourth anonymous run and writes nothing', async () => {
    const token = workspaceToken();
    const headers = originHeaders(token);

    for (let index = 0; index < 3; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/runs',
        headers,
        payload: { tool: 'watermark' },
      });
      expect(response.statusCode).toBe(201);
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers,
      payload: { tool: 'watermark' },
    });

    expect(blocked.statusCode).toBe(402);
    expect(blocked.json().error.code).toBe('insufficient_credits');

    const runs = await db.query('select 1 from job_run');
    expect(runs.rowCount).toBe(3);
    const wallet = await db.query<{ balance: number }>('select balance from credit_wallet');
    expect(wallet.rows[0]?.balance).toBe(0);
  });

  it('refunds the credit when a run fails', async () => {
    const headers = originHeaders(workspaceToken());
    const started = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers,
      payload: { tool: 'merge' },
    });
    expect(started.json().credits.balance).toBe(2);

    const failed = await app.inject({
      method: 'PATCH',
      url: `/api/runs/${started.json().run.id}`,
      headers,
      payload: { status: 'failed', error: { code: 'client_error', message: 'ไฟล์เสีย' } },
    });

    expect(failed.statusCode).toBe(200);
    expect(failed.json().credits.balance).toBe(3);

    // A second PATCH must not refund the same run twice.
    const again = await app.inject({
      method: 'PATCH',
      url: `/api/runs/${started.json().run.id}`,
      headers,
      payload: { status: 'failed', error: { code: 'client_error', message: 'ไฟล์เสีย' } },
    });
    expect(again.json().credits.balance).toBe(3);
  });

  it('is idempotent for the same client run id', async () => {
    const token = workspaceToken();
    const headers = originHeaders(token);
    const payload = { tool: 'merge', clientRunId: 'tab-1-run-1' };

    const first = await app.inject({ method: 'POST', url: '/api/runs', headers, payload });
    const second = await app.inject({ method: 'POST', url: '/api/runs', headers, payload });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().run.id).toBe(first.json().run.id);
    // One credit for one run, even though the request was retried.
    expect(second.json().credits.balance).toBe(2);
  });

  it('keeps workspaces isolated', async () => {
    const owner = originHeaders(workspaceToken());
    const stranger = originHeaders(workspaceToken());

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
    const token = workspaceToken();
    const headers = originHeaders(token);
    await app.inject({ method: 'POST', url: '/api/runs', headers, payload: { tool: 'rotate' } });

    await db.query(
      "update job_run set started_at = now() - interval '11 minutes' where tool = 'rotate'",
    );

    const history = await app.inject({ method: 'GET', url: '/api/runs', headers });
    expect(history.json().runs[0].status).toBe('abandoned');
    // The credit for a run nobody finished comes back.
    expect(history.json().credits.balance).toBe(3);
  });

  it('clears history for the current scope only', async () => {
    const owner = originHeaders(workspaceToken());
    const other = originHeaders(workspaceToken());

    await app.inject({ method: 'POST', url: '/api/runs', headers: owner, payload: { tool: 'merge' } });
    await app.inject({ method: 'POST', url: '/api/runs', headers: other, payload: { tool: 'merge' } });

    const cleared = await app.inject({ method: 'DELETE', url: '/api/runs', headers: owner });
    expect(cleared.json().deleted).toBe(1);

    const otherHistory = await app.inject({ method: 'GET', url: '/api/runs', headers: other });
    expect(otherHistory.json().runs).toHaveLength(1);
  });

  it('validates the tool name and params size', async () => {
    const headers = originHeaders(workspaceToken());

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
