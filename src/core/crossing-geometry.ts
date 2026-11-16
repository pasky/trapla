// Bounded study geometry on real OSM polylines. Quantities are measured from these same paths.
import type { CrossingGeometry, CrossingIssue, CrossingPoint, CrossingResult, CrossingRoute } from './crossings';
import { ACCESS, CROSSING_RULES, JUNCTION, ROAD_CLASSES } from './data/urban';
import type { RoadNet } from './roadnet';
import { bridgeModel } from './bridge';
import { smoothLink } from './crossing-link';
import { engineerLink, LINK_CORRIDOR, LINK_MAX_SUPPORT, profileLink, routeAlong, surveyLink, type LinkEnv, type LinkPlan, type LinkProblem } from './link-route';
import { crossingWorks, WORKS_COVER_ROAD, WORKS_TIE_SHARED, WORKS_TIE_TOO_LONG } from './crossing-works';
import { LOWERING_RULES, RETAINING_RULES, retainingAssembly, sagDrainage, underpassAssembly, UNDERPASS_RULES } from './data/remedies';
import { KIND } from './structures';

const MAX_POINTS = 500, MAX_REACH = CROSSING_RULES.linkHardReach, STEP = 10, SETBACK = 3;
/** Diagnostic when a raised approach cannot reach the old road's ground within the class gradient. */
export const RAMP_TOO_LONG = 'Approach ramp cannot get back down to the old road within its steepest allowed slope';
/** PROVISIONAL game limit: longest ramp on either side of a bridge over our road, m. */
export const MAX_RAMP_LENGTH = 250;
export const RAMP_TOO_HIGH = 'Approach earthwork exceeds';
const CLEARANCE = 4.8, DEPTH = CROSSING_RULES.underDepth - CLEARANCE;
/** Reroute work kept across evaluate()'s engineering passes (its strict retry), for one design on fixed
 * terrain and roads: the crossed ways' traced lines, and smoothed lines / engineered reroutes, each
 * reused only while our footprint within PERSIST_REACH of its stations is exactly unchanged. */
export interface CrossingCache {
  paths: Map<string, CachedPath>;
  links: Map<string, { i0: number; left: Float64Array; right: Float64Array; value: unknown }>;
}
export const crossingCache = (): CrossingCache => ({ paths: new Map(), links: new Map() });
/** Beyond the chainages a reroute's computation consulted, our footprint decides which houses under it are
 * already demolished (a house is taken by the sections of our road beside it), m. */
const PERSIST_PAD = 50;
/** How far beyond a kept crossed way's rebuilt stretch Auto looks for it running back under our
 * earthworks, m (engine screen, the reroute search corridor). */
const RUN_BACK = LINK_CORRIDOR;
/** Internal: an Auto reroute candidate that could not be worth building (never shown). */
const OVER_BUDGET = 'Reroute candidate over budget';
/** The box does not fit even with the crossed way lowered as far as it may be. */
const UNDERPASS_TOO_LOW = 'Embankment is too low over the underpass box';
type XY = { x: number; y: number };
type WayPoint = XY & { d: number };
type CachedPath = { path: readonly Readonly<WayPoint>[]; diagnostics: readonly string[] };
/** Immutable shared way paths, stably ordered by distance from their crossing. */
const sortedPaths = new WeakMap<readonly Readonly<WayPoint>[], readonly Readonly<WayPoint>[]>();
const byDistance = (path: readonly Readonly<WayPoint>[]) => {
  let sorted = sortedPaths.get(path);
  if (!sorted) sortedPaths.set(path, sorted = [...path].sort((a, b) => Math.abs(a.d) - Math.abs(b.d)));
  return sorted;
};
// Match the main bridge model's clear-span overbridge layout: abutments on the banks, no
// piers in our traffic corridor. Raised earth approaches are billed separately below.
const deckPrice = (c: CrossingResult, span: number) => bridgeModel(ROAD_CLASSES[c.cls]).total(span, 0, { span, pierDensity: 0 });

/** Lowest grade-minus-floor along a box under the crown band, on the final way samples plus
 * their interior quarter points (terrain between samples is not assumed linear; a lowered floor
 * is drawn straight between its samples). */
function underpassLowest(road: readonly CrossingPoint[], start: number, end: number, crown: number,
  project: (q: XY) => { z: number; lateral: number }, heightAt: (x: number, y: number) => number): number {
  let lowest = Infinity;
  const probe = (x: number, y: number, floor: number) => {
    const p = project({ x, y });
    if (Math.abs(p.lateral) <= crown) lowest = Math.min(lowest, p.z - floor);
  };
  for (let i = start; i <= end; i++) {
    const a = road[i], b = road[i + 1];
    probe(a.x, a.y, a.surface === 'terrain' ? heightAt(a.x, a.y) : a.z);
    if (i < end) for (const t of [0.25, 0.5, 0.75]) {
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      probe(x, y, a.surface === 'terrain' && b.surface === 'terrain' ? heightAt(x, y) : a.z + (b.z - a.z) * t);
    }
  }
  return lowest;
}

/** Auto may use an underpass: eligible class, enough fill (the crossed way lowered into a cut by at
 * most LOWERING_RULES.maxDepth where there is too little) and a box no longer than the limit. */
export function underpassFits(c: Pick<CrossingResult, 'cls' | 'h'>, length: number): boolean {
  const size = ROAD_CLASSES[c.cls].underpass;
  return !!size && c.h >= underpassAssembly(size, 0).minHeight - LOWERING_RULES.maxDepth && length <= UNDERPASS_RULES.maxLength;
}

/** Steepest straight ramp allowed from height `z` at a deck/junction edge (old ground `g0` there)
 * to the old road's ground `g` at distance `run`: the class gradient (research/20). Where the ramp runs
 * the same way as the old road's own slope (the road falls away from a bridge, or climbs to a cutting),
 * it may be steeper than that road by half the class gradient, but never beyond the class's
 * justified-case maximum (`rampSteepest`; PROVISIONAL game rule). */
export function rampLimit(cls: string, z: number, g0: number, g: number, run: number): number {
  const row = ROAD_CLASSES[cls], grade = row.rampGradient, ramp = g - z, old = g - g0;
  return run > 0 && ramp * old > 0 ? Math.max(grade, Math.min(row.rampSteepest, Math.abs(old) / run + grade / 2)) : grade;
}

/** Diagnostics of a reroute the player shaped (crossing override `via`). */
/** Issues this geometry pass raises (rebuilt from scratch on every build). */
const built = (v: CrossingIssue) => v.crossing.code === 'geometry' || v.crossing.code === 'shape' || v.crossing.code === 'reroute';
/** Every diagnostic of a player's reroute shape starts so (issue code 'shape'). */
const SHAPED = 'Shaped link';

export const LINK_OVER_OUR_ROAD = 'Shaped link enters our earthworks';
export const LINK_TOO_STEEP = 'Shaped link is steeper than its class allows';
export const LINK_TOO_FAR = 'Shaped link runs too far';
export const LINK_CROSSES_MOTORWAY = 'Shaped link crosses a motorway at grade';
/** + 'railway' | 'water' | 'building' */
export const LINK_BLOCKED = 'Shaped link runs through a ';
/** Steepest grade of a draped path over stretches of at least 20 m, m/m. PROVISIONAL: the 20 m averaging
 * length is a game allowance for small bumps a road's own formation would smooth out; the path itself
 * stays draped (and is priced as ordinary road), it is not engineered. */
