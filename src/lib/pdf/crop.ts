/**
 * Cropping by moving each page's CropBox. Nothing is deleted from the file — a
 * cropped PDF still contains the hidden content — so this is a layout tool, not
 * a redaction tool.
 */

import { PDFDocument } from '@cantoo/pdf-lib';

export type CropInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type CropTarget = {
  /** 0-based page index. */
  pageIndex: number;
  insets: CropInsets;
};

export const DEFAULT_INSETS: CropInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Validates insets against a page size. Returns `null` when the crop would be
 * empty, so callers can skip the page instead of producing a broken file.
 */
export function normalizeInsets(
  insets: CropInsets,
  width: number,
  height: number,
): CropInsets | null {
  const left = clamp(insets.left, 0, width);
  const right = clamp(insets.right, 0, width);
  const top = clamp(insets.top, 0, height);
  const bottom = clamp(insets.bottom, 0, height);
  if (width - left - right < 1 || height - top - bottom < 1) return null;
  return { top, right, bottom, left };
}

export async function cropPdf(
  bytes: Uint8Array,
  targets: readonly CropTarget[],
): Promise<Uint8Array> {
  if (targets.length === 0) throw new Error('ยังไม่ได้กำหนดการครอปหน้าใดเลย');

  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages();

  for (const target of targets) {
    const page = pages[target.pageIndex];
    if (!page) continue;
    const { width, height } = page.getSize();
    const insets = normalizeInsets(target.insets, width, height);
    if (!insets) continue;
    page.setCropBox(insets.left, insets.bottom, width - insets.left - insets.right, height - insets.top - insets.bottom);
  }

  return doc.save();
}
