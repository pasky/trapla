// Turning any mapped road into an editable project road, and building a new one. Pure helpers: the
// caller dispatches the returned commands as one undoable step.
import { buildAlignment, station, type PI, type Vec2 } from '../core/horizontal';
import { horizontalViolations } from '../core/checks';
import { acos } from '../core/detmath';
import { bendRules, horizontalRules } from '../core/data/norms';
import { CATEGORIES, type CategoryId, type LegalClass } from '../core/data/categories';
import { KEPT_TOLERANCE } from '../core/project-kept';
import type { Anchor, EndpointConstraint, ProjectDesign, RoadSpec, RouteDesign, SourceInterval, XYZ } from '../core/project';
import type { ProjectCommand } from '../project-store-contract';
import type { ProjectTransportIndex } from '../core/project-network';
import { groundRoadSourceInfo, promoteGroundRoad } from '../core/project-promotion';
import { ROAD_CLASSES } from '../core/data/urban';
import { classTraffic, type TrafficDefault } from '../core/traffic-census';
import { freeSpan } from './source-editor';
import { leavingBend } from '../core/slip-roads';

/** A grab this close to a junction does not stop there (no 20 m stubs): it extends to the next one, m. */
export const STRETCH_PAST_JUNCTION = 150;
/** A rebuilt stretch stops this far short of a level crossing or a joining bridge/tunnel, m. */
const KEEP_CLEAR = 5;
/** Shorter rebuilt stretches are refused: too short to carry a bend, m. */
export const MIN_STRETCH = 60;
/** The old line is drawn as bends where it strays more than this from a straight chord, m. A display/edit
 * choice, not a design rule: the card states how far the new line is from the old road. */
export const FIT_TOLERANCE = 8;
/** Bends closer than this along the old road are merged: room for two curves at 70 km/h, m. */
export const MIN_BEND_GAP = 80;
/** First design speed of a rebuilt or new road, km/h: the lowest ČSN 73 6101:2018 allows for S 7.5 / S 9.5
 * (nominal 90, lowered by up to 20 where justified; research/00 §4.1). An existing corridor is that
 * justification; the player can raise it. The map's `maxspeed` is the signed limit, not a design speed. */
export const DEFAULT_SPEED = 70;
/** The design speed a road of this cross-section starts with: DEFAULT_SPEED for class roads, the lowest its
 * norm allows for a local road or track (ČSN 73 6110 group C: 30 km/h, "difficult conditions"; ČSN 73 6109:
 * 20 km/h, a secondary track; research/42). The player can raise it. */
export function startSpeed(category: CategoryId): number {
  const c = CATEGORIES[category];
  return c.minor ? Math.min(...c.speeds) : DEFAULT_SPEED;
}
/** PROVISIONAL game tolerance, m: how far the automatic conversion may move the line off the old road so
 * that its bends meet the norm: as far as still counts as "on the old road" (core/project-kept.ts), so the
 * conversion itself never builds anything anew. Beyond it the bend stays as the old road has it. */
export const REPAIR_TOLERANCE = KEPT_TOLERANCE;
/** Where the converted line still leaves the old road, the old road's corners this far along it either side
 * are tried as bends of their own, m: about a village block (game choice, not a design rule). */
const FOLLOW_REACH = 150;

type RoadCategoryId = Exclude<RoadSpec['crossSection'], 'existing'>;
export type Rebuildable = { ok: true; info: ReturnType<typeof groundRoadSourceInfo>; spec: { legalClass: LegalClass; crossSection: RoadCategoryId } }
  | { ok: false; why: string };
/** Which mapped roads the game can rebuild today, and as what. */
export function rebuildable(base: ProjectTransportIndex, sourceId: string): Rebuildable {
  const source = base.source(sourceId);
  if (!source || source.kind !== 'road') return { ok: false, why: 'Railways cannot be changed yet.' };
  const highway = source.tags.highway ?? '', row = ROAD_CLASSES[highway];
  if (row?.noAtGrade || highway === 'motorway_link' || highway === 'trunk_link') return { ok: false, why: 'Motorways and expressways cannot be changed yet.' };
  if (!row) return { ok: false, why: highway.endsWith('_link') ? 'Slip roads cannot be changed yet.' : 'This kind of way cannot be changed.' };
  if (source.bridge || source.tunnel || source.elevation !== 'terrain') return { ok: false, why: 'Bridges and tunnels of existing roads cannot be changed yet.' };
  let info: ReturnType<typeof groundRoadSourceInfo>;
  try { info = groundRoadSourceInfo(base, sourceId); } catch { return { ok: false, why: 'This road’s map data is incomplete.' }; }
  return { ok: true, info, spec: { legalClass: info.legalClass, crossSection: REBUILT_AS[info.legalClass] } };
}
/** What a mapped road is rebuilt as: class I as S 9.5, class II/III as S 7.5, a local road or street as a
 * two-lane local road M 7.5 (ČSN 73 6110 group C), a track as a paved one-lane P 4.0 (ČSN 73 6109), and a
 * service road (a farm or works access, mostly one lane) as P 4.0 too: ČSN 73 6110 §8.1.4 lets such roads be
 * designed as field roads (research/42). The player can change the cross-section. */
const REBUILT_AS: Record<LegalClass, RoadCategoryId> = { I: 'S9.5', II: 'S7.5', III: 'S7.5', local: 'M7.5', service: 'P4', track: 'P4', ramp: 'V7.25' };

/** The stretch a drag at station s rebuilds: to the nearest junction on either side (passing those
 * closer than STRETCH_PAST_JUNCTION), never into a stretch another project road already rebuilds. */
