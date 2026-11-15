// Finite-segment road noise at a point: Manuál 2018 (verze 2020) §1.10–1.11 and §1.19.
// Every station cell (≤ 10 m, §1.10.2) is a finite road segment: Y − U − Du − DB, energy-summed over
// the whole road (§1.19), each period separately. research/11-noise-calculation.md §6.
//
//  - U: the manual's ground loss at the perpendicular distance from the cell's own line (the existing
//    calibrated slant-range extension, road-noise.ts); Du = 10 log(180° / α) with α the true angle under
//    which the cell is seen (table 24 and appendix). A straight homogeneous road therefore gives exactly
//    the manual's in-band result Y − U(d) − Du(α_total); see research/11 §6 for the §1.10.2 alternative.
//  - DB per cell and side (§1.11, eq. 44/45): the best single obstacle — the wall top, a cut's top edge, or
//    the crown / deck edge — in the vertical plane of the ray from the cell to the point. Source on the road
//    axis 1 m above it (§1.11 a). A point that sees over the obstacle gets nothing from it.
//
// An AcousticSource is one physical carriageway (stable id): splitting an editor route splits its cells, it
// never duplicates a line, so a project can energy-sum several sources at one house.
import { NOISE } from './data/urban';
import * as dm from './detmath';
import { propagationLoss } from './road-noise';

/** Screening geometry of one side of the road, per station. Offsets from the axis, heights relative to the
 * station's grade. */
export interface SideScreen {
  /** 1 = nothing reaches this side from this cell (tunnel) */
  shield: Uint8Array;
  /** cut top edge / crown or deck edge: offset (NaN = none) and top */
  edgeOff: Float64Array;
  edgeTop: Float64Array;
  /** where a wall stands on this side: offset of its line and its foot (top = foot + height) */
  wallOff: Float64Array;
  wallFoot: Float64Array;
  /** 1 = no wall can stand here (a junction opening; tunnels are shielded instead) */
  gap: Uint8Array;
}

/** One physical line source: a carriageway's (or a track's) station cells with their screening. Generic:
 * geometry, emission per cell, mode. A two-lane road is one source; a motorway is two directional sources
 * (each carriageway's own traffic on its lane axis); a railway plugs in with its own `mode` (its emission /
 * propagation method is the mode's, not implemented here yet). */
export interface AcousticSource {
  /** stable physical source id (project `acousticSourceId`) */
  id: string;
  mode: 'road' | 'rail';
  /** propagation: the equivalent line lies this far from the cell line towards the receiver, m
   * (two-lane road: the near lane, NOISE.sourceOffset; a directional carriageway on its lane axis: 0) */
  laneOffset: number;
  /** barrier geometry: source height above the cell's grade, m (road: Manual §1.11 a, 1 m) */
  sourceHeight: number;
  /** per-cell energy weight relative to dayDb / nightDb (absent = 1; e.g. a speed change along it).
   * Day and night scale together: a different day/night shape is a different source. */
  weight?: ArrayLike<number>;
  n: number;
  x: ArrayLike<number>; y: ArrayLike<number>; tx: ArrayLike<number>; ty: ArrayLike<number>;
  grade: ArrayLike<number>;
  /** cell length along the axis, m */
  len: ArrayLike<number>;
  /** reference LAeq Y (Manual eq. 41) by day / at night, dB */
  dayDb: number; nightDb: number;
  L: SideScreen; R: SideScreen;
}

export function emptyScreen(n: number): SideScreen {
  const edgeOff = new Float64Array(n).fill(NaN);
  return { shield: new Uint8Array(n), edgeOff, edgeTop: new Float64Array(n), wallOff: new Float64Array(n),
    wallFoot: new Float64Array(n), gap: new Uint8Array(n) };
}

// ---- manual §1.11: barrier insertion loss ------------------------------------------------------

/** Manual eq. 44/45: DB = 13.41 + 10.47 log(Z + 0.18) − 2.67 log²(Z + 0.18) for Z ≤ 60 m, 24 dB beyond.
 * Z = path difference over the obstacle top, m (4.1 dB at grazing incidence, the manual's Huygens note). */
