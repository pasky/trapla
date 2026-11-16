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
import type { NoiseReceiver } from './noise';
import { noiseField, pointTransfer, transferBuffers, type AcousticSource, type NoiseField } from './noise-field';

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
   * beyond what stands, and `commit` to build it; null where no wall can stand (tunnel, junction opening) */
  tryWall(routeId: string, buildingIndex: number, height: number): { storeys: StoreyEnergy[]; area: number; length: number; commit(): void } | null;
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
export function combineNoise(candidates: readonly number[], decider: NoiseDecider, buildings: BuildingIndex, gone: ReadonlySet<number>): HouseNoise[] {
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
    for (const height of NOISE_WALL_HEIGHTS) {
      const trial = decider.tryWall(c.prevailing, j, height);
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
    out.push({ ...base, decision: 'buy', buyout: { routeId: c.prevailing, cost: noiseBuyoutCost(buildings.cost[j], buildings.area[j]) } });
  }
  return out;
}
/** A road's own automatic wall menu (noise.ts): 2 / 3 / 4 / 5 m. */
export const NOISE_WALL_HEIGHTS = [2, 3, 4, 5] as const;

// ---- the finite-segment decider (noise-walls-seams, model 21) ----------------------------------------

/** One road's physical source as the project sees it: its finite-segment field and its walls as built,
 * plus the walls the project adds for houses heard together (copies; the road's own result is untouched). */
interface DecidingRoad { routeId: string; src: AcousticSource; field: NoiseField | null; L: Float64Array; R: Float64Array;
  own: Map<number, NoiseReceiver>; day: number; night: number; limits: { dayDb: number; nightDb: number };
  /** cells the project walled: [side, i, height] */
  added: Map<number, number>[] }
/** Cells either side of a house summed one by one (as a road's own decision window, NOISE.wallWindow) and
 * how finely the rest is grouped (Sum 1: within 0.07 dB of the cell-by-cell sum, research/36 §2). */
const DECIDER_SUM = 1;

/** Each road's per-storey energy at a house from its own finite-segment source (Manuál 2018 §1.10–1.11,
 * research/36), as built: the road's own receiver energies where it assessed the house itself, else the
 * same sum at the house's façade point facing that road. A trial wall is a uniform wall on the road's side
 * facing the house, centred on the station nearest to it and NOISE.minWallLengthFactor × its distance long
 * (Manuál 2018 §1.11 h), skipping tunnels and junction openings; its energies scale the as-built ones by
 * the same sum with and without it. `walls()`: what the project added, per road. */