export function derivedStretch(base: ProjectTransportIndex, sourceId: string, s: number, claimed: readonly SourceInterval[]): SourceInterval | null {
  const source = base.source(sourceId); if (!source) return null;
  const length = source.stations[source.stations.length - 1];
  const span = freeSpan(claimed, base.transportData, sourceId, s, length); if (!span) return null;
  const branches = base.branches({ transportData: base.transportData, sourceId, s0: 0, s1: length });
  const junctions = branches.map(b => b.s);
  let lo = Math.max(span.lo, ...junctions.filter(j => j <= s - STRETCH_PAST_JUNCTION));
  let hi = Math.min(span.hi, ...junctions.filter(j => j >= s + STRETCH_PAST_JUNCTION));
  // A level crossing, or a bridge/tunnel joining, cannot be rebuilt yet: the stretch stops short of it.
  // (a level crossing: another kind of line; a branch of the same kind is an ordinary junction or switch)
  for (const b of branches) if (b.other.some(o => { const q = base.source(o.sourceId); return !q || q.kind !== source.kind || q.elevation !== 'terrain'; })) {
    if (Math.abs(b.s - s) <= KEEP_CLEAR) return null;
    if (b.s < s) lo = Math.max(lo, b.s + KEEP_CLEAR); else hi = Math.min(hi, b.s - KEEP_CLEAR);
  }
  // Only where the map has ground under it (a road leaving the map is cut at its last known point).
  if (!base.position(sourceId, s)) return null;
  for (const node of source.stations) if (!base.position(sourceId, node)) {
    if (node < s) lo = Math.max(lo, Math.min(s, ...source.stations.filter(t => t > node && t <= s)));
    else hi = Math.min(hi, Math.max(s, ...source.stations.filter(t => t < node && t >= s)));
  }
  return hi - lo >= MIN_STRETCH ? { transportData: base.transportData, sourceId, s0: lo, s1: hi } : null;
}

/** A project road as built, for `coveredStretches` (a legacy Result's per-station arrays). */
export interface BuiltRoad { name: string; n: number; x: ArrayLike<number>; y: ArrayLike<number>; tx: ArrayLike<number>; ty: ArrayLike<number>;
  kind: ArrayLike<number>; dayL: ArrayLike<number>; dayR: ArrayLike<number>; keptCells?: ArrayLike<number>;
  crossings?: readonly { x: number; y: number; roadId?: number; type: string }[] }
/** Sampling step along the mapped road for `coveredStretches`, m. */
const COVER_STEP = 2;
/** The parts of a mapped road that another project road's earthworks cover, with INDEPENDENCE_SCREEN's
 * 10 m working strip beside them: the old road is gone there (that road cuts it and reroutes or closes
 * it), so a stretch the player rebuilds stops short of them and joins what is left of the old road.
 * Bridges and tunnels cover nothing (the old road stays under or over them); a rebuilt road's kept old
 * road is the old road itself, and so is a road it carries over or under it (its crossings: our bridge
 * over it, its bridge over us, an underpass, a junction). `by`: the name of the road that covers it. */
export function coveredStretches(base: ProjectTransportIndex, sourceId: string, roads: readonly BuiltRoad[], clearance = 10): (SourceInterval & { by: string })[] {
  const source = base.source(sourceId); if (!source) return [];
  const length = source.stations[source.stations.length - 1], out: (SourceInterval & { by: string })[] = [], owner: BuiltRoad[] = [];
  for (const road of roads) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, reach = 0;
    for (let i = 0; i < road.n; i++) {
      minX = Math.min(minX, road.x[i]); maxX = Math.max(maxX, road.x[i]); minY = Math.min(minY, road.y[i]); maxY = Math.max(maxY, road.y[i]);
      if (road.kind[i] === 0) reach = Math.max(reach, Math.abs(road.dayL[i]), Math.abs(road.dayR[i]));
    }
    reach += clearance;
    let open: number | null = null;
    const close = (s1: number) => { if (open !== null) { out.push({ transportData: base.transportData, sourceId, s0: open, s1, by: road.name }); owner.push(road); } open = null; };
    for (let s = 0; s <= length + COVER_STEP / 2; s += COVER_STEP) {
      const at = Math.min(s, length), p = base.position(sourceId, at);
      let covered = false;
      if (p && p.x >= minX - reach && p.x <= maxX + reach && p.y >= minY - reach && p.y <= maxY + reach) {
        let best = Infinity, k = -1;
        for (let i = 0; i < road.n; i++) { const d = (road.x[i] - p.x) ** 2 + (road.y[i] - p.y) ** 2; if (d < best) { best = d; k = i; } }
        // (beyond the road's ends nothing is covered)
        const along = k >= 0 ? Math.abs((p.x - road.x[k]) * road.tx[k] + (p.y - road.y[k]) * road.ty[k]) : Infinity;
        if (along <= 2 * COVER_STEP + 5 && road.kind[k] === 0 && !road.keptCells?.[k]) {
          const side = (p.x - road.x[k]) * -road.ty[k] + (p.y - road.y[k]) * road.tx[k];
          covered = Math.abs(side) <= Math.abs(side > 0 ? road.dayL[k] : road.dayR[k]) + clearance;
        }
      }
      if (covered && open === null) open = Math.max(0, at - COVER_STEP / 2);
      else if (!covered) close(Math.min(length, at - COVER_STEP / 2));
    }
    close(length);
  }
  // where that road carries the old road over or under it, or meets it, the old road is not gone: a
  // covered part around such a crossing (the road on its bridge over our cutting) is no cover (only the
  // covering road's own crossings: another road's bridge there does not uncover it)
  const way = source.legacyNetIndex, carried = (r: BuiltRoad) => (r.crossings ?? [])
    .filter(c => way !== undefined && c.roadId === way && c.type !== 'diversion' && c.type !== 'reconnection');
  return out.filter((c, k) => !carried(owner[k]).some(x => {
    for (let s = c.s0; s <= c.s1 + COVER_STEP / 2; s += COVER_STEP) {
      const p = base.position(sourceId, Math.min(s, c.s1));
      if (p && Math.hypot(p.x - x.x, p.y - x.y) <= COVER_STEP + 5) return true;
    }
    return false;
  }));
}

