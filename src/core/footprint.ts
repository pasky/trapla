// Conflicts beyond centreline intersections. Network segments are queried through their existing
// spatial grids; raster work visits only cells in the constructed footprint (never the whole map).
import { bridgeLayout } from './bridge';
import type { Violation } from './checks';
import type { CrossingGeometry, CrossingPoint, CrossingResult } from './crossings';
import { ROAD_CLASSES, CROSSING_RULES } from './data/urban';
import { KIND, type Run } from './structures';
import { BUILTUP_BIT, CLASS_BITS, LC, RAIL_CROSSING_BIT, RIVER_CROSSING_BIT, type Terrain } from './terrain';
import type { RoadCrossing, RoadNet } from './roadnet';
import { barrelLength, waterOpening, waterSize, type WaterCrossing, type WaterSegment } from './watercourses';
import { cellBounds, clipFootprint, FootprintGrid, insideFootprint, type FootprintCell, type Point2 } from './footprint-geometry';

export interface FootprintConflict {
  id: string;
  feature: 'road' | 'railway' | 'water' | 'stream';
  action: 'relocation' | 'culvert' | 'blocked';
  i: number; s0: number; s1: number; x: number; y: number;
  /** Constructed path/barrel length (affected length for blocked features), m. */
  length: number;
  affectedLength?: number;
  /** Pre-surcharge CZK, already in crossings/culverts; never add this again to the bill. */
  cost: number;
  detail: string;
  roadId?: number; cls?: string; roadCode?: string;
  geometry?: CrossingGeometry;
  original?: CrossingPoint[];
}
export interface FootprintRoute {
  n: number; ds: number; s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>;
  tx: ArrayLike<number>; ty: ArrayLike<number>; kind: ArrayLike<number>; grade: ArrayLike<number>;
  dayL: ArrayLike<number>; dayR: ArrayLike<number>; zDayL: ArrayLike<number>; zDayR: ArrayLike<number>;
  crownWidth: number; runs: Run[];
}
interface Hit { a: number; b: number; i: number; j: number; structure?: FootprintCell['structure'] }
const SETBACK = 3; // Same provisional construction clearance as crossing side links.
const SAMPLE = 5;

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
function subtract(range: [number, number], covered: readonly [number, number][]): [number, number][] {
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
      for (let k = 1; k < spans; k++) add(run.s0 + run.length * k / spans, 'pier', 1.2, w * 0.55);
    } else { add(run.s0, 'portal', 3, w + 2); add(run.s1, 'portal', 3, w + 2); }
  }
  return out;
}

