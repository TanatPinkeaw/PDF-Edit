/**
 * Turns a browser drop into a flat list of files, including PDFs inside dragged
 * folders. The entry shape is kept minimal so the traversal can be tested in
 * Node without a DOM.
 */

export type DroppedEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (onFile: (file: File) => void, onError: (error: unknown) => void) => void;
  createReader?: () => {
    readEntries: (
      onEntries: (entries: DroppedEntry[]) => void,
      onError: (error: unknown) => void,
    ) => void;
  };
};

export type CollectOptions = {
  /** Keeps a folder drop from freezing the tab. */
  maxFiles?: number;
  maxDepth?: number;
};

const DEFAULT_MAX_FILES = 100;
const DEFAULT_MAX_DEPTH = 8;

export function isPdfFile(file: File): boolean {
  return /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
}

/** One message for both an unreadable drop and a drop with no usable file. */
export function dropRejectedMessage(files: readonly File[], supported: string): string {
  return files.length === 0
    ? 'อ่านไฟล์จากสิ่งที่วางไม่ได้ — ลองลากไฟล์แทนโฟลเดอร์'
    : `รองรับเฉพาะ ${supported}`;
}

/** Editor and archive noise that is never a document. */
function isHidden(name: string): boolean {
  return name.startsWith('.') || name === '__MACOSX';
}

function compareNames(a: DroppedEntry, b: DroppedEntry): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

function readFile(entry: DroppedEntry): Promise<File | null> {
  if (!entry.file) return Promise.resolve(null);
  return new Promise((resolve) => {
    entry.file?.(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

function readAll(reader: NonNullable<ReturnType<NonNullable<DroppedEntry['createReader']>>>): Promise<
  DroppedEntry[]
> {
  return new Promise((resolve) => {
    const entries: DroppedEntry[] = [];

    const readNext = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readNext();
        },
        () => resolve(entries),
      );
    };

    readNext();
  });
}

/**
 * Depth-first collection in a predictable order. Files from different folders
 * keep their folder order; names are sorted so a drop of a folder looks the
 * same as picking the files by hand.
 */
export async function collectDroppedFiles(
  entries: readonly DroppedEntry[],
  options: CollectOptions = {},
): Promise<File[]> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const files: File[] = [];
  const seen = new Set<string>();

  const add = (file: File) => {
    if (files.length >= maxFiles || isHidden(file.name)) return;
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };

  const walk = async (level: readonly DroppedEntry[], depth: number): Promise<void> => {
    for (const entry of [...level].sort(compareNames)) {
      if (files.length >= maxFiles) return;
      if (isHidden(entry.name)) continue;

      if (entry.isFile) {
        const file = await readFile(entry);
        if (file) add(file);
        continue;
      }

      if (entry.isDirectory && depth < maxDepth && entry.createReader) {
        const reader = entry.createReader();
        await walk(await readAll(reader), depth + 1);
      }
    }
  };

  await walk(entries, 0);
  return files;
}

/**
 * Reads a drop. Entries must be captured before the first await, because the
 * DataTransfer is cleared as soon as the drop handler returns.
 */
export async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const entries: DroppedEntry[] = [];

  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry as unknown as DroppedEntry);
  }

  if (entries.length > 0) return collectDroppedFiles(entries);
  return Array.from(dataTransfer.files ?? []);
}
