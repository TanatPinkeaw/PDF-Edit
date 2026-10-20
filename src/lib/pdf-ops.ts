/**
 * Structural PDF operations: deleting, reordering and extracting pages.
 *
 * The uploaded bytes are never mutated. Every export copies the requested
 * source pages, in the requested order, into a fresh document, so exporting
 * twice (or splitting the same source several ways) always yields the same
 * result.
 */

import { EncryptedPDFError, PDFDocument } from '@cantoo/pdf-lib';

export type PdfErrorCode =
  | 'encrypted'
  | 'wrong-password'
  | 'not-encrypted'
  | 'invalid'
  | 'empty'
  | 'out-of-range'
  | 'no-text';

export class PdfError extends Error {
  readonly code: PdfErrorCode;

  constructor(code: PdfErrorCode, message: string) {
    super(message);
    this.name = 'PdfError';
    this.code = code;
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

/** Maps library load failures onto typed, user-facing errors. */
export function toLoadError(error: unknown): PdfError {
  if (error instanceof EncryptedPDFError) {
    return new PdfError('encrypted', 'ไฟล์นี้มีรหัสผ่าน (เข้ารหัสไว้) — ต้องใส่รหัสก่อนเปิด');
  }
  return new PdfError('invalid', `เปิดไฟล์ PDF ไม่ได้: ${messageOf(error)}`);
}

function looksLikeWrongPassword(error: unknown): boolean {
  return /password/i.test(messageOf(error));
}

/**
 * Loads without decrypting. pdf-lib throws (and leaks an unhandled rejection)
 * when an encrypted file is loaded without `ignoreEncryption`, so every caller
 * goes through this probe first.
 */
export async function probePdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
  } catch (error) {
    throw toLoadError(error);
  }
}

/** Loads a PDF, requiring `password` when the file is encrypted. */
export async function loadPdf(bytes: Uint8Array, password?: string): Promise<PDFDocument> {
  const probe = await probePdf(bytes);
  if (!probe.isEncrypted) return probe;
  if (!password) {
    throw new PdfError('encrypted', 'ไฟล์นี้มีรหัสผ่าน — กรุณาใส่รหัสเพื่อเปิด');
  }

  try {
    return await PDFDocument.load(bytes, { password, updateMetadata: false });
  } catch (error) {
    if (looksLikeWrongPassword(error)) {
      throw new PdfError('wrong-password', 'รหัสผ่านไม่ถูกต้อง');
    }
    throw toLoadError(error);
  }
}

export type PdfInspection = {
  pageCount: number;
  encrypted: boolean;
};

/** Detects encryption and reads the page count, decrypting only when needed. */
export async function inspectPdf(bytes: Uint8Array, password?: string): Promise<PdfInspection> {
  const probe = await probePdf(bytes);
  if (!probe.isEncrypted) {
    return { pageCount: requirePageCount(probe), encrypted: false };
  }
  const unlocked = await loadPdf(bytes, password);
  return { pageCount: requirePageCount(unlocked), encrypted: true };
}

function requirePageCount(doc: PDFDocument): number {
  const count = doc.getPageCount();
  if (count < 1) {
    throw new PdfError('invalid', 'ไฟล์นี้ไม่มีหน้าให้แก้ไข');
  }
  return count;
}

export async function readPageCount(bytes: Uint8Array, password?: string): Promise<number> {
  return (await inspectPdf(bytes, password)).pageCount;
}

function assertIndices(indices: readonly number[], pageCount: number): void {
  if (indices.length === 0) {
    throw new PdfError('empty', 'ไม่มีหน้าที่จะสร้างไฟล์ — ต้องเลือกอย่างน้อย 1 หน้า');
  }
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= pageCount) {
      throw new PdfError('out-of-range', `เลขหน้า ${index + 1} อยู่นอกเอกสารต้นฉบับ`);
    }
  }
}

async function assemble(
  source: PDFDocument,
  indices: readonly number[],
): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, [...indices]);
  for (const page of pages) {
    output.addPage(page);
  }
  return output.save();
}

/** Builds a new PDF from the given 0-based source page indices, in that order. */
export async function buildPdf(bytes: Uint8Array, indices: readonly number[]): Promise<Uint8Array> {
  const source = await loadPdf(bytes);
  assertIndices(indices, source.getPageCount());
  return assemble(source, indices);
}

export type PdfGroup = {
  label: string;
  indices: readonly number[];
};

export type BuiltPdf = {
  label: string;
  bytes: Uint8Array;
};

/**
 * Builds several PDFs from one source document. The source is parsed once so
 * splitting a large file into many parts stays cheap.
 */
export async function buildPdfs(
  bytes: Uint8Array,
  groups: readonly PdfGroup[],
): Promise<BuiltPdf[]> {
  const source = await loadPdf(bytes);
  const pageCount = source.getPageCount();
  const result: BuiltPdf[] = [];
  for (const group of groups) {
    assertIndices(group.indices, pageCount);
    result.push({ label: group.label, bytes: await assemble(source, group.indices) });
  }
  return result;
}
