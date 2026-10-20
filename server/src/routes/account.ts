import type { FastifyInstance } from 'fastify';

import {
  SESSION_COOKIE,
  attachWorkspaceToUser,
  clearSessionCookie,
  createSession,
  deleteSession,
  requireWorkspace,
  resolveContext,
  setSessionCookie,
  upsertUser,
  type GoogleVerifier,
} from '../auth.ts';
import type { Db } from '../db.ts';
import type { Env } from '../env.ts';
import { ApiError, readObjectBody, readString } from '../http.ts';
import { getQuota } from '../quota.ts';

export function registerAccountRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: Env; googleVerifier: GoogleVerifier | null },
): void {
  const { db, env, googleVerifier } = deps;

  const state = async (context: Awaited<ReturnType<typeof resolveContext>>) => ({
    workspaceId: context.workspaceId,
    user: context.user,
    quota: await getQuota(db, context, env.anonDailyLimit),
    authConfigured: googleVerifier !== null,
    googleClientId: env.googleClientId,
  });

  app.post('/api/bootstrap', async (request) => {
    const context = await resolveContext(db, request);
    requireWorkspace(context);
    return state(context);
  });

  app.get('/api/me', async (request) => {
    const context = await resolveContext(db, request);
    if (!context.user && !context.workspaceId) {
      throw new ApiError(401, 'unauthorized', 'ยังไม่มี workspace หรือ session');
    }
    return state(context);
  });

  app.post('/api/auth/google', async (request, reply) => {
    if (!googleVerifier) {
      throw new ApiError(
        503,
        'auth_not_configured',
        'ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID — เพิ่มใน .env แล้วรีสตาร์ท API',
      );
    }

    const context = await resolveContext(db, request);
    const body = readObjectBody(request.body);
    const credential = readString(body, 'credential', { required: true, maxLength: 5_000 });

    const profile = await googleVerifier(credential ?? '');
    const user = await upsertUser(db, profile);

    if (context.workspaceId) {
      await attachWorkspaceToUser(db, context.workspaceId, user.id);
    }

    const session = await createSession(db, user.id, env.sessionTtlDays);
    setSessionCookie(reply, session.token, session.expiresAt, env.isProduction);

    return { user, quota: { unlimited: true, limit: null, used: 0, remaining: null, resetAt: null } };
  });

  app.post('/api/auth/signout', async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    clearSessionCookie(reply, env.isProduction);
    return { ok: true };
  });

  app.delete('/api/me', async (request, reply) => {
    const context = await resolveContext(db, request);
    if (!context.user && !context.workspaceId) {
      throw new ApiError(401, 'unauthorized', 'ไม่มีข้อมูลให้ลบ');
    }

    let deletedWorkspaces = 0;
    if (context.user) {
      const result = await db.query<{ id: string }>(
        'delete from workspace where user_id = $1 returning id',
        [context.user.id],
      );
      deletedWorkspaces = result.rowCount ?? 0;
      await db.query('delete from app_user where id = $1', [context.user.id]);
    } else if (context.workspaceId) {
      const result = await db.query<{ id: string }>('delete from workspace where id = $1 returning id', [
        context.workspaceId,
      ]);
      deletedWorkspaces = result.rowCount ?? 0;
    }

    clearSessionCookie(reply, env.isProduction);
    return { deletedWorkspaces };
  });
}
