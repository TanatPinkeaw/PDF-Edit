/**
 * Admin CLI for credits:
 *
 *   pnpm credits:grant --email user@example.com --amount 50 [--note "top-up"]
 *   pnpm credits:codes --count 10 --credits 20 [--uses 1] [--expires 2026-12-31]
 *   pnpm credits:balance --email user@example.com
 *
 * Codes are printed once: only a sha256 hash is stored in the database.
 */

import { creditSummaryByEmail, createRedeemCodes, grantCreditsByEmail } from '../credit-admin.ts';
import { createDb } from '../db.ts';
import { readEnv } from '../env.ts';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`--${name} ต้องมีค่า`);
  }
  return value;
}

function requiredFlag(name: string): string {
  const value = flag(name);
  if (value === undefined) throw new Error(`ต้องระบุ --${name}`);
  return value;
}

function integerFlag(name: string, fallback?: number): number {
  const raw = flag(name);
  if (raw === undefined) {
    if (fallback === undefined) throw new Error(`ต้องระบุ --${name}`);
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new Error(`--${name} ต้องเป็นตัวเลข`);
  return value;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command) {
    throw new Error('ใช้: credits:grant | credits:codes | credits:balance');
  }

  const env = readEnv();
  const db = createDb(env.databaseUrl, { max: 1 });

  try {
    if (command === 'grant') {
      const result = await grantCreditsByEmail(
        db,
        requiredFlag('email'),
        integerFlag('amount'),
        flag('note') ?? null,
      );
      console.log(`เติมเครดิต ${result.email} แล้ว — คงเหลือ ${result.balance} เครดิต`);
      return;
    }

    if (command === 'codes') {
      const expiresRaw = flag('expires');
      const expiresAt = expiresRaw ? new Date(`${expiresRaw}T23:59:59`) : null;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        throw new Error('--expires ต้องเป็นวันที่แบบ YYYY-MM-DD');
      }
      const codes = await createRedeemCodes(db, {
        count: integerFlag('count', 1),
        credits: integerFlag('credits', 20),
        maxUses: integerFlag('uses', 1),
        expiresAt,
        note: flag('note') ?? null,
      });
      console.log(`สร้างโค้ด ${codes.length} ใบ (แสดงครั้งเดียว — เก็บไว้ให้ดี):`);
      for (const code of codes) console.log(`  ${code}`);
      return;
    }

    if (command === 'balance') {
      const summary = await creditSummaryByEmail(db, requiredFlag('email'));
      console.log(`${summary.email} — ${summary.balance} เครดิต · ใช้โค้ดไป ${summary.usedCodes} ครั้ง`);
      return;
    }

    throw new Error(`ไม่รู้จักคำสั่ง "${command}"`);
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
