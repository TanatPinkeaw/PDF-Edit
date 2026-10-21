/**
 * Shared pdf.js setup so thumbnails and image export use the same worker.
 *
 * The worker is imported through Vite's worker pipeline (`?worker&url`) instead
 * of `?url`. Vite then emits a bundled `.js` chunk, which every static host
 * serves with a JavaScript MIME type. Importing the `pdfjs-dist` `.mjs` file
 * directly breaks on hosts with an incomplete `mime.types` (plain Nginx, for
 * example): the browser refuses a module worker served as `text/plain`, pdf.js
 * falls back to a fake worker, that import fails too, and every page thumbnail
 * dies with "Setting up fake worker failed".
 */

import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type LoadedPdf = {
  document: PDFDocumentProxy;
  destroy: () => Promise<void>;
};

/** Everything the user needs to know when a page cannot be rendered. */
export class PdfRenderError extends Error {
  /** Technical cause, safe to show in a diagnostics panel. */
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = 'PdfRenderError';
    this.detail = detail;
  }
}

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

/** Loads a document for rendering. The bytes are copied because pdf.js takes ownership. */
export async function loadPdfForRendering(bytes: Uint8Array): Promise<LoadedPdf> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    // Rendered documents are trusted user files; keep the default CSP behaviour.
    isEvalSupported: false,
  });

  try {
    const document = await task.promise;
    return {
      document,
      // `task.destroy()` can leave its promise pending when the worker has
      // already answered everything it was asked. Callers only want the worker
      // released, so teardown must never block the result that is being
      // returned (a compress/export that finished would otherwise look hung).
      destroy: async () => {
        void Promise.resolve(task.destroy()).catch(() => undefined);
      },
    };
  } catch (error) {
    void Promise.resolve(task.destroy()).catch(() => undefined);
    throw new PdfRenderError('เปิดตัวอย่างเอกสารไม่สำเร็จ', describe(error));
  }
}

/** Exposed for the diagnostics page, which reports how the worker is configured. */
export function describeWorkerSetup(): { workerSrc: string; bundled: true } {
  return { workerSrc: pdfjs.GlobalWorkerOptions.workerSrc, bundled: true };
}

export { pdfjs };
