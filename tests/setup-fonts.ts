import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setFontBytes } from '../src/lib/pdf/fonts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(file: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(ROOT, 'public/fonts', file)));
}

// The browser fetches these from public/fonts; tests inject the same bytes.
setFontBytes('regular', read('Sarabun-Regular.ttf'));
setFontBytes('bold', read('Sarabun-Bold.ttf'));
