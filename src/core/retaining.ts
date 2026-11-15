// Automatic slope-toe retention. The same truncated sections feed volumes, land take, crossing
// geometry, the final collision check and rendering; this is not a violation suppression mask.
import { cellLength } from './cost';
import { slopeHeight } from './earthengineering';
import { cellBounds, clipFootprint, type FootprintCell, type Segment2 } from './footprint-geometry';
import { ROAD_CLASSES } from './data/urban';
import { STRUCTURE_RULES } from './data/prices';
import { retainingAssembly, RETAINING_RULES as R } from './data/remedies';
import { sideSection, DEFAULT_SLOPES, type Sections } from './sections';
import type { Terrain } from './terrain';
import { protectedRasterCells } from './protected-raster';
import type { RoadNet, RoadSegment } from './roadnet';
import { subtract, type FootprintConflict } from './footprint';
import { KIND } from './structures';
import { barrelContains, barrelIntervals, culvertEnvelope, waterWidth, type BarrelEnvelope, type WaterCrossing, type WaterSegment } from './watercourses';
import { planChannelRelocations, type ChannelHit, type ChannelRelocation } from './channel-relocation';

export interface RetainingWall {
  i: number; s0: number; s1: number; side: 'L' | 'R'; offset: number;
  height: number; top: number; bottom: number; cost: number; x: number; y: number;
  feature: 'road' | 'railway' | 'water' | 'stream';
  area: number; perM2: number;
  constrained?: boolean; watertight?: boolean;
}
export interface RetainingRoute extends Sections {
  n: number; ds: number; s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>;
  tx: ArrayLike<number>; ty: ArrayLike<number>; grade: ArrayLike<number>; crownWidth: number;
}
export interface RetainingPlan {
  walls: RetainingWall[]; perCell: Float64Array; landPerCell: Float64Array; forcedBridge: Uint8Array; forcedTunnel: Uint8Array;
  wallSurfaceL: Float64Array; wallSurfaceR: Float64Array;
  channelRelocations: ChannelRelocation[];
  clearanceRequirements: { s: number; z: number; i: number }[];
}
export type RetainingFeatureCache = Map<number, { left: number; right: number; roads: RoadSegment[]; water: WaterSegment[];
  raster: { x: number; y: number; index: number; feature: 'railway' | 'water' | 'stream' }[]; memo?: StationMemo }>;
/** One station's screening outcome, replayed in order when every input it read is unchanged:
 * this candidate set (same object), section widths, grade, barrels and crossing-way map. */
interface StationMemo { left: number; right: number; grade: number; barrels: string; ways: string; events: StationEvent[] }
type StationEvent = [0, Request] | [1, ClearanceRequest] | [2, BridgeRequest] | [3, number] | [4, WaterSegment['reach'], number, number, number]
  | [5, FootprintCell, RoadSegment, number, number, [number, number]];
type Request = { i: number; side: number; limit: number; feature: RetainingWall['feature']; id?: number; constrained: boolean; crossing: number; cap: number };
type ClearanceRequest = { i: number; z: number; id?: number };
type BridgeRequest = { i: number; id?: number };
/** OSM motorway ways represent one carriageway of the D27.5 divided road. */
const roadHalfWidth = (cls: string) => ROAD_CLASSES[cls].width / (cls === 'motorway' ? 4 : 2);
const protectionRank = { road: 0, railway: 1, stream: 2, water: 3 };

