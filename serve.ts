// serve.ts — a tiny static server for playing Neon Shores locally.
// Serves only the game/ directory beside this file, on port 8080, and
// refuses any path that climbs out of it.
//
//   node serve.ts   ->   http://localhost:8080

import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'game');
const PORT = 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = normalize(join(root, pathname));
  if (filePath !== root && !filePath.startsWith(root + '/')) {
    res.writeHead(404).end('not found');
    return;
  }
  let body;
  try {
    if (!statSync(filePath).isFile()) throw new Error('not a file');
    body = readFileSync(filePath);
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream' });
  res.end(body);
});

server.listen(PORT, () => {
  console.log(`Neon Shores at http://localhost:${PORT} — Ctrl-C to stop`);
});
