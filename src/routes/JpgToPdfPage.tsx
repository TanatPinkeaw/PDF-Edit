import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { ToolPage } from '../components/ToolPage';
import { downloadBytes, imagesPdfFileName } from '../lib/download';
import {
  MAX_MARGIN,
  imagesToPdf,
  type ImageMime,
  type ImagePageSize,
} from '../lib/pdf/images-to-pdf';

type PickedImage = {
  id: string;
  name: string;
  bytes: Uint8Array;
  mime: ImageMime;
  url: string;
};

type Status = { tone: 'info' | 'error'; text: string } | null;

const ACCEPTED: Record<string, ImageMime> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
};

export function JpgToPdfPage() {
  const [images, setImages] = useState<PickedImage[]>([]);
  const [pageSize, setPageSize] = useState<ImagePageSize>('a4');
  const [margin, setMargin] = useState(24);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: File[]) => {
    const accepted: PickedImage[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      const mime = ACCEPTED[file.type];
      if (!mime) {
        rejected.push(file.name);
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      accepted.push({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        bytes,
        mime,
        url: URL.createObjectURL(new Blob([bytes.slice()], { type: mime })),
      });
    }

    if (accepted.length > 0) setImages((current) => [...current, ...accepted]);
    if (rejected.length > 0) {
      setStatus({ tone: 'error', text: `ข้ามไฟล์ที่ไม่ใช่ PNG/JPEG: ${rejected.join(', ')}` });
    } else if (accepted.length > 0) {
      setStatus(null);
    }
  }, []);

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void addFiles(files);
  };

  const remove = (id: string) => {
    setImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((image) => image.id !== id);
    });
  };

  const move = (index: number, delta: number) => {
    setImages((current) => {
      const next = [...current];
      const target = next[index];
      const swap = next[index + delta];
      if (!target || !swap) return current;
      next[index] = swap;
      next[index + delta] = target;
      return next;
    });
  };

  const create = async () => {
    if (images.length === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      const bytes = await imagesToPdf(
        images.map((image) => ({ bytes: image.bytes, mime: image.mime })),
        { pageSize, margin },
      );
      const name = imagesPdfFileName(images[0]?.name ?? 'images');
      downloadBytes(name, bytes);
      setStatus({ tone: 'info', text: `ดาวน์โหลด ${name} แล้ว — ${images.length} หน้า` });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'สร้าง PDF ไม่สำเร็จ',
      });
    } finally {
      setBusy(false);
    }
  };

  const total = useMemo(() => images.length, [images.length]);

  return (
    <ToolPage
      title="JPG to PDF"
      description="รวมภาพ PNG/JPG เป็น PDF — เรียงลำดับได้ กำหนดขนาดหน้าและระยะขอบได้ ไฟล์ไม่ออกจากเครื่อง"
    >
      <div className="simple-tool">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          className="visually-hidden"
          onChange={handleInput}
          aria-label="เลือกไฟล์ภาพ"
          tabIndex={-1}
        />

        {total === 0 ? (
          <div className="dropzone">
            <h2>ลากภาพ PNG / JPG มาวางตรงนี้</h2>
            <p className="dropzone-sub">เลือกได้หลายไฟล์ · แต่ละภาพกลายเป็นหนึ่งหน้า</p>
            <div className="dropzone-actions">
              <button
                type="button"
                className="button-primary button-large"
                onClick={() => inputRef.current?.click()}
              >
                เลือกไฟล์ภาพ
              </button>
            </div>
          </div>
        ) : (
          <div className="simple-grid">
            <ul className="image-strip" aria-label="ลำดับภาพ">
              {images.map((image, index) => (
                <li key={image.id}>
                  <img src={image.url} alt="" loading="lazy" />
                  <span className="image-strip-name">{image.name}</span>
                  <div className="image-strip-actions">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`ย้าย ${image.name} ก่อนหน้า`}>
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === images.length - 1}
                      aria-label={`ย้าย ${image.name} ถัดไป`}
                    >
                      →
                    </button>
                    <button type="button" onClick={() => remove(image.id)} aria-label={`เอา ${image.name} ออก`}>
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <aside className="panel">
              <header className="panel-head">
                <h2>ตั้งค่าหน้า</h2>
                <span className="panel-note">{total} ภาพ</span>
              </header>

              <label className="field-label" htmlFor="page-size">
                ขนาดหน้า
              </label>
              <div className="segmented" id="page-size">
                {(['auto', 'a4', 'letter'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={pageSize === size}
                    onClick={() => setPageSize(size)}
                  >
                    {size === 'auto' ? 'ตามภาพ' : size.toUpperCase()}
                  </button>
                ))}
              </div>

              <label className="field-label" htmlFor="margin-range">
                ระยะขอบ · {margin} pt
              </label>
              <input
                id="margin-range"
                type="range"
                min={0}
                max={MAX_MARGIN}
                step={2}
                value={margin}
                onChange={(event) => setMargin(Number(event.target.value))}
              />

              <button
                type="button"
                className="button-primary button-large"
                onClick={() => void create()}
                disabled={busy}
              >
                {busy ? 'กำลังสร้าง…' : 'สร้าง PDF'}
              </button>

              <button
                type="button"
                className="button-secondary"
                onClick={() => inputRef.current?.click()}
              >
                เพิ่มภาพ
              </button>
            </aside>
          </div>
        )}

        {status && (
          <div className="status" role="status" data-tone={status.tone}>
            <span>{status.text}</span>
          </div>
        )}
      </div>
    </ToolPage>
  );
}
