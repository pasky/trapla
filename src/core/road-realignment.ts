// Bounded AUTO relocation on real network topology. No invented old-road extensions, and no
// ownership of source intervals already engineered by a crossing or another relocation.
import type { CrossingGeometry, CrossingPoint, CrossingResult } from './crossings';
import { CROSSING_RULES, ROAD_CLASSES } from './data/urban';
import type { FootprintRoute } from './footprint';
import { cellBounds, clipFootprint, insideFootprint, type FootprintCell, type FootprintGrid, type Point2 } from './footprint-geometry';
import type { RoadNet } from './roadnet';
import { BUILTUP_BIT, CLASS_BITS, LC, RAIL_CROSSING_BIT, RIVER_CROSSING_BIT, type Terrain } from './terrain';

export interface RoadSourceInterval { way: number; a: number; b: number }
export interface RoadRealignmentInput {
  route: FootprintRoute; terrain: Terrain; roads: RoadNet; grid: FootprintGrid;
  way: number; cls: string; hit: { a: number; b: number; i: number; j: number };
  /** Absolute chainages on EACH interval's own source way. Never mutate the caller's map. */
  covered?: ReadonlyMap<number, readonly (readonly [number, number])[]>;
  /** Absolute chainages on `way`, e.g. midpoints between adjacent relocation groups. */
  bounds?: readonly [number, number];
  /** Complete physical crossing surfaces can receive a new T-arm connector outside the grid. */
  crossings?: readonly CrossingResult[];
}
export interface RoadRealignmentPlan {
  geometry: CrossingGeometry; original?: CrossingPoint[];
  length: number; cost: number; roadCode: string; problems: string[];
  /** Actual old-road ownership, including a removed dead-end stub, excluding covered intervals.
   * Reserve these only for an accepted plan, before planning other relocation groups. */
  sourceIntervals: RoadSourceInterval[];
  /** Additional paved apron area, excluding its overlap with the priced approach ribbon. */
  turnaroundArea: number;
  /** Provisional study geometry: turning disk radius = 1.5 × road width, not a design standard. */
  turnaroundRadius?: number;
}
type WayPoint = Point2 & { d: number };
type SourceSpan = RoadSourceInterval & { lo: number; hi: number };
const STEP = 5, SETBACK = 3, MAX_POINTS = 1600, MAX_SUPPORT = 10;
const distance = (a: Point2, b: Point2) => Math.hypot(b.x - a.x, b.y - a.y);
const mix = (a: WayPoint, b: WayPoint, t: number): WayPoint => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), d: a.d + t * (b.d - a.d) });
function along(path: readonly WayPoint[], d: number): WayPoint {
  let lo = 0, hi = path.length - 1;
  while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (path[m].d <= d) lo = m; else hi = m; }
  return mix(path[lo], path[hi], Math.max(0, Math.min(1, (d - path[lo].d) / (path[hi].d - path[lo].d || 1))));
}
function slice(path: readonly WayPoint[], a: number, b: number): WayPoint[] {
  if (b <= a || path.length < 2) return [];
  return [along(path, a), ...path.filter(p => p.d > a && p.d < b), along(path, b)];
}
interface CrossingSource { path: WayPoint[]; intervals: RoadSourceInterval[]; targets: CrossingPoint[] }
const crossingSources = new WeakMap<CrossingGeometry, { roads: RoadNet; source: CrossingSource }>();
function mergeIntervals(intervals: RoadSourceInterval[]): RoadSourceInterval[] {
  intervals.sort((a, b) => a.way - b.way || a.a - b.a);
  const out: RoadSourceInterval[] = [];
  for (const interval of intervals) {
    const previous = out[out.length - 1];
    if (previous?.way === interval.way && interval.a <= previous.b + 1e-5) previous.b = Math.max(previous.b, interval.b);
    else out.push({ ...interval });
  }
  return out;
}
function crossingSource(c: CrossingResult, roads: RoadNet): CrossingSource | undefined {
  const g = c.geometry;
  if (!g || g.clipped || c.roadId === undefined || c.issues?.some(issue => issue.crossing.code === 'geometry')) return;
  const cached = crossingSources.get(g);
  if (cached?.roads === roads) return cached.source;
  let path: WayPoint[] = [], targets: CrossingPoint[] = [];
  if ((c.type === 'overbridge' || c.type === 'junction') && g.road) {
    path = g.road.map((p, i) => ({ x: p.x, y: p.y, d: i })); targets = g.road;
  } else if ((c.type === 'reconnection' || c.type === 'diversion') && g.turnarounds?.length) {
    const raw = roads.connectedCrossingPath(c.roadId, c.x, c.y, CROSSING_RULES.linkHardReach, MAX_POINTS);
    const ds = g.turnarounds.map(p => p.d);
    if (raw.length < 2 || ds.some(d => d === undefined)) return;
    let a = Math.min(...ds as number[]), b = Math.max(...ds as number[]);
    if (ds.length === 1) {
      if (a < 0) b = roads.isDeadEnd(raw[raw.length - 1]) ? raw[raw.length - 1].d : 0;
      else a = roads.isDeadEnd(raw[0]) ? raw[0].d : 0;
    }
    path = slice(raw, Math.max(raw[0].d, a), Math.min(raw[raw.length - 1].d, b));
    targets = (g.links ?? []).flat();
  } else return;
  const intervals: RoadSourceInterval[] = [];
  for (let i = 1; i < path.length; i++) {
    const span = roads.sourceInterval(path[i - 1], path[i]);
    if (span) intervals.push({ way: span.way, a: Math.min(span.a, span.b), b: Math.max(span.a, span.b) });
  }
  const source = { path, intervals: mergeIntervals(intervals), targets };
  crossingSources.set(g, { roads, source });
  return source;
}

