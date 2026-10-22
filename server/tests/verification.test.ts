import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db.ts';
import type { RecordingMailer } from './helpers/test-server.ts';
import {
  closeTestDb,
  createTestApp,
  originHeaders,
  recordingMailer,
  testEnv,
  truncateAll,
  workspaceToken,
} from './helpers/test-server.ts';

let app: FastifyInstance;
let db: Db;
let mailer: RecordingMailer;

const PASSWORD = 'correct horse battery';

function sessionCookie(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) throw new Error('ไม่มี Set-Cookie ในคำตอบ');
  return value.split(';')[0] ?? '';
}

async function signUp(email = 'verify@example.com'): Promise<Record<string, string>> {
  const token = workspaceToken();
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    headers: originHeaders(token),
    payload: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  return { ...originHeaders(token), cookie: sessionCookie(response) };
}

async function sendCode(headers: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/verify/send',
    headers,
  });
}

async function confirm(headers: Record<string, string>, code: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/verify/confirm',
    headers,
    payload: { code },
  });
}

async function runOnce(headers: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: '/api/runs',
    headers,
    payload: { tool: 'organize', params: { action: 'download' } },
  });
}

beforeAll(async () => {
  mailer = recordingMailer();
  const created = await createTestApp({ mailer });
  app = created.app;
  db = created.db;
});

beforeEach(async () => {
  await truncateAll(db);
  mailer.sent.length = 0;
});

afterAll(async () => {
  await app.close();
  await closeTestDb();
});

describe('email verification', () => {
  it('reports a fresh member as unverified and wants a code', async () => {
    const headers = await signUp();

    const bootstrap = await app.inject({ method: 'POST', url: '/api/bootstrap', headers });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json().verification).toMatchObject({
      verified: false,
      enforced: true,
      mailMode: 'log',
      pendingExpiresAt: null,
    });
  });

  it('sends a six-digit code, logs it in dev mode and accepts it once', async () => {
    const headers = await signUp();

    const sent = await sendCode(headers);
    expect(sent.statusCode).toBe(202);
    expect(mailer.sent).toHaveLength(1);
    const code = mailer.lastCode();
    expect(code).toMatch(/^\d{6}$/);
    // Mail is only logged locally, so the browser gets the code back.
    expect(sent.json().devCode).toBe(code);
    expect(sent.json().verification.verified).toBe(false);
    expect(sent.json().verification.pendingExpiresAt).toBeTypeOf('string');

    const wrong = await confirm(headers, code === '000000' ? '111111' : '000000');
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.code).toBe('code_invalid');
    expect(wrong.json().error.attemptsLeft).toBe(4);

    const ok = await confirm(headers, code);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().verification.verified).toBe(true);

    // Confirming again is harmless, and the code cannot be reused for another
    // account because it is hashed together with the user id.
    const again = await confirm(headers, code);
    expect(again.statusCode).toBe(200);
    expect(again.json().verification.verified).toBe(true);
  });

  it('refuses to resend inside the cooldown and cancels the previous code', async () => {
    const headers = await signUp();
    await sendCode(headers);
    const first = mailer.lastCode();

    const tooSoon = await sendCode(headers);
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.json().error.code).toBe('too_many_attempts');
    expect(tooSoon.json().error.retryAfterSeconds).toBeGreaterThan(0);
    expect(mailer.sent).toHaveLength(1);

    // Age the first code past the cooldown, then ask again.
    await db.query("update email_verification set created_at = now() - interval '2 minutes'");
    const second = await sendCode(headers);
    expect(second.statusCode).toBe(202);
    expect(mailer.sent).toHaveLength(2);
    const fresh = mailer.lastCode();
    expect(fresh).toMatch(/^\d{6}$/);

    // The cancelled code no longer matches even if it is guessed correctly.
    if (fresh !== first) {
      const stale = await confirm(headers, first);
      expect(stale.statusCode).toBe(400);
    }
    const ok = await confirm(headers, fresh);
    expect(ok.statusCode).toBe(200);
  });

  it('locks a code after five wrong attempts', async () => {
    const headers = await signUp();
    await sendCode(headers);
    const code = mailer.lastCode();
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await confirm(headers, wrong);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.attemptsLeft).toBe(5 - attempt);
    }

    // The right code is refused too: the row has to be reissued.
    const blocked = await confirm(headers, code);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('too_many_attempts');
  });

  it('rejects an expired code and asks for a new one', async () => {
    const headers = await signUp();
    await sendCode(headers);
    const code = mailer.lastCode();
    await db.query("update email_verification set expires_at = now() - interval '1 second'");

    const expired = await confirm(headers, code);
    expect(expired.statusCode).toBe(400);
    expect(expired.json().error.code).toBe('code_expired');
  });

  it('rejects malformed codes without spending an attempt', async () => {
    const headers = await signUp();
    await sendCode(headers);

    const response = await confirm(headers, '12ab');
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('invalid_request');

    const pending = await db.query<{ attempts: number }>('select attempts from email_verification');
    expect(pending.rows[0]?.attempts).toBe(0);
  });
});

