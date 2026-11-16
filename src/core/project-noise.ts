// Combined noise of several roads at one house (C1 c), from each road's finite-segment source (noise-walls-
// seams, model 21: per physical source, per storey day/night energy as built; `finiteSegmentDecider` below).
//
// - Energies of distinct physical sources add at each storey, day and night separately (Manuál 2018 §1.19;
//   research/31). Editor pieces of one physical road are finite segments of it: their cells add without a
//   +3 dB (the source model guarantees this; no max/dedupe here).
// - The limit at a house hearing roads with different limits is that of the road whose contribution
//   prevails (NV 272/2011 annex 3 A, research/31). Today's roads all carry 60/50.
// - A house over the limit only together: the project decides once. First the cheapest wall on the road
//   that prevails there (heights 2–5 m, at least twice the house's distance long, Manuál 2018 §1.11 h, the
//   same menu as a road's own walls); if no single-road wall suffices, the house is bought out ONCE (the
//   same buy-out price as a road's own), owned by the prevailing road. A house a road already bought or
//   demolished is not bought again and adds no exposure.
import type { BuildingIndex } from './buildings';
import { noiseBuyoutCost } from './buildings';
import { NOISE } from './data/urban';
import * as dm from './detmath';
import type { Result } from './evaluate';
import { noiseField, pointTransfer, transferBuffers, type AcousticSource, type NoiseField } from './noise-field';
import { wallLineLengths } from './noise';
import { wallOverrideMasks, type WallOverride } from './build-controls';

export interface StoreyEnergy { height: number; rawDay: number; rawNight: number; day: number; night: number }
export interface SourceAtHouse {
  routeId: string; sourceId: string;
  /** per storey, as built (walls, cuts, road edges) and on open ground */
  storeys: StoreyEnergy[];
  /** this source's limits at a protected outdoor space, dB */
  dayLimit: number; nightLimit: number;
}
/** What the caller (the project evaluator, with the roads' finite-segment sources) answers. Stateful:
 * walls the project decided so far are included in every later answer. */
export interface NoiseDecider {
  /** every road's energies at this house now (roads whose noise reaches it), as built + project walls */
  sources(buildingIndex: number): SourceAtHouse[];
  /** a wall of `height` on this road in front of this house (at least twice its distance long, on the
   * side facing it, where a wall can stand): that road's energies there with it, the wall area it ADDS
   * beyond what stands, and `commit` to build it; null where no wall can stand (tunnel, junction opening, the
   * player's own wall choice). `reach`: its standing length in multiples of the house's distance (≥ 2). */
  tryWall(routeId: string, buildingIndex: number, height: number, reach?: number): { storeys: StoreyEnergy[]; area: number; length: number; commit(): void } | null;
}

export interface HouseNoise {
  buildingIndex: number;
  /** combined level at the loudest storey (as built, after the project's decision), dB */
  dayDb: number; nightDb: number; dayLimit: number; nightLimit: number;
  /** the road whose noise prevails there */
  prevailing: string;
  decision: 'none' | 'wall' | 'buy';
  wall?: { routeId: string; height: number; area: number; length: number; cost: number };
  buyout?: { routeId: string; cost: number };
  sources: SourceAtHouse[];
  /** a house the player keeps that stays over the limit: by how much, dB */
  over?: number;
}

const db = (e: number) => (e > 0 ? 10 * dm.log10(e) : -Infinity);
/** Reported precision: a combined level this little over the limit is within it (same as a road's own). */
const TOLERANCE_DB = 0.05;

