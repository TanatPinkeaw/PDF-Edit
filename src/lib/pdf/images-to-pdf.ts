/**
 * Builds a PDF from raster images. Everything runs in the browser: the images
 * never leave the machine, and each image becomes exactly one page.
 */

import { PDFDocument } from '@cantoo/pdf-lib';

export type ImageMime = 'image/png' | 'image/jpeg';

export type ImageInput = {
  bytes: Uint8Array;
  mime: ImageMime;
};

export type ImagePageSize = 'auto' | 'a4' | 'letter';

export type ImagesToPdfOptions = {
  pageSize: ImagePageSize;
  /** Margin in PDF points (1 pt = 1/72 inch). */
  margin: number;
};

export const PAGE_SIZE_POINTS: Record<Exclude<ImagePageSize, 'auto'>, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
};

export const MAX_MARGIN = 72;

/** Where an image lands on its page, in PDF points from the bottom-left. */
export type ImagePlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
};

/** Fits an image inside `box` without distorting it, centred. */
export function fitInside(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
): { width: number; height: number } {
  if (imageWidth <= 0 || imageHeight <= 0) return { width: 0, height: 0 };
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  return { width: imageWidth * scale, height: imageHeight * scale };
}

/**
 * Computes the page and image rectangle for one image. `auto` uses the image's
 * own pixel dimensions as points (so 96 dpi images come out slightly large,
 * which is what every "images to PDF" tool does), plus the margin.
 */
export function planPlacement(
  imageWidth: number,
  imageHeight: number,
  options: ImagesToPdfOptions,
): ImagePlacement {
  const margin = Math.max(0, Math.min(options.margin, MAX_MARGIN));

  if (options.pageSize === 'auto') {
    return {
      x: margin,
      y: margin,
      width: imageWidth,
      height: imageHeight,
      pageWidth: imageWidth + margin * 2,
      pageHeight: imageHeight + margin * 2,
    };
  }

  const size = PAGE_SIZE_POINTS[options.pageSize];
  const fitted = fitInside(imageWidth, imageHeight, size.width - margin * 2, size.height - margin * 2);
  return {
    x: (size.width - fitted.width) / 2,
    y: (size.height - fitted.height) / 2,
    width: fitted.width,
    height: fitted.height,
    pageWidth: size.width,
    pageHeight: size.height,
  };
}

/** PNG/JPEG dimensions straight from the header, so no canvas round-trip is needed. */
export function imageSize(bytes: Uint8Array, mime: ImageMime): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (mime === 'image/png') {
    // 8-byte signature, then IHDR whose width/height are big-endian at 16 and 20.
    if (bytes.byteLength < 24) throw new Error('ไฟล์ PNG เสียหาย (สั้นเกินไป)');
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  }

  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('ไฟล์ JPEG เสียหาย (ไม่พบ marker)');
  let offset = 2;
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    const length = view.getUint16(offset + 2, false);
    // SOF0..SOF15 except DHT/JPG/DAC carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: view.getUint16(offset + 7, false), height: view.getUint16(offset + 5, false) };
    }
    offset += 2 + length;
  }
  throw new Error('หา ขนาดภาพ JPEG ไม่พบ');
}

export async function imagesToPdf(
  images: readonly ImageInput[],
  options: ImagesToPdfOptions,
): Promise<Uint8Array> {
  if (images.length === 0) throw new Error('ยังไม่มีภาพ — เลือกภาพก่อนสร้าง PDF');

  const doc = await PDFDocument.create();
  for (const image of images) {
    const embedded =
      image.mime === 'image/png' ? await doc.embedPng(image.bytes) : await doc.embedJpg(image.bytes);
    const placement = planPlacement(embedded.width, embedded.height, options);
    const page = doc.addPage([placement.pageWidth, placement.pageHeight]);
    page.drawImage(embedded, {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    });
  }
  return doc.save();
}