/** Douglas–Peucker bends of a polyline (interior points only), then bends too close together merged. */
export function fitBends(path: readonly { x: number; y: number; s: number }[], tolerance = FIT_TOLERANCE, gap = MIN_BEND_GAP): PI[] {
  const keep = new Uint8Array(path.length); keep[0] = keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const a = path[i], b = path[j], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    let worst = -1, far = 0;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((path[k].x - a.x) * dy - (path[k].y - a.y) * dx) / len;
      if (d > far) { far = d; worst = k; }
    }
    if (worst > 0 && far > tolerance) { keep[worst] = 1; stack.push([i, worst], [worst, j]); }
  }
  const kept = path.filter((_, k) => keep[k]);
  // Merge clusters: a group of close bends becomes the intersection of its outer legs (one PI).
  const out: PI[] = [];
  let k = 1;
  while (k < kept.length - 1) {
    let m = k;
    while (m + 1 < kept.length - 1 && kept[m + 1].s - kept[m].s < gap) m++;
    if (m === k) out.push({ x: kept[k].x, y: kept[k].y, r: null });
    else {
      const p = kept[k - 1], q = kept[k], u = kept[m], v = kept[m + 1];
      // …where that is the corner the cluster rounds off: ahead of q on the leg coming in, before u on the
      // leg going out, and no further from them than the cluster is long. Legs that run almost parallel
      // (an S-shaped jog) or apart meet far away or behind: such a point would fold the line into a spike
      // (D3 III/11431: a bend 365 m off the road). Then the cluster's middle point stands for it.
      const hit = intersect(p, q, u, v);
      const along = (a: { x: number; y: number }, b: { x: number; y: number }, h: { x: number; y: number }) =>
        ((h.x - a.x) * (b.x - a.x) + (h.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1);
      const corner = hit && along(p, q, hit) >= 1 - 1e-9 && along(v, u, hit) >= 1 - 1e-9
        && Math.hypot(hit.x - q.x, hit.y - q.y) + Math.hypot(hit.x - u.x, hit.y - u.y) <= 3 * (u.s - q.s);
      out.push(corner ? { ...hit!, r: null } : { x: kept[Math.round((k + m) / 2)].x, y: kept[Math.round((k + m) / 2)].y, r: null });
    }
    k = m + 1;
  }
  return out;
}
/** The bend whose drawn curve (arc and its transitions) passes under point p, within `reach` m: a drag that
 * starts there moves that bend. A new bend put inside an existing curve would fold the line back on itself
 * (the curve's corner point lies outside the curve), worst on the sharp corners of old roads. Null: p is on
 * a straight, where a drag adds a bend. */
export function bendAt(a: Vec2, b: Vec2, pis: PI[], speed: number, category: CategoryId, p: Vec2, reach = 15, along = 0): number | null {
  if (!pis.length) return null;
  const al = buildAlignment(a, b, pis, horizontalRules(speed, category), bendRules(pis, speed, category)), st = station(al, 5);
  let best = reach * reach, s = -1;
  for (let k = 0; k < st.n; k++) { const d = (st.x[k] - p.x) ** 2 + (st.y[k] - p.y) ** 2; if (d <= best) { best = d; s = st.s[k]; } }
  if (s < 0) return null;
  // on its curve, or within `along` of it (nearest curve first)
  let hit: (typeof al.curves)[number] | undefined, gap = Infinity;
  for (const c of al.curves) {
    if (!(c.sEnd > c.sStart) || !pis[c.index]) continue;
    const g = Math.max(0, c.sStart - s, s - c.sEnd);
    if (g <= along + st.ds / 2 && g < gap) { gap = g; hit = c; }
  }
  return hit ? hit.index : null;
}
/** How a line between a and b follows the old road `path`: `measure` (problems, the furthest stray, how far
 * each bend's curve strays) and `tighten` (bend i keeps the old road's own, tighter curve where a norm-sized
 * one would leave the old road by more than REPAIR_TOLERANCE: the largest radius within FIT_TOLERANCE). */
function onOldRoad(a: Vec2, b: Vec2, path: readonly { x: number; y: number; s: number }[], speed: number, category: CategoryId) {
  const rules = horizontalRules(speed, category), far = distanceTo(path), rail = CATEGORIES[category].mode === 'railway';
  const measure = (pis: PI[]) => {
    const al = buildAlignment(a, b, pis, rules), st = station(al, 5);
    const off = new Float64Array(st.n); let stray = 0;
    for (let k = 0; k < st.n; k++) stray = Math.max(stray, off[k] = far(st.x[k], st.y[k]));
    /** how far bend i's curve leaves the old road */
    const bend = (i: number) => {
      const c = al.curves[i]; let worst = 0;
      if (c) for (let k = Math.max(0, Math.floor((c.sStart - 5) / 5)); k < st.n && st.s[k] <= c.sEnd + 5; k++) worst = Math.max(worst, off[k]);
      return worst;
    };
    // (without the design: no fix suggestions are worked out, only what is wrong and at which bends)
    let problems: ReturnType<typeof horizontalViolations> | null = null;
    // (a railway's line is checked by the track rules)
    return { get problems() { return problems ??= horizontalViolations(al, speed, rail ? { a, b, pis, category } : undefined); }, stray, bend, radius: (i: number) => al.curves[i]?.r ?? 0, st, off };
  };
  type Measure = ReturnType<typeof measure>;
  const tighten = (pis: PI[], now: Measure, i: number): { pis: PI[]; now: Measure } => {
    if (now.bend(i) <= REPAIR_TOLERANCE) return { pis, now };
    let low = 10, high = now.radius(i);
    if (!(high > low)) return { pis, now };
    const at = (r: number) => pis.map((p, k) => k === i ? { ...p, r } : p);
    for (let k = 0; k < 6; k++) { const mid = (low + high) / 2; if (measure(at(mid)).bend(i) <= FIT_TOLERANCE) low = mid; else high = mid; }
    const next = at(Math.round(low)).map((p, k) => k === i ? { ...p, mapped: true as const } : p);
    return { pis: next, now: measure(next) };
  };
  return { rules, far, measure, tighten };
}
/** The old line as bends, ready to be edited: `fitBends`, then
 * 1. a bend whose norm-sized curve would leave the old road by more than REPAIR_TOLERANCE (a sharp old
 *    corner) keeps the old road's own, tighter curve: the largest radius that stays within FIT_TOLERANCE;
 * 2. where the line still leaves the old road by more than REPAIR_TOLERANCE (close corners merged into one
 *    bend), the old road's corner there becomes a bend of its own (≤ 8 rounds, each must bring it closer);
 * 3. a bounded validity-first repair: each round removes one bend involved in a problem, or slides it along
 *    one of its legs, taking the change that leaves the fewest problems and then strays least, never
 *    further than REPAIR_TOLERANCE from the old road.
 * What still misses the norm lies on the old road and is kept as it is (core/project-kept.ts): the
 * conversion itself builds nothing anew. */