export function barrierDb(z: number): number {
  if (z > 60) return 24;
  const l = dm.log10(Math.max(0, z) + 0.18);
  return 13.41 + 10.47 * l - 2.67 * l * l;
}
// transmitted energy fraction 10^(−DB/10), tabulated over √Z (smooth there; ≤ 0.01 dB error)
const T_STEP = 0.005, T_MAX = Math.sqrt(60);
const T_TABLE = (() => {
  const m = Math.ceil(T_MAX / T_STEP) + 2, t = new Float64Array(m);
  for (let k = 0; k < m; k++) t[k] = dm.pow(10, -barrierDb((k * T_STEP) * (k * T_STEP)) / 10);
  return t;
})();
function transmission(z: number): number {
  const u = Math.sqrt(Math.max(0, z)) / T_STEP;
  if (u >= T_MAX / T_STEP) return dm.pow(10, -2.4);
  const k = Math.floor(u), f = u - k;
  return T_TABLE[k] + (T_TABLE[k + 1] - T_TABLE[k]) * f;
}

/** Transmitted fraction past one obstacle (offset `o`, top `t` above grade) for a point `d` m from the
 * cell's line (perpendicular), `rh` m from the cell (horizontal), `dz` above grade. The ray from the cell
 * crosses the obstacle line at o/d of its length. 1 when the point sees over it or the obstacle is not
 * between them. */
export function obstacleTransmission(o: number, t: number, d: number, rh: number, dz: number, hs: number = HS): number {
  if (!(o > 0) || o >= d) return 1;
  const f = o / d;
  if (t <= hs + (dz - hs) * f) return 1;
  const xo = rh * f;
  const z = Math.sqrt(xo * xo + (t - hs) ** 2) + Math.sqrt((rh - xo) ** 2 + (dz - t) ** 2) - Math.sqrt(rh * rh + (dz - hs) ** 2);
  return transmission(z);
}

// ---- propagation: 10^(−U/10), cached per ground class -----------------------------------------

const L_STEP = 0.5, L_MAX = 1100, L_ROWS = 18;
const SOURCE_OFFSET = NOISE.sourceOffset, SOURCE_HEIGHT = NOISE.sourceHeight, HS = NOISE.barrierSourceHeight;
const linCache = new Map<string, { table: Float64Array; cols: number; rows: number }>();
function linTable(ground: 'hard' | 'mixed') {
  let c = linCache.get(ground);
  if (!c) {
    const cols = Math.ceil(L_MAX / L_STEP) + 1, rows = ground === 'hard' ? 1 : L_ROWS;
    const table = new Float64Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) table[j * cols + i] = dm.pow(10, -propagationLoss(i * L_STEP, 1.5 + j * 0.5, ground) / 10);
    linCache.set(ground, c = { table, cols, rows });
  }
  return c;
}

/** Ground loss of an infinite line at perpendicular distance `d` from the axis, point `dz` above grade,
 * as energy fraction (the manual's U, with the calibrated slant-range extension of road-noise.ts). */
export function lineTransfer(d: number, dz: number, ground: 'hard' | 'mixed' = NOISE.ground,
  lin = linTable(ground), offset = SOURCE_OFFSET): number {
  const du = d - offset, dv = dz - SOURCE_HEIGHT, slant = Math.sqrt(du * du + dv * dv);
  const heff = Math.abs(dv) + SOURCE_HEIGHT;
  if (slant < 8.5 || slant >= L_MAX - 1) return dm.pow(10, -propagationLoss(slant, heff, ground) / 10);
  const table = lin.table, cols = lin.cols, rows = lin.rows;
  const x = slant / L_STEP, i = Math.floor(x), t = x - i;
  if (rows === 1) return table[i] + (table[i + 1] - table[i]) * t;
  const y = Math.max(0, Math.min(rows - 1, (heff - 1.5) / 0.5)), j = Math.min(rows - 2, Math.floor(y)), u = y - j;
  const a = j * cols + i, b = a + cols;
  return (table[a] * (1 - t) + table[a + 1] * t) * (1 - u) + (table[b] * (1 - t) + table[b + 1] * t) * u;
}

// ---- field: cells grouped for far-away summation -----------------------------------------------

/** The whole road is summed: no truncation (a cut-off would only ever under-estimate). Cells one by one
 * within NEAR of the point, straight 8-cell chunks (≈ 80 m) beyond it, straight 32-cell groups beyond FAR;
 * beyond NOISE_REACH a group counts unscreened (louder than it is: walls and edges 3 km away are ignored,
 * never credited). Accuracy of the grouping against the cell-by-cell sum: research/36 §2. */
const CHUNK = 4, GROUP = 32, NEAR = 160, FAR = 1000, SAMPLE = 8;
export const NOISE_REACH = 3000;

