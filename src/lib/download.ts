/** Output naming, zip packing and the browser download trigger. */

import { zipSync } from 'fflate';

export type OutputFile = {
  name: string;
  bytes: Uint8Array;
};

export function baseName(fileName: string): string {
  const trimmed = fileName.replace(/\.pdf$/i, '').trim();
  return trimmed === '' ? 'document' : trimmed;
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function editedFileName(fileName: string): string {
  return `${baseName(fileName)}-edited.pdf`;
}

export function selectionFileName(fileName: string): string {
  return `${baseName(fileName)}-selection.pdf`;
}

export function rangeFileName(fileName: string, start: number, end: number): string {
  const suffix = start === end ? `p${start}` : `p${start}-${end}`;
  return `${baseName(fileName)}-${suffix}.pdf`;
}

export function splitZipFileName(fileName: string): string {
  return `${baseName(fileName)}-split.zip`;
}

export function imageFileName(
  fileName: string,
  pageNumber: number,
  extension: 'png' | 'jpg',
): string {
  return `${baseName(fileName)}-p${pageNumber}.${extension}`;
}

export function imagesZipFileName(fileName: string): string {
  return `${baseName(fileName)}-images.zip`;
}

export function rotatedFileName(fileName: string): string {
  return `${baseName(fileName)}-rotated.pdf`;
}

export function numberedFileName(fileName: string): string {
  return `${baseName(fileName)}-numbered.pdf`;
}

export function watermarkedFileName(fileName: string): string {
  return `${baseName(fileName)}-watermarked.pdf`;
}

export function protectedFileName(fileName: string): string {
  return `${baseName(fileName)}-protected.pdf`;
}

export function unlockedFileName(fileName: string): string {
  return `${baseName(fileName)}-unlocked.pdf`;
}

export function mergedFileName(fileName: string): string {
  return `${baseName(fileName)}-merged.pdf`;
}

/** Best-effort MIME type from an output file name. */
export function mimeForName(name: string): string {
  if (/\.zip$/i.test(name)) return 'application/zip';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  return 'application/pdf';
}

function uniqueNames(files: readonly OutputFile[]): OutputFile[] {
  const seen = new Map<string, number>();
  return files.map((file) => {
    const count = seen.get(file.name) ?? 0;
    seen.set(file.name, count + 1);
    if (count === 0) return file;
    return { ...file, name: file.name.replace(/\.pdf$/i, `-${count + 1}.pdf`) };
  });
}

/** Packs PDFs into a zip. Level 0 because PDFs are already compressed. */
export function zipFiles(files: readonly OutputFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const file of uniqueNames(files)) {
    entries[file.name] = file.bytes;
  }
  return zipSync(entries, { level: 0 });
}

export function toBlob(bytes: Uint8Array, type = 'application/pdf'): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type });
}

/** Triggers a download in the browser. Not used outside DOM tests. */
export function downloadBytes(name: string, bytes: Uint8Array, type?: string): void {
  const url = URL.createObjectURL(toBlob(bytes, type));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = sanitizeFileName(name);
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Give the browser a moment to start the download before releasing the URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
