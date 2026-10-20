/** Stamps page numbers using an embedded Thai-capable font. */

import { PdfError, loadPdf } from '../pdf-ops';
import { embedThaiFont, type FontWeight } from './fonts';
import { clamp, hexToRgb, placeBox, type StampPosition } from './paint';

export const DEFAULT_TEMPLATE = '{n} / {total}';

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

export type PageNumbersOptions = {
  template?: string;
  /** Number printed on the first numbered page (default 1). */
  start?: number;
  /** Pages at the start of the document that keep no number (default 0). */
  skipFirst?: number;
  /** Explicit 1-based pages; when set, `skipFirst` is ignored. */
  pages?: readonly number[] | null;
  position?: StampPosition;
  margin?: number;
  fontSize?: number;
  weight?: FontWeight;
  color?: string;
  opacity?: number;
  thaiDigits?: boolean;
};

export function toThaiDigits(text: string): string {
  return text.replace(/[0-9]/g, (digit) => THAI_DIGITS[Number(digit)] ?? digit);
}

export function formatPageLabel(
  template: string,
  options: { page: number; total: number; thaiDigits?: boolean },
): string {
  const { page, total, thaiDigits = false } = options;
  if (!/\{n\}|\{total\}/.test(template)) {
    throw new PdfError('invalid', 'รูปแบบเลขหน้าต้องมี {n} หรือ {total}');
  }
  const label = template
    .replace(/\{n\}/g, String(page))
    .replace(/\{total\}/g, String(total));
  return thaiDigits ? toThaiDigits(label) : label;
}

/** Returns a user-facing error for an unusable template, or null when valid. */
export function templateError(template: string): string | null {
  if (template.trim() === '') return 'ยังไม่ได้ใส่รูปแบบเลขหน้า';
  if (/\{[^}]*\}/.test(template.replace(/\{n\}|\{total\}/g, ''))) {
    return 'ใช้ได้เฉพาะ {n} และ {total} เท่านั้น';
  }
  if (!/\{n\}|\{total\}/.test(template)) {
    return 'ต้องมี {n} (เลขหน้า) หรือ {total} (จำนวนหน้าทั้งหมด)';
  }
  return null;
}

/** 1-based pages that receive a number. */
export function numberedPages(
  total: number,
  options: { pages?: readonly number[] | null; skipFirst?: number } = {},
): number[] {
  const { pages, skipFirst = 0 } = options;
  if (pages && pages.length > 0) {
    const unique = [...new Set(pages)].sort((a, b) => a - b);
    for (const page of unique) {
      if (!Number.isInteger(page) || page < 1 || page > total) {
        throw new PdfError('out-of-range', `หน้า ${page} อยู่นอกเอกสาร (มี ${total} หน้า)`);
      }
    }
    return unique;
  }

  const skip = clamp(Math.round(skipFirst), 0, total);
  return Array.from({ length: total - skip }, (_, index) => index + skip + 1);
}

export async function addPageNumbers(
  bytes: Uint8Array,
  options: PageNumbersOptions = {},
): Promise<Uint8Array> {
  const template = options.template ?? DEFAULT_TEMPLATE;
  const problem = templateError(template);
  if (problem) throw new PdfError('invalid', problem);

  const doc = await loadPdf(bytes);
  const total = doc.getPageCount();
  const targets = numberedPages(total, options);
  if (targets.length === 0) {
    throw new PdfError('empty', 'ไม่มีหน้าที่จะใส่เลข — ตรวจจำนวนหน้าที่ข้าม');
  }

  const start = Math.max(1, Math.round(options.start ?? 1));
  const size = clamp(options.fontSize ?? 10, 6, 72);
  const margin = clamp(options.margin ?? 24, 0, 240);
  const opacity = clamp(options.opacity ?? 1, 0.05, 1);
  const color = hexToRgb(options.color ?? '#333333');
  const position = options.position ?? 'bottom-center';
  const font = await embedThaiFont(doc, options.weight ?? 'regular');
  const pages = doc.getPages();

  targets.forEach((pageNumber, index) => {
    const page = pages[pageNumber - 1];
    if (!page) return;
    const text = formatPageLabel(template, {
      page: start + index,
      total,
      thaiDigits: options.thaiDigits ?? false,
    });
    const width = font.widthOfTextAtSize(text, size);
    const height = font.heightAtSize(size);
    const box = placeBox({
      page: { width: page.getWidth(), height: page.getHeight() },
      box: { width, height },
      position,
      margin,
    });
    page.drawText(text, {
      x: box.x,
      y: box.y,
      size,
      font,
      color,
      opacity,
    });
  });

  return doc.save();
}