interface Segments { n: number; i0: Int32Array; i1: Int32Array; cx: Float64Array; cy: Float64Array; ux: Float64Array; uy: Float64Array; half: Float64Array; radius: Float64Array; z: Float64Array;
  /** per side (L = 0, R = 1), stride 8: total length, open (not shielded) length, the highest edge top above
   * the barrier source (relative to its own cell's grade), the nearest edge offset, the highest grade, the
   * farthest edge offset */
  edges: Float64Array;
  /** length-weighted mean emission weight of the open cells (1 without weights) */
  w: Float64Array;
  /** total cell length, m */
  len: Float64Array }

function segments(src: AcousticSource, size: number): Segments {
  const m = Math.ceil(src.n / size);
  const s: Segments = { n: m, i0: new Int32Array(m), i1: new Int32Array(m), cx: new Float64Array(m), cy: new Float64Array(m),
    ux: new Float64Array(m), uy: new Float64Array(m), half: new Float64Array(m), radius: new Float64Array(m), z: new Float64Array(m),
    edges: new Float64Array(m * 16), w: new Float64Array(m).fill(1), len: new Float64Array(m) };
  for (let c = 0; c < m; c++) {
    const i0 = c * size, i1 = Math.min(src.n - 1, i0 + size - 1);
    const ax = src.x[i0] - src.tx[i0] * src.len[i0] / 2, ay = src.y[i0] - src.ty[i0] * src.len[i0] / 2;
    const bx = src.x[i1] + src.tx[i1] * src.len[i1] / 2, by = src.y[i1] + src.ty[i1] * src.len[i1] / 2;
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    s.i0[c] = i0; s.i1[c] = i1; s.cx[c] = (ax + bx) / 2; s.cy[c] = (ay + by) / 2;
    s.ux[c] = (bx - ax) / L; s.uy[c] = (by - ay) / L; s.half[c] = L / 2;
    let r = L / 2, z = 0, w = 0;
    for (let i = i0; i <= i1; i++) {
      r = Math.max(r, Math.hypot(src.x[i] - s.cx[c], src.y[i] - s.cy[c]) + src.len[i] / 2);
      z += src.grade[i] * src.len[i]; w += src.len[i];
    }
    s.radius[c] = r; s.z[c] = w > 0 ? z / w : src.grade[i0]; s.len[c] = w;
    if (src.weight) { let a = 0; for (let i = i0; i <= i1; i++) a += src.weight[i] * src.len[i]; s.w[c] = w > 0 ? a / w : 1; }
    for (let side = 0; side < 2; side++) {
      const sc = side ? src.R : src.L, e = s.edges, b = (c * 2 + side) * 8;
      e[b + 2] = -Infinity; e[b + 3] = Infinity; e[b + 4] = -Infinity; e[b + 5] = -Infinity;
      for (let i = i0; i <= i1; i++) {
        const l = src.len[i];
        e[b] += l;
        if (sc.shield[i]) continue;
        e[b + 1] += l;
        e[b + 4] = Math.max(e[b + 4], src.grade[i]);
        const eo = sc.edgeOff[i];
        if (eo === eo) { e[b + 2] = Math.max(e[b + 2], sc.edgeTop[i] - src.sourceHeight); e[b + 3] = Math.min(e[b + 3], eo); e[b + 5] = Math.max(e[b + 5], eo); }
      }
    }
  }
  return s;
}

export interface NoiseField {
  src: AcousticSource;
  ground: 'hard' | 'mixed';
  lin: { table: Float64Array; cols: number; rows: number };
  chunks: Segments;
  groups: Segments;
}

export function noiseField(src: AcousticSource, ground: 'hard' | 'mixed' = NOISE.ground): NoiseField {
  return { src, ground, lin: linTable(ground), chunks: segments(src, CHUNK), groups: segments(src, GROUP) };
}

/** Per-point accumulators for `pointTransfer`, one entry per receiver height. Energies are fractions of
 * the source's reference energy 10^(Y/10) (multiply by the period's to get day / night energy). */
export interface Transfer {
  /** no screening at all (the road on open ground) */
  raw: Float64Array;
  /** cut / crown / deck edges only */
  earth: Float64Array;
  /** edges and the walls passed in */
  screened: Float64Array;
}
export function transferBuffers(heights: number): Transfer {
  return { raw: new Float64Array(heights), earth: new Float64Array(heights), screened: new Float64Array(heights) };
}

