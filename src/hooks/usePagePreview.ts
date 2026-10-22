/**
 * Renders a single page large enough to place things on. The returned size is
 * the bitmap size, so callers can position overlays against the page aspect
 * ratio instead of guessing it.
 */

import { useEffect, useState } from 'react';

import { loadPdfForRendering } from '../lib/pdfjs';

export type PagePreview = {
  image: string | null;
  /** Rendered bitmap size in pixels. */
  width: number;
  height: number;
  loading: boolean;
  error: string | null;
};

const EMPTY: PagePreview = { image: null, width: 0, height: 0, loading: false, error: null };

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'แสดงตัวอย่างหน้าไม่สำเร็จ';
}

export function usePagePreview(
  bytes: Uint8Array | null,
  pageNumber: number,
  maxWidth = 820,
): PagePreview {
  const [preview, setPreview] = useState<PagePreview>(EMPTY);

  useEffect(() => {
    if (!bytes || bytes.byteLength === 0) {
      setPreview(EMPTY);
      return;
    }

    let cancelled = false;
    setPreview((current) => ({ ...current, loading: true, error: null }));

    const job = (async () => {
      const loaded = await loadPdfForRendering(bytes);
      try {
        const page = await loaded.document.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(maxWidth / base.width, 2);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas 2d ไม่พร้อมใช้งาน');

        // PDF pages have no background; paint white so the preview is readable.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        page.cleanup();

        if (!cancelled) {
          setPreview({
            image: canvas.toDataURL('image/jpeg', 0.86),
            width: canvas.width,
            height: canvas.height,
            loading: false,
            error: null,
          });
        }
        canvas.width = 0;
        canvas.height = 0;
      } finally {
        await loaded.destroy();
      }
    })();

    job.catch((error: unknown) => {
      if (!cancelled) {
        setPreview({ image: null, width: 0, height: 0, loading: false, error: describe(error) });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bytes, pageNumber, maxWidth]);

  return preview;
}
