import type { FastifyInstance } from 'fastify';

import { requireWorkspace, resolveContext, type RequestContext } from '../auth.ts';
import type { Db } from '../db.ts';
import type { Env } from '../env.ts';
import { ApiError, badRequest, isPlainObject, readObjectBody, readString } from '../http.ts';
import { assertQuota, getQuota } from '../quota.ts';

const MAX_PARAMS_BYTES = 8_000;
const STALE_RUN_MINUTES = 10;
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

export type JobRow = {
  id: string;
  tool: string;
  status: string;
  input_name: string | null;
  input_pages: number | null;
  input_bytes: string | null;
  output_name: string | null;
  output_bytes: string | null;
  params: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number | null;
  started_at: Date;
  finished_at: Date | null;
};

function serializeRun(row: JobRow) {
  return {
    id: row.id,
    tool: row.tool,
    status: row.status,
    inputName: row.input_name,
    inputPages: row.input_pages,
    inputBytes: row.input_bytes === null ? null : Number(row.input_bytes),
    outputName: row.output_name,
    outputBytes: row.output_bytes === null ? null : Number(row.output_bytes),
    params: row.params,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    durationMs: row.duration_ms,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
  };
}

/**
 * History is per user when signed in (so it survives a new browser) and per
 * anonymous workspace otherwise.
 */
function scopeFilter(
  context: RequestContext,
  startIndex = 1,
): { sql: string; values: unknown[] } {
  if (context.user) {
    return { sql: `w.user_id = $${startIndex}`, values: [context.user.id] };
  }
  return { sql: `j.workspace_id = $${startIndex}`, values: [requireWorkspace(context)] };
}

async function markStaleRunsAbandoned(db: Db, context: RequestContext): Promise<void> {
  const filter = scopeFilter(context);
  await db.query(
    `update job_run j
        set status = 'abandoned',
            finished_at = now(),
            duration_ms = greatest(0, (extract(epoch from (now() - j.started_at)) * 1000)::int)
       from workspace w
      where w.id = j.workspace_id
        and j.status = 'running'
        and j.started_at < now() - interval '${STALE_RUN_MINUTES} minutes'
        and ${filter.sql}`,
    filter.values,
  );
}

export function registerJobRoutes(app: FastifyInstance, deps: { db: Db; env: Env }): void {
  const { db, env } = deps;

  app.post('/api/runs', async (request, reply) => {
    const context = await resolveContext(db, request);
    const workspaceId = requireWorkspace(context);
    const body = readObjectBody(request.body);

    const tool = readString(body, 'tool', { required: true, maxLength: 60, pattern: /^[a-z0-9-]+$/ });
    const clientRunId = readString(body, 'clientRunId', { maxLength: 80 });
    const input = isPlainObject(body.input) ? body.input : {};
    const params = body.params === undefined ? {} : body.params;
    if (!isPlainObject(params)) throw badRequest('params ต้องเป็น JSON object');
    if (JSON.stringify(params).length > MAX_PARAMS_BYTES) {
      throw badRequest(`params ใหญ่เกิน ${MAX_PARAMS_BYTES} ไบต์`);
    }

    if (clientRunId) {
      const existing = await db.query<JobRow>(
        `select j.* from job_run j where j.workspace_id = $1 and j.client_run_id = $2`,
        [workspaceId, clientRunId],
      );
      const row = existing.rows[0];
      if (row) {
        return { run: serializeRun(row), quota: await getQuota(db, context, env.anonDailyLimit) };
      }
    }

    await assertQuota(db, context, env.anonDailyLimit);

    const inserted = await db.query<JobRow>(
      `insert into job_run (workspace_id, tool, input_name, input_pages, input_bytes, params, client_run_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [
        workspaceId,
        tool,
        readString(input, 'name', { maxLength: 255 }),
        typeof input.pages === 'number' && Number.isFinite(input.pages) ? Math.max(0, Math.round(input.pages)) : null,
        typeof input.bytes === 'number' && Number.isFinite(input.bytes) ? Math.max(0, Math.round(input.bytes)) : null,
        JSON.stringify(params),
        clientRunId,
      ],
    );

    const row = inserted.rows[0];
    if (!row) throw new ApiError(500, 'internal', 'บันทึกงานไม่สำเร็จ');
    reply.code(201);
    return { run: serializeRun(row), quota: await getQuota(db, context, env.anonDailyLimit) };
  });

  app.patch('/api/runs/:id', async (request) => {
    const context = await resolveContext(db, request);
    const { id } = request.params as { id: string };
    const body = readObjectBody(request.body);

    const status = readString(body, 'status', { required: true, maxLength: 20 });
    if (!status || !TERMINAL_STATUSES.has(status)) {
      throw badRequest('status ต้องเป็น succeeded, failed หรือ canceled');
    }

    const output = isPlainObject(body.output) ? body.output : {};
    const error = isPlainObject(body.error) ? body.error : {};

    const filter = scopeFilter(context, 3);
    const succeeded = status === 'succeeded';

    const updated = await db.query<JobRow>(
      `update job_run j
          set status = $2,
              output_name = $4,
              output_bytes = $5,
              error_code = $6,
              error_message = $7,
              finished_at = now(),
              duration_ms = greatest(0, (extract(epoch from (now() - j.started_at)) * 1000)::int)
         from workspace w
        where w.id = j.workspace_id
          and j.id = $1
          and ${filter.sql}
        returning j.*`,
      [
        id,
        status,
        ...filter.values,
        succeeded ? readString(output, 'name', { maxLength: 255 }) : null,
        succeeded && typeof output.bytes === 'number'
          ? Math.max(0, Math.round(output.bytes))
          : null,
        succeeded ? null : readString(error, 'code', { maxLength: 60 }),
        succeeded ? null : readString(error, 'message', { maxLength: 500 }),
      ],
    );

    const row = updated.rows[0];
    if (!row) throw new ApiError(404, 'not_found', 'ไม่พบงานนี้ในพื้นที่ทำงานของคุณ');

    return { run: serializeRun(row), quota: await getQuota(db, context, env.anonDailyLimit) };
  });

  app.get('/api/runs', async (request) => {
    const context = await resolveContext(db, request);
    await markStaleRunsAbandoned(db, context);

    const query = request.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number.parseInt(query.limit ?? '20', 10) || 20, 1), 100);
    const filter = scopeFilter(context);

    const result = await db.query<JobRow>(
      `select j.* from job_run j
         join workspace w on w.id = j.workspace_id
        where ${filter.sql}
        order by j.started_at desc
        limit ${limit}`,
      filter.values,
    );

    return {
      runs: result.rows.map(serializeRun),
      quota: await getQuota(db, context, env.anonDailyLimit),
    };
  });

  app.delete('/api/runs', async (request) => {
    const context = await resolveContext(db, request);
    const filter = scopeFilter(context);
    const deleted = await db.query<{ id: string }>(
      `delete from job_run j using workspace w
        where w.id = j.workspace_id and ${filter.sql}
        returning j.id`,
      filter.values,
    );
    return { deleted: deleted.rowCount ?? 0 };
  });
}