/** One cell's contribution, for breakdowns and wall decisions: cell index (or a far segment's first cell),
 * side the point is on, perpendicular / horizontal distance, its angle weight α/π times U-transfer
 * (per height, before screening) — screening fractions per height follow from `cellScreen`. */
export interface CellVisit {
  k: number; last: number; left: boolean; d: number; rh: number;
}

const scratch = { d: 0, rh: 0, w: 0, left: false };

/** geometry of segment (centre cx,cy, unit ux,uy, half length h) seen from (px,py): sets scratch.d (perp),
 * scratch.rh (to the centre), scratch.w = α/π, scratch.left */
function segmentGeometry(px: number, py: number, cx: number, cy: number, ux: number, uy: number, h: number) {
  const dx = px - cx, dy = py - cy;
  const a = dx * ux + dy * uy, c = -dx * uy + dy * ux;
  const d = Math.max(0.5, Math.abs(c));
  const den = d * d + a * a - h * h, num = 2 * h * d;
  // α = atan((h − a)/d) + atan((h + a)/d) = atan2(2hd, d² + a² − h²); series for small angles
  let alpha: number;
  if (den > 0 && num < 0.2 * den) { const x = num / den, x2 = x * x; alpha = x * (1 - x2 / 3 + x2 * x2 / 5); }
  else alpha = dm.atan2(num, den);
  scratch.d = d; scratch.rh = Math.sqrt(a * a + d * d); scratch.w = alpha / Math.PI; scratch.left = c >= 0;
}

/** Screened fraction of cell `i` (side `s`) for a point (d, rh, dz): best single obstacle. */
/** A wall of `wall` m at cell i on top of its edge transmission `te`: the better single obstacle. */
function wallScreen(s: SideScreen, i: number, wall: number, d: number, rh: number, dz: number, hs: number, te: number): number {
  const w = obstacleTransmission(s.wallOff[i], s.wallFoot[i] + wall, d, rh, dz, hs);
  return w < te ? w : te;
}

function cellScreen(s: SideScreen, i: number, wall: number, d: number, rh: number, dz: number, edgeOnly: boolean, hs: number): number {
  let t = 1;
  const eo = s.edgeOff[i];
  if (eo === eo) t = obstacleTransmission(eo, s.edgeTop[i], d, rh, dz, hs);
  if (!edgeOnly && wall > 0) {
    const w = obstacleTransmission(s.wallOff[i], s.wallFoot[i] + wall, d, rh, dz, hs);
    if (w < t) t = w;
  }
  return t;
}

/**
 * Energy transfer from the whole source to a point (px, py) at absolute elevations `z[]` (one per storey),
 * accumulated into `out` (cleared first). `wallL/R` = built wall heights per station (0 = none).
 * Cells [w0, w1] (and the chunks they touch) are always summed one by one — the same arithmetic as
 * `cellOptions` — or left out entirely when `skip` (the caller adds them itself). `visit` sees every
 * near cell with its per-height raw / screened contributions (for breakdowns).
 */