export function linkSteepest(path: readonly { x: number; y: number; z: number }[]): number {
  const d = [0];
  for (let i = 1; i < path.length; i++) d.push(d[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  let steepest = 0;
  for (let i = 0, j = 0; i < path.length; i++) {
    while (j < path.length && d[j] - d[i] < 20) j++;
    if (j === path.length) break;
    steepest = Math.max(steepest, Math.abs(path[j].z - path[i].z) / (d[j] - d[i]));
  }
  return steepest;
}

/** Diagnostics of an automatic reroute that cannot be built (the treatment is then infeasible). */
const REROUTE = 'Reroute ', REROUTE_FAILS = 'Reroute cannot be built: ';
const SHAPED_LINK: Record<LinkProblem, string> = {
  steep: LINK_TOO_STEEP, footprint: LINK_OVER_OUR_ROAD, motorway: LINK_CROSSES_MOTORWAY,
  railway: `${LINK_BLOCKED}railway`, water: `${LINK_BLOCKED}water`, building: `${LINK_BLOCKED}building`,
  river: 'Shaped link crosses a river', far: LINK_TOO_FAR,
};
const linkMessage = (problem: LinkProblem, _shaped: true) => SHAPED_LINK[problem];

/** Plain-language violation text for a geometry diagnostic (the diagnostic string stays internal). */
function diagnosticText(message: string, c: CrossingResult): Pick<CrossingIssue, 'title' | 'fix' | 'detail' | 'basis' | 'rule'> {
  const what = ROAD_CLASSES[c.cls]?.label ?? 'road', choice = c.requestedType ? 'your crossing choice' : 'this crossing';
  const ramps = { fix: 'Lower our road here (a cutting makes the ramps shorter), or choose "Our bridge over it", an underpass or "Cut and reroute"',
    rule: `Game rule (research/20): ramps no steeper than ${Math.round(ROAD_CLASSES[c.cls].rampGradient * 100)} % for a ${what}, at most 10 m high` };
  const trace = { title: `The game cannot trace where this ${what} goes`, fix: 'Set this crossing to "Our bridge over it", or move our road a little',
    detail: `The map data of this ${what} is too short or too detailed for the game to build ${choice}.`, basis: 'engine' as const,
    rule: 'Engine limit: crossings are built only along the real line of the crossed road, within 2 km of our road' };
  if (message === RAMP_TOO_LONG && c.type === 'junction') return { title: `The ${what} cannot be brought to our road's height for the junction`,
    fix: 'Move the junction where the two roads are closer in height, or choose "Our bridge over it" or "Its bridge over us"',
    detail: `Within the allowed slope, the ${what} would have to be raised or lowered all the way to where it ends.`, basis: 'game',
    rule: `Game rule (research/20): a ${what} raised or lowered to a junction is no steeper than ${Math.round(ROAD_CLASSES[c.cls].rampGradient * 100)} %` };
  if (message === LINK_OVER_OUR_ROAD) return { title: `Your path for the new ${what} runs onto our road's earthworks`,
    fix: 'Drag its bend points clear of our road\'s slopes, or choose "Automatic path" on the crossing card',
    detail: `The new piece of ${what} must run outside our earthworks to reach the next crossing.`, basis: 'game',
    rule: 'Game rule: a reroute runs on the ground outside our earthworks' };
  if (message.startsWith(REROUTE_FAILS)) {
    const row = ROAD_CLASSES[c.cls];
    const reasons = message.slice(REROUTE_FAILS.length).split(',').map(problem => ({
      steep: `the ground beside our road is too steep for a ${what} (at most ${Math.round(row.rampGradient * 100)} %, ${Math.round(row.rampSteepest * 100)} % where the ground leaves no choice, with earthworks up to ${LINK_MAX_SUPPORT} m deep) and no gentler line was found within ${LINK_CORRIDOR} m of our road`,
      footprint: 'there is no room for it beside our earthworks', motorway: 'it would have to cross a motorway on the ground',
      railway: 'it would have to cross a railway on the ground', water: 'it would have to run through a pond or river',
      river: 'it would have to cross a river too big for a culvert', building: 'it would have to run through a house you keep', far: 'it would be too long',
    } as Record<string, string>)[problem] ?? problem);
    const reason = reasons.join('; ');
    // the nearest structure: our bridge over it (raise our road) or its bridge over a deeper cutting
    const fix = c.h >= 0
      ? `Raise our road here by ${Math.max(0.1, CROSSING_RULES.overHeight - c.h).toFixed(1)} m and put it on a bridge over the ${what}, or choose "Its bridge over us" or an underpass`
      : `Lower our road here by ${Math.max(0.1, CROSSING_RULES.underDepth + c.h).toFixed(1)} m so that the ${what} can cross over it on a bridge, or choose an underpass`;
    return { title: `No buildable reroute for the ${what}`,
      fix,
      detail: `A new piece of ${what} cannot reach the next crossing: ${reason}.`, basis: 'game',
      rule: `Game rule: a new road is no steeper than its class allows (research/20, ordinary / where unavoidable: track 10 / 15 %, service road and street 9 or 8 / 12 %, class III 7 / 9 %, class I/II 6 / 7 %) with earthworks at most ${LINK_MAX_SUPPORT} m deep; it crosses streams on culverts (research/17), buys out houses in its way and never runs on the ground across motorways, railways, ponds or rivers` };
  }
  if (message === SHAPED_LINK.river) return { title: `Your path for the new ${what} crosses a river`,
    fix: 'Drag its bend points so that it stays on this side of the river, or choose "Automatic path" on the crossing card',
    detail: `The river is too big for a culvert under a ${what}.`, basis: 'game',
    rule: 'Game rule (research/17): a new road crosses streams on culverts; rivers need a bridge, which reroutes do not get' };
  if (message === LINK_TOO_FAR) return { title: `Your path for the new ${what} goes too far`,
    fix: 'Drag its bend points closer to our road, or choose "Automatic path" on the crossing card',
    detail: `A new piece of ${what} may run at most about ${(4 * MAX_REACH / 1000).toFixed(0)} km.`, basis: 'engine',
    rule: `Engine limit: a reroute is at most ${(4 * MAX_REACH / 1000).toFixed(0)} km long` };
  if (message === LINK_CROSSES_MOTORWAY || message.startsWith(LINK_BLOCKED)) {
    const thing = message === LINK_CROSSES_MOTORWAY ? 'a motorway' : `a ${message.slice(LINK_BLOCKED.length)}`;
    return { title: `Your path for the new ${what} runs across ${thing}`,
      fix: `Drag its bend points so that it stays clear of ${thing}, or choose "Automatic path" on the crossing card`,
      detail: `A new ${what} cannot cross ${thing} on the ground.`, basis: 'game',
      rule: 'Game rule: a new road crosses motorways and railways only on a bridge, and does not run through water or buildings' };
  }
  if (message === LINK_TOO_STEEP) return { title: `Your path for the new ${what} is too steep in places`,
    fix: 'Drag its bend points so that it runs more along the slope, or choose "Automatic path" on the crossing card',
    detail: `Even with earthworks up to ${LINK_MAX_SUPPORT} m deep it would be steeper than a ${what} may be.`, basis: 'game',
    rule: `Research/20: a ${what} is at most ${Math.round(ROAD_CLASSES[c.cls].rampGradient * 100)} % steep, ${Math.round(ROAD_CLASSES[c.cls].rampSteepest * 100)} % where the ground leaves no choice; its earthworks are at most ${LINK_MAX_SUPPORT} m deep (PROVISIONAL, as for every rebuilt road)` };
  if (message === WORKS_COVER_ROAD || message === WORKS_TIE_TOO_LONG || message === WORKS_TIE_SHARED) {
    const junction = c.type === 'junction', under = c.type === 'underpass';
    const raised = junction ? 'raised or lowered for the junction' : under ? 'lowered to pass under our road' : 'raised onto the bridge over our road';
    const others = junction ? 'choose "Our bridge over it", an underpass or "Cut and reroute", or move the junction'
      : under ? 'raise our road here, or choose "Our bridge over it", "Its bridge over us" or "Cut and reroute"'
      : 'choose "Our bridge over it", an underpass or "Cut and reroute"';
    const ramps = junction ? "junction's approach" : under ? 'ramps down to the underpass' : 'ramps to the bridge over our road';
    if (message === WORKS_TIE_SHARED) return { title: 'Two crossings would raise or lower the same side road',
      fix: `For one of them, ${others}`, basis: 'engine',
      detail: `A road joining the ${what} where it is ${raised} also joins another crossing's raised or lowered road; the game cannot regrade one road to meet both.`,
      rule: 'Engine limit: a side road is regraded to meet one crossing only' };
    return { title: message === WORKS_TIE_TOO_LONG ? `A road joining the ${ramps} cannot be raised or lowered to meet it`
      : `The ${ramps} run${junction ? 's' : ''} over another road`,
      fix: `${others.charAt(0).toUpperCase()}${others.slice(1)}`, basis: 'game',
      detail: message === WORKS_COVER_ROAD
        ? `Where the ${what} is ${raised}, its earth slopes would cover or cut into a road beside it, and a retaining wall cannot stand between them.`
        : `A road joining the ${what} where it is ${raised} would have to be regraded for more than ${MAX_RAMP_LENGTH} m to meet it.`,
      rule: `Game rule: earthworks of a crossing may not cover other roads. A road joining it is regraded to meet it (no steeper than its class allows, at most ${MAX_RAMP_LENGTH} m); a road beside it is kept clear by a retaining wall up to ${RETAINING_RULES.maxHeight} m high (research/18, research/20)` };
  }
  if (message === RAMP_TOO_LONG && c.type === 'underpass') return { title: `Ramps down to the underpass would be longer than ${MAX_RAMP_LENGTH} m`,
    fix: 'Raise our road here (a higher embankment needs less lowering), or choose "Our bridge over it", "Its bridge over us" or "Cut and reroute"',
    detail: `The ${what} itself falls (or climbs) towards our road, so a ramp within the allowed slope gets back to it only far away, if at all.`, basis: 'game',
    rule: `Game rule (research/20): ramps no steeper than ${Math.round(ROAD_CLASSES[c.cls].rampGradient * 100)} % for a ${what}, at most ${MAX_RAMP_LENGTH} m long on each side` };
  if (message === RAMP_TOO_LONG) return { title: `Ramps up to the bridge over our road would be longer than ${MAX_RAMP_LENGTH} m`, ...ramps,
    detail: `The ${what} itself runs downhill (or uphill) away from the bridge, so a ramp within the allowed slope meets it again only far away, if at all.`, basis: 'game',
    rule: `${ramps.rule}, at most ${MAX_RAMP_LENGTH} m long on each side` };
  if (message.startsWith(RAMP_TOO_HIGH)) return { title: 'Ramps up to the bridge over our road would be more than 10 m high', ...ramps,
    detail: `The ${what} would have to climb more than 10 m above the ground to cross over our road here.`, basis: 'game' };
  if (message === 'Existing way ends inside the crossing footprint') return { title: `The ${what} ends under our earthworks`,
    fix: c.type === 'underpass' ? 'Choose "Cut and reroute" or "Our bridge over it"' : 'Choose "Cut and reroute", or "Our bridge over it" if our road is high enough',
    detail: `A dead-end ${what} has no far side for ${c.type === 'underpass' ? 'an underpass' : 'a bridge over our road'} to reach.`, basis: 'game', rule: 'Game rule: a crossing must reach the crossed road on both sides of our road' };
  if (message.startsWith('Underpass would exceed')) return { title: `Underpass would be longer than ${UNDERPASS_RULES.maxLength} m`,
    fix: 'Choose "Our bridge over it", or make our embankment here lower and narrower', detail: 'Our embankment is too wide here for a short concrete box.',
    basis: 'game', rule: `Game estimate (research/19): an underpass box is at most ${UNDERPASS_RULES.maxLength} m long` };
  if (message === UNDERPASS_TOO_LOW) return { title: 'Embankment too low for an underpass',
    fix: 'Raise our road here, or choose another crossing',
    detail: `Somewhere under our road the box would stick out of the embankment${c.lowered === undefined ? '' : `, even with the ${what} lowered as far as it may be (${LOWERING_RULES.maxDepth} m)`}: it needs room for its height, roof and earth cover.`,
    basis: 'game', rule: `Game estimate (research/19, 37): an underpass needs its inside height plus roof and 0.5 m of earth below our road; the crossed road may be lowered by at most ${LOWERING_RULES.maxDepth} m` };
  if (message === 'This road class cannot pass in a small underpass') return { title: `A ${what} cannot pass through a small underpass`,
    fix: 'Choose "Our bridge over it", "Its bridge over us" or "Cut and reroute"', detail: 'Underpass boxes are sized for tracks, service roads and local roads only.',
    basis: 'game', rule: 'Game estimate (research/19): underpass boxes for tracks, service roads and local roads' };
  if (message === 'No real ground-level anchor exists for a surviving road branch') return { title: `No place to reconnect the ${what}`,
    fix: 'Choose "Its bridge over us" or an underpass, or "Our bridge over it" if our road is high enough',
    detail: `A cut-off end of the ${what} has no road on the ground nearby to be reconnected to.`, basis: 'game',
    rule: 'Game rule: every cut-off part of a road that still leads somewhere must be reconnected' };
  return trace;
}

export function crossingPlanLength(path: readonly XY[]): number {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return length;
}

/** First index with s[i] > v (or ≥ v when inclusive) in ascending chainages. */
function firstAbove(s: ArrayLike<number>, v: number, inclusive: boolean): number {
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (inclusive ? s[m] < v : s[m] <= v) lo = m + 1; else hi = m; }
  return lo;
}

function lerpAt(v: ArrayLike<number>, lo: number, hi: number, t: number): number {
  return v[lo] + (v[hi] - v[lo]) * t;
}

function routeGeometry(route: CrossingRoute) {
  const n = route.s.length;
  // Chainages consulted while `reads.on` (a reroute reused across evaluation passes depends on them).
  const reads = { on: false, lo: Infinity, hi: -Infinity };
  const note = (s: number) => { if (s < reads.lo) reads.lo = s; if (s > reads.hi) reads.hi = s; };
  const at = (s: number) => {
    if (reads.on) note(s);
    let lo = 0, hi = n - 1;
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (route.s[m] <= s) lo = m; else hi = m; }
    const t = Math.max(0, Math.min(1, (s - route.s[lo]) / (route.s[hi] - route.s[lo] || 1)));
    const tx = lerpAt(route.tx, lo, hi, t), ty = lerpAt(route.ty, lo, hi, t), norm = Math.hypot(tx, ty) || 1;
    return { s, x: lerpAt(route.x, lo, hi, t), y: lerpAt(route.y, lo, hi, t), tx: tx / norm, ty: ty / norm, z: lerpAt(route.grade, lo, hi, t),
      left: route.left ? lerpAt(route.left, lo, hi, t) : lerpAt(route.width, lo, hi, t) / 2,
      right: route.right ? lerpAt(route.right, lo, hi, t) : lerpAt(route.width, lo, hi, t) / 2 };
  };
  // Exact segment AABB tree: unlike a station window it remains correct beside hairpins, while
  // avoiding a full-route scan for every footprint bisection and every terrain sample.
  interface Node { x0: number; y0: number; x1: number; y1: number; indices?: number[]; left?: Node; right?: Node }
  const tree = (indices: number[]): Node => {
    const node: Node = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const i of indices) for (const j of [i, i + 1]) {
      node.x0 = Math.min(node.x0, route.x[j]); node.x1 = Math.max(node.x1, route.x[j]);
      node.y0 = Math.min(node.y0, route.y[j]); node.y1 = Math.max(node.y1, route.y[j]);
    }
    if (indices.length <= 12) node.indices = indices;
    else {
      const axis = node.x1 - node.x0 >= node.y1 - node.y0 ? route.x : route.y;
      indices.sort((a, b) => axis[a] + axis[a + 1] - axis[b] - axis[b + 1]);
      const middle = indices.length >> 1;
      node.left = tree(indices.slice(0, middle)); node.right = tree(indices.slice(middle));
    }
    return node;
  };
  const root = tree(Array.from({ length: n - 1 }, (_, i) => i));
  type Projection = ReturnType<typeof at> & { lateral: number };
  // Numeric coordinate keys avoid formatting every terrain/bisection sample. The cache is local
  // to this build, so edited grades and footprints never reuse an earlier design's projection.
  const projected = new Map<number, Map<number, Projection>>();
  let projectedCount = 0;
  // Each synchronous tree walk finishes before another project call can reuse this scratch state.
  let best = Infinity, station = route.s[0];
  const distance = (node: Node, q: XY) => Math.max(node.x0 - q.x, 0, q.x - node.x1) ** 2 + Math.max(node.y0 - q.y, 0, q.y - node.y1) ** 2;
  const visit = (node: Node, q: XY) => {
    if (distance(node, q) > best) return;
    if (node.indices) for (const i of node.indices) segment(i, q);
    else {
      const a = node.left!, b = node.right!;
      if (distance(a, q) <= distance(b, q)) { visit(a, q); visit(b, q); } else { visit(b, q); visit(a, q); }
    }
  };
  // Uniform bucket grid over the segment AABBs answers the usual near-route query by a few
  // rings; the tree remains the exact fallback for distant points. Ring r is exhaustive for
  // every segment closer than r·GRID, so stopping once (r·GRID)² > best returns the identical
  // minimum and tie-break.
  const GRID = 32, RINGS = 6;
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  for (let i = 0; i < n; i++) { gx0 = Math.min(gx0, route.x[i]); gx1 = Math.max(gx1, route.x[i]); gy0 = Math.min(gy0, route.y[i]); gy1 = Math.max(gy1, route.y[i]); }
  // Dense buckets only for a bounded extent (D11: ≈400 × 500 cells); otherwise the exact tree.
  const dense = (gx1 - gx0) / GRID * (gy1 - gy0) / GRID <= 4e6;
  const gnx = dense ? Math.floor((gx1 - gx0) / GRID) + 1 : 0, gny = dense ? Math.floor((gy1 - gy0) / GRID) + 1 : 0;
  const cellStart = new Int32Array(gnx * gny + 1);
  const cellsOf = (i: number, visit: (cell: number) => void) => {
    const c0 = Math.floor((Math.min(route.x[i], route.x[i + 1]) - gx0) / GRID), c1 = Math.floor((Math.max(route.x[i], route.x[i + 1]) - gx0) / GRID);
    const r0 = Math.floor((Math.min(route.y[i], route.y[i + 1]) - gy0) / GRID), r1 = Math.floor((Math.max(route.y[i], route.y[i + 1]) - gy0) / GRID);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) visit(r * gnx + c);
  };
  if (dense) for (let i = 0; i + 1 < n; i++) cellsOf(i, cell => cellStart[cell + 1]++);
  for (let k = 0; k < gnx * gny; k++) cellStart[k + 1] += cellStart[k];
  const cellItems = new Int32Array(cellStart[gnx * gny]), fill = cellStart.slice(0, gnx * gny);
  if (dense) for (let i = 0; i + 1 < n; i++) cellsOf(i, cell => { cellItems[fill[cell]++] = i; });
  // Typed copies of the per-segment terms (identical arithmetic to computing them per query).
  const X = Float64Array.from(route.x), Y = Float64Array.from(route.y), S = Float64Array.from(route.s);
  const DX = new Float64Array(n), DY = new Float64Array(n), DEN = new Float64Array(n);
  for (let i = 0; i + 1 < n; i++) {
    const dx = X[i + 1] - X[i], dy = Y[i + 1] - Y[i];
    DX[i] = dx; DY[i] = dy; DEN[i] = dx * dx + dy * dy || 1;
  }
  const segmentXY = (i: number, qx: number, qy: number) => {
    const dx = DX[i], dy = DY[i], ox = qx - X[i], oy = qy - Y[i];
    const t = Math.max(0, Math.min(1, (ox * dx + oy * dy) / DEN[i]));
    const d2 = (ox - t * dx) ** 2 + (oy - t * dy) ** 2;
    if (!(d2 <= best)) return;
    const s = S[i] + t * (S[i + 1] - S[i]);
    if (d2 < best || s < station) { best = d2; station = s; }
  };
  const segment = (i: number, q: XY) => segmentXY(i, q.x, q.y);
  // Hint: the previous query's segment. Seeding `best` with it only prunes, never changes, the
  // exact minimum and its smaller-chainage tie-break (every equal candidate is still visited).
  let hint = 0;
  const nearestXY = (qx: number, qy: number) => {
    best = Infinity; station = S[0];
    if (dense) {
      segmentXY(hint, qx, qy);
      const qc = Math.floor((qx - gx0) / GRID), qr = Math.floor((qy - gy0) / GRID);
      for (let ring = 0; ring <= RINGS; ring++) {
        for (let r = qr - ring; r <= qr + ring; r++) {
          if (r < 0 || r >= gny) continue;
          // Rows/columns wholly farther than the current best cannot hold a closer (or equal) point:
          // a segment's nearest point lies inside a cell its bounding box registered it in.
          const ry = Math.max(gy0 + r * GRID - qy, 0, qy - gy0 - (r + 1) * GRID);
          if (ry * ry > best * (1 + 1e-9) + 1e-9) continue;
          const edge = r === qr - ring || r === qr + ring;
          for (let c = qc - ring; c <= qc + ring; c += edge ? 1 : 2 * ring) {
            if (c < 0 || c >= gnx) { if (ring === 0) break; continue; }
            const cx = Math.max(gx0 + c * GRID - qx, 0, qx - gx0 - (c + 1) * GRID);
            if (cx * cx + ry * ry <= best * (1 + 1e-9) + 1e-9) {
              const cell = r * gnx + c;
              for (let k = cellStart[cell]; k < cellStart[cell + 1]; k++) segmentXY(cellItems[k], qx, qy);
            }
            if (ring === 0) break;
          }
        }
        if ((ring * GRID) ** 2 > best) { hintFrom(); return; }
      }
    }
    best = Infinity; station = S[0];
    visit(root, { x: qx, y: qy });
    hintFrom();
  };
  /** Remember a segment adjacent to the chosen station as the next query's seed. */
  const hintFrom = () => {
    let lo = 0, hi = n - 1;
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (S[m] <= station) lo = m; else hi = m; }
    hint = Math.min(lo, n - 2);
  };
  const nearest = (q: XY) => nearestXY(q.x, q.y);
  const project = (q: XY, cache = true) => {
    let column = cache ? projected.get(q.x) : undefined;
    const cached = column?.get(q.y);
    if (cached) { if (reads.on) note(cached.s); return cached; }
    nearest(q);
    const p = at(station), result = { s: p.s, x: p.x, y: p.y, tx: p.tx, ty: p.ty, z: p.z,
      left: p.left, right: p.right, lateral: (q.x - p.x) * -p.ty + (q.y - p.y) * p.tx };
    if (cache && projectedCount < 50000) {
      if (!column) projected.set(q.x, column = new Map());
      column.set(q.y, result); projectedCount++;
    }
    return result;
  };
  const margin = (q: XY, extra: number, cache = true) => {
    if (!cache) return marginOnce(q, extra);
    const p = project(q, cache);
    return Math.abs(p.lateral) - (p.lateral >= 0 ? p.left : p.right) - extra;
  };
  /** One-off probe (e.g. link chord clearance): project/at arithmetic without allocating. */
  const marginOnce = (q: XY, extra: number) => {
    nearest(q);
    if (reads.on) note(station);
    let lo = 0, hi = n - 1;
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (route.s[m] <= station) lo = m; else hi = m; }
    const t = Math.max(0, Math.min(1, (station - route.s[lo]) / (route.s[hi] - route.s[lo] || 1)));
    const tx = lerpAt(route.tx, lo, hi, t), ty = lerpAt(route.ty, lo, hi, t), norm = Math.hypot(tx, ty) || 1;
    const lateral = (q.x - lerpAt(route.x, lo, hi, t)) * -(ty / norm) + (q.y - lerpAt(route.y, lo, hi, t)) * (tx / norm);
    const edge = lateral >= 0
      ? route.left ? lerpAt(route.left, lo, hi, t) : lerpAt(route.width, lo, hi, t) / 2
      : route.right ? lerpAt(route.right, lo, hi, t) : lerpAt(route.width, lo, hi, t) / 2;
    return Math.abs(lateral) - edge - extra;
  };
  return { at, project, margin, reads };
}

