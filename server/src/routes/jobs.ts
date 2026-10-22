import type { FastifyInstance } from 'fastify';

import { requireWorkspace, resolveContext, type RequestContext } from '../auth.ts';
import { getCredits, insertChargedRun, openWallet, refundRunCredits } from '../credits.ts';
import type { Db } from '../db.ts';
import type { Env } from '../env.ts';
import { ApiError, badRequest, isPlainObject, readObjectBody, readString } from '../http.ts';
import type { Mailer } from '../mail.ts';
import { assertCanSpendCredits } from '../verification.ts';

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
  credit_wallet_id: string | null;
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

/**
 * Runs left `running` by a closed tab are marked abandoned and refunded, so a
 * crash does not silently eat a credit.
 */
async function markStaleRunsAbandoned(db: Db, context: RequestContext): Promise<void> {
  const filter = scopeFilter(context);
  const stale = await db.query<{ id: string; credit_wallet_id: string | null }>(
    `select j.id, j.credit_wallet_id
       from job_run j
       join workspace w on w.id = j.workspace_id
      where j.status = 'running'
        and j.started_at < now() - interval '${STALE_RUN_MINUTES} minutes'
        and ${filter.sql}`,
    filter.values,
  );
  if (stale.rows.length === 0) return;

  await db.query(
    `update job_run j
        set status = 'abandoned',
            finished_at = now(),
            duration_ms = greatest(0, (extract(epoch from (now() - j.started_at)) * 1000)::int)
      where j.id = any($1::uuid[])`,
    [stale.rows.map((row) => row.id)],
  );

  for (const row of stale.rows) {
    if (row.credit_wallet_id) {
      await refundRunCredits(db, row.credit_wallet_id, row.id, 'งานค้างเกิน 10 นาที');
    }
  }
}

export function registerJobRoutes(app: FastifyInstance, deps: { db: Db; env: Env; mailer: Mailer }): void {
  const { db, env, mailer } = deps;

  const grantFor = (context: RequestContext) =>
    context.user
      ? { credits: env.signupBonusCredits, reason: 'signup_bonus' as const }
      : { credits: env.anonCredits, reason: 'anon_grant' as const };

  /** Null while credits are shelved, so the browser knows not to show a wallet. */
  const creditsFor = (context: RequestContext) =>
    env.creditsEnabled
      ? getCredits(db, context, {
          signupBonus: env.signupBonusCredits,
          anonCredits: env.anonCredits,
        })
      : Promise.resolve(null);

  app.post('/api/runs', async (request, reply) => {
    const context = await resolveContext(db, request);
    const workspaceId = requireWorkspace(context);
    // Credits are shelved, so the account itself is the product gate.
    if (env.requireSignIn && !context.user) {
      throw new ApiError(401, 'sign_in_required', 'เข้าสู่ระบบก่อนใช้เครื่องมือ — ใช้ฟรีไม่จำกัด');
    }
    // Only the wallet-bearing mode needs a proved mailbox.
    if (env.creditsEnabled) await assertCanSpendCredits(db, mailer, context);
    const body = readObjectBody(request.body);

    const tool = readString(body, 'tool', { required: true, maxLength: 60, pattern: /^[a-z0-9-]+$/ });
    const clientRunId = readString(body, 'clientRunId', { maxLength: 80 });
    const input = isPlainObject(body.input) ? body.input : {};
    const params = body.params === undefined ? {} : body.params;
    if (!isPlainObject(params)) throw badRequest('params ต้องเป็น JSON object');
    if (JSON.stringify(params).length > MAX_PARAMS_BYTES) {
      throw badRequest(`params ใหญ่เกิน ${MAX_PARAMS_BYTES} ไบต์`);
    }

    // Retrying a request must not charge a second credit for the same run.
    if (clientRunId) {
      const existing = await db.query<JobRow>(
        `select j.* from job_run j where j.workspace_id = $1 and j.client_run_id = $2`,
        [workspaceId, clientRunId],
      );
      const row = existing.rows[0];
      if (row) {
        return { run: serializeRun(row), credits: await creditsFor(context) };
      }
    }

    const runValues = [
      workspaceId,
      tool,
      readString(input, 'name', { maxLength: 255 }),
      typeof input.pages === 'number' && Number.isFinite(input.pages)
        ? Math.max(0, Math.round(input.pages))
        : null,
      typeof input.bytes === 'number' && Number.isFinite(input.bytes)
        ? Math.max(0, Math.round(input.bytes))
        : null,
      JSON.stringify(params),
      clientRunId,
    ];

    reply.code(201);

    if (!env.creditsEnabled) {
      // Free mode: record the history row only, never touching a wallet.
      const inserted = await db.query<JobRow>(
        `insert into job_run
           (workspace_id, tool, input_name, input_pages, input_bytes, params, client_run_id)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning *`,
        runValues,
      );
      const row = inserted.rows[0];
      if (!row) throw new ApiError(500, 'internal', 'บันทึกงานไม่สำเร็จ');
      return { run: serializeRun(row), credits: null };
    }

    const wallet = await openWallet(db, context, grantFor(context));

    const { run } = await insertChargedRun(db, wallet.id, async (client) => {
      const inserted = await client.query<JobRow>(
        `insert into job_run
           (workspace_id, tool, input_name, input_pages, input_bytes, params, client_run_id, credit_wallet_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning *`,
        [...runValues, wallet.id],
      );
      const row = inserted.rows[0];
      if (!row) throw new ApiError(500, 'internal', 'บันทึกงานไม่สำเร็จ');
      return { run: row, runId: row.id };
    });

    return { run: serializeRun(run), credits: await creditsFor(context) };
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

    if (!succeeded && row.credit_wallet_id) {
      await refundRunCredits(db, row.credit_wallet_id, row.id, 'งานไม่สำเร็จ — คืนเครดิต');
    }

    return { run: serializeRun(row), credits: await creditsFor(context) };
  });

  app.get('/api/runs', async (request) => {
    const context = await resolveContext(db, request);
    // The history window is global: anything older than the retention is gone
    // for every workspace. credit_entry keeps its row with a null link.
    await db.query(
      'delete from job_run where started_at < now() - make_interval(days => $1)',
      [env.historyTtlDays],
    );
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
      retentionDays: env.historyTtlDays,
      credits: await creditsFor(context),
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