export function finiteSegmentDecider(routes: readonly { routeId: string; result: Result }[], buildings: BuildingIndex,
  groundAt: (x: number, y: number) => number): NoiseDecider & { walls(): Map<string, { L: Float64Array; R: Float64Array; stretches: { side: 'L' | 'R'; i0: number; i1: number; height: number }[] }> } {
  const roads: DecidingRoad[] = routes.flatMap(({ routeId, result }) => {
    const src = result.noise.source; if (!src) return [];
    const limits = src.limits ?? { dayDb: NOISE.limitDayDb, nightDb: NOISE.limitNightDb };
    return [{ routeId, src, field: null, L: Float64Array.from(result.noise.L), R: Float64Array.from(result.noise.R),
      own: new Map(result.noise.receivers.map(r => [r.j, r])), day: dm.pow(10, src.dayDb / 10), night: dm.pow(10, src.nightDb / 10), limits, added: [new Map(), new Map()] }];
  });
  const fieldOf = (r: DecidingRoad) => r.field ??= noiseField(r.src);
  const stretches = new Map<string, { side: 'L' | 'R'; i0: number; i1: number; height: number }[]>();
  // where a house is heard from a road: the station nearest to it, its façade point facing it, its side
  const placeCache = new Map<string, { i: number; x: number; y: number; left: boolean; d: number; z: Float64Array; w0: number; w1: number }>();
  const place = (r: DecidingRoad, j: number) => {
    const key = `${r.routeId}|${j}`, hit = placeCache.get(key); if (hit) return hit;
    const src = r.src, [bx, by] = buildings.items[j];
    let i = 0, best = Infinity;
    for (let k = 0; k < src.n; k++) { const d = (src.x[k] - bx) ** 2 + (src.y[k] - by) ** 2; if (d < best) { best = d; i = k; } }
    const own = r.own.get(j);
    let x: number, y: number;
    if (own) { x = own.x; y = own.y; i = own.i; } else {
      const [fx, fy] = buildings.facadePoint(j, src.x[i], src.y[i]);
      const vx = src.x[i] - fx, vy = src.y[i] - fy, vl = Math.hypot(vx, vy), step = Math.min(NOISE.facadeOffset, Math.max(0, vl - 1));
      x = vl > 1e-9 ? fx + vx / vl * step : fx; y = vl > 1e-9 ? fy + vy / vl * step : fy;
    }
    const c = -(x - src.x[i]) * src.ty[i] + (y - src.y[i]) * src.tx[i], ground = groundAt(bx, by);
    const m = Math.max(1, Math.round(buildings.levels[j]));
    const z = Float64Array.from({ length: m }, (_, k) => ground + NOISE.receiverHeight + k * NOISE.storeyHeight);
    const ds = Math.max(1e-6, src.n > 2 ? src.len[1] : src.len[0] * 2), reach = Math.max(1, Math.round(NOISE.wallWindow / ds));
    const p = { i, x, y, left: c >= 0, d: Math.max(1, Math.abs(c)), z, w0: Math.max(0, i - reach), w1: Math.min(src.n - 1, i + reach) };
    placeCache.set(key, p);
    return p;
  };
  const screened = (r: DecidingRoad, j: number, L: ArrayLike<number>, R: ArrayLike<number>) => {
    const p = place(r, j), t = transferBuffers(p.z.length);
    pointTransfer(fieldOf(r), p.x, p.y, p.z, L, R, t, p.w0, p.w1, false, undefined, DECIDER_SUM);
    return { raw: Float64Array.from(t.raw), screened: Float64Array.from(t.screened) };
  };
  const storeysOf = (r: DecidingRoad, j: number, scale?: Float64Array): StoreyEnergy[] => {
    const p = place(r, j), own = r.own.get(j);
    let raw: ArrayLike<number>, scr: ArrayLike<number>;
    if (own && !r.added[0].size && !r.added[1].size) { raw = own.energy.rawDay.map(v => v / r.day); scr = own.energy.day.map(v => v / r.day); }
    else { const e = screened(r, j, r.L, r.R); raw = e.raw; scr = e.screened; }
    return Array.from(p.z, (z, k) => { const s = scr[k] * (scale ? scale[k] : 1);
      return { height: z - p.z[0] + NOISE.receiverHeight, rawDay: raw[k] * r.day, rawNight: raw[k] * r.night, day: s * r.day, night: s * r.night }; });
  };
  return {
    sources(j) {
      return roads.flatMap(r => {
        if (!r.own.has(j) && r.added[0].size + r.added[1].size === 0) {
          // a house the road did not assess: heard only if its open-road energy matters at all
          const st = storeysOf(r, j);
          return st.some(s => s.rawDay > 0 || s.rawNight > 0) ? [{ routeId: r.routeId, sourceId: r.src.id, storeys: st, dayLimit: r.limits.dayDb, nightLimit: r.limits.nightDb }] : [];
        }
        return [{ routeId: r.routeId, sourceId: r.src.id, storeys: storeysOf(r, j), dayLimit: r.limits.dayDb, nightLimit: r.limits.nightDb }];
      });
    },
    tryWall(routeId, j, height) {
      const r = roads.find(q => q.routeId === routeId); if (!r) return null;
      const p = place(r, j), src = r.src, side = p.left ? src.L : src.R, built = p.left ? r.L : r.R;
      const half = NOISE.minWallLengthFactor * p.d / 2;
      const L = Float64Array.from(r.L), R = Float64Array.from(r.R), walls = p.left ? L : R;
      let area = 0, length = 0, any = false, along = 0;
      // grow both ways from the nearest station until half the length is covered on each side
      for (const dir of [-1, 1]) {
        along = 0;
        for (let i = dir < 0 ? p.i : p.i + 1; i >= 0 && i < src.n && along < half; i += dir) {
          along += src.len[i];
          if (side.shield[i] || side.gap[i]) continue;
          if (built[i] < height) { area += (height - built[i]) * src.len[i]; walls[i] = height; any = true; }
          length += src.len[i];
        }
      }
      if (!any) return null;
      const before = screened(r, j, r.L, r.R).screened, after = screened(r, j, L, R).screened, before0 = Float64Array.from(built);
      const scale = Float64Array.from(after, (v, k) => (before[k] > 0 ? v / before[k] : 1));
      return { storeys: storeysOf(r, j, scale), area, length, commit: () => {
        const mine = p.left ? r.L : r.R, added = r.added[p.left ? 0 : 1];
        for (let i = 0; i < src.n; i++) if (walls[i] > mine[i]) { mine[i] = walls[i]; added.set(i, walls[i]); }
        // the project's wall in runs of raised cells (drawn with the road's own walls)
        let list = stretches.get(routeId); if (!list) stretches.set(routeId, list = []);
        for (let i = 0; i < src.n; i++) {
          if (!(walls[i] > before0[i])) continue;
          let k = i; while (k + 1 < src.n && walls[k + 1] > before0[k + 1]) k++;
          list.push({ side: p.left ? 'L' : 'R', i0: i, i1: k, height }); i = k;
        }
      } };
    },
    walls() {
      return new Map(roads.filter(r => r.added[0].size || r.added[1].size).map(r => [r.routeId, { L: r.L, R: r.R, stretches: stretches.get(r.routeId) ?? [] }]));
    },
  };
}
