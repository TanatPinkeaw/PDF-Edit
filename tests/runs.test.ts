import { afterEach, describe, expect, it, vi } from 'vitest';

import { CREDITS_EVENT, CreditsExceededError, startRun } from '../src/lib/runs';

const credits = { balance: 2, allowance: 3, member: false };
const emptyCredits = { balance: 0, allowance: 3, member: false };

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(handler: (url: string) => Response | Promise<Response>): void {
  globalThis.fetch = ((input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe('startRun', () => {
  it('proceeds with the run id and announces the new balance', async () => {
    const dispatch = vi.fn();
    (globalThis as { window?: unknown }).window = { dispatchEvent: dispatch };
    stubFetch(() => jsonResponse({ run: { id: 'run-1' }, credits }));

    const started = await startRun('organize', { action: 'download' });

    expect(started).toEqual({ proceed: true, runId: 'run-1' });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: CREDITS_EVENT, detail: credits }),
    );
  });

  it('refuses to start when the wallet is empty', async () => {
    const dispatch = vi.fn();
    (globalThis as { window?: unknown }).window = { dispatchEvent: dispatch };
    stubFetch(() =>
      jsonResponse(
        {
          error: {
            code: 'insufficient_credits',
            message: 'เครดิตหมดแล้ว — เติมเครดิตหรือสมัครสมาชิก',
            credits: emptyCredits,
          },
        },
        402,
      ),
    );

    const started = await startRun('organize', { action: 'download' });

    expect(started.proceed).toBe(false);
    if (started.proceed) throw new Error('unreachable');
    expect(started.error).toBeInstanceOf(CreditsExceededError);
    expect(started.error.message).toBe('เครดิตหมดแล้ว — เติมเครดิตหรือสมัครสมาชิก');
    expect(started.error.credits).toEqual(emptyCredits);
    // The badge learns the empty balance from the refusal itself.
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ detail: emptyCredits }),
    );
  });

  it('still runs the browser-only work when the API is unreachable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const started = await startRun('organize', { action: 'download' });

    // Losing the history row must not stop a download.
    expect(started).toEqual({ proceed: true, runId: null });
  });
});
