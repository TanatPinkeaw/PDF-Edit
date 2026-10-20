import { useEffect, useRef, useState } from 'react';

import { buildPdf } from '../lib/pdf-ops';
import { loadPdfForRendering } from '../lib/pdfjs';

type Props = {
  bytes: Uint8Array;
  /** 0-based page index in the current document. */
  pageIndex: number;
  /** Any change to this string re-renders the preview. */
  signature: string;
  build: (pageBytes: Uint8Array) => Promise<Uint8Array>;
};

const MAX_WIDTH = 620;

async function renderFirstPage(bytes: Uint8Array): Promise<string> {
  const loaded = await loadPdfForRendering(bytes);
  try {
    const page = await loaded.document.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_WIDTH / base.width, 1.8);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas 2d ไม่พร้อมใช้งาน');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    page.cleanup();
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    await loaded.destroy();
  }
}

/** Renders the real stamped output, so the preview matches the download. */
export function StampPreview({ bytes, pageIndex, signature, build }: Props) {
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(async () => {
      try {
        const pageBytes = await buildPdf(bytes, [pageIndex]);
        const stamped = await buildRef.current(pageBytes);
        const dataUrl = await renderFirstPage(stamped);
        if (!cancelled) setImage(dataUrl);
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : 'แสดงตัวอย่างไม่สำเร็จ');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bytes, pageIndex, signature]);

  return (
    <figure className="stamp-preview">
      <div className="stamp-preview-frame" data-loading={loading || undefined}>
        {image ? <img src={image} alt="ตัวอย่างหน้าแรกหลังใส่ค่า" /> : null}
        {!image && loading && <span className="thumb-skeleton" />}
        {error && <p className="hint">แสดงตัวอย่างไม่ได้: {error}</p>}
      </div>
      <figcaption className="panel-note">ตัวอย่างจริงของหน้า {pageIndex + 1}</figcaption>
    </figure>
  );
}
