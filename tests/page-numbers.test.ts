import { describe, expect, it } from 'vitest';

import { PdfError } from '../src/lib/pdf-ops';
import {
  addPageNumbers,
  formatPageLabel,
  numberedPages,
  templateError,
  toThaiDigits,
} from '../src/lib/pdf/page-numbers';
import { makeFixture, pageCountOf, pageWidths } from './helpers/fixture';
import { extractItems, extractText } from './helpers/pdf-text';

describe('formatPageLabel', () => {
  it('replaces both placeholders, repeatedly', () => {
    expect(formatPageLabel('{n} / {total}', { page: 3, total: 12 })).toBe('3 / 12');
    expect(formatPageLabel('หน้า {n} จาก {total} ({n})', { page: 1, total: 2 })).toBe(
      'หน้า 1 จาก 2 (1)',
    );
  });

  it('converts digits to Thai numerals on request', () => {
    expect(toThaiDigits('12 / 30')).toBe('๑๒ / ๓๐');
    expect(formatPageLabel('{n}/{total}', { page: 10, total: 24, thaiDigits: true })).toBe(
      '๑๐/๒๔',
    );
  });

  it('throws when the template has no placeholder', () => {
    expect(() => formatPageLabel('หน้า', { page: 1, total: 2 })).toThrow(PdfError);
  });
});

describe('templateError', () => {
  it('accepts the known placeholders only', () => {
    expect(templateError('{n} / {total}')).toBeNull();
    expect(templateError('หน้า {n}')).toBeNull();
    expect(templateError('')).toMatch(/ยังไม่ได้ใส่/);
    expect(templateError('{page}')).toMatch(/เฉพาะ \{n\}/);
    expect(templateError('หน้า')).toMatch(/ต้องมี \{n\}/);
  });
});

describe('numberedPages', () => {
  it('skips leading pages or honours an explicit list', () => {
    expect(numberedPages(4)).toEqual([1, 2, 3, 4]);
    expect(numberedPages(4, { skipFirst: 2 })).toEqual([3, 4]);
    expect(numberedPages(4, { pages: [4, 2] })).toEqual([2, 4]);
  });

  it('rejects pages outside the document', () => {
    expect(() => numberedPages(2, { pages: [3] })).toThrow(/นอกเอกสาร/);
  });
});

describe('addPageNumbers', () => {
  it('numbers every page and keeps the page count', async () => {
    const bytes = await makeFixture(6);
    const numbered = await addPageNumbers(bytes, { template: '{n} / {total}' });

    expect(await pageCountOf(numbered)).toBe(6);
    expect(await pageWidths(numbered)).toEqual(await pageWidths(bytes));

    const text = await extractText(numbered);
    expect(text.pages[0]).toContain('1 / 6');
    expect(text.pages[5]).toContain('6 / 6');
  });

  it('skips the first pages and starts where asked', async () => {
    const bytes = await makeFixture(5);
    const numbered = await addPageNumbers(bytes, {
      template: 'หน้า {n}',
      skipFirst: 2,
      start: 10,
    });

    const text = await extractText(numbered);
    expect(text.pages[0]).not.toContain('หน้า');
    expect(text.pages[2]).toContain('หน้า 10');
    expect(text.pages[4]).toContain('หน้า 12');
  });

  it('numbers only the selected pages', async () => {
    const bytes = await makeFixture(4);
    const numbered = await addPageNumbers(bytes, { template: 'p{n}', pages: [2, 4] });
    const text = await extractText(numbered);

    expect(text.pages[0]).not.toContain('p1');
    expect(text.pages[1]).toContain('p1');
    expect(text.pages[2]).not.toContain('p2');
    expect(text.pages[3]).toContain('p2');
  });

  it('renders Thai digits with the embedded Sarabun font', async () => {
    const bytes = await makeFixture(2);
    const numbered = await addPageNumbers(bytes, {
      template: '{n} / {total}',
      thaiDigits: true,
      weight: 'bold',
    });
    const text = await extractText(numbered);
    expect(text.pages[0]).toContain('๑ / ๒');
  });

  it('places bottom-centre labels near the bottom edge, centred', async () => {
    const bytes = await makeFixture(2);
    const numbered = await addPageNumbers(bytes, {
      template: 'p{n}',
      position: 'bottom-center',
      margin: 20,
      fontSize: 12,
    });
    const items = await extractItems(numbered);
    const label = items[0]?.find((item) => item.str.includes('p1'));
    expect(label).toBeDefined();
    expect(label?.y).toBeLessThan(40);
    const pageWidth = (await pageWidths(numbered))[0] ?? 0;
    expect((label?.x ?? 0) + (label?.width ?? 0) / 2).toBeCloseTo(pageWidth / 2, -1);
  });

  it('places top-right labels near the top edge', async () => {
    const bytes = await makeFixture(1);
    const numbered = await addPageNumbers(bytes, {
      template: 'p{n}',
      position: 'top-right',
      margin: 20,
      fontSize: 12,
    });
    const items = await extractItems(numbered);
    const label = items[0]?.find((item) => item.str.includes('p1'));
    const pageWidth = (await pageWidths(numbered))[0] ?? 0;
    expect(label?.y).toBeGreaterThan(400 - 60);
    expect((label?.x ?? 0) + (label?.width ?? 0)).toBeGreaterThan(pageWidth - 40);
  });

  it('rejects an unusable template', async () => {
    await expect(addPageNumbers(await makeFixture(1), { template: 'หน้า' })).rejects.toThrow(
      /ต้องมี \{n\}/,
    );
  });
});
