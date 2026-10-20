/**
 * Parsing of user-typed page ranges such as `1-3, 5, 8-end`.
 *
 * Ranges are 1-based and refer to the *current* page order, not the original
 * file, because the grid can be reordered before splitting.
 */

export type PageRange = {
  /** 1-based, inclusive. */
  start: number;
  /** 1-based, inclusive. */
  end: number;
};

export type ParsedRanges = {
  /** Valid ranges sorted by start page. Empty when `errors` is non-empty. */
  ranges: PageRange[];
  errors: string[];
};

const RANGE_SEPARATOR = /[,;\n\uFF0C\u3001]+/g;

function normaliseToken(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-');
}

function toNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parses ranges against a known page count. Never throws: the caller shows
 * `errors` and keeps the export button disabled.
 */
export function parsePageRanges(input: string, pageCount: number): ParsedRanges {
  const errors: string[] = [];
  const ranges: PageRange[] = [];

  const tokens = input.split(RANGE_SEPARATOR).filter((token) => token.trim() !== '');

  if (tokens.length === 0) {
    return { ranges: [], errors: ['ยังไม่ได้ระบุช่วงหน้า'] };
  }

  for (const rawToken of tokens) {
    const token = normaliseToken(rawToken);
    const label = rawToken.trim();

    // `end` / `สุดท้าย` refer to the last page, so `8-end`, `8-` and `end` all work.
    const resolved = token
      .replace(/^(end|last|สุดท้าย)$/i, String(pageCount))
      .replace(/-(end|last|สุดท้าย)$/i, `-${pageCount}`)
      .replace(/-$/, `-${pageCount}`);

    const match = /^(\d+)(?:-(\d+))?$/.exec(resolved);

    if (!match) {
      errors.push(`ไม่รู้จักช่วงหน้า "${label}" — ใช้รูปแบบ 3, 1-3 หรือ 8-end`);
      continue;
    }

    const start = toNumber(match[1] ?? '');
    const end = match[2] === undefined ? start : toNumber(match[2]);

    if (start === null) {
      errors.push(`ไม่รู้จักเลขหน้าใน "${label}"`);
      continue;
    }
    if (end === null) {
      errors.push(`ไม่รู้จักเลขหน้าปลายช่วงใน "${label}"`);
      continue;
    }
    if (start < 1 || start > pageCount || end < 1 || end > pageCount) {
      errors.push(`ช่วง "${label}" อยู่นอกขอบเขต — เอกสารมี ${pageCount} หน้า`);
      continue;
    }
    if (start > end) {
      errors.push(`ช่วง "${label}" กลับด้าน — หน้าเริ่มต้องไม่มากกว่าหน้าสุดท้าย`);
      continue;
    }

    ranges.push({ start, end });
  }

  if (errors.length > 0) {
    return { ranges: [], errors };
  }

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (previous && current && current.start <= previous.end) {
      errors.push(
        `ช่วง ${describeRange(previous)} ทับซ้อนกับ ${describeRange(current)}`,
      );
    }
  }

  if (errors.length > 0) {
    return { ranges: [], errors };
  }

  return { ranges: sorted, errors: [] };
}

export function describeRange(range: PageRange): string {
  return range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`;
}

export function rangePageCount(range: PageRange): number {
  return range.end - range.start + 1;
}

/** Expands a range into 1-based page numbers. */
export function rangePages(range: PageRange): number[] {
  const pages: number[] = [];
  for (let page = range.start; page <= range.end; page += 1) {
    pages.push(page);
  }
  return pages;
}

/** Converts a 1-based range into 0-based slice bounds for the entry array. */
export function rangeToSlice(range: PageRange): { start: number; end: number } {
  return { start: range.start - 1, end: range.end };
}
