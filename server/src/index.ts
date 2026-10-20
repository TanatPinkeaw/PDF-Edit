import { buildServer } from './app.ts';
import { createDb, databaseNameOf } from './db.ts';
import { describeDbFailure, readEnv } from './env.ts';

async function main(): Promise<void> {
  const env = readEnv();
  const db = createDb(env.databaseUrl);

  try {
    await db.query('select 1');
  } catch (error) {
    throw describeDbFailure(error, env.databaseUrl);
  }

  const app = await buildServer({ env, db });
  await app.listen({ host: env.host, port: env.port });

  console.log(
    `API พร้อมที่ http://${env.host}:${env.port} · DB "${databaseNameOf(env.databaseUrl)}" · ` +
      `${env.googleClientId ? 'Google sign-in เปิด' : 'Google sign-in ปิด (ไม่มี GOOGLE_CLIENT_ID)'}`,
  );

  const shutdown = async (signal: string) => {
    console.log(`\nปิด API (${signal})`);
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