function combined(sources: readonly SourceAtHouse[]) {
  const n = Math.max(0, ...sources.map(s => s.storeys.length));
  let worst = -Infinity, at = 0, dayDb = -Infinity, nightDb = -Infinity;
  // the prevailing road: the largest energy at the loudest storey of its controlling period
  const share = new Map<string, number>();
  for (const s of sources) for (const st of s.storeys) share.set(s.routeId, (share.get(s.routeId) ?? 0) + st.day + st.night);
  const prevailing = [...share.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
  const lim = sources.find(s => s.routeId === prevailing) ?? sources[0];
  for (let k = 0; k < n; k++) {
    let d = 0, nn = 0;
    for (const s of sources) { const st = s.storeys[k]; if (st) { d += st.day; nn += st.night; } }
    const over = Math.max(db(d) - lim.dayLimit, db(nn) - lim.nightLimit);
    if (over > worst) { worst = over; at = k; dayDb = db(d); nightDb = db(nn); }
  }
  return { over: worst, storey: at, dayDb, nightDb, dayLimit: lim.dayLimit, nightLimit: lim.nightLimit, prevailing };
}

/** Decide every house where two or more roads are heard together. `gone`: houses a road already demolishes
 * or buys (no exposure, no second buy-out). Deterministic: houses loudest first (as found), ties by index;
 * a wall built for one house counts for the next. */
export function combineNoise(candidates: readonly number[], decider: NoiseDecider, buildings: BuildingIndex, gone: ReadonlySet<number>,
  /** houses the player keeps: never bought; left too loud when no wall suffices (`decision` 'none', over the limit) */
  keep: ReadonlySet<number> = new Set()): HouseNoise[] {
  const out: HouseNoise[] = [];
  const order = [...new Set(candidates)].filter(j => !gone.has(j)).map(j => ({ j, c: combined(decider.sources(j)) }))
    .sort((a, b) => b.c.over - a.c.over || a.j - b.j);
  for (const { j } of order) {
    const sources = decider.sources(j);
    if (sources.length < 2) continue;
    const c = combined(sources);
    const base: HouseNoise = { buildingIndex: j, dayDb: c.dayDb, nightDb: c.nightDb, dayLimit: c.dayLimit, nightLimit: c.nightLimit,
      prevailing: c.prevailing, decision: 'none', sources };
    if (c.over <= TOLERANCE_DB) { out.push(base); continue; }
    // the cheapest single wall on the prevailing road that brings every storey within the limit
    let best: { height: number; area: number; length: number; storeys: StoreyEnergy[]; commit(): void } | null = null;
    for (const height of NOISE_WALL_HEIGHTS) for (const reach of WALL_REACHES) {
      const trial = decider.tryWall(c.prevailing, j, height, reach);
      if (!trial) continue;
      const d = combined(sources.map(s => s.routeId === c.prevailing ? { ...s, storeys: trial.storeys } : s));
      if (d.over <= TOLERANCE_DB && (!best || trial.area < best.area)) best = { height, ...trial };
    }
    if (best) {
      best.commit();
      const now = sources.map(s => s.routeId === c.prevailing ? { ...s, storeys: best!.storeys } : s), d = combined(now);
      out.push({ ...base, sources: now, dayDb: d.dayDb, nightDb: d.nightDb, decision: 'wall',
        wall: { routeId: c.prevailing, height: best.height, area: best.area, length: best.length, cost: best.area * NOISE.wallPerM2 } });
      continue;
    }
    if (keep.has(j)) { out.push({ ...base, over: c.over }); continue; }
    out.push({ ...base, decision: 'buy', buyout: { routeId: c.prevailing, cost: noiseBuyoutCost(buildings.cost[j], buildings.area[j]) } });
  }
  return out;
}
/** Trial wall lengths in multiples of the house's distance: the minimum (Manuál 2018 §1.11 h, NOISE.minWallLengthFactor)
 * and two longer ones, so an existing wall can be extended (game choice, like the road's own growing walls). */
const WALL_REACHES = [NOISE.minWallLengthFactor, 2 * NOISE.minWallLengthFactor, 4 * NOISE.minWallLengthFactor];
/** A road's own automatic wall menu (noise.ts): 2 / 3 / 4 / 5 m. */
export const NOISE_WALL_HEIGHTS = [2, 3, 4, 5] as const;

// ---- the finite-segment decider (noise-walls-seams, model 21) ----------------------------------------

interface DecidingRoad { routeId: string; src: AcousticSource; field: NoiseField | null; L: Float64Array; R: Float64Array;
  /** cells where the player chose the wall (any height, 0 = none): the project never changes them */
  fixedL: Uint8Array; fixedR: Float64Array | Uint8Array;
  /** wall line length per cell on each side, m (as the road's own walls are billed) */
  lineL: Float64Array; lineR: Float64Array;
  limits: { dayDb: number; nightDb: number }; day: number; night: number; ds: number; s: ArrayLike<number> }

/** Each road's per-storey energy at a house from its own finite-segment source (Manuál 2018 §1.10–1.11,
 * research/36), summed cell by cell (Sum 2, the reference the road's own grouped sums approximate) at the
 * house's façade point facing that road, with the road's walls as built plus the project's. A rebuilt road's
 * kept cells are the old road, not a new source (project-kept.ts): no energy, no wall. A trial wall is a uniform
 * wall on the road's side facing the house, centred on the station nearest to it, `reach` × its distance long
 * in standing wall (tunnels, junction openings and the player's own wall choices are skipped and never
 * changed), billed by its wall line like the road's own walls. `walls()`: each road's final wall heights. */
export function finiteSegmentDecider(routes: readonly { routeId: string; result: Result; wallOverrides?: readonly WallOverride[] }[],
  buildings: BuildingIndex, groundAt: (x: number, y: number) => number): NoiseDecider & { walls(): Map<string, { L: Float64Array; R: Float64Array }> } {
  const changed = new Set<string>();
  const roads: DecidingRoad[] = routes.flatMap(({ routeId, result, wallOverrides }) => {
    const base = result.noise.source; if (!base) return [];
    const kept = result.keptCells, n = base.n;
    const weight = Float64Array.from({ length: n }, (_, i) => (kept?.[i] ? 0 : base.weight?.[i] ?? 1));
    const src: AcousticSource = kept?.some(Boolean) ? { ...base, weight } : base;
    const L = Float64Array.from(result.noise.L), R = Float64Array.from(result.noise.R);
    if (kept) for (let i = 0; i < n; i++) if (kept[i]) { L[i] = 0; R[i] = 0; }
    const masks = wallOverrideMasks(result.s, wallOverrides ?? []);
    const fixedL = Uint8Array.from(masks.L, v => (Number.isFinite(v) ? 1 : 0)), fixedR = Uint8Array.from(masks.R, v => (Number.isFinite(v) ? 1 : 0));
    const line = (side: typeof src.L, left: boolean) => {
      const off = Float64Array.from(side.wallOff, v => (Number.isFinite(v) ? v : 0));
      return wallLineLengths(n, src.x, src.y, src.tx, src.ty, off, left);
    };
    return [{ routeId, src, field: null, L, R, fixedL, fixedR, lineL: line(src.L, true), lineR: line(src.R, false),
      limits: src.limits ?? { dayDb: NOISE.limitDayDb, nightDb: NOISE.limitNightDb },
      day: dm.pow(10, src.dayDb / 10), night: dm.pow(10, src.nightDb / 10), ds: result.ds, s: result.s }];
  });
  const fieldOf = (r: DecidingRoad) => r.field ??= noiseField(r.src);
  const placeCache = new Map<string, { i: number; x: number; y: number; left: boolean; d: number; z: Float64Array }>();
  const place = (r: DecidingRoad, j: number) => {
    const key = `${r.routeId}|${j}`, hit = placeCache.get(key); if (hit) return hit;
    const src = r.src, [bx, by] = buildings.items[j];
    let i = 0, best = Infinity;
    for (let k = 0; k < src.n; k++) { const d = (src.x[k] - bx) ** 2 + (src.y[k] - by) ** 2; if (d < best) { best = d; i = k; } }
    const [fx, fy] = buildings.facadePoint(j, src.x[i], src.y[i]);
    const vx = src.x[i] - fx, vy = src.y[i] - fy, vl = Math.hypot(vx, vy), step = Math.min(NOISE.facadeOffset, Math.max(0, vl - 1));
    const x = vl > 1e-9 ? fx + vx / vl * step : fx, y = vl > 1e-9 ? fy + vy / vl * step : fy;
    const c = -(x - src.x[i]) * src.ty[i] + (y - src.y[i]) * src.tx[i], ground = groundAt(bx, by);
    const m = Math.max(1, Math.round(buildings.levels[j]));
    const z = Float64Array.from({ length: m }, (_, k) => ground + NOISE.receiverHeight + k * NOISE.storeyHeight);
    const p = { i, x, y, left: c >= 0, d: Math.max(1, Math.abs(c)), z };
    placeCache.set(key, p);
    return p;
  };
  const storeysOf = (r: DecidingRoad, j: number, L: ArrayLike<number>, R: ArrayLike<number>): StoreyEnergy[] => {
    const p = place(r, j), t = transferBuffers(p.z.length);
    pointTransfer(fieldOf(r), p.x, p.y, p.z, L, R, t, -1, -2, false, undefined, 2);
    return Array.from(p.z, (z, k) => ({ height: z - p.z[0] + NOISE.receiverHeight,
      rawDay: t.raw[k] * r.day, rawNight: t.raw[k] * r.night, day: t.screened[k] * r.day, night: t.screened[k] * r.night }));
  };
  return {
    sources(j) {
      return roads.flatMap(r => {
        const st = storeysOf(r, j, r.L, r.R);
        return st.some(q => q.rawDay > 0 || q.rawNight > 0) ? [{ routeId: r.routeId, sourceId: r.src.id, storeys: st, dayLimit: r.limits.dayDb, nightLimit: r.limits.nightDb }] : [];
      });
    },
    tryWall(routeId, j, height, reach = NOISE.minWallLengthFactor) {
      const r = roads.find(q => q.routeId === routeId); if (!r) return null;
      const p = place(r, j), src = r.src, side = p.left ? src.L : src.R, built = p.left ? r.L : r.R;
      const fixed = p.left ? r.fixedL : r.fixedR, line = p.left ? r.lineL : r.lineR, kept = r.src.weight;
      const half = reach * p.d / 2;
      const L = Float64Array.from(r.L), R = Float64Array.from(r.R), walls = p.left ? L : R;
      let area = 0, length = 0, any = false;
      // grow both ways from the nearest station until half the length stands on each side
      for (const dir of [-1, 1]) {
        let standing = 0;
        for (let i = dir < 0 ? p.i : p.i + 1; i >= 0 && i < src.n && standing < half; i += dir) {
          if (side.shield[i] || side.gap[i] || fixed[i] || (kept && !(kept[i] > 0))) continue;
          standing += r.ds; length += line[i];
          if (built[i] < height) { area += (height - built[i]) * line[i]; walls[i] = height; any = true; }
        }
      }
      if (!any) return null;
      return { storeys: storeysOf(r, j, L, R), area, length, commit: () => { r.L.set(L); r.R.set(R); changed.add(routeId); } };
    },
    walls() {
      return new Map(roads.filter(r => changed.has(r.routeId)).map(r => [r.routeId, { L: r.L, R: r.R }]));
    },
  };
}
