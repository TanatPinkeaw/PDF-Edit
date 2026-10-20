import { afterAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../src/db/migrate.ts';
import { closeTestDb, testDb } from './helpers/test-server.ts';

describe('migrations', () => {
  it('re-running does nothing and keeps every table', async () => {
    const db = await testDb();
    const second = await runMigrations(db);

    expect(second.applied).toEqual([]);
    expect(second.skipped.length).toBeGreaterThan(0);

    const tables = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    const names = tables.rows.map((row) => row.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'app_user',
        'artifact',
        'auth_session',
        'job_run',
        'preset',
        'schema_migrations',
        'share_link',
        'workspace',
      ]),
    );
  });

  it('declares the quota index and unique guards', async () => {
    const db = await testDb();
    const indexes = await db.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'public'",
    );
    const names = indexes.rows.map((row) => row.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        'job_run_workspace_started_idx',
        'job_run_running_idx',
        'share_link_expiry_idx',
        'workspace_user_idx',
      ]),
    );
  });
});

afterAll(async () => {
  await closeTestDb();
});
