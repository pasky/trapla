// Land cover, existing roads / railways / waterways and building footprints, rasterised on the GPU from
// the pack's vector data into anti-aliased textures:
//   - one base texture of the whole play area (drawn once), and
//   - LC_LEVELS "clip levels": square windows around the camera focus at 0.125 … 4 m per texel, each twice
//     as coarse as the previous. They are toroidal: when the focus leaves the middle of a window, the window
//     moves and only the strips it uncovers are drawn (one level per frame at most); a zoom by an octave
//     takes over the level furthest from the new range.
// With the orthophoto on, the levels hold photo tiles of a fixed grid per level (the same requests every
// time, cached compressed and as textures) instead of the vectors; a tile that has not arrived is left
// transparent, so the coarser level — ultimately the base photo — shows through.
// The terrain shader blends them, finest first, so the ground is about as sharp as the screen at any
// zoom while memory stays bounded. Textures hold premultiplied RGBA (alpha = how much the layer covers the
// hypsometric tint); layers are drawn without blending in painter's order, so overlapping OSM polygons
// do not darken, and edges are anti-aliased by 4× MSAA.

import * as THREE from 'three';
import { LC_LEVELS, type TerrainUniforms } from './terrainMaterial';
import type { BuildingData, LineLayer, VectorPack } from './vectorPack';
import { clip, exposed, Lru, tilesIn, wrapPieces, type Rect } from './photoTiles';
import type { TransportGraphData, TransportRenderInterval } from '../core/project-transport';
import { remainingLineIntervals, sourceReplacementCuts, type LineCuts } from './source-intervals';
import { finish, type Staged } from './slices';

type RGB = [number, number, number];

interface Pass {
  layer: string;
  kind: 'poly' | 'line';
  color: RGB;
  alpha: number;
  /** lines: full width in metres and the minimum width in texels */
  width?: number;
  minPx?: number;
  /** lines: extra half-width (casing) in metres / texels */
  extra?: number;
  extraPx?: number;
  /** lines: dash period (m) and duty */
  dash?: [number, number];
  /** only drawn at resolutions finer than this many metres per texel (fades out over the octave below it) */
  maxRes?: number;
}

export const BUILDING_COLOR: RGB = [156, 92, 78];
const ROAD: RGB = [252, 247, 235], CASING: RGB = [128, 116, 104];
const casing = (layer: string, width: number, minPx: number): Pass =>
  ({ layer, kind: 'line', color: CASING, alpha: 0.85, width, minPx, extra: 0.45, extraPx: 0.55, maxRes: 2.5 });

/** draw order: later passes overwrite earlier ones */
const PASSES: Pass[] = [
  { layer: 'farmland', kind: 'poly', color: [222, 208, 150], alpha: 0.38 },
  { layer: 'grass', kind: 'poly', color: [150, 188, 108], alpha: 0.42 },
  { layer: 'urban', kind: 'poly', color: [205, 190, 185], alpha: 0.45 },
  { layer: 'forest', kind: 'poly', color: [58, 104, 58], alpha: 0.62 },
  { layer: 'water', kind: 'poly', color: [80, 140, 200], alpha: 0.92 },
  { layer: 'stream', kind: 'line', color: [84, 146, 204], alpha: 0.85, width: 2.2, minPx: 0.7 },
  { layer: 'river', kind: 'line', color: [80, 140, 200], alpha: 0.92, width: 11, minPx: 1.6 },
  { layer: 'track', kind: 'line', color: [160, 132, 98], alpha: 0.8, width: 2.6, minPx: 0.8, maxRes: 5 },
  { layer: 'service', kind: 'line', color: [236, 230, 218], alpha: 0.85, width: 3.4, minPx: 0.8, maxRes: 5 },
  { layer: 'rail_side', kind: 'line', color: [92, 84, 92], alpha: 0.85, width: 1.8, minPx: 0.8, maxRes: 5 },
  { layer: 'rail', kind: 'line', color: [84, 76, 86], alpha: 0.9, width: 3.0, minPx: 1.3 },
  { layer: 'rail', kind: 'line', color: [236, 232, 226], alpha: 0.9, width: 1.5, minPx: 0.6, dash: [14, 0.5], maxRes: 2.5 },
  casing('minor', 5.5, 0.9), casing('tertiary', 7, 1.3), casing('secondary', 8, 1.6), casing('primary', 9, 2.0), casing('motorway', 11, 2.6),
  { layer: 'minor', kind: 'line', color: ROAD, alpha: 0.92, width: 5.5, minPx: 0.9 },
  { layer: 'tertiary', kind: 'line', color: ROAD, alpha: 0.95, width: 7, minPx: 1.3 },
  { layer: 'secondary', kind: 'line', color: [252, 243, 196], alpha: 0.95, width: 8, minPx: 1.6 },
  { layer: 'primary', kind: 'line', color: [250, 226, 150], alpha: 0.95, width: 9, minPx: 2.0 },
  { layer: 'motorway', kind: 'line', color: [240, 176, 128], alpha: 0.95, width: 11, minPx: 2.6 },
  { layer: 'buildings', kind: 'poly', color: BUILDING_COLOR, alpha: 1 },
];
/** Physical crossing roads use the exact same class palette as the rasterised base map. */
export function existingRoadColor(cls: string): number {
  const layer = cls === 'trunk' ? 'motorway' : ['residential', 'unclassified', 'living_street'].includes(cls) ? 'minor' : cls;
  const rgb = [...PASSES].reverse().find(p => p.layer === layer)?.color ?? ROAD;
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}
/** Over the orthophoto: the roads / tracks / railways the game knows, thin and semi-transparent in the same
 * class palette (dark casing so they read on any photo), railways dashed. Drawn from the SAME line
 * geometry and source cuts as the map, and only features the transport graph maps (what is clickable). */
const NET_CASING: RGB = [34, 30, 28];
const netPass = (layer: string, width: number, minPx: number): Pass[] => {
  const color = PASSES.filter(p => p.layer === layer && p.kind === 'line').find(p => p.color !== CASING)?.color ?? ROAD;
  return [{ layer, kind: 'line', color: NET_CASING, alpha: 0.45, width: width + 1.5, minPx: minPx + 1.6 },
    { layer, kind: 'line', color, alpha: 0.75, width, minPx }];
};
const NET_PASSES: Pass[] = [
  ...netPass('track', 1.2, 1.1), ...netPass('service', 1.6, 1.2), ...netPass('rail_side', 1.2, 1.0),
  { layer: 'rail', kind: 'line', color: NET_CASING, alpha: 0.5, width: 3, minPx: 2.8 },
  { layer: 'rail', kind: 'line', color: [236, 232, 226], alpha: 0.85, width: 1.4, minPx: 1.2, dash: [14, 0.5] },
  ...netPass('minor', 2.2, 1.4), ...netPass('tertiary', 2.6, 1.6), ...netPass('secondary', 3, 1.8),
  ...netPass('primary', 3.4, 2.0), ...netPass('motorway', 4, 2.4),
];
/** The drawn half-width (m) of a line layer where a screen pixel is `res` metres, widest pass incl. casing,
 * the same formula as the line shader; null where the layer is not drawn (faded out / not a line layer). */
