import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  fitInside,
  imageSize,
  imagesToPdf,
  planPlacement,
} from '../src/lib/pdf/images-to-pdf';
import { makePng } from './helpers/images';

describe('imageSize', () => {
  it('reads PNG dimensions from the header', () => {
    expect(imageSize(makePng(7, 3), 'image/png')).toEqual({ width: 7, height: 3 });
  });

  it('rejects a truncated PNG', () => {
    expect(() => imageSize(new Uint8Array([0x89, 0x50]), 'image/png')).toThrow(/PNG/);
  });

  it('rejects data that is not a JPEG', () => {
    expect(() => imageSize(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), 'image/jpeg')).toThrow(
      /JPEG/,
    );
  });
});

describe('planPlacement', () => {
  it('uses the image size plus margin for auto pages', () => {
    const placement = planPlacement(400, 300, { pageSize: 'auto', margin: 10 });
    expect(placement).toMatchObject({ width: 400, height: 300, pageWidth: 420, pageHeight: 320 });
    expect(placement.x).toBe(10);
    expect(placement.y).toBe(10);
  });

  it('centres the image inside a fixed page', () => {
    const placement = planPlacement(400, 300, { pageSize: 'a4', margin: 36 });
    expect(placement.pageWidth).toBeCloseTo(595.28, 1);
    expect(placement.pageHeight).toBeCloseTo(841.89, 1);
    expect(placement.x + placement.width / 2).toBeCloseTo(595.28 / 2, 1);
    expect(placement.width).toBeLessThanOrEqual(595.28 - 72);
  });

  it('clamps an oversized margin instead of producing a negative box', () => {
    const placement = planPlacement(100, 100, { pageSize: 'letter', margin: 5000 });
    expect(placement.width).toBeGreaterThan(0);
    expect(placement.height).toBeGreaterThan(0);
  });

  it('keeps the aspect ratio', () => {
    const fitted = fitInside(1000, 500, 200, 200);
    expect(fitted.width / fitted.height).toBeCloseTo(2, 5);
  });
});

describe('imagesToPdf', () => {
  it('creates one page per image in the given order', async () => {
    const bytes = await imagesToPdf(
      [
        { bytes: makePng(4, 2), mime: 'image/png' },
        { bytes: makePng(2, 6), mime: 'image/png' },
      ],
      { pageSize: 'auto', margin: 0 },
    );

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPages()[0]?.getWidth()).toBe(4);
    expect(doc.getPages()[0]?.getHeight()).toBe(2);
    expect(doc.getPages()[1]?.getHeight()).toBe(6);
  });

  it('refuses an empty list', async () => {
    await expect(imagesToPdf([], { pageSize: 'a4', margin: 0 })).rejects.toThrow(/ภาพ/);
  });
});