/** Contiguous wall faces are one bill/profile fact, not a fresh conflict at every station. */
export function retainingConflicts(walls: readonly RetainingWall[]): FootprintConflict[] {
  const groups = new Map<string, { conflict: FootprintConflict; area: number; height: number }>(), out: FootprintConflict[] = [];
  for (const wall of walls) {
    const key = `${wall.side}:${wall.feature}:${wall.watertight ? 'wet' : 'dry'}`, previous = groups.get(key);
    let group = previous;
    if (!group || wall.s0 > group.conflict.s1 + 0.01) {
      const conflict: FootprintConflict = { id: `retaining:${key}:${wall.i}`, feature: wall.feature, action: 'retaining-wall',
        i: wall.i, s0: wall.s0, s1: wall.s1, x: wall.x, y: wall.y, length: 0, cost: 0, allocations: [], detail: '' };
      group = { conflict, area: 0, height: 0 }; groups.set(key, group); out.push(conflict);
    }
    group.conflict.s1 = wall.s1; group.conflict.length += wall.s1 - wall.s0; group.conflict.cost += wall.cost;
    group.conflict.allocations!.push({ i: wall.i, cost: wall.cost });
    group.area += wall.area; group.height = Math.max(group.height, wall.height);
    group.conflict.detail = `${wall.side === 'L' ? 'Left' : 'Right'} retaining wall: ${group.area.toFixed(1)} m² exposed face, up to ${group.height.toFixed(1)} m high; height-dependent RC/foundation assembly (OTSKP 327325 + 327365 + 13173 + 17411)${wall.watertight ? ', pressure-water membrane/cutoff (711122 + 711519), no pond drainage' : ', rear drain/filter (212625 + 214613)'}. The slope and earthwork volume are truncated at the wall, preserving the ${wall.feature}.`;
  }
  return out;
}

interface RetainingBarrel { c: WaterCrossing; i: number; left: number; right: number; cover: number; envelope: BarrelEnvelope }

/** Source-way chainages where an existing road crosses the route centreline. */
export type CrossingChainages = ReadonlyMap<number, readonly number[]>;

export function planRetainingWalls(r: RetainingRoute, terrain: Terrain, roads?: RoadNet, overrides?: ArrayLike<number>, water: readonly WaterCrossing[] = [], cache?: RetainingFeatureCache, waterElevation?: ReadonlyMap<WaterCrossing, number>, crossingWays?: CrossingChainages): RetainingPlan {
  const { n, ds } = r;
  let barrels: RetainingBarrel[] = water.flatMap(c => {
    const i = Math.min(n - 1, Math.round(c.s / ds)), j = Math.max(0, Math.min(n - 2, Math.floor(c.s / ds)));
    if (overrides?.[i] === KIND.bridge || overrides?.[i] === KIND.tunnel) return [];
    const t = Math.max(0, Math.min(1, (c.s - r.s[j]) / ds));
    const cover = (waterElevation?.get(c) ?? r.grade[j] * (1 - t) + r.grade[j + 1] * t) - terrain.heightAt(c.x, c.y);
    const envelope = culvertEnvelope(c, r.dayL[i], r.dayR[i], ds, r.tx[i], r.ty[i], cover);
    return envelope ? [{ c, i, left: r.dayL[i], right: r.dayR[i], cover, envelope }] : [];
  });
  if (!barrels.length) return retainingPass(r, terrain, roads, overrides, water, cache, barrels, crossingWays);
  // Road/water walls can shorten a crossing's barrel footprint. Re-screen its ownership
  // against the shortened sections, rebuilding from the untouched input so quantities and
  // wall costs are never applied twice. Side-width limits only shrink; the final screen
  // validates the actual envelope. Local query caches are reused.
  const fields = ['cut', 'cutI', 'cutII', 'cutIII', 'fill', 'dayL', 'dayR', 'zDayL', 'zDayR', 'open'] as const;
  const original = fields.map(key => r[key].slice()), sideL = r.sideL?.slice(), sideR = r.sideR?.slice();
  const restore = () => {
    fields.forEach((key, k) => r[key].set(original[k]));
    for (let i = 0; i < n; i++) {
      if (sideL && r.sideL) r.sideL[i] = sideL[i];
      if (sideR && r.sideR) r.sideR[i] = sideR[i];
    }
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const plan = retainingPass(r, terrain, roads, overrides, water, cache, barrels, crossingWays);
    let changed = false;
    barrels = barrels.flatMap(b => {
      const left = Math.min(b.left, r.dayL[b.i]), right = Math.min(b.right, r.dayR[b.i]);
      if (left >= b.left - 1e-6 && right >= b.right - 1e-6) return [b];
      changed = true;
      // Recheck cover too: shortening can switch a box to a pipe with a different
      // minimum cover, not merely move the asymmetric daylight ends inward.
      const envelope = culvertEnvelope(b.c, left, right, ds, r.tx[b.i], r.ty[b.i], b.cover);
      return envelope ? [{ ...b, left, right, envelope }] : [];
    });
    if (!changed) return plan;
    restore();
  }
  // Bound coupled wall/ownership retries. If they do not settle, no hypothetical barrel
  // can waive a constraint: retain/bridge the feature and let the final screen validate it.
  return retainingPass(r, terrain, roads, overrides, water, cache, [], crossingWays);
}