export function lineHalfWidth(layer: string, res: number, photo = false): number | null {
  let hw: number | null = null;
  for (const p of photo ? NET_PASSES : PASSES) {
    if (p.layer !== layer || p.kind !== 'line') continue;
    const fade = p.maxRes === undefined ? 1 : Math.max(0, Math.min(1, 2 - (2 * res) / p.maxRes));
    if (fade <= 0) continue;
    const w = Math.max((p.width ?? 0) / 2, ((p.minPx ?? 0) / 2) * res) + Math.max(p.extra ?? 0, (p.extraPx ?? 0) * res);
    hw = Math.max(hw ?? 0, w);
  }
  return hw;
}
/** layers whose polylines get round caps and joins (wide enough for gaps to show) */
const CAPPED = new Set(['minor', 'tertiary', 'secondary', 'primary', 'motorway', 'service', 'rail', 'river']);

const POLY_VERT = /* glsl */ `
uniform vec4 box;
void main() { gl_Position = vec4((position.xy - box.xy) * box.zw * 2.0 - 1.0, 0.0, 1.0); }`;
const LINE_VERT = /* glsl */ `
attribute vec2 dir;
attribute float dist;
attribute vec3 trim0;
attribute vec3 trim1;
uniform vec4 box;
uniform float res;
uniform vec4 wpar;
varying float vDist;
varying vec2 vLineXY;
varying vec3 vTrim0;
varying vec3 vTrim1;
void main() {
  float hw = max(wpar.x, wpar.y * res) + max(wpar.z, wpar.w * res);
  vDist = dist; vTrim0 = trim0; vTrim1 = trim1;
  vLineXY = position.xy + dir * hw;
  gl_Position = vec4((vLineXY - box.xy) * box.zw * 2.0 - 1.0, 0.0, 1.0);
}`;
const FRAG = /* glsl */ `
uniform vec4 color;
uniform vec2 dash;
varying float vDist;
varying vec2 vLineXY;
varying vec3 vTrim0;
varying vec3 vTrim1;
void main() {
  if (dot(vTrim0.xy, vLineXY) + vTrim0.z < -0.001 || dot(vTrim1.xy, vLineXY) + vTrim1.z < -0.001) discard;
  if (dash.x > 0.0 && fract(vDist / dash.x) > dash.y) discard;
  gl_FragColor = color;
}`;
const POLY_FRAG = /* glsl */ `
uniform vec4 color;
void main() { gl_FragColor = color; }`;

type BBox = [number, number, number, number];
interface Geo { geo: THREE.BufferGeometry; bbox: BBox }

/** 2-component positions: give three.js a bounding sphere so it does not try to compute one (culling is ours) */
function flat(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
  return geo;
}

function polyGeos(verts: Float32Array, idx: Uint32Array, chunks: [number, number, number, number][]): Geo[] {
  const out: Geo[] = [];
  for (const [v0, vn, i0, inn] of chunks) {
    const pos = verts.subarray(2 * v0, 2 * (v0 + vn));
    const bbox: BBox = [Infinity, Infinity, -Infinity, -Infinity];
    for (let k = 0; k < pos.length; k += 2) {
      if (pos[k] < bbox[0]) bbox[0] = pos[k]; if (pos[k] > bbox[2]) bbox[2] = pos[k];
      if (pos[k + 1] < bbox[1]) bbox[1] = pos[k + 1]; if (pos[k + 1] > bbox[3]) bbox[3] = pos[k + 1];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 2));
    geo.setIndex(new THREE.BufferAttribute(idx.subarray(i0, i0 + inn), 1));
    out.push({ geo: flat(geo), bbox });
  }
  return out;
}

type TrimPlane = readonly [number, number, number];
const NO_TRIM: TrimPlane = [0, 0, 0];
class ChunkAcc {
  pos: number[] = []; dir: number[] = []; dist: number[] = []; idx: number[] = [];
  trim0: number[] = []; trim1: number[] = [];
  bbox: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  vert(x: number, y: number, dx: number, dy: number, d: number, trim0 = NO_TRIM, trim1 = NO_TRIM): number {
    this.pos.push(x, y); this.dir.push(dx, dy); this.dist.push(d);
    this.trim0.push(...trim0); this.trim1.push(...trim1);
    const b = this.bbox;
    if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y;
    return this.dist.length - 1;
  }
}

