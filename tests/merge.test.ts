import { describe, expect, it } from 'vitest';

import { PdfError } from '../src/lib/pdf-ops';
import { mergePdfs } from '../src/lib/pdf/merge';
import { protectPdf } from '../src/lib/pdf/security';
import { fixtureWidths, makeFixture, pageCountOf, pageWidths } from './helpers/fixture';

describe('mergePdfs', () => {
  it('concatenates files in order and keeps every page', async () => {
    const first = await makeFixture(3);
    const second = await makeFixture(2);

    const merged = await mergePdfs([
      { name: 'a.pdf', bytes: first },
      { name: 'b.pdf', bytes: second },
    ]);

    expect(merged.pageCount).toBe(5);
    expect(merged.pageCounts).toEqual([3, 2]);
    expect(await pageCountOf(merged.bytes)).toBe(5);
    expect(await pageWidths(merged.bytes)).toEqual([
      ...fixtureWidths(3),
      ...fixtureWidths(2),
    ]);
  });

  it('merges three files and preserves the requested order', async () => {
    const a = await makeFixture(1);
    const b = await makeFixture(2);

    const merged = await mergePdfs([
      { name: 'b.pdf', bytes: b },
      { name: 'a.pdf', bytes: a },
      { name: 'b-again.pdf', bytes: b },
    ]);

    expect(merged.pageCounts).toEqual([2, 1, 2]);
    expect(await pageWidths(merged.bytes)).toEqual([200, 210, 200, 200, 210]);
  });

  it('requires a password for encrypted inputs and names the file', async () => {
    const plain = await makeFixture(2);
    const locked = await protectPdf(plain, { userPassword: 'merge-pass' });

    await expect(mergePdfs([{ name: 'locked.pdf', bytes: locked }])).rejects.toThrow(
      /locked\.pdf.*รหัสผ่าน/,
    );

    const merged = await mergePdfs([
      { name: 'locked.pdf', bytes: locked, password: 'merge-pass' },
      { name: 'plain.pdf', bytes: plain },
    ]);
    expect(merged.pageCount).toBe(4);
  });

  it('rejects a wrong password', async () => {
    const locked = await protectPdf(await makeFixture(1), { userPassword: 'right-pass' });
    const attempt = mergePdfs([{ name: 'locked.pdf', bytes: locked, password: 'wrong-pass' }]);
    await expect(attempt).rejects.toBeInstanceOf(PdfError);
    await expect(attempt).rejects.toThrow(/รหัสผ่านไม่ถูกต้อง/);
  });

  it('rejects an empty input list', async () => {
    await expect(mergePdfs([])).rejects.toThrow(/ยังไม่มีไฟล์/);
  });
});
