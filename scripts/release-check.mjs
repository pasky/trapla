// Checks a built site (dist/) before it is published: nothing points at the dev server or an absolute path, every
// page's assets are there, every ready pack is in under its content hash with all its files, nothing is over a
// host's per-file limit, and the whole fits GitHub Pages' 1 GB. Exit 1 on a problem. (scripts/release.sh)
//
//   node scripts/release-check.mjs [dist]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describePacks } from './lib/packs.mjs';

const dist = process.argv[2] ?? 'dist';
const CF_FILE_LIMIT = 25 * 1024 * 1024; // Cloudflare Pages: 25 MiB per file
const GH_SITE_LIMIT = 1e9; // GitHub Pages: a published site ≤ 1 GB
let failed = 0;
const ok = (cond, what) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${what}`); if (!cond) failed++; };

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
ok(existsSync(join(dist, 'index.html')), `${dist}/index.html exists`);
const all = existsSync(dist) ? walk(dist) : [];
const rel = (f) => f.slice(dist.length + 1);

for (const page of ['index.html', 'about.html', '404.html', '_headers']) ok(existsSync(join(dist, page)), `${page} is in the site`);
for (const page of ['index.html', 'about.html']) {
  if (!existsSync(join(dist, page))) continue;
  const html = readFileSync(join(dist, page), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(data:|https?:|#|mailto:)/.test(u));
  ok(refs.every((u) => !u.startsWith('/')), `${page}: no absolute paths (${refs.filter((u) => u.startsWith('/')).join(', ') || 'relative only'})`);
  const missing = refs.filter((u) => u !== './' && !existsSync(join(dist, u.replace(/^\.\//, '').split(/[?#]/)[0])));
  ok(missing.length === 0, `${page}: every asset it links is there${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
}
const code = all.filter((f) => /\.(js|css|html)$/.test(f));
const dev = code.filter((f) => /\/@fs\/|\/@vite\/|\/@id\/|localhost:5173|\/src\/main\.ts|import\.meta\.hot/.test(readFileSync(f, 'utf8')));
ok(dev.length === 0, `nothing points at the dev server${dev.length ? ` (${dev.map(rel).join(', ')})` : ''}`);

const packs = describePacks('public/scenarios', { hash: true });
ok(Object.keys(packs).length > 0, `${Object.keys(packs).length} ready packs in public/scenarios`);
for (const pack of Object.values(packs)) {
  const dir = join(dist, pack.dir);
  const bad = Object.entries(pack.files).filter(([name, size]) => !existsSync(join(dir, name)) || statSync(join(dir, name)).size !== size.bytes);
  ok(existsSync(dir) && bad.length === 0, `${pack.id}: in ${pack.dir} with its ${Object.keys(pack.files).length} files (${(pack.totalBytes / 1e6).toFixed(1)} MB, ${(pack.startupBytes / 1e6).toFixed(1)} MB before the first frame)`);
}
const stale = existsSync(join(dist, 'scenarios')) ? readdirSync(join(dist, 'scenarios')).filter((d) => !Object.values(packs).some((p) => p.dir === `scenarios/${d}`)) : [];
ok(stale.length === 0, `no pack in dist/scenarios that the build does not list${stale.length ? ` (${stale.join(', ')})` : ''}`);

const sizes = all.map((f) => [rel(f), statSync(f).size]);
const big = sizes.filter(([, b]) => b > CF_FILE_LIMIT);
ok(big.length === 0, `every file ≤ 25 MiB (Cloudflare Pages; largest ${sizes.sort((a, b) => b[1] - a[1])[0]?.map((x, i) => i ? `${(x / 1e6).toFixed(1)} MB` : x).join(' ')})`);
const total = sizes.reduce((n, [, b]) => n + b, 0);
ok(total < GH_SITE_LIMIT, `the site is ${(total / 1e6).toFixed(0)} MB in ${sizes.length} files (GitHub Pages: ≤ 1 GB; Cloudflare Pages: ≤ 20,000 files)`);
ok(sizes.length <= 20000, 'at most 20,000 files');
process.exit(failed ? 1 : 0);
