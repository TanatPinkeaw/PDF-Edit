/**
 * Anonymous workspaces get a small number of recorded runs per rolling 24h.
 * Signed-in users are unlimited. The browser does the PDF work, so this is a
 * soft product gate rather than a hard security boundary.
 */

import type { RequestContext } from './auth.ts';
import { requireWorkspace } from './auth.ts';
import type { Db } from './db.ts';
import { ApiError } from './http.ts';

export type Quota = {
  unlimited: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: string | null;
};

export const UNLIMITED_QUOTA: Quota = {
  unlimited: true,
  limit: null,
  used: 0,
  remaining: null,
  resetAt: null,
};

export async function getQuota(db: Db, context: RequestContext, limit: number): Promise<Quota> {
  if (context.user) return { ...UNLIMITED_QUOTA };
  const workspaceId = requireWorkspace(context);

  const result = await db.query<{ used: string; oldest: Date | null }>(
    `select count(*)::text as used, min(started_at) as oldest
       from job_run
      where workspace_id = $1 and started_at > now() - interval '24 hours'`,
    [workspaceId],
  );

  const used = Number.parseInt(result.rows[0]?.used ?? '0', 10);
  const oldest = result.rows[0]?.oldest ?? null;
  const resetAt = oldest ? new Date(oldest.getTime() + 24 * 60 * 60 * 1000).toISOString() : null;

  return {
    unlimited: false,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetAt: used >= limit ? resetAt : null,
  };
}

export async function assertQuota(
  db: Db,
  context: RequestContext,
  limit: number,
): Promise<Quota> {
  const quota = await getQuota(db, context, limit);
  if (!quota.unlimited && quota.remaining === 0) {
    throw new ApiError(
      429,
      'quota_exceeded',
      `ใช้ครบ ${limit} ครั้งใน 24 ชั่วโมงแล้ว — เข้าสู่ระบบด้วย Google เพื่อใช้งานไม่จำกัด`,
      { quota },
    );
  }
  return quota;
}
