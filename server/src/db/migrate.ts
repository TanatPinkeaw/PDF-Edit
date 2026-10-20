import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Db } from '../db.ts';
import { createDb } from '../db.ts';
import { MIGRATIONS_DIR, readEnv } from '../env.ts';

const LOCK_KEY = 'pdf-studio-migrations';

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

export async function migrationFiles(dir = MIGRATIONS_DIR): Promise<string[]> {
  const entries = await readdir(dir);
  return entries.filter((name) => name.endsWith('.sql')).sort();
}

/**
 * Applies every pending migration in one advisory-locked session.
 * Re-running is a no-op, which is what `pnpm db:migrate` relies on.
 */
export async function runMigrations(db: Db, dir = MIGRATIONS_DIR): Promise<MigrationResult> {
  const client = await db.pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await client.query('select pg_advisory_lock(hashtext($1))', [LOCK_KEY]);
    await client.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const done = await client.query<{ version: string }>('select version from schema_migrations');
    const doneSet = new Set(done.rows.map((row) => row.version));

    for (const file of await migrationFiles(dir)) {
      if (doneSet.has(file)) {
        skipped.push(file);
        continue;
      }
      const sql = await readFile(join(dir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [file]);
        await client.query('commit');
        applied.push(file);
      } catch (error) {
        await client.query('rollback');
        throw new Error(`ไมเกรชัน ${file} ล้มเหลว: ${error instanceof Error ? error.message : error}`);
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(hashtext($1))', [LOCK_KEY]).catch(() => undefined);
    client.release();
  }

  return { applied, skipped };
}

async function main(): Promise<void> {
  const url = process.argv[2] ?? readEnv().databaseUrl;
  const db = createDb(url, { max: 1 });
  try {
    const result = await runMigrations(db);
    console.log(
      result.applied.length === 0
        ? `ไม่มีไมเกรชันใหม่ (มีอยู่แล้ว ${result.skipped.length} ไฟล์)`
        : `ใช้ไมเกรชัน ${result.applied.length} ไฟล์: ${result.applied.join(', ')}`,
    );
  } finally {
    await db.close();
  }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('/db/migrate.ts');
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
