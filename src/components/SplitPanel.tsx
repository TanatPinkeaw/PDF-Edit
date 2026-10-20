import { useEffect, useId, useMemo, useState } from 'react';

import {
  parsePageRanges,
  rangePageCount,
  type PageRange,
} from '../lib/page-ranges';

type Props = {
  total: number;
  selectedCount: number;
  busy: boolean;
  onSplit: (ranges: PageRange[]) => void;
  onExtractSelection: () => void;
};

function chunkRanges(total: number, size: number): string {
  const parts: string[] = [];
  for (let start = 1; start <= total; start += size) {
    const end = Math.min(start + size - 1, total);
    parts.push(start === end ? `${start}` : `${start}-${end}`);
  }
  return parts.join(', ');
}

export function SplitPanel({ total, selectedCount, busy, onSplit, onExtractSelection }: Props) {
  const [input, setInput] = useState('');
  const inputId = useId();
  const hintId = useId();

  useEffect(() => {
    setInput('');
  }, [total]);

  const parsed = useMemo(() => parsePageRanges(input, total), [input, total]);
  const hasInput = input.trim() !== '';
  const errors = hasInput ? parsed.errors : [];
  const ranges = hasInput ? parsed.ranges : [];
  const canSplit = ranges.length > 0 && errors.length === 0 && !busy;
  const totalPages = ranges.reduce((sum, range) => sum + rangePageCount(range), 0);

  const applyHalf = () => {
    const half = Math.ceil(total / 2);
    if (total < 2) {
      setInput('1');
      return;
    }
    setInput(`1-${half}, ${half + 1}-end`);
  };

  return (
    <section className="panel" aria-labelledby={`${inputId}-title`}>
      <header className="panel-head">
        <h2 id={`${inputId}-title`}>แยกหน้า</h2>
        <span className="panel-note">ช่วงหน้าอ้างอิงลำดับปัจจุบัน</span>
      </header>

      <label className="field-label" htmlFor={inputId}>
        ช่วงหน้าที่ต้องการ
      </label>
      <input
        id={inputId}
        className="range-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="เช่น 1-3, 5, 8-end"
        aria-describedby={hintId}
        aria-invalid={errors.length > 0}
        spellCheck={false}
        autoComplete="off"
      />
      <p className="hint" id={hintId}>
        คั่นด้วยจุลภาค · ใช้ <code>end</code> แทนหน้าสุดท้าย
      </p>

      <div className="chips">
        <button type="button" className="chip-button" onClick={applyHalf} disabled={busy}>
          แบ่งครึ่ง
        </button>
        <button
          type="button"
          className="chip-button"
          onClick={() => setInput(chunkRanges(total, 5))}
          disabled={busy}
        >
          ทุก 5 หน้า
        </button>
        <button
          type="button"
          className="chip-button"
          onClick={() => setInput('')}
          disabled={!hasInput}
        >
          ล้าง
        </button>
      </div>

      {errors.length > 0 && (
        <ul className="errors" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      {errors.length === 0 && ranges.length > 0 && (
        <>
          <ul className="split-preview">
            {ranges.map((range) => (
              <li key={`${range.start}-${range.end}`}>
                <span>
                  หน้า {range.start}
                  {range.end !== range.start ? `–${range.end}` : ''}
                </span>
                <span className="split-count">{rangePageCount(range)} หน้า</span>
              </li>
            ))}
          </ul>
          <p className="split-total">
            ได้ {ranges.length} ไฟล์ · รวม {totalPages} หน้า
            {ranges.length > 1 ? ' (ดาวน์โหลดเป็น zip)' : ''}
          </p>
        </>
      )}

      <button
        type="button"
        className="button-primary"
        onClick={() => onSplit(ranges)}
        disabled={!canSplit}
      >
        {busy ? 'กำลังสร้างไฟล์…' : ranges.length > 0 ? `แยกเป็น ${ranges.length} ไฟล์` : 'แยกไฟล์ตามช่วง'}
      </button>

      <hr className="divider" />

      <button
        type="button"
        className="button-secondary"
        onClick={onExtractSelection}
        disabled={busy || selectedCount === 0}
      >
        ดึง {selectedCount} หน้าที่เลือกเป็นไฟล์ใหม่
      </button>
      {selectedCount === 0 && <p className="hint">ติ๊กเลือกหน้าที่ต้องการก่อน</p>}
    </section>
  );
}
