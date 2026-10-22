import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { Thumbnails } from '../hooks/useThumbnails';
import { GrabIcon } from './GrabIcon';
import type { PageEntry, ToggleMode } from '../lib/session';
import type { CSSProperties } from 'react';

type Props = {
  entry: PageEntry;
  /** 1-based position in the current order. */
  position: number;
  total: number;
  selected: boolean;
  disabled: boolean;
  /** Extra preview rotation in degrees (does not modify the file). */
  rotation?: number;
  canReorder?: boolean;
  thumbnails: Thumbnails;
  onToggle: (id: string, mode: ToggleMode) => void;
  onDelete: (id: string) => void;
  onNudge: (id: string, delta: number) => void;
};

export function PageCard({
  entry,
  position,
  total,
  selected,
  disabled,
  rotation = 0,
  canReorder = true,
  thumbnails,
  onToggle,
  onDelete,
  onNudge,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: disabled || !canReorder,
  });
  const [thumb, setThumb] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const cardRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    let cancelled = false;
    setThumb(null);
    setThumbFailed(false);

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((item) => item.isIntersecting)) return;
        observer.disconnect();
        thumbnails.load(entry.srcIndex, rotation).then(
          (dataUrl) => {
            if (!cancelled) setThumb(dataUrl);
          },
          (error: unknown) => {
            console.warn('แสดงตัวอย่างหน้าไม่สำเร็จ', entry.srcIndex + 1, error);
            if (!cancelled) setThumbFailed(true);
          },
        );
      },
      { rootMargin: '400px 0px' },
    );

    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [entry.srcIndex, rotation, thumbnails]);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSelect = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.shiftKey) onToggle(entry.id, 'range');
    else if (event.metaKey || event.ctrlKey) onToggle(entry.id, 'add');
    else onToggle(entry.id, 'single');
  };

  const moved = entry.srcIndex !== position - 1;

  return (
    <li
      ref={(node) => {
        setNodeRef(node);
        cardRef.current = node;
      }}
      style={style}
      className="page-card"
      data-selected={selected || undefined}
      data-dragging={isDragging || undefined}
      data-page={entry.id}
    >
      <div className="page-thumb">
        <button
          type="button"
          className="page-select"
          onClick={handleSelect}
          aria-pressed={selected}
          aria-label={`หน้า ${position}${moved ? ` (เดิมหน้า ${entry.srcIndex + 1})` : ''}`}
        >
          {thumb ? (
            <img src={thumb} alt="" draggable={false} />
          ) : (
            <span
              className={thumbFailed ? 'thumb-failed' : 'thumb-skeleton'}
              title={thumbFailed ? (thumbnails.failure?.detail ?? undefined) : undefined}
            >
              {thumbFailed ? 'แสดงตัวอย่างไม่ได้' : ''}
            </span>
          )}
        </button>

        <span className="page-badge" aria-hidden="true">
          {position}
        </span>

        {moved && (
          <span className="page-origin" aria-hidden="true">
            เดิม {entry.srcIndex + 1}
          </span>
        )}

        {canReorder && (
          <button
            type="button"
            className="page-drag"
            {...attributes}
            {...listeners}
            aria-label={`ลากเพื่อย้ายหน้า ${position}`}
            title="ลากเพื่อย้ายลำดับ"
          >
            <GrabIcon />
          </button>
        )}

        <button
          type="button"
          className="page-remove"
          onClick={() => onDelete(entry.id)}
          aria-label={`ลบหน้า ${position}`}
          title="ลบหน้านี้"
        >
          ×
        </button>
      </div>

      <div className="page-foot">
        {canReorder ? (
          <>
            <button
              type="button"
              onClick={() => onNudge(entry.id, -1)}
              disabled={position === 1 || disabled}
              aria-label={`ย้ายหน้า ${position} ไปทางซ้าย`}
            >
              ←
            </button>
            <span className="page-state">{moved ? 'ย้ายมา' : `หน้า ${entry.srcIndex + 1}`}</span>
            <button
              type="button"
              onClick={() => onNudge(entry.id, 1)}
              disabled={position === total || disabled}
              aria-label={`ย้ายหน้า ${position} ไปทางขวา`}
            >
              →
            </button>
          </>
        ) : (
          <span className="page-state">
            หน้า {entry.srcIndex + 1}
            {rotation !== 0 ? ` · ${rotation > 0 ? '+' : ''}${rotation}°` : ''}
          </span>
        )}
      </div>
    </li>
  );
}
