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
import { BUILDING_KINDS, NOISE } from './data/urban';
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
  /** 1 = the road's own crown / deck edge, seen from the near lane (see cellScreen) */
  edgeLane: Uint8Array;
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
  /** the limits its levels are judged against (absent: the road's NOISE limits; railway: new-line 60 / 55) */
  limits?: { dayDb: number; nightDb: number };
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
  return { shield: new Uint8Array(n), edgeOff, edgeTop: new Float64Array(n), edgeLane: new Uint8Array(n), wallOff: new Float64Array(n),
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
const T_STEP = 0.005, T_MAX = Math.sqrt(60), T_FLOOR = dm.pow(10, -2.4);
const T_TABLE = (() => {
  const m = Math.ceil(T_MAX / T_STEP) + 2, t = new Float64Array(m);
  for (let k = 0; k < m; k++) t[k] = dm.pow(10, -barrierDb((k * T_STEP) * (k * T_STEP)) / 10);
  return t;
})();
function transmission(z: number): number {
  const u = Math.sqrt(Math.max(0, z)) / T_STEP;
  if (u >= T_MAX / T_STEP) return T_FLOOR;
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
  const a = t - hs, b = rh - xo, c = dz - t, e = dz - hs;
  const z = Math.sqrt(xo * xo + a * a) + Math.sqrt(b * b + c * c) - Math.sqrt(rh * rh + e * e);
  return transmission(z);
}

// ---- propagation: 10^(−U/10), cached per ground class -----------------------------------------

const L_STEP = 0.5, L_MAX = 1100, L_ROWS = 18;
const SOURCE_OFFSET = NOISE.sourceOffset, SOURCE_HEIGHT = NOISE.sourceHeight, HS = NOISE.barrierSourceHeight;
const linCache = new Map<string, { table: Float64Array; cols: number; rows: number }>();
const LIN_1000 = dm.pow(10, -propagationLoss(1000, 1.5, 'hard') / 10);
/** How a source's line energy falls with distance: the road manual's U over hard or mixed ground, or a
 * railway's spherical spreading along the line (rail-noise.ts: 10^(−loss/10) = 1 / max(1 m, r)). */
export type Propagation = 'hard' | 'mixed' | 'rail';
function linTable(propagation: Propagation) {
  const ground = propagation === 'mixed' ? 'mixed' : 'hard';
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
export function lineTransfer(d: number, dz: number, ground: Propagation = NOISE.ground,
  lin = linTable(ground), offset = SOURCE_OFFSET): number {
  return transfer(d, dz, ground, lin, offset);
}
/** lineTransfer's hot path, small enough to be inlined into the sums (hard ground from the table) */
function transfer(d: number, dz: number, ground: Propagation, lin: { table: Float64Array; cols: number; rows: number }, offset: number): number {
  const du = d - offset, dv = dz - SOURCE_HEIGHT, slant = Math.sqrt(du * du + dv * dv);
  if (ground === 'rail') return 1 / Math.max(1, slant);
  if (ground === 'hard') {
    // below 8 m the manual's 10 log(r/8) (clamped at 3.75 m): 10^(−U/10) = 8/r exactly
    if (slant < 8) return 8 / Math.max(3.75, slant);
    // beyond 1 km it continues as 10 log(r/1000) over Uo(1000): 10^(−U/10) = 10^(−Uo(1000)/10)·1000/r
    if (slant > 1000) return LIN_1000 * 1000 / slant;
    if (slant >= 8.5) {
      const table = lin.table, x = slant / L_STEP, i = Math.floor(x), t = x - i;
      return table[i] + (table[i + 1] - table[i]) * t;
    }
  }
  return transferSlow(slant, dv, ground, lin);
}
function transferSlow(slant: number, dv: number, ground: Propagation, lin: { table: Float64Array; cols: number; rows: number }): number {
  const heff = Math.abs(dv) + SOURCE_HEIGHT;
  if (slant < 8.5 || slant >= L_MAX - 1) return dm.pow(10, -propagationLoss(slant, heff, ground === 'mixed' ? 'mixed' : 'hard') / 10);
  const table = lin.table, cols = lin.cols, rows = lin.rows;
  const x = slant / L_STEP, i = Math.floor(x), t = x - i;
  if (rows === 1) return table[i] + (table[i + 1] - table[i]) * t;
  const y = Math.max(0, Math.min(rows - 1, (heff - 1.5) / 0.5)), j = Math.min(rows - 2, Math.floor(y)), u = y - j;
  const a = j * cols + i, b = a + cols;
  return (table[a] * (1 - t) + table[a + 1] * t) * (1 - u) + (table[b] * (1 - t) + table[b + 1] * t) * u;
}

// ---- field: cells grouped for far-away summation -----------------------------------------------

/** The whole road is summed: no truncation (a cut-off would only ever under-estimate). Cells one by one
 * within NEAR of the point; beyond, a binary tree of straight segments (4, 8, 16, … cells), each taken as
 * one once its bounding circle's diameter is at most THETA × its distance (40 m chunks from 160 m, 80 m
 * from 250 m, 320 m from 1 km), its edges and walls sampled at two cells; beyond NOISE_REACH a segment counts
 * unscreened (louder than it is: walls and edges 3 km away are ignored, never credited), taken whole once
 * its diameter is at most its distance. Accuracy of the grouping against the cell-by-cell sum:
 * research/36 §2. */
/** the most storeys a dwelling can have (buildingLevels caps tags): every per-storey buffer holds this many */
export const MAX_STOREYS = Math.max(...BUILDING_KINDS.map(k => k.maxLevels));
const CHUNK = 4, NEAR = 160, THETA = 0.32, THETA_OPEN = 1;
/** the finer grouping (Sum 1): 4-cell chunks one by one, segments taken whole only from 1 / THETA_FINE of their
 * diameter away, beyond NOISE_REACH from 1 / THETA_OPEN_FINE */
const THETA_FINE = 0.08, THETA_OPEN_FINE = 0.16;
/** How far segments are summed: 0 = grouped (THETA), 1 = finer (THETA_FINE), 2 = every cell one by one. */
export type Sum = 0 | 1 | 2;
/** a segment is taken as one only while its cells' length is within this factor of its chord (a bend of
 * ≈ 28° at most): a curled-up stretch is not a short straight line */
const STRAIGHT = 1.01;
const straight = (S: Segments, c: number) => S.len[c] <= STRAIGHT * 2 * S.half[c];
export const NOISE_REACH = 3000;
/** The grouped sums (Sum 0, 1) differ from the cell-by-cell ones (Sum 2) by at most this fraction of their own
 * value, for any window and walls, and with transferDelta against the sum with the new walls. Measured on the
 * saved designs at worst: 0.224 grouped, 0.046 finer (research/36 §2); pinned by tests/noise-stages.test.ts.
 * noiseOutcome redoes a house more finely wherever a decision lies within this of its threshold. */
export const FAR_ERROR: readonly [number, number, number] = [0.3, 0.07, 0];

interface Segments { n: number; i0: Int32Array; i1: Int32Array; cx: Float64Array; cy: Float64Array; ux: Float64Array; uy: Float64Array; half: Float64Array; radius: Float64Array; z: Float64Array;
  /** per side (L = 0, R = 1), stride 8: total length, open (not shielded) length, the highest edge top above
   * the barrier source (relative to its own cell's grade), the nearest edge offset, the highest grade, the
   * farthest edge offset */
  edges: Float64Array;
  /** length-weighted mean emission weight of the cells (1 without weights) */
  w: Float64Array;
  /** total cell length, m */
  len: Float64Array;
  /** cells between screening samples (far segments): two samples per segment */
  step: number;
  /** bounds over its cells: |t − u| of their tangents against the chord's direction, and the distance of
   * their centres from the chord's line (openBound) */
  dev: Float64Array; lat: Float64Array }

function allocSegments(m: number, step: number): Segments {
  return { n: m, i0: new Int32Array(m), i1: new Int32Array(m), cx: new Float64Array(m), cy: new Float64Array(m),
    ux: new Float64Array(m), uy: new Float64Array(m), half: new Float64Array(m), radius: new Float64Array(m), z: new Float64Array(m),
    edges: new Float64Array(m * 16), w: new Float64Array(m).fill(1), len: new Float64Array(m), step,
    dev: new Float64Array(m), lat: new Float64Array(m) };
}
/** the straight chord of cells i0…i1, from the first cell's start to the last one's end */
function chord(src: AcousticSource, s: Segments, c: number, i0: number, i1: number) {
  const ax = src.x[i0] - src.tx[i0] * src.len[i0] / 2, ay = src.y[i0] - src.ty[i0] * src.len[i0] / 2;
  const bx = src.x[i1] + src.tx[i1] * src.len[i1] / 2, by = src.y[i1] + src.ty[i1] * src.len[i1] / 2;
  const L = Math.hypot(bx - ax, by - ay) || 1e-9;
  s.i0[c] = i0; s.i1[c] = i1; s.cx[c] = (ax + bx) / 2; s.cy[c] = (ay + by) / 2;
  s.ux[c] = (bx - ax) / L; s.uy[c] = (by - ay) / L; s.half[c] = L / 2;
}

function segments(src: AcousticSource, size: number): Segments {
  const m = Math.ceil(src.n / size);
  const s = allocSegments(m, 2);
  for (let c = 0; c < m; c++) {
    const i0 = c * size, i1 = Math.min(src.n - 1, i0 + size - 1);
    chord(src, s, c, i0, i1);
    let r = s.half[c], z = 0, w = 0;
    for (let i = i0; i <= i1; i++) {
      const dx = src.x[i] - s.cx[c], dy = src.y[i] - s.cy[c];
      r = Math.max(r, Math.sqrt(dx * dx + dy * dy) + src.len[i] / 2);
      z += src.grade[i] * src.len[i]; w += src.len[i];
    }
    s.radius[c] = r; s.z[c] = w > 0 ? z / w : src.grade[i0]; s.len[c] = w;
    let dev = 0, lat = 0;
    for (let i = i0; i <= i1; i++) {
      const ex = src.tx[i] - s.ux[c], ey = src.ty[i] - s.uy[c];
      dev = Math.max(dev, Math.sqrt(ex * ex + ey * ey));
      lat = Math.max(lat, Math.abs(-(src.x[i] - s.cx[c]) * s.uy[c] + (src.y[i] - s.cy[c]) * s.ux[c]));
    }
    s.dev[c] = dev; s.lat[c] = lat;
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

/** The next tree level: pairs of `a`'s segments (bounding circles enclose the children's). */
function mergeLevel(src: AcousticSource, a: Segments): Segments {
  const m = Math.ceil(a.n / 2), s = allocSegments(m, a.step * 2), e = s.edges, ea = a.edges;
  for (let c = 0; c < m; c++) {
    const p = 2 * c, q = Math.min(a.n - 1, p + 1);
    chord(src, s, c, a.i0[p], a.i1[q]);
    let r = s.half[c], z = 0, w = 0, len = 0;
    for (let k = p; k <= q; k++) {
      const dx = a.cx[k] - s.cx[c], dy = a.cy[k] - s.cy[c];
      r = Math.max(r, Math.sqrt(dx * dx + dy * dy) + a.radius[k]);
      z += a.z[k] * a.len[k]; w += a.w[k] * a.len[k]; len += a.len[k];
    }
    s.radius[c] = r; s.len[c] = len; s.z[c] = len > 0 ? z / len : a.z[p]; s.w[c] = len > 0 ? w / len : 1;
    let dev = 0, lat = 0;
    for (let k = p; k <= q; k++) {
      const ex = a.ux[k] - s.ux[c], ey = a.uy[k] - s.uy[c], du = Math.sqrt(ex * ex + ey * ey);
      dev = Math.max(dev, a.dev[k] + du);
      lat = Math.max(lat, Math.abs(-(a.cx[k] - s.cx[c]) * s.uy[c] + (a.cy[k] - s.cy[c]) * s.ux[c]) + a.lat[k] + a.radius[k] * du);
    }
    s.dev[c] = dev; s.lat[c] = lat;
    for (let side = 0; side < 2; side++) {
      const b = (c * 2 + side) * 8;
      e[b + 2] = -Infinity; e[b + 3] = Infinity; e[b + 4] = -Infinity; e[b + 5] = -Infinity;
      for (let k = p; k <= q; k++) {
        const bk = (k * 2 + side) * 8;
        e[b] += ea[bk]; e[b + 1] += ea[bk + 1];
        e[b + 2] = Math.max(e[b + 2], ea[bk + 2]); e[b + 3] = Math.min(e[b + 3], ea[bk + 3]);
        e[b + 4] = Math.max(e[b + 4], ea[bk + 4]); e[b + 5] = Math.max(e[b + 5], ea[bk + 5]);
      }
    }
  }
  return s;
}

export interface NoiseField {
  src: AcousticSource;
  ground: Propagation;
  lin: { table: Float64Array; cols: number; rows: number };
  /** the segment tree: levels[0] = 4-cell chunks, each level pairs the one below, the last has one segment */
  levels: Segments[];
}

export function noiseField(src: AcousticSource, roadGround: 'hard' | 'mixed' = NOISE.ground): NoiseField {
  const ground: Propagation = src.mode === 'rail' ? 'rail' : roadGround;
  const levels = [segments(src, CHUNK)];
  while (levels[levels.length - 1].n > 1) levels.push(mergeLevel(src, levels[levels.length - 1]));
  return { src, ground, lin: linTable(ground), levels };
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

// ---- per-segment kernels -------------------------------------------------------------------------
// The hot loops pass geometry through these typed scratch arrays rather than as arguments or return values
// (doubles crossing a call boundary that is not inlined are boxed: allocation and GC per cell otherwise).

/** geometry of the segment being summed: perpendicular / horizontal distance, angle weight α/π, the
 * transformed form's weight, 1 when the point is left of it; the point (set by the walkers) */
const GEO = new Float64Array(8);
const G_D = 0, G_RH = 1, G_W = 2, G_ALT = 3, G_LEFT = 4, G_PX = 5, G_PY = 6;
/** per storey: open energy, edge transmission, the screened result */
const EN = new Float64Array(MAX_STOREYS), TE = new Float64Array(MAX_STOREYS), TS = new Float64Array(MAX_STOREYS);

/** Geometry of a straight segment (centre cx,cy, unit ux,uy, half length h) seen from the point in GEO. */
function segmentGeometry(cx: number, cy: number, ux: number, uy: number, h: number) {
  const dx = GEO[G_PX] - cx, dy = GEO[G_PY] - cy;
  const a = dx * ux + dy * uy, c = -dx * uy + dy * ux;
  const d = Math.max(0.5, Math.abs(c));
  const den = d * d + a * a - h * h, num = 2 * h * d;
  // α = atan((h − a)/d) + atan((h + a)/d) = atan2(2hd, d² + a² − h²); series for small angles
  let alpha: number;
  if (den > 0 && num < 0.2 * den) { const x = num / den, x2 = x * x; alpha = x * (1 - x2 / 3 + x2 * x2 / 5); }
  else alpha = dm.atan2(num, den);
  const rh = Math.sqrt(a * a + d * d);
  GEO[G_D] = d; GEO[G_RH] = rh; GEO[G_W] = alpha / Math.PI; GEO[G_LEFT] = c >= 0 ? 1 : 0;
  // outside its band: also the manual's §1.10.2 transformation (U at the true distance, the angle of the
  // segment seen face-on); `energy` takes the larger, so neither form can under-state a cell
  if (Math.abs(a) > h) { const x = h / rh; GEO[G_ALT] = 2 * (x < 0.1 ? x * (1 - x * x / 3) : dm.atan(x)) / Math.PI; }
  else GEO[G_ALT] = 0;
}
function cellGeometry(src: AcousticSource, i: number) { segmentGeometry(src.x[i], src.y[i], src.tx[i], src.ty[i], src.len[i] / 2); }
function nodeGeometry(S: Segments, c: number) { segmentGeometry(S.cx[c], S.cy[c], S.ux[c], S.uy[c], S.half[c]); }

/** A segment's open-road energy fraction at height dz above its grade: the in-band form (U at the
 * perpendicular distance d, true angle w·π) or, outside the band, the transformed one when larger. */
function energy(f: NoiseField, w: number, d: number, alt: number, rh: number, dz: number): number {
  const u = w * transfer(d, dz, f.ground, f.lin, f.src.laneOffset);
  // the transformed form exceeds the in-band one by more than 0.005 dB only for a line passing within
  // 12 m + 2 |dz − 0.5 m| of the point (scanned over segment, distance, offset and height: research/36 §2)
  if (!(alt > 0) || d >= 12 + 2 * Math.abs(dz - NOISE.sourceHeight)) return u;
  const t = alt * transfer(rh, dz, f.ground, f.lin, f.src.laneOffset);
  return t > u ? t : u;
}
/** EN[k] = energy of far segment c (the current geometry) at every storey: as one (`open` = false: the
 * caller scales it), or its open part with its mean emission weight. */
function nodeEnergies(f: NoiseField, z: ArrayLike<number>, S: Segments, c: number, open: boolean) {
  let w = GEO[G_W], alt = GEO[G_ALT];
  if (open) {
    const eb = (c * 2 + (GEO[G_LEFT] === 1 ? 0 : 1)) * 8, a = S.w[c], o = S.edges[eb + 1], t = S.edges[eb];
    w = w * a * o / t; alt = alt * a * o / t;
  }
  const d = GEO[G_D], rh = GEO[G_RH], g = S.z[c];
  for (let k = 0; k < z.length; k++) EN[k] = energy(f, w, d, alt, rh, z[k] - g);
}
/** EN[k] = open-road energy of cell i (the current geometry) at every storey, its weight in the angle. */
function openCellEnergies(f: NoiseField, z: ArrayLike<number>, i: number) {
  const src = f.src, wt = src.weight ? src.weight[i] : 1, w = GEO[G_W] * wt, alt = GEO[G_ALT] * wt;
  const d = GEO[G_D], rh = GEO[G_RH], g = src.grade[i];
  for (let k = 0; k < z.length; k++) EN[k] = energy(f, w, d, alt, rh, z[k] - g);
}
/** EN[k] = energy of cell i (the current geometry) at every storey, times its weight afterwards. */
function cellEnergies(f: NoiseField, z: ArrayLike<number>, i: number) {
  const src = f.src, wt = src.weight ? src.weight[i] : 1, w = GEO[G_W], alt = GEO[G_ALT];
  const d = GEO[G_D], rh = GEO[G_RH], g = src.grade[i];
  for (let k = 0; k < z.length; k++) EN[k] = energy(f, w, d, alt, rh, z[k] - g) * wt;
}

/** A wall of `wall` m at cell i on top of its edge transmission `te`: the better single obstacle. */
function wallScreen(s: SideScreen, i: number, wall: number, d: number, rh: number, dz: number, hs: number, te: number): number {
  const w = obstacleTransmission(s.wallOff[i], s.wallFoot[i] + wall, d, rh, dz, hs);
  return w < te ? w : te;
}

/** Screened fraction of cell `i` (side `s`) by its edge (cut top, crown or deck edge) for a point (d, rh, dz). */
function cellScreen(s: SideScreen, i: number, d: number, rh: number, dz: number, hs: number, lane: number): number {
  const eo = s.edgeOff[i];
  if (eo !== eo) return 1;
  const top = s.edgeTop[i];
  if (s.edgeLane[i]) {
    // The road's own edge at road level sits near grazing for the axis source of §1.11 a (a wall-design
    // convention), where the manual's 4.1 dB step decides. The near lane is the source it screens least:
    // the ray from there (conservative; research/36 §2).
    const dl = d - lane, o = eo - lane;
    // (obstacleTransmission's own early outs, before the lane ray's horizontal length is computed)
    if (!(dl > 0) || !(o > 0) || o >= dl || top <= hs + (dz - hs) * (o / dl)) return 1;
    return obstacleTransmission(o, top, dl, Math.sqrt(Math.max(0, rh * rh - d * d) + dl * dl), dz, hs);
  }
  return obstacleTransmission(eo, top, d, rh, dz, hs);
}
/** TE[k] = cell i's edge transmission along the current geometry, every storey. */
function edgeScreens(src: AcousticSource, s: SideScreen, i: number, z: ArrayLike<number>) {
  const d = GEO[G_D], rh = GEO[G_RH], g = src.grade[i], hs = src.sourceHeight, lane = src.laneOffset;
  for (let k = 0; k < z.length; k++) TE[k] = cellScreen(s, i, d, rh, z[k] - g, hs, lane);
}
/** TS[k] = cell i's transmission with a wall of `wall` m over TE[k], every storey. */
function wallScreens(src: AcousticSource, s: SideScreen, i: number, wall: number, z: ArrayLike<number>) {
  const d = GEO[G_D], rh = GEO[G_RH], g = src.grade[i], hs = src.sourceHeight;
  for (let k = 0; k < z.length; k++) TS[k] = wallScreen(s, i, wall, d, rh, z[k] - g, hs, TE[k]);
}

// ---- walkers -------------------------------------------------------------------------------------

// traversal stacks (level, index pairs; depth ≤ 2 per tree level), one per walker
const STACK_P = new Int32Array(128), STACK_D = new Int32Array(128), STACK_O = new Int32Array(128), STACK_B = new Int32Array(128);

/**
 * Energy transfer from the whole source to a point (px, py) at absolute elevations `z[]` (one per storey),
 * accumulated into `out` (cleared first). `wallL/R` = built wall heights per station (0 = none).
 * Cells [w0, w1] (and the chunks they touch) are always summed one by one — the same arithmetic as
 * `cellOptions` — or left out entirely when `skip` (the caller adds them itself). `visit` sees every
 * cell with its per-height raw / screened contributions (for breakdowns); with it, every cell within
 * NOISE_REACH is summed one by one. `sum`: how far segments are grouped (Sum; 2 = every cell one by one, the
 * reference the grouped sums are within FAR_ERROR of).
 */
export function pointTransfer(f: NoiseField, px: number, py: number, z: ArrayLike<number>,
  wallL: ArrayLike<number> | null, wallR: ArrayLike<number> | null, out: Transfer,
  w0 = -1, w1 = -2, skip = false, visit?: (k: number, left: boolean, d: number, rh: number, raw: Float64Array, screened: Float64Array) => void,
  sum: Sum = 0): void {
  const src = f.src, H = z.length, T = f.levels, st = STACK_P, th = sum ? THETA_FINE : THETA, thOpen = sum ? THETA_OPEN_FINE : THETA_OPEN;
  out.raw.fill(0); out.earth.fill(0); out.screened.fill(0);
  const rawK = visit ? new Float64Array(H) : null, scrK = visit ? new Float64Array(H) : null;
  GEO[G_PX] = px; GEO[G_PY] = py;
  let sp = 0;
  st[sp++] = T.length - 1; st[sp++] = 0;
  while (sp > 0) {
    const c = st[--sp], k = st[--sp], S = T[k], i0 = S.i0[c], i1 = S.i1[c];
    if (sum !== 2 && !(w1 >= i0 && w0 <= i1)) {
      const dx = px - S.cx[c], dy = py - S.cy[c], gap = Math.sqrt(dx * dx + dy * dy) - S.radius[c];
      const line = straight(S, c);
      if (line && gap > NOISE_REACH && (k === 0 || 2 * S.radius[c] <= thOpen * gap)) { farOpen(f, S, c, z, out); continue; }
      const fits = line && (k === 0 ? sum === 0 : 2 * S.radius[c] <= th * gap);
      if (fits && gap > NEAR && !visit) { far(f, S, c, z, wallL, wallR, out); continue; }
    }
    if (k > 0) {
      const b = 2 * c + 1;
      if (b < T[k - 1].n) { st[sp++] = k - 1; st[sp++] = b; }
      st[sp++] = k - 1; st[sp++] = 2 * c;
      continue;
    }
    for (let i = i0; i <= i1; i++) {
      if (skip && i >= w0 && i <= w1) continue;
      cellGeometry(src, i);
      const left = GEO[G_LEFT] === 1, s = left ? src.L : src.R;
      if (s.shield[i]) continue;
      const open = GEO[G_RH] > NOISE_REACH, wall = open ? 0 : (left ? wallL : wallR)?.[i] ?? 0;
      cellEnergies(f, z, i);
      if (open) for (let h = 0; h < H; h++) TE[h] = 1; else edgeScreens(src, s, i, z);
      if (wall > 0) wallScreens(src, s, i, wall, z); else for (let h = 0; h < H; h++) TS[h] = TE[h];
      for (let h = 0; h < H; h++) {
        const base = EN[h];
        out.raw[h] += base; out.earth[h] += base * TE[h]; out.screened[h] += base * TS[h];
        if (rawK) { rawK[h] = base; scrK![h] = base * TS[h]; }
      }
      if (visit) visit(i, left, GEO[G_D], GEO[G_RH], rawK!, scrK!);
    }
  }
}

/**
 * Change of `out.screened` when the walls go from `oldL/R` to `newL/R` at the cells flagged in `changed`
 * (`flags` = segmentFlags of it): the same near / far arithmetic as `pointTransfer` with the same exact
 * window, touching only segments that contain a changed cell (cells in [w0, w1] left out when `skip`).
 * raw / earth do not depend on walls. `sum`: as pointTransfer's.
 */
export function transferDelta(f: NoiseField, px: number, py: number, z: ArrayLike<number>,
  oldL: ArrayLike<number>, oldR: ArrayLike<number>, newL: ArrayLike<number>, newR: ArrayLike<number>,
  changed: Uint8Array, flags: Uint8Array[], out: Transfer, w0 = -1, w1 = -2, skip = false, sum: Sum = 0): void {
  const src = f.src, H = z.length, T = f.levels, st = STACK_D, th = sum ? THETA_FINE : THETA, thOpen = sum ? THETA_OPEN_FINE : THETA_OPEN;
  const screened = out.screened;
  GEO[G_PX] = px; GEO[G_PY] = py;
  let sp = 0;
  st[sp++] = T.length - 1; st[sp++] = 0;
  while (sp > 0) {
    const c = st[--sp], k = st[--sp];
    if (!flags[k][c]) continue;
    const S = T[k], i0 = S.i0[c], i1 = S.i1[c];
    if (sum !== 2 && !(w1 >= i0 && w0 <= i1)) {
      const dx = px - S.cx[c], dy = py - S.cy[c], gap = Math.sqrt(dx * dx + dy * dy) - S.radius[c];
      const line = straight(S, c);
      if (line && gap > NOISE_REACH && (k === 0 || 2 * S.radius[c] <= thOpen * gap)) continue; // counted unscreened: walls change nothing
      const fits = line && (k === 0 ? sum === 0 : 2 * S.radius[c] <= th * gap);
      if (fits && gap > NEAR) { farDelta(f, S, c, z, oldL, oldR, newL, newR, screened); continue; }
    }
    if (k > 0) {
      const b = 2 * c + 1;
      if (b < T[k - 1].n) { st[sp++] = k - 1; st[sp++] = b; }
      st[sp++] = k - 1; st[sp++] = 2 * c;
      continue;
    }
    for (let i = i0; i <= i1; i++) {
      if (!changed[i] || (skip && i >= w0 && i <= w1)) continue;
      cellGeometry(src, i);
      if (GEO[G_RH] > NOISE_REACH) continue; // unscreened there
      const left = GEO[G_LEFT] === 1, s = left ? src.L : src.R;
      if (s.shield[i]) continue;
      const wo = (left ? oldL : oldR)[i], wn = (left ? newL : newR)[i];
      if (wo === wn) continue;
      cellEnergies(f, z, i);
      edgeScreens(src, s, i, z);
      if (wo > 0) wallScreens(src, s, i, wo, z); else for (let h = 0; h < H; h++) TS[h] = TE[h];
      for (let h = 0; h < H; h++) FS[h] = TS[h];
      if (wn > 0) wallScreens(src, s, i, wn, z); else for (let h = 0; h < H; h++) TS[h] = TE[h];
      for (let h = 0; h < H; h++) screened[h] += EN[h] * (TS[h] - FS[h]);
    }
  }
}

/** Per tree level and segment: does it contain a flagged cell? */
export function segmentFlags(f: NoiseField, flag: ArrayLike<number>): Uint8Array[] {
  const T = f.levels, C = T[0], out = [new Uint8Array(C.n)];
  for (let c = 0; c < C.n; c++) for (let i = C.i0[c]; i <= C.i1[c]; i++) if (flag[i]) { out[0][c] = 1; break; }
  for (let k = 1; k < T.length; k++) {
    const a = out[k - 1], o = new Uint8Array(T[k].n);
    for (let c = 0; c < o.length; c++) o[c] = a[2 * c] | (2 * c + 1 < a.length ? a[2 * c + 1] : 0);
    out.push(o);
  }
  return out;
}

/** per storey: the far segment's sampled edge sums (length-weighted), lengths seen, whether to sample */
const FS = new Float64Array(MAX_STOREYS), FW = new Float64Array(MAX_STOREYS), FN = new Uint8Array(MAX_STOREYS);

/** per storey: a far segment's mean edge transmission over its open length (sampled), and its walls' share
 * term (farWalls) */
const TEO = new Float64Array(MAX_STOREYS), WG = new Float64Array(MAX_STOREYS);

/** TEO[k] = segment c's edge transmission per open metre along the current geometry: 1 when no edge can
 * rise above any cell's sightline, else the length-weighted mean at every `step`-th cell (two samples). */
function farEdges(src: AcousticSource, s: SideScreen, S: Segments, c: number, eb: number, z: ArrayLike<number>) {
  const H = z.length, hs = src.sourceHeight, e = S.edges, d = GEO[G_D], step = S.step, i0 = S.i0[c], i1 = S.i1[c];
  const maxRel = e[eb + 2], minOff = e[eb + 3], maxGrade = e[eb + 4], maxOff = e[eb + 5];
  // every cell's sightline at its nearest edge clears the highest edge top: nothing screens
  // ((z − g − hs)·o/d ≥ clear·o/d ≥ clear·(minOff or, below the source, maxOff)/d for every cell)
  let sample = false;
  for (let k = 0; k < H; k++) {
    const clear = z[k] - maxGrade - hs;
    FN[k] = maxRel === -Infinity || maxRel <= clear * (clear >= 0 ? minOff : maxOff) / d ? 0 : 1;
    if (FN[k]) sample = true;
    FS[k] = 0; TEO[k] = 1;
  }
  if (!sample) return;
  let seen = 0;
  for (let i = i0 + (step >> 1); i <= i1; i += step) {
    if (s.shield[i]) continue;
    const l = src.len[i];
    seen += l;
    edgeScreens(src, s, i, z);
    for (let k = 0; k < H; k++) FS[k] += l * TE[k];
  }
  if (!(seen > 0)) for (let i = i0; i <= i1; i++) if (!s.shield[i]) {
    const l = src.len[i];
    seen += l;
    edgeScreens(src, s, i, z);
    for (let k = 0; k < H; k++) FS[k] += l * TE[k];
  }
  for (let k = 0; k < H; k++) if (FN[k]) TEO[k] = FS[k] / seen;
}

/** A far straight segment as one for its geometry (angle, distance, U), each cell with its own screening
 * seen along that geometry: the edges sampled (farEdges), the walls as the share of what passes the edges
 * that they take away (farWalls; the same terms as transferDelta's farDelta). Never below zero. */
function far(f: NoiseField, S: Segments, c: number, z: ArrayLike<number>,
  wallL: ArrayLike<number> | null, wallR: ArrayLike<number> | null, out: Transfer) {
  const src = f.src, H = z.length;
  nodeGeometry(S, c);
  const left = GEO[G_LEFT] === 1;
  const s = left ? src.L : src.R, walls = left ? wallL : wallR;
  const e = S.edges, eb = (c * 2 + (left ? 0 : 1)) * 8;
  const total = e[eb], open = e[eb + 1];
  if (!(total > 0) || !(open > 0)) return;
  farEdges(src, s, S, c, eb, z);
  if (walls) farWalls(src, s, walls, S.i0[c], S.i1[c], S.step, z);
  nodeEnergies(f, z, S, c, false);
  const wc = S.w[c];
  for (let k = 0; k < H; k++) {
    const base = EN[k] * wc / total, te = TEO[k] * open;
    const ts = walls ? te + TEO[k] * WG[k] : te;
    out.raw[k] += base * open; out.earth[k] += base * te; out.screened[k] += base * ts;
  }
}

/** The walls of a far segment: WG[k] = Σ l·(t_wall / t_edge − 1) over its walled length (between −that
 * length and 0, so what passes never goes below zero), along the segment's ray. Each block of `step` cells
 * (the edge samples' blocks: two per segment) counts each wall height in it once, at its cell nearest the
 * block's middle, times the length of its cells there. */
function farWalls(src: AcousticSource, s: SideScreen, walls: ArrayLike<number>, i0: number, i1: number, step: number,
  z: ArrayLike<number>) {
  const H = z.length;
  for (let k = 0; k < H; k++) WG[k] = 0;
  for (let b0 = i0; b0 <= i1; b0 += step) {
    const b1 = Math.min(i1, b0 + step - 1), mid = b0 + (step >> 1);
    for (let i = b0; i <= b1; i++) {
      const h = walls[i];
      if (!(h > 0) || s.shield[i]) continue;
      let first = true;
      for (let j = b0; j < i; j++) if (walls[j] === h && !s.shield[j]) { first = false; break; }
      if (!first) continue;
      let len = 0, rep = i, near = Math.abs(i - mid);
      for (let j = i; j <= b1; j++) if (walls[j] === h && !s.shield[j]) {
        len += src.len[j];
        const q = Math.abs(j - mid);
        if (q < near) { near = q; rep = j; }
      }
      edgeScreens(src, s, rep, z);
      wallScreens(src, s, rep, h, z);
      for (let k = 0; k < H; k++) WG[k] += len * (TS[k] / TE[k] - 1);
    }
  }
}

/** The change of a far segment's screened energy when its walls go from old to new (far()'s own terms). */
function farDelta(f: NoiseField, S: Segments, c: number, z: ArrayLike<number>,
  oldL: ArrayLike<number>, oldR: ArrayLike<number>, newL: ArrayLike<number>, newR: ArrayLike<number>, screened: Float64Array) {
  const src = f.src, H = z.length;
  nodeGeometry(S, c);
  const left = GEO[G_LEFT] === 1;
  const s = left ? src.L : src.R, wo = left ? oldL : oldR, wn = left ? newL : newR;
  const e = S.edges, eb = (c * 2 + (left ? 0 : 1)) * 8, total = e[eb];
  if (!(total > 0) || !(e[eb + 1] > 0)) return;
  const i0 = S.i0[c], i1 = S.i1[c];
  let changed = false;
  for (let i = i0; i <= i1 && !changed; i++) if (wo[i] !== wn[i] && !s.shield[i]) changed = true;
  if (!changed) return;
  farEdges(src, s, S, c, eb, z);
  farWalls(src, s, wn, i0, i1, S.step, z);
  for (let k = 0; k < H; k++) FW[k] = WG[k];
  farWalls(src, s, wo, i0, i1, S.step, z);
  nodeEnergies(f, z, S, c, false);
  const wc = S.w[c];
  for (let k = 0; k < H; k++) {
    const dts = TEO[k] * FW[k] - TEO[k] * WG[k];
    if (dts !== 0) screened[k] += EN[k] * wc / total * dts;
  }
}

/** Open-road energy (no screening at all) at a point, per height: cells within 60 m one by one, tree
 * segments beyond as straight ones once 1.5 of their lengths away. An upper bound of every screened level
 * up to the segment geometry's small error (no obstacle is evaluated: cheap enough for a first look at
 * every house near the road). */
export function openTransfer(f: NoiseField, px: number, py: number, z: ArrayLike<number>, out: Float64Array): void {
  const src = f.src, H = z.length, T = f.levels, st = STACK_O;
  out.fill(0);
  GEO[G_PX] = px; GEO[G_PY] = py;
  let sp = 0;
  st[sp++] = T.length - 1; st[sp++] = 0;
  while (sp > 0) {
    const c = st[--sp], k = st[--sp], S = T[k];
    const dx = px - S.cx[c], dy = py - S.cy[c], gap = Math.sqrt(dx * dx + dy * dy) - S.radius[c];
    // unscreened, only the geometry is grouped: segments ≥ 1.5 lengths away, 40 m chunks ≥ 60 m away
    if (straight(S, c) && (k === 0 ? gap > 60 : gap > 3 * S.half[c])) {
      nodeGeometry(S, c);
      const e = S.edges, eb = (c * 2 + (GEO[G_LEFT] === 1 ? 0 : 1)) * 8, total = e[eb], open = e[eb + 1];
      if (!(total > 0) || !(open > 0)) continue;
      nodeEnergies(f, z, S, c, true);
      for (let h = 0; h < H; h++) out[h] += EN[h];
      continue;
    }
    if (k > 0) {
      const b = 2 * c + 1;
      if (b < T[k - 1].n) { st[sp++] = k - 1; st[sp++] = b; }
      st[sp++] = k - 1; st[sp++] = 2 * c;
      continue;
    }
    for (let i = S.i0[c]; i <= S.i1[c]; i++) {
      const s = src.L.shield[i] && src.R.shield[i];
      cellGeometry(src, i);
      if (s || (GEO[G_LEFT] === 1 ? src.L : src.R).shield[i]) continue;
      openCellEnergies(f, z, i);
      for (let h = 0; h < H; h++) out[h] += EN[h];
    }
  }
}

/** g(d) = d·10^(−U(d)/10) at the loudest receiver height (hard ground and railway: level with the source;
 * mixed: scanned), on a 0.5 m grid to 3 km: its maximum M and running maxima from below (`up`) and from above
 * (`down`), which bound g over any interval of d (openBound). */
export interface LineEnvelope { M: number; up: Float64Array; down: Float64Array }
const ENV_STEP = 0.5, ENV_N = 5999;
const envelopes = new Map<string, LineEnvelope>();
export function lineEnvelope(ground: Propagation = NOISE.ground): LineEnvelope {
  let e = envelopes.get(ground);
  if (!e) {
    const g = new Float64Array(ENV_N).fill(0);
    for (let dz = ground !== 'mixed' ? NOISE.sourceHeight : -30; dz <= (ground !== 'mixed' ? NOISE.sourceHeight : 40); dz += 0.5)
      for (let k = 0; k < ENV_N; k++) { const d = (k + 1) * ENV_STEP; g[k] = Math.max(g[k], d * lineTransfer(d, dz, ground)); }
    const up = new Float64Array(ENV_N), down = new Float64Array(ENV_N);
    let m = 0;
    for (let k = 0; k < ENV_N; k++) up[k] = m = Math.max(m, g[k]);
    let q = 0;
    for (let k = ENV_N - 1; k >= 0; k--) down[k] = q = Math.max(q, g[k]);
    envelopes.set(ground, e = { M: m, up, down });
  }
  return e;
}
/** max of g over [lo, hi] (bounded from the grid's running maxima; beyond 3 km: hard ground's and the
 * railway's g fall, d/(d − source offset) under the 1/r law; mixed: M) */
function envelopeMax(e: LineEnvelope, ground: Propagation, lo: number, hi: number): number {
  const kh = Math.ceil(hi / ENV_STEP) - 1, kl = Math.floor(lo / ENV_STEP) - 1;
  const up = kh >= ENV_N ? e.M : e.up[Math.max(0, kh)];
  const down = kl < 0 ? e.M : kl >= ENV_N ? (ground !== 'mixed' ? e.down[ENV_N - 1] : e.M) : e.down[kl];
  return Math.min(up, down);
}

/**
 * A rigorous upper bound of the open-road energy at a point, from the tree's segments: a cell of length l
 * whose centre is r away and whose line passes d from the point adds at most l·g(d)/(π (r − l/2)²) in band
 * (its angle α ≤ l·d/(r − l/2)², g(d) = d·10^(−U(d)/10)) and l·g(r')/(π r'²) transformed (r' ≥ r − l/2 its
 * true distance): research/36 §2. Per segment, d is bounded from its chord, its cells' tangent deviation and
 * their distance from the chord. `wMax` = the largest emission weight, for any point within `spread` of
 * (px, py). Infinity when it may lie within a segment's reach.
 */
export function openBound(f: NoiseField, px: number, py: number, env: LineEnvelope, wMax: number, spread = 0): number {
  const T = f.levels, st = STACK_B, ground = f.ground;
  let q = 0, sp = 0;
  st[sp++] = T.length - 1; st[sp++] = 0;
  while (sp > 0) {
    const c = st[--sp], k = st[--sp], S = T[k];
    const dx = px - S.cx[c], dy = py - S.cy[c], pc = Math.sqrt(dx * dx + dy * dy), r = pc - S.radius[c] - 5 - spread;
    if (k === 0 ? r > 0 : r > 4 * S.radius[c]) {
      const dc = Math.abs(-dx * S.uy[c] + dy * S.ux[c]);
      const slack = (pc + spread + S.radius[c]) * S.dev[c] + S.lat[c] + spread;
      const g = Math.max(envelopeMax(env, ground, Math.max(0.5, dc - slack), Math.max(0.5, dc + slack)), envelopeMax(env, ground, r, Infinity));
      q += S.len[c] * g / (r * r);
      continue;
    }
    if (k === 0) return Infinity;
    const b = 2 * c + 1;
    if (b < T[k - 1].n) { st[sp++] = k - 1; st[sp++] = b; }
    st[sp++] = k - 1; st[sp++] = 2 * c;
  }
  return q * wMax / Math.PI;
}

/** A segment beyond NOISE_REACH: unscreened (an upper bound), shared geometry. */
function farOpen(f: NoiseField, S: Segments, c: number, z: ArrayLike<number>, out: Transfer) {
  const H = z.length;
  nodeGeometry(S, c);
  const e = S.edges, eb = (c * 2 + (GEO[G_LEFT] === 1 ? 0 : 1)) * 8, total = e[eb], open = e[eb + 1];
  if (!(total > 0) || !(open > 0)) return;
  nodeEnergies(f, z, S, c, true);
  for (let k = 0; k < H; k++) {
    const q = EN[k];
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
  const src = f.src, H = z.length, m = i1 - i0 + 1;
  // one slab each: these are allocated for every house near the road
  const slab = new Float64Array(m * (4 * H + 2)), flags = new Uint8Array(2 * m);
  const raw = slab.subarray(0, m * H), edge = slab.subarray(m * H, 2 * m * H), te = slab.subarray(2 * m * H, 3 * m * H);
  const base0 = slab.subarray(3 * m * H, 4 * m * H), dd = slab.subarray(4 * m * H, 4 * m * H + m), rr = slab.subarray(4 * m * H + m);
  const wallable = flags.subarray(0, m), side = flags.subarray(m);
  GEO[G_PX] = px; GEO[G_PY] = py;
  for (let i = i0; i <= i1; i++) {
    cellGeometry(src, i);
    const sl = GEO[G_LEFT] === 1, s = sl ? src.L : src.R, c = i - i0;
    side[c] = sl ? 1 : 0;
    if (s.shield[i]) continue;
    dd[c] = GEO[G_D]; rr[c] = GEO[G_RH];
    const open = GEO[G_RH] > NOISE_REACH, fixed = open ? NaN : (sl ? fixedL : fixedR)?.[i] ?? NaN, isFixed = fixed === fixed;
    wallable[c] = !s.gap[i] && !isFixed && !open ? 1 : 0;
    cellEnergies(f, z, i);
    if (open) for (let h = 0; h < H; h++) TE[h] = 1; else edgeScreens(src, s, i, z);
    if (isFixed && fixed > 0) wallScreens(src, s, i, fixed, z);
    for (let k = 0; k < H; k++) {
      const q = c * H + k, base = EN[k], t = TE[k];
      raw[q] = base; te[q] = t; edge[q] = base * t;
      base0[q] = isFixed && fixed > 0 ? base * TS[k] : base * t;
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
      GEO[G_D] = dd[c]; GEO[G_RH] = rr[c];
      for (let k = 0; k < H; k++) TE[k] = te[c * H + k];
      wallScreens(src, s, i, h, z);
      for (let k = 0; k < H; k++) { const q = c * H + k; e[q] = raw[q] * TS[k]; }
    }
    return (cache[o] = e);
  };
  return { i0, i1, H, heights, wallable, side, raw, edge, opt };
}
