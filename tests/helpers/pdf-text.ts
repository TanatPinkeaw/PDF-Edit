import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

import type { PDFDocumentProxy } from 'pdfjs-dist';

const require = createRequire(import.meta.url);
const STANDARD_FONTS = `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/`;

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/**
 * pdf.js ships a separate legacy build for Node. Loading it lazily keeps the
 * DOM build used by the browser untouched.
 */
async function nodePdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfjsModule>;
  return pdfjsPromise;
}

export type ExtractedText = {
  pages: string[];
  all: string;
};

export type TextItem = {
  str: string;
  /** Baseline origin in PDF user space. */
  x: number;
  y: number;
  width: number;
  height: number;
};

async function withDocument<T>(
  bytes: Uint8Array,
  task: (doc: PDFDocumentProxy) => Promise<T>,
): Promise<T> {
  const pdfjs = await nodePdfjs();
  const loading = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
    standardFontDataUrl: STANDARD_FONTS,
  });
  const doc = await loading.promise;
  try {
    return await task(doc);
  } finally {
    await loading.destroy();
  }
}

/** Text items with their positions, for checking stamp placement. */
export async function extractItems(bytes: Uint8Array): Promise<TextItem[][]> {
  return withDocument(bytes, async (doc) => {
    const pages: TextItem[][] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items.flatMap((item) => {
          if (!('str' in item)) return [];
          return [
            {
              str: item.str,
              x: item.transform[4] ?? 0,
              y: item.transform[5] ?? 0,
              width: item.width,
              height: item.height,
            },
          ];
        }),
      );
      page.cleanup();
    }
    return pages;
  });
}

export async function extractText(bytes: Uint8Array): Promise<ExtractedText> {
  const items = await extractItems(bytes);
  const pages = items.map((page) =>
    page
      .map((item) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  return { pages, all: pages.join('\n') };
}
