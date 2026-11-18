// Fetching a pack's files: the start screen starts the downloads, the loader takes the same promises. With
// progress, and robust to how a host serves `*.gz`: as they are (the client unpacks them) or with
// `Content-Encoding: gzip` (the browser already did). Kept free of app imports: the start screen uses it before the
// game's code has loaded, and the Node scripts load packs through src/scenario.ts.

/** a file's size as listed in the pack manifest (scripts/lib/packs.mjs): on disk, and unpacked for `*.gz` */
export interface PackFileSize { bytes: number; raw?: number }

type Progress = (url: string, done: number) => void;
const files = new Map<string, Promise<ArrayBuffer>>();
const aborts = new Map<string, AbortController>();
const listeners = new Set<Progress>();

/** be told how far each download is (in the file's own bytes on disk); returns the unsubscribe */
export function onPackProgress(fn: Progress): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** A missing file on a host that answers every path with the page itself (an SPA fallback) is not a file. */
function isPage(r: Response) { return (r.headers.get('content-type') ?? '').includes('text/html'); }

async function read(url: string, size: PackFileSize | undefined, signal: AbortSignal): Promise<ArrayBuffer> {
  const r = await fetch(url, { signal });
  if (!r.ok || isPage(r)) throw Object.assign(new Error(r.ok ? `${url}: not found` : `${url}: HTTP ${r.status}`), { missing: r.status === 404 || r.ok });
  const report = (done: number) => { for (const fn of listeners) fn(url, done); };
  let bytes: ArrayBuffer;
  if (!r.body || !size) bytes = await r.arrayBuffer();
  else {
    // The host may have unpacked a *.gz on the way (Content-Encoding): then the stream is the unpacked size.
    const unpacked = !!r.headers.get('content-encoding') && url.endsWith('.gz') && size.raw ? size.raw : size.bytes;
    const reader = r.body.getReader(), chunks: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.byteLength;
      report(Math.min(size.bytes, Math.round(got * size.bytes / unpacked)));
    }
    const all = new Uint8Array(got);
    let at = 0;
    for (const c of chunks) { all.set(c, at); at += c.byteLength; }
    bytes = all.buffer;
  }
  if (size) report(size.bytes);
  return bytes;
}

function start(url: string, size?: PackFileSize): Promise<ArrayBuffer> {
  let p = files.get(url);
  if (!p) {
    const abort = new AbortController();
    const q = read(url, size, abort.signal).then((buf) => url.endsWith('.gz') ? gunzipped(buf) : buf);
    files.set(url, p = q); aborts.set(url, abort);
    q.catch(() => { if (files.get(url) === q) files.delete(url); }).finally(() => { if (aborts.get(url) === abort) aborts.delete(url); });
  }
  return p;
}

/** Start downloading `url` now (the start screen, as soon as a mission is picked); `packFile` takes it. */
export function prefetchPackFile(url: string, size?: PackFileSize): void { void start(url, size).catch(() => { /* the taker sees it */ }); }

/** stop and forget the prefetched downloads of other URLs (a pack fetched ahead on the start screen, not picked) */
export function keepPrefetched(urls: ReadonlySet<string>): void {
  for (const url of [...files.keys()]) if (!urls.has(url)) { files.delete(url); aborts.get(url)?.abort(); aborts.delete(url); }
}

/** The file at `url` as bytes: the prefetched download if there is one (handed over once, so its bytes are not
 * kept), else a new one. `*.gz` files come back unpacked whether the host sent them packed or not. */
export function packFile(url: string, size?: PackFileSize): Promise<ArrayBuffer> {
  const p = start(url, size);
  files.delete(url); aborts.delete(url);
  return p;
}

/** the file is not there (404, or a host's page in its place) */
export const isMissing = (error: unknown) => !!(error as { missing?: boolean } | null)?.missing;

/** `buf` unpacked if it is a gzip stream (magic 1f 8b), else as it came */
export async function gunzipped(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(ds).arrayBuffer();
}
