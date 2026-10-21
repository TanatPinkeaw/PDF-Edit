import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';

import { createGoogleVerifier, type GoogleVerifier } from './auth.ts';
import type { Db } from './db.ts';
import type { Env } from './env.ts';
import { ApiError } from './http.ts';
import { CONVERT_LIMITS } from './convert.ts';
import { createMailer, type Mailer } from './mail.ts';
import { registerAccountRoutes } from './routes/account.ts';
import { registerConvertRoutes } from './routes/convert.ts';
import { registerCreditRoutes } from './routes/credits.ts';
import { registerJobRoutes } from './routes/jobs.ts';
import { registerPresetRoutes } from './routes/presets.ts';
import { registerShareRoutes } from './routes/shares.ts';
import { registerVerificationRoutes } from './routes/verification.ts';

export type BuildServerOptions = {
  env: Env;
  db: Db;
  /** Injected by tests; production builds it from GOOGLE_CLIENT_ID. */
  googleVerifier?: GoogleVerifier | null;
  /** Injected by tests; otherwise built from SMTP_URL. */
  mailer?: Mailer;
};

/** Both loopback spellings count as the app origin during local development. */
function allowedOrigins(appOrigin: string): Set<string> {
  const origins = new Set([appOrigin]);
  try {
    const url = new URL(appOrigin);
    const alternate = url.hostname === '127.0.0.1' ? 'localhost' : url.hostname === 'localhost' ? '127.0.0.1' : null;
    if (alternate) {
      const copy = new URL(appOrigin);
      copy.hostname = alternate;
      origins.add(copy.origin);
    }
  } catch {
    // A malformed APP_ORIGIN is reported by the request guard below.
  }
  return origins;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const { env, db } = options;
  const app = Fastify({
    logger: false,
    bodyLimit: env.shareMaxBytes * 2,
    trustProxy: false,
  });

  await app.register(cookie);

  // Conversion uploads arrive as raw bytes: no multipart parser, and the body
  // limit equals the conversion limit so a large file is rejected early.
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: CONVERT_LIMITS.maxBytes },
    (_request, body, done) => done(null, body),
  );

  const origins = allowedOrigins(env.appOrigin);
  app.addHook('onRequest', async (request) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (!origin) return;
    if (!origins.has(origin.replace(/\/$/, ''))) {
      throw new ApiError(403, 'forbidden_origin', `origin ${origin} ไม่ได้รับอนุญาต`);
    }
  });

  const httpStatusOf = (error: unknown): number => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
    ) {
      return error.statusCode;
    }
    return 500;
  };

  const errorCodeOf = (error: unknown): string | null => {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
      return error.code;
    }
    return null;
  };

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ?? {}),
        },
      });
      return;
    }

    const status = httpStatusOf(error);
    if (status === 413 || errorCodeOf(error) === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      reply.code(413).send({
        error: { code: 'stream_too_large', message: 'ข้อมูลที่ส่งใหญ่เกินกำหนด' },
      });
      return;
    }
    if (status >= 400 && status < 500) {
      reply.code(status).send({
        error: {
          code: 'invalid_request',
          message: error instanceof Error ? error.message : 'คำขอไม่ถูกต้อง',
        },
      });
      return;
    }

    console.error(`[api] ${request.method} ${request.url} ล้มเหลว`, error);
    reply.code(500).send({
      error: { code: 'internal', message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' },
    });
  });

  const googleVerifier: GoogleVerifier | null =
    options.googleVerifier !== undefined
      ? options.googleVerifier
      : env.googleClientId
        ? createGoogleVerifier(env.googleClientId)
        : null;

  app.get('/api/health', async (_request, reply) => {
    try {
      await db.query('select 1');
      return { ok: true, db: 'up' };
    } catch (error) {
      reply.code(503);
      return {
        ok: false,
        db: 'down',
        message: error instanceof Error ? error.message : 'database unreachable',
      };
    }
  });

  const mailer = options.mailer ?? createMailer(env);

  registerAccountRoutes(app, { db, env, mailer, googleVerifier });
  registerVerificationRoutes(app, { db, mailer });
  registerCreditRoutes(app, { db, env, mailer });
  registerJobRoutes(app, { db, env, mailer });
  registerPresetRoutes(app, { db });
  registerShareRoutes(app, { db, env });
  registerConvertRoutes(app, { env });

  return app;
}