export function fitRoad(a: Vec2, b: Vec2, path: readonly { x: number; y: number; s: number }[], speed: number, category: CategoryId,
  fit: { tolerance: number; gap: number; repair?: boolean } = { tolerance: FIT_TOLERANCE, gap: MIN_BEND_GAP }): PI[] {
  const { rules, far, measure, tighten } = onOldRoad(a, b, path, speed, category);
  let pis = fitBends(path, fit.tolerance, fit.gap), now = measure(pis);
  for (let i = 0; i < pis.length; i++) ({ pis, now } = tighten(pis, now, i));
  // Where the line still leaves the old road (close corners merged into one bend, an S of a village street),
  // the old road's corner furthest from the line there becomes a bend of its own, with its own curve.
  const along = (p: Vec2) => nearestOn(path, p);
  for (let round = 0; round < 8 && now.stray > REPAIR_TOLERANCE; round++) {
    const al = buildAlignment(a, b, pis, rules), st = station(al, 5), line = distanceTo(Array.from({ length: st.n }, (_, k) => ({ x: st.x[k], y: st.y[k] })));
    let k0 = 0; for (let k = 0; k < st.n; k++) if (far(st.x[k], st.y[k]) > far(st.x[k0], st.y[k0])) k0 = k;
    const sWorst = along({ x: st.x[k0], y: st.y[k0] });
    // the old road's corners there, furthest from the line first; the one that brings the line closest wins
    const near: number[] = [];
    for (let j = 1; j < path.length - 1; j++) if (Math.abs(path[j].s - sWorst) <= FOLLOW_REACH) near.push(j);
    near.sort((u, w) => line(path[w].x, path[w].y) - line(path[u].x, path[u].y));
    let next: { pis: PI[]; now: ReturnType<typeof measure> } | null = null;
    for (const v of near.slice(0, 4)) {
      const at = pis.findIndex(p => along(p) > path[v].s), i = at < 0 ? pis.length : at;
      let c = { pis: [...pis.slice(0, i), { x: path[v].x, y: path[v].y, r: null }, ...pis.slice(i)], now };
      c.now = measure(c.pis);
      for (let j = 0; j < c.pis.length; j++) c = tighten(c.pis, c.now, j);
      if (!next || c.now.stray < next.now.stray) next = c;
    }
    if (!next || !(next.now.stray < now.stray - 0.5)) break;
    ({ pis, now } = next);
  }
  // bounded: the bends of the first problem only, eight rounds
  for (let round = 0; fit.repair !== false && round < 8 && now.problems.length; round++) {
    let best: { pis: PI[]; m: ReturnType<typeof measure> } | null = null;
    const limit = Math.max(REPAIR_TOLERANCE, now.stray), first = now.problems.find(v => v.pis?.length || v.pi !== undefined);
    for (const i of first?.pis ?? (first?.pi !== undefined ? [first.pi] : [])) {
      if (!pis[i]) continue;
      const candidates: PI[][] = [pis.filter((_, k) => k !== i)];
      for (const toward of [pis[i - 1] ?? a, pis[i + 1] ?? b]) {
        const d = Math.hypot(toward.x - pis[i].x, toward.y - pis[i].y);
        for (const step of [20, 40, 70, 110]) if (step < 0.6 * d)
          candidates.push(pis.map((p, k) => k === i ? { ...p, x: p.x + (toward.x - p.x) * step / d, y: p.y + (toward.y - p.y) * step / d } : p));
      }
      for (const c of candidates) {
        const m = measure(c);
        if (m.stray > limit || m.problems.length >= now.problems.length) continue;
        if (!best || m.problems.length < best.m.problems.length || (m.problems.length === best.m.problems.length && m.stray < best.m.stray)) best = { pis: c, m };
      }
    }
    if (!best) break;
    pis = best.pis; now = best.m;
  }
  return pis;
}
/** What a line between a and b (`pis`) builds anew off the old line `path`: its 5 m cells further than
 * KEPT_TOLERANCE from it (`cells`), and its problems there (`problems`; a problem wholly on the old line is
 * the old line's own, kept as it is: core/project-kept.ts). With `turnout` (a railway, rad): an end whose
 * first straight leaves the old line at a sharper angle than that counts as a problem too. */
