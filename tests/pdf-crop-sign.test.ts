import { PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';

import { cropPdf, normalizeInsets } from '../src/lib/pdf/crop';
import { planStamp, signPdf, planSignature, stampSignatures } from '../src/lib/pdf/sign';
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

function imageCount(bytes: Uint8Array, pageIndex: number): Promise<number> {
  return PDFDocument.load(bytes).then((doc) => {
    const resources = doc.getPages()[pageIndex]?.node.Resources();
    const xobjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    return xobjects ? xobjects.keys().length : 0;
  });
}

describe('planStamp', () => {
  it('centres a free-positioned signature on the page', () => {
    const placement = planStamp(600, 800, 300, 150, { x: 0.5, y: 0.5, widthRatio: 0.25 });
    expect(placement.width).toBeCloseTo(150, 5);
    expect(placement.height).toBeCloseTo(75, 5);
    expect(placement.x).toBeCloseTo(225, 5);
    expect(placement.y).toBeCloseTo(362.5, 5);
  });

  it('keeps a signature inside the page when placed at an edge', () => {
    const placement = planStamp(600, 800, 300, 150, { x: 1, y: 0, widthRatio: 0.25 });
    expect(placement.x).toBeCloseTo(450, 5);
    expect(placement.y).toBeCloseTo(725, 5);
  });

  it('clamps the width ratio into a sane range', () => {
    expect(planStamp(600, 800, 300, 150, { x: 0.5, y: 0.5, widthRatio: 4 }).width).toBeCloseTo(540, 5);
    expect(planStamp(600, 800, 300, 150, { x: 0.5, y: 0.5, widthRatio: -1 }).width).toBeCloseTo(30, 5);
  });
});

describe('stampSignatures', () => {
  it('applies each signature only to its own page range', async () => {
    const source = await makeFixture(3);
    const signed = await stampSignatures(source, [
      { png: makePng(40, 20), x: 0.5, y: 0.5, widthRatio: 0.3, fromPage: 1, toPage: 1 },
      { png: makePng(20, 20, [10, 20, 30]), x: 0.1, y: 0.9, widthRatio: 0.2, fromPage: 3, toPage: 3 },
    ]);

    expect(await imageCount(signed, 0)).toBe(1);
    expect(await imageCount(signed, 1)).toBe(0);
    expect(await imageCount(signed, 2)).toBe(1);
  });

  it('repeats a signature across every page in the range', async () => {
    const source = await makeFixture(3);
    const signed = await stampSignatures(source, [
      { png: makePng(30, 15), x: 0.5, y: 0.5, widthRatio: 0.25, fromPage: 1, toPage: 2 },
    ]);

    expect(await imageCount(signed, 0)).toBe(1);
    expect(await imageCount(signed, 1)).toBe(1);
    expect(await imageCount(signed, 2)).toBe(0);
  });

  it('places the same signature twice on one page', async () => {
    const source = await makeFixture(1);
    const png = makePng(30, 15);
    const signed = await stampSignatures(source, [
      { png, x: 0.3, y: 0.8, widthRatio: 0.2, fromPage: 1, toPage: 1 },
      { png, x: 0.7, y: 0.3, widthRatio: 0.2, fromPage: 1, toPage: 1 },
    ]);

    expect(await imageCount(signed, 0)).toBe(2);
  });

  it('rejects a request with no signatures', async () => {
    const source = await makeFixture(1);
    await expect(stampSignatures(source, [])).rejects.toThrow(/ลายเซ็น/);
  });

  it('rejects a range that misses the document', async () => {
    const source = await makeFixture(2);
    await expect(
      stampSignatures(source, [
        { png: makePng(10, 10), x: 0.5, y: 0.5, widthRatio: 0.2, fromPage: 9, toPage: 9 },
      ]),
    ).rejects.toThrow(/ช่วงหน้า/);
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
