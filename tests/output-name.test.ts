import { describe, expect, it } from 'vitest';

import {
  MAX_OUTPUT_NAME_LENGTH,
  fileBaseName,
  resolveOutputName,
  sanitizeNameBase,
} from '../src/lib/output-name';

describe('fileBaseName', () => {
  it('drops the last extension and keeps dots inside the name', () => {
    expect(fileBaseName('report.PDF')).toBe('report');
    expect(fileBaseName('report.v2.pdf')).toBe('report.v2');
    expect(fileBaseName('scan')).toBe('scan');
  });

  it('falls back when there is no base left', () => {
    expect(fileBaseName(' .pdf ')).toBe('document');
  });
});

describe('sanitizeNameBase', () => {
  it('replaces characters that break file names', () => {
    expect(sanitizeNameBase('a/b:c*d?"<>|')).toBe('a-b-c-d-----');
  });

  it('keeps Thai text and collapses whitespace', () => {
    expect(sanitizeNameBase('  รายงาน   ประจำเดือน  ')).toBe('รายงาน ประจำเดือน');
  });

  it('removes a pasted extension so it is not doubled', () => {
    expect(sanitizeNameBase('report.pdf')).toBe('report');
    expect(sanitizeNameBase('letter.DOCX')).toBe('letter');
  });

  it('trims dots and returns empty for unusable input', () => {
    expect(sanitizeNameBase('...')).toBe('');
    expect(sanitizeNameBase('   ')).toBe('');
  });

  it('escapes Windows reserved device names', () => {
    expect(sanitizeNameBase('CON')).toBe('CON-file');
    expect(sanitizeNameBase('nul')).toBe('nul-file');
  });

  it('caps very long names', () => {
    const result = sanitizeNameBase('a'.repeat(MAX_OUTPUT_NAME_LENGTH + 40));
    expect(result).toHaveLength(MAX_OUTPUT_NAME_LENGTH);
  });
});

describe('resolveOutputName', () => {
  it('uses the custom base with the fixed extension', () => {
    expect(resolveOutputName('ใบเสร็จ-final', 'report-edited.pdf', 'pdf')).toBe(
      'ใบเสร็จ-final.pdf',
    );
  });

  it('falls back to the suggested name when empty', () => {
    expect(resolveOutputName('  ', 'report-merged.pdf', 'pdf')).toBe('report-merged.pdf');
  });

  it('falls back to document when both are unusable', () => {
    expect(resolveOutputName('...', '.pdf', 'pdf')).toBe('document.pdf');
  });

  it('supports a non-PDF extension', () => {
    expect(resolveOutputName('report', 'report.pdf', 'docx')).toBe('report.docx');
  });
});
