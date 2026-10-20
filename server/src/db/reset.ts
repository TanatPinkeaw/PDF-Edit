import { createDb, databaseNameOf, withDatabase } from '../db.ts';
import { readEnv } from '../env.ts';
import { ensureDatabase } from './create.ts';
import { runMigrations } from './migrate.ts';

/** Drops the configured database, recreates it and applies every migration. */
export async function resetDatabase(databaseUrl: string): Promise<void> {
  const name = databaseNameOf(databaseUrl);
  const admin = createDb(withDatabase(databaseUrl, 'postgres'), { max: 1 });
  try {
    const quoted = `"${name.replace(/"/g, '""')}"`;
    await admin.query(
      `select pg_terminate_backend(pid) from pg_stat_activity
        where datname = $1 and pid <> pg_backend_pid()`,
      [name],
    );
    await admin.query(`drop database if exists ${quoted}`);
  } finally {
    await admin.close();
  }

  await ensureDatabase(databaseUrl);
  const db = createDb(databaseUrl, { max: 1 });
  try {
    const result = await runMigrations(db);
    console.log(`รีเซ็ต "${name}" แล้ว — ใช้ไมเกรชัน ${result.applied.length} ไฟล์`);
  } finally {
    await db.close();
  }
}

async function main(): Promise<void> {
  const url = process.argv[2] ?? readEnv().databaseUrl;
  await resetDatabase(url);
}

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('/db/reset.ts');
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
