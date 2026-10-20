/**
 * Every tool run is recorded so the history page and the anonymous quota work.
 *
 * Recording is best-effort: if the API is unreachable the PDF work still
 * completes, because the browser does all of it. The one exception is a 429 —
 * that is a deliberate product gate and the caller must show the sign-in CTA.
 */

import { ApiError, apiFetch, isQuota, type Quota } from './api';

export const QUOTA_EVENT = 'pdfstudio:quota';

export class QuotaExceededError extends Error {
  readonly quota: Quota | null;
  readonly resetAt: string | null;

  constructor(message: string, quota: Quota | null) {
    super(message);
    this.name = 'QuotaExceededError';
    this.quota = quota;
    this.resetAt = quota?.resetAt ?? null;
  }
}

export type ToolOutput = {
  name: string;
  bytes: Uint8Array;
  mime?: string;
};

export type RunInput = {
  name?: string;
  pages?: number;
  bytes?: number;
};

export function announceQuota(quota: Quota): void {
  window.dispatchEvent(new CustomEvent<Quota>(QUOTA_EVENT, { detail: quota }));
}

function newClientRunId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The server sends `{ error: { code, message, quota } }`, so the quota sits one
 * level deeper than the rest of the details.
 */
function quotaFrom(error: ApiError): Quota | null {
  const details = error.details as { quota?: unknown; error?: { quota?: unknown } };
  const quota = details.error?.quota ?? details.quota;
  return isQuota(quota) ? quota : null;
}

export async function beginRun(
  tool: string,
  params: Record<string, unknown>,
  input?: RunInput,
): Promise<string | null> {
  try {
    const response = await apiFetch<{ run: { id: string }; quota: Quota }>('/api/runs', {
      method: 'POST',
      body: {
        tool,
        params,
        input: input ?? {},
        clientRunId: newClientRunId(),
      },
    });
    announceQuota(response.quota);
    return response.run.id;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'quota_exceeded') {
      const quota = quotaFrom(error);
      // The refusal carries the authoritative window; reflect it immediately.
      if (quota) announceQuota(quota);
      throw new QuotaExceededError(error.message, quota);
    }
    console.warn('บันทึกประวัติการใช้งานไม่ได้ — ทำงานต่อในเครื่อง', error);
    return null;
  }
}

export async function completeRun(runId: string, output: ToolOutput): Promise<void> {
  try {
    const response = await apiFetch<{ quota: Quota }>(`/api/runs/${runId}`, {
      method: 'PATCH',
      body: {
        status: 'succeeded',
        output: { name: output.name, bytes: output.bytes.byteLength },
      },
    });
    if (response.quota) announceQuota(response.quota);
  } catch (error) {
    console.warn('อัปเดตสถานะงานไม่สำเร็จ', error);
  }
}

export async function failRun(runId: string, error: unknown): Promise<void> {
  try {
    await apiFetch<{ quota: Quota }>(`/api/runs/${runId}`, {
      method: 'PATCH',
      body: {
        status: 'failed',
        error: {
          code: 'client_error',
          message: error instanceof Error ? error.message : String(error),
        },
      },
    });
  } catch (apiError) {
    console.warn('อัปเดตสถานะงานไม่สำเร็จ', apiError);
  }
}

export type RunStart =
  /** `runId` is null when the API is unreachable; the work still goes ahead. */
  | { proceed: true; runId: string | null }
  | { proceed: false; error: QuotaExceededError };

/**
 * Decides whether a tool action may start.
 *
 * A quota refusal stops the work; an unreachable API does not, because the
 * browser does all the PDF work — only the history row is lost.
 */
export async function startRun(
  tool: string,
  params: Record<string, unknown>,
  input?: RunInput,
): Promise<RunStart> {
  try {
    return { proceed: true, runId: await beginRun(tool, params, input) };
  } catch (error) {
    if (error instanceof QuotaExceededError) return { proceed: false, error };
    console.warn('เริ่มบันทึกงานไม่ได้ — ทำงานต่อในเครื่อง', error);
    return { proceed: true, runId: null };
  }
}

/**
 * Wraps a tool action: checks the quota, records the run, and reports the
 * outcome. Throws QuotaExceededError before doing any work when the anonymous
 * allowance is used up.
 */
export async function trackRun<T extends ToolOutput>(
  tool: string,
  params: Record<string, unknown>,
  work: () => Promise<T>,
  input?: RunInput,
): Promise<T> {
  const runId = await beginRun(tool, params, input);
  try {
    const output = await work();
    if (runId) await completeRun(runId, output);
    return output;
  } catch (error) {
    if (runId) await failRun(runId, error);
    throw error;
  }
}
