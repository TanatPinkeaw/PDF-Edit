import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

import { usePagePreview } from '../hooks/usePagePreview';

export type StageSignature = {
  id: string;
  url: string;
  /** Centre of the image, 0–1 from the left edge of the page. */
  x: number;
  /** Centre of the image, 0–1 from the top edge of the page. */
  y: number;
  /** Image width as a fraction of the page width. */
  widthRatio: number;
  /** Intrinsic width / height of the image. */
  aspect: number;
};

type Props = {
  bytes: Uint8Array;
  /** 1-based page number. */
  pageNumber: number;
  signatures: readonly StageSignature[];
  selectedId: string | null;
  /** True when a signature is selected and a click may drop it on the page. */
  canPlace: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onPlaceAt: (x: number, y: number) => void;
  /** Reports the pointer position in page-relative coordinates (null on leave). */
  onHover: (point: { x: number; y: number } | null) => void;
};

type DragState = {
  id: string;
  pointerX: number;
  pointerY: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function pagePoint(event: { clientX: number; clientY: number }, rect: DOMRect) {
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
}

/** Keeps the image inside the page, using the stage box for the aspect ratio. */
function clampToPage(item: StageSignature, x: number, y: number, rect: DOMRect) {
  const halfWidth = item.widthRatio / 2;
  const heightRatio = (item.widthRatio * (rect.width / item.aspect)) / rect.height;
  const halfHeight = heightRatio / 2;
  return {
    x: clamp(x, halfWidth, 1 - halfWidth),
    y: clamp(y, halfHeight, 1 - halfHeight),
  };
}

export function SignatureStage({
  bytes,
  pageNumber,
  signatures,
  selectedId,
  canPlace,
  onSelect,
  onMove,
  onPlaceAt,
  onHover,
}: Props) {
  const preview = usePagePreview(bytes, pageNumber);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  const rectOf = () => stage.current?.getBoundingClientRect() ?? null;

  const startDrag = (event: PointerEvent<HTMLButtonElement>, item: StageSignature) => {
    event.stopPropagation();
    event.preventDefault();
    onSelect(item.id);
    const rect = rectOf();
    if (!rect) return;
    drag.current = {
      id: item.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: item.x,
      originY: item.y,
      width: rect.width,
      height: rect.height,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers and older browsers do not support capture; dragging
      // still works while the pointer stays over the signature.
    }
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>, item: StageSignature) => {
    const state = drag.current;
    if (!state || state.id !== item.id) return;
    const rect = rectOf();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const next = clampToPage(
      item,
      state.originX + (event.clientX - state.pointerX) / rect.width,
      state.originY + (event.clientY - state.pointerY) / rect.height,
      rect,
    );
    onMove(item.id, next.x, next.y);
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // No capture to release.
    }
  };

  const nudge = (event: KeyboardEvent<HTMLButtonElement>, item: StageSignature) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    const rect = rectOf();
    const next = rect
      ? clampToPage(item, item.x + delta[0] * step, item.y + delta[1] * step, rect)
      : { x: clamp(item.x + delta[0] * step, 0, 1), y: clamp(item.y + delta[1] * step, 0, 1) };
    onMove(item.id, next.x, next.y);
  };

  return (
    <div className="sign-stage-wrap">
      <div
        ref={stage}
        className="sign-stage"
        data-placing={canPlace || undefined}
        onClick={(event) => {
          const rect = rectOf();
          if (!rect || !canPlace) return;
          const point = pagePoint(event, rect);
          onPlaceAt(point.x, point.y);
        }}
        onPointerMove={(event) => {
          const rect = rectOf();
          if (rect) onHover(pagePoint(event, rect));
        }}
        onPointerLeave={() => onHover(null)}
      >
        {preview.image ? (
          <img className="sign-stage-page" src={preview.image} alt={`หน้า ${pageNumber}`} />
        ) : (
          <div className="sign-stage-empty">
            <span className="thumb-skeleton" />
          </div>
        )}

        {preview.image &&
          signatures.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="sign-mark"
              aria-pressed={selectedId === item.id}
              aria-label={`ลายเซ็นที่ ${index + 1} — ลากหรือใช้ลูกศรเพื่อย้ายตำแหน่ง`}
              style={{
                left: `${item.x * 100}%`,
                top: `${item.y * 100}%`,
                width: `${item.widthRatio * 100}%`,
              }}
              onPointerDown={(event) => startDrag(event, item)}
              onPointerMove={(event) => moveDrag(event, item)}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => nudge(event, item)}
              onClick={(event) => event.stopPropagation()}
            >
              <img src={item.url} alt="" draggable={false} style={{ aspectRatio: item.aspect }} />
            </button>
          ))}

        {preview.error && <p className="sign-stage-error">แสดงตัวอย่างไม่ได้: {preview.error}</p>}
      </div>
      <p className="panel-note">
        ลากลายเซ็นบนหน้าเพื่อจัดตำแหน่ง · ลูกศรเลื่อนทีละนิด (กด Shift เลื่อนเยอะขึ้น)
        {canPlace ? ' · คลิกบนหน้าเพื่อวางลายเซ็นที่เลือก' : ''}
      </p>
    </div>
  );
}
