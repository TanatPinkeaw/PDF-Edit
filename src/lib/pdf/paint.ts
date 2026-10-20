/** Shared geometry/colour helpers for the stamping tools. */

import { rgb, type RGB } from '@cantoo/pdf-lib';

export type StampPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'tile';

export const POSITION_LABELS: Record<StampPosition, string> = {
  'top-left': 'บนซ้าย',
  'top-center': 'บนกลาง',
  'top-right': 'บนขวา',
  'middle-left': 'กลางซ้าย',
  'middle-center': 'กลาง',
  'middle-right': 'กลางขวา',
  'bottom-left': 'ล่างซ้าย',
  'bottom-center': 'ล่างกลาง',
  'bottom-right': 'ล่างขวา',
  tile: 'ปูทั้งหน้า',
};

const HEX_PATTERN = /^#?([0-9a-f]{6})$/i;

/** Parses `#rrggbb` into pdf-lib's 0–1 RGB triple, falling back to grey. */
export function hexToRgb(hex: string): RGB {
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match?.[1]) return rgb(0.2, 0.2, 0.2);
  const value = Number.parseInt(match[1], 16);
  return rgb(
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  );
}

export function isHexColor(value: string): boolean {
  return HEX_PATTERN.test(value.trim());
}

export type Box = { width: number; height: number };

/** Top-left origin of a box placed inside a page with a margin. */
export function placeBox(options: {
  page: Box;
  box: Box;
  position: StampPosition;
  margin: number;
}): { x: number; y: number } {
  const { page, box, position, margin } = options;
  const [vertical = 'bottom', horizontal = 'center'] = position.split('-');
  const x =
    horizontal === 'left'
      ? margin
      : horizontal === 'right'
        ? page.width - margin - box.width
        : (page.width - box.width) / 2;
  const y =
    vertical === 'top'
      ? page.height - margin - box.height
      : vertical === 'middle'
        ? (page.height - box.height) / 2
        : margin;
  return { x, y };
}

/**
 * pdf-lib rotates text around the drawing origin, so a centred rotated label
 * has to be shifted by the rotated half-size to stay visually centred.
 */
export function rotatedTextOrigin(options: {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  angleDeg: number;
}): { x: number; y: number } {
  const { centerX, centerY, width, height, angleDeg } = options;
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: centerX - (width / 2) * cos + (height / 2) * sin,
    y: centerY - (width / 2) * sin - (height / 2) * cos,
  };
}

/** Bounding box of a rotated rectangle, used to keep stamps inside margins. */
export function rotatedBounds(options: {
  width: number;
  height: number;
  angleDeg: number;
}): Box {
  const { width, height, angleDeg } = options;
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  return { width: width * cos + height * sin, height: width * sin + height * cos };
}

/** Grid of tile centres covering a page, staggered so rows do not line up. */
export function tileCenters(options: {
  page: Box;
  stepX: number;
  stepY: number;
  stagger?: boolean;
}): Array<{ x: number; y: number }> {
  const { page, stepX, stepY, stagger = true } = options;
  if (stepX <= 0 || stepY <= 0) return [];
  const centers: Array<{ x: number; y: number }> = [];
  let row = 0;
  for (let y = stepY / 2; y <= page.height + stepY; y += stepY) {
    const offset = stagger && row % 2 === 1 ? stepX / 2 : 0;
    for (let x = stepX / 2 + offset - stepX; x <= page.width + stepX; x += stepX) {
      centers.push({ x, y });
    }
    row += 1;
  }
  return centers;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
