/**
 * Generates public/samples/sample-12p.pdf — a recognisable 12-page document used
 * to try the app without opening the OS file picker.
 *
 * Run with: pnpm sample
 */
import { mkdir, writeFile } from 'node:fs/promises';

import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

const PAGE_COUNT = 12;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const bands = [
  [0.12, 0.14, 0.18],
  [0.72, 0.26, 0.12],
  [0.16, 0.34, 0.28],
  [0.28, 0.24, 0.45],
  [0.55, 0.42, 0.12],
  [0.1, 0.32, 0.44],
];

const doc = await PDFDocument.create();
doc.setTitle('PDF Page Studio — sample document');
doc.setAuthor('PDF Page Studio');

const regular = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

for (let index = 0; index < PAGE_COUNT; index += 1) {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const [red, green, blue] = bands[index % bands.length];

  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 210,
    width: PAGE_WIDTH,
    height: 210,
    color: rgb(red, green, blue),
  });

  page.drawText('PDF PAGE STUDIO', {
    x: 48,
    y: PAGE_HEIGHT - 92,
    size: 26,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText(`Sample page ${index + 1} of ${PAGE_COUNT}`, {
    x: 48,
    y: PAGE_HEIGHT - 124,
    size: 13,
    font: regular,
    color: rgb(0.92, 0.9, 0.86),
  });

  const lines = [
    'This document exists so you can try deleting, reordering',
    'and splitting pages without touching a real file.',
    '',
    'Every page has a different colour band and a large page',
    'number, which makes it obvious when the order changed.',
  ];

  lines.forEach((line, lineIndex) => {
    if (!line) return;
    page.drawText(line, {
      x: 48,
      y: PAGE_HEIGHT - 286 - lineIndex * 20,
      size: 12,
      font: regular,
      color: rgb(0.17, 0.16, 0.14),
    });
  });

  page.drawText(String(index + 1), {
    x: PAGE_WIDTH - 96,
    y: 56,
    size: 46,
    font: bold,
    color: rgb(red, green, blue),
  });

  page.drawLine({
    start: { x: 48, y: 120 },
    end: { x: PAGE_WIDTH - 48, y: 120 },
    thickness: 0.7,
    color: rgb(0.8, 0.77, 0.71),
  });

  page.drawText('pages can be deleted, moved or split — content stays untouched', {
    x: 48,
    y: 100,
    size: 9.5,
    font: regular,
    color: rgb(0.45, 0.43, 0.4),
  });
}

await mkdir(new URL('../public/samples/', import.meta.url), { recursive: true });
const bytes = await doc.save();
await writeFile(new URL('../public/samples/sample-12p.pdf', import.meta.url), bytes);

console.log(`wrote public/samples/sample-12p.pdf (${PAGE_COUNT} pages, ${bytes.byteLength} bytes)`);
