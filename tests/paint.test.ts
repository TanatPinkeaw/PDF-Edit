import { describe, expect, it } from 'vitest';

import {
  clamp,
  hexToRgb,
  isHexColor,
  placeBox,
  rotatedBounds,
  rotatedTextOrigin,
  tileCenters,
} from '../src/lib/pdf/paint';

describe('hexToRgb', () => {
  it('parses hex colours into 0–1 components', () => {
    const red = hexToRgb('#ff0000');
    expect(red).toMatchObject({ red: 1, green: 0, blue: 0 });
    const mixed = hexToRgb('336699');
    expect(mixed.red).toBeCloseTo(0.2, 2);
    expect(mixed.green).toBeCloseTo(0.4, 2);
    expect(mixed.blue).toBeCloseTo(0.6, 2);
  });

  it('falls back to grey for invalid input', () => {
    expect(hexToRgb('nope')).toMatchObject({ red: 0.2, green: 0.2, blue: 0.2 });
    expect(isHexColor('#12ab34')).toBe(true);
    expect(isHexColor('#12ab3')).toBe(false);
  });
});

describe('placeBox', () => {
  const page = { width: 200, height: 400 };
  const box = { width: 50, height: 20 };

  it('handles the four corners', () => {
    expect(placeBox({ page, box, position: 'top-left', margin: 10 })).toEqual({ x: 10, y: 370 });
    expect(placeBox({ page, box, position: 'top-right', margin: 10 })).toEqual({ x: 140, y: 370 });
    expect(placeBox({ page, box, position: 'bottom-left', margin: 10 })).toEqual({ x: 10, y: 10 });
    expect(placeBox({ page, box, position: 'bottom-right', margin: 10 })).toEqual({
      x: 140,
      y: 10,
    });
  });

  it('centres in both axes', () => {
    expect(placeBox({ page, box, position: 'middle-center', margin: 10 })).toEqual({
      x: 75,
      y: 190,
    });
  });
});

describe('rotatedBounds', () => {
  it('swaps dimensions at 90 degrees', () => {
    const bounds = rotatedBounds({ width: 100, height: 20, angleDeg: 90 });
    expect(bounds.width).toBeCloseTo(20, 6);
    expect(bounds.height).toBeCloseTo(100, 6);
  });

  it('grows the box at 45 degrees', () => {
    const bounds = rotatedBounds({ width: 100, height: 20, angleDeg: 45 });
    expect(bounds.width).toBeCloseTo(84.85, 1);
    expect(bounds.height).toBeCloseTo(84.85, 1);
  });
});

describe('rotatedTextOrigin', () => {
  it('matches the plain origin when there is no rotation', () => {
    const origin = rotatedTextOrigin({
      centerX: 100,
      centerY: 200,
      width: 40,
      height: 10,
      angleDeg: 0,
    });
    expect(origin.x).toBeCloseTo(80, 5);
    expect(origin.y).toBeCloseTo(195, 5);
  });

  it('keeps the centre on the given point at 180 degrees', () => {
    const origin = rotatedTextOrigin({
      centerX: 100,
      centerY: 200,
      width: 40,
      height: 10,
      angleDeg: 180,
    });
    expect(origin.x).toBeCloseTo(120, 5);
    expect(origin.y).toBeCloseTo(205, 5);
  });
});

describe('tileCenters', () => {
  it('covers the page with a staggered grid', () => {
    const centers = tileCenters({
      page: { width: 300, height: 200 },
      stepX: 100,
      stepY: 100,
    });
    expect(centers.length).toBeGreaterThanOrEqual(6);
    // The grid starts one half-step outside the page so edges are covered too.
    expect(centers[0]).toEqual({ x: -50, y: 50 });
    const rowCentres = centers.filter((point) => point.y === 50).map((point) => point.x);
    expect(Math.max(...rowCentres)).toBeGreaterThan(300);
    const staggered = centers.filter((point) => point.y === 150).map((point) => point.x);
    expect(staggered).not.toEqual(rowCentres);
  });

  it('returns nothing for a non-positive step', () => {
    expect(tileCenters({ page: { width: 100, height: 100 }, stepX: 0, stepY: 10 })).toEqual([]);
  });
});

describe('clamp', () => {
  it('bounds values and handles NaN', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 2, 10)).toBe(2);
  });
});