export function footprintConflicts(r: FootprintRoute, terrain: Terrain, roads: RoadNet | undefined,
  crossings: readonly CrossingResult[], rawRoads: readonly RoadCrossing[], water: readonly WaterCrossing[]): { conflicts: FootprintConflict[]; violations: Violation[] } {
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
  const point = (p: Point2): CrossingPoint => ({ ...p, z: terrain.heightAt(p.x, p.y), ground: terrain.heightAt(p.x, p.y), surface: 'terrain' });
  const block = (c: FootprintConflict, title: string, fix: string, rule: string) => {
    conflicts.push(c);
    violations.push({ kind: 'footprint', basis: 'game', s0: c.s0, s1: c.s1, title, fix, detail: c.detail, rule });
  };
  const roadCovered = new Map<number, [number, number][]>();
  const coverRoad = (id: number, a: number, b: number) => { const list = roadCovered.get(id) ?? []; list.push([Math.min(a, b), Math.max(a, b)]); roadCovered.set(id, list); };
  if (roads) {
    for (const c of crossings) {
      if (c.roadId === undefined || !c.geometry || c.issues?.length) continue;
      const g = c.geometry;
      // Only the actually engineered/removed old-road stretch, not an arbitrary station radius.
      // Bridge/tunnel roads are unchanged and cannot excuse an adjacent abutment collision.
      const ends = c.type === 'reconnection' || c.type === 'diversion' ? g.turnarounds
        : c.type === 'overbridge' || c.type === 'junction' ? g.road : undefined;
      if (!ends || ends.length < 2) continue;
      const stations = [ends[0], ends[ends.length - 1]].map(p => roads.wayStation(c.roadId!, p.x, p.y));
      coverRoad(c.roadId, Math.min(...stations), Math.max(...stations));
      // Billing merges adjacent carriageways/junction ways. Transfer only the engineered
      // neighbourhood onto their own chainages, not the entire neighbouring way.
      for (const raw of rawRoads) if (raw.way !== c.roadId && Math.abs(raw.s - c.s) <= CROSSING_RULES.mergeDistance) {
        const offsetX = raw.x - c.x, offsetY = raw.y - c.y;
        const ds = [ends[0], ends[ends.length - 1]].map(p => roads.wayStation(raw.way, p.x + offsetX, p.y + offsetY));
        coverRoad(raw.way, Math.min(...ds), Math.max(...ds));
      }
    }
    for (const c of rawRoads) {
      if (c.s > CROSSING_RULES.endMargin && c.s < r.s[r.n - 1] - CROSSING_RULES.endMargin) continue;
      if (ROAD_CLASSES[c.cls].noAtGrade && c.s > CROSSING_RULES.endpointTolerance && c.s < r.s[r.n - 1] - CROSSING_RULES.endpointTolerance) continue;
      const d = roads.wayStation(c.way, c.x, c.y);
      coverRoad(c.way, d - CROSSING_RULES.endMargin, d + CROSSING_RULES.endMargin);
    }
  }
  const roadHits = new Map<string, { way: number; cls: string; hits: Hit[] }>();
  const streamHits = new Map<string, { segment: WaterSegment; hits: Hit[] }>();
  // Raster classes are independent flags: a road-painted rail/water crossing remains protected.
  const rasterHits = new Map<string, { feature: 'railway' | 'water' | 'stream'; structure?: FootprintCell['structure']; hits: Map<number, { x: number; y: number; count: number }> }>();
  const rasterSeen = new Set<string>();
  for (const cell of cells) {
    const bounds = cellBounds(cell, 14); // largest existing road half-width (D27.5)
    roads?.nearSegments(bounds, segment => {
      const hit = clipFootprint(segment, cell, ROAD_CLASSES[segment.cls].width / 2);
      if (!hit) return;
      const key = `${segment.way}:${cell.structure ?? 'earth'}`;
      let group = roadHits.get(key);
      if (!group) roadHits.set(key, group = { way: segment.way, cls: segment.cls, hits: [] });
      for (const [a, b] of subtract(hit, cell.structure ? [] : roadCovered.get(segment.way) ?? []))
        group.hits.push({ a, b, i: cell.i, j: cell.i, structure: cell.structure });
    });
    terrain.watercourses?.nearSegments(cellBounds(cell, 10), segment => {
      const hit = clipFootprint(segment, cell, cell.structure ? (segment.reach.width ?? 0.5) / 2 : 0);
      if (!hit) return;
      const covered: [number, number][] = [];
      if (!cell.structure) for (const c of water) {
        if (!terrain.watercourses!.connected(c.id, segment.reach.id)) continue;
        const i = Math.max(0, Math.min(r.n - 1, Math.round(c.s / r.ds)));
        if (r.kind[i] !== KIND.earth) continue;
        // Half a station accommodates the same sampled-section resolution used by the barrel
        // model; it is not a blanket exclusion of a connected channel farther along the route.
        const length = barrelLength(c, r.dayL[i] + r.dayR[i]) + r.ds;
        // The priced barrel owns only its geometric neighbourhood, even across OSM tag splits.
        const dx = segment.bx - segment.ax, dy = segment.by - segment.ay, len = segment.length;
        if (!len) continue;
        const projection = ((c.x - segment.ax) * dx + (c.y - segment.ay) * dy) / len;
        const lateral = Math.abs((c.x - segment.ax) * dy - (c.y - segment.ay) * dx) / len;
        if (lateral >= length / 2) continue;
        const half = Math.sqrt((length / 2) ** 2 - lateral ** 2);
        covered.push([segment.d + projection - half, segment.d + projection + half]);
      }
      const key = `${segment.reach.id}:${cell.structure ?? 'earth'}`;
      let group = streamHits.get(key);
      if (!group) streamHits.set(key, group = { segment, hits: [] });
      for (const [a, b] of subtract(hit, covered)) group.hits.push({ a, b, i: cell.i, j: cell.i, structure: cell.structure });
    });
    const [x0, y0, x1, y1] = cellBounds(cell), step = terrain.cell;
    const c0 = Math.max(0, Math.floor(x0 / step)), c1 = Math.min(terrain.nx - 1, Math.floor(x1 / step));
    const r0 = Math.max(0, Math.floor((terrain.height - y1) / step)), r1 = Math.min(terrain.ny - 1, Math.floor((terrain.height - y0) / step));
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
      const index = row * terrain.nx + col, v = terrain.lc[index], cls = v & CLASS_BITS;
      const feature = (v & RAIL_CROSSING_BIT) || cls === LC.rail ? 'railway'
        : (v & RIVER_CROSSING_BIT) || cls === LC.water ? 'water' : cls === LC.stream && !terrain.watercourses ? 'stream' : undefined;
      if (!feature) continue;
      const x = (col + 0.5) * step, y = terrain.height - (row + 0.5) * step;
      // Conservative raster-cell overlap; at most half a pixel uncertainty at the toe.
      if (!insideFootprint({ x, y }, cell, step / 2)) continue;
      const key = `${feature}:${cell.structure ?? 'earth'}`, seenKey = `${key}:${index}`;
      if (rasterSeen.has(seenKey)) continue;
      rasterSeen.add(seenKey);
      let group = rasterHits.get(key);
      if (!group) rasterHits.set(key, group = { feature, structure: cell.structure, hits: new Map() });
      const prev = group.hits.get(cell.i);
      if (prev) prev.count++; else group.hits.set(cell.i, { x, y, count: 1 });
    }
  }
  for (const { way, cls, hits } of roadHits.values()) {
    const merged = union(hits);
    for (let index = 0; index < merged.length; index++) {
    const h = merged[index];
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
    const pad = row.width / 2 + SETBACK;
    const reach = CROSSING_RULES.linkMinLength + 2 * Math.max(...hits.map(v => Math.max(r.dayL[v.i], r.dayR[v.i])));
    let start = Math.max(0, h.a - reach, index ? (merged[index - 1].b + h.a) / 2 : 0);
    let end = Math.min(h.b + reach, index + 1 < merged.length ? (h.b + merged[index + 1].a) / 2 : Infinity);
    // Tie-ins cannot rebill another relocation or run into an already-engineered approach.
    for (const [a, b] of roadCovered.get(way) ?? []) {
      if (b <= h.a) start = Math.max(start, b);
      if (a >= h.b) end = Math.min(end, a);
    }
    const oldPath = roads!.wayPath(way, start, end);
    const path: CrossingPoint[] = [];
    // Retain the real OSM endpoints, sample bends/terrain, and push only intersecting samples to
    // the outer toe. Bounded relaxation resolves neighbouring rotated station rectangles.
    for (let j = 1; j < oldPath.length; j++) {
      const a = oldPath[j - 1], b = oldPath[j], len = Math.hypot(b.x - a.x, b.y - a.y);
      const count = Math.max(1, Math.ceil(len / SAMPLE));
      for (let k = j === 1 ? 0 : 1; k <= count; k++) {
        const t = k / count, q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        for (let attempt = 0; attempt < 8; attempt++) {
          const hit = grid.near(q).find(c => insideFootprint(q, c, pad));
          if (!hit) break;
          const dx = q.x - hit.x, dy = q.y - hit.y, lateral = -dx * hit.ty + dy * hit.tx;
          const target = lateral >= 0 ? hit.left + pad + 0.2 : -hit.right - pad - 0.2;
          q.x -= hit.ty * (target - lateral); q.y += hit.tx * (target - lateral);
        }
        path.push(point(q));
      }
    }
    let invalid = path.length < 2 || oldPath.length < 2;
    if (!invalid) {
      invalid = grid.hits(oldPath[0], row.width / 2) || grid.hits(oldPath[oldPath.length - 1], row.width / 2);
      // Tie-ins are actual old-road ground points, never invented extensions beyond OSM endpoints.
      path[0] = point(oldPath[0]); path[path.length - 1] = point(oldPath[oldPath.length - 1]);
    }
    let length = 0, cost = 0;
    const codes = new Set<string>();
    for (let j = 1; j < path.length; j++) {
      const a = path[j - 1], b = path[j], len = Math.hypot(b.x - a.x, b.y - a.y);
      length += len;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const u = terrain.cover(mid.x, mid.y) & BUILTUP_BIT ? 1 : 0;
      cost += len * row.roadPerKm[u] / 1000; codes.add(row.roadCodes[u]);
      // Check chords as well as vertices; a ribbon jumping through a slope is not mitigation.
      for (let k = 0, count = Math.max(1, Math.ceil(len / 2.5)); k <= count; k++) {
        const t = k / count, p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        if (grid.hits(p, row.width / 2) || terrain.isOob(p.x, p.y) || terrain.crossing(p.x, p.y)) invalid = true;
      }
      if (Math.abs(b.z - a.z) > len * CROSSING_RULES.approachGradient + 0.1) invalid = true;
    }
    base.length = length; base.cost = cost; base.roadCode = [...codes].join(' / ');
    base.geometry = { road: path, width: row.width, schematic: false, ...(invalid ? { clipped: true } : {}) };
    base.detail = `${row.label}: ${base.affectedLength!.toFixed(1)} m affected; ${length.toFixed(1)} m realignment including real-way tie-ins × SPK ${base.roadCode}. ${invalid ? 'Proposed path needs engineering: endpoint, footprint, water/rail, terrain boundary or 6% gradient conflict.' : 'Outside the slope toe; standard road earthworks included in the SPK row.'}`;
    if (invalid) block(base, 'Road realignment needs engineering', 'Move the alignment clear or provide a bridge; the proposed realignment cannot safely tie in', 'A priced realignment must clear the footprint and meet real roads at feasible terrain grades');
    else { base.action = 'relocation'; conflicts.push(base); }
    }
  }
  for (const { segment, hits } of streamHits.values()) for (const h of union(hits)) {
    const w = segment.reach, distances = [0];
    for (let j = 1; j < w.points.length; j++) distances.push(distances[j - 1] + Math.hypot(w.points[j][0] - w.points[j - 1][0], w.points[j][1] - w.points[j - 1][1]));
    let area = 0, truncated = false, minCover = Infinity;
    const original: CrossingPoint[] = [];
    for (let j = 1; j < w.points.length; j++) {
      const lo = Math.max(h.a, distances[j - 1]), hi = Math.min(h.b, distances[j]);
      if (hi <= lo) continue;
      area = Math.max(area, w.catchmentKm2[j - 1], w.catchmentKm2[j]); truncated ||= w.truncated[j - 1] || w.truncated[j];
      const a = w.points[j - 1], b = w.points[j], len = distances[j] - distances[j - 1];
      const count = Math.max(1, Math.ceil((hi - lo) / SAMPLE));
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
        minCover = Math.min(minCover, surface - p.ground);
      }
    }
    if (!original.length) continue;
    const p = original[Math.floor(original.length / 2)], length = h.b - h.a;
    const c: WaterCrossing = { s: r.s[h.i], x: p.x, y: p.y, id: w.id, waterKind: w.kind, width: w.width ?? 0.5, catchmentKm2: area, truncated, sine: 1 };
    const size = waterSize(c, length);
    const ok = !h.structure && size.type !== 'bridge' && minCover >= size.minHeight;
    const conflict: FootprintConflict = { id: `stream:${w.id}:${h.a.toFixed(2)}:${h.structure ?? 'earth'}`, feature: 'stream', action: ok ? 'culvert' : 'blocked', i: h.i,
      s0: Math.max(0, r.s[h.i] - r.ds / 2), s1: Math.min(r.s[r.n - 1], r.s[h.j] + r.ds / 2), x: p.x, y: p.y, length,
      cost: ok ? length * size.perM + 2 * size.head : 0, original,
      detail: `${length.toFixed(1)} m channel outside priced centreline barrels; ${h.structure ?? (ok ? `${waterOpening(size)} longitudinal culvert (research/17)` : 'insufficient cover or exceeds practical culvert limits')}. No automatic channel diversion.` };
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
