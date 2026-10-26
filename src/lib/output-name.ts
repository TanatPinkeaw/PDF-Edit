/**
 * Output naming. Every export shows one editable base name; the extension is
 * fixed per tool so a download can never come out as the wrong file type.
 */

export const MAX_OUTPUT_NAME_LENGTH = 120;

/** Characters Windows and most download paths refuse. */
const INVALID_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** A user may paste a full name; drop the extension so it is not doubled. */
const KNOWN_EXTENSION = /\.(pdf|docx|zip|png|jpe?g)$/i;

const WINDOWS_RESERVED = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

/** `report.v2.pdf` → `report.v2`; a name with no base falls back to document. */
export function fileBaseName(fileName: string): string {
  const trimmed = fileName.trim().replace(/\.[a-z0-9]{1,6}$/i, '');
  return trimmed === '' ? 'document' : trimmed;
}

/**
 * Makes a name safe for a download. Returns '' when nothing usable is left so
 * callers can decide whether to fall back to the suggested name.
 */
export function sanitizeNameBase(input: string): string {
  const cleaned = input
    .replace(KNOWN_EXTENSION, '')
    .replace(INVALID_CHARS, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .slice(0, MAX_OUTPUT_NAME_LENGTH)
    .replace(/[.\s]+$/, '');

  if (cleaned === '') return '';
  return WINDOWS_RESERVED.has(cleaned.toLowerCase()) ? `${cleaned}-file` : cleaned;
}

/**
 * Builds the name that actually gets downloaded. An empty or unusable custom
 * name falls back to the tool's suggestion, then to `document`.
 */
export function resolveOutputName(
  value: string,
  fallbackFileName: string,
  extension: string,
): string {
  const base =
    sanitizeNameBase(value) ||
    sanitizeNameBase(fileBaseName(fallbackFileName)) ||
    'document';
  return `${base}.${extension}`;
}
