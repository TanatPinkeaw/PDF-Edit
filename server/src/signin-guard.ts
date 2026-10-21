/**
 * Limits password sign-in attempts per email+IP.
 *
 * The counter lives in this process only: a restart clears it and a
 * multi-process deployment would need a shared store. That is fine for a
 * self-hosted instance, where the realistic goal is slowing down a scripted
 * password guesser rather than stopping a distributed attack.
 */

export type GuardDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

export type SigninGuard = {
  check(key: string): GuardDecision;
  fail(key: string): void;
  reset(key: string): void;
};

const MAX_KEYS = 5_000;

export function createSigninGuard(
  options: { limit?: number; windowMs?: number; now?: () => number } = {},
): SigninGuard {
  const limit = options.limit ?? 8;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const now = options.now ?? Date.now;
  const failures = new Map<string, number[]>();

  const recent = (key: string): number[] => {
    const stamps = failures.get(key) ?? [];
    const cutoff = now() - windowMs;
    return stamps.filter((stamp) => stamp > cutoff);
  };

  return {
    check(key) {
      const stamps = recent(key);
      if (stamps.length === 0) {
        failures.delete(key);
        return { allowed: true };
      }
      if (stamps.length < limit) return { allowed: true };
      const oldest = stamps[0] ?? now();
      return { allowed: false, retryAfterMs: Math.max(0, oldest + windowMs - now()) };
    },
    fail(key) {
      if (failures.size > MAX_KEYS) {
        for (const candidate of failures.keys()) {
          if (recent(candidate).length === 0) failures.delete(candidate);
        }
      }
      failures.set(key, [...recent(key), now()].slice(-limit));
    },
    reset(key) {
      failures.delete(key);
    },
  };
}
