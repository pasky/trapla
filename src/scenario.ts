// Browser-side loading of a scenario pack (see README.md for the format).

import type { GroundMeta } from './core/ground';
import type { BuildingInfo } from './core/buildings';
import { withStructures, type RoadNetData, type StructureData } from './core/roadnet';
import type { TransportGraphData, TransportMeta } from './core/project-transport';
import type { EndpointJunction } from './core/evaluate';
import type { EndpointJunctionKind } from './core/data/urban';
import { decodeHeights, Terrain } from './core/terrain';
import { parseVectorPack, type VectorPack } from './render/vectorPack';
import { validTrafficCensus, type TrafficCensus } from './core/traffic-census';
import { validProtectedData, type ProtectedData } from './core/data/protected';
import { objectDataKey } from './core/build-controls';
import { isMissing, packFile } from './pack-fetch';

/** `junction`: scenario-declared connection to retained roads (legacy net way indices). */
export interface PackEndpoint { xy: [number, number]; latlon: [number, number]; note: string;
  junction?: { kind: EndpointJunctionKind; osmWayIds: number[]; ways: number[] } }

/** What designs, saves, best scores and results are bound to: the pack's objects (buildings, road net), its
 * road links, what prices a design (ground, water) and the terrain itself. One derivation for the app, the
 * workers and the Node scripts. */
export function packIdentities(meta: Pick<PackMeta, 'id' | 'nx' | 'ny' | 'cell' | 'heights' | 'ground' | 'watercourses'>,
  overlays: Pick<Overlays, 'buildings' | 'binfo' | 'net'>, transport: Pick<TransportMeta, 'fingerprint'> | null | undefined) {
  const waterData = meta.watercourses?.sha256 ?? 'raster-water';
  return {
    objectData: objectDataKey(overlays.buildings, overlays.binfo, overlays.net),
    transportData: transport?.fingerprint ?? null,
    pricingData: [meta.ground?.fingerprint ?? (meta.ground ? JSON.stringify(meta.ground) : 'unmapped'), waterData].join(':'),
    waterData,
    terrainData: JSON.stringify([meta.id, meta.nx, meta.ny, meta.cell, meta.heights]),
  };
}

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
  /** The road network the game evaluates: `overlays.net` and the pack's mapped bridges and tunnels
   * (`structures.json`, pipeline/build_structures.py) as ways after it. `overlays.net` alone is the identity. */
  roadNet?: RoadNetData;
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

/** a pack file, unpacked if it is gzipped (src/pack-fetch.ts: the start screen may have started it already) */
const gunzip = (url: string) => packFile(url);
const json = async <T>(url: string): Promise<T> => JSON.parse(new TextDecoder().decode(await packFile(url))) as T;
/** an optional file of the pack: `ABSENT` when the pack has none (a file holding `null` is not "none") */
const ABSENT = Symbol('absent');
const optional = <T>(url: string): Promise<T | typeof ABSENT> => json<T>(url).catch((error) => { if (isMissing(error)) return ABSENT; throw error; });

async function sha256(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

async function transportSidecar(base: string): Promise<TransportMeta | null> {
  const meta = await optional<TransportMeta>(`${base}/transport-meta.json`);
  return meta === ABSENT ? null : meta;
}

/** The pack's mapped road bridges and tunnels (`structures.json`, pipeline/build_structures.py): null when it ships none. */
async function structuresSidecar(base: string): Promise<StructureData | null> {
  const data = await optional<StructureData>(`${base}/structures.json`);
  if (data === ABSENT) return null;
  if (data?.version !== 1 || !Array.isArray(data.ways) || !Array.isArray(data.kind) || data.kind.length !== data.ways.length) throw new Error('Unsupported mapped bridges file');
  return data;
}

/** The pack's nature protection areas (`protected.json`, pipeline/build_protected.py): null when it ships none. */
async function protectedSidecar(base: string): Promise<ProtectedData | null> {
  const data: unknown = await optional(`${base}/protected.json`);
  if (data === ABSENT) return null;
  if (!validProtectedData(data)) throw new Error('Unsupported protected areas file');
  return data;
}

export async function loadPack(base: string): Promise<Pack> {
  const meta = await json<PackMeta>(`${base}/meta.json`);
  const transportMeta = meta.transport ?? await transportSidecar(base);
  if (transportMeta && (transportMeta.version !== 1 || !/^[a-zA-Z0-9_.-]+$/.test(transportMeta.file)))
    throw new Error('Unsupported transport map');
  const [hb, lb, overlays, vectorData, gb, wb, protectedAreas, structures] = await Promise.all([
    gunzip(`${base}/${meta.heights.file}`),
    gunzip(`${base}/${meta.landcover.file}`),
    json<Overlays>(`${base}/overlays.json`),
    // render-only: without it the view falls back to plain shaded relief
    meta.vector?.file
      ? gunzip(`${base}/${meta.vector.file}`).catch((e) => { console.warn('vector render data unavailable', e); return null; })
      : Promise.resolve(null),
    meta.ground ? gunzip(`${base}/${meta.ground.file}`) : Promise.resolve(null),
    meta.watercourses ? gunzip(`${base}/${meta.watercourses.file}`) : Promise.resolve(null),
    protectedSidecar(base),
    structuresSidecar(base),
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
    const census: unknown = await optional(`${base}/traffic.json`);
    if (census === ABSENT) return null;
    if (!validTrafficCensus(census)) throw new Error('Unsupported traffic census');
    return census;
  })().catch((error) => { console.warn('Traffic census unavailable', error); return null; });
  const q = decodeHeights(new Int16Array(hb), meta.nx, meta.ny);
  const lc = new Uint8Array(lb);
  const terrain = new Terrain({ nx: meta.nx, ny: meta.ny, cell: meta.cell, base: meta.heights.base, scale: meta.heights.scale, q, lc,
    ground: meta.ground && gb ? { ...meta.ground, ids: new Uint8Array(gb) } : undefined,
    watercourses: wb ? JSON.parse(new TextDecoder().decode(wb)) : undefined, protectedAreas: protectedAreas ?? undefined });
  // (built from this pack's transport graph: one left from an older build is not used)
  const ownStructures = structures && structures.transport === transportMeta?.fingerprint ? structures : null;
  if (structures && !ownStructures) console.warn('Mapped bridges file is from another build of this map: run pipeline/build_structures.py');
  const roadNet = overlays.net ? withStructures(overlays.net, ownStructures) : undefined;
  return { base, meta, terrain, q, lc, overlays, roadNet, vectors, transportMeta, prefetchTransport, loadTransport, loadTraffic };
}
