import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  SESSION_COOKIE,
  attachWorkspaceToUser,
  burnPasswordCheck,
  clearSessionCookie,
  createPasswordUser,
  createSession,
  deleteSession,
  findUserByEmail,
  hashPassword,
  hashToken,
  normalizeEmail,
  requireUser,
  requireWorkspace,
  resolveContext,
  setSessionCookie,
  upsertUser,
  userHasPassword,
  verifyPassword,
  type GoogleVerifier,
  type PublicUser,
} from '../auth.ts';
import {
  listCreditEntries,
  mergeAnonymousWallet,
  openWallet,
  type CreditConfig,
  type Credits,
} from '../credits.ts';
import type { Db } from '../db.ts';
import type { Env } from '../env.ts';
import { ApiError, badRequest, readObjectBody, readString } from '../http.ts';
import type { Mailer } from '../mail.ts';
import { createSigninGuard } from '../signin-guard.ts';
import {
  confirmPasswordResetCode,
  describeVerification,
  sendPasswordResetCode,
} from '../verification.ts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 200;

function creditConfig(env: Env): CreditConfig {
  return { signupBonus: env.signupBonusCredits, anonCredits: env.anonCredits };
}

/** Passwords are never trimmed: leading/trailing spaces are part of the secret. */
function readPassword(body: Record<string, unknown>, options: { checkStrength: boolean }): string {
  const raw = body.password;
  if (typeof raw !== 'string' || raw === '') throw badRequest('ต้องระบุ password');
  if (raw.length > PASSWORD_MAX_LENGTH) {
    throw badRequest(`รหัสผ่านยาวเกิน ${PASSWORD_MAX_LENGTH} ตัวอักษร`);
  }
  if (options.checkStrength && raw.length < PASSWORD_MIN_LENGTH) {
    throw badRequest(`รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`);
  }
  return raw;
}

/**
 * Turns the current browser into the account's workspace. While credits are
 * shelved no wallet is opened or merged — that ledger simply stays dormant.
 */
async function adoptWorkspace(
  db: Db,
  env: Env,
  context: Awaited<ReturnType<typeof resolveContext>>,
  user: PublicUser,
  config: CreditConfig,
): Promise<void> {
  if (env.creditsEnabled) {
    await openWallet(
      db,
      { ...context, user },
      { credits: config.signupBonus, reason: 'signup_bonus' },
    );
  }
  if (!context.workspaceId) return;
  await attachWorkspaceToUser(db, context.workspaceId, user.id);
  if (env.creditsEnabled) {
    await mergeAnonymousWallet(db, context.workspaceId, user.id);
  }
}

