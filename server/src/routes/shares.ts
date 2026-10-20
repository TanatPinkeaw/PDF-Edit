import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { newToken, requireWorkspace, resolveContext } from '../auth.ts';
import type { Db } from '../db.ts';
import type { Env } from '../env.ts';
import { ApiError, badRequest, readObjectBody, readString } from '../http.ts';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/zip',
]);
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

type ShareRow = {
  token: string;
  file_name: string;
  mime_type: string;
  byte_size: string;
  sha256: string;
  expires_at: Date;
  created_at: Date;
  download_count: number;
  artifact_id: string;
};

function decodeBase64(raw: string): Uint8Array {
  const cleaned = raw.replace(/\s+/g, '');
  if (cleaned === '' || !BASE64_PATTERN.test(cleaned)) {
    throw badRequest('dataBase64 ไม่ใช่ base64 ที่ถูกต้อง');
  }
  return new Uint8Array(Buffer.from(cleaned, 'base64'));
}

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim();
  return cleaned === '' ? 'document' : cleaned.slice(0, 200);
}

/** Removes artifacts whose last share link expired more than a day ago. */
async function purgeExpiredArtifacts(db: Db): Promise<void> {
  await db.query(
    `delete from artifact a
      where not exists (select 1 from share_link s where s.artifact_id = a.id)
        and a.created_at < now() - interval '8 days'`,
  );
}

export function registerShareRoutes(app: FastifyInstance, deps: { db: Db; env: Env }): void {
  const { db, env } = deps;

  app.post('/api/shares', async (request, reply) => {
    const context = await resolveContext(db, request);
    const workspaceId = requireWorkspace(context);
    const body = readObjectBody(request.body);

    const fileName = sanitizeName(
      readString(body, 'fileName', { required: true, maxLength: 200 }) ?? 'document',
    );
    const mimeType = readString(body, 'mimeType', { required: true, maxLength: 80 }) ?? '';
    if (!ALLOWED_MIME.has(mimeType)) {
      throw badRequest(`ไม่รองรับการแชร์ไฟล์ชนิด ${mimeType}`);
    }

    const dataBase64 = readString(body, 'dataBase64', { required: true });
    const bytes = decodeBase64(dataBase64 ?? '');
    if (bytes.byteLength === 0) throw badRequest('ไฟล์ว่างเปล่า');
    if (bytes.byteLength > env.shareMaxBytes) {
      throw new ApiError(
        413,
        'stream_too_large',
        `ไฟล์ใหญ่เกิน ${Math.round(env.shareMaxBytes / 1024 / 1024)} MB — ลดขนาดก่อนแชร์`,
      );
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const expiresAt = new Date(Date.now() + env.shareTtlDays * 24 * 60 * 60 * 1000);
    const token = newToken(18);

    const artifact = await db.query<{ id: string }>(
      `insert into artifact (workspace_id, file_name, mime_type, byte_size, sha256, content)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [workspaceId, fileName, mimeType, bytes.byteLength, sha256, Buffer.from(bytes)],
    );
    const artifactId = artifact.rows[0]?.id;
    if (!artifactId) throw new ApiError(500, 'internal', 'บันทึกไฟล์ไม่สำเร็จ');

    await db.query(
      `insert into share_link (workspace_id, artifact_id, token, expires_at)
       values ($1, $2, $3, $4)`,
      [workspaceId, artifactId, token, expiresAt.toISOString()],
    );

    void purgeExpiredArtifacts(db).catch(() => undefined);

    reply.code(201);
    return {
      token,
      fileName,
      mimeType,
      byteSize: bytes.byteLength,
      sha256,
      expiresAt: expiresAt.toISOString(),
      url: `/#/s/${token}`,
    };
  });

  app.get('/api/shares/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const result = await db.query<ShareRow>(
      `select s.token, s.expires_at, s.created_at, s.download_count, s.artifact_id,
              a.file_name, a.mime_type, a.byte_size, a.sha256
         from share_link s
         join artifact a on a.id = s.artifact_id
        where s.token = $1`,
      [token],
    );

    const row = result.rows[0];
    if (!row) throw new ApiError(404, 'not_found', 'ไม่พบลิงก์นี้ หรือถูกลบไปแล้ว');

    const expired = row.expires_at.getTime() <= Date.now();
    const payload = {
      token: row.token,
      fileName: row.file_name,
      mimeType: row.mime_type,
      byteSize: Number(row.byte_size),
      sha256: row.sha256,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      downloadCount: row.download_count,
      expired,
    };

    if (expired) {
      reply.code(410);
      return { error: { code: 'gone', message: 'ลิงก์นี้หมดอายุแล้ว', ...payload } };
    }
    reply.header('cache-control', 'private, no-store');
    return payload;
  });

  app.get('/api/shares/:token/file', async (request, reply) => {
    const { token } = request.params as { token: string };
    const result = await db.query<ShareRow>(
      `select s.token, s.expires_at, s.created_at, s.download_count, s.artifact_id,
              a.file_name, a.mime_type, a.byte_size, a.sha256, a.content
         from share_link s
         join artifact a on a.id = s.artifact_id
        where s.token = $1`,
      [token],
    );

    const row = result.rows[0] as (ShareRow & { content: Buffer }) | undefined;
    if (!row) throw new ApiError(404, 'not_found', 'ไม่พบลิงก์นี้ หรือถูกลบไปแล้ว');
    if (row.expires_at.getTime() <= Date.now()) {
      throw new ApiError(410, 'gone', 'ลิงก์นี้หมดอายุแล้ว');
    }

    await db.query('update share_link set download_count = download_count + 1 where token = $1', [
      token,
    ]);

    const encodedName = encodeURIComponent(row.file_name);
    reply
      .header('content-type', row.mime_type)
      .header('content-length', String(row.byte_size))
      .header('content-disposition', `attachment; filename*=UTF-8''${encodedName}`)
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff');
    return reply.send(row.content);
  });

  app.delete('/api/shares/:token', async (request) => {
    const context = await resolveContext(db, request);
    const { token } = request.params as { token: string };

    const workspaceId = context.workspaceId;
    const deleted = await db.query<{ id: string }>(
      context.user
        ? `delete from share_link s
             using workspace w
            where w.id = s.workspace_id and s.token = $1 and w.user_id = $2
            returning s.id`
        : `delete from share_link s where s.token = $1 and s.workspace_id = $2 returning s.id`,
      context.user ? [token, context.user.id] : [token, workspaceId ?? ''],
    );

    if (deleted.rowCount === 0) throw new ApiError(404, 'not_found', 'ไม่พบลิงก์นี้');
    return { deleted: 1 };
  });
}
