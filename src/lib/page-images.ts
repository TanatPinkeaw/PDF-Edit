/**
 * Renders pages to raster images for the "export as image" feature.
 * Uses pdf.js so the output matches what the thumbnail grid shows.
 */

import { loadPdfForRendering } from './pdfjs';

export type ImageFormat = 'png' | 'jpeg';

export const IMAGE_MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
};

export const IMAGE_EXTENSION: Record<ImageFormat, 'png' | 'jpg'> = {
  png: 'png',
  jpeg: 'jpg',
};

export type ImageScale = 1 | 2 | 3;

export type RenderImagesOptions = {
  format: ImageFormat;
  scale: ImageScale;
  onProgress?: (done: number, total: number) => void;
};

export type RenderedImage = {
  srcIndex: number;
  bytes: Uint8Array;
};

function canvasToBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('แปลงหน้าเป็นภาพไม่สำเร็จ'));
      },
      mime,
      mime === 'image/jpeg' ? 0.92 : undefined,
    );
  });
}

/**
 * Renders the given 0-based page indices in order. Pages are rendered one at a
 * time so a 300-page export does not allocate 300 canvases at once.
 */
export async function renderPageImages(
  bytes: Uint8Array,
  srcIndices: readonly number[],
  options: RenderImagesOptions,
): Promise<RenderedImage[]> {
  if (srcIndices.length === 0) throw new Error('ไม่มีหน้าที่จะแปลงเป็นภาพ');

  const loaded = await loadPdfForRendering(bytes);
  const mime = IMAGE_MIME[options.format];
  const results: RenderedImage[] = [];

  try {
    for (const [position, srcIndex] of srcIndices.entries()) {
      const page = await loaded.document.getPage(srcIndex + 1);
      const viewport = page.getViewport({ scale: options.scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));

      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas 2d ไม่พร้อมใช้งาน');

      // PDF pages have no background of their own; paint white so PNG does not
      // end up transparent and JPEG does not end up black.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: context, viewport }).promise;
      page.cleanup();

      const blob = await canvasToBlob(canvas, mime);
      results.push({ srcIndex, bytes: new Uint8Array(await blob.arrayBuffer()) });

      // Release the bitmap eagerly; several 3x pages can be tens of MB.
      canvas.width = 0;
      canvas.height = 0;

      options.onProgress?.(position + 1, srcIndices.length);
    }
  } finally {
    await loaded.destroy();
  }

  return results;
}
