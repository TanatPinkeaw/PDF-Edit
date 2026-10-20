/**
 * Thai-capable font support for stamping text into PDFs.
 *
 * Standard PDF fonts cannot draw Thai glyphs, so watermark and page numbers
 * embed a subset of Sarabun (SIL OFL, see public/fonts/OFL.txt). Tests inject
 * the same bytes through `setFontBytes`, keeping the library usable in Node.
 */

import fontkit from '@cantoo/fontkit';
import { type PDFDocument, type PDFFont } from '@cantoo/pdf-lib';

export type FontWeight = 'regular' | 'bold';

const FILES: Record<FontWeight, string> = {
  regular: 'Sarabun-Regular.ttf',
  bold: 'Sarabun-Bold.ttf',
};

const overrides = new Map<FontWeight, Uint8Array>();
const fetched = new Map<FontWeight, Uint8Array>();

/** Test/preload seam: supplies font bytes without going through fetch. */
export function setFontBytes(weight: FontWeight, bytes: Uint8Array): void {
  overrides.set(weight, bytes);
}

export function clearFontCache(): void {
  overrides.clear();
  fetched.clear();
}

export async function loadFontBytes(weight: FontWeight): Promise<Uint8Array> {
  const provided = overrides.get(weight);
  if (provided) return provided;

  const cached = fetched.get(weight);
  if (cached) return cached;

  const base = import.meta.env?.BASE_URL ?? '/';
  const response = await fetch(`${base}fonts/${FILES[weight]}`);
  if (!response.ok) {
    throw new Error(`โหลดฟอนต์ ${FILES[weight]} ไม่สำเร็จ (HTTP ${response.status})`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  fetched.set(weight, bytes);
  return bytes;
}

/** Registers fontkit once per document; pdf-lib needs it for custom fonts. */
export function registerFontkit(doc: PDFDocument): void {
  doc.registerFontkit(fontkit as unknown as Parameters<PDFDocument['registerFontkit']>[0]);
}

export async function embedThaiFont(
  doc: PDFDocument,
  weight: FontWeight = 'regular',
): Promise<PDFFont> {
  registerFontkit(doc);
  return doc.embedFont(await loadFontBytes(weight), { subset: true });
}
