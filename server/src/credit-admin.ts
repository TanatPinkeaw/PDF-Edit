/**
 * Admin operations that do not need a web UI: topping up an account and
 * minting redeem codes. They run from the CLI with direct database access, so
 * no admin token or extra endpoint has to exist.
 */

import { normalizeEmail } from './auth.ts';
import { generateRedeemCode, hashRedeemCode } from './credits.ts';
import type { Db } from './db.ts';

export type AdminGrant = { userId: string; email: string; balance: number };

export async function grantCreditsByEmail(
  db: Db,
  email: string,
  amount: number,
  note: string | null = null,
): Promise<AdminGrant> {
  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error('amount ต้องเป็นจำนวนเต็มที่ไม่ใช่ 0');
  }

  const client = await db.pool.connect();
  try {
    await client.query('begin');

    const found = await client.query<{ id: string; email: string }>(
      'select id, email from app_user where lower(email) = $1',
      [normalizeEmail(email)],
    );
    const user = found.rows[0];
    if (!user) throw new Error(`ไม่พบบัญชี ${normalizeEmail(email)}`);

    await client.query(
      'insert into credit_wallet (user_id) values ($1) on conflict do nothing',
      [user.id],
    );
    const updated = await client.query<{ balance: number }>(
      `update credit_wallet
          set balance = balance + $2, updated_at = now()
        where user_id = $1
        returning balance`,
      [user.id, amount],
    );
    const balance = updated.rows[0]?.balance;
    if (balance === undefined) throw new Error('ปรับเครดิตไม่สำเร็จ');

    await client.query(
      `insert into credit_entry (wallet_id, delta, reason, note, balance_after)
       select w.id, $2, 'admin', $3, $4 from credit_wallet w where w.user_id = $1`,
      [user.id, amount, note ?? `admin grant ${amount}`, balance],
    );

    await client.query('commit');
    return { userId: user.id, email: user.email, balance };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type CreateCodesOptions = {
  count: number;
  credits: number;
  maxUses?: number;
  expiresAt?: Date | null;
  note?: string | null;
};

/** Returns the plaintext codes exactly once; only their hashes are stored. */
export async function createRedeemCodes(db: Db, options: CreateCodesOptions): Promise<string[]> {
  const { count, credits } = options;
  const maxUses = options.maxUses ?? 1;
  if (!Number.isInteger(count) || count < 1) throw new Error('count ต้องเป็นจำนวนเต็มบวก');
  if (!Number.isInteger(credits) || credits < 1) throw new Error('credits ต้องเป็นจำนวนเต็มบวก');
  if (!Number.isInteger(maxUses) || maxUses < 1) throw new Error('uses ต้องเป็นจำนวนเต็มบวก');

  const codes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    // A collision on the hash is astronomically unlikely, but retrying keeps
    // the command safe when someone reuses a seed or a partial dump.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateRedeemCode();
      const inserted = await db.query<{ id: string }>(
        `insert into redeem_code (code_hash, credits, max_uses, expires_at, note)
         values ($1, $2, $3, $4, $5)
         on conflict (code_hash) do nothing
         returning id`,
        [hashRedeemCode(code), credits, maxUses, options.expiresAt ?? null, options.note ?? null],
      );
      if (inserted.rows[0]) {
        codes.push(code);
        break;
      }
      if (attempt === 4) throw new Error('สร้างโค้ดไม่สำเร็จ (hash ซ้ำหลายครั้ง)');
    }
  }
  return codes;
}

export async function creditSummaryByEmail(
  db: Db,
  email: string,
): Promise<{ email: string; balance: number; usedCodes: number }> {
  const result = await db.query<{ email: string; balance: number; used_codes: string }>(
    `select u.email,
            coalesce(w.balance, 0) as balance,
            (select count(*) from redeem_use r where r.wallet_id = w.id)::text as used_codes
       from app_user u
       left join credit_wallet w on w.user_id = u.id
      where lower(u.email) = $1`,
    [normalizeEmail(email)],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`ไม่พบบัญชี ${normalizeEmail(email)}`);
  return { email: row.email, balance: row.balance, usedCodes: Number(row.used_codes) };
}
