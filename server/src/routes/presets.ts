import type { FastifyInstance } from 'fastify';

import { requireWorkspace, resolveContext, type RequestContext } from '../auth.ts';
import type { Db } from '../db.ts';
import { ApiError, badRequest, isPlainObject, readObjectBody, readString } from '../http.ts';

const MAX_PARAMS_BYTES = 8_000;

type PresetRow = {
  id: string;
  tool: string;
  name: string;
  params: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

function serialize(row: PresetRow) {
  return {
    id: row.id,
    tool: row.tool,
    name: row.name,
    params: row.params,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function scopeFilter(context: RequestContext, startIndex = 1): { sql: string; values: unknown[] } {
  if (context.user) {
    return { sql: `w.user_id = $${startIndex}`, values: [context.user.id] };
  }
  return { sql: `p.workspace_id = $${startIndex}`, values: [requireWorkspace(context)] };
}

export function registerPresetRoutes(app: FastifyInstance, deps: { db: Db }): void {
  const { db } = deps;

  app.get('/api/presets', async (request) => {
    const context = await resolveContext(db, request);
    const query = request.query as Record<string, string | undefined>;
    const filter = scopeFilter(context, 1);
    const tool = query.tool?.trim();

    const params: unknown[] = [...filter.values];
    let toolClause = '';
    if (tool) {
      params.push(tool);
      toolClause = ` and p.tool = $${params.length}`;
    }

    const result = await db.query<PresetRow>(
      `select p.* from preset p
         join workspace w on w.id = p.workspace_id
        where ${filter.sql}${toolClause}
        order by p.updated_at desc
        limit 100`,
      params,
    );

    return { presets: result.rows.map(serialize) };
  });

  app.post('/api/presets', async (request, reply) => {
    const context = await resolveContext(db, request);
    const workspaceId = requireWorkspace(context);
    const body = readObjectBody(request.body);

    const tool = readString(body, 'tool', { required: true, maxLength: 60, pattern: /^[a-z0-9-]+$/ });
    const name = readString(body, 'name', { required: true, maxLength: 80 });
    if (!isPlainObject(body.params)) throw badRequest('params ต้องเป็น JSON object');
    if (JSON.stringify(body.params).length > MAX_PARAMS_BYTES) {
      throw badRequest(`params ใหญ่เกิน ${MAX_PARAMS_BYTES} ไบต์`);
    }

    const result = await db.query<PresetRow>(
      `insert into preset (workspace_id, tool, name, params)
       values ($1, $2, $3, $4)
       on conflict (workspace_id, tool, name) do update
         set params = excluded.params, updated_at = now()
       returning *`,
      [workspaceId, tool, name, JSON.stringify(body.params)],
    );

    const row = result.rows[0];
    if (!row) throw new ApiError(500, 'internal', 'บันทึกพรีเซ็ตไม่สำเร็จ');
    reply.code(201);
    return { preset: serialize(row) };
  });

  app.delete('/api/presets/:id', async (request) => {
    const context = await resolveContext(db, request);
    const { id } = request.params as { id: string };
    const filter = scopeFilter(context, 2);

    const deleted = await db.query<{ id: string }>(
      `delete from preset p using workspace w
        where w.id = p.workspace_id and p.id = $1 and ${filter.sql}
        returning p.id`,
      [id, ...filter.values],
    );

    if (deleted.rowCount === 0) throw new ApiError(404, 'not_found', 'ไม่พบพรีเซ็ตนี้');
    return { deleted: 1 };
  });
}
