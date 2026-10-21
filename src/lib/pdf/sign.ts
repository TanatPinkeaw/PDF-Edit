/**
 * Stamps a drawn or uploaded signature image onto pages. The signature is
 * flattened into the page content, so it looks the same in every viewer.
 */

import { PDFDocument } from '@cantoo/pdf-lib';

export type SignatureCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export type SignOptions = {
  /** Fraction of the page width the signature occupies (0.1 – 0.6). */
  widthRatio: number;
  corner: SignatureCorner;
  /** Distance from the page edges, in PDF points. */
  margin: number;
  /** 0-based indices; empty means every page. */
  pageIndices: readonly number[];
};

export const DEFAULT_SIGN_OPTIONS: SignOptions = {
  widthRatio: 0.28,
  corner: 'bottom-right',
  margin: 36,
  pageIndices: [],
};

export type SignaturePlacement = { x: number; y: number; width: number; height: number };

export function planSignature(
  pageWidth: number,
  pageHeight: number,
  imageWidth: number,
  imageHeight: number,
  options: SignOptions,
): SignaturePlacement {
  const ratio = Math.min(Math.max(options.widthRatio, 0.05), 0.9);
  const width = pageWidth * ratio;
  const height = imageWidth > 0 ? (imageHeight / imageWidth) * width : width;
  const margin = Math.max(0, options.margin);

  const right = pageWidth - margin - width;
  const left = margin;
  const bottom = margin;
  const top = pageHeight - margin - height;

  switch (options.corner) {
    case 'bottom-left':
      return { x: left, y: bottom, width, height };
    case 'top-right':
      return { x: right, y: top, width, height };
    case 'top-left':
      return { x: left, y: top, width, height };
    default:
      return { x: right, y: bottom, width, height };
  }
}

export async function signPdf(
  bytes: Uint8Array,
  signaturePng: Uint8Array,
  options: SignOptions = DEFAULT_SIGN_OPTIONS,
): Promise<Uint8Array> {
  if (signaturePng.byteLength === 0) throw new Error('ยังไม่มีลายเซ็น — อัปโหลดหรือวาดก่อน');

  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const signature = await doc.embedPng(signaturePng);
  const pages = doc.getPages();
  const indices = options.pageIndices.length > 0 ? options.pageIndices : pages.map((_, index) => index);

  let stamped = 0;
  for (const index of indices) {
    const page = pages[index];
    if (!page) continue;
    const { width, height } = page.getSize();
    const placement = planSignature(width, height, signature.width, signature.height, options);
    page.drawImage(signature, placement);
    stamped += 1;
  }

  if (stamped === 0) throw new Error('ไม่พบหน้าที่จะเซ็นในไฟล์นี้');
  return doc.save();
}
