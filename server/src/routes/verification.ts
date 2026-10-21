import type { FastifyInstance } from 'fastify';

import { requireUser, resolveContext } from '../auth.ts';
import type { Db } from '../db.ts';
import { readObjectBody, readString } from '../http.ts';
import type { Mailer } from '../mail.ts';
import { confirmVerification, describeVerification, sendVerificationCode } from '../verification.ts';

/**
 * Three small endpoints around the code: ask for one, confirm one, and re-read
 * the state (used by the banner after a resend or a successful confirmation).
 */
export function registerVerificationRoutes(app: FastifyInstance, deps: { db: Db; mailer: Mailer }): void {
  const { db, mailer } = deps;

  app.get('/api/auth/verify', async (request) => {
    const context = await resolveContext(db, request);
    const user = requireUser(context);
    return { verification: await describeVerification(db, mailer, user) };
  });

  app.post('/api/auth/verify/send', async (request, reply) => {
    const context = await resolveContext(db, request);
    const user = requireUser(context);
    const result = await sendVerificationCode(db, mailer, user);
    reply.code(202);
    return {
      verification: result.status,
      // Only while mail goes to the API log; never sent when SMTP is configured.
      ...(result.devCode ? { devCode: result.devCode } : {}),
    };
  });

  app.post('/api/auth/verify/confirm', async (request) => {
    const context = await resolveContext(db, request);
    const user = requireUser(context);
    const body = readObjectBody(request.body);
    const code = readString(body, 'code', { required: true, maxLength: 12 }) ?? '';
    return { verification: await confirmVerification(db, mailer, user, code) };
  });
}