/** expand polylines into quads (mitred) plus optional round caps / joins; offsets are applied in the shader */
export function* buildLineGeos(layer: LineLayer, chunk: number, caps: boolean, cuts?: LineCuts, only?: ReadonlySet<number>): Generator<void, Geo[]> {
  const accs = new Map<number, ChunkAcc>();
  const acc = (x: number, y: number) => {
    const key = Math.floor(y / chunk) * 4096 + Math.floor(x / chunk);
    let a = accs.get(key);
    if (!a) accs.set(key, a = new ChunkAcc());
    return a;
  };
  const disc = (x: number, y: number, d: number, trim0: TrimPlane, trim1: TrimPlane) => {
    const a = acc(x, y), c = a.vert(x, y, 0, 0, d, trim0, trim1), N = 10;
    const rim: number[] = [];
    for (let k = 0; k < N; k++) rim.push(a.vert(x, y, Math.cos((2 * Math.PI * k) / N), Math.sin((2 * Math.PI * k) / N), d, trim0, trim1));
    for (let k = 0; k < N; k++) a.idx.push(c, rim[k], rim[(k + 1) % N]);
  };
  const V = layer.verts, S = layer.starts;
  for (let p = 0; p + 1 < S.length; p++) {
    if (p % 64 === 0) yield;
    if (only && !only.has(p)) continue;
    const removed = cuts?.get(p) ?? [];
    const capped = (s: number) => caps && !removed.some(([a, b]) => s >= a && s <= b);
    const i0 = S[p], n = S[p + 1] - i0;
    if (n < 2) continue;
    // per-vertex mitre vector (left normal, lengthened at bends) and distance along the line
    const mx = new Float64Array(n), my = new Float64Array(n), dd = new Float64Array(n);
    const disks: { x: number; y: number; s: number }[] = [];
    let pnx = 0, pny = 0;
    for (let j = 0; j < n; j++) {
      const x = V[2 * (i0 + j)], y = V[2 * (i0 + j) + 1];
      let nx = pnx, ny = pny;
      if (j < n - 1) {
        const ex = V[2 * (i0 + j + 1)] - x, ey = V[2 * (i0 + j + 1) + 1] - y, L = Math.hypot(ex, ey) || 1;
        nx = -ey / L; ny = ex / L;
        dd[j + 1] = dd[j] + L;
      }
      if (j === 0 || j === n - 1) { mx[j] = nx; my[j] = ny; if (capped(dd[j])) disks.push({ x, y, s: dd[j] }); }
      else {
        let sx = pnx + nx, sy = pny + ny;
        const sl = Math.hypot(sx, sy);
        if (sl < 1e-6) { sx = nx; sy = ny; } else { sx /= sl; sy /= sl; }
        const cos = sx * nx + sy * ny; // cos of half the turn angle
        const k = 1 / Math.max(0.6, cos);
        mx[j] = sx * k; my[j] = sy * k;
        if (capped(dd[j]) && cos < 0.92) disks.push({ x, y, s: dd[j] });
      }
      pnx = nx; pny = ny;
    }
    const plane = (s: number, sign: number): TrimPlane => {
      let j = 0; while (j + 2 < n && dd[j + 1] < s) j++;
      const ax = V[2 * (i0 + j)], ay = V[2 * (i0 + j) + 1], bx = V[2 * (i0 + j + 1)], by = V[2 * (i0 + j + 1) + 1];
      const length = dd[j + 1] - dd[j], t = (s - dd[j]) / length;
      const nx = sign * (bx - ax) / length, ny = sign * (by - ay) / length;
      return [nx, ny, -nx * (ax + t * (bx - ax)) - ny * (ay + t * (by - ay))];
    };
    for (const disk of disks) {
      let before = NO_TRIM, after = NO_TRIM;
      for (const [a, b] of removed) {
        if (b <= disk.s && b >= 0) before = plane(b, 1);
        if (a >= disk.s && a <= dd[n - 1]) { after = plane(a, -1); break; }
      }
      // A distant bend can put an unrelated end plane behind this centre. Only clip disks
      // on its retained side; never move an untouched disk to another part of the road.
      const local = (p: TrimPlane) => p[0] * disk.x + p[1] * disk.y + p[2] >= -1e-8 ? p : NO_TRIM;
      disc(disk.x, disk.y, disk.s, local(before), local(after));
    }
    for (let j = 0; j < n - 1; j++) {
      const x0 = V[2 * (i0 + j)], y0 = V[2 * (i0 + j) + 1], x1 = V[2 * (i0 + j + 1)], y1 = V[2 * (i0 + j + 1) + 1];
      for (const [s0, s1] of remainingLineIntervals(dd[j], dd[j + 1], removed)) {
        const t0 = (s0 - dd[j]) / (dd[j + 1] - dd[j]), t1 = (s1 - dd[j]) / (dd[j + 1] - dd[j]);
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
        const ax = lerp(x0, x1, t0), ay = lerp(y0, y1, t0), bx = lerp(x0, x1, t1), by = lerp(y0, y1, t1);
        const amx = lerp(mx[j], mx[j + 1], t0), amy = lerp(my[j], my[j + 1], t0);
        const bmx = lerp(mx[j], mx[j + 1], t1), bmy = lerp(my[j], my[j + 1], t1);
        const a = acc(0.5 * (ax + bx), 0.5 * (ay + by));
        const trim0 = s0 > dd[j] ? plane(s0, 1) : NO_TRIM, trim1 = s1 < dd[j + 1] ? plane(s1, -1) : NO_TRIM;
        const v0 = a.vert(ax, ay, amx, amy, s0, trim0, trim1), v1 = a.vert(ax, ay, -amx, -amy, s0, trim0, trim1);
        const v2 = a.vert(bx, by, bmx, bmy, s1, trim0, trim1), v3 = a.vert(bx, by, -bmx, -bmy, s1, trim0, trim1);
        a.idx.push(v0, v1, v2, v1, v3, v2);
      }
    }
  }
  const out: Geo[] = [];
  for (const a of accs.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a.pos), 2));
    geo.setAttribute('dir', new THREE.BufferAttribute(new Float32Array(a.dir), 2));
    geo.setAttribute('dist', new THREE.BufferAttribute(new Float32Array(a.dist), 1));
    geo.setAttribute('trim0', new THREE.BufferAttribute(new Float32Array(a.trim0), 3));
    geo.setAttribute('trim1', new THREE.BufferAttribute(new Float32Array(a.trim1), 3));
    geo.setIndex(a.dist.length > 65535 ? new THREE.BufferAttribute(new Uint32Array(a.idx), 1) : new THREE.BufferAttribute(new Uint16Array(a.idx), 1));
    out.push({ geo: flat(geo), bbox: a.bbox });
  }
  return out;
}