export function builtAnew(a: Vec2, b: Vec2, path: readonly { x: number; y: number; s: number }[], pis: PI[], speed: number, category: CategoryId,
  turnout?: number): { problems: number; cells: number } {
  const m = onOldRoad(a, b, path, speed, category).measure(pis), { st, off } = m;
  const anew = (s0: number, s1: number) => { for (let k = 0; k < st.n; k++) if (st.s[k] >= s0 - 2.5 && st.s[k] <= s1 + 2.5 && off[k] > KEPT_TOLERANCE) return true; return false; };
  let cells = 0; for (let k = 0; k < st.n; k++) if (off[k] > KEPT_TOLERANCE) cells++;
  let problems = m.problems.filter(v => anew(v.s0, v.s1)).length;
  const length = st.s[st.n - 1];
  if (turnout !== undefined && path.length > 1) for (const end of ['a', 'b'] as const) {
    const p = end === 'a' ? a : b, q = pis.length ? pis[end === 'a' ? 0 : pis.length - 1] : end === 'a' ? b : a;
    const along = pointAlong(path, end === 'a' ? Math.min(path[path.length - 1].s, path[0].s + 30) : Math.max(path[0].s, path[path.length - 1].s - 30));
    const tx = along.x - p.x, ty = along.y - p.y, vx = q.x - p.x, vy = q.y - p.y, l = Math.hypot(tx, ty) * Math.hypot(vx, vy);
    if (!(l > 0) || acos(Math.min(1, Math.abs(tx * vx + ty * vy) / l)) <= turnout) continue;
    const reach = Math.hypot(vx, vy);
    if (end === 'a' ? anew(0, reach) : anew(length - reach, length)) problems++;
  }
  return { problems, cells };
}
function pointAlong(path: readonly { x: number; y: number; s: number }[], s: number): Vec2 {
  let i = 1; while (i < path.length - 1 && path[i].s < s) i++;
  const p = path[i - 1], q = path[i], t = Math.max(0, Math.min(1, (s - p.s) / ((q.s - p.s) || 1)));
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}
/** Station of the point of a polyline nearest to p. */
function nearestOn(path: readonly { x: number; y: number; s: number }[], p: { x: number; y: number }): number {
  let best = Infinity, at = path[0]?.s ?? 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    if (d < best) { best = d; at = a.s + t * (b.s - a.s); }
  }
  return at;
}
/** Where a rebuilt road's line leaves its old road (more than KEPT_TOLERANCE away, i.e. built anew): the
 * bend before it first leaves and the bend after it last returns (null: an end of the line lies in it).
 * Null when the whole line stays on the old road. */
function playerPart(a: Vec2, b: Vec2, pis: PI[], rules: ReturnType<typeof horizontalRules>, oldPath: readonly { x: number; y: number }[]): { before: number | null; after: number | null } | null {
  const al = buildAlignment(a, b, pis, rules), st = station(al, 5), far = distanceTo(oldPath);
  let first = Infinity, last = -Infinity;
  for (let k = 0; k < st.n; k++) if (far(st.x[k], st.y[k]) > KEPT_TOLERANCE) { first = Math.min(first, st.s[k]); last = st.s[k]; }
  if (last < first) return null;
  let before: number | null = null, after: number | null = null;
  for (const c of al.curves) {
    if (!pis[c.index]) continue;
    if (c.sEnd < first && (before === null || c.index > before)) before = c.index;
    if (c.sStart > last && (after === null || c.index < after)) after = c.index;
  }
  return { before, after };
}
/** Distance from a point to a polyline, through a 100 m grid of its segments (a whole-line scan only for
 * points further than 100 m from it). */
function distanceTo(path: readonly { x: number; y: number }[]): (x: number, y: number) => number {
  const CELL = 100, grid = new Map<string, number[]>();
  for (let k = 1; k < path.length; k++) {
    const p = path[k - 1], q = path[k];
    for (let cx = Math.floor(Math.min(p.x, q.x) / CELL) - 1; cx <= Math.floor(Math.max(p.x, q.x) / CELL) + 1; cx++)
      for (let cy = Math.floor(Math.min(p.y, q.y) / CELL) - 1; cy <= Math.floor(Math.max(p.y, q.y) / CELL) + 1; cy++) {
        const key = `${cx}:${cy}`, list = grid.get(key); if (list) list.push(k); else grid.set(key, [k]);
      }
  }
  const segment = (k: number, x: number, y: number) => {
    const p = path[k - 1], q = path[k], dx = q.x - p.x, dy = q.y - p.y;
    const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - p.x - t * dx, y - p.y - t * dy);
  };
  return (x, y) => {
    let best = Infinity;
    for (const k of grid.get(`${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`) ?? []) best = Math.min(best, segment(k, x, y));
    if (best === Infinity) for (let k = 1; k < path.length; k++) best = Math.min(best, segment(k, x, y));
    return best;
  };
}
function intersect(p: { x: number; y: number }, q: { x: number; y: number }, u: { x: number; y: number }, v: { x: number; y: number }) {
  const d1x = q.x - p.x, d1y = q.y - p.y, d2x = v.x - u.x, d2y = v.y - u.y, den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((u.x - p.x) * d2y - (u.y - p.y) * d2x) / den;
  return { x: p.x + t * d1x, y: p.y + t * d1y };
}

