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

describe('presets', () => {
  it('creates, lists and upserts a preset by name', async () => {
    const headers = originHeaders(workspaceToken());

    const created = await app.inject({
      method: 'POST',
      url: '/api/presets',
      headers,
      payload: { tool: 'watermark', name: 'บริษัท', params: { text: 'CONFIDENTIAL', opacity: 0.2 } },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().preset.name).toBe('บริษัท');

    const updated = await app.inject({
      method: 'POST',
      url: '/api/presets',
      headers,
      payload: { tool: 'watermark', name: 'บริษัท', params: { text: 'INTERNAL', opacity: 0.1 } },
    });

    expect(updated.statusCode).toBe(201);
    expect(updated.json().preset.id).toBe(created.json().preset.id);
    expect(updated.json().preset.params).toEqual({ text: 'INTERNAL', opacity: 0.1 });

    const list = await app.inject({ method: 'GET', url: '/api/presets?tool=watermark', headers });
    expect(list.json().presets).toHaveLength(1);
  });

  it('filters by tool', async () => {
    const headers = originHeaders(workspaceToken());
    await app.inject({
      method: 'POST',
      url: '/api/presets',
      headers,
      payload: { tool: 'watermark', name: 'A', params: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/api/presets',
      headers,
      payload: { tool: 'page-numbers', name: 'B', params: {} },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/api/presets?tool=page-numbers',
      headers,
    });

    expect(list.json().presets).toHaveLength(1);
    expect(list.json().presets[0].tool).toBe('page-numbers');
  });

  it('does not show presets to another workspace', async () => {
    const owner = originHeaders(workspaceToken());
    await app.inject({
      method: 'POST',
      url: '/api/presets',
      headers: owner,
      payload: { tool: 'watermark', name: 'secret', params: {} },
    });

    const stranger = await app.inject({
      method: 'GET',
      url: '/api/presets',
      headers: originHeaders(workspaceToken()),
    });

    expect(stranger.json().presets).toHaveLength(0);
  });

  it('deletes only its own preset', async () => {
    const headers = originHeaders(workspaceToken());
    const created = await app.inject({
      method: 'POST',
      url: '/api/presets',
      headers,
      payload: { tool: 'rotate', name: 'turn', params: { angle: 90 } },
    });
    const id = created.json().preset.id as string;

    const strangerDelete = await app.inject({
      method: 'DELETE',
      url: `/api/presets/${id}`,
      headers: originHeaders(workspaceToken()),
    });
    expect(strangerDelete.statusCode).toBe(404);

    const deleted = await app.inject({ method: 'DELETE', url: `/api/presets/${id}`, headers });
    expect(deleted.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: '/api/presets', headers });
    expect(list.json().presets).toHaveLength(0);
  });

  it('rejects a missing name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/presets',
      headers: originHeaders(workspaceToken()),
      payload: { tool: 'watermark', params: {} },
    });
    expect(response.statusCode).toBe(400);
  });
});
