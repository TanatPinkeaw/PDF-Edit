import { describe, expect, it } from 'vitest';

import { collectDroppedFiles, type DroppedEntry } from '../src/lib/dropped-files';

function makeFile(name: string, size = 3): File {
  return new File([new Uint8Array(size)], name, {
    type: 'application/pdf',
    lastModified: 1_700_000_000_000,
  });
}

function fileEntry(name: string, file = makeFile(name)): DroppedEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (onFile) => onFile(file),
  };
}

function dirEntry(
  name: string,
  children: DroppedEntry[] | (() => DroppedEntry[][]),
): DroppedEntry {
  const batches = typeof children === 'function' ? children() : [children];
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let index = 0;
      return {
        readEntries: (onEntries) => {
          const batch = batches[index] ?? [];
          index += 1;
          onEntries(batch);
        },
      };
    },
  };
}

describe('collectDroppedFiles', () => {
  it('collects files from nested folders in name order', async () => {
    const files = await collectDroppedFiles([
      dirEntry('folder', [
        fileEntry('b.pdf'),
        dirEntry('inner', [fileEntry('c.pdf')]),
        fileEntry('a.pdf'),
      ]),
    ]);

    expect(files.map((file) => file.name)).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
  });

  it('reads directory entries in pages until the browser returns none', async () => {
    const files = await collectDroppedFiles([
      dirEntry('folder', () => [
        [fileEntry('a.pdf'), fileEntry('b.pdf')],
        [fileEntry('c.pdf')],
        [],
      ]),
    ]);

    expect(files.map((file) => file.name)).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
  });

  it('skips hidden files, __MACOSX and empty folders', async () => {
    const files = await collectDroppedFiles([
      fileEntry('.DS_Store'),
      dirEntry('__MACOSX', [fileEntry('ghost.pdf')]),
      dirEntry('empty', []),
      fileEntry('ok.pdf'),
    ]);

    expect(files.map((file) => file.name)).toEqual(['ok.pdf']);
  });

  it('dedupes the same file delivered twice', async () => {
    const file = makeFile('same.pdf');
    const files = await collectDroppedFiles([
      fileEntry('copy-a.pdf', file),
      fileEntry('copy-b.pdf', file),
    ]);

    expect(files).toHaveLength(1);
  });

  it('caps the number of files in one drop', async () => {
    const files = await collectDroppedFiles(
      [dirEntry('big', Array.from({ length: 8 }, (_, index) => fileEntry(`f${index}.pdf`)))],
      { maxFiles: 3 },
    );

    expect(files).toHaveLength(3);
  });

  it('stops descending beyond the depth limit', async () => {
    const nested = dirEntry('one', [dirEntry('two', [dirEntry('three', [fileEntry('deep.pdf')])])]);
    const files = await collectDroppedFiles([nested], { maxDepth: 1 });

    expect(files).toEqual([]);
  });

  it('ignores a file entry whose read fails', async () => {
    const broken: DroppedEntry = {
      isFile: true,
      isDirectory: false,
      name: 'broken.pdf',
      file: (_onFile, onError) => onError(new Error('gone')),
    };
    const files = await collectDroppedFiles([broken, fileEntry('ok.pdf')]);

    expect(files.map((file) => file.name)).toEqual(['ok.pdf']);
  });
});