/** Add these exact connected-way intervals to the caller's crossing coverage BEFORE collecting
 * or subtracting relocation hits. A T-arm is not covered merely by touching this old path. */
export function roadRealignmentCrossingIntervals(crossings: readonly CrossingResult[], roads: RoadNet): RoadSourceInterval[] {
  return mergeIntervals(crossings.flatMap(c => crossingSource(c, roads)?.intervals ?? []));
}

function dense(path: readonly WayPoint[]): WayPoint[] {
  const result: WayPoint[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], count = Math.max(1, Math.ceil(distance(a, b) / STEP));
    for (let j = 0; j < count && result.length < MAX_POINTS; j++) result.push(mix(a, b, j / count));
    if (result.length >= MAX_POINTS) return result;
  }
  if (path.length) result.push(path[path.length - 1]);
  return result;
}

export function planRoadRealignment(input: RoadRealignmentInput): RoadRealignmentPlan {
  const { route: r, terrain, roads, grid, way, cls, hit: h, covered, bounds } = input;
  const row = ROAD_CLASSES[cls], half = row.width / 2, pad = half + SETBACK;
  const point = (q: WayPoint): CrossingPoint => {
    const ground = terrain.heightAt(q.x, q.y);
    return { ...q, z: ground, ground, surface: 'terrain' };
  };
  const failure = (message: string): RoadRealignmentPlan => ({ geometry: { width: row.width, schematic: false, clipped: true, diagnostics: [message] },
    length: 0, cost: 0, roadCode: '', problems: [message], sourceIntervals: [], turnaroundArea: 0 });
  if (row.noAtGrade) return failure('grade-separated road cannot use an ordinary realignment');
  const centre = (h.a + h.b) / 2, seed = roads.wayPath(way, centre, centre)[0];
  if (!seed) return failure('missing real-way tie-ins');
  // d is absolute source-way chainage on that way; outside it, d is connected arc length.
  // Ownership below uses the continued segment's OWN way projection, never those extended d's.
  const raw = roads.connectedCrossingPath(way, seed.x, seed.y, CROSSING_RULES.linkHardReach, MAX_POINTS)
    .map(p => ({ ...p, d: p.d + centre }));
  if (raw.length < 2) return failure('missing real-way tie-ins');
  const spans: SourceSpan[] = [];
  for (let i = 1; i < raw.length; i++) {
    const source = roads.sourceInterval(raw[i - 1], raw[i]);
    if (!source) return failure('connected path lacks a real source segment');
    spans.push({ ...source, lo: raw[i - 1].d, hi: raw[i].d });
  }
  let lo = Math.max(raw[0].d, bounds?.[0] ?? -Infinity), hi = Math.min(raw[raw.length - 1].d, bounds?.[1] ?? Infinity);
  // Project paid intervals back to connected arc length, respecting reversed OSM ways too.
  for (const span of spans) for (const [a, b] of covered?.get(span.way) ?? []) {
    const start = Math.max(Math.min(span.a, span.b), a), end = Math.min(Math.max(span.a, span.b), b);
    if (end <= start + 1e-6) continue;
    const project = (d: number) => span.lo + (d - span.a) / (span.b - span.a) * (span.hi - span.lo);
    const x = project(start), y = project(end), left = Math.min(x, y), right = Math.max(x, y);
    if (right <= h.a + 1e-5) lo = Math.max(lo, right);
    else if (left >= h.b - 1e-5) hi = Math.min(hi, left);
    else return failure('affected source interval is already covered');
  }
  if (lo > h.a + 1e-4 || hi < h.b - 1e-4 || hi <= lo) return failure('source interval boundaries exclude the affected road');
  const source = slice(raw, lo, hi);
  const ends = [source[0], source[source.length - 1]];
  const commonSources = new Map<CrossingSource, boolean>();
  const sharesSource = (existing: CrossingSource): boolean => {
    const cached = commonSources.get(existing);
    if (cached !== undefined) return cached;
    let common = existing.intervals.some(interval => spans.some(span => span.way === interval.way
      && Math.min(span.a, span.b) < interval.b - 1e-5 && Math.max(span.a, span.b) > interval.a + 1e-5));
    // Pack simplification can retain a T-arm endpoint in the interior of the through segment.
    // Recognise that real shared node too, without requiring matching polyline sampling.
    for (let i = 1; !common && i < existing.path.length; i++) {
      const a = existing.path[i - 1], b = existing.path[i], dx = b.x - a.x, dy = b.y - a.y;
      for (const p of raw) {
        if (p.x < Math.min(a.x, b.x) - 0.02 || p.x > Math.max(a.x, b.x) + 0.02
          || p.y < Math.min(a.y, b.y) - 0.02 || p.y > Math.max(a.y, b.y) + 0.02) continue;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < 0.02) { common = true; break; }
      }
    }
    commonSources.set(existing, common); return common;
  };
  const sides = new Map<Point2, number>();
  const routeSide = (p: Point2): number => {
    const cached = sides.get(p);
    if (cached !== undefined) return cached;
    let nearest = Infinity, index = h.i;
    const cells = grid.near(p);
    if (cells.length) for (const c of cells) {
      const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
      if (d < nearest) { nearest = d; index = c.i; }
    } else {
      const window = Math.ceil(CROSSING_RULES.linkHardReach / r.ds);
      for (let i = Math.max(0, h.i - window); i <= Math.min(r.n - 1, h.j + window); i++) {
        const d = (p.x - r.x[i]) ** 2 + (p.y - r.y[i]) ** 2;
        if (d < nearest) { nearest = d; index = i; }
      }
    }
    const side = -(p.x - r.x[index]) * r.ty[index] + (p.y - r.y[index]) * r.tx[index];
    sides.set(p, side); return side;
  };
  // A T-arm meeting a paid overbridge inside the grid must connect to its surviving approach,
  // not cross the main road at ground level and not disappear into the crossing's source bill.
  // Require an actual common network point; a nearby but unrelated crossing is not an anchor.
  const crossingAnchor = (boundary: WayPoint, toward: WayPoint, connected = false): CrossingPoint | undefined => {
    let best: CrossingPoint | undefined, score = Infinity;
    let cell: FootprintCell | undefined, nearest = Infinity;
    for (const c of grid.near(boundary)) {
      const d = distance(boundary, c);
      if (d < nearest) { nearest = d; cell = c; }
    }
    if (!cell || !grid.hits(boundary, pad)) return;
    const side = Math.sign(routeSide(toward)) || Math.sign(routeSide(seed));
    for (const crossing of input.crossings ?? []) {
      if (Math.abs(crossing.s - r.s[h.i]) > CROSSING_RULES.linkHardReach) continue;
      const existing = crossingSource(crossing, roads);
      if (!existing) continue;
      let common = connected && sharesSource(existing);
      for (let i = 1; !common && i < existing.path.length; i++) {
        const a = existing.path[i - 1], b = existing.path[i], dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((boundary.x - a.x) * dx + (boundary.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(boundary.x - a.x - t * dx, boundary.y - a.y - t * dy) < 0.03 && roads.sourceInterval(a, b)) { common = true; break; }
      }
      if (!common) continue;
      for (const q of existing.targets) {
        const d = distance(boundary, q);
        if (q.surface === 'deck' || d > CROSSING_RULES.linkHardReach || grid.hits(q, pad)
          || side * routeSide(q) <= 0 || Math.abs(q.z - q.ground) > MAX_SUPPORT) continue;
        const needed = Math.abs(q.z - terrain.heightAt(toward.x, toward.y)) / CROSSING_RULES.approachGradient;
        const value = d + distance(toward, q) * 0.25 + Math.max(0, needed - distance(toward, q)) * 1000;
        if (value < score) { score = value; best = { ...q, d: boundary.d }; }
      }
    }
    return best;
  };
  const anchors = [crossingAnchor(ends[0], along(raw, Math.min(hi, lo + CROSSING_RULES.linkMinLength))),
    crossingAnchor(ends[1], along(raw, Math.max(lo, hi - CROSSING_RULES.linkMinLength)))];
  // Only a true graph end inside acquired earthwork may be removed. A clipped traversal or
  // a junction is not a licence to close a branch. Structure foundations are never acquisition.
  const dead = ends.map((p, i) => Math.abs(p.d - raw[i ? raw.length - 1 : 0].d) < 1e-6
    && grid.near(p).some(c => !c.structure && insideFootprint(p, c)) && roads.isDeadEnd(p));
  if (dead[0] && dead[1]) return failure('no surviving branch outside the acquired footprint');

  // Exact ribbon/rectangle tests on bounded local pieces, including all connecting chords.
  const chordHits = (a: Point2, b: Point2, width = half): boolean => {
    const len = distance(a, b), count = Math.max(1, Math.ceil(len / STEP));
    const segment = { ax: a.x, ay: a.y, bx: b.x, by: b.y, d: 0, length: len };
    for (let k = 0; k <= count; k++) {
      const t = k / count, q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      for (const c of grid.near(q)) if (clipFootprint(segment, c, width)) return true;
    }
    return grid.hits(a, width) || grid.hits(b, width);
  };
  const push = (p: WayPoint, preferredSide = 0): WayPoint => {
    const q = { ...p };
    for (let iteration = 0; iteration < 16; iteration++) {
      const c = grid.near(q).find(c => insideFootprint(q, c, pad));
      if (!c) break;
      const lateral = -(q.x - c.x) * c.ty + (q.y - c.y) * c.tx;
      const target = (preferredSide || Math.sign(lateral)) >= 0 ? c.left + pad + 0.25 : -c.right - pad - 0.25;
      q.x -= c.ty * (target - lateral); q.y += c.tx * (target - lateral);
    }
    return q;
  };
  const radius = row.width * 1.5;
  let turn: WayPoint | undefined, removedLo: number | undefined, removedHi: number | undefined;
  if (dead.some(Boolean)) {
    // End the replacement on the surviving REAL branch, far enough out for the whole disk.
    // No laterally invented anchor and no new access across the severed main-road corridor.
    const samples = dense(source), reverse = dead[1], ordered = reverse ? [...samples].reverse() : samples;
    turn = ordered.find(p => !grid.hits(p, radius + SETBACK));
    if (!turn) return failure('no clear turnaround on the surviving branch within real-way reach');
    if (reverse) { removedHi = hi; hi = turn.d; } else { removedLo = lo; lo = turn.d; }
  }
  let initialReach = CROSSING_RULES.linkMinLength;
  for (let i = h.i; i <= h.j; i++) initialReach = Math.max(initialReach, CROSSING_RULES.linkMinLength + 2 * Math.max(r.dayL[i], r.dayR[i]));
  let best: RoadRealignmentPlan | undefined;
  // Expand actual-way collars only when needed for plan clearance or the 6% profile. Four
  // ordinary steps then the shared hard reach; never stop at an arbitrary OSM tag boundary.
  const reaches = [...new Set([initialReach, initialReach * 2, initialReach * 4, initialReach * 8, CROSSING_RULES.linkHardReach]
    .map(d => Math.min(d, CROSSING_RULES.linkHardReach)))];
  for (const reach of reaches) {
    const start = Math.max(lo, turn && dead[0] ? turn.d : h.a - reach);
    const end = Math.min(hi, turn && dead[1] ? turn.d : h.b + reach);
    // A turnaround needs a priced collar even when its centre is beyond the affected interval.
    const a = turn && dead[1] ? Math.max(lo, turn.d - reach) : start;
    const b = turn && dead[0] ? Math.min(hi, turn.d + reach) : end;
    const old = dense(slice(raw, a, b)), problems = new Set<string>();
    if (old.length < 2) return failure('missing surviving real-way collar');
    if (old.length >= MAX_POINTS) problems.add('realignment exceeds bounded point budget');
    const anchorA = Math.abs(a - lo) < 1e-6 && anchors[0] ? crossingAnchor(ends[0], old[old.length - 1]) : undefined;
    const anchorB = Math.abs(b - hi) < 1e-6 && anchors[1] ? crossingAnchor(ends[1], old[0]) : undefined;
    const first = anchorA ? { x: anchorA.x, y: anchorA.y, d: a } : { ...old[0] };
    const last = anchorB ? { x: anchorB.x, y: anchorB.y, d: b } : { ...old[old.length - 1] };
    // A new T-arm connector goes directly to the compatible paid approach. Following the
    // removed source loop to its old junction would cross the main road all over again.
    // This IS new pavement: audit every new chord, keep the source ownership independent.
    const side = routeSide;
    const preferred = side(first) * side(last) > 0 ? Math.sign(side(first)) : 0;
    let partSides = [preferred];
    let parts = [(anchorA || anchorB ? dense([first, last]) : old).map(q => push(q, preferred))];
    parts[0][0] = first; parts[0][parts[0].length - 1] = last;
    let linkA: CrossingPoint | undefined, linkB: CrossingPoint | undefined;
    // A weaving way can cross twice inside one centreline billing group. Preserve BOTH
    // surviving branches with two priced links to its compatible crossing, not an at-grade
    // chord through the acquired corridor. The source topology must actually be shared.
    if (!turn && !anchorA && !anchorB && side(first) * side(last) < 0 && !grid.hits(first, pad) && !grid.hits(last, pad)) {
      const boundary = along(raw, centre);
      linkA = crossingAnchor(boundary, first, true); linkB = crossingAnchor(boundary, last, true);
      if (linkA && linkB) {
        partSides = [Math.sign(side(first)), Math.sign(side(last))];
        parts = [dense([first, { ...linkA, d: centre }]).map(q => push(q, partSides[0])), dense([{ ...linkB, d: centre }, last]).map(q => push(q, partSides[1]))];
        parts[0][0] = first; parts[0][parts[0].length - 1] = { ...linkA, d: centre };
        parts[1][0] = { ...linkB, d: centre }; parts[1][parts[1].length - 1] = last;
      } else { linkA = undefined; linkB = undefined; }
    }
    // Inserting and pushing source-interpolated chord midpoints closes the gaps at rotated
    // footprint corners; endpoint-only tests miss these small but real blocked wedges.
    parts = parts.map((part, partIndex) => {
      for (let pass = 0; pass < 5; pass++) {
        const next: WayPoint[] = [part[0]];
        let changed = false;
        for (let i = 1; i < part.length; i++) {
          const p = part[i - 1], q = part[i];
          if (next.length + part.length - i < MAX_POINTS / parts.length && chordHits(p, q)) {
            const mid = mix(p, q, 0.5), pushed = push(mid, partSides[partIndex]);
            if (distance(mid, pushed) > 1e-6) { next.push(pushed); changed = true; }
          }
          next.push(q);
        }
        part = next;
        if (!changed) break;
      }
      return part;
    });
    const path = parts.flat().map(point), gap = parts.length === 2 ? parts[0].length : -1;
    const fixed = new Map([[0, anchorA?.z ?? path[0].ground], [path.length - 1, anchorB?.z ?? path[path.length - 1].ground]]);
    if (gap > 0) { fixed.set(gap - 1, linkA!.z); fixed.set(gap, linkB!.z); }
    for (const index of fixed.keys()) if (grid.hits(path[index], half)) problems.add('tie-in inside the footprint');
    // Solve a bounded Lipschitz profile with fixed terrain tie-ins. Ordinary SPK grading is
    // represented by wall-supported ramps (no unmodelled embankment spilling into the grid).
    const chain = [0];
    for (let i = 1; i < path.length; i++) chain.push(i === gap ? 0 : chain[i - 1] + distance(path[i - 1], path[i]));
    const lower = path.map(p => p.ground - MAX_SUPPORT), upper = path.map(p => p.ground + MAX_SUPPORT);
    for (const [i, z] of fixed) lower[i] = upper[i] = z;
    for (let i = 1; i < path.length; i++) {
      if (i === gap) continue;
      const dz = (chain[i] - chain[i - 1]) * CROSSING_RULES.approachGradient;
      lower[i] = Math.max(lower[i], lower[i - 1] - dz); upper[i] = Math.min(upper[i], upper[i - 1] + dz);
    }
    for (let i = path.length - 2; i >= 0; i--) {
      if (i + 1 === gap) continue;
      const dz = (chain[i + 1] - chain[i]) * CROSSING_RULES.approachGradient;
      lower[i] = Math.max(lower[i], lower[i + 1] - dz); upper[i] = Math.min(upper[i], upper[i + 1] + dz);
    }
    for (let i = 0; i < path.length; i++) {
      let min = lower[i], max = upper[i];
      if (i && i !== gap) {
        const dz = (chain[i] - chain[i - 1]) * CROSSING_RULES.approachGradient;
        min = Math.max(min, path[i - 1].z - dz); max = Math.min(max, path[i - 1].z + dz);
      }
      if (min > max + 1e-7) problems.add('6% grade needs support exceeding 10 m or a longer real-way tie-in');
      path[i].z = Math.max(min, Math.min(max, path[i].ground));
      if (Math.abs(path[i].z - path[i].ground) > 0.01) { path[i].surface = 'ramp'; path[i].support = 'retaining'; }
    }
    // Preserve endpoints even in a diagnosed, infeasible proposal.
    for (const [i, z] of fixed) path[i].z = z;
    let length = 0, cost = 0;
    const codes = new Set<string>();
    const price = (p: Point2, len: number) => {
      const urban = terrain.cover(p.x, p.y) & BUILTUP_BIT ? 1 : 0;
      cost += len * row.roadPerKm[urban] / 1000; codes.add(row.roadCodes[urban]);
    };
    const protectedCover = (v: number) => !!(v & (RAIL_CROSSING_BIT | RIVER_CROSSING_BIT))
      || (v & CLASS_BITS) === LC.rail || (v & CLASS_BITS) === LC.water || (!terrain.watercourses && (v & CLASS_BITS) === LC.stream);
    const raster = (cell: FootprintCell) => {
      const [x0, y0, x1, y1] = cellBounds(cell);
      // Only local raster cells under the NEW ribbon, including its edges, not the whole pack.
      for (let y = Math.floor(y0 / terrain.cell); y <= Math.floor(y1 / terrain.cell); y++)
        for (let x = Math.floor(x0 / terrain.cell); x <= Math.floor(x1 / terrain.cell); x++) {
          const p = { x: (x + 0.5) * terrain.cell, y: (y + 0.5) * terrain.cell };
          if (insideFootprint(p, cell, terrain.cell * Math.SQRT1_2) && protectedCover(terrain.cover(p.x, p.y))) problems.add('path intersects water/rail');
        }
    };
    for (let i = 1; i < path.length; i++) {
      if (i === gap) continue;
      const p = path[i - 1], q = path[i], len = distance(p, q), mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      length += len; price(mid, len);
      if (chordHits(p, q)) problems.add('path intersects the footprint');
      if (Math.abs(q.z - p.z) > len * CROSSING_RULES.approachGradient + 1e-6) problems.add('tie-in heights exceed 6% gradient');
      const originalA = along(raw, p.d!), originalB = along(raw, q.d!);
      const changed = distance(p, originalA) > 0.01 || distance(q, originalB) > 0.01;
      const count = Math.max(1, Math.ceil(len / STEP));
      for (let k = 0; k <= count; k++) {
        const t = k / count, x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t;
        const nx = len ? -(q.y - p.y) / len * half : 0, ny = len ? (q.x - p.x) / len * half : 0;
        if (terrain.isOob(x, y) || terrain.isOob(x + nx, y + ny) || terrain.isOob(x - nx, y - ny)) problems.add('path leaves terrain data');
      }
      if (changed && len > 1e-6) {
        const cell: FootprintCell = { ...mid, i: h.i, s: r.s[h.i], tx: (q.x - p.x) / len, ty: (q.y - p.y) / len, along: len / 2, left: half, right: half };
        raster(cell);
        terrain.watercourses?.nearSegments(cellBounds(cell, terrain.watercourses.maxHalfWidth), channel => {
          if (clipFootprint(channel, cell, (channel.reach.width ?? 0.5) / 2)) problems.add('path intersects water/rail');
        });
      }
    }
    let turnaroundArea = 0;
    if (turn) {
      // A full disk minus the incoming half-ribbon's disk intersection: no double pavement bill.
      turnaroundArea = Math.PI * radius * radius - half * Math.sqrt(radius * radius - half * half) - radius * radius * Math.asin(half / radius);
      price(turn, turnaroundArea / row.width);
      if (grid.hits(turn, radius)) problems.add('turnaround intersects the footprint');
      const diskCell: FootprintCell = { ...turn, i: h.i, s: r.s[h.i], tx: 1, ty: 0, along: radius, left: radius, right: radius };
      // Conservative bounding square protects the whole disk, including its pavement apron.
      raster(diskCell);
      terrain.watercourses?.nearSegments(cellBounds(diskCell, terrain.watercourses.maxHalfWidth), channel => {
        if (clipFootprint(channel, diskCell, (channel.reach.width ?? 0.5) / 2)) problems.add('turnaround intersects water/rail');
      });
      const z = terrain.heightAt(turn.x, turn.y);
      for (let k = 0; k < 16; k++) {
        const x = turn.x + radius * Math.cos(k * Math.PI / 8), y = turn.y + radius * Math.sin(k * Math.PI / 8);
        if (terrain.isOob(x, y)) problems.add('turnaround leaves terrain data');
        if (Math.abs(terrain.heightAt(x, y) - z) > MAX_SUPPORT) problems.add('turnaround support exceeds 10 m');
      }
    }
    const sourceIntervals: RoadSourceInterval[] = [];
    const ownLo = removedLo ?? a, ownHi = removedHi ?? b;
    for (const span of spans) {
      const start = Math.max(ownLo, span.lo), end = Math.min(ownHi, span.hi);
      if (end <= start + 1e-6) continue;
      const da = span.a + (span.b - span.a) * (start - span.lo) / (span.hi - span.lo);
      const db = span.a + (span.b - span.a) * (end - span.lo) / (span.hi - span.lo);
      const interval = { way: span.way, a: Math.min(da, db), b: Math.max(da, db) };
      const prev = sourceIntervals[sourceIntervals.length - 1];
      if (prev?.way === interval.way && interval.a <= prev.b + 1e-5 && interval.b >= prev.a - 1e-5) { prev.a = Math.min(prev.a, interval.a); prev.b = Math.max(prev.b, interval.b); }
      else sourceIntervals.push(interval);
    }
    if (length < 0.1) problems.add('replacement has no distinct surviving anchors');
    const diagnostics = [...problems];
    const plan: RoadRealignmentPlan = { geometry: { ...(gap > 0 ? { links: [path.slice(0, gap), path.slice(gap)] as [CrossingPoint[], CrossingPoint[]] } : { road: path }), width: row.width, schematic: false,
      ...(turn ? { turnarounds: [point(turn)] } : {}), ...(diagnostics.length ? { clipped: true, diagnostics } : {}) },
      original: slice(raw, ownLo, ownHi).map(point), length, cost, roadCode: [...codes].join(' / '), problems: diagnostics, sourceIntervals,
      turnaroundArea, ...(turn ? { turnaroundRadius: radius } : {}) };
    if (!best || plan.problems.length < best.problems.length) best = plan;
    if (!problems.size) return plan;
    // Water/rail obstacles in an unchanged displaced core do not go away by billing longer
    // untouched tails. Keep adaptive retries where a different paid approach can be reached.
    if (problems.has('path intersects water/rail') && !anchors.some(Boolean) && !linkA && !linkB
      && !problems.has('tie-in inside the footprint')) break;
    if (![...problems].some(p => /tie-in|grade|footprint/.test(p))) break;
    if (a === lo && b === hi) break;
  }
  return best!;
}
