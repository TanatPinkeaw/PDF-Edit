import pg from 'pg';
import type { QueryResult, QueryResultRow } from 'pg';

const { Pool } = pg;

export type Db = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
  /** Raw pool for transactions and migration locking. */
  pool: pg.Pool;
  close(): Promise<void>;
};

export type DbOptions = {
  max?: number;
  connectionTimeoutMillis?: number;
};

/** Creates the single pg pool shared by every route. */
export function createDb(connectionString: string, options: DbOptions = {}): Db {
  const pool = new Pool({
    connectionString,
    max: options.max ?? 6,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
  });

  return {
    query: (text, values) => pool.query(text, values as unknown[] | undefined),
    pool,
    close: () => pool.end(),
  };
}

/** One-shot query helper for scripts that do not need a shared pool. */
export async function queryOnce<T extends QueryResultRow = QueryResultRow>(
  connectionString: string,
  text: string,
  values?: readonly unknown[],
): Promise<QueryResult<T>> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await client.query<T>(text, values as unknown[] | undefined);
  } finally {
    await client.end();
  }
}

/** Replaces the database name in a connection string, keeping credentials. */
export function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

export function databaseNameOf(connectionString: string): string {
  const name = new URL(connectionString).pathname.replace(/^\//, '');
  if (name === '') {
    throw new Error(`DATABASE_URL ต้องมีชื่อฐานข้อมูล (ได้ "${connectionString}")`);
  }
  return decodeURIComponent(name);
}