/** Greatest distance of a polyline's points from another polyline, m (how far a new line strays). */
export function strayDistance(line: readonly { x: number; y: number }[], from: readonly { x: number; y: number }[]): number {
  let worst = 0;
  for (const p of line) {
    let best = Infinity;
    for (let i = 1; i < from.length; i++) {
      const a = from[i - 1], b = from[i], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

/** A road's traffic where the player has not said otherwise: the census count of its stretch or the
 * average of its class (core/traffic-census.ts). Editable in the road's card. */
const startTraffic = (t: TrafficDefault, speed: number): RoadSpec['operations'] => ({ aadt: t.aadt, heavyShare: t.heavyShare, speed, speedPolicy: 'design' });
/** Is this still the traffic the game filled in (so the card can say where the number comes from)? */
export const isTraffic = (op: RoadSpec['operations'], t: TrafficDefault) => op.aadt === t.aadt && Math.abs(op.heavyShare - t.heavyShare) < 1e-9;

/** The rebuilt stretch as an editable road: exact source claim and branch connections (core promotion),
 * its line converted ONCE, explicitly, into bends that follow the old road (the caller tells the player). */
export function rebuildCommand(base: ProjectTransportIndex, interval: SourceInterval, ids: { routeId: string; acousticSourceId: string }): Extract<ProjectCommand, { type: 'promote' }> {
  const what = rebuildable(base, interval.sourceId);
  if (!what.ok) throw new Error(what.why);
  const command = promoteGroundRoad(base, { ...ids, interval, name: what.info.name.charAt(0).toUpperCase() + what.info.name.slice(1),
    specification: { kind: 'road', policy: 'existing-ground', legalClass: what.info.legalClass, crossSection: 'existing',
      existingWidth: what.info.width, designSpeed: DEFAULT_SPEED, operations: startTraffic(base.traffic(interval, what.info.legalClass), DEFAULT_SPEED) } });
  const route = command.routes[0];
  if (route.kind !== 'road' || route.alignment.kind !== 'reference') throw new Error('Unexpected promotion');
  // Noise and travel time use the signed speed where the map has one; the line is designed for its start speed.
  const speed = startSpeed(what.spec.crossSection);
  const operations = startTraffic(base.traffic(interval, what.info.legalClass), speed);
  if (what.info.taggedSpeed !== null && what.info.taggedSpeed !== speed) { operations.speed = what.info.taggedSpeed; operations.speedPolicy = 'independent'; }
  route.specification = { kind: 'road', policy: 'legacy-road', ...what.spec, designSpeed: speed, operations };
  route.alignment = { kind: 'pi', pis: fitRoad(route.endpoints.a.position, route.endpoints.b.position, route.alignment.path, speed, what.spec.crossSection),
    vertical: { kind: 'auto', pins: [] }, controls: { structureOverrides: [] } };
  return command;
}

/** `travel`: an end on a motorway's carriageway (a slip road's gore), the traffic's direction there (not saved: the
 * new slip road's first bend is put along it) */
export interface PlacedEnd { position: XYZ; anchor: Anchor; travel?: { x: number; y: number };
  /** an end on a mapped road: that road's direction there (not saved: a new slip road meets it square) */
  along?: { x: number; y: number } }
/** The class a road built with Build → Road starts as. */
export const NEW_ROAD_CLASS = 'II';
/** A new straight class II road between two placed ends; bent afterwards like any road. Its traffic
 * starts as the average class II road: an estimate the card labels and the player changes. */
export function newRoad(project: ProjectDesign, a: PlacedEnd, b: PlacedEnd, ids: { routeId: string; acousticSourceId: string }): RouteDesign {
  const used = new Set(project.routes.map(r => r.name));
  let name = 'New road';
  for (let n = 2; used.has(name); n++) name = `New road ${n}`;
  const end = (e: PlacedEnd): EndpointConstraint => ({ position: { ...e.position }, anchor: structuredClone(e.anchor), binding: 'resolved' });
  const spec: RoadSpec = { kind: 'road', policy: 'legacy-road', legalClass: NEW_ROAD_CLASS, crossSection: 'S7.5', designSpeed: DEFAULT_SPEED, operations: startTraffic(classTraffic(NEW_ROAD_CLASS), DEFAULT_SPEED) };
  return { id: ids.routeId, acousticSourceId: ids.acousticSourceId, name, revision: 0, role: 'auxiliary', kind: 'road',
    endpoints: { a: end(a), b: end(b) }, specification: spec,
    alignment: { kind: 'pi', pis: [], vertical: { kind: 'auto', pins: [] }, controls: { structureOverrides: [] } } };
}

/** The class a slip road's traffic starts as: the average class II road, as a new road's (an estimate the card labels). */
export const SLIP_ROAD_TRAFFIC = 'II';
/** A new one-way slip road (Build → Slip road, core/slip-roads.ts) between two placed ends, one on a motorway's
 * carriageway: it leaves (joins) the carriageway along the traffic through one bend put 150 m (at most 45 % of the
 * way) along it from the gore; where its other end joins a mapped road, a second bend there turns it to meet that
 * road square (a diamond's slip road, research/90 §6: its terminal a junction on the crossing road), else it runs
 * straight to its other end. 50 km/h, one lane. */
export function newSlipRoad(project: ProjectDesign, a: PlacedEnd, b: PlacedEnd, ids: { routeId: string; acousticSourceId: string }): RouteDesign {
  const used = new Set(project.routes.map(r => r.name));
  let name = 'Slip road';
  for (let n = 2; used.has(name); n++) name = `Slip road ${n}`;
  const end = (e: PlacedEnd): EndpointConstraint => ({ position: { ...e.position }, anchor: structuredClone(e.anchor), binding: 'resolved' });
  const speed = 50, spec: RoadSpec = { kind: 'road', policy: 'legacy-road', legalClass: 'ramp', crossSection: 'V7.25', designSpeed: speed,
    operations: startTraffic(classTraffic(SLIP_ROAD_TRAFFIC), speed) };
  const exit = !!a.travel, g = exit ? a : b, other = exit ? b : a;
  const reach = Math.min(150, 0.45 * Math.hypot(other.position.x - g.position.x, other.position.y - g.position.y));
  const pis = g.travel ? [leavingBend({ ...g.position, travel: g.travel }, exit ? 'exit' : 'entry', reach)] : [];
  const square = pis.length && other.along && g.travel ? squareBend(other.position, other.along, pis[0], { ...g.position, travel: g.travel }) : null;
  if (square) { if (exit) pis.push(square); else pis.unshift(square); }
  return { id: ids.routeId, acousticSourceId: ids.acousticSourceId, name, revision: 0, role: 'auxiliary', kind: 'road',
    endpoints: { a: end(a), b: end(b) }, specification: spec,
    alignment: { kind: 'pi', pis, vertical: { kind: 'auto', pins: [] }, controls: { structureOverrides: [] } } };
}

/** The bend before a slip road's end on a road (at `t`, the road running along `along`) that makes its last leg
 * square to the road: on the road's normal towards the slip road's gore `g`, a quarter of the way to the leaving
 * bend `first` (40–90 m: room for the bend and a straight junction mouth). Where the road crosses the motorway
 * askew, the normal leads back towards the motorway on one side and away from it on the other: the bend is kept at
 * least halfway out from the leaving bend to the end there (clear of the motorway's slopes), and at most 20 m
 * further out than the end on the other side. PROVISIONAL: a game default the player drags. Null where that leaves
 * under 30 m, the road runs nearly towards the gore (SQUARE_MIN), or too little room is left before the leaving bend. */
/** How far off the road's normal the leaving bend may lie for a square last leg: cos 80° (the road running nearly towards
 * the gore). Beyond, the slip road would leave the road and turn back along it; below, without the square bend it runs
 * along the road and crosses it (Nudvojovická, I/35 km 1.67, at cos 0.35 it did). Game rule. */
const SQUARE_MIN = Math.cos(80 * Math.PI / 180);
/** Under cos 70° off the normal the turn onto the square leg needs a longer one: 85 m (a 50 km/h slip road's 85 m radius
 * through about 70°, tangent 85 · tan 35° ≈ 60 m, and 25 m of straight mouth and transition). Game rule (data/norms.ts ramp radii). */
const SQUARE_TURN = Math.cos(70 * Math.PI / 180), SQUARE_TURN_LEG = 85;
export function squareBend(t: { x: number; y: number }, along: { x: number; y: number }, first: { x: number; y: number },
  g: { x: number; y: number; travel: { x: number; y: number } }) {
  const l = Math.hypot(along.x, along.y) || 1;
  let nx = -along.y / l, ny = along.x / l;
  const fx = first.x - t.x, fy = first.y - t.y, reach = Math.hypot(fx, fy);
  if (nx * fx + ny * fy < 0) { nx = -nx; ny = -ny; }
  // (the leaving bend well off the road's normal: the slip road would run back along the road)
  const off = (nx * fx + ny * fy) / (reach || 1);
  if (off < SQUARE_MIN || Math.hypot(g.x - t.x, g.y - t.y) < 150) return null;
  // out: away from the motorway, on the slip road's side; o(p): how far out p is from the gore
  let ox = -g.travel.y, oy = g.travel.x;
  if (ox * (first.x - g.x) + oy * (first.y - g.y) < 0) { ox = -ox; oy = -oy; }
  const o = (p: { x: number; y: number }) => ox * (p.x - g.x) + oy * (p.y - g.y), out = nx * ox + ny * oy;
  let d = Math.min(90, Math.max(40, reach / 4));
  if (out < -1e-6) d = Math.min(d, (o(t) - (o(first) + o(t)) / 2) / -out);
  else if (out > 1e-6) d = Math.min(d, 20 / out);
  // (a road running nearly towards the gore: the slip road turns through most of a right angle there, room for its curve)
  // (away from the motorway only: towards it the bend stays where it keeps clear of the motorway's slopes)
  if (off < SQUARE_TURN && out >= -1e-6) d = Math.max(d, SQUARE_TURN_LEG);
  if (!(d >= 30) || reach - d < 60) return null;
  return { x: t.x + nx * d, y: t.y + ny * d, r: null };
}

const nearestStation = nearestOn;

/** The rebuilt road with its ends moved along the old road to [s0, s1] (one undoable edit):
 * a fresh exact claim, end anchors and branch connections (core promotion), its bends kept where
 * they still lie inside, bends of a newly included old stretch added, and its station-based choices
 * (height pins, structures, walls, hand heights) shifted with the start. */
export function moveStretchEnds(base: ProjectTransportIndex, project: ProjectDesign, routeId: string, s0: number, s1: number,
  /** the exact claim, end anchors and branch connections for the new interval (another kind's own promotion,
   * e.g. a railway's); default: the ground-road promotion. Only its endpoints and connections are used. */
  promote?: (interval: SourceInterval, route: RouteDesign) => Extract<ProjectCommand, { type: 'promote' }>): ProjectDesign {
  const route = project.routes.find(r => r.id === routeId);
  const old = route?.source?.intervals[0];
  if (!route || !old || route.alignment.kind !== 'pi' || route.source!.intervals.length !== 1) throw new Error('Not a rebuilt stretch');
  if (!(s1 - s0 >= MIN_STRETCH)) throw new Error('Stretch too short');
  const interval = { ...old, s0, s1 };
  // Promotion re-derives the exact claim, end anchors and branch connections; the rebuilt road keeps its own specification.
  const command = promote ? promote(interval, route) : (() => {
    if (route.kind !== 'road') throw new Error('A non-road stretch needs its own promotion');
    const info = groundRoadSourceInfo(base, old.sourceId);
    return promoteGroundRoad(base, { routeId: route.id, acousticSourceId: route.acousticSourceId, interval, name: route.name,
      specification: { kind: 'road', policy: 'existing-ground', legalClass: info.legalClass, crossSection: 'existing', existingWidth: info.width,
        designSpeed: route.specification.designSpeed, operations: route.specification.operations } });
  })();
  const fresh = command.routes[0];
  if (fresh.id !== route.id) throw new Error('Promotion must keep the route');
  const wide = base.path({ ...old, s0: Math.min(s0, old.s0), s1: Math.max(s1, old.s1) });
  const category = route.kind === 'road' && route.specification.crossSection !== 'existing' ? route.specification.crossSection as CategoryId : null;
  const a = fresh.endpoints.a.position, z = fresh.endpoints.b.position;
  /** the old road from station `from` to `to` as bends, between line points `p` and `q` (on or beside it) */
  const added = (from: number, to: number, p: Vec2, q: Vec2): PI[] => {
    if (!(to - from > 1)) return [];
    const path = base.path({ ...old, s0: from, s1: to }).map(v => ({ x: v.x, y: v.y, s: v.s }));
    path[0] = { ...path[0], x: p.x, y: p.y }; path[path.length - 1] = { ...path[path.length - 1], x: q.x, y: q.y };
    return category ? fitRoad(p, q, path, route.specification.designSpeed, category) : fitBends(path);
  };
  const turns = (prev: { x: number; y: number }, p: { x: number; y: number }, next: { x: number; y: number }) =>
    Math.abs(Math.atan2((p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x), (p.x - prev.x) * (next.x - p.x) + (p.y - prev.y) * (next.y - p.y))) > Math.PI / 180;
  const all = route.alignment.pis, oldA = base.position(old.sourceId, old.s0)!, oldZ = base.position(old.sourceId, old.s1)!;
  const inside = (p: PI) => { const s = nearestStation(wide, p); return s > s0 + 1 && s < s1 - 1; };
  // A newly included piece of old road is converted as the first drag converts the stretch, joined where the
  // line stays on the old road: at the old end (a bend where the line turns there), or at a bend outside the
  // player's own part (the bends from where the line first leaves the old road to where it last returns),
  // refitting the old road from there. The join that builds least anew wins, then the one with fewest
  // problems: a norm-sized curve at the old end, now inside, can leave the old road in a village corner
  // (D3 III/11431), which a refit from the bend before it keeps as the old road has it.
  type Side = { pis: PI[]; from: number; to: number; join?: boolean };
  const sides: Side[][] = [[{ pis: [], from: 0, to: all.length - 1 }], [{ pis: [], from: 0, to: all.length - 1 }]];
  const rules = category ? horizontalRules(route.specification.designSpeed, category) : null;
  const own = rules && (s0 < old.s0 || s1 > old.s1) ? playerPart(route.endpoints.a.position, route.endpoints.b.position, all, rules, base.path(old)) : null;
  if (s0 < old.s0) {
    const head = added(s0, old.s0, a, oldA);
    const join = turns(head.at(-1) ?? a, oldA, all[0] ?? oldZ);
    sides[0] = [{ pis: [...head, ...(join ? [{ ...oldA, r: null }] : [])], from: 0, to: all.length - 1, join }];
    if (rules) for (const j of new Set(own ? (own.before === null ? [] : [own.before, 0]) : [0])) if (all[j] && inside(all[j]))
      sides[0].push({ pis: added(s0, nearestStation(wide, all[j]), a, all[j]), from: j, to: all.length - 1 });
  }
  if (s1 > old.s1) {
    const tail = added(old.s1, s1, oldZ, z);
    const join = turns(all.at(-1) ?? oldA, oldZ, tail[0] ?? z);
    sides[1] = [{ pis: [...(join ? [{ ...oldZ, r: null }] : []), ...tail], from: 0, to: all.length - 1, join }];
    if (rules) for (const j of new Set(own ? (own.after === null ? [] : [own.after, all.length - 1]) : [all.length - 1])) if (all[j] && inside(all[j]))
      sides[1].push({ pis: added(nearestStation(wide, all[j]), s1, all[j], z), from: 0, to: j });
  }
  let pis: PI[] = [];
  if (!rules || !(s0 < old.s0 || s1 > old.s1)) pis = [...sides[0][0].pis, ...all.filter(inside), ...sides[1][0].pis];
  else {
    const fit = onOldRoad(a, z, base.path(interval), route.specification.designSpeed, category!), far = fit.far;
    let best: { pis: PI[]; anew: number; problems: number } | null = null;
    const options: PI[][] = [];
    const mine = new Set(own ? all.slice((own.before ?? -1) + 1, own.after ?? all.length) : []);
    for (const h of sides[0]) for (const t of sides[1]) {
      const from = Math.max(h.from, t.from), to = Math.min(h.to, t.to);
      if (from > to + 1) continue;
      const middle = all.slice(from, to + 1).filter(inside);
      let c = { pis: [...h.pis, ...middle, ...t.pis], now: null as ReturnType<typeof fit.measure> | null };
      // the old end, now inside, and the bends beside it keep the old road's own curve as the conversion's do
      // (the player's own bends stay as they are)
      if (h.join || t.join) for (let j = 0; j < c.pis.length; j++) if (!mine.has(c.pis[j])) c = fit.tighten(c.pis, c.now ?? fit.measure(c.pis), j);
      options.push(c.pis);
    }
    // nothing off the old road: also the whole new stretch converted afresh
    if (!own) options.push(added(s0, s1, a, z));
    for (const c of options) {
      const al = buildAlignment(a, z, c, rules), st = station(al, 5);
      let anew = 0; for (let k = 0; k < st.n; k++) if (far(st.x[k], st.y[k]) > KEPT_TOLERANCE) anew++;
      const problems = horizontalViolations(al, route.specification.designSpeed).length;
      if (!best || anew < best.anew || (anew === best.anew && problems < best.problems)) best = { pis: c, anew, problems };
    }
    pis = best!.pis;
  }
  pis = pis.map(p => ({ x: p.x, y: p.y, r: p.r, ...(p.mapped && p.r !== null ? { mapped: true as const } : {}) }));
  const shift = old.s0 - s0, length = s1 - s0;
  const moveRange = <T extends { s0: number; s1: number }>(list: readonly T[] | undefined) => list?.flatMap(r => {
    const a = Math.max(0, r.s0 + shift), b = Math.min(length, r.s1 + shift); return b > a ? [{ ...r, s0: a, s1: b }] : [];
  });
  const controls = structuredClone(route.alignment.controls);
  if (controls.structureOverrides) controls.structureOverrides = moveRange(controls.structureOverrides)!;
  if (controls.wallOverrides) controls.wallOverrides = moveRange(controls.wallOverrides)!;
  const v = structuredClone(route.alignment.vertical);
  const movePins = (pins: { s: number; z: number }[] | undefined) => pins?.flatMap(p => p.s + shift > 0 && p.s + shift < length ? [{ ...p, s: p.s + shift }] : []);
  if (v.kind === 'auto') { v.pins = movePins(v.pins)!; delete v.manualVpis; }
  // Hand heights cannot follow a moved end exactly: the profile returns to Auto with the pins kept.
  const vertical = v.kind === 'manual' ? { kind: 'auto' as const, pins: movePins(v.autoPins) ?? [] } : v;
  const next = structuredClone(project);
  next.routes = next.routes.map(r => r.id !== routeId ? r : { ...r, endpoints: fresh.endpoints, source: { ...route.source!, intervals: [interval] },
    alignment: { kind: 'pi', pis, vertical, controls } } as RouteDesign);
  // Traffic the game filled in follows the stretch (its middle may now lie in another census section);
  // the player's own number stays.
  const moved = next.routes.find(r => r.id === routeId)!;
  if (moved.kind === 'road' && isTraffic(moved.specification.operations, base.traffic(old, moved.specification.legalClass))) {
    const t = base.traffic(interval, moved.specification.legalClass);
    moved.specification.operations = { ...moved.specification.operations, aadt: t.aadt, heavyShare: t.heavyShare };
  }
  next.connections = [...next.connections.filter(c => !c.ports.some(p => p.kind === 'route' && p.routeId === routeId)), ...command.connections];
  return next;
}
