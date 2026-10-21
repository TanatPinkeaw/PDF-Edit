/**
 * Credits replace the old anonymous daily quota: every recorded run costs one
 * credit, a failed or abandoned run is refunded once, and members can be topped
 * up by an admin or a redeem code.
 *
 * The browser still does all the PDF work, so this is a product gate rather
 * than a security boundary — but the balance itself is enforced by the
 * database, so two tabs cannot spend the same credit twice.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';

import { requireWorkspace, type RequestContext } from './auth.ts';
import type { Db } from './db.ts';
import { ApiError } from './http.ts';

export type Credits = {
  balance: number;
  /** Anonymous browsers only: the one-off allowance the wallet started with. */
  allowance: number | null;
  member: boolean;
};

export type CreditReason =
  | 'anon_grant'
  | 'signup_bonus'
  | 'run'
  | 'refund'
  | 'redeem'
  | 'admin'
  | 'merge';

export type CreditEntryRecord = {
  id: string;
  delta: number;
  reason: CreditReason;
  note: string | null;
  balanceAfter: number;
  jobRunId: string | null;
  createdAt: string;
};

export type Wallet = { id: string; balance: number };

export type CreditConfig = { signupBonus: number; anonCredits: number };

type Owner = { column: 'user_id' | 'workspace_id'; id: string };

function ownerOf(context: RequestContext): Owner {
  if (context.user) return { column: 'user_id', id: context.user.id };
  return { column: 'workspace_id', id: requireWorkspace(context) };
}

export function ownerOfUser(userId: string): Owner {
  return { column: 'user_id', id: userId };
}

