import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ConvertError,
  assertInput,
  buildArgs,
  convertFile,
  createGate,
  outputSpec,
  safeStem,
} from '../src/convert.ts';

const WORD_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

describe('safeStem', () => {
  it('strips directories and extensions, keeping Thai marks', () => {
    expect(safeStem('C:/tmp/รายงาน ประจำปี.docx')).toBe('รายงาน ประจำปี');
  });

  it('drops Windows separators that could escape the temp directory', () => {
    expect(safeStem('../..\\etc/passwd')).toBe('passwd');
    expect(safeStem('..\\..\\secret.pdf')).toBe('secret');
  });

  it('replaces characters that break filenames', () => {
    expect(safeStem('a*b?c.pdf')).toBe('a-b-c');
  });

  it('falls back to a fixed name', () => {
    expect(safeStem('.docx')).toBe('document');
  });
});

describe('assertInput', () => {
  it('accepts word documents for word-to-pdf', () => {
    expect(() => assertInput('word-to-pdf', 'a.docx', 10)).not.toThrow();
    expect(() => assertInput('word-to-pdf', 'a.doc', 10)).not.toThrow();
  });

  it('rejects a PDF sent to word-to-pdf', () => {
    expect(() => assertInput('word-to-pdf', 'a.pdf', 10)).toThrowError(ConvertError);
  });

  it('rejects a Word file sent to pdf-to-word', () => {
    expect(() => assertInput('pdf-to-word', 'a.docx', 10)).toThrow(/pdf/i);
  });

  it('rejects empty and oversized files', () => {
    expect(() => assertInput('pdf-to-word', 'a.pdf', 0)).toThrow(/ว่าง/);
    expect(() =>
      assertInput('pdf-to-word', 'a.pdf', 100, { maxBytes: 10, timeoutMs: 1, maxConcurrent: 1 }),
    ).toThrow(/ใหญ่เกิน/);
  });
});

describe('outputSpec', () => {
  it('names the PDF after the Word file', () => {
    expect(outputSpec('word-to-pdf', 'รายงาน.docx')).toEqual({
      fileName: 'รายงาน.pdf',
      mime: 'application/pdf',
    });
  });

  it('names the docx after the PDF', () => {
    expect(outputSpec('pdf-to-word', 'invoice.pdf').fileName).toBe('invoice.docx');
  });
});

describe('buildArgs', () => {
  it('uses the pdf filter for word-to-pdf', () => {
    const args = buildArgs('word-to-pdf', '/tmp/in/doc.docx', '/tmp/out');
    expect(args).toContain('pdf');
    expect(args).toContain('--headless');
    expect(args.at(-1)).toBe('/tmp/in/doc.docx');
  });

  it('uses the docx filter for pdf-to-word', () => {
    expect(buildArgs('pdf-to-word', '/tmp/a.pdf', '/tmp/out')).toContain('docx');
  });
});

describe('convertFile', () => {
  it('returns the produced file and cleans the temp directory', async () => {
    const root = join(process.env.TEMP ?? '/tmp', `convert-test-${Date.now()}`);
    await mkdir(root, { recursive: true });

    const output = await convertFile('word-to-pdf', 'รายงาน.docx', WORD_BYTES, {
      sofficePath: 'soffice',
      tempRoot: root,
      runner: async (_command, args) => {
        const outDir = args[args.indexOf('--outdir') + 1] ?? '';
        await writeFile(join(outDir, 'รายงาน.pdf'), new Uint8Array([1, 2, 3]));
        return { code: 0, stderr: '' };
      },
    });

    expect(output.fileName).toBe('รายงาน.pdf');
    expect(output.mime).toBe('application/pdf');
    expect(Array.from(output.bytes)).toEqual([1, 2, 3]);
    expect(await readdir(root)).toEqual([]);
  });

  it('falls back to the only produced file when the name differs', async () => {
    const root = join(process.env.TEMP ?? '/tmp', `convert-test-${Date.now()}-b`);
    await mkdir(root, { recursive: true });

    const output = await convertFile('pdf-to-word', 'scan.pdf', PDF_BYTES, {
      sofficePath: 'soffice',
      tempRoot: root,
      runner: async (_command, args) => {
        const outDir = args[args.indexOf('--outdir') + 1] ?? '';
        await writeFile(join(outDir, 'scan.docx'), new Uint8Array([9]));
        return { code: 0, stderr: '' };
      },
    });

    expect(output.fileName).toBe('scan.docx');
    expect(Array.from(output.bytes)).toEqual([9]);
  });

  it('reports a failed conversion', async () => {
    const root = join(process.env.TEMP ?? '/tmp', `convert-test-${Date.now()}-c`);
    await mkdir(root, { recursive: true });

    await expect(
      convertFile('word-to-pdf', 'a.docx', WORD_BYTES, {
        sofficePath: 'soffice',
        tempRoot: root,
        runner: async () => ({ code: 1, stderr: 'boom' }),
      }),
    ).rejects.toThrow(/exit 1/);
  });

  it('rejects before spawning when the type is wrong', async () => {
    let called = false;
    await expect(
      convertFile('pdf-to-word', 'a.docx', WORD_BYTES, {
        sofficePath: 'soffice',
        runner: async () => {
          called = true;
          return { code: 0, stderr: '' };
        },
      }),
    ).rejects.toThrow(ConvertError);
    expect(called).toBe(false);
  });
});

describe('createGate', () => {
  it('never runs more than the allowed number of tasks at once', async () => {
    const gate = createGate(2);
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 6 }, () =>
        gate(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
        }),
      ),
    );

    expect(peak).toBe(2);
  });
});
