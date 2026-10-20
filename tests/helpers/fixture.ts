import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/** Builds a PDF whose pages have distinct widths, so page order is assertable. */
export async function makeFixture(pageCount = 6): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const page = doc.addPage([200 + index * 10, 400]);
    page.drawText(`PAGE ${index + 1}`, {
      x: 20,
      y: 340,
      size: 18,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  return doc.save();
}

export async function pageWidths(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => Math.round(page.getWidth()));
}

export async function pageCountOf(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

/** Widths of the fixture pages: 200, 210, 220, ... */
export function fixtureWidths(pageCount = 6): number[] {
  return Array.from({ length: pageCount }, (_, index) => 200 + index * 10);
}
