import { EncryptedPDFError } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  PdfError,
  buildPdf,
  buildPdfs,
  readPageCount,
  toLoadError,
} from '../src/lib/pdf-ops';
import { fixtureWidths, makeFixture, pageCountOf, pageWidths } from './helpers/fixture';

describe('buildPdf', () => {
  it('keeps the source order when no pages are moved', async () => {
    const bytes = await makeFixture(6);
    const out = await buildPdf(bytes, [0, 1, 2, 3, 4, 5]);
    expect(await pageWidths(out)).toEqual(fixtureWidths(6));
  });

  it('writes pages in the requested order', async () => {
    const bytes = await makeFixture(6);
    const out = await buildPdf(bytes, [5, 0, 3]);
    expect(await pageWidths(out)).toEqual([250, 200, 230]);
  });

  it('drops pages that are not requested', async () => {
    const bytes = await makeFixture(6);
    const out = await buildPdf(bytes, [1, 2]);
    expect(await pageCountOf(out)).toBe(2);
    expect(await pageWidths(out)).toEqual([210, 220]);
  });

  it('does not mutate the source, so repeated exports stay identical', async () => {
    const bytes = await makeFixture(5);
    const first = await buildPdf(bytes, [4, 3, 2]);
    const second = await buildPdf(bytes, [4, 3, 2]);
    const original = await buildPdf(bytes, [0, 1, 2, 3, 4]);

    expect(await pageWidths(first)).toEqual([240, 230, 220]);
    expect(await pageWidths(second)).toEqual([240, 230, 220]);
    expect(await pageWidths(original)).toEqual(fixtureWidths(5));
    expect(await pageCountOf(bytes)).toBe(5);
  });

  it('rejects an empty page list', async () => {
    const bytes = await makeFixture(3);
    await expect(buildPdf(bytes, [])).rejects.toMatchObject({ code: 'empty' });
  });

  it('rejects out-of-range page indices', async () => {
    const bytes = await makeFixture(3);
    await expect(buildPdf(bytes, [3])).rejects.toMatchObject({ code: 'out-of-range' });
    await expect(buildPdf(bytes, [-1])).rejects.toMatchObject({ code: 'out-of-range' });
  });

  it('rejects bytes that are not a PDF', async () => {
    const junk = new TextEncoder().encode('this is not a pdf');
    const error = await buildPdf(junk, [0]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PdfError);
    expect((error as PdfError).code).toBe('invalid');
  });
});

describe('buildPdfs', () => {
  it('splits one source into independent documents', async () => {
    const bytes = await makeFixture(6);
    const parts = await buildPdfs(bytes, [
      { label: 'p1-2', indices: [0, 1] },
      { label: 'p3', indices: [2] },
      { label: 'p4-6', indices: [3, 4, 5] },
    ]);

    expect(parts.map((part) => part.label)).toEqual(['p1-2', 'p3', 'p4-6']);
    expect(await pageWidths(parts[0]!.bytes)).toEqual([200, 210]);
    expect(await pageWidths(parts[1]!.bytes)).toEqual([220]);
    expect(await pageWidths(parts[2]!.bytes)).toEqual([230, 240, 250]);
  });

  it('validates every group before failing', async () => {
    const bytes = await makeFixture(4);
    await expect(
      buildPdfs(bytes, [
        { label: 'ok', indices: [0] },
        { label: 'bad', indices: [99] },
      ]),
    ).rejects.toMatchObject({ code: 'out-of-range' });
  });
});

describe('errors', () => {
  it('reports encrypted files with a typed code', () => {
    const error = toLoadError(new EncryptedPDFError());
    expect(error.code).toBe('encrypted');
    expect(error.message).toContain('รหัสผ่าน');
  });

  it('counts pages of a valid file', async () => {
    const bytes = await makeFixture(7);
    expect(await readPageCount(bytes)).toBe(7);
  });

  it('surfaces a clear message for corrupt files', async () => {
    const error = await readPageCount(new Uint8Array([0, 1, 2, 3])).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(PdfError);
    expect((error as PdfError).message).toContain('เปิดไฟล์ PDF ไม่ได้');
  });
});