function along(path: readonly Readonly<WayPoint>[], d: number): WayPoint {
  let i = 0;
  while (i + 2 < path.length && path[i + 1].d < d) i++;
  const a = path[i], b = path[i + 1], t = Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d || 1)));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, d: Math.max(path[0].d, Math.min(path[path.length - 1].d, d)) };
}

/** Retain ALL source bends. A dense way is cropped near the crossing, never straightened. */
function denseWay(input: WayPoint[], diagnose: (s: string) => void): WayPoint[] {
  let path = input;
  if (path.length > MAX_POINTS - 16) {
    let centre = 0;
    for (let i = 1; i < path.length; i++) if (Math.abs(path[i].d) < Math.abs(path[centre].d)) centre = i;
    const start = Math.max(0, Math.min(path.length - MAX_POINTS + 16, centre - Math.floor((MAX_POINTS - 16) / 2)));
    path = path.slice(start, start + MAX_POINTS - 16); diagnose('OSM detail exceeds the bounded point budget');
  }
  if (path.length < 2) return path;
  const out: WayPoint[] = [], total = path[path.length - 1].d - path[0].d;
  const budget = MAX_POINTS - 16 - path.length;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], len = b.d - a.d;
    const count = Math.min(Math.max(1, Math.ceil(len / STEP)), 1 + Math.floor(budget * len / (total || 1)));
    for (let k = 0; k < count; k++) {
      const t = k / count;
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), d: a.d + t * len });
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

