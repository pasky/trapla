// A plain static file server for the built site (dist/), the way a production host serves it: no Vite, the site
// under a sub-path (default /trapla/, to prove the build works under any base path), the cache headers of
// deploy/_headers, JSON / JS / CSS / HTML compressed on the fly, *.gz files sent as they are, no fallback to
// index.html for a missing file (a 404).
//
//   node scripts/static-serve.mjs [--dir dist] [--port 4173] [--base /trapla/] [--gz-encoded]
//
// --gz-encoded: send *.gz files with `Content-Encoding: gzip` (the browser unpacks them), like some hosts do;
// the game must load either way.
// As a module: `const s = await serveStatic({ dir, port, base })` → { url, close() }.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createGzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.gz': 'application/gzip',
};
const COMPRESS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);

/** the cache policy of deploy/_headers: content-hashed URLs for a year, everything else revalidated */
export function cacheControl(rel) {
  if (/^assets\//.test(rel) || /^scenarios\/[^/]+\.[0-9a-f]{12}\//.test(rel)) return 'public, max-age=31536000, immutable';
  return 'no-cache';
}

export function serveStatic({ dir = 'dist', port = 4173, base = '/trapla/', gzEncoded = false, host = '127.0.0.1' } = {}) {
  const root = resolve(dir);
  if (!base.startsWith('/') || !base.endsWith('/')) throw new Error(`base must start and end with /: ${base}`);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let path = decodeURIComponent(url.pathname);
    if (path === base.slice(0, -1)) { res.writeHead(301, { Location: base + url.search }); res.end(); return; }
    if (!path.startsWith(base)) { res.writeHead(404); res.end('not found'); return; }
    let rel = normalize(path.slice(base.length)).replace(/^([/\\])+/, '');
    if (rel === '' || rel === '.') rel = 'index.html';
    const file = join(root, rel);
    if (!(file === root || file.startsWith(root + sep)) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return;
    }
    const ext = extname(file).toLowerCase(), size = statSync(file).size;
    const headers = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': cacheControl(rel.split(sep).join('/')),
      'X-Content-Type-Options': 'nosniff' };
    if (ext === '.gz' && gzEncoded) headers['Content-Encoding'] = 'gzip';
    const gzip = COMPRESS.has(ext) && size > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    if (gzip) { headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding'; } else headers['Content-Length'] = size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(file);
    (gzip ? stream.pipe(createGzip({ level: 6 })) : stream).pipe(res);
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => {
      const p = server.address().port;
      ok({ url: `http://${host}:${p}${base}`, port: p, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
  const s = await serveStatic({ dir: arg('--dir', 'dist'), port: Number(arg('--port', 4173)), base: arg('--base', '/trapla/'),
    gzEncoded: process.argv.includes('--gz-encoded') });
  console.log(`serving ${arg('--dir', 'dist')} at ${s.url}`);
}
