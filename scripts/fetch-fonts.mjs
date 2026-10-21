/**
 * Self-hosts the web fonts so the app keeps working on a HomeLab without
 * internet access. Re-run this script only when changing the font list; the
 * generated CSS is committed so the app never calls fonts.googleapis.com.
 *
 *   node scripts/fetch-fonts.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Keep every weight the stylesheets actually ask for (400 / 500 / 600 / 700 —
// plus the odd 650, which browsers round to the nearest face). A missing face
// makes the browser fake-bold the glyphs, which looks smudged on Thai text.
const FAMILIES = [
  'Noto+Sans+Thai:wght@400;500;600;700',
  'Krub:wght@400;500;600;700',
  'Cascadia+Code:wght@400',
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const OUT_DIR = resolve(import.meta.dirname, '..', 'public', 'fonts', 'google');
const CSS_PATH = resolve(import.meta.dirname, '..', 'src', 'styles-fonts.css');

const css = await fetch(
  `https://fonts.googleapis.com/css2?${FAMILIES.map((family) => `family=${family}`).join('&')}&display=swap`,
  { headers: { 'user-agent': UA } },
).then((response) => {
  if (!response.ok) throw new Error(`Google Fonts ตอบ ${response.status}`);
  return response.text();
});

const blocks = css.match(/@font-face\s*{[^}]+}/g) ?? [];
if (blocks.length === 0) throw new Error('ไม่พบ @font-face ใน CSS ที่ได้');

await mkdir(OUT_DIR, { recursive: true });

const out = [
  '/* สร้างด้วย scripts/fetch-fonts.mjs — อย่าแก้ด้วยมือ (ฟอนต์ self-host, ไม่เรียก CDN) */',
];

let downloaded = 0;
for (const block of blocks) {
  const family = /font-family:\s*'([^']+)'/.exec(block)?.[1];
  const weight = /font-weight:\s*([^;]+);/.exec(block)?.[1]?.trim();
  const url = /url\((https:[^)]+)\)/.exec(block)?.[1];
  const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1]?.trim();
  const style = /font-style:\s*([^;]+);/.exec(block)?.[1]?.trim() ?? 'normal';
  if (!family || !url || !weight) continue;

  const name = `${family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${weight.replace(/\s+/g, '')}-${createHash('sha1')
    .update(url)
    .digest('hex')
    .slice(0, 8)}.woff2`;
  const bytes = Buffer.from(await fetch(url, { headers: { 'user-agent': UA } }).then((r) => r.arrayBuffer()));
  await writeFile(resolve(OUT_DIR, name), bytes);
  downloaded += 1;

  out.push(`@font-face {
  font-family: '${family}';
  font-style: ${style};
  font-weight: ${weight};
  font-display: swap;
  src: url('/fonts/google/${name}') format('woff2');${range ? `\n  unicode-range: ${range};` : ''}
}`);
}

await writeFile(CSS_PATH, `${out.join('\n\n')}\n`);
console.log(`ดาวน์โหลด ${downloaded} ไฟล์ → public/fonts/google/ และเขียน ${CSS_PATH}`);
