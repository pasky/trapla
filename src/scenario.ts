// Browser-side loading of a scenario pack (see README.md for the format).

import type { GroundMeta } from './core/ground';
import type { BuildingInfo } from './core/buildings';
import type { RoadNetData } from './core/roadnet';
import type { TransportGraphData, TransportMeta } from './core/project-transport';
import type { EndpointJunction } from './core/evaluate';
import type { EndpointJunctionKind } from './core/data/urban';
import { decodeHeights, Terrain } from './core/terrain';
import { parseVectorPack, type VectorPack } from './render/vectorPack';
import { validTrafficCensus, type TrafficCensus } from './core/traffic-census';

/** `junction`: scenario-declared connection to retained roads (legacy net way indices). */
export interface PackEndpoint { xy: [number, number]; latlon: [number, number]; note: string;
  junction?: { kind: EndpointJunctionKind; osmWayIds: number[]; ways: number[] } }

/** Evaluator form of the declared end connections; empty for packs without them (D11). */
export function endpointJunctions(meta: Pick<PackMeta, 'A' | 'B'>): EndpointJunction[] {
  return [meta.A, meta.B].flatMap(e => e.junction ? [{ x: e.xy[0], y: e.xy[1], kind: e.junction.kind, ways: e.junction.ways }] : []);
}

export interface PackMeta {
  id: string;
  name: string;
  origin: [number, number];
  cell: number;
  nx: number;
  ny: number;
  heights: { file: string; base: number; scale: number };
  landcover: { file: string };
  ground?: GroundMeta;
  watercourses?: { file: string; version: number; method: string; sha256: string };
  transport?: TransportMeta;
  /** Historical-baseline limitations; removing mapped pavement never restores old terrain/photo. */
  baselineNote?: string;
  sources?: string[];
  /** vector render data (land cover, roads, buildings); absent in packs built without OSM */
  vector?: { file: string } | null;
  /** ArcGIS MapServer "export" endpoint serving an orthophoto in the scenario's CRS (optional view layer) */
  orthophoto?: { export: string; sr: number; attribution: string } | null;
  A: PackEndpoint;
  B: PackEndpoint;
  official: { xy: [number, number][]; kinds: number[]; lengthM: number;
    /** Published project scope may include work beyond the mapped new-road reference. */
    publishedProjectLengthM?: number };
  attribution: string[];
}

export interface Overlays {
  buildings: [number, number, number][];
  /** per building (parallel to `buildings`): area, levels, kind, oriented bbox — see core/buildings.ts */
  binfo?: (BuildingInfo | null)[];
  /** existing road network for crossings — see core/roadnet.ts */
  net?: RoadNetData;
  places: { name: string; kind: string; x: number; y: number }[];
  roads: { ref: string; cls: string; xy: [number, number][] }[];
}

export interface Pack {
  base: string;
  meta: PackMeta;
  terrain: Terrain;
  q: Uint16Array;
  lc: Uint8Array;
  overlays: Overlays;
  vectors: VectorPack | null;
  /** Independent identity; legacy D11 meta/object fingerprints deliberately exclude this graph. */
  transportMeta?: TransportMeta | null;
  /** The additive transport graph is not part of startup: `prefetchTransport` downloads and verifies
   * its bytes (call when idle after the first frame); `loadTransport` parses it on first need. Both are
   * memoised; a missing graph resolves to null, a corrupt or mismatched one rejects. */
  prefetchTransport: () => Promise<ArrayBuffer | null>;
  loadTransport: () => Promise<TransportGraphData | null>;
  /** The pack's traffic census (`traffic.json`, pipeline/build_traffic.py), fetched with the transport
   * graph on first need. Null: the pack ships none, or it is unreadable; rebuilt roads then start with
   * the average traffic of their class. Never rejects. */
  loadTraffic: () => Promise<TrafficCensus | null>;
}