function buildCrossingGeometryOnce(crossings: CrossingResult[], route: CrossingRoute,
  heightAt: (x: number, y: number) => number, roads: RoadNet | undefined,
  spatial: ReturnType<typeof routeGeometry>, paths: Map<string, CachedPath>, smoothed: Map<string, CrossingPoint[]>, routed: Map<string, LinkPlan>,
  linkMemo: NonNullable<LinkEnv['memo']>,
  sidesOf = new Map<string, [boolean, boolean]>(), budget = Infinity, persist?: CrossingCache, anchorOnly?: ReadonlySet<CrossingResult>): CrossingIssue[] {
  const { at, project, margin, reads } = spatial;
  for (const c of crossings) if (c.issues) c.issues = c.issues.filter(v => !built(v));
  // Works are remeasured on every build (Auto tries candidates, then rebuilds the network).
  for (const c of crossings) {
    if (c.worksCost) c.cost -= c.worksCost;
    delete c.worksCost; delete c.tieLength; delete c.wallLength;
  }
  const terrainPoint = (q: XY & { d?: number }): CrossingPoint => {
    const ground = heightAt(q.x, q.y);
    // All callers supply XY or way samples. Explicit shapes avoid a generic object spread for
    // every terrain point, while retaining the optional station's presence and property order.
    return 'd' in q ? { x: q.x, y: q.y, d: q.d, z: ground, ground, surface: 'terrain' }
      : { x: q.x, y: q.y, z: ground, ground, surface: 'terrain' };
  };
  const diagnose = (g: CrossingGeometry, message: string) => {
    // A flawed reroute (the player's shape or the automatic line) leaves the crossing itself standing:
    // the crossed road is still cut and owned here; only its new piece of road is in question.
    if (!message.startsWith(SHAPED) && !message.startsWith(REROUTE)) g.clipped = true;
    if (!g.diagnostics?.includes(message)) (g.diagnostics ??= []).push(message);
  };
  // Terrain-only source samples need elevations only at the selected anchors, not along the
  // entire bounded way. Engineered paths retain their full surface/support metadata.
  type AnchorSample = Readonly<WayPoint> | CrossingPoint;
  const rawPaths = new Map<CrossingResult, readonly AnchorSample[]>();
  const survivingSides = new Map<CrossingResult, [boolean, boolean]>();
  const anchors = new Map<CrossingResult, [CrossingPoint | undefined, CrossingPoint | undefined]>();
  const maxLinkWidth = (c: CrossingResult) => Math.max(ROAD_CLASSES[c.cls].width,
    ...crossings.filter(t => t.targetS === c.s && t.targetRoadId === c.roadId).map(t => ROAD_CLASSES[t.cls].width));
  const getPath = (roadId: number | undefined, x: number, y: number, g: CrossingGeometry) => {
    if (roadId === undefined || !roads) { diagnose(g, 'No real crossed-way alignment is available'); return []; }
    const key = `${roadId}:${x},${y}`;
    let cached = paths.get(key);
    if (!cached) {
      const diagnostics: string[] = [];
      cached = { path: denseWay(roads.connectedCrossingPath(roadId, x, y, MAX_REACH), message => diagnostics.push(message)), diagnostics };
      paths.set(key, cached);
    }
    for (const message of cached.diagnostics) diagnose(g, message);
    return cached.path;
  };

  for (const c of crossings) {
    const g: CrossingGeometry = c.geometry = { width: ROAD_CLASSES[c.cls].width, schematic: false };
    const path = getPath(c.roadId, c.x, c.y, g);
    if (path.length < 2) {
      diagnose(g, 'Crossed way has no usable polyline');
      if (c.type === 'overbridge') { c.span = 0; c.approachLength = 0; c.cost = 0; }
      continue;
    }
    // Connection works consume short stubs through the whole link corridor, not just the main
    // earthwork toe. Use the same half-width + setback as groundAnchors; otherwise a 0.1–6 m
    // remnant would be required to reconnect while being geometrically forbidden any anchor.
    const corridor = maxLinkWidth(c) / 2 + SETBACK;
    const sides: [boolean, boolean] = [false, false];
    for (const q of byDistance(path)) {
      const p = project(q);
      if (Math.abs(p.lateral) > (p.lateral > 0 ? p.left : p.right) + corridor) sides[p.lateral < 0 ? 0 : 1] = true;
      if (sides[0] && sides[1]) break;
    }
    survivingSides.set(c, sides); sidesOf.set(`${c.roadId}:${c.x},${c.y}`, sides);
    const isRaised = c.type === 'overbridge', adjusted = isRaised || c.type === 'junction';
    let road: CrossingPoint[] = [], lowered = false;
    // Where a ramp from height z at the way's chainage `edge` (going `direction` along it) meets the
    // old road's ground within its class gradient (rampLimit). Ramps are tied to actual terrain: the
    // linear engineered ramp may need fill or cut, never silently max(terrain, ramp).
    const foot = (edge: number, direction: number, z: number, quiet = false) => {
      const endpoint = direction < 0 ? path[0] : path[path.length - 1];
      if (c.type === 'junction' && Math.abs(edge - endpoint.d) < 1e-6 && margin(endpoint, 0) <= 0) return edge;
      const e = along(path, edge), g0 = heightAt(e.x, e.y);
      // already at the old road's level there (a deck on the ground at the edge of a cutting): no ramp
      if (Math.abs(z - g0) <= 0.05) return edge;
      for (let k = direction < 0 ? path.length - 1 : 0; k >= 0 && k < path.length; k -= direction < 0 ? 1 : -1) {
        const q = path[k];
        if (direction * (q.d - edge) <= 1e-4) continue;
        const ground = heightAt(q.x, q.y), run = Math.abs(q.d - edge);
        if (Math.abs(ground - z) <= run * rampLimit(c.cls, z, g0, ground, run) + 1e-8) return q.d;
      }
      if (quiet) return NaN;
      diagnose(g, RAMP_TOO_LONG);
      return direction < 0 ? path[0].d : path[path.length - 1].d;
    };
    if (adjusted) {
      // Find the connected interval of the *whole road ribbon* over the actual earthwork footprint.
      // This handles skew, bends and varying/asymmetric widths, unlike width/sin(angle) alone.
      const extra = g.width / 2 + (isRaised ? 2 : 0);
      let centre = 0;
      for (let i = 1; i < path.length; i++) if (Math.abs(path[i].d) < Math.abs(path[centre].d)) centre = i;
      let first = centre, last = centre;
      while (first > 0 && margin(path[first - 1], extra) <= 0) first--;
      while (last + 1 < path.length && margin(path[last + 1], extra) <= 0) last++;
      const boundary = (inside: number, outside: number) => {
        let a = path[inside].d, b = path[outside].d;
        for (let k = 0; k < 24; k++) { const m = (a + b) / 2; if (margin(along(path, m), extra) <= 0) a = m; else b = m; }
        return (a + b) / 2;
      };
      const d0 = first > 0 ? boundary(first, first - 1) : path[first].d;
      const d1 = last + 1 < path.length ? boundary(last, last + 1) : path[last].d;
      if (first === 0 || last === path.length - 1) {
        if (isRaised) {
          diagnose(g, 'Existing way ends inside the crossing footprint');
          // There are not two abutments. Never display a deck dropping into our carriageway.
          c.span = 0; c.approachLength = 0; c.cost = 0;
          continue;
        }
      }
      const core = [along(path, d0), ...path.filter(q => q.d > d0 && q.d < d1), along(path, d1)];
      // What the deck must clear at points along the way: our road (crown stations and the ribbon
      // edges included), and the ground where its abutments stand (between them our earthworks
      // replace the natural ground: a cutting is dug away beneath it).
      const clear: { d: number; z: number }[] = [];
      let minS = Infinity, maxS = -Infinity;
      core.forEach((q, k) => {
        const p = project(q); minS = Math.min(minS, p.s); maxS = Math.max(maxS, p.s);
        clear.push({ d: q.d, z: k === 0 || k === core.length - 1 ? Math.max(p.z + CROSSING_RULES.underDepth, heightAt(q.x, q.y)) : p.z + CROSSING_RULES.underDepth });
      });
      for (let i = firstAbove(route.s, minS - g.width / 2, true); i < route.s.length && route.s[i] <= maxS + g.width / 2; i++) {
        let d = core[0].d, best = Infinity;
        for (const q of core) { const gap = (q.x - route.x[i]) ** 2 + (q.y - route.y[i]) ** 2; if (gap < best) { best = gap; d = q.d; } }
        clear.push({ d, z: route.grade[i] + CROSSING_RULES.underDepth });
      }
      // The deck may slope like the road it carries (its class gradient, research/20): on a valley side
      // a level deck would leave one end high above the ground and its ramp far too long.
      const ground0 = heightAt(along(path, d0).x, along(path, d0).y), ground1 = heightAt(along(path, d1).x, along(path, d1).y);
      let deck = { base: -Infinity, slope: 0 }, deckCost = Infinity;
      // (or as steep as the old road across the cutting: it is not rebuilt gentler than it was)
      const steepest = Math.max(ROAD_CLASSES[c.cls].rampGradient, Math.abs(ground1 - ground0) / Math.max(1, d1 - d0));
      for (let k = -20; k <= 20; k++) {
        const slope = steepest * k / 20, base = Math.max(...clear.map(q => q.z - slope * q.d));
        const cost = Math.abs(base + slope * d0 - ground0) + Math.abs(base + slope * d1 - ground1) + (k === 0 ? 0 : 1e-6);
        if (cost < deckCost) { deckCost = cost; deck = { base, slope }; }
      }
      const deckAt = (d: number) => deck.base + deck.slope * d;
      const edgeZ = (d: number) => isRaised ? deckAt(d) : project(along(path, d)).z;
      const f0 = foot(d0, -1, edgeZ(d0)), f1 = foot(d1, 1, edgeZ(d1));
      // A crossing whose ramps would run on for hundreds of metres is not a sensible bridge over us.
      if (isRaised && Math.max(d0 - f0, f1 - d1) > MAX_RAMP_LENGTH) diagnose(g, RAMP_TOO_LONG);
      // Short terrain tails make the actual joins visible; tails are maintenance, not new approaches.
      const a = Math.max(path[0].d, f0 - STEP), b = Math.min(path[path.length - 1].d, f1 + STEP);
      const distances = [...new Set([a, f0, d0, ...path.filter(q => q.d > a && q.d < b).map(q => q.d), d1, f1, b])].sort((p, q) => p - q);
      road = distances.map(d => {
        const q = terrainPoint(along(path, d));
        if (d < d0 && d > f0) {
          q.z = edgeZ(d0) + (heightAt(along(path, f0).x, along(path, f0).y) - edgeZ(d0)) * (d0 - d) / (d0 - f0);
        } else if (d > d1 && d < f1) {
          q.z = edgeZ(d1) + (heightAt(along(path, f1).x, along(path, f1).y) - edgeZ(d1)) * (d - d1) / (f1 - d1);
        } else if (d >= d0 && d <= d1) q.z = isRaised ? deckAt(d) : project(q).z;
        if (isRaised && d >= d0 && d <= d1) q.surface = 'deck';
        else if (Math.abs(q.z - q.ground) > 1e-7) { q.surface = 'ramp'; q.support = q.z >= q.ground ? 'embankment' : 'retaining'; }
        return q;
      });
      // If an actual way ends inside the footprint, do not disguise an elevated dangling end.
      // Such infeasible topology is reported, and the endpoint remains at its connected terrain road.
      for (const q of [road[0], road[road.length - 1]]) {
        if (c.type === 'junction' && margin(q, 0) <= 0) {
          q.z = project(q).z; q.connection = 'main-road';
          if (Math.abs(q.z - q.ground) > 1e-7) { q.surface = 'ramp'; q.support = q.z >= q.ground ? 'embankment' : 'retaining'; }
        } else if (Math.abs(q.z - q.ground) > 0.3) {
          q.z = q.ground; q.surface = 'terrain'; delete q.support;
        }
      }
      // Ordinary road-per-km rates cannot represent viaduct-scale approach earthworks. Keep
      // explicit choices visible but reject this unpriced engineering; Auto will try real links.
      if (road.some(q => q.surface === 'ramp' && Math.abs(q.z - q.ground) > 10))
        diagnose(g, 'Approach earthwork exceeds the 10 m study-stage support limit');
      const start = road.findIndex(q => q.d === d0), end = road.findIndex(q => q.d === d1);
      g.approaches = [{ start: road.findIndex(q => q.d === f0), end: start }, { start: end, end: road.findIndex(q => q.d === f1) }];
      if (isRaised) {
        g.deck = { start, end, depth: DEPTH };
        c.span = d1 - d0; c.approachLength = d0 - f0 + f1 - d1;
        c.cost = deckPrice(c, c.span) + c.approachLength * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000;
      }
    } else if (c.type === 'reconnection' || c.type === 'diversion') {
      // The severed way is removed wherever it lies inside the footprint plus link corridor,
      // in both directions from the crossing, even when that direction needs no new link. Each end
      // is the interpolated corridor boundary, the same one groundAnchors() ties a link to.
      let centre = 0;
      for (let i = 1; i < path.length; i++) if (Math.abs(path[i].d) < Math.abs(path[centre].d)) centre = i;
      const edge = (step: number) => {
        let k = centre;
        if (margin(path[k], corridor) >= 0) return path[k].d;
        while (path[k + step] && margin(path[k + step], corridor) < 0) k += step;
        if (!path[k + step]) return path[k].d;
        let a = path[k].d, b = path[k + step].d;
        for (let it = 0; it < 24; it++) { const m = (a + b) / 2; if (margin(along(path, m), corridor) < 0) a = m; else b = m; }
        return b;
      };
      g.removed = [Math.min(0, edge(-1)), Math.max(0, edge(1))];
    } else if (['bridge', 'tunnel'].includes(c.type)) {
      // Only show the vicinity of the crossing; its existing road is unchanged at terrain level.
      let centre = path.findIndex(q => q.d >= 0), lo = centre, hi = centre;
      while (lo > 0 && margin(path[lo], corridor + STEP) < 0) lo--;
      while (hi + 1 < path.length && margin(path[hi], corridor + STEP) < 0) hi++;
      road = path.slice(Math.max(0, lo - 1), Math.min(path.length, hi + 2)).map(terrainPoint);
    } else if (c.type === 'underpass') {
      // The way keeps its own terrain level through a closed box spanning the earthwork
      // footprint toe to toe along the way (skew and bends included); under a low embankment it is
      // lowered into a cut on ramps at its class gradient (research/37), its low point drained.
      const row = ROAD_CLASSES[c.cls], box = row.underpass ? underpassAssembly(row.underpass, (c.roadPerKm ?? row.roadPerKm[0]) / 1000) : undefined;
      let centre = 0;
      for (let i = 1; i < path.length; i++) if (Math.abs(path[i].d) < Math.abs(path[centre].d)) centre = i;
      let first = centre, last = centre;
      while (first > 0 && margin(path[first - 1], 0) <= 0) first--;
      while (last + 1 < path.length && margin(path[last + 1], 0) <= 0) last++;
      const boundary = (inside: number, outside: number) => {
        let a = path[inside].d, b = path[outside].d;
        for (let k = 0; k < 24; k++) { const m = (a + b) / 2; if (margin(along(path, m), 0) <= 0) a = m; else b = m; }
        return (a + b) / 2;
      };
      if (!box) diagnose(g, 'This road class cannot pass in a small underpass');
      else if (first === 0 || last === path.length - 1) diagnose(g, 'Existing way ends inside the crossing footprint');
      else {
        const d0 = boundary(first, first - 1), d1 = boundary(last, last + 1), length = d1 - d0;
        if (length > UNDERPASS_RULES.maxLength) diagnose(g, `Underpass would exceed the ${UNDERPASS_RULES.maxLength} m box limit`);
        // Under the carriageway the box needs its clear height + roof + cover below our grade.
        const crown = (route.crownWidth ?? 0) / 2 + g.width / 2;
        const inside = [along(path, d0), ...path.filter(q => q.d > d0 && q.d < d1), along(path, d1)];
        // (the way's samples and their quarter points, as the final check on the drawn way probes them)
        const probes: { d: number; z: number; ground: number }[] = [];
        for (let k = 0; k < inside.length; k++) for (const t of k + 1 < inside.length ? [0, 0.25, 0.5, 0.75] : [0]) {
          const a = inside[k], b = inside[Math.min(inside.length - 1, k + 1)], q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, p = project(q);
          if (Math.abs(p.lateral) <= crown) probes.push({ d: a.d + (b.d - a.d) * t, z: p.z - box.minHeight, ground: heightAt(q.x, q.y) });
        }
        const lowest = Math.min(Infinity, ...probes.map(q => q.z + box.minHeight - q.ground));
        delete c.lowered; delete c.drainage; delete c.drainCost; delete c.approachLength;
        const rate = (c.roadPerKm ?? row.roadPerKm[0]) / 1000;
        if (lowest < box.minHeight - 1e-6) {
          // A straight floor through the box, as high as leaves the box room under our road everywhere
          // under the crown band. Its fall (at most the class gradient, or the old road's own fall across
          // the box where that is steeper, like a sloped deck) is chosen for the shortest ramps: on a
          // hillside a level floor would leave the uphill ramp running on in a deep cut.
          const g0 = heightAt(inside[0].x, inside[0].y), g1 = heightAt(inside[inside.length - 1].x, inside[inside.length - 1].y);
          const steepest = Math.max(row.rampGradient, Math.abs(g1 - g0) / Math.max(1, length));
          const ground = inside.map(q => heightAt(q.x, q.y));
          const old = (g1 - g0) / Math.max(1, length), slopes = [old, Math.max(-row.rampGradient, Math.min(row.rampGradient, old))];
          for (let k = -8; k <= 8; k++) slopes.push(steepest * k / 8);
          // (within the lowering limit first, then ramps that end within reach, the shortest, the least lowering)
          const rank = (depth: number, f0: number, f1: number) => [depth > LOWERING_RULES.maxDepth + 1e-6 ? 1 : 0,
            Number.isNaN(f0 + f1) || Math.max(d0 - f0, f1 - d1) > MAX_RAMP_LENGTH ? 1 : 0, Number.isNaN(f0 + f1) ? 0 : f1 - f0, depth];
          let best = { base: Infinity, slope: 0, depth: Infinity, rank: [2, 2, 0, 0] };
          for (const slope of slopes) {
            const base = Math.min(...probes.map(q => q.z - slope * q.d));
            const depth = Math.max(0, ...inside.map((q, i) => ground[i] - base - slope * q.d), ...probes.map(q => q.ground - base - slope * q.d));
            const mine = rank(depth, foot(d0, -1, base + slope * d0, true), foot(d1, 1, base + slope * d1, true));
            const i = mine.findIndex((v, j) => Math.abs(v - best.rank[j]) > 1e-6);
            if (i >= 0 && mine[i] < best.rank[i]) best = { base, slope, depth, rank: mine };
          }
          const { base, slope, depth } = best, floor = (d: number) => base + slope * d;
          if (depth > LOWERING_RULES.maxDepth + 1e-6) diagnose(g, UNDERPASS_TOO_LOW);
          const f0 = foot(d0, -1, floor(d0)), f1 = foot(d1, 1, floor(d1));
          if (Math.max(d0 - f0, f1 - d1) > MAX_RAMP_LENGTH) diagnose(g, RAMP_TOO_LONG);
          const a = Math.max(path[0].d, f0 - STEP), b = Math.min(path[path.length - 1].d, f1 + STEP);
          const distances = [...new Set([a, f0, d0, ...path.filter(q => q.d > a && q.d < b).map(q => q.d), d1, f1, b])].sort((p, q) => p - q);
          const groundAt = (d: number) => { const q = along(path, d); return heightAt(q.x, q.y); };
          road = distances.map(d => {
            const q = terrainPoint(along(path, d));
            if (d > f0 && d < d0) q.z = floor(d0) + (groundAt(f0) - floor(d0)) * (d0 - d) / (d0 - f0);
            else if (d >= d0 && d <= d1) q.z = floor(d);
            else if (d > d1 && d < f1) q.z = floor(d1) + (groundAt(f1) - floor(d1)) * (d - d1) / (f1 - d1);
            if (Math.abs(q.z - q.ground) > 1e-7) { q.surface = 'ramp'; q.support = q.z >= q.ground ? 'embankment' : 'retaining'; }
            return q;
          });
          if (road.some(q => q.surface === 'ramp' && Math.abs(q.z - q.ground) > LINK_MAX_SUPPORT)) diagnose(g, UNDERPASS_TOO_LOW);
          g.approaches = [{ start: distances.indexOf(f0), end: distances.indexOf(d0) }, { start: distances.indexOf(d1), end: distances.indexOf(f1) }];
          // The low point drains by gravity where a pipe at its fall reaches lower ground along the way
          // within reach (TP 83 §6.1), else into a pumped sump with a rising main to where a ramp ends.
          const low = floor(d0) <= floor(d1) ? d0 : d1, invert = floor(low) - LOWERING_RULES.drainDepth;
          let outfall: number | undefined;
          for (const q of path) {
            const run = Math.abs(q.d - low);
            if (run <= LOWERING_RULES.maxOutfall && (outfall === undefined || run < outfall)
              && heightAt(q.x, q.y) <= invert - LOWERING_RULES.drainFall * run) outfall = run;
          }
          const drain = sagDrainage(outfall, Math.min(low - f0, f1 - low));
          lowered = true; c.lowered = depth; c.approachLength = d0 - f0 + f1 - d1; c.drainage = drain.kind; c.drainCost = drain.cost;
        } else {
          const a = Math.max(path[0].d, d0 - 2 * STEP), b = Math.min(path[path.length - 1].d, d1 + 2 * STEP);
          const distances = [...new Set([a, d0, ...path.filter(q => q.d > a && q.d < b).map(q => q.d), d1, b])].sort((p, q) => p - q);
          road = distances.map(d => terrainPoint(along(path, d)));
        }
        g.underpass = { start: road.findIndex(q => q.d === d0), end: road.findIndex(q => q.d === d1), width: box.width, height: box.height, roof: box.roof, wall: box.wall };
        c.underpassLength = length;
        c.cost = length * box.perM + 2 * box.head + (c.approachLength ?? 0) * rate + (c.drainCost ?? 0);
      }
    }
    // (a raised or lowered way's anchors lie on the ground beyond its ramps, on its old line further out)
    rawPaths.set(c, (adjusted || lowered) && road.length ? [...path.filter(q => q.d < road[0].d!), ...road, ...path.filter(q => q.d > road[road.length - 1].d!)] : path);
    if (['bridge', 'overbridge', 'tunnel', 'junction', 'underpass'].includes(c.type)) g.road = road;
    // A box or a bridge over us that delivers the way straight back under our earthworks (it runs along
    // our slope on one side, not across our road again) leaves that stretch to be walled or moved:
    // Auto prefers a treatment that does not (a reroute takes that stretch with it).
    if (c.type === 'underpass' && road.length && !c.requestedType) {
      const crown = (route.crownWidth ?? 0) / 2, d0 = road[0].d!, d1 = road[road.length - 1].d!;
      for (const direction of [-1, 1]) {
        let inside = false, across = false;
        const settle = () => { if (inside && !across) g.runsBack = true; inside = across = false; };
        for (let k = direction < 0 ? path.length - 1 : 0; k >= 0 && k < path.length && !g.runsBack; k -= direction < 0 ? 1 : -1) {
          const q = path[k], beyond = direction < 0 ? d0 - q.d : q.d - d1;
          if (beyond <= 0) continue;
          if (beyond > RUN_BACK) break;
          if (margin(q, g.width / 2) <= 0) { inside = true; if (Math.abs(project(q).lateral) <= crown) across = true; } else settle();
        }
        if (!g.runsBack) settle();
      }
    }
  }

  // A ground anchor must actually lie on the crossed alignment, beyond every engineered approach
  // and beyond the footprint plus half the incoming road width and a physical setback.
  const isTerrain = (q: AnchorSample) => !('surface' in q) || q.surface === 'terrain';
  const groundAnchors = (path: readonly AnchorSample[], width: number): [CrossingPoint | undefined, CrossingPoint | undefined] => {
    const out: [CrossingPoint | undefined, CrossingPoint | undefined] = [undefined, undefined];
    const order = Array.from({ length: path.length }, (_, i) => i).sort((a, b) => Math.abs(path[a].d ?? 0) - Math.abs(path[b].d ?? 0));
    for (const side of [-1, 1]) {
      for (const i of order) {
        const q = path[i], p = project(q);
        if (side * p.lateral <= 0 || !isTerrain(q)) continue;
        const off = (side > 0 ? p.left : p.right) + width / 2 + SETBACK;
        if (Math.abs(p.lateral) < off - 1e-6) continue;
        // Interpolate an exact crossing of the side corridor when the previous point is ground too.
        let candidate = 'surface' in q ? q : terrainPoint(q);
        for (const j of [i - 1, i + 1]) {
          if (!path[j] || !isTerrain(path[j]) || margin(path[j], width / 2 + SETBACK) >= 0) continue;
          let lo = 0, hi = 1;
          for (let k = 0; k < 24; k++) {
            const t = (lo + hi) / 2, a = path[j];
            const v = { x: a.x + (q.x - a.x) * t, y: a.y + (q.y - a.y) * t };
            if (margin(v, width / 2 + SETBACK) < 0) lo = t; else hi = t;
          }
          const t = hi, a = path[j];
          candidate = terrainPoint({ x: a.x + (q.x - a.x) * t, y: a.y + (q.y - a.y) * t,
            ...(a.d !== undefined && q.d !== undefined ? { d: a.d + (q.d - a.d) * t } : {}) });
        }
        out[side < 0 ? 0 : 1] = candidate;
        break;
      }
    }
    return out;
  };
  // (only the crossings a link starts or ends at need their anchors)
  const anchorOf = (c: CrossingResult) => {
    if (!anchors.has(c) && rawPaths.has(c)) anchors.set(c, groundAnchors(rawPaths.get(c)!, maxLinkWidth(c)));
    return anchors.get(c);
  };
  const endAnchors = new Map<string, [CrossingPoint | undefined, CrossingPoint | undefined]>();
  const linkEnv: LinkEnv = { heightAt, margin: (q, extra) => margin(q, extra, false), roads, obstacle: route.obstacle, streams: route.streams,
    houses: route.houses, houseCost: route.houseCost, memo: linkMemo };
  for (const c of crossings) if (c.targetS !== undefined && (c.type === 'reconnection' || c.type === 'diversion')) {
    const g = c.geometry!;
    const target = crossings.find(t => t !== c && t.s === c.targetS && t.roadId === c.targetRoadId && !t.issues?.length && !ROAD_CLASSES[t.cls].noAtGrade);
    let finish = target ? anchorOf(target) : undefined;
    if (!target) {
      const key = `${c.targetS}:${g.width}`, p = at(c.targetS);
      if (!endAnchors.has(key)) {
        const way = roads?.nearestWay(p.x, p.y);
        endAnchors.set(key, groundAnchors(getPath(way, p.x, p.y, g), g.width));
      }
      finish = endAnchors.get(key);
    }
    const start = anchorOf(c);
    const required = survivingSides.get(c) ?? [true, true];
    if (required.some((needed, k) => needed && (!start?.[k] || !finish?.[k])))
      diagnose(g, 'No real ground-level anchor exists for a surviving road branch');
    const sidePoint = (s: number, side: number) => {
      const p = at(s), offset = (side > 0 ? p.left : p.right) + g.width / 2 + SETBACK;
      return terrainPoint({ x: p.x - p.ty * offset * side, y: p.y + p.tx * offset * side });
    };
    // An Auto candidate dearer than `budget` is discarded unbuilt: a reroute never costs less than its
    // straight lines between the anchors (plus a service road's access).
    // (and once one side is built, its measured price stands in for its straight line; a candidate
    // whose first side cannot be built is not built further)
    const straight = [0, 1].map(k => required[k] && start?.[k] && finish?.[k] ? Math.hypot(finish[k]!.x - start[k]!.x, finish[k]!.y - start[k]!.y) : 0);
    const linkRate = (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000, access = c.cls === 'service' && straight[0] + straight[1] > 0 ? ACCESS : 0;
    if ((straight[0] + straight[1]) * linkRate + access >= budget) { diagnose(g, OVER_BUDGET); continue; }
    const links: CrossingPoint[][] = [];
    let culverts = 0, culvertCost = 0, steepest = 0, spent = 0, abandon = false;
    const houses = new Set<number>();
    for (const side of [-1, 1]) {
      const k = side < 0 ? 0 : 1, a = start?.[k], b = finish?.[k];
      if (k === 1 && anchorOnly && (g.diagnostics?.length || spent + straight[1] * linkRate + access >= budget)) { abandon = true; break; }
      if (!required[k] || !a || !b) { links.push([]); continue; }
      const s0 = project(a).s, s1 = project(b).s, lo = Math.min(s0, s1), hi = Math.max(s0, s1);
      const stations = [lo];
      for (let i = firstAbove(route.s, lo, false); i < route.s.length && route.s[i] < hi; i++) stations.push(route.s[i]);
      stations.push(hi);
      // Start with the full daylight boundary, then shortcut only with checked clearance.
      // Draping and billing use that same path. Excessively long links are explicitly budget-limited.
      if (stations.length > MAX_POINTS - 4) {
        diagnose(g, 'Link exceeds the bounded route sampling budget');
        const stride = Math.ceil(stations.length / (MAX_POINTS - 4));
        const reduced = stations.filter((_, i) => i % stride === 0); if (reduced[reduced.length - 1] !== hi) reduced.push(hi);
        stations.splice(0, stations.length, ...reduced);
      }
      if (s1 < s0) stations.reverse();
      // Candidate treatments rebuild the same link between the same anchors; within one call the
      // route and terrain are immutable, so reuse the smoothed controls (copied, never shared).
      const key = `${a.x},${a.y},${b.x},${b.y},${side},${g.width},${stations.length}`;
      const shape = c.via?.[k];
      // Across evaluate()'s engineering passes a line is reused only where our footprint is exactly
      // unchanged at every chainage its computation consulted (and PERSIST_PAD beyond).
      const remember = <T>(name: string, compute: () => T): T => {
        if (!persist) return compute();
        const left: ArrayLike<number> = route.left ?? Float64Array.from(route.width, w => w / 2), right: ArrayLike<number> = route.right ?? left;
        const hit = persist.links.get(name);
        if (hit && hit.left.every((v, i) => v === left[hit.i0 + i]) && hit.right.every((v, i) => v === right[hit.i0 + i])) return hit.value as T;
        const outer = { ...reads };
        Object.assign(reads, { on: true, lo, hi }); // (its stations, the side points it starts from)
        try {
          const value = compute();
          const i0 = firstAbove(route.s, reads.lo - PERSIST_PAD, true), i1 = Math.max(i0, firstAbove(route.s, reads.hi + PERSIST_PAD, false));
          persist.links.set(name, { i0, left: Float64Array.from({ length: i1 - i0 }, (_, i) => left[i0 + i]), right: Float64Array.from({ length: i1 - i0 }, (_, i) => right[i0 + i]), value });
          return value;
        } finally { Object.assign(reads, outer); }
      };
      let cached = smoothed.get(key);
      if (!cached) {
        cached = remember(`s|${key}`, () => smoothLink([a, ...stations.map(s => sidePoint(s, side)), b],
          // One-off chord probes must not evict reusable anchor/bisection projections.
          q => margin(q, g.width / 2, false), terrainPoint, SETBACK - 1e-5));
        smoothed.set(key, cached);
      }
      // The player's shape: straight legs through their bend points between the same real anchors.
      const controls: XY[] = shape?.length ? [a, ...shape, b] : cached.map((p, i) => i === 0 ? a : i === cached.length - 1 ? b : { ...p });
      let link: CrossingPoint[];
      if (shape?.length && crossingPlanLength(controls) > 4 * MAX_REACH) {
        // Bounded work: a shape reaching beyond the crossed road's traced reach is rejected outright.
        diagnose(g, LINK_TOO_FAR);
        link = controls.map((p, i) => i === 0 ? a : i === controls.length - 1 ? b : terrainPoint(p));
      } else {
        // Built as a designer would (link-route.ts): a profile within the class gradient, culverts,
        // nothing it may not cross; an automatic line that cannot is searched for a gentler one.
        const routeKey = `${key}|${c.cls}|${shape?.length ? JSON.stringify(shape) : ''}`;
        let plan = routed.get(routeKey);
        const rate = (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000;
        if (!plan) plan = remember(`r|${routeKey}|${rate}`, () => {
          let plan: LinkPlan;
          const price = (p: LinkPlan) => crossingPlanLength(p.points) * rate + p.culvertCost + p.houseCost;
          const better = (p: LinkPlan, q: LinkPlan) => p.problems.length < q.problems.length || (!p.problems.length && !q.problems.length && price(p) < price(q));
          // A designer keeps to the class's ordinary gradient where the ground allows, and uses its
          // justified-case maximum (research/20) where it does not; only a line that still cannot be
          // built (or runs through houses) sends them looking for a gentler or clearer one nearby.
          const row = ROAD_CLASSES[c.cls];
          const survey = surveyLink(controls, g.width, linkEnv);
          plan = profileLink(survey, row.rampGradient, linkEnv);
          if (plan.problems.includes('steep') && row.rampSteepest > row.rampGradient) {
            const steeper = profileLink(survey, row.rampSteepest, linkEnv);
            if (better(steeper, plan)) plan = steeper;
          }
          // (a river or a motorway between its ends cannot be gone around beside our road, nor,
          // practically, a railway the straight line between its ends crosses as well)
          const around = !plan.problems.some(p => p === 'river' || p === 'motorway')
            && !(plan.problems.includes('railway') && route.obstacle?.(a, b, g.width / 2) === 'railway');
          // (houses alone: only when buying them out is a sizeable part of the reroute's price)
          if (!shape?.length && around && (plan.problems.length || plan.houseCost > 0.25 * crossingPlanLength(plan.points) * rate)) {
            const grade = plan.grade;
            const place = (s: number, offset: number) => {
              const p = at(s), o = (side > 0 ? p.left : p.right) + offset;
              return { x: p.x - p.ty * o * side, y: p.y + p.tx * o * side };
            };
            const line = routeAlong(a, b, s0, s1, place, g.width, linkEnv, SETBACK, grade, rate);
            const other = line && engineerLink(line, g.width, linkEnv, grade);
            if (other && better(other, plan)) plan = other;
          }
          return plan;
        });
        routed.set(routeKey, plan);
        // the player's shape: one problem each (each has its own fix); an automatic line: one, with every reason
        if (shape?.length) for (const problem of plan.problems) diagnose(g, linkMessage(problem, true));
        else if (plan.problems.length) diagnose(g, `${REROUTE_FAILS}${[...plan.problems].sort().join(',')}`);
        link = plan.points.map((p, i) => i === 0 ? a : i === plan!.points.length - 1 ? b : { ...p });
        culverts += plan.culverts.length; culvertCost += plan.culvertCost;
        for (const j of plan.houses) houses.add(j);
        if (plan.grade > ROAD_CLASSES[c.cls].rampGradient && !plan.problems.includes('steep')) steepest = Math.max(steepest, plan.grade);
      }
      links.push(link);
      spent += crossingPlanLength(link) * linkRate + (k === 0 ? culvertCost : 0);
    }
    if (abandon) { if (!g.diagnostics?.length) diagnose(g, OVER_BUDGET); continue; }
    g.links = links as [CrossingPoint[], CrossingPoint[]];
    g.turnarounds = links.filter(path => path.length > 0).map(path => path[0]);
    c.linkLength = links.reduce((sum, path) => sum + crossingPlanLength(path), 0);
    const houseCost = [...houses].reduce((a, j) => a + (route.houseCost?.(j) ?? 0), 0);
    c.cost = c.linkLength * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000 + (c.cls === 'service' && c.linkLength > 0 ? ACCESS : 0) + culvertCost + houseCost;
    if (culverts) { c.culverts = culverts; c.culvertCost = culvertCost; } else { delete c.culverts; delete c.culvertCost; delete c.houses; delete c.houseCost; delete c.linkGrade; }
    if (houses.size) { c.houses = [...houses]; c.houseCost = houseCost; } else { delete c.houses; delete c.houseCost; delete c.linkGrade; }
    if (steepest) c.linkGrade = steepest; else delete c.linkGrade;
  }
  // Refine terrain-only spans against interior elevations, not just their endpoints. This prevents
  // a nominally draped 10 m chord from floating over a sharp gully between its stored samples.
  // Original OSM vertices and engineered boundaries retain object identity; recursion and output
  // are bounded even on discontinuous/malformed terrain callbacks.
  const refineTerrain = (path: CrossingPoint[], g: CrossingGeometry): CrossingPoint[] => {
    if (path.length < 2) return path;
    const out = [path[0]];
    let budget = Math.max(0, MAX_POINTS - path.length);
    const segment = (a: CrossingPoint, b: CrossingPoint, depth: number) => {
      let error = 0;
      if (a.surface === 'terrain' && b.surface === 'terrain') for (const t of [0.25, 0.5, 0.75])
        error = Math.max(error, Math.abs(a.z + (b.z - a.z) * t - heightAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)));
      if (error > 0.2 && budget > 0 && depth < 12) {
        budget--;
        const mid = terrainPoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
          ...(a.d !== undefined && b.d !== undefined ? { d: (a.d + b.d) / 2 } : {}) });
        segment(a, mid, depth + 1); segment(mid, b, depth + 1);
      } else {
        if (error > 0.5) diagnose(g, 'Terrain profile exceeds the bounded point budget');
        out.push(b);
      }
    };
    for (let i = 1; i < path.length; i++) segment(path[i - 1], path[i], 0);
    return out;
  };
  for (const c of crossings) {
    const g = c.geometry!;
    // (a crossing built only to anchor a candidate reroute: its anchors are already taken)
    if (anchorOnly?.has(c)) continue;
    if (g.road) {
      const old = g.road, road = refineTerrain(old, g);
      if (g.deck) { g.deck.start = road.indexOf(old[g.deck.start]); g.deck.end = road.indexOf(old[g.deck.end]); }
      if (g.approaches) for (const range of g.approaches) { range.start = road.indexOf(old[range.start]); range.end = road.indexOf(old[range.end]); }
      if (g.underpass) {
        g.underpass.start = road.indexOf(old[g.underpass.start]); g.underpass.end = road.indexOf(old[g.underpass.end]);
        // Recheck on the refined way: a ridge between the first samples must not hide in the roof.
        const size = ROAD_CLASSES[c.cls].underpass;
        if (size && underpassLowest(road, g.underpass.start, g.underpass.end, (route.crownWidth ?? 0) / 2 + g.width / 2,
          q => project(q, false), heightAt) < underpassAssembly(size, 0).minHeight - 1e-6) diagnose(g, UNDERPASS_TOO_LOW);
      }
      g.road = road;
    }
    if (g.links) g.links = g.links.map(path => refineTerrain(path, g)) as [CrossingPoint[], CrossingPoint[]];
  }
  // The rebuilt stretch's own slopes must leave other roads usable: regrade side roads joining it,
  // hold the slope back from roads beside it, or report the treatment infeasible (crossing-works.ts).
  const claimed: XY[][] = [];
  for (const c of crossings) {
    const g = c.geometry!;
    if (!roads || !g.road || anchorOnly?.has(c) || (c.type !== 'junction' && c.type !== 'overbridge' && !(c.type === 'underpass' && c.lowered)) || g.diagnostics?.length) continue;
    const works = crossingWorks(g.road, g.width, getPath(c.roadId, c.x, c.y, g), {
      roads, heightAt, ours: (q, pad) => margin(q, pad) <= 0, rampLimit, maxTie: MAX_RAMP_LENGTH, urban: (route.urban?.[c.i] ?? 0) >= 0.5 ? 1 : 0, claimed });
    for (const message of works.problems) diagnose(g, message);
    if (works.ties.length) g.ties = works.ties;
    for (const [i, wall] of works.walls) g.road[i] = { ...g.road[i], wall };
    if (works.cost > 0) { c.worksCost = works.cost; c.cost += works.cost; }
    if (works.tieLength > 0) c.tieLength = works.tieLength;
    if (works.wallLength > 0) c.wallLength = works.wallLength;
  }
  const issues: CrossingIssue[] = [];
  for (const c of crossings) for (const message of c.geometry?.diagnostics ?? []) {
    const text = diagnosticText(message, c);
    const issue: CrossingIssue = { kind: 'crossing', s0: c.s, s1: c.s, ...text,
      crossing: { roadId: c.roadId, requested: c.requestedType ?? (c.type === 'diversion' ? 'reconnection' : c.type === 'tunnel' || c.type === 'atGrade' ? 'bridge' : c.type),
        code: message.startsWith(SHAPED) ? 'shape' : message.startsWith(REROUTE) ? 'reroute' : 'geometry' } };
    (c.issues ??= []).push(issue); issues.push(issue);
  }
  return issues;
}

