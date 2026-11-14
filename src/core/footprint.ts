// Conflicts beyond centreline intersections. Network segments are queried through their existing
// spatial grids; raster work visits only cells in the constructed footprint (never the whole map).
import { bridgeLayout } from './bridge';
import { planRoadRealignment, roadRealignmentCrossingIntervals, severedCrossingIntervals, type RoadSourceInterval, type RoadRealignmentPlan, type PreservedRoadConnection } from './road-realignment';
import { RoadRemedyLedger } from './road-remedy-ledger';
import type { Violation } from './checks';
import type { ChannelRelocation } from './channel-relocation';
import type { RetainingFeatureCache } from './retaining';
import type { CrossingGeometry, CrossingPoint, CrossingResult } from './crossings';
import { ROAD_CLASSES, CROSSING_RULES } from './data/urban';
import { KIND, type Run } from './structures';
import type { Terrain } from './terrain';
import { protectedRasterCells } from './protected-raster';
import type { RoadNet, RoadSegment } from './roadnet';
import { barrelLength, culvertEnvelope, barrelContains, barrelIntervals, waterOpening, waterSize, waterWidth, waterCoverFits, type WaterCrossing, type WaterSegment } from './watercourses';
import { cellBounds, clipFootprint, FootprintGrid, insideFootprint, type FootprintCell, type Point2 } from './footprint-geometry';

export interface FootprintConflict {
  id: string;
  feature: 'road' | 'railway' | 'water' | 'stream';
  action: 'relocation' | 'culvert' | 'retaining-wall' | 'channel-relocation' | 'blocked';
  i: number; s0: number; s1: number; x: number; y: number;
  /** Constructed path/barrel length (affected length for blocked features), m. */
  length: number;
  affectedLength?: number;
  /** Pre-surcharge CZK, already in crossings/culverts; never add this again to the bill. */
  cost: number;
  /** Included in cost, booked as land without construction surcharge. */
  landCost?: number;
  /** Included all-in access/junction allowance, exempt from construction surcharge. */
  lumpCost?: number;
  /** Reporting allocation for distributed works; financial booking uses engineering quantities. */
  allocations?: { i: number; cost: number; landCost?: number }[];
  detail: string;
  roadId?: number; cls?: string; roadCode?: string;
  geometry?: CrossingGeometry;
  original?: CrossingPoint[];
  /** Multiple removed old roads can share one independently accepted, priced connector. */
  originals?: CrossingPoint[][];
  sourceIntervals?: RoadSourceInterval[];
}
export interface FootprintRoute {
  n: number; ds: number; s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>;
  tx: ArrayLike<number>; ty: ArrayLike<number>; kind: ArrayLike<number>; grade: ArrayLike<number>;
  dayL: ArrayLike<number>; dayR: ArrayLike<number>; zDayL: ArrayLike<number>; zDayR: ArrayLike<number>;
  crownWidth: number; runs: Run[];
  channelRelocations?: readonly ChannelRelocation[];
  featureCache?: RetainingFeatureCache;
  /** Defined: minor roads at automatic abutments/portals are relocated (see remedyBridgeSupports),
   * except these strictly retried ways. */
  strictWays?: ReadonlySet<number>;
}
interface Hit { a: number; b: number; i: number; j: number; structure?: FootprintCell['structure'] }
const SAMPLE = 5, TIE_IN_SETBACK = 3;
/** OSM motorways are separate one-direction carriageways; D27.5 is the whole divided road. */
const existingHalfWidth = (cls: string) => ROAD_CLASSES[cls].width / (cls === 'motorway' ? 4 : 2);

