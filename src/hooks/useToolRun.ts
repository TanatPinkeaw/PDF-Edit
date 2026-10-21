import { useCallback, useState } from 'react';

import { downloadBytes, mimeForName } from '../lib/download';
import { PdfError } from '../lib/pdf-ops';
import {
  CreditsExceededError,
  completeRun,
  failRun,
  startRun,
  trackRun,
  type RunInput,
  type ToolOutput,
} from '../lib/runs';
import { useWorkspace } from '../state/workspace-context';

/** Thrown by a work function when an inner action already showed its own error. */
export class ToolCanceled extends Error {
  constructor() {
    super('ยกเลิก');
    this.name = 'ToolCanceled';
  }
}

export type ToolRun = {
  /** Build → record → download. */
  run: (
    tool: string,
    params: Record<string, unknown>,
    work: () => Promise<ToolOutput>,
    input?: RunInput,
  ) => Promise<ToolOutput | null>;
  /** Record an action that already produced (and downloaded) its own output. */
  track: (
    tool: string,
    params: Record<string, unknown>,
    work: () => Promise<ToolOutput>,
    input?: RunInput,
  ) => Promise<ToolOutput | null>;
  creditMessage: string | null;
  clearCreditMessage: () => void;
};

function describe(error: unknown): string {
  if (error instanceof PdfError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'เกิดข้อผิดพลาดที่ไม่รู้จัก';
}

/**
 * Wraps tool actions with credits + history. Messages go to the shared status
 * toast; an empty wallet also stays on the page so the top-up CTA is visible.
 */
export function useToolRun(): ToolRun {
  const { session } = useWorkspace();
  const [creditMessage, setQuotaMessage] = useState<string | null>(null);

  const track = useCallback<ToolRun['track']>(
    (tool, params, work, input) =>
      session.withBusy(async () => {
        setQuotaMessage(null);
        const started = await startRun(tool, params, input);
        if (!started.proceed) {
          setQuotaMessage(started.error.message);
          session.notify('error', started.error.message);
          return null;
        }
        const runId = started.runId;

        try {
          const output = await work();
          const mime = output.mime ?? mimeForName(output.name);
          if (runId) await completeRun(runId, output);
          session.rememberOutput({ ...output, mime });
          return output;
        } catch (error) {
          if (runId) await failRun(runId, error);
          if (!(error instanceof ToolCanceled)) session.notify('error', describe(error));
          return null;
        }
      }),
    [session],
  );

  const run = useCallback<ToolRun['run']>(
    (tool, params, work, input) =>
      session.withBusy(async () => {
        setQuotaMessage(null);
        try {
          const output = await trackRun(tool, params, work, input);
          const mime = output.mime ?? mimeForName(output.name);
          downloadBytes(output.name, output.bytes, mime);
          session.rememberOutput({ ...output, mime });
          session.notify('info', `ดาวน์โหลด ${output.name} แล้ว`);
          return output;
        } catch (error) {
          if (error instanceof CreditsExceededError) {
            setQuotaMessage(error.message);
            session.notify('error', error.message);
          } else {
            session.notify('error', describe(error));
          }
          return null;
        }
      }),
    [session],
  );

  return {
    run,
    track,
    creditMessage,
    clearCreditMessage: useCallback(() => setQuotaMessage(null), []),
  };
}
