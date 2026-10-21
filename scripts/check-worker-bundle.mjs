/**
 * Guards the regression behind "แสดงตัวอย่างไม่ได้" on self-hosted deploys.
 *
 * A plain Nginx serves `.mjs` as `text/plain`, so a module worker written as
 * `.mjs` never starts. The build must emit the pdf.js worker as `.js`.
 *
 *   node scripts/check-worker-bundle.mjs
 */

import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '..', 'dist');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error(`ไม่พบ ${DIST} — รัน "pnpm build" ก่อน`);
  process.exit(1);
}

const workers = files.filter((file) => /pdf\.worker.*\.(mjs|js)$/.test(file));
const mjs = workers.filter((file) => file.endsWith('.mjs'));
const js = workers.filter((file) => file.endsWith('.js'));

if (mjs.length > 0) {
  console.error(
    `✗ พบ worker เป็น .mjs: ${mjs.map((file) => file.replace(DIST, 'dist')).join(', ')}\n` +
      '  ต้องบันเดิลผ่าน Vite worker pipeline (?worker) เพื่อให้ออกมาเป็น .js',
  );
  process.exit(1);
}

if (js.length === 0) {
  console.error('✗ ไม่พบ pdf.js worker ใน dist — ตรวจ src/lib/pdfjs.ts');
  process.exit(1);
}

console.log(`✓ pdf.js worker เป็น .js: ${js.map((file) => file.replace(DIST, 'dist')).join(', ')}`);
