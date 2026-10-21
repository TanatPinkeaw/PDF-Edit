import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { creditSummaryByEmail, createRedeemCodes, grantCreditsByEmail } from '../src/credit-admin.ts';
import type { Db } from '../src/db.ts';
import {
  closeTestDb,
  createTestApp,
  originHeaders,
  truncateAll,
  workspaceToken,
} from './helpers/test-server.ts';

let app: FastifyInstance;
let db: Db;

const PASSWORD = 'correct horse battery';

function sessionCookie(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) throw new Error('ไม่มี Set-Cookie ในคำตอบ');
  return value.split(';')[0] ?? '';
}

async function signUp(email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    headers: originHeaders(workspaceToken()),
    payload: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  return sessionCookie(response);
}

beforeAll(async () => {
  const created = await createTestApp();
  app = created.app;
  db = created.db;
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await app.close();
  await closeTestDb();
});

describe('credit balance', () => {
  it('hands an anonymous browser its one-off allowance once', async () => {
    const headers = originHeaders(workspaceToken());

    const first = await app.inject({ method: 'GET', url: '/api/credits', headers });
    expect(first.statusCode).toBe(200);
    expect(first.json().credits).toMatchObject({ balance: 3, allowance: 3, member: false });
    expect(first.json().entries).toHaveLength(1);
    expect(first.json().entries[0]).toMatchObject({ delta: 3, reason: 'anon_grant' });

    // Asking again must not top the wallet up a second time.
    const second = await app.inject({ method: 'GET', url: '/api/credits', headers });
    expect(second.json().credits.balance).toBe(3);
    expect(second.json().entries).toHaveLength(1);
  });

  it('keeps one member wallet across browsers', async () => {
    const cookie = await signUp('member@example.com');
    // Charging a run needs a verified mailbox; that gate has its own tests, and
    // this one is about the wallet surviving a browser change.
    await db.query("update app_user set email_verified = true where email = 'member@example.com'");
    const otherBrowser = originHeaders(workspaceToken());

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie, ...otherBrowser } });
    expect(me.json().credits.balance).toBe(20);

    await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: { cookie, 'x-workspace-token': workspaceToken(), origin: 'http://127.0.0.1:5174' },
      payload: { tool: 'rotate' },
    });

    const after = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(after.json().credits.balance).toBe(19);
  });
});

describe('redeem codes', () => {
  it('adds the credits once, accepting lowercase and missing dashes', async () => {
    const [code] = await createRedeemCodes(db, { count: 1, credits: 20 });
    const groups = (code ?? '').split('-');
    expect(groups.map((group) => group.length)).toEqual([4, 4, 4]);
    expect((code ?? '').replace(/-/g, '')).toMatch(/^[A-Z0-9]+$/);

    const headers = originHeaders(workspaceToken());
    const sloppy = ` ${(code ?? '').toLowerCase().replace(/-/g, ' ')} `;
    const redeemed = await app.inject({
      method: 'POST',
      url: '/api/credits/redeem',
      headers,
      payload: { code: sloppy },
    });

    expect(redeemed.statusCode).toBe(200);
    expect(redeemed.json().granted).toBe(20);
    expect(redeemed.json().credits.balance).toBe(23);
    expect(redeemed.json().entries[0]).toMatchObject({ delta: 20, reason: 'redeem' });

    const again = await app.inject({
      method: 'POST',
      url: '/api/credits/redeem',
      headers,
      payload: { code },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('code_unavailable');
  });

  it('reports unknown and expired codes', async () => {
    const headers = originHeaders(workspaceToken());

    const unknown = await app.inject({
      method: 'POST',
      url: '/api/credits/redeem',
      headers,
      payload: { code: 'ZZZZ-ZZZZ-ZZZZ' },
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('code_not_found');

    const [expired] = await createRedeemCodes(db, {
      count: 1,
      credits: 10,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/credits/redeem',
      headers,
      payload: { code: expired },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toContain('หมดอายุ');
  });

  it('stops handing out a single-use code after the first wallet', async () => {
    const [code] = await createRedeemCodes(db, { count: 1, credits: 5 });

    const first = await app.inject({
      method: 'POST',
      url: '/api/credits/redeem',
      headers: originHeaders(workspaceToken()),
      payload: { code },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/api/credits/redeem',
      headers: originHeaders(workspaceToken()),
      payload: { code },
    });
    expect(second.statusCode).toBe(409);
  });

  it('supports multi-use codes', async () => {
    const [code] = await createRedeemCodes(db, { count: 1, credits: 4, maxUses: 2 });

    for (let index = 0; index < 2; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/credits/redeem',
        headers: originHeaders(workspaceToken()),
        payload: { code },
      });
      expect(response.statusCode).toBe(200);
    }

    const third = await app.inject({
      method: 'POST',
      url: '/api/credits/redeem',
      headers: originHeaders(workspaceToken()),
      payload: { code },
    });
    expect(third.statusCode).toBe(409);
    expect(third.json().error.message).toContain('ครบจำนวน');
  });

  it('stores only hashes of the codes', async () => {
    const codes = await createRedeemCodes(db, { count: 2, credits: 7 });
    const rows = await db.query<{ code_hash: string }>('select code_hash from redeem_code');

    expect(rows.rowCount).toBe(2);
    for (const row of rows.rows) { expect(row.code_hash).toHaveLength(64); expect(row.code_hash).toMatch(/^[0-9a-f]+$/); }
    for (const code of codes) {
      expect(rows.rows.some((row) => row.code_hash.includes(code.replace(/-/g, '')))).toBe(false);
    }
  });
});

describe('admin tools', () => {
  it('grants credits to an existing account', async () => {
    await signUp('topup@example.com');

    const result = await grantCreditsByEmail(db, 'TopUp@Example.com', 50, 'top-up by admin');
    expect(result.balance).toBe(70);

    const summary = await creditSummaryByEmail(db, 'topup@example.com');
    expect(summary.balance).toBe(70);

    const entries = await db.query<{ reason: string; delta: number }>(
      'select reason, delta from credit_entry order by created_at desc limit 1',
    );
    expect(entries.rows[0]).toMatchObject({ reason: 'admin', delta: 50 });
  });

  it('refuses to grant to an account that does not exist', async () => {
    await expect(grantCreditsByEmail(db, 'nobody@example.com', 10)).rejects.toThrow('ไม่พบบัญชี');
  });

  it('mints readable codes and reports unknown accounts', async () => {
    const codes = await createRedeemCodes(db, { count: 3, credits: 12, note: 'promo' });
    expect(codes).toHaveLength(3);
    expect(new Set(codes).size).toBe(3);

    await expect(creditSummaryByEmail(db, 'ghost@example.com')).rejects.toThrow('ไม่พบบัญชี');
  });
});