function retainingPass(r: RetainingRoute, terrain: Terrain, roads: RoadNet | undefined, overrides: ArrayLike<number> | undefined,
  water: readonly WaterCrossing[], cache: RetainingFeatureCache | undefined, barrels: readonly RetainingBarrel[], crossingWays?: CrossingChainages): RetainingPlan {
  const { n, ds } = r, w = r.crownWidth / 2;
  const forcedBridge = new Uint8Array(n), forcedTunnel = new Uint8Array(n), perCell = new Float64Array(n), landPerCell = new Float64Array(n);
  const wallSurfaceL = new Float64Array(n).fill(NaN), wallSurfaceR = new Float64Array(n).fill(NaN);
  const requests: Request[] = [];
  const clearanceRequests: ClearanceRequest[] = [];
  const bridgeRequests: BridgeRequest[] = [], unretainable = new Set<number>(), channelHits = new Map<number, ChannelHit>();
  // Every per-station side effect goes through apply(), so it can be recorded and replayed.
  let recording: StationEvent[] | null = null;
  const apply = (e: StationEvent) => {
    recording?.push(e);
    switch (e[0]) {
      case 0: requests.push(e[1]); break;
      case 1: clearanceRequests.push(e[1]); break;
      case 2: bridgeRequests.push(e[1]); break;
      case 3: unretainable.add(e[1]); break;
      case 4: {
        const [, reach, a, b, i] = e, previous = channelHits.get(reach.id);
        if (previous) { previous.a = Math.min(previous.a, a); previous.b = Math.max(previous.b, b); previous.i1 = i; }
        else channelHits.set(reach.id, { reach, a, b, i0: i, i1: i });
        break;
      }
      case 5: {
        const [, c, seg, pad, way, hit] = e;
        crossingHits.push({ c, seg, pad });
        const list = crossingIntervals.get(way);
        if (list) list.push(hit); else crossingIntervals.set(way, [hit]);
        break;
      }
    }
  };
  const propose = (cell: FootprintCell, lateral: number, padding: number, feature: RetainingWall['feature'], gx: number, gy: number, id?: number, crossing = 0, cap = Infinity) => {
    const i = cell.i;
    let limit = Math.abs(lateral) - padding - R.clearance, constrained = false;
    if (limit < w + R.minimumOffset && Math.abs(lateral) - padding - R.constrainedClearance >= w) {
      limit = Math.abs(lateral) - padding - R.constrainedClearance; constrained = true;
    }
    if (limit < w) {
      if (crossing === 2) return; // severed/diverted by its crossing remedy, never bridged for
      const clearance = feature === 'railway' ? STRUCTURE_RULES.railClearance : feature === 'road' ? 6 : STRUCTURE_RULES.riverClearance;
      if (id !== undefined) apply([3, id]);
      if (feature !== 'road') apply([1, { i, z: terrain.heightAt(gx, gy) + clearance, id }]);
      if ((overrides?.[i] ?? -1) < 0 && r.grade[i] - terrain.heightAt(gx, gy) >= clearance) apply([2, { i, id }]);
      return;
    }
    const day = lateral >= 0 ? r.dayL[i] : r.dayR[i];
    if (limit >= day - 0.05) return;
    apply([0, { i, side: lateral >= 0 ? 1 : -1, limit, feature, id, constrained, crossing, cap }]);
  };
  const segment = (c: FootprintCell, seg: Segment2, pad: number, feature: RetainingWall['feature'], id?: number,
    owned: readonly [number, number][] = [], ownedMode = 0, cap = Infinity) => {
    const hit = clipFootprint(seg, c, pad);
    if (!hit || seg.length <= 0) return;
    // Clip ownership BEFORE selecting constraint points: a barrel may cover only the
    // nearest part of a segment. This also makes OSM vertex/way splits immaterial.
    const covered = id === undefined ? owned : barrels.filter(b => terrain.watercourses!.connected(id, b.c.id))
      .flatMap(b => barrelIntervals(seg, b.envelope));
    const at = (d: number) => {
      const t = (d - seg.d) / seg.length;
      return { x: seg.ax + t * (seg.bx - seg.ax), y: seg.ay + t * (seg.by - seg.ay) };
    };
    const pieces = subtract(hit, covered).map(p => [...p, 0]);
    if (ownedMode) for (const [a, b] of owned) if (Math.min(b, hit[1]) > Math.max(a, hit[0])) pieces.push([Math.max(a, hit[0]), Math.min(b, hit[1]), ownedMode]);
    for (const [a, b, crossing] of pieces) {
      const p = at(a), q = at(b), vp = -(p.x - c.x) * c.ty + (p.y - c.y) * c.tx, vq = -(q.x - c.x) * c.ty + (q.y - c.y) * c.tx;
      if (vp * vq <= 0) {
        if (id === undefined) continue; // existing road centreline crossings have their own remedy
        const t = vp / (vp - vq || 1);
        propose(c, 0, pad, feature, p.x + t * (q.x - p.x), p.y + t * (q.y - p.y), id);
      } else {
        const nearest = Math.abs(vp) <= Math.abs(vq) ? p : q;
        propose(c, Math.abs(vp) <= Math.abs(vq) ? vp : vq, pad, feature, nearest.x, nearest.y, id, crossing, crossing ? cap : Infinity);
      }
    }
  };
  // A road crossing the centreline is engineered by its crossing remedy (at-grade approach,
  // diversion, bridge or overbridge). Its connected stretch inside the footprint never forces a
  // tunnel here. Non-separable tracks/service roads are severed/diverted rather than bridged
  // (crossing rules), so they never force a structure and get a wall only where it is cheaper
  // per metre than twice their own SPK relocation rate (e.g. a low toe wall at a grazing track,
  // not a 12 m wall keeping a doomed stub). Separable roads may still force a bridge over them.
  // Other stretches of the same way remain ordinary obstacles; the final screen validates all.
  const crossingHits: { c: FootprintCell; seg: RoadSegment; pad: number }[] = [];
  const crossingIntervals = new Map<number, [number, number][]>();
  // Barrels read by a station: those connected to its water candidates (all of them for raster streams).
  const barrelSig = barrels.map(b => `${water.indexOf(b.c)}:${b.i}:${b.left}:${b.right}:${b.cover}|`);
  const stationBarrels = (candidates: { water: WaterSegment[]; raster: { feature: string }[] }) => {
    if (!barrels.length || (!candidates.water.length && !candidates.raster.length)) return '';
    const stream = candidates.raster.some(p => p.feature === 'stream');
    let key = '';
    for (let k = 0; k < barrels.length; k++)
      if (stream || candidates.water.some(seg => terrain.watercourses!.connected(seg.reach.id, barrels[k].c.id))) key += barrelSig[k];
    return key;
  };
  for (let i = 1; i < n - 1; i++) {
    const c: FootprintCell = { i, s: r.s[i], x: r.x[i], y: r.y[i], tx: r.tx[i], ty: r.ty[i], along: ds / 2,
      left: r.dayL[i], right: r.dayR[i] };
    let candidates = cache?.get(i);
    if (!candidates || candidates.left < c.left || candidates.right < c.right) {
      const query = { ...c, left: c.left + (cache ? 20 : 0), right: c.right + (cache ? 20 : 0) };
      candidates = { left: query.left, right: query.right, roads: [], water: [], raster: [] };
      roads?.nearSegments(cellBounds(query, 14), seg => candidates!.roads.push(seg));
      terrain.watercourses?.nearSegments(cellBounds(query, terrain.watercourses.maxHalfWidth), seg => candidates!.water.push(seg));
      protectedRasterCells(terrain, query, p => candidates!.raster.push(p));
      cache?.set(i, candidates);
    }
    // Which candidate roads are crossing ways (a strict retry removes some) is all the station reads.
    let waysKey = '';
    for (const seg of candidates.roads) waysKey += crossingWays?.has(seg.way) ? '1' : '0';
    const memo = candidates.memo, barrelKey = stationBarrels(candidates);
    if (memo && memo.left === c.left && memo.right === c.right && memo.grade === r.grade[i] && memo.barrels === barrelKey && memo.ways === waysKey) {
      for (const e of memo.events) apply(e);
      continue;
    }
    const events: StationEvent[] = recording = [];
    for (const seg of candidates.roads) {
      const pad = roadHalfWidth(seg.cls);
      if (!crossingWays?.has(seg.way)) { segment(c, seg, pad, 'road'); continue; }
      const hit = clipFootprint(seg, c, pad);
      if (!hit) continue;
      apply([5, c, seg, pad, seg.way, hit]);
    }
    candidates.water.forEach(seg => {
      const pad = waterWidth(seg.reach) / 2;
      const hit = clipFootprint(seg, c, pad);
      if (!hit) return;
      segment(c, seg, pad, seg.reach.kind === 'river' ? 'water' : 'stream', seg.reach.id);
      apply([4, seg.reach, hit[0], hit[1], i]);
    });
    const step = terrain.cell;
    for (const { x, y, feature } of candidates.raster) {
        const dx = x - c.x, dy = y - c.y, along = dx * c.tx + dy * c.ty, off = -dx * c.ty + dy * c.tx;
        if (Math.abs(along) > c.along + step / 2 || off < -c.right - step / 2 || off > c.left + step / 2) continue;
        // A raster-only stream's crossing assembly already owns its local barrel; unknown
        // direction stays conservative, rather than paying both a wall and that same culvert.
        if (feature === 'stream' && barrels.some(b => barrelContains({ x, y }, b.envelope, step / 2))) continue;
        // Crown pixels become grade/structure constraints, never a wall through traffic.
        propose(c, off, step / 2, feature, x, y);
      }
    recording = null;
    if (cache) candidates.memo = { left: c.left, right: c.right, grade: r.grade[i], barrels: barrelKey, ways: waysKey, events };
  }
  for (const [way, intervals] of crossingIntervals) {
    intervals.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [a, b] of intervals) {
      const last = merged[merged.length - 1];
      if (last && a <= last[1] + 0.5) last[1] = Math.max(last[1], b); else merged.push([a, b]);
    }
    const at = crossingWays!.get(way)!;
    crossingIntervals.set(way, merged.filter(([a, b]) => at.some(d => d >= a - 0.5 && d <= b + 0.5)));
  }
  for (const { c, seg, pad } of crossingHits) {
    const row = ROAD_CLASSES[seg.cls];
    segment(c, seg, pad, 'road', undefined, crossingIntervals.get(seg.way), row.separable ? 1 : 2, row.separable ? Infinity : 2 * row.roadPerKm[0] / 1000);
  }
  const channelRelocations = planChannelRelocations(r, terrain, roads, [...channelHits.values()], water).filter(channel => {
    if (unretainable.has(channel.id)) return true;
    let wallPrice = 0;
    const limits = new Map<string, typeof requests[number]>();
    for (const req of requests) if (req.id === channel.id) {
      const key = `${req.i}:${req.side}`, previous = limits.get(key);
      if (!previous || req.limit < previous.limit) limits.set(key, req);
    }
    for (const req of limits.values()) {
      const { i, side, limit } = req, nx = -r.ty[i] * side, ny = r.tx[i] * side;
      const edge = terrain.heightAt(r.x[i] + nx * w, r.y[i] + ny * w), fill = r.grade[i] >= edge;
      const surface = r.grade[i] + (fill ? -1 : 1) * slopeHeight(limit - w, fill ? DEFAULT_SLOPES.fillSlope : DEFAULT_SLOPES.cutSlope, fill);
      const natural = terrain.heightAt(r.x[i] + nx * limit, r.y[i] + ny * limit);
      wallPrice += retainingAssembly(Math.abs(surface - natural), surface < natural && (req.feature === 'water' || req.feature === 'stream')).perM * ds;
    }
    return channel.conflict.cost < wallPrice;
  });
  const diverted = new Set(channelRelocations.map(c => c.id));
  // Binding constraint per cell side, with its crossing/cap metadata. `firm` excludes optional
  // non-separable crossing stretches, so rejecting such a wall on price/feasibility falls back to
  // any independent obligation (rail, water, other roads) at that same side instead of erasing it.
  type Side = { limit: Float64Array; cause: RetainingWall['feature'][]; constrained: Uint8Array; crossing: Uint8Array; cap: Float64Array };
  const select = (keep: (req: typeof requests[number]) => boolean): [Side, Side] => {
    const sides = [1, -1].map(() => ({ limit: new Float64Array(n).fill(Infinity), cause: [] as RetainingWall['feature'][],
      constrained: new Uint8Array(n), crossing: new Uint8Array(n), cap: new Float64Array(n).fill(Infinity) })) as [Side, Side];
    for (const req of requests) if ((req.id === undefined || !diverted.has(req.id)) && keep(req)) {
      const t = sides[req.side > 0 ? 0 : 1];
      if (req.limit < t.limit[req.i] || (Math.abs(req.limit - t.limit[req.i]) < 1e-6 && protectionRank[req.feature] > (protectionRank[t.cause[req.i]] ?? -1))) {
        t.limit[req.i] = req.limit; t.cause[req.i] = req.feature;
        t.constrained[req.i] = req.constrained ? 1 : 0; t.crossing[req.i] = req.crossing; t.cap[req.i] = req.cap;
      }
    }
    // Extend a wall by one cell either side so chords of adjoining wide slope cells do not cut
    // across the protected feature. Never narrow a neighbour more than its own candidate section.
    for (const t of sides) {
      const copy = { limit: t.limit.slice(), cause: t.cause.slice(), constrained: t.constrained.slice(), crossing: t.crossing.slice(), cap: t.cap.slice() };
      for (let i = 1; i < n - 1; i++) for (let j = i - 1; j <= i + 1; j += 2) if (copy.limit[j] < t.limit[i]
        || (Math.abs(copy.limit[j] - t.limit[i]) < 1e-6 && (protectionRank[copy.cause[j]] ?? -1) > (protectionRank[t.cause[i]] ?? -1))) {
        t.limit[i] = copy.limit[j]; t.cause[i] = copy.cause[j]; t.constrained[i] = copy.constrained[j]; t.crossing[i] = copy.crossing[j]; t.cap[i] = copy.cap[j];
      }
    }
    return sides;
  };
  const all = select(() => true), firm = requests.some(req => req.crossing === 2) ? select(req => req.crossing !== 2) : all;
  for (const req of bridgeRequests) if (req.id === undefined || !diverted.has(req.id)) forcedBridge[req.i] = 1;
  for (const channel of channelRelocations) {
    const count = channel.i1 - channel.i0 + 1, land = channel.conflict.landCost ?? 0;
    for (let i = channel.i0; i <= channel.i1; i++) {
      perCell[i] += (channel.conflict.cost - land) / count;
      landPerCell[i] += land / count;
    }
  }
  const walls: RetainingWall[] = [], tpl = { crownWidth: r.crownWidth, ...DEFAULT_SLOPES };
  const sets = all === firm ? [all] : [all, firm];
  for (let i = 1; i < n - 1; i++) for (let side = 1; side >= -1; side -= 2) for (const set of sets) {
    const t = set[side > 0 ? 0 : 1], other = all[side > 0 ? 1 : 0];
    const limit = t.limit[i], day = side > 0 ? r.dayL : r.dayR, zDay = side > 0 ? r.zDayL : r.zDayR;
    if (!Number.isFinite(limit) || limit >= day[i] - 0.05) break;
    const nx = -r.ty[i] * side, ny = r.tx[i] * side;
    const ground = (o: number) => terrain.heightAt(r.x[i] + nx * o, r.y[i] + ny * o);
    const fill = r.grade[i] >= ground(w), surface = r.grade[i] + (fill ? -1 : 1) * slopeHeight(limit - w, fill ? tpl.fillSlope : tpl.cutSlope, fill);
    const height = Math.abs(surface - ground(limit));
    const feature = t.cause[i] ?? t.cause[i - 1] ?? t.cause[i + 1] ?? 'road';
    const watertight = surface < ground(limit) && (feature === 'water' || feature === 'stream');
    const rate = retainingAssembly(height, watertight);
    const otherFoot = Math.max(w, Math.min(side > 0 ? r.dayR[i] : r.dayL[i], other.limit[i]));
    // The footing points inward, below our acquired corridor; no free foundation under a protected neighbour.
    const crossing = t.crossing[i];
    if (rate.perM > t.cap[i]) continue; // dearer than relocating that track: try the firm constraints
    if (height > R.maxHeight || rate.baseWidth > limit + otherFoot) {
      // A crossing way's own stretch is left to its crossing remedy and the final screen.
      if (crossing === 2) continue;
      if ((overrides?.[i] ?? -1) < 0) {
        if (r.grade[i] - ground(0) >= STRUCTURE_RULES.bridgeMinHeight) forcedBridge[i] = 1;
        else if (!crossing && ground(0) - r.grade[i] >= STRUCTURE_RULES.tunnelMinDepth) forcedTunnel[i] = 1;
      }
      break;
    }
    const geology = (o: number) => terrain.groundAt(r.x[i] + nx * o, r.y[i] + ny * o);
    const sideCache = side > 0 ? r.sideL : r.sideR;
    const before = sideCache?.[i] ?? sideSection(r.grade[i], w, tpl, ground, geology), after = sideSection(r.grade[i], w, tpl, ground, geology, limit);
    if (after.day >= before.day - 0.05) break;
    r.cut[i] += after.cut - before.cut; r.fill[i] += after.fill - before.fill;
    r.cutI[i] += after.cutI - before.cutI; r.cutII[i] += after.cutII - before.cutII;
    r.cutIII[i] = Math.max(0, r.cut[i] - r.cutI[i] - r.cutII[i]);
    day[i] = after.day; zDay[i] = after.zDay;
    if (sideCache) sideCache[i] = after;
    (side > 0 ? wallSurfaceL : wallSurfaceR)[i] = surface;
    r.open[i] = r.sideL && r.sideR ? (r.sideL[i].open || r.sideR[i].open ? 1 : 0)
      : r.dayL[i] >= w + 150 - 1e-6 || r.dayR[i] >= w + 150 - 1e-6 ? 1 : 0;
    const length = cellLength(i, n, ds), cost = rate.perM * length;
    perCell[i] += cost;
    walls.push({ i, s0: r.s[i] - ds / 2, s1: r.s[i] + ds / 2, side: side > 0 ? 'L' : 'R', offset: after.day,
      x: r.x[i] + nx * after.day, y: r.y[i] + ny * after.day, height, top: Math.max(surface, after.zDay), bottom: Math.min(surface, after.zDay),
      cost, feature, area: height * length, perM2: rate.perM2, watertight, constrained: !!t.constrained[i] });
    break;
  }
  const required = new Map<number, number>();
  for (const q of clearanceRequests) if (q.id === undefined || !diverted.has(q.id)) required.set(q.i, Math.max(q.z, required.get(q.i) ?? -Infinity));
  return { walls, perCell, landPerCell, forcedBridge, forcedTunnel, wallSurfaceL, wallSurfaceR, channelRelocations,
    clearanceRequirements: [...required].map(([i, z]) => ({ i, s: r.s[i], z })) };
}