function union(hits: Hit[]): Hit[] {
  hits.sort((a, b) => a.a - b.a);
  const out: Hit[] = [];
  for (const h of hits) {
    const prev = out[out.length - 1];
    if (prev && h.a <= prev.b + 0.05 && prev.structure === h.structure) {
      prev.b = Math.max(prev.b, h.b); prev.i = Math.min(prev.i, h.i); prev.j = Math.max(prev.j, h.j);
    } else out.push({ ...h });
  }
  return out;
}
export function subtract(range: [number, number], covered: readonly [number, number][]): [number, number][] {
  let pieces = [range];
  for (const [lo, hi] of covered) {
    const next: typeof pieces = [];
    for (const [a, b] of pieces) {
      if (hi <= a || lo >= b) next.push([a, b]);
      else { if (lo > a) next.push([a, lo]); if (hi < b) next.push([hi, b]); }
    }
    pieces = next;
  }
  return pieces;
}
function at(r: FootprintRoute, s: number): { x: number; y: number; tx: number; ty: number; i: number } {
  const j = Math.max(0, Math.min(r.n - 2, Math.floor(s / r.ds))), t = Math.max(0, Math.min(1, (s - r.s[j]) / r.ds));
  const tx = r.tx[j] * (1 - t) + r.tx[j + 1] * t, ty = r.ty[j] * (1 - t) + r.ty[j + 1] * t, len = Math.hypot(tx, ty);
  return { x: r.x[j] * (1 - t) + r.x[j + 1] * t, y: r.y[j] * (1 - t) + r.y[j + 1] * t,
    tx: tx / len, ty: ty / len, i: Math.min(r.n - 1, Math.round(s / r.ds)) };
}
/** Support screens follow the priced equal-span layout, not an assumed solid deck footprint.
 * Dimensions are explicit study-stage allowances, not foundation design. */
export function structureFootprints(r: FootprintRoute): FootprintCell[] {
  const out: FootprintCell[] = [], w = r.crownWidth / 2;
  const add = (s: number, structure: FootprintCell['structure'], along: number, width: number) =>
    out.push({ ...at(r, s), s, structure, along, left: width, right: width });
  for (const run of r.runs) {
    if (run.kind === KIND.bridge) {
      add(run.s0, 'abutment', 3, w + 2); add(run.s1, 'abutment', 3, w + 2);
      const spans = Math.max(1, Math.round(run.length / bridgeLayout(run.length).span));
      if (run.pierStations) for (const s of run.pierStations) add(s, 'pier', 1.2, w * 0.55);
      else for (let k = 1; k < spans; k++) add(run.s0 + run.length * k / spans, 'pier', 1.2, w * 0.55);
    } else { add(run.s0, 'portal', 3, w + 2); add(run.s1, 'portal', 3, w + 2); }
  }
  return out;
}

