import { describe, expect, it } from 'vitest';

import {
  parsePageRanges,
  rangePageCount,
  rangePages,
  rangeToSlice,
} from '../src/lib/page-ranges';

const run = (input: string, pageCount = 10) => parsePageRanges(input, pageCount);

describe('parsePageRanges', () => {
  it('parses a single page', () => {
    expect(run('4')).toEqual({ ranges: [{ start: 4, end: 4 }], errors: [] });
  });

  it('parses a closed range', () => {
    expect(run('2-5')).toEqual({ ranges: [{ start: 2, end: 5 }], errors: [] });
  });

  it('parses several ranges and sorts them', () => {
    expect(run('7-8, 1-3').ranges).toEqual([
      { start: 1, end: 3 },
      { start: 7, end: 8 },
    ]);
  });

  it('resolves "end" and a trailing dash to the last page', () => {
    expect(run('3-end').ranges).toEqual([{ start: 3, end: 10 }]);
    expect(run('3-').ranges).toEqual([{ start: 3, end: 10 }]);
    expect(run('end').ranges).toEqual([{ start: 10, end: 10 }]);
  });

  it('accepts spaces, semicolons and full-width commas', () => {
    expect(run(' 1 - 3 ; 5 ， 7 ').ranges).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 5 },
      { start: 7, end: 7 },
    ]);
  });

  it('rejects overlapping ranges', () => {
    const result = run('1-4, 3-6');
    expect(result.ranges).toEqual([]);
    expect(result.errors[0]).toContain('ทับซ้อน');
  });

  it('rejects ranges outside the document', () => {
    expect(run('1-11').errors[0]).toContain('นอกขอบเขต');
    expect(run('0-3').errors[0]).toContain('นอกขอบเขต');
  });

  it('rejects reversed ranges', () => {
    expect(run('5-2').errors[0]).toContain('กลับด้าน');
  });

  it('rejects unknown tokens', () => {
    expect(run('abc').errors).toHaveLength(1);
    expect(run('1..3').errors).toHaveLength(1);
  });

  it('rejects empty input', () => {
    expect(run('   ')).toEqual({ ranges: [], errors: ['ยังไม่ได้ระบุช่วงหน้า'] });
  });

  it('returns no valid ranges when any token fails', () => {
    const result = run('1-2, nope');
    expect(result.ranges).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it('supports the Thai word for the last page', () => {
    expect(run('ทั้งหมด').errors).toHaveLength(1);
    expect(run('8-สุดท้าย').ranges).toEqual([{ start: 8, end: 10 }]);
  });
});

describe('range helpers', () => {
  it('counts pages inclusively', () => {
    expect(rangePageCount({ start: 2, end: 2 })).toBe(1);
    expect(rangePageCount({ start: 2, end: 5 })).toBe(4);
  });

  it('expands and slices ranges', () => {
    expect(rangePages({ start: 2, end: 4 })).toEqual([2, 3, 4]);
    expect(rangeToSlice({ start: 2, end: 4 })).toEqual({ start: 1, end: 4 });
  });
});
