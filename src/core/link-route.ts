// A reroute (the new road of a cut crossed road) as a designer builds it: a profile within its class's
// gradient (research/20), earthworks at most 10 m deep, a culvert where it crosses a stream, never on
// the ground across a motorway, railway, river/pond or through a house. Where the line beside our
// earthworks cannot meet that, a gentler line is searched (it may wind across the slope); where none
// exists the reroute is infeasible and Auto chooses another treatment.
import type { CrossingPoint } from './crossings';
import { ROAD_CLASSES } from './data/urban';
import { barrelLength, waterSize, type WaterCrossing } from './watercourses';
import type { RoadNet } from './roadnet';

type XY = { x: number; y: number };
/** Engine problem codes (crossing-geometry.ts gives them player words). */
export type LinkProblem = 'steep' | 'footprint' | 'motorway' | 'railway' | 'water' | 'building' | 'river' | 'far';
/** A house in the way of a new road is bought out and demolished like one under our own road. */
/** Deepest cut or fill a reroute's own profile may need, m: the same PROVISIONAL support limit as
 * rebuilt roads (road-realignment.ts MAX_SUPPORT) and bridge-over-us ramps (10 m). */
export const LINK_MAX_SUPPORT = 10;
/** Profile sampling along the line, m; obstacles are queried per piece of at most PIECE m. */
const SAMPLE = 5, PIECE = 50, MAX_SAMPLES = 450;
/** Ground departing from a chord between samples by more than this is sampled more finely (the same
 * 0.2 m as crossing-geometry.ts refineTerrain), to at most MAX_REFINED samples. */
const REFINE = 0.2, MAX_REFINED = 480;
/** PROVISIONAL length of a reroute's mouth at either end where it may touch our corridor's edge, m. */
const END_MOUTH = 10;
/** PROVISIONAL search corridor for a gentler line: up to this far out from our earthworks, m. */
export const LINK_CORRIDOR = 100;
const CORRIDOR = LINK_CORRIDOR;
/** Search weight: metres of road one metre of rise beyond the gradient is worth (a search heuristic
 * only; the chosen line is then engineered and checked). */
const STEEP = 50;
/** Station spacing and offset step of the search, m. */
const CELL = 10;

export interface LinkEnv {
  heightAt: (x: number, y: number) => number;
  /** Clearance of a point from our road's earthworks minus `extra` (< 0: inside). */
  margin: (q: XY, extra: number) => number;
  roads?: RoadNet;
  /** What blocks a new road of this half-width from a to b on the ground (raster rail/water). */
  obstacle?: (a: XY, b: XY, half: number) => 'railway' | 'water' | 'building' | null;
  /** Houses (still standing) under a new road of this half-width from a to b, and their price. */
  houses?: (a: XY, b: XY, half: number) => number[];
  houseCost?: (j: number) => number;
  /** Streams (watercourse lines) the chord a→b crosses. */
  streams?: (a: XY, b: XY) => (XY & { crossing: WaterCrossing })[];
  /** Search memo shared by every reroute of one evaluation (terrain and our road are fixed): what
   * stands at a 2 m lattice point (-1 blocked, else the price of the houses there). */
  memo?: { free: Map<number, number> };
}
export interface LinkPlan {
  points: CrossingPoint[];
  problems: LinkProblem[];
  culverts: { x: number; y: number; length: number; cost: number }[];
  /** Pre-surcharge CZK of the culverts (the pavement is billed per metre by the caller). */
  culvertCost: number;
  /** Houses bought out and demolished for it. */
  houses: number[];
  houseCost: number;
  /** The steepest grade its profile was allowed. */
  grade: number;
}

const point = (env: LinkEnv, x: number, y: number, d: number): CrossingPoint => {
  const ground = env.heightAt(x, y);
  return { x, y, z: ground, ground, d, surface: 'terrain' };
};