export function footprintConflicts(r: FootprintRoute, terrain: Terrain, roads: RoadNet | undefined,
  crossings: readonly CrossingResult[], water: readonly WaterCrossing[],
  waterElevation?: ReadonlyMap<WaterCrossing, number>): { conflicts: FootprintConflict[]; violations: Violation[] } {
  const conflicts: FootprintConflict[] = [], violations: Violation[] = [];
  const cells: FootprintCell[] = [];
  for (let i = 0; i < r.n; i++) if (r.kind[i] === KIND.earth) {
    // End cells have half length, centred a quarter-cell inward.
    const shift = i === 0 ? r.ds / 4 : i === r.n - 1 ? -r.ds / 4 : 0;
    cells.push({ i, s: r.s[i], x: r.x[i] + r.tx[i] * shift, y: r.y[i] + r.ty[i] * shift,
      tx: r.tx[i], ty: r.ty[i], along: shift ? r.ds / 4 : r.ds / 2,
      left: r.dayL[i], right: r.dayR[i] });
  }
  cells.push(...structureFootprints(r));
  const grid = new FootprintGrid(cells);
  const barrels = new Map(water.flatMap(c => {
    const i = Math.min(r.n - 1, Math.round(c.s / r.ds)), j = Math.max(0, Math.min(r.n - 2, Math.floor(c.s / r.ds)));
    if (r.kind[i] !== KIND.earth) return [];
    const t = Math.max(0, Math.min(1, (c.s - r.s[j]) / r.ds));
    const cover = (waterElevation?.get(c) ?? r.grade[j] * (1 - t) + r.grade[j + 1] * t) - terrain.heightAt(c.x, c.y);
    const envelope = culvertEnvelope(c, r.dayL[i], r.dayR[i], r.ds, r.tx[i], r.ty[i], cover);
    return envelope ? [[c, envelope] as const] : [];
  }));
  const earthWater = [...barrels.keys()];
  const byReach = new Map<number, WaterCrossing[]>();
  const connectedWater = (id: number) => {
    let list = byReach.get(id);
    if (!list) { list = earthWater.filter(c => terrain.watercourses!.connected(c.id, id)); byReach.set(id, list); }
    return list;
  };
  const point = (p: Point2): CrossingPoint => ({ ...p, z: terrain.heightAt(p.x, p.y), ground: terrain.heightAt(p.x, p.y), surface: 'terrain' });
  const block = (c: FootprintConflict, title: string, fix: string, rule: string) => {
    conflicts.push(c);
    violations.push({ kind: 'footprint', basis: 'game', s0: c.s0, s1: c.s1, title, fix, detail: c.detail, rule });
  };
  const roadCovered = new Map<number, [number, number][]>(), tieInCovered = new Map<number, [number, number][]>(), roadLedger = new RoadRemedyLedger();
  const screened = (way: number) => [...roadCovered.get(way) ?? [], ...tieInCovered.get(way) ?? []];
  const fixedConnections: PreservedRoadConnection[] = [];
  const coverRoad = (id: number, a: number, b: number) => { const list = roadCovered.get(id) ?? []; list.push([Math.min(a, b), Math.max(a, b)]); roadCovered.set(id, list); };
  if (roads) {
    // Exact built/removed source ownership only. Neither a half-cell pad nor translating
    // one crossing's approach onto another nearby way proves that the other road was rebuilt.
    for (const interval of roadRealignmentCrossingIntervals(crossings, roads)) {
      const list = roadCovered.get(interval.way) ?? [];
      list.push([interval.a, interval.b]); roadCovered.set(interval.way, list);
    }
    // A severed way's link/turnaround tie-in is a construction transition: its own ribbon may
    // graze the toe within half a width plus setback beyond the exact removed end. Screening
    // tolerance only; planning and ownership keep the exact interval.
    for (const interval of severedCrossingIntervals(crossings, roads)) {
      const tieIn = ROAD_CLASSES[roads.wayClass(interval.way)].width / 2 + TIE_IN_SETBACK;
      const graze = tieInCovered.get(interval.way) ?? [];
      graze.push([interval.a - tieIn, interval.a], [interval.b, interval.b + tieIn]); tieInCovered.set(interval.way, graze);
    }
    // The defined boundary connection may be collinear and produce no raw intersection.
    // Own only grade-compatible pavement in the actual endpoint crown cell—not ±150 m
    // of that way, and never an unrelated crossing merely near the project boundary.
    for (const i of [0, r.n - 1]) {
      const ways = new Set<number>();
      roads.nearSegments([r.x[i] - 1, r.y[i] - 1, r.x[i] + 1, r.y[i] + 1], segment => {
        const dx = segment.bx - segment.ax, dy = segment.by - segment.ay;
        const t = Math.max(0, Math.min(1, ((r.x[i] - segment.ax) * dx + (r.y[i] - segment.ay) * dy) / (segment.length ** 2 || 1)));
        if (Math.hypot(r.x[i] - segment.ax - t * dx, r.y[i] - segment.ay - t * dy) <= CROSSING_RULES.endpointTolerance) ways.add(segment.way);
      });
      const direction = i === 0 ? 1 : -1, next = i === 0 ? 1 : r.n - 2;
      const cell: FootprintCell = { i, s: r.s[i], x: r.x[i] + direction * r.tx[i] * r.ds / 4, y: r.y[i] + direction * r.ty[i] * r.ds / 4,
        tx: r.tx[i], ty: r.ty[i], along: r.ds / 4, left: r.crownWidth / 2, right: r.crownWidth / 2 };
      roads.nearSegments(cellBounds(cell, 14), segment => {
        if (!ways.has(segment.way) || segment.length <= 0) return;
        const hit = clipFootprint(segment, cell, existingHalfWidth(segment.cls));
        if (!hit) return;
        const compatible = [hit[0], (hit[0] + hit[1]) / 2, hit[1]].every(d => {
          const t = (d - segment.d) / segment.length, x = segment.ax + t * (segment.bx - segment.ax), y = segment.ay + t * (segment.by - segment.ay);
          const along = direction * ((x - r.x[i]) * r.tx[i] + (y - r.y[i]) * r.ty[i]);
          const z = r.grade[i] + Math.max(0, Math.min(1, along / r.ds)) * (r.grade[next] - r.grade[i]);
          return Math.abs(z - terrain.heightAt(x, y)) <= 0.3;
        });
        if (compatible) coverRoad(segment.way, hit[0], hit[1]);
      });
    }
  }
  const roadHits = new Map<string, { way: number; cls: string; hits: Hit[] }>();
  const streamHits = new Map<string, { segment: WaterSegment; hits: Hit[]; axisHits: [number, number][] }>();
  // Raster classes are independent flags: a road-painted rail/water crossing remains protected.
  const rasterHits = new Map<string, { feature: 'railway' | 'water' | 'stream'; structure?: FootprintCell['structure']; hits: Map<number, { x: number; y: number; count: number }> }>();
  const rasterSeen = new Set<string>();
  for (const cell of cells) {
    const stored = !cell.structure ? r.featureCache?.get(cell.i) : undefined;
    const cached = stored && stored.left >= cell.left && stored.right >= cell.right ? stored : undefined;
    const visitRoad = (segment: RoadSegment) => {
      const hit = clipFootprint(segment, cell, existingHalfWidth(segment.cls));
      if (!hit) return;
      // A minor road under an automatic abutment/portal is relocated with the adjoining earthwork
      // hits (support-layout leaves it in place unless strict); piers are always moved instead.
      const structure = cell.structure && !(r.strictWays && cell.structure !== 'pier' && !ROAD_CLASSES[segment.cls].separable
        && !r.strictWays.has(segment.way)) ? cell.structure : undefined;
      const key = `${segment.way}:${structure ?? 'earth'}`;
      let group = roadHits.get(key);
      if (!group) roadHits.set(key, group = { way: segment.way, cls: segment.cls, hits: [] });
      for (const [a, b] of subtract(hit, structure ? [] : screened(segment.way)))
        group.hits.push({ a, b, i: cell.i, j: cell.i, structure });
    };
    if (cached) cached.roads.forEach(visitRoad); else roads?.nearSegments(cellBounds(cell, 14), visitRoad);
    const visitWater = (segment: WaterSegment) => {
      // Earthworks can cut a bank even when the channel axis stays outside the toe.
      const hit = clipFootprint(segment, cell, waterWidth(segment.reach) / 2);
      if (!hit) return;
      const covered: [number, number][] = (r.channelRelocations ?? []).filter(c => c.id === segment.reach.id).map(c => [c.a, c.b]);
      if (!cell.structure) for (const c of connectedWater(segment.reach.id)) covered.push(...barrelIntervals(segment, barrels.get(c)!));
      const key = `${segment.reach.id}:${cell.structure ?? 'earth'}`;
      let group = streamHits.get(key);
      if (!group) streamHits.set(key, group = { segment, hits: [], axisHits: [] });
      for (const [a, b] of subtract(hit, covered)) group.hits.push({ a, b, i: cell.i, j: cell.i, structure: cell.structure });
      // Bank contact is a safety screen, not extra barrel metres beyond the daylight toe.
      const axis = clipFootprint(segment, cell);
      if (axis) group.axisHits.push(...subtract(axis, covered));
    };
    if (cached) cached.water.forEach(visitWater); else terrain.watercourses?.nearSegments(cellBounds(cell, terrain.watercourses.maxHalfWidth), visitWater);
    const step = terrain.cell;
    const visitRaster = ({ x, y, index, feature }: { x: number; y: number; index: number; feature: 'water' | 'stream' | 'railway' }) => {
      // Conservative raster-cell overlap; at most half a pixel uncertainty at the toe.
      if (!insideFootprint({ x, y }, cell, step / 2)) return;
      if (feature === 'stream' && !cell.structure && earthWater.some(c => barrelContains({ x, y }, barrels.get(c)!, step / 2))) return;
      const key = `${feature}:${cell.structure ?? 'earth'}`, seenKey = `${key}:${index}`;
      if (rasterSeen.has(seenKey)) return;
      rasterSeen.add(seenKey);
      let group = rasterHits.get(key);
      if (!group) rasterHits.set(key, group = { feature, structure: cell.structure, hits: new Map() });
      const prev = group.hits.get(cell.i);
      if (prev) prev.count++; else group.hits.set(cell.i, { x, y, count: 1 });
    };
    if (cached) cached.raster.forEach(visitRaster);
    else protectedRasterCells(terrain, cell, visitRaster);
  }
  for (const { way, cls, hits } of roadHits.values()) {
    const merged = union(hits);
    for (let index = 0; index < merged.length; index++) {
    const sourceHit = merged[index];
    const remaining = sourceHit.structure ? [[sourceHit.a, sourceHit.b]] : subtract([sourceHit.a, sourceHit.b], screened(way));
    for (let piece = 0; piece < remaining.length; piece++) {
    const [a, b] = remaining[piece];
    const unpaid = sourceHit.structure ? [[a, b]] : subtract([a, b], screened(way));
    if (unpaid.length !== 1 || unpaid[0][0] !== a || unpaid[0][1] !== b) {
      remaining.splice(piece, 1, ...unpaid); piece--; continue;
    }
    const h = { ...sourceHit, a, b };
    if (h.b - h.a < 0.1) continue; // sub-decimetre clipping/way-projection roundoff, not a new road
    const original = roads!.wayPath(way, h.a, h.b).map(point), p = original[Math.floor(original.length / 2)];
    if (!p) continue;
    const row = ROAD_CLASSES[cls], base: FootprintConflict = { id: `road:${way}:${h.a.toFixed(2)}:${h.structure ?? 'earth'}`,
      feature: 'road', action: 'blocked', roadId: way, cls, i: h.i, s0: Math.max(0, r.s[h.i] - r.ds / 2), s1: Math.min(r.s[r.n - 1], r.s[h.j] + r.ds / 2),
      x: p.x, y: p.y, affectedLength: h.b - h.a, length: h.b - h.a, cost: 0, original, detail: '' };
    if (row.noAtGrade || h.structure) {
      base.detail = `${row.label}: ${(h.b - h.a).toFixed(1)} m intersects ${h.structure ?? 'earthwork footprint'}. No cheap relocation allowance.`;
      block(base, `${h.structure ?? 'Earthwork'} conflicts with ${row.label}`, 'Move the alignment/support clear, or provide a clear bridge span', 'Motorways and structure foundations cannot be silently displaced by the footprint');
      continue;
    }
    const planned = planRoadRealignment({ route: r, terrain, roads: roads!, grid, way, cls, hit: h, covered: roadCovered, crossings, fixedConnections,
      bounds: [index ? (merged[index - 1].b + h.a) / 2 : -Infinity, index + 1 < merged.length ? (h.b + merged[index + 1].a) / 2 : Infinity] });
    base.length = planned.length; base.cost = planned.cost; base.roadCode = planned.roadCode;
    base.geometry = planned.geometry; base.geometry.turnaroundRadius = planned.turnaroundRadius;
    base.original = planned.original ?? original; base.lumpCost = planned.lumpCost;
    const invalid = planned.problems.length > 0;
    base.detail = `${row.label}: ${base.affectedLength!.toFixed(1)} m affected; ${planned.length.toFixed(1)} m realignment × SPK ${planned.roadCode}`
      + (planned.retainingArea ? `; ${planned.retainingArea.toFixed(1)} m² additional retaining faces` : '')
      + (planned.turnaroundArea ? `; ${planned.turnaroundArea.toFixed(1)} m² turning apron` : '')
      + (planned.lumpCost ? '; existing service-access tie-in rebuilt (all-in allowance)' : '')
      + `. ${invalid ? `Proposed path needs engineering: ${planned.problems.join('; ')}.` : 'Real-network tie-ins and any surviving branches are retained outside the footprint.'}`;
    if (invalid) block(base, 'Road realignment needs engineering', `Move the alignment at km ${(base.s0 / 1000).toFixed(2)} clear of this ${base.affectedLength!.toFixed(1)} m road stretch, or bridge it; ${planned.problems[0]}`,
      'A priced realignment must preserve network connections, clear other features and meet real roads at feasible grades');
    else {
      // At a shared outside junction, independently validate companion source roads BEFORE
      // reserving either plan. Otherwise the second plan can incorrectly treat the first
      // connector's surviving endpoint as a removed old branch and bypass it.
      const accepted: { conflict: FootprintConflict; plan: RoadRealignmentPlan }[] = [{ conflict: base, plan: planned }];
      const candidateWays = new Set<number>();
      for (const path of planned.geometry.links ?? [planned.geometry.road ?? []]) if (path.length) {
        for (const end of [path[0], path[path.length - 1]]) for (const connection of roads!.connections(end))
          if (connection.way !== way) candidateWays.add(connection.way);
      }
      for (const otherWay of [...candidateWays].slice(0, 12)) {
        const group = roadHits.get(`${otherWay}:earth`);
        if (!group || ROAD_CLASSES[group.cls].noAtGrade) continue;
        const otherHits = union(group.hits);
        for (let k = 0; k < otherHits.length; k++) {
          const other = otherHits[k];
          const prior = [...(roadCovered.get(otherWay) ?? []), ...planned.sourceIntervals.filter(s => s.way === otherWay).map(s => [s.a, s.b] as [number, number])];
          for (const [a, b] of subtract([other.a, other.b], prior)) {
            if (b - a < 0.1) continue;
            const hit = { ...other, a, b };
            const plan = planRoadRealignment({ route: r, terrain, roads: roads!, grid, way: otherWay, cls: group.cls, hit,
              covered: roadCovered, crossings, fixedConnections,
              bounds: [k ? (otherHits[k - 1].b + a) / 2 : -Infinity, k + 1 < otherHits.length ? (b + otherHits[k + 1].a) / 2 : Infinity] });
            if (plan.problems.length || !RoadRemedyLedger.sameGeometry(planned, plan)) continue;
            accepted.push({ plan, conflict: { ...base, id: `road:${otherWay}:${a.toFixed(2)}:earth`, roadId: otherWay, cls: group.cls,
              i: hit.i, s0: Math.max(0, r.s[hit.i] - r.ds / 2), s1: Math.min(r.s[r.n - 1], r.s[hit.j] + r.ds / 2),
              affectedLength: b - a, original: plan.original, geometry: plan.geometry, cost: plan.cost, lumpCost: plan.lumpCost, roadCode: plan.roadCode } });
          }
        }
      }
      for (const entry of accepted) {
        entry.conflict.action = 'relocation';
        if (roadLedger.accept(entry.conflict, entry.plan) === entry.conflict) conflicts.push(entry.conflict);
      }
      // Commit exact ownership only after every shared source has passed its own checks.
      for (const entry of accepted) for (const interval of entry.plan.sourceIntervals) {
        const list = roadCovered.get(interval.way) ?? [];
        list.push([interval.a, interval.b]); roadCovered.set(interval.way, list);
      }
      for (const path of planned.geometry.links ?? [planned.geometry.road ?? []]) if (path.length) {
        for (const point of [path[0], path[path.length - 1]]) for (const connection of roads!.connections(point))
          fixedConnections.push({ way: connection.way, d: connection.d, point });
      }
    }
    }
    }
  }
  for (const { segment, hits, axisHits } of streamHits.values()) for (const h of union(hits)) {
    const w = segment.reach, distances = [0];
    for (let j = 1; j < w.points.length; j++) distances.push(distances[j - 1] + Math.hypot(w.points[j][0] - w.points[j - 1][0], w.points[j][1] - w.points[j - 1][1]));
    let area = 0, truncated = false;
    const covers: { d: number; cover: number }[] = [];
    const original: CrossingPoint[] = [];
    for (let j = 1; j < w.points.length; j++) {
      const lo = Math.max(h.a, distances[j - 1]), hi = Math.min(h.b, distances[j]);
      if (hi <= lo) continue;
      area = Math.max(area, w.catchmentKm2[j - 1], w.catchmentKm2[j]); truncated ||= w.truncated[j - 1] || w.truncated[j];
      const a = w.points[j - 1], b = w.points[j], len = distances[j] - distances[j - 1];
      const count = Math.max(2, Math.ceil((hi - lo) / SAMPLE));
      for (let k = 0; k <= count; k++) {
        const t = (lo + (hi - lo) * k / count - distances[j - 1]) / len, p = point({ x: a[0] + t * (b[0] - a[0]), y: a[1] + t * (b[1] - a[1]) });
        original.push(p);
        // Actual fill height at channel, not centreline height (a toe has no culvert cover).
        let surface = -Infinity;
        for (const c of grid.near(p)) if (!c.structure && insideFootprint(p, c, 1e-5)) {
          const off = -(p.x - r.x[c.i]) * r.ty[c.i] + (p.y - r.y[c.i]) * r.tx[c.i], left = off >= 0;
          const edge = left ? r.dayL[c.i] : r.dayR[c.i], z = left ? r.zDayL[c.i] : r.zDayR[c.i];
          const t = Math.max(0, Math.min(1, (Math.abs(off) - r.crownWidth / 2) / Math.max(0.01, edge - r.crownWidth / 2)));
          surface = Math.max(surface, r.grade[c.i] + t * (z - r.grade[c.i]));
        }
        covers.push({ d: lo + (hi - lo) * k / count, cover: surface - p.ground });
      }
    }
    if (!original.length) continue;
    const p = original[Math.floor(original.length / 2)], affectedLength = h.b - h.a;
    if (affectedLength < 0.1) continue;
    let axisStart = Infinity, axisEnd = -Infinity;
    for (const [a, b] of axisHits) {
      const lo = Math.max(a, h.a), hi = Math.min(b, h.b);
      if (hi > lo) { axisStart = Math.min(axisStart, lo); axisEnd = Math.max(axisEnd, hi); }
    }
    const bankOnly = axisEnd <= axisStart;
    // Keep the full ribbon for feasibility/cover checks, but price the channel-axis span.
    // A bank-only contact has no culvert quantity and must remain an unresolved conflict.
    let length = bankOnly ? affectedLength : axisEnd - axisStart;
    const c: WaterCrossing = { s: r.s[h.i], x: p.x, y: p.y, id: w.id, waterKind: w.kind, width: waterWidth(w), catchmentKm2: area, truncated, sine: 1 };
    // An extension next to an already-priced barrel reuses its ends, not another two heads.
    // Resizing/merging multiple existing assemblies is deliberately not an automatic free fix.
    const adjoining = connectedWater(w.id).filter(other => {
      const barrel = barrels.get(other)!;
      return [original[0], original[original.length - 1]].some(p => {
        const along = Math.abs((p.x - barrel.x) * barrel.tx + (p.y - barrel.y) * barrel.ty);
        return along >= barrel.along - r.ds && barrelContains(p, barrel, 0.05);
      });
    });
    const existing = adjoining.map(other => {
      const i = Math.min(r.n - 1, Math.round(other.s / r.ds)), width = r.dayL[i] + r.dayR[i];
      return { length: barrelLength(other, width), size: waterSize(other, width) };
    });
    // Restore the half-station ownership gap to a genuine extension's billed barrel, rather
    // than silently leaving 5 m of channel unpriced at every old/new assembly boundary.
    if (adjoining.length === 1) {
      const other = adjoining[0], half = existing[0].length / 2;
      for (const p of [original[0], original[original.length - 1]]) {
        const barrel = barrels.get(other)!;
        const gap = Math.abs((p.x - barrel.x) * barrel.tx + (p.y - barrel.y) * barrel.ty) - half;
        if (gap >= 0 && gap <= r.ds + 1e-6 && barrelContains(p, barrel, 0.05)) length += Math.min(gap, r.ds / 2);
      }
    }
    const size = waterSize(c, length + existing.reduce((sum, e) => sum + e.length, 0));
    // Headwalls retain the exposed slope at the two daylight ends. Cover is a barrel check,
    // not a demand to bury the inlet itself; reserve up to two fill-slope lengths of opening.
    const headZone = Math.min(affectedLength / 4, 2 * size.minHeight);
    const barrelCovers = covers.filter(p => p.d >= h.a + headZone && p.d <= h.b - headZone);
    const minCover = barrelCovers.length ? Math.min(...barrelCovers.map(p => p.cover)) : covers[Math.floor(covers.length / 2)].cover;
    const compatible = existing.length <= 1 && existing.every(e => e.size.perM === size.perM);
    const outlets = [original[0], original[original.length - 1]].every(p => !grid.interior(p) || adjoining.some(other => barrelContains(p, barrels.get(other)!, 0.05)));
    const reasons = [bankOnly ? 'channel bank overlaps the footprint outside a culvert axis' : '',
      h.structure ? `${h.structure} intersects the channel` : '', size.type === 'bridge' ? 'exceeds practical culvert opening/length limits' : '',
      !compatible ? 'incompatible existing barrel' : '', !outlets ? 'no clear outlet' : '', !waterCoverFits(minCover, size.minHeight) ? `barrel cover ${Number.isFinite(minCover) ? minCover.toFixed(1) : 'missing'} m, needs ${size.minHeight.toFixed(1)} m` : ''].filter(Boolean);
    const ok = reasons.length === 0;
    const conflict: FootprintConflict = { id: `stream:${w.id}:${h.a.toFixed(2)}:${h.structure ?? 'earth'}`, feature: 'stream', action: ok ? 'culvert' : 'blocked', i: h.i,
      s0: Math.max(0, r.s[h.i] - r.ds / 2), s1: Math.min(r.s[r.n - 1], r.s[h.j] + r.ds / 2), x: p.x, y: p.y, length, affectedLength,
      cost: ok ? length * size.perM + (existing.length ? 0 : 2 * size.head) : 0, original,
      detail: `${length.toFixed(1)} m channel outside priced centreline barrels; ${ok ? `${waterOpening(size)} longitudinal culvert (research/17)` : reasons.join('; ')}. No feasible priced channel diversion was found.` };
    if (ok) conflicts.push(conflict);
    else block(conflict, h.structure ? `${h.structure} obstructs a watercourse` : 'Earthwork footprint intercepts a watercourse',
      'Move the alignment/support clear of the channel, or provide a clear bridge span', 'No unpriced channel diversion; sourced culvert assemblies must meet their cover and length limits (research/17)');
  }
  for (const { feature, structure, hits } of rasterHits.values()) {
    const indices = [...hits.keys()].sort((a, b) => a - b);
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k]; let j = i, count = hits.get(i)!.count;
      while (k + 1 < indices.length && indices[k + 1] <= j + 1) { j = indices[++k]; count += hits.get(j)!.count; }
      const p = hits.get(i)!, s0 = Math.max(0, r.s[i] - r.ds / 2), s1 = Math.min(r.s[r.n - 1], r.s[j] + r.ds / 2);
      const c: FootprintConflict = { id: `${feature}:${structure ?? 'earth'}:${i}`, feature, action: 'blocked', i, s0, s1, x: p.x, y: p.y, length: s1 - s0, cost: 0,
        detail: `${structure ?? 'Slope-to-slope footprint'} intersects ${feature}; approximately ${count * terrain.cell ** 2} m² of protected raster cells. No relocation/compensation allowance.` };
      block(c, `${structure ?? 'Earthwork footprint'} conflicts with ${feature === 'water' ? 'a water area' : feature}`,
        'Move the alignment/support clear, or bridge the feature with supports outside it', feature === 'railway'
          ? 'Railways require clearance, not an ordinary road relocation rate'
          : 'Water Act 254/2001 §§5, 8, 17: water protection/consent required; game rejects unmodelled pond filling or water works, not a universal legal ban');
    }
  }
  conflicts.sort((a, b) => a.s0 - b.s0 || a.id.localeCompare(b.id));
  return { conflicts, violations };
}