/** fetch a gzip file; some servers (e.g. Vite dev) already send it with Content-Encoding: gzip */
async function gunzip(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(ds).arrayBuffer();
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

async function transportSidecar(base: string): Promise<TransportMeta | null> {
  const r = await fetch(`${base}/transport-meta.json`);
  // Vite returns its HTML shell for an absent optional sidecar. Existing packs still load.
  if (r.status === 404 || r.headers.get('content-type')?.includes('text/html')) return null;
  if (!r.ok) throw new Error(`Transport metadata: HTTP ${r.status}`);
  return await r.json() as TransportMeta;
}

export async function loadPack(base: string, progress?: (msg: string) => void): Promise<Pack> {
  progress?.('loading scenario…');
  const metaResponse = await fetch(`${base}/meta.json`);
  if (!metaResponse.ok) throw new Error(`Scenario map: HTTP ${metaResponse.status}`);
  const meta: PackMeta = await metaResponse.json();
  const transportMeta = meta.transport ?? await transportSidecar(base);
  if (transportMeta && (transportMeta.version !== 1 || !/^[a-zA-Z0-9_.-]+$/.test(transportMeta.file)))
    throw new Error('Unsupported transport map');
  progress?.('loading terrain (DMR 5G, 5 m)…');
  const [hb, lb, overlays, vectorData, gb, wb] = await Promise.all([
    gunzip(`${base}/${meta.heights.file}`),
    gunzip(`${base}/${meta.landcover.file}`),
    fetch(`${base}/overlays.json`).then((r) => r.json() as Promise<Overlays>),
    // render-only: without it the view falls back to plain shaded relief
    meta.vector?.file
      ? gunzip(`${base}/${meta.vector.file}`).catch((e) => { console.warn('vector render data unavailable', e); return null; })
      : Promise.resolve(null),
    meta.ground ? gunzip(`${base}/${meta.ground.file}`) : Promise.resolve(null),
    meta.watercourses ? gunzip(`${base}/${meta.watercourses.file}`) : Promise.resolve(null),
  ]);
  const vectors = vectorData ? parseVectorPack(vectorData) : null;
  let bytes: Promise<ArrayBuffer | null> | null = null, graph: Promise<TransportGraphData | null> | null = null;
  // A failed attempt is forgotten, so a later need retries; the parsed graph drops the raw bytes.
  const prefetchTransport = () => bytes ??= (async () => {
    if (!transportMeta) return null;
    const tb = await gunzip(`${base}/${transportMeta.file}`);
    if (await sha256(tb) !== transportMeta.fingerprint) throw new Error('Transport map changed during loading. Reload the page.');
    return tb;
  })().catch((error) => { bytes = null; throw error; });
  const loadTransport = () => graph ??= prefetchTransport().then(async (tb) => {
    if (!tb) return null;
    const transport = JSON.parse(new TextDecoder().decode(tb)) as TransportGraphData;
    if (transport.version !== 1 || !vectorData || await sha256(vectorData) !== transport.vectorData)
      throw new Error('Transport map and visible roads differ. Rebuild the map.');
    bytes = Promise.resolve(null);
    return transport;
  }).catch((error) => { graph = null; throw error; });
  let traffic: Promise<TrafficCensus | null> | null = null;
  const loadTraffic = () => traffic ??= (async () => {
    const r = await fetch(`${base}/traffic.json`);
    // Vite returns its HTML shell for an absent optional sidecar.
    if (!r.ok || r.headers.get('content-type')?.includes('text/html')) return null;
    const census: unknown = await r.json();
    if (!validTrafficCensus(census)) throw new Error('Unsupported traffic census');
    return census;
  })().catch((error) => { console.warn('Traffic census unavailable', error); return null; });
  const q = decodeHeights(new Int16Array(hb), meta.nx, meta.ny);
  const lc = new Uint8Array(lb);
  const terrain = new Terrain({ nx: meta.nx, ny: meta.ny, cell: meta.cell, base: meta.heights.base, scale: meta.heights.scale, q, lc,
    ground: meta.ground && gb ? { ...meta.ground, ids: new Uint8Array(gb) } : undefined,
    watercourses: wb ? JSON.parse(new TextDecoder().decode(wb)) : undefined });
  return { base, meta, terrain, q, lc, overlays, vectors, transportMeta, prefetchTransport, loadTransport, loadTraffic };
}