/** Geometry-aware, bounded Auto feedback. Explicit choices are never changed. Candidate links
 * grow only onto already connected real roads; dependency checks keep the connection graph acyclic.
 * One final rebuild anchors every dependent link to the treatment actually selected, and remeasures
 * its bill. This is a local feasibility/economic pass, not an unrestricted network optimizer. */
export function buildCrossingGeometry(crossings: CrossingResult[], route: CrossingRoute,
  heightAt: (x: number, y: number) => number, roads?: RoadNet, persist?: CrossingCache): CrossingIssue[] {
  if (route.s.length < 2) return [];
  const spatial = routeGeometry(route);
  // Candidate treatments and the final rebuild use the same immutable OSM alignment. Share only
  // its dense XY samples, not mutable terrain/engineered points or treatment-dependent anchors.
  const paths = persist?.paths ?? new Map<string, CachedPath>(), smoothed = new Map<string, CrossingPoint[]>(), sidesOf = new Map<string, [boolean, boolean]>();
  // Engineered reroutes between the same anchors are the same within one call (terrain and route fixed).
  const routed = new Map<string, LinkPlan>(), linkMemo = { free: new Map<number, number>() };
  const build = (items: CrossingResult[], budget = Infinity, anchorOnly?: ReadonlySet<CrossingResult>) =>
    buildCrossingGeometryOnce(items, route, heightAt, roads, spatial, paths, smoothed, routed, linkMemo, sidesOf, budget, persist, anchorOnly);
  build(crossings);
  const clone = (c: CrossingResult): CrossingResult => {
    const copy: CrossingResult = { ...c, geometry: undefined, cost: c.cost - (c.worksCost ?? 0),
      issues: c.issues?.filter(v => !built(v)) };
    delete copy.worksCost; delete copy.tieLength; delete copy.wallLength; delete copy.culverts; delete copy.culvertCost; delete copy.houses; delete copy.houseCost; delete copy.linkGrade; delete copy.lowered; delete copy.drainage; delete copy.drainCost;
    return copy;
  };
  const feasible = (c: CrossingResult) => !c.issues?.length && !c.geometry?.diagnostics?.length;
  const baseline = crossings.map(c => ({ state: { ...c }, feasible: feasible(c) }));
  const dependsOn = (target: CrossingResult, source: CrossingResult): boolean => {
    const visited = new Set<CrossingResult>();
    let next: CrossingResult | undefined = target;
    while (next && !visited.has(next)) {
      if (next === source) return true;
      visited.add(next);
      const current: CrossingResult = next;
      next = current.targetS === undefined ? undefined : crossings.find(t => t.s === current.targetS && t.roadId === current.targetRoadId);
    }
    return !!next;
  };
  let changed = false;
  // The dearest treatments are reconsidered first: a crossing others are then rerouted to keeps carrying them.
  const reconsider = (c: CrossingResult) => {
    // An automatic junction is reconsidered only when its own works cannot be built (crossing-works.ts).
    const worksFail = c.type === 'junction' && !!c.geometry?.diagnostics?.some(m => m === WORKS_COVER_ROAD || m === WORKS_TIE_TOO_LONG || m === WORKS_TIE_SHARED);
    if (c.requestedType || ROAD_CLASSES[c.cls].noAtGrade || !(worksFail || ['overbridge', 'reconnection', 'diversion', 'underpass'].includes(c.type))) return;
    // A box or bridge over us whose way runs back under our earthworks (geometry.runsBack) is kept only
    // when nothing else can be built: the stretch under our slope would still have to be walled or moved.
    const ok = (x: CrossingResult) => feasible(x) && !x.geometry?.runsBack;
    let best = c, fallback: CrossingResult | undefined;
    const originalFeasible = ok(c);
    const consider = (x: CrossingResult) => {
      if (ok(x)) { if (!ok(best) || x.cost < best.cost) best = x; }
      else if (feasible(x) && (!fallback || x.cost < fallback.cost)) fallback = x;
    };
    // A measured box through our embankment, when the class, the fill and the structure allow it.
    if (c.type !== 'underpass' && route.kind?.[c.i] === KIND.earth && underpassFits(c, 0)) {
      const box = clone(c); box.type = 'underpass';
      delete box.targetS; delete box.targetRoadId; delete box.linkLength; delete box.span; delete box.approachLength;
      build([box]);
      consider(box);
    }
    if (c.type !== 'overbridge' && (!originalFeasible || c.cost > deckPrice(c, route.width[c.i]))) {
      const over = clone(c); over.type = 'overbridge'; delete over.targetS; delete over.targetRoadId; delete over.linkLength; delete over.underpassLength;
      build([over]);
      consider(over);
    }
    // A feasible link keeps its place unless cheaper above; a measured box (estimated from the
    // footprint width) still competes with the bounded link shortlist below.
    if (c.type !== 'overbridge' && c.type !== 'underpass' && originalFeasible) {
      if (best !== c) {
        delete c.linkLength; delete c.targetS; delete c.targetRoadId; delete c.underpassLength;
        delete c.worksCost; delete c.tieLength; delete c.wallLength; delete c.culverts; delete c.culvertCost; delete c.houses; delete c.houseCost; delete c.linkGrade; delete c.lowered; delete c.drainage; delete c.drainCost;
        Object.assign(c, best); changed = true;
      }
      return;
    }
    // Long detours are a feasibility fallback, not a way to shave a tiny amount off an already
    // workable structure: beyond the 750 m shortlist a link must cost at most half of it (a 150 m
    // track overbridge over a deep cutting is not worth keeping a 760 m reroute away).
    // (a reroute leads to a crossing that carries traffic over or under us, not to another cut road; and a
    // crossing others lead to keeps carrying it)
    const ledTo = crossings.some(x => x !== c && x.targetS === c.s && x.targetRoadId === c.roadId);
    const targets = ledTo ? [] : crossings.filter(t => t !== c && feasible(t) && t.type !== 'atGrade' && t.type !== 'reconnection' && t.type !== 'diversion' && !ROAD_CLASSES[t.cls].noAtGrade
      && (c.cls === 'track' || c.cls === 'service' || (t.cls !== 'track' && t.cls !== 'service'))
      && Math.abs(t.s - c.s) <= CROSSING_RULES.linkHardReach && !dependsOn(t, c))
      .sort((a, b) => Math.abs(a.s - c.s) - Math.abs(b.s - c.s) || a.s - b.s);
    const worth = (link: CrossingResult, target: CrossingResult) => !ok(best)
      || link.cost < best.cost * (Math.abs(target.s - c.s) > CROSSING_RULES.linkMaxReach ? 0.5 : 1);
    // Surviving road sides each need a link running about as far along our road as the target
    // (less up to 250 m where a skewed way leaves our corridor further along): skip a long link that
    // cannot cost half a feasible structure.
    const sides = (sidesOf.get(`${c.roadId}:${c.x},${c.y}`) ?? [true, true]).filter(Boolean).length;
    const cannotPay = (target: CrossingResult) => ok(best) && Math.abs(target.s - c.s) > CROSSING_RULES.linkMaxReach
      && sides * Math.max(0, Math.abs(target.s - c.s) - 250) * Math.min(...ROAD_CLASSES[c.cls].roadPerKm) / 1000 >= best.cost * 0.5;
    for (const target of targets.slice(0, originalFeasible ? 1 : 3)) {
      if (cannotPay(target)) break;
      const link = clone(c); link.type = c.cls === 'track' ? 'diversion' : 'reconnection';
      delete link.span; delete link.approachLength; delete link.underpassLength;
      link.targetS = target.s; link.targetRoadId = target.roadId;
      const anchor = clone(target);
      // A resolved diversion's source is a real ground-level road node; its downstream link need
      // not be rebuilt to evaluate a new branch arriving at that source.
      if (anchor.type === 'reconnection' || anchor.type === 'diversion') anchor.type = 'bridge';
      build([anchor, link], ok(best) ? best.cost * (Math.abs(target.s - c.s) > CROSSING_RULES.linkMaxReach ? 0.5 : 1) : Infinity, new Set([anchor]));
      if (feasible(link) && worth(link, target)) { best = link; break; }
    }
    if (!ok(best) && fallback && (!feasible(c) || fallback.cost < c.cost)) best = fallback;
    if (best !== c) {
      delete c.span; delete c.approachLength; delete c.linkLength; delete c.targetS; delete c.targetRoadId; delete c.underpassLength;
      delete c.worksCost; delete c.tieLength; delete c.wallLength; delete c.culverts; delete c.culvertCost; delete c.houses; delete c.houseCost; delete c.linkGrade; delete c.lowered; delete c.drainage; delete c.drainCost;
      Object.assign(c, best); changed = true;
    }
  };
  for (const c of [...crossings].sort((a, b) => b.cost - a.cost || a.s - b.s)) reconsider(c);
  // (one that found no target while another still led to it looks again)
  for (const c of crossings) if (!feasible(c)) reconsider(c);
  if (!changed) return crossings.flatMap(c => c.issues?.filter(built) ?? []);
  const issues = build(crossings);
  // A new target treatment can move the ground anchor of a dependent link. Do not buy a cheaper
  // local option by breaking a previously feasible connection elsewhere in the network.
  if (crossings.some((c,i) => baseline[i].feasible && !feasible(c))) {
    crossings.forEach((c,i) => {
      for (const key of ['geometry','issues','span','approachLength','linkLength','targetS','targetRoadId','underpassLength','worksCost','tieLength','wallLength','culverts','culvertCost','houses','houseCost','linkGrade','lowered','drainage','drainCost'] as const) delete c[key];
      Object.assign(c, baseline[i].state);
    });
    return build(crossings);
  }
  return issues;
}

