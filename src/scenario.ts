// Browser-side loading of a scenario pack (see README.md for the format).

import type { GroundMeta } from './core/ground';
import type { BuildingInfo } from './core/buildings';
import type { RoadNetData } from './core/roadnet';
import { decodeHeights, Terrain } from './core/terrain';
import { parseVectorPack, type VectorPack } from './render/vectorPack';

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
  /** vector render data (land cover, roads, buildings); absent in packs built without OSM */
  vector?: { file: string } | null;
  /** ArcGIS MapServer "export" endpoint serving an orthophoto in the scenario's CRS (optional view layer) */
  orthophoto?: { export: string; sr: number; attribution: string } | null;
  A: { xy: [number, number]; latlon: [number, number]; note: string };
  B: { xy: [number, number]; latlon: [number, number]; note: string };
  official: { xy: [number, number][]; kinds: number[]; lengthM: number };
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

export async function loadPack(base: string, progress?: (msg: string) => void): Promise<Pack> {
  progress?.('loading scenario…');
  const meta: PackMeta = await (await fetch(`${base}/meta.json`)).json();
  progress?.('loading terrain (DMR 5G, 5 m)…');
  const [hb, lb, overlays, vectors, gb] = await Promise.all([
    gunzip(`${base}/${meta.heights.file}`),
    gunzip(`${base}/${meta.landcover.file}`),
    fetch(`${base}/overlays.json`).then((r) => r.json() as Promise<Overlays>),
    // render-only: without it the view falls back to plain shaded relief
    meta.vector?.file
      ? gunzip(`${base}/${meta.vector.file}`).then(parseVectorPack).catch((e) => { console.warn('vector render data unavailable', e); return null; })
      : Promise.resolve(null),
    meta.ground ? gunzip(`${base}/${meta.ground.file}`) : Promise.resolve(null),
  ]);
  const q = decodeHeights(new Int16Array(hb), meta.nx, meta.ny);
  const lc = new Uint8Array(lb);
  const terrain = new Terrain({ nx: meta.nx, ny: meta.ny, cell: meta.cell, base: meta.heights.base, scale: meta.heights.scale, q, lc,
    ground: meta.ground && gb ? { ...meta.ground, ids: new Uint8Array(gb) } : undefined });
  return { base, meta, terrain, q, lc, overlays, vectors };
}
