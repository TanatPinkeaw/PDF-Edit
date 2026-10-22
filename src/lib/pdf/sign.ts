/**
 * Stamps drawn, uploaded or pasted signature images onto pages. Each signature
 * has its own free position expressed in page-relative coordinates, so one
 * document can carry several signatures over overlapping page ranges. Every
 * signature is flattened into the page content, so it looks the same in every
 * viewer.
 */

import { PDFDocument, type PDFImage } from '@cantoo/pdf-lib';

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

export type NormalizedStamp = {
  /** Image centre, 0–1 from the left edge of the page. */
  x: number;
  /** Image centre, 0–1 from the top edge of the page. */
  y: number;
  /** Image width as a fraction of the page width (0.05 – 0.9). */
  widthRatio: number;
};

export type SignatureStamp = NormalizedStamp & {
  png: Uint8Array;
  /** 1-based inclusive page range. */
  fromPage: number;
  toPage: number;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Converts a page-relative signature position into PDF points, keeping the
 * image fully inside the page. `y` comes from the top; PDF measures from the
 * bottom, so it is flipped here.
 */
export function planStamp(
  pageWidth: number,
  pageHeight: number,
  imageWidth: number,
  imageHeight: number,
  stamp: NormalizedStamp,
): SignaturePlacement {
  const width = pageWidth * clamp(stamp.widthRatio, 0.05, 0.9);
  const height = imageWidth > 0 ? (imageHeight / imageWidth) * width : width;
  const centreX = clamp(stamp.x, 0, 1) * pageWidth;
  const centreFromTop = clamp(stamp.y, 0, 1) * pageHeight;

  return {
    x: clamp(centreX - width / 2, 0, Math.max(0, pageWidth - width)),
    y: clamp(pageHeight - centreFromTop - height / 2, 0, Math.max(0, pageHeight - height)),
    width,
    height,
  };
}

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

/**
 * Stamps any number of signatures at free positions. Each image is embedded
 * once per document, even when it appears on many pages or several times.
 */
export async function stampSignatures(
  bytes: Uint8Array,
  stamps: readonly SignatureStamp[],
): Promise<Uint8Array> {
  if (stamps.length === 0) throw new Error('ยังไม่มีลายเซ็นที่จะวาง');
  for (const stamp of stamps) {
    if (stamp.png.byteLength === 0) throw new Error('ลายเซ็นต้องเป็น PNG ที่มีข้อมูล');
  }

  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const embedded = new Map<Uint8Array, PDFImage>();
  const pages = doc.getPages();
  let stamped = 0;

  for (const [index, page] of pages.entries()) {
    const pageNumber = index + 1;
    const { width, height } = page.getSize();

    for (const stamp of stamps) {
      const from = Math.min(stamp.fromPage, stamp.toPage);
      const to = Math.max(stamp.fromPage, stamp.toPage);
      if (pageNumber < from || pageNumber > to) continue;

      let image = embedded.get(stamp.png);
      if (!image) {
        image = await doc.embedPng(stamp.png);
        embedded.set(stamp.png, image);
      }

      page.drawImage(image, planStamp(width, height, image.width, image.height, stamp));
      stamped += 1;
    }
  }

  if (stamped === 0) throw new Error('ช่วงหน้าที่เลือกไม่มีหน้าอยู่ในไฟล์นี้');
  return doc.save();
}
