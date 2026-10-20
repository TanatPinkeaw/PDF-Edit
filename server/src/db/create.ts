import { createDb, databaseNameOf, withDatabase } from '../db.ts';
import { describeDbFailure, readEnv } from '../env.ts';

/**
 * Creates the configured database when it does not exist yet, so a fresh
 * checkout only needs `pnpm db:create && pnpm db:migrate`.
 */
export async function ensureDatabase(databaseUrl: string): Promise<{ created: boolean; name: string }> {
  const name = databaseNameOf(databaseUrl);
  const adminUrl = withDatabase(databaseUrl, 'postgres');
  const admin = createDb(adminUrl, { max: 1 });

  try {
    const existing = await admin.query<{ datname: string }>(
      'select datname from pg_database where datname = $1',
      [name],
    );
    if (existing.rowCount && existing.rowCount > 0) return { created: false, name };

    // Identifiers cannot be parameterised; quote and escape the name instead.
    const quoted = `"${name.replace(/"/g, '""')}"`;
    await admin.query(`create database ${quoted}`);
    return { created: true, name };
  } catch (error) {
    throw describeDbFailure(error, databaseUrl);
  } finally {
    await admin.close();
  }
}

async function main(): Promise<void> {
  const env = readEnv();
  const url = process.argv[2] ?? env.databaseUrl;
  const result = await ensureDatabase(url);
  console.log(
    result.created
      ? `สร้างฐานข้อมูล "${result.name}" แล้ว`
      : `ฐานข้อมูล "${result.name}" มีอยู่แล้ว — ไม่ต้องทำอะไร`,
  );
}

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('/db/create.ts');
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