export function pointTransfer(f: NoiseField, px: number, py: number, z: ArrayLike<number>,
  wallL: ArrayLike<number> | null, wallR: ArrayLike<number> | null, out: Transfer,
  w0 = -1, w1 = -2, skip = false, visit?: (k: number, left: boolean, d: number, rh: number, raw: Float64Array, screened: Float64Array) => void): void {
  const src = f.src, H = z.length, ground = f.ground, lin = f.lin;
  out.raw.fill(0); out.earth.fill(0); out.screened.fill(0);
  const rawK = visit ? new Float64Array(H) : null, scrK = visit ? new Float64Array(H) : null;
  const G = f.groups, C = f.chunks;
  for (let g = 0; g < G.n; g++) {
    const gx = px - G.cx[g], gy = py - G.cy[g], gd = Math.sqrt(gx * gx + gy * gy);
    const gi0 = G.i0[g], gi1 = G.i1[g];
    if (gd - G.radius[g] > NOISE_REACH && !(w1 >= gi0 && w0 <= gi1)) { farOpen(f, G, g, px, py, z, out); continue; }
    if (gd - G.radius[g] > FAR && !visit && !(w1 >= gi0 && w0 <= gi1)) { far(f, G, g, px, py, z, wallL, wallR, out); continue; }
    for (let c = Math.floor(gi0 / CHUNK); c <= Math.floor(gi1 / CHUNK) && c < C.n; c++) {
      const cx = px - C.cx[c], cy = py - C.cy[c], cd = Math.sqrt(cx * cx + cy * cy);
      const ci0 = C.i0[c], ci1 = C.i1[c];
      const exact = w1 >= ci0 && w0 <= ci1;
      if (!exact && cd - C.radius[c] > NOISE_REACH) { farOpen(f, C, c, px, py, z, out); continue; }
      if (!exact && !visit && cd - C.radius[c] > NEAR) { far(f, C, c, px, py, z, wallL, wallR, out); continue; }
      for (let i = ci0; i <= ci1; i++) {
        if (skip && i >= w0 && i <= w1) continue;
        segmentGeometry(px, py, src.x[i], src.y[i], src.tx[i], src.ty[i], src.len[i] / 2);
        const left = scratch.left, d = scratch.d, rh = scratch.rh, w = scratch.w;
        const s = left ? src.L : src.R;
        if (s.shield[i]) continue;
        const open = rh > NOISE_REACH, wall = open ? 0 : (left ? wallL : wallR)?.[i] ?? 0;
        for (let k = 0; k < H; k++) {
          const dz = z[k] - src.grade[i];
          const base = w * lineTransfer(d, dz, ground, lin, src.laneOffset) * (src.weight ? src.weight[i] : 1);
          const te = open ? 1 : cellScreen(s, i, 0, d, rh, dz, true, src.sourceHeight);
          const ts = wall > 0 ? wallScreen(s, i, wall, d, rh, dz, src.sourceHeight, te) : te;
          out.raw[k] += base; out.earth[k] += base * te; out.screened[k] += base * ts;
          if (rawK) { rawK[k] = base; scrK![k] = base * ts; }
        }
        if (visit) visit(i, left, d, rh, rawK!, scrK!);
      }
    }
  }
}

const deltaOld = transferBuffers(16), deltaNew = transferBuffers(16);
/**
 * Change of `out.screened` when the walls go from `oldL/R` to `newL/R` at the cells flagged in `changed`:
 * the same near / far arithmetic as `pointTransfer` with the same exact window, touching only chunks that
 * contain a changed cell (cells in [w0, w1] left out when `skip`). raw / earth do not depend on walls.
 */
export function transferDelta(f: NoiseField, px: number, py: number, z: ArrayLike<number>,
  oldL: ArrayLike<number>, oldR: ArrayLike<number>, newL: ArrayLike<number>, newR: ArrayLike<number>,
  changed: Uint8Array, chunkChanged: Uint8Array, out: Transfer, w0 = -1, w1 = -2, skip = false): void {
  const src = f.src, H = z.length, ground = f.ground, lin = f.lin, C = f.chunks, G = f.groups;
  const screened = out.screened;
  const farDelta = (S: Segments, c: number) => {
    const a = deltaOld, b = deltaNew;
    for (let k = 0; k < H; k++) { a.raw[k] = a.earth[k] = a.screened[k] = b.raw[k] = b.earth[k] = b.screened[k] = 0; }
    far(f, S, c, px, py, z, oldL, oldR, a); far(f, S, c, px, py, z, newL, newR, b);
    for (let k = 0; k < H; k++) screened[k] += b.screened[k] - a.screened[k];
  };
  for (let g = 0; g < G.n; g++) {
    const c0 = Math.floor(G.i0[g] / CHUNK), c1 = Math.min(C.n - 1, Math.floor(G.i1[g] / CHUNK));
    let any = false;
    for (let c = c0; c <= c1; c++) if (chunkChanged[c]) { any = true; break; }
    if (!any) continue;
    const gx = px - G.cx[g], gy = py - G.cy[g], gd = Math.sqrt(gx * gx + gy * gy);
    const exactG = w1 >= G.i0[g] && w0 <= G.i1[g];
    if (gd - G.radius[g] > NOISE_REACH && !exactG) continue; // counted unscreened: walls change nothing
    if (gd - G.radius[g] > FAR && !exactG) { farDelta(G, g); continue; }
    for (let c = c0; c <= c1; c++) {
      if (!chunkChanged[c]) continue;
      const cx = px - C.cx[c], cy = py - C.cy[c], cd = Math.sqrt(cx * cx + cy * cy);
      const ci0 = C.i0[c], ci1 = C.i1[c];
      const exact = w1 >= ci0 && w0 <= ci1;
      if (!exact && cd - C.radius[c] > NOISE_REACH) continue;
      if (!exact && cd - C.radius[c] > NEAR) { farDelta(C, c); continue; }
      for (let i = ci0; i <= ci1; i++) {
        if (!changed[i] || (skip && i >= w0 && i <= w1)) continue;
        segmentGeometry(px, py, src.x[i], src.y[i], src.tx[i], src.ty[i], src.len[i] / 2);
        const left = scratch.left, d = scratch.d, rh = scratch.rh, w = scratch.w;
        if (rh > NOISE_REACH) continue; // unscreened there
        const s = left ? src.L : src.R;
        if (s.shield[i]) continue;
        const wo = (left ? oldL : oldR)[i], wn = (left ? newL : newR)[i];
        if (wo === wn) continue;
        for (let k = 0; k < H; k++) {
          const dz = z[k] - src.grade[i];
          const base = w * lineTransfer(d, dz, ground, lin, src.laneOffset) * (src.weight ? src.weight[i] : 1);
          const te = cellScreen(s, i, 0, d, rh, dz, true, src.sourceHeight);
          const to = wo > 0 ? wallScreen(s, i, wo, d, rh, dz, src.sourceHeight, te) : te;
          const tn = wn > 0 ? wallScreen(s, i, wn, d, rh, dz, src.sourceHeight, te) : te;
          screened[k] += base * (tn - to);
        }
      }
    }
  }
}