/** Engineer the line through `controls` (ends on the real roads it joins, at their ground level). */
export function engineerLink(controls: readonly XY[], width: number, env: LinkEnv, grade: number): LinkPlan {
  return profileLink(surveyLink(controls, width, env), grade, env);
}

/** What the line through `controls` meets, whatever its gradient: ground samples, our earthworks,
 * obstacles, houses, and the culverts (with their cover) of the streams it crosses. */
export interface LinkSurvey {
  points: readonly Readonly<CrossingPoint>[];
  problems: readonly LinkProblem[];
  culverts: LinkPlan['culverts'];
  houses: number[];
  /** Lowest / highest level of each sample (earthwork depth limit, culvert cover). */
  lower: readonly number[]; upper: readonly number[];
}
export function surveyLink(controls: readonly XY[], width: number, env: LinkEnv): LinkSurvey {
  const half = width / 2, problems = new Set<LinkProblem>(), ourClearance = 0;
  let points: CrossingPoint[] = [], leg = [0], base = [true];
  let run = 0, total = 0;
  for (let i = 1; i < controls.length; i++) total += Math.hypot(controls[i].x - controls[i - 1].x, controls[i].y - controls[i - 1].y);
  // bounded like every crossing path (crossing-geometry.ts MAX_POINTS): coarser on a very long line
  const sample = Math.max(SAMPLE, total / Math.max(1, MAX_SAMPLES - controls.length));
  for (let i = 0; i < controls.length; i++) {
    if (!i) { points.push(point(env, controls[0].x, controls[0].y, 0)); continue; }
    const a = controls[i - 1], b = controls[i], len = Math.hypot(b.x - a.x, b.y - a.y);
    const count = Math.max(1, Math.ceil(len / sample));
    for (let k = 1; k <= count; k++) { points.push(point(env, a.x + (b.x - a.x) * k / count, a.y + (b.y - a.y) * k / count, run + len * k / count)); leg.push(i); base.push(true); }
    run += len;
  }
  // The ground between samples is not assumed straight: where it departs from the chord by more than
  // REFINE, samples are added (as crossing-geometry.ts refines drawn terrain), so that the profile below
  // sees every hump and dip the drawn road will follow (bounded).
  {
    const out: CrossingPoint[] = [points[0]], outLeg = [leg[0]], outBase = [true];
    let budget = Math.max(0, MAX_REFINED - points.length);
    const split = (a: CrossingPoint, b: CrossingPoint, l: number, depth: number) => {
      let error = 0;
      for (const t of [0.25, 0.5, 0.75]) error = Math.max(error, Math.abs(a.ground + (b.ground - a.ground) * t - env.heightAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)));
      if (error > REFINE && budget > 0 && depth < 4) {
        budget--;
        const m = point(env, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.d! + b.d!) / 2);
        split(a, m, l, depth + 1); out.push(m); outLeg.push(l); outBase.push(false); split(m, b, l, depth + 1);
      }
    };
    for (let i = 1; i < points.length; i++) { split(points[i - 1], points[i], leg[i], 0); out.push(points[i]); outLeg.push(leg[i]); outBase.push(base[i]); }
    points = out; leg = outLeg; base = outBase;
  }
  const culverts: LinkPlan['culverts'] = [], houses = new Set<number>(), streams: { x: number; y: number; d: number; need: number }[] = [], seen = new Set<string>();
  // Off our earthworks (every survey sample), except where it leaves and joins the real roads at its
  // ends: those tie-ins stand on the edge of our corridor by construction (a few metres of mouth).
  const last = points[points.length - 1].d!;
  for (let i = 1; i + 1 < points.length; i++) if (base[i] && points[i].d! > END_MOUTH && points[i].d! < last - END_MOUTH
    && env.margin(points[i], half + ourClearance) < -1e-6) { problems.add("footprint"); break; }
  // What it runs across, in pieces of at most PIECE m along its legs (bounded spatial queries).
  for (let i = 1; i < points.length;) {
    let j = i;
    // a piece is straight: it stays within one leg of the line
    while (j + 1 < points.length && leg[j + 1] === leg[i] && points[j + 1].d! - points[i - 1].d! <= PIECE) j++;
    const lo = i - 1, hi = j, a = points[lo], b = points[hi];
    i = j + 1;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const blocked = env.obstacle?.(a, b, half);
    if (blocked) problems.add(blocked);
    for (const h of env.houses?.(a, b, half) ?? []) houses.add(h);
    // a motorway under the new road's own width (also one met exactly at a piece's end)
    env.roads?.nearSegments([Math.min(a.x, b.x) - half, Math.min(a.y, b.y) - half, Math.max(a.x, b.x) + half, Math.max(a.y, b.y) + half], s => {
      if (ROAD_CLASSES[s.cls]?.noAtGrade && segmentGap(a, b, { x: s.ax, y: s.ay }, { x: s.bx, y: s.by }) <= half) problems.add('motorway');
    });
    // A stream under the new road: a culvert sized like ours (research/17), with its cover built up
    // where it crosses (one culvert per crossing, also where two pieces meet on it).
    for (const w of env.streams?.(a, b) ?? []) {
      const key = `${w.crossing.id}:${Math.round(w.x)},${Math.round(w.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fill = (footprint: number) => waterSize(w.crossing, footprint);
      let size = fill(width + 3);
      size = fill(width + 2 * 1.5 * size.minHeight);
      if (size.type === 'bridge') { problems.add('river'); continue; }
      const length = barrelLength(w.crossing, width + 2 * 1.5 * size.minHeight);
      culverts.push({ x: w.x, y: w.y, length, cost: length * size.perM + 2 * size.head });
      const t = Math.max(0, Math.min(1, ((w.x - a.x) * (b.x - a.x) + (w.y - a.y) * (b.y - a.y)) / (len * len)));
      streams.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, d: a.d! + (b.d! - a.d!) * t, need: env.heightAt(w.x, w.y) + size.minHeight });
    }
  }
  // the crossing itself is a sample of the profile, carrying the culvert's cover (at an end, where the
  // line must meet the old road's ground, the profile reports it cannot)
  for (const w of streams) {
    // (not on a tie-in itself, which stays at the old road's ground: 1 m inside it)
    if (w.d < 1 || w.d > last - 1) {
      const d = Math.max(Math.min(1, last / 2), Math.min(last - Math.min(1, last / 2), w.d)), q = along(points, d);
      w.x = q.x; w.y = q.y; w.d = d;
    }
    let k = points.findIndex(p => p.d! >= w.d - 1e-6);
    if (k < 0) k = points.length - 1;
    if (Math.abs(points[k].d! - w.d) > 0.05 && k > 0) { points.splice(k, 0, point(env, w.x, w.y, w.d)); }
    else if (Math.abs(points[k].d! - w.d) > 0.05) { points.splice(k + 1, 0, point(env, w.x, w.y, w.d)); k++; }
    (points[k] as CrossingPoint & { cover?: number }).cover = Math.max((points[k] as CrossingPoint & { cover?: number }).cover ?? -Infinity, w.need);
  }
  const lower = points.map(p => Math.max(p.ground - LINK_MAX_SUPPORT, (p as CrossingPoint & { cover?: number }).cover ?? -Infinity));
  const upper = points.map(p => p.ground + LINK_MAX_SUPPORT);
  for (const p of points) delete (p as CrossingPoint & { cover?: number }).cover;
  return { points, problems: [...problems], culverts, houses: [...houses], lower, upper };
}

/** The profile of a surveyed line: as close to the ground as `grade` allows, ending on the roads it joins. */
export function profileLink(survey: LinkSurvey, grade: number, env: LinkEnv): LinkPlan {
  const points = survey.points.map(p => ({ ...p })), problems = new Set(survey.problems);
  const lower = survey.lower.slice(), upper = survey.upper.slice(), culverts = survey.culverts;
  const n = points.length;
  lower[0] = upper[0] = points[0].ground; lower[n - 1] = upper[n - 1] = points[n - 1].ground;
  for (let i = 1; i < n; i++) {
    const dz = (points[i].d! - points[i - 1].d!) * grade;
    lower[i] = Math.max(lower[i], lower[i - 1] - dz); upper[i] = Math.min(upper[i], upper[i - 1] + dz);
  }
  for (let i = n - 2; i >= 0; i--) {
    const dz = (points[i + 1].d! - points[i].d!) * grade;
    lower[i] = Math.max(lower[i], lower[i + 1] - dz); upper[i] = Math.min(upper[i], upper[i + 1] + dz);
  }
  for (let i = 0; i < n; i++) {
    let min = lower[i], max = upper[i];
    if (i) { const dz = (points[i].d! - points[i - 1].d!) * grade; min = Math.max(min, points[i - 1].z - dz); max = Math.min(max, points[i - 1].z + dz); }
    if (min > max + 1e-7) problems.add('steep');
    const p = points[i];
    p.z = Math.max(min, Math.min(max, p.ground));
    if (Math.abs(p.z - p.ground) > 0.01) { p.surface = 'ramp'; p.support = p.z >= p.ground ? 'embankment' : 'retaining'; }
    else p.z = p.ground;
  }
  const list = survey.houses;
  return { points, problems: [...problems], culverts, culvertCost: culverts.reduce((a, c) => a + c.cost, 0),
    houses: list, houseCost: list.reduce((a, j) => a + (env.houseCost?.(j) ?? 0), 0), grade };
}

/** The point at distance d along sampled points (by their d). */
function along(points: readonly CrossingPoint[], d: number): XY {
  let k = 1;
  while (k < points.length - 1 && points[k].d! < d) k++;
  const a = points[k - 1], b = points[k], t = Math.max(0, Math.min(1, (d - a.d!) / ((b.d! - a.d!) || 1)));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
/** Least distance between segments ab and cd (0 where they cross or touch). */
function segmentGap(a: XY, b: XY, c: XY, d: XY) {
  const cross = (o: XY, p: XY, q: XY) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  const to = (q: XY, p: XY, r: XY) => {
    const dx = r.x - p.x, dy = r.y - p.y, t = Math.max(0, Math.min(1, ((q.x - p.x) * dx + (q.y - p.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(q.x - p.x - t * dx, q.y - p.y - t * dy);
  };
  return Math.min(to(a, c, d), to(b, c, d), to(c, a, b), to(d, a, b));
}

/** A gentler line from a to b beside our road, as a designer lays it out along the slope: at every
 * station between its ends the line may stand further out from our earthworks (up to `CORRIDOR`), and
 * between stations it may step out or in; the shortest such line whose every step is no steeper on
 * the ground than `grade`, clear of our earthworks, railways, ponds/rivers and motorways, with houses it
 * passes priced as metres of road (`houseRate`: CZK per metre) — dynamic programming over stations.
 * `place(s, offset)` is the point `offset` metres beyond our footprint edge at station s on its side.
 * Bounded: at most ~100 stations × 16 offsets. Returns null when no such line exists. */
export function routeAlong(a: XY, b: XY, s0: number, s1: number, place: (s: number, offset: number) => XY,
  width: number, env: LinkEnv, clearance: number, grade: number, houseRate: number): XY[] | null {
  const half = width / 2, span = Math.abs(s1 - s0);
  const count = Math.max(2, Math.min(60, Math.ceil(span / CELL)));
  // (a metre more than the setback: straight legs between stations bow towards a curving road)
  const levels = Math.round(CORRIDOR / CELL) + 1, base = half + clearance + 1;
  const stations = Array.from({ length: count + 1 }, (_, i) => s0 + (s1 - s0) * i / count);
  type Node = { p: XY; z: number; free: boolean; penalty: number };
  const nodes: Node[][] = stations.map(s => Array.from({ length: levels }, (_, k) => {
    const p = place(s, base + k * CELL);
    // (offsets are measured from our footprint edge, so only a bend of our road can put one inside it)
    if (k < 3 && env.margin(p, base - 0.01) < 0) return { p, z: 0, free: false, penalty: 0 };
    // what stands around it, memoised on a 2 m lattice for every search of this evaluation
    const memoKey = ((Math.round(p.x / 2) + 1_048_576) * 2_097_152 + Math.round(p.y / 2) + 1_048_576) * 64 + Math.round(half * 4);
    let penalty = env.memo?.free.get(memoKey);
    if (penalty === undefined) {
      const grow = half + CELL / 2;
      let ok = !env.obstacle?.({ x: p.x - grow, y: p.y }, { x: p.x + grow, y: p.y }, grow);
      if (ok) env.roads?.nearSegments([p.x - half, p.y - half, p.x + half, p.y + half], seg => { if (ok && ROAD_CLASSES[seg.cls]?.noAtGrade) ok = false; });
      penalty = !ok ? -1 : (env.houses?.({ x: p.x - half, y: p.y }, { x: p.x + half, y: p.y }, half) ?? [])
        .reduce((sum, j) => sum + (env.houseCost?.(j) ?? 0), 0);
      env.memo?.free.set(memoKey, penalty);
    }
    return { p, z: env.heightAt(p.x, p.y), free: penalty >= 0, penalty: Math.max(0, penalty) / Math.max(1, houseRate) };
  }));
  const za = env.heightAt(a.x, a.y), zb = env.heightAt(b.x, b.y);
  // Ground steeper than the gradient is not forbidden (the profile may cut and fill), but each metre
  // of extra height costs as much as STEEP metres of road: the gentlest line wins unless far longer.
  const leg = (p: XY, zp: number, q: XY, zq: number) => {
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    return len + STEEP * Math.max(0, Math.abs(zq - zp) - len * grade);
  };
  let cost = nodes[0].map(n => n.free ? leg(a, za, n.p, n.z) + n.penalty : Infinity);
  const from: Int8Array[] = [];
  for (let i = 1; i <= count; i++) {
    const next = new Array<number>(levels).fill(Infinity), back = new Int8Array(levels).fill(-1);
    for (let k = 0; k < levels; k++) {
      const n = nodes[i][k];
      if (!n.free) continue;
      for (let j = Math.max(0, k - 2); j <= Math.min(levels - 1, k + 2); j++) {
        const m = nodes[i - 1][j];
        if (!Number.isFinite(cost[j])) continue;
        const c = cost[j] + leg(m.p, m.z, n.p, n.z) + n.penalty;
        if (c < next[k]) { next[k] = c; back[k] = j; }
      }
    }
    from.push(back); cost = next;
  }
  let end = -1, total = Infinity;
  for (let k = 0; k < levels; k++) {
    const n = nodes[count][k];
    if (!Number.isFinite(cost[k])) continue;
    const c = cost[k] + leg(n.p, n.z, b, zb);
    if (c < total) { total = c; end = k; }
  }
  if (end < 0) return null;
  const line: XY[] = [b];
  for (let i = count, k = end; i >= 0; i--) { line.push(nodes[i][k].p); if (i) k = from[i - 1][k]; }
  line.push(a); line.reverse();
  // drop collinear stations (the engineered line keeps every bend)
  const out = [line[0]];
  for (let i = 1; i + 1 < line.length; i++) {
    const p = out[out.length - 1], q = line[i], r = line[i + 1];
    if (Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) > 1e-6 * Math.hypot(r.x - p.x, r.y - p.y)) out.push(q);
  }
  out.push(line[line.length - 1]);
  return out;
}
