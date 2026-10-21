import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';

import { cropPdf, normalizeInsets } from '../src/lib/pdf/crop';
import { signPdf, planSignature } from '../src/lib/pdf/sign';
import { makeFixture } from './helpers/fixture';
import { makePng } from './helpers/images';

describe('normalizeInsets', () => {
  it('clamps negative values to zero', () => {
    expect(normalizeInsets({ top: -5, right: -1, bottom: 0, left: 0 }, 200, 400)).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it('returns null when the crop would be empty', () => {
    expect(normalizeInsets({ top: 300, right: 0, bottom: 300, left: 0 }, 200, 400)).toBeNull();
  });
});

describe('cropPdf', () => {
  it('sets a crop box on the targeted page only', async () => {
    const source = await makeFixture(3);
    const cropped = await cropPdf(source, [
      { pageIndex: 1, insets: { top: 10, right: 20, bottom: 30, left: 40 } },
    ]);

    const doc = await PDFDocument.load(cropped);
    const page = doc.getPages()[1];
    expect(page?.getCropBox()).toMatchObject({ x: 40, y: 30, width: 210 - 60, height: 400 - 40 });
    expect(doc.getPages()[0]?.getCropBox().width).toBe(200);
  });

  it('ignores an out-of-range page index', async () => {
    const source = await makeFixture(2);
    const cropped = await cropPdf(source, [
      { pageIndex: 99, insets: { top: 1, right: 1, bottom: 1, left: 1 } },
    ]);
    const doc = await PDFDocument.load(cropped);
    expect(doc.getPageCount()).toBe(2);
  });
});

describe('planSignature', () => {
  it('places a bottom-right signature inside the margins', () => {
    const placement = planSignature(600, 800, 300, 150, {
      widthRatio: 0.25,
      corner: 'bottom-right',
      margin: 20,
      pageIndices: [],
    });
    expect(placement.width).toBeCloseTo(150, 5);
    expect(placement.height).toBeCloseTo(75, 5);
    expect(placement.x).toBeCloseTo(600 - 20 - 150, 5);
    expect(placement.y).toBeCloseTo(20, 5);
  });

  it('keeps the signature inside the page for every corner', () => {
    for (const corner of ['bottom-left', 'top-left', 'top-right', 'bottom-right'] as const) {
      const placement = planSignature(600, 800, 200, 100, {
        widthRatio: 0.3,
        corner,
        margin: 24,
        pageIndices: [],
      });
      expect(placement.x).toBeGreaterThanOrEqual(0);
      expect(placement.y).toBeGreaterThanOrEqual(0);
      expect(placement.x + placement.width).toBeLessThanOrEqual(600);
      expect(placement.y + placement.height).toBeLessThanOrEqual(800);
    }
  });
});

describe('signPdf', () => {
  it('signs every page by default', async () => {
    const source = await makeFixture(3);
    const signed = await signPdf(source, makePng(40, 20));
    const doc = await PDFDocument.load(signed);
    expect(doc.getPageCount()).toBe(3);
    expect(signed.byteLength).toBeGreaterThan(source.byteLength);
  });

  it('signs only the requested page', async () => {
    const source = await makeFixture(3);
    const signed = await signPdf(source, makePng(20, 10), {
      widthRatio: 0.2,
      corner: 'bottom-right',
      margin: 12,
      pageIndices: [2],
    });

    const doc = await PDFDocument.load(signed);
    expect(doc.getPageCount()).toBe(3);
    expect(signed.byteLength).toBeGreaterThan(source.byteLength);
  });

  it('rejects an empty signature image', async () => {
    const source = await makeFixture(1);
    await expect(signPdf(source, new Uint8Array())).rejects.toThrow(/ลายเซ็น/);
  });
});
