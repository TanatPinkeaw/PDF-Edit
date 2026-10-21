/**
 * Every tool run is recorded so the history page and the credit wallet work.
 *
 * Recording is best-effort: if the API is unreachable the PDF work still
 * completes, because the browser does all of it. The one exception is a 402 —
 * an empty wallet is a deliberate product gate and the caller must show the
 * top-up CTA.
 */

import { ApiError, apiFetch, isCredits, type Credits } from './api';

export const CREDITS_EVENT = 'pdfstudio:credits';

export class CreditsExceededError extends Error {
  readonly credits: Credits | null;

  constructor(message: string, credits: Credits | null) {
    super(message);
    this.name = 'CreditsExceededError';
    this.credits = credits;
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

export function announceCredits(credits: Credits): void {
  window.dispatchEvent(new CustomEvent<Credits>(CREDITS_EVENT, { detail: credits }));
}

function newClientRunId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The server sends `{ error: { code, message, credits } }`, so the balance sits
 * one level deeper than the rest of the details.
 */
function creditsFrom(error: ApiError): Credits | null {
  const details = error.details as { credits?: unknown; error?: { credits?: unknown } };
  const credits = details.error?.credits ?? details.credits;
  return isCredits(credits) ? credits : null;
}

export async function beginRun(
  tool: string,
  params: Record<string, unknown>,
  input?: RunInput,
): Promise<string | null> {
  try {
    const response = await apiFetch<{ run: { id: string }; credits: Credits }>('/api/runs', {
      method: 'POST',
      body: {
        tool,
        params,
        input: input ?? {},
        clientRunId: newClientRunId(),
      },
    });
    if (isCredits(response.credits)) announceCredits(response.credits);
    return response.run.id;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'insufficient_credits') {
      const credits = creditsFrom(error);
      // Reflect the empty wallet right away when the server sends it.
      if (credits) announceCredits(credits);
      throw new CreditsExceededError(error.message, credits);
    }
    console.warn('บันทึกประวัติการใช้งานไม่ได้ — ทำงานต่อในเครื่อง', error);
    return null;
  }
}

export async function completeRun(runId: string, output: ToolOutput): Promise<void> {
  try {
    const response = await apiFetch<{ credits: Credits }>(`/api/runs/${runId}`, {
      method: 'PATCH',
      body: {
        status: 'succeeded',
        output: { name: output.name, bytes: output.bytes.byteLength },
      },
    });
    if (isCredits(response.credits)) announceCredits(response.credits);
  } catch (error) {
    console.warn('อัปเดตสถานะงานไม่สำเร็จ', error);
  }
}

export async function failRun(runId: string, error: unknown): Promise<void> {
  try {
    const response = await apiFetch<{ credits: Credits }>(`/api/runs/${runId}`, {
      method: 'PATCH',
      body: {
        status: 'failed',
        error: {
          code: 'client_error',
          message: error instanceof Error ? error.message : String(error),
        },
      },
    });
    if (isCredits(response.credits)) announceCredits(response.credits);
  } catch (apiError) {
    console.warn('อัปเดตสถานะงานไม่สำเร็จ', apiError);
  }
}

export type RunStart =
  /** `runId` is null when the API is unreachable; the work still goes ahead. */
  | { proceed: true; runId: string | null }
  | { proceed: false; error: CreditsExceededError };

/**
 * Decides whether a tool action may start.
 *
 * An empty wallet stops the work; an unreachable API does not, because the
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
    if (error instanceof CreditsExceededError) return { proceed: false, error };
    console.warn('เริ่มบันทึกงานไม่ได้ — ทำงานต่อในเครื่อง', error);
    return { proceed: true, runId: null };
  }
}

/**
 * Wraps a tool action: charges a credit, records the run, and reports the
 * outcome. Throws CreditsExceededError before doing any work when the wallet is
 * empty.
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