function buildingGeos(b: BuildingData, chunk: number): Geo[] {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < b.count; i++) {
    const v = b.starts[i];
    const key = Math.floor(b.verts[2 * v + 1] / chunk) * 4096 + Math.floor(b.verts[2 * v] / chunk);
    let g = groups.get(key);
    if (!g) groups.set(key, g = []);
    g.push(i);
  }
  const out: Geo[] = [];
  for (const g of groups.values()) {
    let nv = 0, nt = 0;
    for (const i of g) { nv += b.starts[i + 1] - b.starts[i]; nt += b.triStarts[i + 1] - b.triStarts[i]; }
    const pos = new Float32Array(nv * 2), idx = new Uint32Array(nt);
    const bbox: BBox = [Infinity, Infinity, -Infinity, -Infinity];
    let pv = 0, pt = 0;
    for (const i of g) {
      const v0 = b.starts[i], n = b.starts[i + 1] - v0;
      for (let t = b.triStarts[i]; t < b.triStarts[i + 1]; t++) idx[pt++] = pv + b.tris[t];
      for (let k = 0; k < n; k++) {
        const x = b.verts[2 * (v0 + k)], y = b.verts[2 * (v0 + k) + 1];
        pos[2 * pv] = x; pos[2 * pv + 1] = y; pv++;
        if (x < bbox[0]) bbox[0] = x; if (x > bbox[2]) bbox[2] = x; if (y < bbox[1]) bbox[1] = y; if (y > bbox[3]) bbox[3] = y;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    out.push({ geo: flat(geo), bbox });
  }
  return out;
}

/**
 * A clip level: the window of LC_LEVELS… texels whose lower-left texel is (ix, iy) at level k (texel size
 * R0 · 2^k). The texture is toroidal — texel (x, y) lives at (x mod size, y mod size) — so when the focus
 * moves only the uncovered strips are drawn and everything else stays. `have`: the photo tiles drawn in
 * full (as far as they reach into the window).
 */
interface Slot { rt: THREE.WebGLRenderTarget; k: number; ix: number; iy: number; have: Set<string> }

/** where to get an orthophoto of a window: (x0, y0, w, h in local metres, image size in pixels) → URL (CORS-enabled) */
export type PhotoUrl = (x0: number, y0: number, w: number, h: number, pxW: number, pxH: number) => string;
type Source = 'map' | 'blank' | { tex: THREE.Texture; rect: [number, number, number, number] };

const PHOTO_TIMEOUT_MS = 20000;
/** photo tiles: a fixed grid per level, TILE texels (= image pixels) square, so requests repeat exactly */
const TILE = 512;
const MAX_FETCHES = 6;
/** decoded tiles kept on the GPU (1 MB each) to redraw uncovered strips without waiting */
const TEX_CACHE = 64;
/** compressed tiles (and the base photo) kept in memory, in bytes: revisited ground is decoded, not refetched */
const BLOB_CACHE = 64 << 20;
/** a tile that failed is not asked for again for this long */
const RETRY_MS = 30000;
/** window origins move in steps of SNAP texels, once the focus is RECENTRE of the window off its centre */
const SNAP = 32;
const RECENTRE = 0.22;

const BG_VERT = /* glsl */ `
uniform vec4 box;
uniform vec4 rect;
varying vec2 vUv;
void main() {
  vUv = position.xy;
  gl_Position = vec4((rect.xy + position.xy * rect.zw - box.xy) * box.zw * 2.0 - 1.0, 0.0, 1.0);
}`;
const BG_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float blank;
varying vec2 vUv;
void main() { gl_FragColor = blank > 0.5 ? vec4(0.0) : vec4(texture2D(map, vUv).rgb, 1.0); }`;

const R0 = 0.125; // metres per texel of the finest clip level
const K_MAX = 5; // coarsest clip level: R0 · 2^5 = 4 m per texel (the base texture takes over beyond)
const tileKey = (k: number, i: number, j: number) => `${k}/${i}/${j}`;

export class LandCover {
  private scene = new THREE.Scene();
  private cam = new THREE.Camera();
  private box = { value: new THREE.Vector4() };
  private res = { value: 1 };
  private passes: { pass: Pass; mat: THREE.ShaderMaterial; meshes: THREE.Mesh[] }[] = [];
  private sourceCuts = new Map<string, LineCuts>();
  /** the known-network overlay over the photo (built on first use): its own scene / materials, same cuts */
  private net: { scene: THREE.Scene; passes: { pass: Pass; mat: THREE.ShaderMaterial; meshes: THREE.Mesh[] }[] } | null = null;
  private overMat!: THREE.ShaderMaterial;
  private overScene = new THREE.Scene();
  private scratch: THREE.WebGLRenderTarget;
  private size: number;
  private base: THREE.WebGLRenderTarget;
  private baseDone = false;
  private slots: Slot[] = [];
  private blitScene = new THREE.Scene();
  private emptyScene = new THREE.Scene();
  private blitMat: THREE.ShaderMaterial;
  private k0 = Infinity;
  private fx = 0;
  private fy = 0;
  /** number of level textures drawn so far (diagnostics) */
  renders = 0;
  // optional orthophoto, fetched in tiles of a fixed grid per level and drawn instead of the vectors
  private photoUrl: PhotoUrl | null = null;
  private photoOn = false;
  private photoScene = new THREE.Scene();
  private bgMat: THREE.ShaderMaterial;
  private texCache = new Lru<THREE.Texture>(TEX_CACHE, (t) => t.dispose());
  private blobCache = new Lru<Blob>(BLOB_CACHE);
  /** requests under way (tile keys, 'base') */
  private inflight = new Map<string, AbortController>();
  private failed = new Map<string, number>();
  /** tiles wanted by the current windows, most important first */
  private queue: { k: number; i: number; j: number; key: string; d: number }[] = [];
  private basePhoto = false;
  /** no photo has arrived yet and a request failed (offline?): the map is drawn, the base photo is retried */
  private down = false;
  private loadedAny = false;
  private baseGen = 0;
  private warned = false;
  /** called when a texture changed outside update() (a photo arrived) */
  onChange: (() => void) | null = null;

  constructor(private renderer: THREE.WebGLRenderer, private vectors: VectorPack, private width: number, private height: number,
    private uniforms: TerrainUniforms, private network: TransportGraphData | null = null) {
    const maxTex = renderer.capabilities.maxTextureSize;
    this.size = Math.min(2048, maxTex);
    const geos = new Map<string, Geo[]>();
    for (const l of vectors.polys) geos.set(l.name, polyGeos(l.verts, l.idx, l.chunks));
    for (const l of vectors.lines) geos.set(l.name, finish(buildLineGeos(l, vectors.chunk, CAPPED.has(l.name))));
    if (vectors.buildings) geos.set('buildings', buildingGeos(vectors.buildings, vectors.chunk));
    this.passes = this.makePasses(PASSES, geos, this.scene);
    const samples = Math.min(4, renderer.capabilities.maxSamples);
    this.scratch = new THREE.WebGLRenderTarget(this.size, this.size, {
      samples, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    const levelRT = (w: number, h: number) => {
      const rt = new THREE.WebGLRenderTarget(w, h, {
        depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      });
      rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return rt;
    };
    // base: the whole play area at ≈ 8.5 m per texel, drawn in scratch-sized tiles
    const bw = this.size, bh = Math.min(maxTex, Math.round((this.size * height) / width / 256) * 256);
    this.base = levelRT(bw, bh);
    for (let i = 0; i < LC_LEVELS; i++) {
      const rt = levelRT(this.size, this.size);
      rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping;
      this.slots.push({ rt, k: -1, ix: 0, iy: 0, have: new Set() });
    }
    this.bgMat = new THREE.ShaderMaterial({
      uniforms: { box: this.box, rect: { value: new THREE.Vector4() }, map: { value: null }, blank: { value: 0 } },
      vertexShader: BG_VERT, fragmentShader: BG_FRAG, blending: THREE.NoBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
    quad.setIndex([0, 1, 2, 1, 3, 2]);
    const bg = new THREE.Mesh(flat(quad), this.bgMat);
    bg.frustumCulled = false;
    this.photoScene.add(bg);
    // premultiplied "over" copy: the overlay keeps its anti-aliasing from the multisampled scratch target
    this.overMat = new THREE.ShaderMaterial({
      uniforms: { src: { value: this.scratch.texture }, srcRect: { value: new THREE.Vector4(0, 0, 1, 1) } },
      vertexShader: 'uniform vec4 srcRect; varying vec2 vUv; void main() { vUv = srcRect.xy + (position.xy * 0.5 + 0.5) * srcRect.zw; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D src; varying vec2 vUv; void main() { gl_FragColor = texture2D(src, vUv); }',
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, depthTest: false, depthWrite: false,
    });
    this.blitMat = new THREE.ShaderMaterial({
      uniforms: { src: { value: this.scratch.texture }, srcRect: { value: new THREE.Vector4(0, 0, 1, 1) } },
      vertexShader: 'uniform vec4 srcRect; varying vec2 vUv; void main() { vUv = srcRect.xy + (position.xy * 0.5 + 0.5) * srcRect.zw; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D src; varying vec2 vUv; void main() { gl_FragColor = texture2D(src, vUv); }',
      blending: THREE.NoBlending, depthTest: false, depthWrite: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const blit = new THREE.Mesh(flat(tri), this.blitMat);
    blit.frustumCulled = false;
    this.blitScene.add(blit);
    const over = new THREE.Mesh(flat(tri), this.overMat);
    over.frustumCulled = false;
    this.overScene.add(over);
    uniforms.lcBase.value = this.base.texture;
  }

  private makePasses(passes: readonly Pass[], geos: ReadonlyMap<string, Geo[]>, scene: THREE.Scene) {
    const out: { pass: Pass; mat: THREE.ShaderMaterial; meshes: THREE.Mesh[] }[] = [];
    passes.forEach((pass, order) => {
      const gl = geos.get(pass.layer);
      if (!gl) return;
      const line = pass.kind === 'line';
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          box: this.box, res: this.res, color: { value: new THREE.Vector4() },
          wpar: { value: new THREE.Vector4((pass.width ?? 0) / 2, (pass.minPx ?? 0) / 2, pass.extra ?? 0, pass.extraPx ?? 0) },
          dash: { value: new THREE.Vector2(pass.dash?.[0] ?? 0, pass.dash?.[1] ?? 1) },
        },
        vertexShader: line ? LINE_VERT : POLY_VERT, fragmentShader: line ? FRAG : POLY_FRAG,
        blending: THREE.NoBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      });
      const meshes = gl.map((g) => this.mesh(g, mat, order, scene));
      out.push({ pass, mat, meshes });
    });
    return out;
  }
  private mesh(g: Geo, mat: THREE.Material, order: number, scene: THREE.Scene) {
    const m = new THREE.Mesh(g.geo, mat);
    m.frustumCulled = false; m.matrixAutoUpdate = false; m.renderOrder = order; m.userData.bbox = g.bbox;
    scene.add(m); return m;
  }
  /** polylines of a line layer the transport graph maps (no graph: none — nothing is clickable) */
  private mapped(layer: string): ReadonlySet<number> {
    if (!this.network) return new Set();
    let owned = this.owned;
    if (!owned) { owned = this.owned = new Set(); for (const source of this.network.sources) for (const r of source.render) owned.add(r.featureId); }
    const out = new Set<number>();
    for (const f of this.network.renderFeatures) if (f.layer === layer && owned.has(f.id)) out.add(f.polylineIndex);
    return out;
  }
  private owned: Set<string> | null = null;
  private netLayers() { return new Set(NET_PASSES.map(p => p.layer)); }
  /** build the known-network overlay once, from the current accepted cuts */
  private ensureNetwork() {
    if (this.net) return;
    const geos = new Map<string, Geo[]>(), layers = this.netLayers();
    for (const l of this.vectors.lines) if (layers.has(l.name))
      geos.set(l.name, finish(buildLineGeos(l, this.vectors.chunk, CAPPED.has(l.name), this.sourceCuts.get(l.name), this.mapped(l.name))));
    const scene = new THREE.Scene();
    this.net = { scene, passes: this.makePasses(NET_PASSES, geos, scene) };
  }
  /** composite the network overlay of the slot window c (texels) over what the level holds there */
  private overlayNetwork(rt: THREE.WebGLRenderTarget, c: Rect, t: number, pieces: [number, number, number, number, number, number][], mips: boolean) {
    if (!this.net) return;
    this.drawVectors(c[0] * t, c[1] * t, c[2] * t, c[3] * t, c[2], c[3], this.net);
    const S = this.size;
    for (const [x, y, w, h, tx, ty] of pieces) {
      this.overMat.uniforms.srcRect.value.set((x - c[0]) / S, (y - c[1]) / S, w / S, h / S);
      rt.viewport.set(tx, ty, w, h);
      rt.texture.mipmapsAutoUpdate = mips;
      this.renderer.setRenderTarget(rt);
      this.renderer.autoClear = false;
      this.renderer.render(this.overScene, this.cam);
      this.renders++;
    }
  }

  /** draw the vector layers of the window (x0, y0, w, h) in local metres into the lower-left vw × vh texels of the scratch target */
  private drawVectors(x0: number, y0: number, w: number, h: number, vw: number, vh: number,
    layers: { scene: THREE.Scene; passes: LandCover['passes'] } = { scene: this.scene, passes: this.passes }) {
    const res = w / vw;
    this.box.value.set(x0, y0, 1 / w, 1 / h);
    this.res.value = res;
    const pad = 40 + 8 * res; // widest line half-width incl. minimum texel widths
    for (const { pass, mat, meshes } of layers.passes) {
      // fades out over the octave below maxRes
      const fade = pass.maxRes === undefined ? 1 : Math.max(0, Math.min(1, 2 - (2 * res) / pass.maxRes));
      const a = pass.alpha * fade;
      mat.uniforms.color.value.set((pass.color[0] / 255) * a, (pass.color[1] / 255) * a, (pass.color[2] / 255) * a, a);
      for (const m of meshes) {
        const b = m.userData.bbox as BBox;
        m.visible = fade > 0 && b[2] + pad >= x0 && b[0] - pad <= x0 + w && b[3] + pad >= y0 && b[1] - pad <= y0 + h;
      }
    }
    this.scratch.viewport.set(0, 0, vw, vh);
    this.renderer.setRenderTarget(this.scratch);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = true;
    this.renderer.render(layers.scene, this.cam);
  }

  /** copy the vw × vh texels at (sx, sy) of the resolved scratch target into a texture at (vx, vy) */
  private blit(rt: THREE.WebGLRenderTarget, sx: number, sy: number, vx: number, vy: number, vw: number, vh: number, mips: boolean) {
    const S = this.size;
    this.blitMat.uniforms.srcRect.value.set(sx / S, sy / S, vw / S, vh / S);
    rt.viewport.set(vx, vy, vw, vh);
    rt.texture.mipmapsAutoUpdate = mips;
    this.renderer.setRenderTarget(rt);
    this.renderer.autoClear = false;
    this.renderer.render(this.blitScene, this.cam);
    this.renders++;
  }

  /**
   * Draw the part `win` (x0, y0, w, h in local metres) of a photo covering `src.rect` — or transparency —
   * straight into the vw × vh texels at (vx, vy) of a texture (no anti-aliasing needed: texels match).
   */
  private drawPhoto(rt: THREE.WebGLRenderTarget, vx: number, vy: number, vw: number, vh: number,
    win: [number, number, number, number], src: Exclude<Source, 'map'>, mips: boolean) {
    this.box.value.set(win[0], win[1], 1 / win[2], 1 / win[3]);
    const blank = src === 'blank';
    this.bgMat.uniforms.blank.value = blank ? 1 : 0;
    this.bgMat.uniforms.rect.value.set(...(blank ? win : src.rect));
    this.bgMat.uniforms.map.value = blank ? null : src.tex;
    rt.viewport.set(vx, vy, vw, vh);
    rt.texture.mipmapsAutoUpdate = mips;
    this.renderer.setRenderTarget(rt);
    this.renderer.autoClear = false;
    this.renderer.render(this.photoScene, this.cam);
    this.renders++;
  }

  /** draw `src` into the part of the rectangle r (texels of the slot's level) inside its window; no mipmaps yet */
  private paint(s: Slot, r: Rect, src: Source) {
    const c = clip(r, [s.ix, s.iy, this.size, this.size]);
    if (!c) return;
    const t = R0 * 2 ** s.k, pieces = wrapPieces(c, this.size);
    if (src === 'map') {
      // drawn once, copied where the pieces live in the toroidal texture
      this.drawVectors(c[0] * t, c[1] * t, c[2] * t, c[3] * t, c[2], c[3]);
      for (const [x, y, w, h, tx, ty] of pieces) this.blit(s.rt, x - c[0], y - c[1], tx, ty, w, h, false);
    } else {
      for (const [x, y, w, h, tx, ty] of pieces) this.drawPhoto(s.rt, tx, ty, w, h, [x * t, y * t, w * t, h * t], src, false);
      // a missing tile stays transparent (the coarser level, with its network, shows through)
      if (src !== 'blank') this.overlayNetwork(s.rt, c, t, pieces, false);
    }
  }

  /** regenerate a level's mipmaps once after a batch of paints */
  private finish(s: Slot) {
    s.rt.texture.mipmapsAutoUpdate = true;
    this.renderer.setRenderTarget(s.rt);
    this.renderer.autoClear = false;
    this.renderer.render(this.emptyScene, this.cam);
  }

  private withState(f: () => void) {
    const r = this.renderer;
    const target = r.getRenderTarget(), auto = r.autoClear, alpha = r.getClearAlpha(), color = r.getClearColor(new THREE.Color());
    try { f(); } finally {
      r.setRenderTarget(target);
      r.autoClear = auto;
      r.setClearColor(color, alpha);
    }
  }

  /** the map, or a photo covering the rectangle `rect` (local metres; may be larger than the play area) */
  private drawBase(photo?: THREE.Texture, rect?: [number, number, number, number]) {
    const bw = this.base.width, bh = this.base.height, S = this.size;
    const rx = this.width / bw, ry = this.height / bh;
    this.withState(() => {
      if (photo && rect) {
        this.drawPhoto(this.base, 0, 0, bw, bh, [0, 0, this.width, this.height], { tex: photo, rect }, true);
        // the network over the base photo, drawn in scratch-sized tiles like the map
        if (this.net) for (let ty = 0; ty < bh; ty += S) {
          const th = Math.min(S, bh - ty);
          this.drawVectors(0, ty * ry, S * rx, S * ry, S, S, this.net);
          this.overMat.uniforms.srcRect.value.set(0, 0, bw / S, th / S);
          this.base.viewport.set(0, ty, bw, th); this.base.texture.mipmapsAutoUpdate = true;
          this.renderer.setRenderTarget(this.base); this.renderer.autoClear = false;
          this.renderer.render(this.overScene, this.cam); this.renders++;
        }
      } else for (let ty = 0; ty < bh; ty += S) {
        const th = Math.min(S, bh - ty);
        this.drawVectors(0, ty * ry, S * rx, S * ry, S, S);
        this.blit(this.base, 0, 0, 0, ty, bw, th, true);
      }
    });
    this.base.viewport.set(0, 0, bw, bh);
    this.uniforms.lcBaseOn.value = 1;
    this.baseDone = true;
    this.basePhoto = !!photo;
  }

  /** forget everything drawn so far; redrawn by update() (photos come from the cache when they can) */
  private reset() {
    this.queue = [];
    this.baseGen++;
    this.baseDone = this.basePhoto = false;
    this.uniforms.lcBaseOn.value = 0;
    for (const s of this.slots) { s.k = -1; s.have.clear(); }
    this.publish();
  }

  /** Stage exact accepted source removals before expansion by each style pass. Casing, minimum-pixel
   * widths and railway dashes therefore agree, without erasing another source at the same pixels. */
  *buildSourceReplacements(graph: TransportGraphData, accepted: readonly TransportRenderInterval[]): Generator<void, Staged> {
    const next = sourceReplacementCuts(graph, accepted), changed = new Map<string, Geo[]>(), changedNet = new Map<string, Geo[]>();
    const key = (cuts?: LineCuts) => JSON.stringify(cuts ? [...cuts] : []);
    let handedOver = false, settled = false;
    const dispose = () => {
      if (settled) return; settled = true;
      for (const geos of [...changed.values(), ...changedNet.values()]) for (const g of geos) g.geo.dispose();
    };
    const netLayers = this.netLayers();
    // the network as it was when staging began: one built meanwhile has the old cuts and is rebuilt at commit
    const net = this.net;
    try {
      for (const layer of this.vectors.lines) {
        if (key(this.sourceCuts.get(layer.name)) === key(next.get(layer.name))) continue;
        changed.set(layer.name, yield* buildLineGeos(layer, this.vectors.chunk, CAPPED.has(layer.name), next.get(layer.name)));
        if (net && netLayers.has(layer.name))
          changedNet.set(layer.name, yield* buildLineGeos(layer, this.vectors.chunk, CAPPED.has(layer.name), next.get(layer.name), this.mapped(layer.name)));
      }
      handedOver = true;
      return { dispose, commit: () => {
        if (settled) return;
        const old = new Set<THREE.BufferGeometry>();
        for (const entry of this.passes) {
          const geos = changed.get(entry.pass.layer);
          if (entry.pass.kind !== 'line' || !geos) continue;
          const order = entry.meshes[0]?.renderOrder ?? PASSES.indexOf(entry.pass);
          for (const mesh of entry.meshes) { this.scene.remove(mesh); old.add(mesh.geometry); }
          entry.meshes = geos.map(g => {
            const mesh = new THREE.Mesh(g.geo, entry.mat); mesh.frustumCulled = false;
            mesh.matrixAutoUpdate = false; mesh.renderOrder = order; mesh.userData.bbox = g.bbox;
            this.scene.add(mesh); return mesh;
          });
        }
        if (this.net && this.net === net) for (const entry of this.net.passes) {
          const geos = changedNet.get(entry.pass.layer);
          if (!geos) continue;
          const order = entry.meshes[0]?.renderOrder ?? NET_PASSES.indexOf(entry.pass);
          for (const mesh of entry.meshes) { this.net.scene.remove(mesh); old.add(mesh.geometry); }
          entry.meshes = geos.map(g => this.mesh(g, entry.mat, order, this.net!.scene));
        } else for (const geos of changedNet.values()) for (const g of geos) g.geo.dispose();
        const stale = this.net && this.net !== net;
        for (const geometry of old) geometry.dispose();
        this.sourceCuts = next;
        if (stale && changed.size) { this.disposeNetwork(); this.ensureNetwork(); }
        if (changed.size) { this.reset(); this.onChange?.(); }
        settled = true;
      } };
    } finally { if (!handedOver) dispose(); }
  }

  private disposeNetwork() {
    if (!this.net) return;
    const geos = new Set<THREE.BufferGeometry>();
    for (const entry of this.net.passes) { entry.mat.dispose(); for (const m of entry.meshes) geos.add(m.geometry); }
    for (const g of geos) g.dispose();
    this.net = null;
  }
  /** the GPU lost everything (WebGL context loss): redraw, and do not trust the cached photo textures */
  invalidate() {
    this.texCache.clear();
    this.reset();
  }

  // ---- orthophoto --------------------------------------------------------------------------
  /** enable the orthophoto source (off until setPhoto(true)) */
  setPhotoSource(url: PhotoUrl | null) { this.photoUrl = url; }
  get hasPhotoSource() { return !!this.photoUrl; }

  /** drape the orthophoto instead of the vector land cover; everything is redrawn */
  setPhoto(on: boolean) {
    on = on && !!this.photoUrl;
    if (on === this.photoOn) return;
    this.photoOn = on;
    if (on && this.network) this.ensureNetwork();
    this.uniforms.lcPhoto.value = this.showPhoto ? 1 : 0;
    this.reset();
  }

  /** the levels hold photo tiles (else the map) */
  private get showPhoto() { return this.photoOn && !!this.photoUrl && !this.down; }
  /** the photo is shown with the known-network overlay (diagnostics) */
  get photoWithNetwork() { return this.showPhoto && this.loadedAny && !!this.net; }

  private setDown(down: boolean) {
    if (down === this.down) return;
    this.down = down;
    this.uniforms.lcPhoto.value = this.showPhoto ? 1 : 0;
    this.reset();
    this.onChange?.();
  }

  /** true while photos for the current view are being fetched or wait to be */
  get loadingPhotos() { return this.inflight.size > 0 || this.queue.length > 0; }

  /** the levels the terrain shows (finer stale ones are not) */
  private live() {
    return this.slots.filter((s) => s.k >= this.k0 && s.k < this.k0 + LC_LEVELS && s.k <= K_MAX);
  }

  /** rebuild the list of wanted tiles (nearest the focus first, coarse levels a little earlier) and start fetches */
  private schedule() {
    this.queue = [];
    if (!this.photoOn || !this.photoUrl) return;
    if (this.down) { this.pump(); return; }
    const now = performance.now(), live = this.live(), S = this.size;
    const top = Math.max(...live.map((s) => s.k));
    for (const s of live) {
      const t = R0 * 2 ** s.k, T = TILE * t;
      for (const [i, j] of tilesIn([s.ix, s.iy, S, S], TILE)) {
        const key = tileKey(s.k, i, j);
        if (s.have.has(key) || this.inflight.has(key) || (this.failed.get(key) ?? 0) > now) continue;
        // nothing to see outside the play area
        if (i * T >= this.width || (i + 1) * T <= 0 || j * T >= this.height || (j + 1) * T <= 0) continue;
        const d = Math.hypot((i + 0.5) * T - this.fx, (j + 0.5) * T - this.fy) / (S * t);
        this.queue.push({ k: s.k, i, j, key, d: d + 0.15 * (top - s.k) });
      }
    }
    this.queue.sort((a, b) => a.d - b.d);
    this.pump();
  }

  private pump() {
    if (!this.photoOn || !this.photoUrl) return;
    if (this.baseDone && !this.basePhoto && !this.inflight.has('base') && (this.failed.get('base') ?? 0) <= performance.now()) {
      // image services return square pixels: ask for a box with exactly the image's aspect ratio (it
      // overhangs the play area a little) instead of letting the server adjust the extent
      const bw = this.base.width, bh = this.base.height, res = Math.max(this.width / bw, this.height / bh), gen = this.baseGen;
      const box: [number, number, number, number] = [0, 0, bw * res, bh * res];
      this.load('base', this.photoUrl(...box, bw, bh), (tex) => {
        if (gen === this.baseGen && this.showPhoto) this.drawBase(tex, box);
        tex.dispose();
      });
    }
    while (this.inflight.size < MAX_FETCHES && this.queue.length) {
      const { k, i, j, key } = this.queue.shift()!;
      const T = TILE * R0 * 2 ** k, rect: [number, number, number, number] = [i * T, j * T, T, T];
      this.load(key, this.photoUrl(...rect, TILE, TILE), (tex) => this.placeTile(k, i, j, key, tex, rect));
    }
  }

  /** a tile arrived: cache it and draw it into its level, if that level still covers it */
  private placeTile(k: number, i: number, j: number, key: string, tex: THREE.Texture, rect: [number, number, number, number]) {
    this.texCache.set(key, tex);
    if (!this.showPhoto) return;
    for (const s of this.slots) {
      if (s.k !== k || !clip([i * TILE, j * TILE, TILE, TILE], [s.ix, s.iy, this.size, this.size])) continue;
      this.withState(() => {
        this.paint(s, [i * TILE, j * TILE, TILE, TILE], { tex, rect });
        this.finish(s);
      });
      s.have.add(key);
    }
  }

  /** fetch (or take from the cache) and decode an image; `use` gets a texture already on the GPU */
  private load(key: string, url: string, use: (tex: THREE.Texture) => void) {
    const ctrl = new AbortController();
    this.inflight.set(key, ctrl);
    const mine = () => this.inflight.get(key) === ctrl;
    const fail = (why: string) => {
      this.failed.set(key, performance.now() + RETRY_MS);
      if (!this.loadedAny) this.setDown(true);
      if (!this.warned) { this.warned = true; console.warn('orthophoto unavailable; showing the map instead:', why); }
    };
    const done = () => { this.inflight.delete(key); this.onChange?.(); this.schedule(); };
    // the deadline also covers decoding, which an abort cannot interrupt: the slot goes to the next request
    const timer = setTimeout(() => { ctrl.abort(); if (mine()) { fail('timed out'); done(); } }, PHOTO_TIMEOUT_MS);
    const cached = this.blobCache.get(url);
    (cached ? Promise.resolve(cached) : fetch(url, { mode: 'cors', signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then((b) => { this.blobCache.set(url, b, b.size); return b; }))
      // decoded off the main thread; flipped here because WebGL ignores UNPACK_FLIP_Y for bitmaps
      .then((b) => createImageBitmap(b, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
      .then((bmp) => {
        try {
          if (!mine()) return; // timed out while decoding
          const tex = new THREE.Texture(bmp as unknown as HTMLImageElement);
          tex.flipY = false;
          tex.generateMipmaps = false;
          tex.minFilter = tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;
          this.renderer.initTexture(tex); // uploaded now: the bitmap is released below
          this.loadedAny = true;
          this.setDown(false);
          use(tex);
        } finally {
          bmp.close();
        }
      })
      .catch((e) => { if (mine()) fail(String(e)); })
      .finally(() => { clearTimeout(timer); if (mine()) done(); });
  }

  /**
   * Keep the clip levels around the focus (local metres) for the given ground size of a screen pixel.
   * Draws at most one level per call; returns true while more are pending (call again next frame).
   */
  update(fx: number, fy: number, mPerPx: number): boolean {
    if (!this.baseDone) { this.drawBase(); this.pump(); return true; }
    this.fx = fx; this.fy = fy;
    const want = Math.log2(Math.max(1e-3, mPerPx) / R0), k0 = this.k0, S = this.size;
    // hysteresis so a zoom hovering around a boundary does not thrash
    if (!isFinite(this.k0) || Math.abs(want - this.k0) > 0.65) this.k0 = Math.max(0, Math.round(want));
    let pending = 0, drawn = false;
    for (let k = this.k0; k < this.k0 + LC_LEVELS && k <= K_MAX; k++) {
      const t = R0 * 2 ** k;
      let slot = this.slots.find((s) => s.k === k);
      if (slot && Math.abs(fx / t - slot.ix - S / 2) < RECENTRE * S && Math.abs(fy / t - slot.iy - S / 2) < RECENTRE * S) continue;
      if (drawn) { pending++; continue; }
      // move this level, or take over the slot that is furthest from the wanted range
      const moved = !!slot;
      if (!slot) {
        slot = this.slots.find((s) => s.k < 0)
          ?? this.slots.filter((s) => s.k < this.k0 || s.k >= this.k0 + LC_LEVELS || s.k > K_MAX).sort((a, b) => Math.abs(b.k - this.k0) - Math.abs(a.k - this.k0))[0];
        if (!slot) continue;
      }
      const old: [number, number] | null = moved ? [slot.ix, slot.iy] : null;
      slot.k = k;
      slot.ix = Math.round((fx / t - S / 2) / SNAP) * SNAP;
      slot.iy = Math.round((fy / t - S / 2) / SNAP) * SNAP;
      const s = slot;
      this.withState(() => this.redraw(s, old));
      drawn = true;
    }
    if (drawn || k0 !== this.k0) this.publish();
    if (drawn || k0 !== this.k0 || this.queue.length) this.schedule();
    return pending > 0;
  }

  /**
   * Bring a level up to date after its window moved from `old` (null: it was showing something else):
   * the uncovered strips get the map (or, with the photo, nothing until their tiles are drawn — the coarser
   * level shows through), then whatever tiles of them are in the cache.
   */
  private redraw(s: Slot, old: [number, number] | null) {
    const S = this.size, win: Rect = [s.ix, s.iy, S, S];
    const fresh = old ? exposed(old, [s.ix, s.iy], S) : [win];
    const photo = this.showPhoto;
    if (!old) s.have.clear();
    for (const r of fresh) this.paint(s, r, photo ? 'blank' : 'map');
    if (photo) {
      const T = TILE * R0 * 2 ** s.k, inWin = new Set<string>();
      for (const [i, j] of tilesIn(win, TILE)) {
        const key = tileKey(s.k, i, j), tr: Rect = [i * TILE, j * TILE, TILE, TILE];
        inWin.add(key);
        if (s.have.has(key) && !fresh.some((r) => clip(r, tr))) continue;
        const tex = this.texCache.get(key);
        if (tex) { this.paint(s, tr, { tex, rect: [i * T, j * T, T, T] }); s.have.add(key); } else s.have.delete(key);
      }
      for (const key of s.have) if (!inWin.has(key)) s.have.delete(key);
    }
    this.finish(s);
  }

  /** hand the valid levels to the terrain shader, coarsest first */
  private publish() {
    const u = this.uniforms;
    // levels finer than the current zoom wants are dropped: they would show as sharper / busier patches
    const order = this.slots.filter((s) => s.k >= 0 && s.k >= this.k0).sort((a, b) => b.k - a.k);
    const tex = [u.lcTex0, u.lcTex1, u.lcTex2, u.lcTex3];
    for (let i = 0; i < LC_LEVELS; i++) {
      const s = order[i];
      tex[i].value = s ? s.rt.texture : null;
      u.lcOn.value[i] = s ? 1 : 0;
      if (s) {
        const t = R0 * 2 ** s.k, win = this.size * t;
        u.lcBox.value[i].set(s.ix * t, s.iy * t, 1 / win, 1 / win);
      }
    }
  }
}
