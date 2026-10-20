import { describe, expect, it } from 'vitest';

import { PdfError } from '../src/lib/pdf-ops';
import {
  normalizeAngle,
  readRotations,
  resolveSelectedPages,
  rotateDocument,
} from '../src/lib/pdf/rotate';
import { makeFixture } from './helpers/fixture';

describe('normalizeAngle', () => {
  it('wraps into 0/90/180/270', () => {
    expect(normalizeAngle(90)).toBe(90);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(270)).toBe(270);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(450)).toBe(90);
  });
});

describe('resolveSelectedPages', () => {
  it('expands "all" and validates explicit pages', () => {
    expect(resolveSelectedPages(3, 'all')).toEqual([1, 2, 3]);
    expect(resolveSelectedPages(3, [3, 1, 3])).toEqual([1, 3]);
  });

  it('rejects empty and out-of-range selections', () => {
    expect(() => resolveSelectedPages(3, [])).toThrow(PdfError);
    expect(() => resolveSelectedPages(3, [0])).toThrow(/นอกเอกสาร/);
    expect(() => resolveSelectedPages(3, [4])).toThrow(/นอกเอกสาร/);
  });
});

describe('rotateDocument', () => {
  it('rotates every page', async () => {
    const bytes = await makeFixture(3);
    const rotated = await rotateDocument(bytes, { angle: 90 });
    expect(await readRotations(rotated)).toEqual([90, 90, 90]);
  });

  it('adds to a page that is already rotated instead of replacing it', async () => {
    const bytes = await makeFixture(2);
    const once = await rotateDocument(bytes, { angle: 90, pages: [1] });
    const twice = await rotateDocument(once, { angle: 90, pages: [1] });
    expect(await readRotations(twice)).toEqual([180, 0]);

    const fullCircle = await rotateDocument(twice, { angle: 180, pages: [1] });
    expect(await readRotations(fullCircle)).toEqual([0, 0]);
  });

  it('leaves unselected pages untouched', async () => {
    const bytes = await makeFixture(4);
    const rotated = await rotateDocument(bytes, { angle: 270, pages: [2, 4] });
    expect(await readRotations(rotated)).toEqual([0, 270, 0, 270]);
  });

  it('keeps the page count and content', async () => {
    const bytes = await makeFixture(5);
    const rotated = await rotateDocument(bytes, { angle: 180 });
    const { extractText } = await import('./helpers/pdf-text');
    const text = await extractText(rotated);
    expect(text.pages).toHaveLength(5);
    expect(text.pages[0]).toContain('PAGE 1');
  });

  it('rejects an angle that is not a right angle', async () => {
    const bytes = await makeFixture(1);
    await expect(
      rotateDocument(bytes, { angle: 45 as unknown as 90 }),
    ).rejects.toThrow(/มุมหมุน/);
  });
});
