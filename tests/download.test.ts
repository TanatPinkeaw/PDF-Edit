import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  baseName,
  editedFileName,
  imageFileName,
  imagesZipFileName,
  rangeFileName,
  sanitizeFileName,
  selectionFileName,
  splitZipFileName,
  zipFiles,
} from '../src/lib/download';

describe('file names', () => {
  it('strips the extension and handles odd names', () => {
    expect(baseName('report.PDF')).toBe('report');
    expect(baseName('  scan  ')).toBe('scan');
    expect(baseName('.pdf')).toBe('document');
  });

  it('builds output names', () => {
    expect(editedFileName('report.pdf')).toBe('report-edited.pdf');
    expect(selectionFileName('report.pdf')).toBe('report-selection.pdf');
    expect(rangeFileName('report.pdf', 1, 3)).toBe('report-p1-3.pdf');
    expect(rangeFileName('report.pdf', 4, 4)).toBe('report-p4.pdf');
    expect(splitZipFileName('report.pdf')).toBe('report-split.zip');
  });

  it('names exported images by displayed page number', () => {
    expect(imageFileName('report.pdf', 1, 'png')).toBe('report-p1.png');
    expect(imageFileName('My Scan.PDF', 12, 'jpg')).toBe('My Scan-p12.jpg');
    expect(imagesZipFileName('report.pdf')).toBe('report-images.zip');
  });

  it('strips characters that break downloads', () => {
    expect(sanitizeFileName('a/b:c*d?.pdf')).toBe('a-b-c-d-.pdf');
  });
});

describe('zipFiles', () => {
  it('packs every file with its bytes intact', () => {
    const files = [
      { name: 'a.pdf', bytes: new Uint8Array([1, 2, 3]) },
      { name: 'b.pdf', bytes: new Uint8Array([9]) },
    ];
    const zipped = zipFiles(files);
    const unpacked = unzipSync(zipped);

    expect(Object.keys(unpacked).sort()).toEqual(['a.pdf', 'b.pdf']);
    expect(Array.from(unpacked['a.pdf']!)).toEqual([1, 2, 3]);
    expect(Array.from(unpacked['b.pdf']!)).toEqual([9]);
  });

  it('renames duplicate entries instead of losing pages', () => {
    const zipped = zipFiles([
      { name: 'p1.pdf', bytes: new Uint8Array([1]) },
      { name: 'p1.pdf', bytes: new Uint8Array([2]) },
    ]);
    const unpacked = unzipSync(zipped);
    expect(Object.keys(unpacked).sort()).toEqual(['p1-2.pdf', 'p1.pdf']);
  });
});
