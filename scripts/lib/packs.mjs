// The scenario packs as the client sees them: one manifest entry per ready pack in public/scenarios/<id>/, with
// its files' sizes (and the unpacked size of each *.gz, from its gzip trailer), the files the game loads before
// its first frame, the mission ends and, in a production build, a content hash that goes into the pack's URL
// (scenarios/<id>.<hash>/: long-cached as immutable, a changed pack gets a new URL). Used by the Vite plugin
// (vite.config.ts: the `virtual:trapla-packs` module, the copy into dist/) and by scripts/release.sh's checks.
import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SAFE = /^[a-zA-Z0-9_.-]+$/;

/** the uncompressed size a gzip member declares (ISIZE, mod 2^32: the packs' files are far below 4 GB) */
function gzipRawSize(path, size) {
  if (size < 18) return null;
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(2), tail = Buffer.alloc(4);
    readSync(fd, head, 0, 2, 0);
    if (head[0] !== 0x1f || head[1] !== 0x8b) return null;
    readSync(fd, tail, 0, 4, size - 4);
    return tail.readUInt32LE(0);
  } finally { closeSync(fd); }
}

/** the files the game fetches before its first frame (src/scenario.ts loadPack); the transport graph and the
 *  traffic census come later, on first need */
export function startupFiles(meta, files) {
  const wanted = ['meta.json', meta.heights?.file, meta.landcover?.file, 'overlays.json', meta.vector?.file, meta.ground?.file,
    meta.watercourses?.file, 'protected.json', 'structures.json', meta.transport ? null : 'transport-meta.json'];
  return wanted.filter((f) => f && files[f]);
}

/** Layers a build may leave out until their reuse is cleared (docs/deploy.md "Licences"): `ground` (ČGS ground
 *  classes; the game then prices cuts with the norm's mix) and `traffic` (ŘSD census; rebuilt roads then start with
 *  their class's average traffic). */
export const OPTIONAL_LAYERS = { ground: (meta) => meta.ground?.file, traffic: () => 'traffic.json' };

/** One pack, or null when it is not ready (a build in progress, not built, or a file it declares is missing).
 *  `hash`: read every file. `without`: layers of OPTIONAL_LAYERS to leave out (meta.json is rewritten without them;
 *  its new bytes are in `_files`, kept out of the manifest). */
export function describePack(root, id, { hash = false, without = [] } = {}) {
  const dir = join(root, id);
  if (!SAFE.test(id) || !existsSync(join(dir, 'meta.json'))) return null;
  let meta;
  try { meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')); } catch { return null; }
  if (meta.id !== id) return null;
  // New builders invalidate ready.json before touching any output and publish it last; D11 predates it.
  if (id !== 'd11') {
    try { const ready = JSON.parse(readFileSync(join(dir, 'ready.json'), 'utf8')); if (ready.id !== id || ready.ready !== true) return null; }
    catch { return null; }
  }
  const dropped = new Set(without.map((layer) => OPTIONAL_LAYERS[layer]?.(meta)).filter(Boolean));
  const own = {};
  if (without.includes('ground') && meta.ground) {
    meta = { ...meta, attribution: (meta.attribution ?? []).filter((a) => !/ČGS/.test(a)) };
    delete meta.ground;
    own['meta.json'] = Buffer.from(JSON.stringify(meta));
  }
  // every file the game will ask for must be there: a pack missing one is not offered
  let transportFile = meta.transport?.file;
  if (!transportFile && existsSync(join(dir, 'transport-meta.json'))) {
    try { transportFile = JSON.parse(readFileSync(join(dir, 'transport-meta.json'), 'utf8')).file; } catch { return null; }
  }
  const declared = [meta.heights?.file, meta.landcover?.file, 'overlays.json', meta.ground?.file, meta.watercourses?.file, meta.vector?.file, transportFile];
  if (!meta.heights?.file || !meta.landcover?.file) return null;
  if (declared.some((f) => f && (!SAFE.test(f) || !existsSync(join(dir, f))))) return null;
  const files = {};
  const digest = hash ? createHash('sha256') : null;
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name), st = statSync(path);
    // manifest.json is the pipeline's build record (inputs, hashes); the game never reads it
    if (!st.isFile() || !SAFE.test(name) || dropped.has(name) || name === 'manifest.json') continue;
    const bytes = own[name] ?? null;
    const entry = { bytes: bytes ? bytes.length : st.size };
    if (name.endsWith('.gz')) { const raw = gzipRawSize(path, st.size); if (raw !== null) entry.raw = raw; }
    files[name] = entry;
    if (digest) { digest.update(name); digest.update('\0'); digest.update(bytes ?? readFileSync(path)); digest.update('\0'); }
  }
  const version = digest ? digest.digest('hex').slice(0, 12) : null;
  const startup = startupFiles(meta, files);
  return {
    id, name: meta.name ?? id, dir: version ? `scenarios/${id}.${version}` : `scenarios/${id}`, version,
    files, startup, startupBytes: startup.reduce((n, f) => n + files[f].bytes, 0),
    totalBytes: Object.values(files).reduce((n, f) => n + f.bytes, 0),
    a: meta.A?.xy ?? null, b: meta.B?.xy ?? null, officialM: meta.official?.lengthM ?? null,
    ...(without.length ? { without } : {}),
    _files: own,
  };
}

/** the manifest as the client gets it (no rewritten file bytes) */
export const manifestJson = (packs) => JSON.stringify(packs, (key, value) => key === '_files' ? undefined : value);

/** every ready pack under `root` (public/scenarios), by id */
export function describePacks(root, options = {}) {
  const out = {};
  if (!existsSync(root)) return out;
  for (const id of readdirSync(root).sort()) {
    const pack = describePack(root, id, options);
    if (pack) out[id] = pack;
  }
  return out;
}

/** copy each described pack into `outDir`/<its dir> */
export function copyPacks(root, outDir, packs) {
  for (const pack of Object.values(packs)) {
    const target = join(outDir, pack.dir);
    mkdirSync(target, { recursive: true });
    for (const name of Object.keys(pack.files)) {
      if (pack._files?.[name]) writeFileSync(join(target, name), pack._files[name]);
      else copyFileSync(join(root, pack.id, name), join(target, name));
    }
  }
}
