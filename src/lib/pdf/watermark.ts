/**
 * Watermarks are drawn on top of the page content. Text uses the embedded
 * Sarabun font so Thai labels render correctly; images accept PNG and JPEG.
 *
 * A single (non-tiled) text stamp shrinks to fit the page width, so long
 * labels never run off the page.
 */

import { degrees } from '@cantoo/pdf-lib';

import { PdfError, loadPdf } from '../pdf-ops';
import { embedThaiFont, type FontWeight } from './fonts';
import {
  clamp,
  hexToRgb,
  placeBox,
  rotatedBounds,
  rotatedTextOrigin,
  tileCenters,
  type StampPosition,
} from './paint';
import { resolveSelectedPages } from './rotate';

type CommonOptions = {
  opacity?: number;
  rotation?: number;
  position?: StampPosition;
  gap?: number;
  pages?: readonly number[] | null;
};

export type WatermarkTextOptions = CommonOptions & {
  kind: 'text';
  text: string;
  fontSize?: number;
  weight?: FontWeight;
  color?: string;
};

export type WatermarkImageOptions = CommonOptions & {
  kind: 'image';
  bytes: Uint8Array;
  type: 'png' | 'jpeg';
  /** Image width as a fraction of page width (0.05–1). */
  widthRatio?: number;
};

export type WatermarkOptions = WatermarkTextOptions | WatermarkImageOptions;

function targetPages(total: number, pages: readonly number[] | null | undefined): number[] {
  return resolveSelectedPages(total, pages && pages.length > 0 ? pages : 'all');
}

export async function watermarkPdf(
  bytes: Uint8Array,
  options: WatermarkOptions,
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  const targets = targetPages(doc.getPageCount(), options.pages);

  const opacity = clamp(options.opacity ?? 0.15, 0.02, 1);
  const rotation = clamp(options.rotation ?? 0, -180, 180);
  const position = options.position ?? 'middle-center';
  const gap = clamp(options.gap ?? 64, 0, 400);
  const margin = 24;

  if (options.kind === 'text') {
    const text = options.text.trim();
    if (text === '') throw new PdfError('invalid', 'ยังไม่ได้พิมพ์ข้อความลายน้ำ');

    const font = await embedThaiFont(doc, options.weight ?? 'bold');
    const requestedSize = clamp(options.fontSize ?? 48, 8, 200);
    const color = hexToRgb(options.color ?? '#7a736a');

    for (const pageNumber of targets) {
      const page = pages[pageNumber - 1];
      if (!page) continue;

      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();
      const maxWidth = Math.max(40, pageWidth - margin * 2);
      const naturalWidth = Math.max(1, font.widthOfTextAtSize(text, requestedSize));
      const size =
        position === 'tile'
          ? requestedSize
          : Math.min(requestedSize, (maxWidth / naturalWidth) * requestedSize);

      const width = font.widthOfTextAtSize(text, size);
      const height = font.heightAtSize(size);
      const bounds = rotatedBounds({ width, height, angleDeg: rotation });

      const drawAt = (centerX: number, centerY: number) => {
        const origin = rotatedTextOrigin({
          centerX,
          centerY,
          width,
          height,
          angleDeg: rotation,
        });
        page.drawText(text, {
          x: origin.x,
          y: origin.y,
          size,
          font,
          color,
          opacity,
          rotate: degrees(rotation),
        });
      };

      if (position === 'tile') {
        const centers = tileCenters({
          page: { width: pageWidth, height: pageHeight },
          stepX: bounds.width + gap,
          stepY: bounds.height + gap,
        });
        for (const center of centers) drawAt(center.x, center.y);
        continue;
      }

      const box = placeBox({
        page: { width: pageWidth, height: pageHeight },
        box: bounds,
        position,
        margin,
      });
      drawAt(box.x + bounds.width / 2, box.y + bounds.height / 2);
    }

    return doc.save();
  }

  const image =
    options.type === 'png'
      ? await doc.embedPng(options.bytes)
      : await doc.embedJpg(options.bytes);
  const ratio = image.height / image.width;

  for (const pageNumber of targets) {
    const page = pages[pageNumber - 1];
    if (!page) continue;

    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const width = pageWidth * clamp(options.widthRatio ?? 0.4, 0.05, 1);
    const height = width * ratio;
    const bounds = rotatedBounds({ width, height, angleDeg: rotation });

    if (position === 'tile') {
      const centers = tileCenters({
        page: { width: pageWidth, height: pageHeight },
        stepX: bounds.width + gap,
        stepY: bounds.height + gap,
      });
      for (const center of centers) {
        page.drawImage(image, {
          x: center.x - width / 2,
          y: center.y - height / 2,
          width,
          height,
          opacity,
          rotate: degrees(rotation),
        });
      }
      continue;
    }

    const box = placeBox({
      page: { width: pageWidth, height: pageHeight },
      box: bounds,
      position,
      margin,
    });
    page.drawImage(image, {
      x: box.x + (bounds.width - width) / 2,
      y: box.y + (bounds.height - height) / 2,
      width,
      height,
      opacity,
      rotate: degrees(rotation),
    });
  }

  return doc.save();
}
