// Combined noise of several roads at one house (C1 c). PREPARED against the finite-segment noise contract
// (noise-walls-seams: per physical source, per storey day/night energy as built); wired in when that lands.
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