export function registerAccountRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: Env; mailer: Mailer; googleVerifier: GoogleVerifier | null },
): void {
  const { db, env, mailer, googleVerifier } = deps;
  const signinGuard = createSigninGuard();
  // Reset requests are throttled per email+IP whether or not the account exists,
  // so a 429 never reveals which addresses are registered.
  const resetGuard = createSigninGuard({ limit: 5, windowMs: 10 * 60 * 1000 });
  // Guessing the current password from a stolen session is throttled per user.
  const changeGuard = createSigninGuard({ limit: 5, windowMs: 15 * 60 * 1000 });

  const state = async (
    context: Awaited<ReturnType<typeof resolveContext>>,
    user: PublicUser | null = context.user,
  ) => {
    const resolved = user === context.user ? context : { ...context, user };
    const grant: CreditConfig = creditConfig(env);

    // Free mode leaves the wallet untouched: no grant, no ledger, no balance.
    let credits: Credits | null = null;
    let recentEntries: Awaited<ReturnType<typeof listCreditEntries>> = [];
    if (env.creditsEnabled) {
      const wallet = await openWallet(
        db,
        resolved,
        resolved.user
          ? { credits: grant.signupBonus, reason: 'signup_bonus' }
          : { credits: grant.anonCredits, reason: 'anon_grant' },
      );
      credits = {
        balance: wallet.balance,
        allowance: resolved.user ? null : grant.anonCredits,
        member: resolved.user !== null,
      };
      recentEntries = await listCreditEntries(db, wallet.id, 5);
    }

    return {
      workspaceId: resolved.workspaceId,
      user: resolved.user,
      credits,
      creditsEnabled: env.creditsEnabled,
      requireSignIn: env.requireSignIn,
      recentEntries,
      // Anonymous browsers have no mailbox, so there is nothing to verify.
      verification: resolved.user ? await describeVerification(db, mailer, resolved.user) : null,
      // Null for anonymous browsers; false means Google-only, so no password UI.
      passwordSet: resolved.user ? await userHasPassword(db, resolved.user.id) : null,
      authConfigured: googleVerifier !== null,
      googleClientId: env.googleClientId,
    };
  };

  const startSession = async (reply: FastifyReply, userId: string): Promise<void> => {
    const session = await createSession(db, userId, env.sessionTtlDays);
    setSessionCookie(reply, session.token, session.expiresAt, env.isProduction);
  };

  app.post('/api/bootstrap', async (request) => {
    const context = await resolveContext(db, request);
    requireWorkspace(context);
    return state(context);
  });

  app.get('/api/me', async (request) => {
    const context = await resolveContext(db, request);
    if (!context.user && !context.workspaceId) {
      throw new ApiError(401, 'unauthorized', 'ยังไม่มี workspace หรือ session');
    }
    return state(context);
  });

  app.post('/api/auth/signup', async (request, reply) => {
    const context = await resolveContext(db, request);
    const body = readObjectBody(request.body);

    const email = readString(body, 'email', { required: true, maxLength: 320 }) ?? '';
    if (!EMAIL_PATTERN.test(email)) throw badRequest('อีเมลไม่ถูกต้อง');
    const password = readPassword(body, { checkStrength: true });
    const name = readString(body, 'name', { maxLength: 80 });

    const passwordHash = await hashPassword(password);
    const user = await createPasswordUser(db, {
      email: normalizeEmail(email),
      name,
      passwordHash,
    });

    await adoptWorkspace(db, env, context, user, creditConfig(env));
    await startSession(reply, user.id);
    reply.code(201);
    return state({ ...context, user }, user);
  });

  app.post('/api/auth/signin', async (request, reply) => {
    const context = await resolveContext(db, request);
    const body = readObjectBody(request.body);

    const email = readString(body, 'email', { required: true, maxLength: 320 }) ?? '';
    const password = readPassword(body, { checkStrength: false });

    const key = `${normalizeEmail(email)}|${request.ip}`;
    const decision = signinGuard.check(key);
    if (!decision.allowed) {
      throw new ApiError(
        429,
        'too_many_attempts',
        `ลองเข้าสู่ระบบผิดหลายครั้งเกินไป — ลองใหม่ในอีก ${Math.ceil(decision.retryAfterMs / 60_000)} นาที`,
      );
    }

    const found = await findUserByEmail(db, email);
    if (!found || !found.passwordHash) {
      // Same cost and same message as a wrong password: no account enumeration.
      await burnPasswordCheck(password);
      signinGuard.fail(key);
      throw new ApiError(401, 'invalid_credentials', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    const matches = await verifyPassword(password, found.passwordHash);
    if (!matches) {
      signinGuard.fail(key);
      throw new ApiError(401, 'invalid_credentials', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    signinGuard.reset(key);
    await adoptWorkspace(db, env, context, found.user, creditConfig(env));
    await startSession(reply, found.user.id);
    return state({ ...context, user: found.user }, found.user);
  });

  /**
   * Always answers 202 with the same shape: whether an account exists, was just
   * rate-limited, or the mail server refused is only visible in the server log.
   * Otherwise this endpoint would be an account-enumeration oracle.
   */
  app.post('/api/auth/password/forgot', async (request, reply) => {
    const body = readObjectBody(request.body);
    const email = readString(body, 'email', { required: true, maxLength: 320 }) ?? '';
    if (!EMAIL_PATTERN.test(email)) throw badRequest('อีเมลไม่ถูกต้อง');

    const key = `${normalizeEmail(email)}|${request.ip}`;
    const decision = resetGuard.check(key);
    if (!decision.allowed) {
      throw new ApiError(
        429,
        'too_many_attempts',
        `ขอบ่อยเกินไป — ลองใหม่ในอีก ${Math.ceil(decision.retryAfterMs / 60_000)} นาที`,
      );
    }
    resetGuard.fail(key);

    reply.code(202);
    const found = await findUserByEmail(db, email);
    // Accounts created through Google have no password to reset.
    if (!found || !found.passwordHash) return { ok: true };

    try {
      const issued = await sendPasswordResetCode(db, mailer, found.user);
      return { ok: true, ...issued };
    } catch (error) {
      console.warn('[auth] ส่งรหัสตั้งรหัสผ่านใหม่ไม่สำเร็จ', error);
      return { ok: true };
    }
  });

  app.post('/api/auth/password/reset', async (request, reply) => {
    const context = await resolveContext(db, request);
    const body = readObjectBody(request.body);
    const email = readString(body, 'email', { required: true, maxLength: 320 }) ?? '';
    const code = readString(body, 'code', { required: true, maxLength: 12 }) ?? '';
    const password = readPassword(body, { checkStrength: true });

    const found = await findUserByEmail(db, email);
    if (!found || !found.passwordHash) {
      // Same wording and roughly the same cost as a bad code.
      await burnPasswordCheck(password);
      throw new ApiError(400, 'code_invalid', 'รหัสไม่ถูกต้องหรือหมดอายุ');
    }

    await confirmPasswordResetCode(db, found.user, code);
    const passwordHash = await hashPassword(password);
    await db.query('update app_user set password_hash = $2 where id = $1', [
      found.user.id,
      passwordHash,
    ]);
    // The old password is gone, so every existing session goes with it.
    await db.query('delete from auth_session where user_id = $1', [found.user.id]);
    await db.query(
      'update email_verification set consumed_at = now() where user_id = $1 and consumed_at is null',
      [found.user.id],
    );

    // No workspace adoption here: the request may come from a browser that is
    // signed in as someone else, and its history must not move accounts.
    await startSession(reply, found.user.id);
    return state({ ...context, user: found.user }, found.user);
  });

  /**
   * Changing a password needs the current one, so a stolen session alone cannot
   * take the account over. Other sessions are dropped but this browser stays
   * signed in — the opposite of the reset flow, which has no session to trust.
   */
  app.post('/api/auth/password/change', async (request) => {
    const context = await resolveContext(db, request);
    const user = requireUser(context);
    const body = readObjectBody(request.body);

    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    if (current === '') throw badRequest('ต้องระบุรหัสผ่านปัจจุบัน');
    if (current.length > PASSWORD_MAX_LENGTH) {
      throw badRequest(`รหัสผ่านยาวเกิน ${PASSWORD_MAX_LENGTH} ตัวอักษร`);
    }
    const next = readPassword(body, { checkStrength: true });

    const key = `change|${user.id}`;
    const decision = changeGuard.check(key);
    if (!decision.allowed) {
      throw new ApiError(
        429,
        'too_many_attempts',
        `ลองผิดหลายครั้งเกินไป — ลองใหม่ในอีก ${Math.ceil(decision.retryAfterMs / 60_000)} นาที`,
      );
    }

    const found = await findUserByEmail(db, user.email);
    if (!found || !found.passwordHash) {
      throw new ApiError(400, 'no_password', 'บัญชีนี้ไม่มีรหัสผ่าน (สมัครด้วย Google) จึงเปลี่ยนไม่ได้');
    }
    if (!(await verifyPassword(current, found.passwordHash))) {
      changeGuard.fail(key);
      throw new ApiError(401, 'invalid_credentials', 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    if (next === current) throw badRequest('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');

    const passwordHash = await hashPassword(next);
    await db.query('update app_user set password_hash = $2 where id = $1', [user.id, passwordHash]);

    // Keep the browser that made the change; sign out every other device.
    const sessionToken = request.cookies?.[SESSION_COOKIE];
    const deleted = await db.query(
      'delete from auth_session where user_id = $1 and token_hash <> $2',
      [user.id, sessionToken ? hashToken(sessionToken) : 'none'],
    );
    // A pending reset code would let the old mailbox still take the account.
    await db.query(
      'update email_verification set consumed_at = now() where user_id = $1 and consumed_at is null',
      [user.id],
    );
    changeGuard.reset(key);

    return { ok: true, signedOutSessions: deleted.rowCount ?? 0 };
  });

  app.post('/api/auth/google', async (request, reply) => {
    if (!googleVerifier) {
      throw new ApiError(
        503,
        'auth_not_configured',
        'ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID — เพิ่มใน .env แล้วรีสตาร์ท API',
      );
    }

    const context = await resolveContext(db, request);
    const body = readObjectBody(request.body);
    const credential = readString(body, 'credential', { required: true, maxLength: 5_000 });

    const profile = await googleVerifier(credential ?? '');
    const user = await upsertUser(db, profile);

    await adoptWorkspace(db, env, context, user, creditConfig(env));
    await startSession(reply, user.id);

    return state({ ...context, user }, user);
  });

  app.post('/api/auth/signout', async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    clearSessionCookie(reply, env.isProduction);
    return { ok: true };
  });

  app.delete('/api/me', async (request, reply) => {
    const context = await resolveContext(db, request);
    if (!context.user && !context.workspaceId) {
      throw new ApiError(401, 'unauthorized', 'ไม่มีข้อมูลให้ลบ');
    }

    let deletedWorkspaces = 0;
    if (context.user) {
      const deleted = await db.query<{ id: string }>(
        'delete from workspace where user_id = $1 returning id',
        [context.user.id],
      );
      deletedWorkspaces = deleted.rowCount ?? 0;
      await db.query('delete from app_user where id = $1', [context.user.id]);
    } else if (context.workspaceId) {
      const deleted = await db.query<{ id: string }>('delete from workspace where id = $1 returning id', [
        context.workspaceId,
      ]);
      deletedWorkspaces = deleted.rowCount ?? 0;
    }

    clearSessionCookie(reply, env.isProduction);
    return { deletedWorkspaces };
  });
}
