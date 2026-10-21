/**
 * Word ⇄ PDF conversion through a headless LibreOffice.
 *
 * This is the one place in the product where a document leaves the browser, so
 * the limits are deliberately tight: one file per request, a hard timeout, a
 * temporary directory per call, and no shell interpolation anywhere.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { spawn } from 'node:child_process';

export type ConvertKind = 'word-to-pdf' | 'pdf-to-word';

export type ConvertLimits = {
  maxBytes: number;
  timeoutMs: number;
  maxConcurrent: number;
};

export const CONVERT_LIMITS: ConvertLimits = {
  maxBytes: 50 * 1024 * 1024,
  timeoutMs: 60_000,
  maxConcurrent: 2,
};

const WORD_EXTENSIONS = ['.docx', '.doc', '.odt', '.rtf'];

export class ConvertError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ConvertError';
    this.status = status;
    this.code = code;
  }
}

/** Keeps only a safe stem: no separators, no control characters, bounded length. */
export function safeStem(fileName: string): string {
  // Normalise separators first: the browser sends one flavour, Node's basename
  // only understands the host's.
  const stem = basename(fileName.replace(/\\/g, '/')).replace(/\.[^.]+$/, '');
  const cleaned = stem
    // Thai vowels and tone marks are combining marks, so \p{M} has to be kept.
    .replace(/[^\p{L}\p{N}\p{M}._ -]/gu, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned === '' ? 'document' : cleaned).slice(0, 80);
}

export function assertInput(kind: ConvertKind, fileName: string, byteLength: number, limits = CONVERT_LIMITS): void {
  if (byteLength === 0) throw new ConvertError(400, 'empty_file', 'ไฟล์ว่างเปล่า');
  if (byteLength > limits.maxBytes) {
    throw new ConvertError(
      413,
      'file_too_large',
      `ไฟล์ใหญ่เกิน ${Math.round(limits.maxBytes / 1024 / 1024)} MB`,
    );
  }
  const extension = extname(fileName).toLowerCase();
  if (kind === 'word-to-pdf' && !WORD_EXTENSIONS.includes(extension)) {
    throw new ConvertError(415, 'unsupported_type', `ไฟล์ Word ที่รองรับ: ${WORD_EXTENSIONS.join(' ')}`);
  }
  if (kind === 'pdf-to-word' && extension !== '.pdf') {
    throw new ConvertError(415, 'unsupported_type', 'ต้องเป็นไฟล์ .pdf');
  }
}

export type ConvertOutput = {
  fileName: string;
  mime: string;
  bytes: Uint8Array;
};

export function outputSpec(kind: ConvertKind, fileName: string): { fileName: string; mime: string } {
  const stem = safeStem(fileName);
  return kind === 'word-to-pdf'
    ? { fileName: `${stem}.pdf`, mime: 'application/pdf' }
    : {
        fileName: `${stem}.docx`,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
}

/** LibreOffice filter names; the plain `docx` filter is fine for Writer documents. */
export function buildArgs(kind: ConvertKind, inputPath: string, outDir: string): string[] {
  const target = kind === 'word-to-pdf' ? 'pdf' : 'docx';
  return ['--headless', '--norestore', '--nolockcheck', `--convert-to`, target, '--outdir', outDir, inputPath];
}

type Runner = (command: string, args: string[], timeoutMs: number) => Promise<{ code: number; stderr: string }>;

const defaultRunner: Runner = (command, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new ConvertError(504, 'timeout', 'แปลงไฟล์นานเกินกำหนด (timeout)'));
    }, timeoutMs);

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(
        new ConvertError(
          501,
          'converter_missing',
          `เรียก LibreOffice ไม่ได้: ${error.message} — ต้องติดตั้ง libreoffice ใน container ของ API`,
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });

export type ConvertDeps = {
  sofficePath: string;
  limits?: ConvertLimits;
  runner?: Runner;
  /** Root for temporary directories; tests point this somewhere disposable. */
  tempRoot?: string;
};

/**
 * Runs one conversion. Every call gets its own temporary directory so parallel
 * requests cannot read each other's files, and the directory is removed even
 * when the converter fails.
 */
export async function convertFile(
  kind: ConvertKind,
  fileName: string,
  bytes: Uint8Array,
  deps: ConvertDeps,
): Promise<ConvertOutput> {
  const limits = deps.limits ?? CONVERT_LIMITS;
  assertInput(kind, fileName, bytes.byteLength, limits);

  const dir = await mkdtemp(join(deps.tempRoot ?? tmpdir(), 'pdfstudio-'));
  const extension = extname(fileName).toLowerCase();
  const inputPath = join(dir, `input${extension}`);
  const runner = deps.runner ?? defaultRunner;

  try {
    await writeFile(inputPath, bytes);
    const result = await runner(deps.sofficePath, buildArgs(kind, inputPath, dir), limits.timeoutMs);
    if (result.code !== 0) {
      throw new ConvertError(502, 'conversion_failed', `LibreOffice แปลงไม่สำเร็จ (exit ${result.code})`);
    }

    const spec = outputSpec(kind, fileName);
    const produced = join(dir, spec.fileName);
    let output: Buffer;
    try {
      output = await readFile(produced);
    } catch {
      // LibreOffice sometimes drops the extension it was asked for; take the
      // first matching file instead of guessing a name.
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(dir);
      const match = entries.find((entry) => entry !== `input${extension}` && !entry.startsWith('.'));
      if (!match) throw new ConvertError(502, 'conversion_failed', 'ไม่พบไฟล์ผลลัพธ์จาก LibreOffice');
      output = await readFile(join(dir, match));
    }

    return { ...spec, bytes: new Uint8Array(output) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Simple in-process concurrency gate shared by the route. */
export function createGate(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T,>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}
