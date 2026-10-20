import { afterEach, describe, expect, it, vi } from 'vitest';

import { QUOTA_EVENT, QuotaExceededError, startRun } from '../src/lib/runs';

const quota = { unlimited: false, limit: 3, used: 1, remaining: 2, resetAt: null };

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
  it('proceeds with the run id when the API records it', async () => {
    const dispatch = vi.fn();
    (globalThis as { window?: unknown }).window = { dispatchEvent: dispatch };
    stubFetch(() => jsonResponse({ run: { id: 'run-1' }, quota }));

    const started = await startRun('organize', { action: 'download' });

    expect(started).toEqual({ proceed: true, runId: 'run-1' });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: QUOTA_EVENT, detail: quota }));
  });

  it('refuses to start when the anonymous quota is used up', async () => {
    const dispatch = vi.fn();
    (globalThis as { window?: unknown }).window = { dispatchEvent: dispatch };
    stubFetch(() =>
      jsonResponse(
        { error: { code: 'quota_exceeded', message: 'ใช้ครบ 3 ครั้งแล้ว', quota } },
        429,
      ),
    );

    const started = await startRun('organize', { action: 'download' });

    expect(started.proceed).toBe(false);
    if (started.proceed) throw new Error('unreachable');
    expect(started.error).toBeInstanceOf(QuotaExceededError);
    expect(started.error.message).toBe('ใช้ครบ 3 ครั้งแล้ว');
    expect(started.error.quota).toEqual(quota);
    expect(started.error.resetAt).toBeNull();
    // The badge learns the real window from the refusal itself.
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ detail: quota }));
  });

  it('still runs the browser-only work when the API is unreachable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const started = await startRun('organize', { action: 'download' });

    // Losing the history row must not stop a download.
    expect(started).toEqual({ proceed: true, runId: null });
  });
});