/** Per chunk: does it contain a flagged cell? */
export function chunkFlags(f: NoiseField, flag: ArrayLike<number>): Uint8Array {
  const C = f.chunks, out = new Uint8Array(C.n);
  for (let c = 0; c < C.n; c++) for (let i = C.i0[c]; i <= C.i1[c]; i++) if (flag[i]) { out[c] = 1; break; }
  return out;
}

/** A far straight segment (4-cell chunk beyond NEAR, 32-cell group beyond FAR) as one for its geometry
 * (angle, distance, U), each cell with its own screening seen along that geometry. A whole segment is
 * open at once when no edge can rise above any of its cells' sightlines (and no wall stands there). */
function far(f: NoiseField, S: Segments, c: number, px: number, py: number, z: ArrayLike<number>,
  wallL: ArrayLike<number> | null, wallR: ArrayLike<number> | null, out: Transfer) {
  const src = f.src, H = z.length, hs = src.sourceHeight;
  segmentGeometry(px, py, S.cx[c], S.cy[c], S.ux[c], S.uy[c], S.half[c]);
  const left = scratch.left, d = scratch.d, rh = scratch.rh, w = scratch.w;
  const s = left ? src.L : src.R, walls = left ? wallL : wallR;
  const i0 = S.i0[c], i1 = S.i1[c];
  const e = S.edges, eb = (c * 2 + (left ? 0 : 1)) * 8;
  const total = e[eb], open = e[eb + 1];
  if (!(total > 0) || !(open > 0)) return;
  const maxRel = e[eb + 2], minOff = e[eb + 3], maxGrade = e[eb + 4], maxOff = e[eb + 5];
  let walled = false;
  if (walls) for (let i = i0; i <= i1 && !walled; i++) if (walls[i] > 0 && !s.shield[i]) walled = true;
  const step = S === f.groups ? SAMPLE : 1;
  for (let k = 0; k < H; k++) {
    const base = w * lineTransfer(d, z[k] - S.z[c], f.ground, f.lin, src.laneOffset) * S.w[c] / total;
    // every cell's sightline at its nearest edge clears the highest edge top: nothing screens
    const clear = z[k] - maxGrade - hs;
    // (z − g − hs)·o/d ≥ clear·o/d ≥ clear·(minOff or, below the source, maxOff)/d for every cell
    if (!walled && (maxRel === -Infinity || maxRel <= clear * (clear >= 0 ? minOff : maxOff) / d)) {
      const q = base * open;
      out.raw[k] += q; out.earth[k] += q; out.screened[k] += q;
      continue;
    }
    // a group (≥ 1 km away) samples every SAMPLE-th cell for its screening, each standing for its neighbours
    let te = 0, ts = 0, seen = 0;
    for (let i = i0 + (step >> 1); i <= i1; i += step) {
      if (s.shield[i]) continue;
      const l = src.len[i], dz = z[k] - src.grade[i], t1 = cellScreen(s, i, 0, d, rh, dz, true, hs), wall = walls ? walls[i] : 0;
      seen += l; te += l * t1; ts += l * (wall > 0 ? wallScreen(s, i, wall, d, rh, dz, hs, t1) : t1);
    }
    if (!(seen > 0)) { for (let i = i0; i <= i1; i++) if (!s.shield[i]) { const l = src.len[i], dz = z[k] - src.grade[i], t1 = cellScreen(s, i, 0, d, rh, dz, true, hs), wall = walls ? walls[i] : 0; seen += l; te += l * t1; ts += l * (wall > 0 ? wallScreen(s, i, wall, d, rh, dz, hs, t1) : t1); } }
    const scale = open / seen;
    out.raw[k] += base * open; out.earth[k] += base * te * scale; out.screened[k] += base * ts * scale;
  }
}

