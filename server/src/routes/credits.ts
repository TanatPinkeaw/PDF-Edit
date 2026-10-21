import type { FastifyInstance } from 'fastify';

import { resolveContext } from '../auth.ts';
import { listCreditEntries, openWallet, redeemCode, type Credits } from '../credits.ts';
import type { Db } from '../db.ts';
import type { Env } from '../env.ts';
import { badRequest, readObjectBody, readString } from '../http.ts';
import type { Mailer } from '../mail.ts';
import { assertCanSpendCredits } from '../verification.ts';

export function registerCreditRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: Env; mailer: Mailer },
): void {
  const { db, env, mailer } = deps;

  const walletFor = async (context: Awaited<ReturnType<typeof resolveContext>>) =>
    openWallet(
      db,
      context,
      context.user
        ? { credits: env.signupBonusCredits, reason: 'signup_bonus' }
        : { credits: env.anonCredits, reason: 'anon_grant' },
    );

  const creditsFor = async (
    context: Awaited<ReturnType<typeof resolveContext>>,
    balance: number,
  ): Promise<Credits> => ({
    balance,
    allowance: context.user ? null : env.anonCredits,
    member: context.user !== null,
  });

  app.get('/api/credits', async (request) => {
    const context = await resolveContext(db, request);
    const wallet = await walletFor(context);
    return {
      credits: await creditsFor(context, wallet.balance),
      entries: await listCreditEntries(db, wallet.id, 10),
    };
  });

  app.post('/api/credits/redeem', async (request) => {
    const context = await resolveContext(db, request);
    // Redeeming is the other way value leaves the system, so it is gated too.
    await assertCanSpendCredits(db, mailer, context);
    const body = readObjectBody(request.body);
    const code = readString(body, 'code', { required: true, maxLength: 40 });
    if (!code) throw badRequest('ต้องระบุ code');

    const result = await redeemCode(db, context, code, {
      signupBonus: env.signupBonusCredits,
      anonCredits: env.anonCredits,
    });
    const wallet = await walletFor(context);

    return {
      granted: result.credits,
      credits: await creditsFor(context, wallet.balance),
      entries: await listCreditEntries(db, wallet.id, 10),
    };
  });
}
