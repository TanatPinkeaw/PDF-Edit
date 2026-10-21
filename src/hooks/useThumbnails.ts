/**
 * Lazy page thumbnails rendered with pdf.js. Only pages scrolled into view are
 * rendered, at most two at a time, and each page/rotation pair is rendered once
 * per file.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { PdfRenderError, loadPdfForRendering } from '../lib/pdfjs';

const THUMB_WIDTH = 240;
const MAX_CONCURRENT_RENDERS = 2;

function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async <T,>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

async function renderPage(
  doc: PDFDocumentProxy,
  srcIndex: number,
  extraRotation: number,
): Promise<string> {
  const page = await doc.getPage(srcIndex + 1);
  try {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(THUMB_WIDTH / base.width, 340 / base.height) * 2;
    const rotation = (((page.rotate + extraRotation) % 360) + 360) % 360;
    const viewport = page.getViewport({ scale, rotation });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas 2d ไม่พร้อมใช้งาน');

    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.75);
  } finally {
    page.cleanup();
  }
}

export type ThumbnailLoader = (srcIndex: number, extraRotation?: number) => Promise<string>;

export type ThumbnailFailure = {
  /** Short user-facing reason, e.g. "เปิดตัวอย่างเอกสารไม่สำเร็จ". */
  message: string;
  /** Technical cause for the diagnostics panel. */
  detail: string;
};

export type Thumbnails = {
  load: ThumbnailLoader;
  /** Bumped whenever the underlying document changes, so cards re-render. */
  version: number;
  /** Set when the document could not be opened at all. */
  failure: ThumbnailFailure | null;
  /** Re-opens the document; called by the retry buttons. */
  reload: () => void;
};

function toFailure(error: unknown): ThumbnailFailure {
  if (error instanceof PdfRenderError) {
    return { message: error.message, detail: error.detail };
  }
  if (error instanceof Error) {
    return { message: 'เปิดตัวอย่างเอกสารไม่สำเร็จ', detail: error.message };
  }
  return { message: 'เปิดตัวอย่างเอกสารไม่สำเร็จ', detail: String(error) };
}

export function useThumbnails(bytes: Uint8Array | null): Thumbnails {
  const [version, setVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<ThumbnailFailure | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const destroyRef = useRef<(() => Promise<void>) | null>(null);
  const readyRef = useRef<Promise<PDFDocumentProxy | null>>(Promise.resolve(null));
  const cache = useRef(new Map<string, string>());
  const inflight = useRef(new Map<string, Promise<string>>());
  const limiter = useRef(createLimiter(MAX_CONCURRENT_RENDERS));
  const requestVersion = useRef(0);

  useEffect(() => {
    requestVersion.current += 1;
    cache.current.clear();
    inflight.current.clear();
    docRef.current = null;
    destroyRef.current = null;
    setFailure(null);
    setVersion(requestVersion.current);

    if (!bytes || bytes.byteLength === 0) {
      readyRef.current = Promise.resolve(null);
      return;
    }

    let cancelled = false;
    let resolveReady: (doc: PDFDocumentProxy | null) => void = () => undefined;
    readyRef.current = new Promise<PDFDocumentProxy | null>((resolve) => {
      resolveReady = resolve;
    });

    const loading = loadPdfForRendering(bytes).then(
      ({ document, destroy }) => {
        if (cancelled) {
          void destroy();
          resolveReady(null);
          return null;
        }
        docRef.current = document;
        destroyRef.current = destroy;
        resolveReady(document);
        return document;
      },
      (error: unknown) => {
        console.error('โหลด pdf.js ไม่สำเร็จ', error);
        if (!cancelled) setFailure(toFailure(error));
        resolveReady(null);
        return null;
      },
    );

    return () => {
      cancelled = true;
      docRef.current = null;
      const destroy = destroyRef.current;
      destroyRef.current = null;
      resolveReady(null);
      // The `.then` above destroys the document itself when it resolves after
      // this cleanup; here we only handle a document that already loaded.
      if (destroy) void destroy().catch(() => undefined);
      void loading;
    };
  }, [bytes, attempt]);

  const load = useCallback<ThumbnailLoader>(async (srcIndex, extraRotation = 0) => {
    const key = `${srcIndex}:${extraRotation}`;
    const cached = cache.current.get(key);
    if (cached) return cached;

    const pending = inflight.current.get(key);
    if (pending) return pending;

    const versionAtRequest = requestVersion.current;
    const doc = docRef.current ?? (await readyRef.current);
    if (!doc) throw new Error('เปิดตัวอย่างเอกสารไม่สำเร็จ');

    const job = limiter
      .current(() => renderPage(doc, srcIndex, extraRotation))
      .then(
        (dataUrl) => {
          inflight.current.delete(key);
          if (requestVersion.current === versionAtRequest) {
            cache.current.set(key, dataUrl);
          }
          return dataUrl;
        },
        (error: unknown) => {
          inflight.current.delete(key);
          throw error;
        },
      );

    inflight.current.set(key, job);
    return job;
  }, []);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return useMemo(() => ({ load, version, failure, reload }), [load, version, failure, reload]);
}