/** Independent remeasure of a crossing's side-road regrades and retaining walls (crossing-works.ts),
 * from what is drawn: tie lengths at their class rate, wall faces where the 1:1.5 slope reaches the wall. */
function auditWorks(g: CrossingGeometry, heightAt: (x: number, y: number) => number, urban: 0 | 1): number {
  let cost = 0;
  for (const tie of g.ties ?? []) cost += crossingPlanLength(tie.path) * ROAD_CLASSES[tie.cls].roadPerKm[urban] / 1000;
  const road = g.road ?? [], half = g.width / 2;
  const face = (i: number, side: 0 | 1, offset: number) => {
    const p = road[i], a = road[Math.max(0, i - 1)], b = road[Math.min(road.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, sign = side ? 1 : -1, nx = -(b.y - a.y) / len * sign, ny = (b.x - a.x) / len * sign;
    const delta = p.z - heightAt(p.x + nx * half, p.y + ny * half);
    if (Math.abs(delta) < 0.15) return 0;
    let off = .5; // the drawn daylight (render/crossing-surface.ts)
    for (; off < 300; off += 1) { const z = heightAt(p.x + nx * (half + off), p.y + ny * (half + off)); if (delta > 0 ? p.z - off / 1.5 <= z : p.z + off / 1.5 >= z) break; }
    if (half + off <= offset) return 0;
    const top = delta > 0 ? p.z - (offset - half) / 1.5 : p.z + (offset - half) / 1.5, ground = heightAt(p.x + nx * offset, p.y + ny * offset);
    return Math.max(0, delta > 0 ? top - ground : ground - top);
  };
  for (let i = 0; i + 1 < road.length; i++) for (const side of [0, 1] as const) {
    const a = road[i].wall?.[side], b = road[i + 1].wall?.[side];
    if (a === undefined || b === undefined) continue;
    const h = (face(i, side, a) + face(i + 1, side, b)) / 2;
    if (h > 0) cost += Math.hypot(road[i + 1].x - road[i].x, road[i + 1].y - road[i].y) * retainingAssembly(h).perM;
  }
  return cost;
}

export interface CrossingAuditIssue { roadId?: number; s: number; message: string; severity: 'error' | 'infeasible' }
/** Independent streaming checks over final geometry, suitable for tests and saved-design audits. */
export function auditCrossingGeometry(crossings: readonly CrossingResult[], route: CrossingRoute,
  heightAt: (x: number, y: number) => number, roads?: RoadNet): CrossingAuditIssue[] {
  const issues: CrossingAuditIssue[] = [];
  if (route.s.length < 2) return issues;
  const { project, margin } = routeGeometry(route);
  for (const c of crossings) {
    const g = c.geometry;
    const report = (message: string, severity: CrossingAuditIssue['severity'] = 'error') => {
      if (!issues.some(v => v.roadId === c.roadId && v.s === c.s && v.message === message)) issues.push({ roadId: c.roadId, s: c.s, message, severity });
    };
    if (!g) { report('Missing crossing geometry'); continue; }
    for (const message of g.diagnostics ?? []) report(message, 'infeasible');
    const paths = [...(g.road ? [g.road] : []), ...(g.links ?? [])];
    for (const path of paths) {
      if (path.length > MAX_POINTS) report('Point budget exceeded');
      for (const q of path) {
        const ground = heightAt(q.x, q.y);
        if (![q.x, q.y, q.z, q.ground].every(Number.isFinite)) report('Non-finite geometry');
        if (Math.abs(q.ground - ground) > 0.01) report('Stale terrain metadata');
        if (q.surface === 'terrain' && Math.abs(q.z - ground) > 0.3) report('Terrain sample is not draped');
        if (q.surface !== 'deck' && Math.abs(q.z - ground) > 0.3 && !q.support) report('Adjusted surface lacks earthwork support');
      }
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        if (a.surface === 'deck' || b.surface === 'deck' || a.support || b.support) continue;
        for (const t of [0.25, 0.5, 0.75]) {
          const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
          if (z - heightAt(x, y) > 0.5) report('Unsupported flotation between terrain samples');
          if (heightAt(x, y) - z > 0.5) report('Terrain road is buried between samples');
        }
      }
      for (const q of [path[0], path[path.length - 1]]) if (q) {
        const connected = q.connection === 'main-road';
        if (connected && margin(q, 0) > 0.3) report('Main-road endpoint lies outside its footprint');
        if (Math.abs(q.z - (connected ? project(q).z : heightAt(q.x, q.y))) > 0.3) report('Dangling endpoint');
      }
    }
    if (g.deck && g.road) {
      const { start, end, depth } = g.deck, road = g.road;
      if (start < 0 || end <= start || end >= road.length) report('Invalid deck bounds');
      else {
        for (let i = start; i <= end; i++) {
          const q = road[i];
          if (q.z - depth < project(q).z + CLEARANCE - 0.01) report('Deck does not clear the crown by 4.8 m');
        }
        if (Math.abs(crossingPlanLength(road.slice(start, end + 1)) - (c.span ?? 0)) > 0.01) report('Deck quantity differs from geometry');
      }
    }
    if (g.approaches && g.road) {
      let length = 0;
      for (const [k, { start, end }] of g.approaches.entries()) {
        if (start < 0 || end < start || end >= g.road.length) { report('Invalid approach bounds'); continue; }
        const run = crossingPlanLength(g.road.slice(start, end + 1));
        length += run;
        const edge = g.road[k === 0 ? end : start], foot = g.road[k === 0 ? start : end];
        const limit = rampLimit(c.cls, edge.z, edge.ground, foot.ground, run);
        for (let i = start + 1; i <= end; i++) {
          const a = g.road[i - 1], b = g.road[i], step = Math.hypot(b.x - a.x, b.y - a.y);
          if (Math.abs(b.z - a.z) > step * limit + 0.01 && !g.diagnostics?.includes(RAMP_TOO_LONG)) report('Undiagnosed excessive approach gradient');
        }
      }
      if ((c.type === 'overbridge' || c.type === 'underpass') && Math.abs(length - (c.approachLength ?? 0)) > 0.01) report('Approach quantity differs from geometry');
    }
    if (g.links) {
      for (const path of g.links) {
        for (const q of path) if (margin(q, g.width / 2) < -0.1) report('Link intrudes into the earthwork footprint');
        if (roads && path.length) for (const q of [path[0], path[path.length - 1]])
          if (roads.nearestWay(q.x, q.y, 0.3) === undefined) report('Link endpoint does not meet a real ground road');
      }
      if (Math.abs(g.links.reduce((sum, path) => sum + crossingPlanLength(path), 0) - (c.linkLength ?? 0)) > 0.01) report('Link quantity differs from geometry');
      const price = (c.linkLength ?? 0) * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000
        + (c.cls === 'service' && (c.linkLength ?? 0) > 0 ? ACCESS : 0) + (c.culvertCost ?? 0) + (c.houseCost ?? 0);
      if (Math.abs(price - c.cost) > 0.01) report('Link bill differs from measured quantities');
    }
    // Side-road regrades and walls, remeasured from the drawn geometry (rural or urban rate).
    const works = ([0, 1] as const).map(u => auditWorks(g, heightAt, u));
    if (c.type === 'underpass' && g.underpass && g.road) {
      const { start, end } = g.underpass, size = ROAD_CLASSES[c.cls].underpass;
      if (start < 0 || end <= start || end >= g.road.length || !size) report('Invalid underpass bounds');
      else {
        const box = underpassAssembly(size, (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000);
        if (Math.abs(crossingPlanLength(g.road.slice(start, end + 1)) - (c.underpassLength ?? 0)) > 0.01) report('Underpass quantity differs from geometry');
        const price = (c.underpassLength ?? 0) * box.perM + 2 * box.head + (c.approachLength ?? 0) * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000 + (c.drainCost ?? 0);
        if (works.every(w => Math.abs(price + w - c.cost) > 0.01)) report('Underpass bill differs from measured quantities');
        if (!c.lowered && g.road.some(q => q.surface !== 'terrain')) report('Underpass way leaves its terrain level');
        if (c.lowered !== undefined && (!g.approaches || c.lowered > LOWERING_RULES.maxDepth + 1e-6) && !g.diagnostics?.length) report('Lowered underpass way is not engineered');
        if (!g.diagnostics?.length && underpassLowest(g.road, start, end, (route.crownWidth ?? 0) / 2 + g.width / 2, q => project(q), heightAt)
          < box.minHeight - 1e-6) report('Underpass roof does not clear the carriageway');
      }
    }
    if (c.type === 'overbridge') {
      const price = deckPrice(c, c.span ?? 0) + (c.approachLength ?? 0) * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000;
      if (works.every(w => Math.abs(price + w - c.cost) > 0.01)) report('Overbridge bill differs from measured quantities');
    }
    if (c.type === 'junction' && works.every(w => Math.abs(JUNCTION + w - c.cost) > 0.01)) report('Junction bill differs from measured quantities');
  }
  return issues;
}