describe('credit gate', () => {
  // The mailbox gate belongs to credit mode; the shipped free mode must never
  // demand a verification code before running a tool.
  it('blocks runs and redemption until the email is verified (credit mode)', async () => {
    const created = await createTestApp({
      db,
      env: testEnv({ CREDITS_ENABLED: 'true', REQUIRE_SIGN_IN: 'false' }),
    });

    try {
      const token = workspaceToken();
      const signup = await created.app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        headers: originHeaders(token),
        payload: { email: 'gate@example.com', password: PASSWORD },
      });
      expect(signup.statusCode).toBe(201);
      const headers = { ...originHeaders(token), cookie: sessionCookie(signup) };

      const blockedRun = await created.app.inject({
        method: 'POST',
        url: '/api/runs',
        headers,
        payload: { tool: 'organize', params: { action: 'download' } },
      });
      expect(blockedRun.statusCode).toBe(403);
      expect(blockedRun.json().error.code).toBe('email_unverified');

      const blockedRedeem = await created.app.inject({
        method: 'POST',
        url: '/api/credits/redeem',
        headers,
        payload: { code: 'ANY-CODE' },
      });
      expect(blockedRedeem.statusCode).toBe(403);

      const sent = await created.app.inject({
        method: 'POST',
        url: '/api/auth/verify/send',
        headers,
      });
      expect(sent.statusCode).toBe(202);
      const code = sent.json().devCode as string;
      const ok = await created.app.inject({
        method: 'POST',
        url: '/api/auth/verify/confirm',
        headers,
        payload: { code },
      });
      expect(ok.statusCode).toBe(200);

      const allowed = await created.app.inject({
        method: 'POST',
        url: '/api/runs',
        headers,
        payload: { tool: 'organize', params: { action: 'download' } },
      });
      expect(allowed.statusCode).toBe(201);
      expect(allowed.json().credits.balance).toBe(19);
    } finally {
      await created.app.close();
    }
  });

  it('never asks a signed-in member to verify while credits are shelved', async () => {
    const headers = await signUp('free@example.com');

    const run = await runOnce(headers);
    expect(run.statusCode).toBe(201);
    expect(run.json().credits).toBeNull();

    const bootstrap = await app.inject({ method: 'POST', url: '/api/bootstrap', headers });
    expect(bootstrap.json().verification).toMatchObject({ verified: false });
    expect(bootstrap.json().creditsEnabled).toBe(false);
  });

  it('stays open when the deployment has no SMTP configured', async () => {
    // `createMailer` turns itself off in production without SMTP_URL; this is
    // the same shape, injected so the test needs no real mail settings.
    const created = await createTestApp({
      db,
      env: testEnv({ NODE_ENV: 'production', CREDITS_ENABLED: 'true', REQUIRE_SIGN_IN: 'false' }),
      mailer: {
        mode: 'disabled',
        enforced: false,
        async sendCode() {
          throw new Error('ไม่ควรถูกเรียกเมื่อไม่มี SMTP');
        },
      },
    });

    try {
      const response = await created.app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        headers: originHeaders(workspaceToken()),
        payload: { email: 'nosmtp@example.com', password: PASSWORD },
      });
      expect(response.statusCode).toBe(201);
      const cookie = sessionCookie(response);
      const headers = {
        ...originHeaders(workspaceToken()),
        cookie,
      };

      const bootstrap = await created.app.inject({ method: 'POST', url: '/api/bootstrap', headers });
      expect(bootstrap.json().verification).toMatchObject({ verified: false, enforced: false });

      // No mailbox means no way to verify, so the wallet stays usable.
      const run = await created.app.inject({
        method: 'POST',
        url: '/api/runs',
        headers,
        payload: { tool: 'organize', params: { action: 'download' } },
      });
      expect(run.statusCode).toBe(201);

      const send = await created.app.inject({
        method: 'POST',
        url: '/api/auth/verify/send',
        headers,
      });
      expect(send.statusCode).toBe(503);
      expect(send.json().error.code).toBe('mail_not_configured');
    } finally {
      await created.app.close();
    }
  });
});