async function insertEntry(
  client: PoolClient,
  entry: {
    walletId: string;
    delta: number;
    reason: CreditReason;
    balanceAfter: number;
    jobRunId?: string | null;
    note?: string | null;
  },
): Promise<void> {
  await client.query(
    `insert into credit_entry (wallet_id, delta, reason, job_run_id, note, balance_after)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      entry.walletId,
      entry.delta,
      entry.reason,
      entry.jobRunId ?? null,
      entry.note ?? null,
      entry.balanceAfter,
    ],
  );
}

/**
 * Finds (or creates) the wallet for this caller. A brand-new wallet is topped
 * up with its one-time grant inside the same transaction, so a double request
 * cannot hand out the bonus twice.
 */
export async function openWallet(
  db: Db,
  context: RequestContext,
  grant: { credits: number; reason: 'signup_bonus' | 'anon_grant' },
): Promise<Wallet> {
  const owner = ownerOf(context);
  return openWalletFor(db, owner, grant);
}

/**
 * The anonymous allowance belongs to the workspace for good: signing out and
 * back in must not mint a new one. Member wallets are unique rows, so the row
 * itself is the guard there.
 */
async function claimGrant(client: PoolClient, owner: Owner): Promise<boolean> {
  if (owner.column !== 'workspace_id') return true;
  const claimed = await client.query(
    'update workspace set anon_granted_at = now() where id = $1 and anon_granted_at is null returning id',
    [owner.id],
  );
  return (claimed.rowCount ?? 0) > 0;
}

async function openWalletFor(
  db: Db,
  owner: Owner,
  grant: { credits: number; reason: CreditReason },
): Promise<Wallet> {
  const client = await db.pool.connect();
  try {
    await client.query('begin');

    const inserted = await client.query<Wallet>(
      `insert into credit_wallet (${owner.column}) values ($1)
       on conflict do nothing
       returning id, balance`,
      [owner.id],
    );

    let wallet = inserted.rows[0];
    if (!wallet) {
      const existing = await client.query<Wallet>(
        `select id, balance from credit_wallet where ${owner.column} = $1 for update`,
        [owner.id],
      );
      wallet = existing.rows[0];
    } else if (grant.credits > 0 && (await claimGrant(client, owner))) {
      const granted = await client.query<{ balance: number }>(
        `update credit_wallet set balance = $2, updated_at = now() where id = $1 returning balance`,
        [wallet.id, grant.credits],
      );
      const balance = granted.rows[0]?.balance ?? grant.credits;
      await insertEntry(client, {
        walletId: wallet.id,
        delta: grant.credits,
        reason: grant.reason,
        balanceAfter: balance,
      });
      wallet = { id: wallet.id, balance };
    }

    await client.query('commit');
    if (!wallet) throw new ApiError(500, 'internal', 'เปิดกระเป๋าเครดิตไม่สำเร็จ');
    return wallet;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getCredits(
  db: Db,
  context: RequestContext,
  config: CreditConfig,
): Promise<Credits> {
  const wallet = context.user
    ? await openWallet(db, context, { credits: config.signupBonus, reason: 'signup_bonus' })
    : await openWallet(db, context, { credits: config.anonCredits, reason: 'anon_grant' });

  return {
    balance: wallet.balance,
    allowance: context.user ? null : config.anonCredits,
    member: context.user !== null,
  };
}

/**
 * Moves what is left of an anonymous allowance into the member's wallet when a
 * browser signs in, so nobody loses credits by signing up mid-session.
 */
export async function mergeAnonymousWallet(db: Db, workspaceId: string, userId: string): Promise<number> {
  const client = await db.pool.connect();
  try {
    await client.query('begin');
    const removed = await client.query<{ balance: number }>(
      'delete from credit_wallet where workspace_id = $1 returning balance',
      [workspaceId],
    );
    // Even a workspace that never had a wallet has now been attached to an
    // account: its one-off allowance is spent.
    await client.query(
      'update workspace set anon_granted_at = coalesce(anon_granted_at, now()) where id = $1',
      [workspaceId],
    );
    const leftover = removed.rows[0]?.balance ?? 0;
    if (leftover <= 0) {
      await client.query('commit');
      return 0;
    }

    const member = await client.query<Wallet>(
      `insert into credit_wallet (user_id) values ($1)
       on conflict (user_id) where user_id is not null do update set updated_at = now()
       returning id, balance`,
      [userId],
    );
    const wallet = member.rows[0];
    if (!wallet) throw new ApiError(500, 'internal', 'รวมกระเป๋าเครดิตไม่สำเร็จ');

    const updated = await client.query<{ balance: number }>(
      `update credit_wallet set balance = balance + $2, updated_at = now()
        where id = $1 returning balance`,
      [wallet.id, leftover],
    );
    await insertEntry(client, {
      walletId: wallet.id,
      delta: leftover,
      reason: 'merge',
      balanceAfter: updated.rows[0]?.balance ?? wallet.balance + leftover,
      note: 'เครดิตที่เหลือจากโหมดไม่ระบุตัวตน',
    });

    await client.query('commit');
    return leftover;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Charges one credit and inserts the run in the same transaction. When the
 * wallet is empty nothing is written at all, so a refused run leaves no
 * half-recorded history row.
 */
export async function insertChargedRun<T>(
  db: Db,
  walletId: string,
  insert: (client: PoolClient) => Promise<{ run: T; runId: string }>,
): Promise<{ run: T; balance: number }> {
  const client = await db.pool.connect();
  try {
    await client.query('begin');

    const charged = await client.query<{ balance: number }>(
      `update credit_wallet set balance = balance - 1, updated_at = now()
        where id = $1 and balance >= 1
        returning balance`,
      [walletId],
    );
    const balance = charged.rows[0]?.balance;
    if (balance === undefined) {
      await client.query('rollback');
      throw new ApiError(
        402,
        'insufficient_credits',
        'เครดิตหมดแล้ว — เติมเครดิตหรือสมัครสมาชิกเพื่อรับเครดิตเพิ่ม',
      );
    }

    const { run, runId } = await insert(client);
    await insertEntry(client, {
      walletId,
      delta: -1,
      reason: 'run',
      jobRunId: runId,
      balanceAfter: balance,
    });

    await client.query('commit');
    return { run, balance };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Refunds the credit for a run that never produced a file. At most once. */
export async function refundRunCredits(
  db: Db,
  walletId: string,
  jobRunId: string,
  note: string | null = null,
): Promise<number | null> {
  const refunded = await db.query<{ balance: number }>(
    `with refund as (
       insert into credit_entry (wallet_id, delta, reason, job_run_id, note, balance_after)
       select w.id, 1, 'refund', $2, $3, w.balance + 1
         from credit_wallet w
        where w.id = $1
          and exists (
            select 1 from credit_entry c where c.job_run_id = $2 and c.reason = 'run'
          )
       on conflict do nothing
       returning wallet_id
     )
     update credit_wallet w
        set balance = w.balance + 1, updated_at = now()
       from refund r
      where w.id = r.wallet_id
      returning w.balance`,
    [walletId, jobRunId, note],
  );
  return refunded.rows[0]?.balance ?? null;
}

export async function listCreditEntries(
  db: Db,
  walletId: string,
  limit = 10,
): Promise<CreditEntryRecord[]> {
  const result = await db.query<{
    id: string;
    delta: number;
    reason: CreditReason;
    note: string | null;
    balance_after: number;
    job_run_id: string | null;
    created_at: Date;
  }>(
    `select id, delta, reason, note, balance_after, job_run_id, created_at
       from credit_entry
      where wallet_id = $1
      order by created_at desc
      limit $2`,
    [walletId, limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    delta: row.delta,
    reason: row.reason,
    note: row.note,
    balanceAfter: row.balance_after,
    jobRunId: row.job_run_id,
    createdAt: row.created_at.toISOString(),
  }));
}

/* ------------------------------------------------------------------ */
/* Redeem codes                                                        */
/* ------------------------------------------------------------------ */

/** Crockford-style alphabet: no 0/O/1/I/L, so a code can be read aloud. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 12;

export function generateRedeemCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let raw = '';
  for (const byte of bytes) raw += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** Codes are stored hashed, the same way workspace and session tokens are. */
export function normalizeRedeemCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashRedeemCode(code: string): string {
  return createHash('sha256').update(normalizeRedeemCode(code), 'utf8').digest('hex');
}

export type RedeemResult = { credits: number; balance: number };

export async function redeemCode(
  db: Db,
  context: RequestContext,
  code: string,
  config: CreditConfig,
): Promise<RedeemResult> {
  const wallet = context.user
    ? await openWallet(db, context, { credits: config.signupBonus, reason: 'signup_bonus' })
    : await openWallet(db, context, { credits: config.anonCredits, reason: 'anon_grant' });

  const client = await db.pool.connect();
  try {
    await client.query('begin');

    const found = await client.query<{
      id: string;
      credits: number;
      max_uses: number;
      used_count: number;
      expires_at: Date | null;
    }>(
      `select id, credits, max_uses, used_count, expires_at
         from redeem_code
        where code_hash = $1
        for update`,
      [hashRedeemCode(code)],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query('rollback');
      throw new ApiError(404, 'code_not_found', 'ไม่พบโค้ดนี้');
    }
    if (row.expires_at !== null && row.expires_at.getTime() <= Date.now()) {
      await client.query('rollback');
      throw new ApiError(409, 'code_unavailable', 'โค้ดนี้หมดอายุแล้ว');
    }
    if (row.used_count >= row.max_uses) {
      await client.query('rollback');
      throw new ApiError(409, 'code_unavailable', 'โค้ดนี้ถูกใช้ครบจำนวนแล้ว');
    }

    try {
      await client.query(
        'insert into redeem_use (code_id, wallet_id, credits) values ($1, $2, $3)',
        [row.id, wallet.id, row.credits],
      );
    } catch (error) {
      await client.query('rollback');
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'code_unavailable', 'กระเป๋านี้ใช้โค้ดนี้ไปแล้ว');
      }
      throw error;
    }

    await client.query('update redeem_code set used_count = used_count + 1 where id = $1', [row.id]);

    const updated = await client.query<{ balance: number }>(
      `update credit_wallet set balance = balance + $2, updated_at = now()
        where id = $1 returning balance`,
      [wallet.id, row.credits],
    );
    const balance = updated.rows[0]?.balance ?? wallet.balance + row.credits;
    await insertEntry(client, {
      walletId: wallet.id,
      delta: row.credits,
      reason: 'redeem',
      balanceAfter: balance,
      note: 'ใช้โค้ดเติมเครดิต',
    });

    await client.query('commit');
    return { credits: row.credits, balance };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
