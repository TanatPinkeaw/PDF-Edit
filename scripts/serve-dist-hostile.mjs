/**
 * Serves `dist/` the way a misconfigured Nginx does: `.mjs` files are sent as
 * `text/plain`, which makes module workers fail to start in the browser.
 *
 * Used to prove that the production build keeps working on hosts we do not
 * control. Run after `pnpm build`:
 *
 *   node scripts/serve-dist-hostile.mjs [port]
 */

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', 'dist');
const PORT = Number(process.argv[2] ?? 5199);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  // The breakage we want to reproduce.
  '.mjs': 'text/plain; charset=utf-8',
};

createServer((request, reply) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
  let filePath = join(ROOT, normalize(decodeURIComponent(url.pathname)));

  try {
    if (!statSync(filePath).isFile()) throw new Error('not a file');
  } catch {
    filePath = join(ROOT, 'index.html');
  }

  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  reply.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(reply);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`serving dist (hostile mime) at http://127.0.0.1:${PORT}`);
});