/** Open-road energy (no screening at all) at a point, per height: cells within NEAR one by one, chunks and
 * groups beyond as straight segments. An upper bound of every screened level up to the segment geometry's
 * small error (no obstacle is evaluated: cheap enough for a first look at every house near the road). */
export function openTransfer(f: NoiseField, px: number, py: number, z: ArrayLike<number>, out: Float64Array): void {
  const src = f.src, H = z.length, G = f.groups, C = f.chunks;
  out.fill(0);
  const add = (S: Segments, c: number) => {
    segmentGeometry(px, py, S.cx[c], S.cy[c], S.ux[c], S.uy[c], S.half[c]);
    const e = S.edges, eb = (c * 2 + (scratch.left ? 0 : 1)) * 8, total = e[eb], open = e[eb + 1];
    if (!(total > 0) || !(open > 0)) return;
    const d = scratch.d, w = scratch.w * S.w[c] * open / total;
    for (let k = 0; k < H; k++) out[k] += w * lineTransfer(d, z[k] - S.z[c], f.ground, f.lin, src.laneOffset);
  };
  for (let g = 0; g < G.n; g++) {
    const gx = px - G.cx[g], gy = py - G.cy[g], gd = Math.sqrt(gx * gx + gy * gy);
    // unscreened, only the geometry is grouped: whole 320 m groups ≥ 3 lengths away, 40 m chunks ≥ 60 m away
    if (gd - G.radius[g] > 3 * 2 * G.half[g]) { add(G, g); continue; }
    for (let c = Math.floor(G.i0[g] / CHUNK); c <= Math.floor(G.i1[g] / CHUNK) && c < C.n; c++) {
      const cx = px - C.cx[c], cy = py - C.cy[c];
      if (Math.sqrt(cx * cx + cy * cy) - C.radius[c] > 60) { add(C, c); continue; }
      for (let i = C.i0[c]; i <= C.i1[c]; i++) {
        const s = src.L.shield[i] && src.R.shield[i];
        segmentGeometry(px, py, src.x[i], src.y[i], src.tx[i], src.ty[i], src.len[i] / 2);
        if (s || (scratch.left ? src.L : src.R).shield[i]) continue;
        const d = scratch.d, w = scratch.w * (src.weight ? src.weight[i] : 1);
        for (let k = 0; k < H; k++) out[k] += w * lineTransfer(d, z[k] - src.grade[i], f.ground, f.lin, src.laneOffset);
      }
    }
  }
}

/**
 * A rigorous upper bound of the open-road energy at a point, from segment bounding circles only: a cell of
 * length l whose centre is r away adds at most l·M/(π (r − l/2)²), M = max_d d·10^(−U(d)/10) (its angle
 * α ≤ l·d/(r − l/2)², research/36 §2), for any point within `spread` of (px, py). Infinity when it may lie
 * within a segment's reach.
 */
export function openBound(f: NoiseField, px: number, py: number, M: number, spread = 0): number {
  const G = f.groups, C = f.chunks;
  let q = 0;
  for (let g = 0; g < G.n; g++) {
    const gx = px - G.cx[g], gy = py - G.cy[g], r = Math.sqrt(gx * gx + gy * gy) - G.radius[g] - 5 - spread;
    if (r > G.radius[g]) { q += G.len[g] / (r * r); continue; }
    for (let c = Math.floor(G.i0[g] / CHUNK); c <= Math.floor(G.i1[g] / CHUNK) && c < C.n; c++) {
      const cx = px - C.cx[c], cy = py - C.cy[c], rc = Math.sqrt(cx * cx + cy * cy) - C.radius[c] - 5 - spread;
      if (!(rc > 0)) return Infinity;
      q += C.len[c] / (rc * rc);
    }
  }
  return q * M / Math.PI;
}

