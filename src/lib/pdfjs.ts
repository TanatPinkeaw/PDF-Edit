/** Shared pdf.js setup so thumbnails and image export use the same worker. */

import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type LoadedPdf = {
  document: PDFDocumentProxy;
  destroy: () => Promise<void>;
};

/** Loads a document for rendering. The bytes are copied because pdf.js takes ownership. */
export async function loadPdfForRendering(bytes: Uint8Array): Promise<LoadedPdf> {
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const document = await task.promise;
  return {
    document,
    destroy: async () => {
      await task.destroy();
    },
  };
}

export { pdfjs };
