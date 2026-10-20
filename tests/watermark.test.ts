import { PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';

import { PdfError } from '../src/lib/pdf-ops';
import { watermarkPdf } from '../src/lib/pdf/watermark';
import { makeFixture, pageCountOf } from './helpers/fixture';
import { extractText } from './helpers/pdf-text';

// 1×1 transparent PNG, enough to exercise embedPng + drawImage.
const TINY_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

async function imageCount(bytes: Uint8Array, pageIndex = 0): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const resources = doc.getPages()[pageIndex]?.node.Resources();
  const xobjects = resources?.lookup(PDFName.of('XObject'), PDFDict);
  return xobjects?.keys().length ?? 0;
}

describe('watermarkPdf — text', () => {
  it('stamps every page by default', async () => {
    const bytes = await makeFixture(3);
    const marked = await watermarkPdf(bytes, {
      kind: 'text',
      text: 'CONFIDENTIAL',
      opacity: 0.2,
    });

    expect(await pageCountOf(marked)).toBe(3);
    const text = await extractText(marked);
    expect(text.pages.filter((page) => page.includes('CONFIDENTIAL'))).toHaveLength(3);
  });

  it('renders Thai text with the embedded font', async () => {
    const marked = await watermarkPdf(await makeFixture(1), {
      kind: 'text',
      text: 'ห้ามเผยแพร่',
      weight: 'bold',
    });
    const text = await extractText(marked);
    expect(text.pages[0]).toContain('ห้ามเผยแพร่');
  });

  it('only stamps the selected pages', async () => {
    const marked = await watermarkPdf(await makeFixture(4), {
      kind: 'text',
      text: 'DRAFT',
      pages: [1, 3],
    });
    const text = await extractText(marked);
    expect(text.pages[0]).toContain('DRAFT');
    expect(text.pages[1]).not.toContain('DRAFT');
    expect(text.pages[2]).toContain('DRAFT');
    expect(text.pages[3]).not.toContain('DRAFT');
  });

  it('repeats the text when tiled', async () => {
    const marked = await watermarkPdf(await makeFixture(1), {
      kind: 'text',
      text: 'SAMPLE',
      position: 'tile',
      fontSize: 18,
      rotation: -30,
      gap: 40,
    });
    const text = await extractText(marked);
    const occurrences = text.pages[0]?.match(/SAMPLE/g)?.length ?? 0;
    expect(occurrences).toBeGreaterThan(2);
  });

  it('accepts a custom colour and angle', async () => {
    const marked = await watermarkPdf(await makeFixture(1), {
      kind: 'text',
      text: 'ROTATED',
      color: '#b8431f',
      rotation: 45,
      position: 'middle-center',
    });
    const text = await extractText(marked);
    expect(text.pages[0]).toContain('ROTATED');
  });

  it('rejects empty text and out-of-range pages', async () => {
    await expect(
      watermarkPdf(await makeFixture(1), { kind: 'text', text: '   ' }),
    ).rejects.toBeInstanceOf(PdfError);

    await expect(
      watermarkPdf(await makeFixture(1), { kind: 'text', text: 'X', pages: [5] }),
    ).rejects.toThrow(/นอกเอกสาร/);
  });
});

describe('watermarkPdf — image', () => {
  it('embeds the image once per page and keeps the pages', async () => {
    const bytes = await makeFixture(2);
    const marked = await watermarkPdf(bytes, {
      kind: 'image',
      bytes: TINY_PNG,
      type: 'png',
      widthRatio: 0.5,
      opacity: 0.3,
    });

    expect(await pageCountOf(marked)).toBe(2);
    expect(await imageCount(marked, 0)).toBeGreaterThan(0);
    expect(await imageCount(marked, 1)).toBeGreaterThan(0);
    expect(marked.byteLength).toBeGreaterThan(bytes.byteLength);
  });

  it('tiles the image across the page', async () => {
    const marked = await watermarkPdf(await makeFixture(1), {
      kind: 'image',
      bytes: TINY_PNG,
      type: 'png',
      widthRatio: 0.1,
      position: 'tile',
      gap: 20,
    });
    expect(await imageCount(marked, 0)).toBeGreaterThan(1);
    expect(await pageCountOf(marked)).toBe(1);
  });
});
