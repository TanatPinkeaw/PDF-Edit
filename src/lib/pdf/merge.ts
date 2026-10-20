/** Concatenates PDFs in the given order, copying pages into a fresh document. */

import { PDFDocument } from '@cantoo/pdf-lib';

import { PdfError, loadPdf } from '../pdf-ops';

export type MergeInput = {
  name: string;
  bytes: Uint8Array;
  /** Required when the file is encrypted. */
  password?: string;
};

export type MergeResult = {
  bytes: Uint8Array;
  pageCount: number;
  /** Page count of each input, in merge order. */
  pageCounts: number[];
};

export async function mergePdfs(inputs: readonly MergeInput[]): Promise<MergeResult> {
  if (inputs.length === 0) {
    throw new PdfError('empty', 'ยังไม่มีไฟล์ให้รวม — เพิ่มอย่างน้อย 1 ไฟล์');
  }

  const output = await PDFDocument.create();
  const pageCounts: number[] = [];

  for (const input of inputs) {
    let source: PDFDocument;
    try {
      source = await loadPdf(input.bytes, input.password);
    } catch (error) {
      if (error instanceof PdfError) {
        throw new PdfError(error.code, `${input.name}: ${error.message}`);
      }
      throw error;
    }

    const count = source.getPageCount();
    if (count < 1) {
      throw new PdfError('invalid', `${input.name}: ไฟล์นี้ไม่มีหน้า`);
    }

    const copied = await output.copyPages(source, source.getPageIndices());
    for (const page of copied) output.addPage(page);
    pageCounts.push(count);
  }

  const bytes = await output.save();
  return {
    bytes,
    pageCount: pageCounts.reduce((sum, count) => sum + count, 0),
    pageCounts,
  };
}
