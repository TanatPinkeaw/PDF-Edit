import { useState } from 'react';

import type { ImageProgress, ImageScope } from '../hooks/usePdfSession';
import type { ImageFormat, ImageScale } from '../lib/page-images';

type Props = {
  total: number;
  selectedCount: number;
  busy: boolean;
  progress: ImageProgress;
  onExport: (format: ImageFormat, scale: ImageScale, scope: ImageScope) => void;
};

const FORMATS: Array<{ value: ImageFormat; label: string }> = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPG' },
];

const SCALES: ImageScale[] = [1, 2, 3];

export function ImageExportPanel({ total, selectedCount, busy, progress, onExport }: Props) {
  const [format, setFormat] = useState<ImageFormat>('png');
  const [scale, setScale] = useState<ImageScale>(2);

  const progressText =
    progress && progress.total > 0 ? `กำลังสร้างภาพ ${progress.done}/${progress.total}` : null;

  return (
    <section className="panel" aria-labelledby="images-title">
      <header className="panel-head">
        <h2 id="images-title">ดาวน์โหลดเป็นภาพ</h2>
        <span className="panel-note">หน้าเดียวได้ไฟล์ภาพ · หลายหน้าได้ zip</span>
      </header>

      <div className="control-row">
        <span className="field-label" id="image-format-label">
          รูปแบบ
        </span>
        <div className="segmented" role="group" aria-labelledby="image-format-label">
          {FORMATS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="segment"
              aria-pressed={format === option.value}
              onClick={() => setFormat(option.value)}
              disabled={busy}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-row">
        <span className="field-label" id="image-scale-label">
          ความละเอียด
        </span>
        <div className="segmented" role="group" aria-labelledby="image-scale-label">
          {SCALES.map((option) => (
            <button
              key={option}
              type="button"
              className="segment"
              aria-pressed={scale === option}
              onClick={() => setScale(option)}
              disabled={busy}
              title={`ขยาย ${option}x จากขนาดหน้าเดิม`}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="button-secondary button-large"
        onClick={() => onExport(format, scale, 'all')}
        disabled={busy || total === 0}
      >
        {progressText ?? `ทุกหน้า · ${total} ภาพ`}
      </button>

      <button
        type="button"
        className="button-secondary"
        onClick={() => onExport(format, scale, 'selected')}
        disabled={busy || selectedCount === 0}
      >
        เฉพาะที่เลือก · {selectedCount} ภาพ
      </button>

      <p className="hint">
        1x = ขนาดหน้าเดิม, 2x/3x ให้ภาพคมขึ้นแต่ไฟล์ใหญ่ขึ้น — ภาพพื้นหลังเป็นสีขาวเสมอ
      </p>
    </section>
  );
}
