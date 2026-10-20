import { PDFDocument } from '@cantoo/pdf-lib';
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

async function pdfBase64(pageCount = 2): Promise<{ base64: string; bytes: Buffer }> {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) doc.addPage([200, 300]);
  const bytes = Buffer.from(await doc.save());
  return { base64: bytes.toString('base64'), bytes };
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

describe('share links', () => {
  it('uploads, describes and serves the exact bytes', async () => {
    const headers = originHeaders(workspaceToken());
    const { base64, bytes } = await pdfBase64(3);

    const created = await app.inject({
      method: 'POST',
      url: '/api/shares',
      headers,
      payload: { fileName: 'รายงาน.pdf', mimeType: 'application/pdf', dataBase64: base64 },
    });

    expect(created.statusCode).toBe(201);
    const token = created.json().token as string;
    expect(created.json().byteSize).toBe(bytes.byteLength);
    expect(created.json().expiresAt).toBeTruthy();

    const meta = await app.inject({ method: 'GET', url: `/api/shares/${token}` });
    expect(meta.statusCode).toBe(200);
    expect(meta.json().fileName).toBe('รายงาน.pdf');
    expect(meta.json().expired).toBe(false);

    const file = await app.inject({ method: 'GET', url: `/api/shares/${token}/file` });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.rawPayload.equals(bytes)).toBe(true);

    const after = await app.inject({ method: 'GET', url: `/api/shares/${token}` });
    expect(after.json().downloadCount).toBe(1);
  });

  it('returns 410 once the link expires', async () => {
    const headers = originHeaders(workspaceToken());
    const { base64 } = await pdfBase64(1);
    const created = await app.inject({
      method: 'POST',
      url: '/api/shares',
      headers,
      payload: { fileName: 'a.pdf', mimeType: 'application/pdf', dataBase64: base64 },
    });
    const token = created.json().token as string;

    await db.query("update share_link set expires_at = now() - interval '1 hour' where token = $1", [
      token,
    ]);

    const meta = await app.inject({ method: 'GET', url: `/api/shares/${token}` });
    expect(meta.statusCode).toBe(410);

    const file = await app.inject({ method: 'GET', url: `/api/shares/${token}/file` });
    expect(file.statusCode).toBe(410);
  });

  it('rejects unsupported types and oversized files', async () => {
    const headers = originHeaders(workspaceToken());

    const wrongType = await app.inject({
      method: 'POST',
      url: '/api/shares',
      headers,
      payload: { fileName: 'x.exe', mimeType: 'application/x-msdownload', dataBase64: 'AAAA' },
    });
    expect(wrongType.statusCode).toBe(400);

    const oversized = Buffer.alloc(1_100_000, 7).toString('base64');
    const tooBig = await app.inject({
      method: 'POST',
      url: '/api/shares',
      headers,
      payload: { fileName: 'big.pdf', mimeType: 'application/pdf', dataBase64: oversized },
    });
    expect(tooBig.statusCode).toBe(413);
  });

  it('requires a workspace token', async () => {
    const { base64 } = await pdfBase64(1);
    const response = await app.inject({
      method: 'POST',
      url: '/api/shares',
      payload: { fileName: 'a.pdf', mimeType: 'application/pdf', dataBase64: base64 },
    });
    expect(response.statusCode).toBe(401);
  });

  it('deletes a link only for its owner', async () => {
    const headers = originHeaders(workspaceToken());
    const { base64 } = await pdfBase64(1);
    const created = await app.inject({
      method: 'POST',
      url: '/api/shares',
      headers,
      payload: { fileName: 'a.pdf', mimeType: 'application/pdf', dataBase64: base64 },
    });
    const token = created.json().token as string;

    const stranger = await app.inject({
      method: 'DELETE',
      url: `/api/shares/${token}`,
      headers: originHeaders(workspaceToken()),
    });
    expect(stranger.statusCode).toBe(404);

    const owner = await app.inject({ method: 'DELETE', url: `/api/shares/${token}`, headers });
    expect(owner.statusCode).toBe(200);

    const gone = await app.inject({ method: 'GET', url: `/api/shares/${token}` });
    expect(gone.statusCode).toBe(404);
  });
});
