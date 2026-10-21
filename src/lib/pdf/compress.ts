/**
 * Size reduction by re-rendering each page to a JPEG and rebuilding the PDF.
 *
 * This is the browser-only kind of "compress": text stops being selectable, so
 * the UI has to warn about it. Quality presets trade sharpness for size.
 */

import { PDFDocument } from '@cantoo/pdf-lib';

import { loadPdfForRendering } from '../pdfjs';

export type CompressQuality = 'screen' | 'balanced' | 'print';

export type CompressSettings = {
  /** Rendering scale relative to 72 dpi. */
  scale: number;
  /** JPEG quality 0–1. */
  jpegQuality: number;
  label: string;
  hint: string;
};

export const COMPRESS_PRESETS: Record<CompressQuality, CompressSettings> = {
  screen: { scale: 1, jpegQuality: 0.55, label: 'เล็กสุด', hint: 'อ่านบนจอ — ตัวหนังสืออาจเบลอเมื่อซูม' },
  balanced: { scale: 1.5, jpegQuality: 0.72, label: 'สมดุล', hint: 'เหมาะกับการส่งอีเมลและอ่านบนจอ' },
  print: { scale: 2, jpegQuality: 0.85, label: 'คมสุด', hint: 'คุณภาพสูง ไฟล์ใหญ่ขึ้น แต่ยังเล็กกว่าต้นฉบับส่วนใหญ่' },
};

export type CompressResult = {
  bytes: Uint8Array;
  originalBytes: number;
};

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('แปลงหน้าเป็น JPEG ไม่สำเร็จ'));
          return;
        }
        void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)));
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function compressPdf(
  bytes: Uint8Array,
  quality: CompressQuality,
  onProgress?: (done: number, total: number) => void,
): Promise<CompressResult> {
  const preset = COMPRESS_PRESETS[quality];
  const loaded = await loadPdfForRendering(bytes);
  const output = await PDFDocument.create();

  try {
    const total = loaded.document.numPages;
    for (let index = 1; index <= total; index += 1) {
      const page = await loaded.document.getPage(index);
      const viewport = page.getViewport({ scale: preset.scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas 2d ไม่พร้อมใช้งาน');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      page.cleanup();

      const jpeg = await canvasToJpeg(canvas, preset.jpegQuality);
      const embedded = await output.embedJpg(jpeg);
      // Keep the original page size in points so the document still prints 1:1.
      const base = page.getViewport({ scale: 1 });
      const newPage = output.addPage([base.width, base.height]);
      newPage.drawImage(embedded, { x: 0, y: 0, width: base.width, height: base.height });

      canvas.width = 0;
      canvas.height = 0;
      onProgress?.(index, total);
    }
  } finally {
    await loaded.destroy();
  }

  const compressed = await output.save();
  return { bytes: compressed, originalBytes: bytes.byteLength };
}

/** Human-readable size difference, used by the result panel. */
export function describeSaving(originalBytes: number, compressedBytes: number): string {
  if (originalBytes <= 0) return '—';
  const change = ((compressedBytes - originalBytes) / originalBytes) * 100;
  const percent = Math.abs(change).toFixed(0);
  return change <= 0 ? `เล็กลง ${percent}%` : `ใหญ่ขึ้น ${percent}%`;
}