/** A segment beyond NOISE_REACH: unscreened (an upper bound), shared geometry. */
function farOpen(f: NoiseField, S: Segments, c: number, px: number, py: number, z: ArrayLike<number>, out: Transfer) {
  const src = f.src, H = z.length;
  segmentGeometry(px, py, S.cx[c], S.cy[c], S.ux[c], S.uy[c], S.half[c]);
  const e = S.edges, eb = (c * 2 + (scratch.left ? 0 : 1)) * 8, total = e[eb], open = e[eb + 1];
  if (!(total > 0) || !(open > 0)) return;
  const d = scratch.d, w = scratch.w * S.w[c] * open / total;
  for (let k = 0; k < H; k++) {
    const q = w * lineTransfer(d, z[k] - S.z[c], f.ground, f.lin, src.laneOffset);
    out.raw[k] += q; out.earth[k] += q; out.screened[k] += q;
  }
}


/**
 * Per-cell decision data for one point over cells i0…i1: energy per storey with each cell's actual screening
 * on the point's side of that cell — option 0: its edge plus any `fixed` wall there (the player's: NaN =
 * free, 0 = removed), option o ≥ 1: a wall `heights[o − 1]` (free cells only) — `opt(o)[c * H + k]`, computed
 * lazily per option. `side[c]` = 1 where the point is left of cell c. The same arithmetic as
 * `pointTransfer`'s cell-by-cell window, so sums of these equal its sums.
 */
export interface CellOptions {
  i0: number; i1: number; H: number; heights: readonly number[];
  /** a wall can be put here (not shielded, not an opening, not the player's) */
  wallable: Uint8Array;
  side: Uint8Array;
  /** open-ground energy / with the edge only, per cell and storey */
  raw: Float64Array; edge: Float64Array;
  opt(o: number): Float64Array;
}
export function cellOptions(f: NoiseField, px: number, py: number, z: ArrayLike<number>, i0: number, i1: number,
  heights: readonly number[], fixedL?: ArrayLike<number>, fixedR?: ArrayLike<number>): CellOptions {
  const src = f.src, H = z.length, m = i1 - i0 + 1, hs = src.sourceHeight;
  // one slab each: these are allocated for every house near the road
  const slab = new Float64Array(m * (4 * H + 2)), flags = new Uint8Array(2 * m);
  const raw = slab.subarray(0, m * H), edge = slab.subarray(m * H, 2 * m * H), te = slab.subarray(2 * m * H, 3 * m * H);
  const base0 = slab.subarray(3 * m * H, 4 * m * H), dd = slab.subarray(4 * m * H, 4 * m * H + m), rr = slab.subarray(4 * m * H + m);
  const wallable = flags.subarray(0, m), side = flags.subarray(m);
  for (let i = i0; i <= i1; i++) {
    segmentGeometry(px, py, src.x[i], src.y[i], src.tx[i], src.ty[i], src.len[i] / 2);
    const sl = scratch.left, d = scratch.d, rh = scratch.rh, w = scratch.w;
    const s = sl ? src.L : src.R, c = i - i0;
    side[c] = sl ? 1 : 0;
    if (s.shield[i]) continue;
    dd[c] = d; rr[c] = rh;
    const open = rh > NOISE_REACH, fixed = open ? NaN : (sl ? fixedL : fixedR)?.[i] ?? NaN, isFixed = fixed === fixed;
    wallable[c] = !s.gap[i] && !isFixed && !open ? 1 : 0;
    for (let k = 0; k < H; k++) {
      const dz = z[k] - src.grade[i], q = c * H + k;
      const base = w * lineTransfer(d, dz, f.ground, f.lin, src.laneOffset) * (src.weight ? src.weight[i] : 1);
      const t = open ? 1 : cellScreen(s, i, 0, d, rh, dz, true, hs);
      raw[q] = base; te[q] = t; edge[q] = base * t;
      base0[q] = isFixed && fixed > 0 ? base * wallScreen(s, i, fixed, d, rh, dz, hs, t) : base * t;
    }
  }
  const cache: Float64Array[] = [base0];
  const opt = (o: number): Float64Array => {
    let e = cache[o];
    if (e) return e;
    e = base0.slice();
    const h = heights[o - 1];
    for (let c = 0; c < m; c++) {
      if (!wallable[c]) continue;
      const i = i0 + c, s = side[c] ? src.L : src.R;
      for (let k = 0; k < H; k++) { const q = c * H + k; e[q] = raw[q] * wallScreen(s, i, h, dd[c], rr[c], z[k] - src.grade[i], hs, te[q]); }
    }
    return (cache[o] = e);
  };
  return { i0, i1, H, heights, wallable, side, raw, edge, opt };
}
