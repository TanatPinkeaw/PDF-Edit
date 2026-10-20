/** Rotation adds to each page's existing /Rotate instead of replacing it. */

import { degrees } from '@cantoo/pdf-lib';

import { PdfError, loadPdf } from '../pdf-ops';

export type RotationAngle = 90 | 180 | 270;

/** 1-based page numbers, or every page. */
export type PageSelection = 'all' | readonly number[];

export function isRotationAngle(value: number): value is RotationAngle {
  return value === 90 || value === 180 || value === 270;
}

export function normalizeAngle(value: number): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

/** Validates a selection against the document and returns 1-based page numbers. */
export function resolveSelectedPages(total: number, pages: PageSelection): number[] {
  if (pages === 'all') return Array.from({ length: total }, (_, index) => index + 1);
  const unique = [...new Set(pages)].sort((a, b) => a - b);
  if (unique.length === 0) {
    throw new PdfError('empty', 'ยังไม่ได้เลือกหน้า — เลือกอย่างน้อย 1 หน้า');
  }
  for (const page of unique) {
    if (!Number.isInteger(page) || page < 1 || page > total) {
      throw new PdfError('out-of-range', `หน้า ${page} อยู่นอกเอกสาร (มี ${total} หน้า)`);
    }
  }
  return unique;
}

export type RotateOptions = {
  angle: RotationAngle;
  pages?: PageSelection;
};

export async function rotateDocument(
  bytes: Uint8Array,
  options: RotateOptions,
): Promise<Uint8Array> {
  if (!isRotationAngle(options.angle)) {
    throw new PdfError('invalid', `มุมหมุนต้องเป็น 90, 180 หรือ 270 (ได้ ${options.angle})`);
  }

  const doc = await loadPdf(bytes);
  const targets = resolveSelectedPages(doc.getPageCount(), options.pages ?? 'all');
  const pages = doc.getPages();

  for (const number of targets) {
    const page = pages[number - 1];
    if (!page) continue;
    page.setRotation(degrees(normalizeAngle(page.getRotation().angle + options.angle)));
  }

  return doc.save();
}

/** Reads each page's current rotation, used by tests and previews. */
export async function readRotations(bytes: Uint8Array): Promise<number[]> {
  const doc = await loadPdf(bytes);
  return doc.getPages().map((page) => normalizeAngle(page.getRotation().angle));
}
