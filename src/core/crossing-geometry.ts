// Bounded study geometry on real OSM polylines. Quantities are measured from these same paths.
import type { CrossingGeometry, CrossingIssue, CrossingPoint, CrossingResult, CrossingRoute, UnderpassWing } from './crossings';
import { ACCESS, CROSSING_RULES, JUNCTION, ROAD_CLASSES } from './data/urban';
import type { RoadNet } from './roadnet';
import { bridgeModel } from './bridge';
import { smoothLink } from './crossing-link';
import { engineerLink, LINK_CORRIDOR, profileLink, routeAlong, surveyLink, type LinkEnv, type LinkPlan, type LinkProblem } from './link-route';
import { crossingWorks, WORKS_COVER_ROAD, WORKS_TIE_SHARED, WORKS_TIE_TOO_LONG } from './crossing-works';
import { LINK_MAX_SUPPORT, LOWERING_RULES, MAX_RAMP_LENGTH, OVERBRIDGE_CLEARANCE as CLEARANCE, RETAINING_RULES, retainingAssembly, sagDrainage, SQUARE_BELOW, underpassAssembly, underpassOpenCost, UNDERPASS_RULES } from './data/remedies';
export { SQUARE_BELOW };
import { slopeSurfaceAt } from './sections';
import { UNKNOWN_GROUND } from './ground';
import { KIND } from './structures';
import { acos, atan2, cos, sin, tan } from './detmath';
import { INDEPENDENCE_SCREEN } from './project-ledger';

const MAX_POINTS = 500, MAX_REACH = CROSSING_RULES.linkHardReach, STEP = 10, SETBACK = 3;
/** Diagnostic when a raised approach cannot reach the old road's ground within the class gradient. */
export const RAMP_TOO_LONG = 'Approach ramp cannot get back down to the old road within its steepest allowed slope';
export const RAMP_TOO_HIGH = 'Approach earthwork exceeds';
const DEPTH = CROSSING_RULES.underDepth - CLEARANCE;
/** Reroute work kept across evaluate()'s engineering passes (its strict retry), for one design on fixed
 * terrain and roads: the crossed ways' traced lines, and smoothed lines / engineered reroutes, each
 * reused only while our footprint within PERSIST_REACH of its stations is exactly unchanged. */
export interface CrossingCache {
  paths: Map<string, CachedPath>;
  links: Map<string, { i0: number; left: Float64Array; right: Float64Array; value: unknown }>;
  /** The last build with this cache put every crossing back to its first treatment (the rollback at the end of
   * buildCrossingGeometry): its result is then not a sum of local decisions (crossings-kept.ts). */
  rolledBack?: boolean;
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
/** The crossed way's stretch through our earthworks (crossing-geometry cutOf). */
type CutOf = { d0: number; d1: number; open: boolean; sides: [number, number]; angle: number; run: number };
/** Work shared by the builds of one buildCrossingGeometry call (our road and the terrain are fixed):
 * each way's stretch through our earthworks, its straightened line, and the geometry of a crossing
 * built only to anchor candidate reroutes (the same for every candidate led to it). */
type BuildMemo = { cuts: Map<string, CutOf | undefined>; squares: Map<string, unknown>; crossingWays: Set<number | undefined>;
  anchorBuilds: Map<string, { g: CrossingGeometry; raw: () => readonly (Readonly<WayPoint> | CrossingPoint)[]; sides: [boolean, boolean] }>;
  anchorMemo: Map<object, Map<number, [CrossingPoint | undefined, CrossingPoint | undefined]>> };
const buildMemo = (ways: readonly (number | undefined)[] = []): BuildMemo => ({ cuts: new Map(), squares: new Map(), crossingWays: new Set(ways), anchorBuilds: new Map(), anchorMemo: new Map() });
type WayPoint = XY & { d: number };
type CachedPath = { path: readonly Readonly<WayPoint>[]; diagnostics: readonly string[] };
/** Immutable shared way paths, stably ordered by distance from their crossing. */
type Junction = WayPoint & { ways: number[] };
const pathJunctions = new WeakMap<readonly Readonly<WayPoint>[], Map<number, Junction[]>>();
const sortedPaths = new WeakMap<readonly Readonly<WayPoint>[], readonly Readonly<WayPoint>[]>();
const byDistance = (path: readonly Readonly<WayPoint>[]) => {
  let sorted = sortedPaths.get(path);
  if (!sorted) sortedPaths.set(path, sorted = [...path].sort((a, b) => Math.abs(a.d) - Math.abs(b.d)));
  return sorted;
};
// Match the main bridge model's clear-span overbridge layout: abutments on the banks, no
// piers in our traffic corridor. Raised earth approaches are billed separately below.
/** A railway or motorway of the project carried over us (`c.designed`) climbs to the deck on its own line,
 * drawn and billed by itself (its grade is held at the deck, project-evaluate.ts): the crossing builds
 * and bills its deck only, no approach ramps of its own. */
export const ownApproaches = (c: Pick<CrossingResult, 'designed' | 'cls'>) => !!c.designed && !!ROAD_CLASSES[c.cls]?.noAtGrade;
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
/** An issue of the build (buildCrossingGeometry), not of the treatment's choice (resolveCrossings). */
export const built = (v: CrossingIssue) => v.crossing.code === 'geometry' || v.crossing.code === 'shape' || v.crossing.code === 'reroute' || v.crossing.code === 'square';
/** Every diagnostic of a player's reroute shape starts so (issue code 'shape'). */
const SHAPED = 'Shaped link';

export const LINK_OVER_OUR_ROAD = 'Shaped link enters our earthworks';
export const LINK_TOO_STEEP = 'Shaped link is steeper than its class allows';
export const LINK_TOO_FAR = 'Shaped link runs too far';
export const LINK_CROSSES_MOTORWAY = 'Shaped link crosses a motorway at grade';
/** + 'railway' | 'water' | 'building' */
export const LINK_BLOCKED = 'Shaped link runs through a ';

/** The height of an engineered line (link-route.ts profileLink) at distance d along it. */
function linkHeight(points: readonly CrossingPoint[], d: number): number {
  let k = 1;
  while (k < points.length - 1 && points[k].d! < d) k++;
  const a = points[k - 1], b = points[k], t = Math.max(0, Math.min(1, (d - a.d!) / ((b.d! - a.d!) || 1)));
  return a.z + (b.z - a.z) * t;
}

/** Diagnostics of an automatic reroute that cannot be built (the treatment is then infeasible). */
const REROUTE = 'Reroute ', REROUTE_FAILS = 'Reroute cannot be built: ';
/** Diagnostic of a crossing that cannot be straightened (+ reasons: ends, same, room or link problems). */
const SQUARE_FAILS = 'Straightened line cannot be built: ';
/** Diagnostic of a move beside our earthworks on a way that does cross our road. */
const MOVE_FAILS = 'Move cannot be built';
/** How far along the old way beyond our corridor a straightened line may rejoin it, m (PROVISIONAL
 * engine bound: a local realignment, not a reroute). */
const SQUARE_SEARCH = 400;
/** Tangent lengths tried for a straightened line's bend, as shares of its chord (engine search). */
const BEND_SHARES = [0.15, 0.3, 0.45], CURVE_SHARES = [0.4, 0.25, 0.55];
/** The line from p (heading u) to q (arriving heading v) as p → m1 = p + u·a → m2 = q − v·b → q, its two
 * corners rounded by circular arcs of radius r (sampled every ≈ 5 m), or undefined where they do not fit. */
function twoBends(p: XY, u: XY, q: XY, v: XY, a: number, b: number, r: number): XY[] | undefined {
  const m1 = { x: p.x + u.x * a, y: p.y + u.y * a }, m2 = { x: q.x - v.x * b, y: q.y - v.y * b };
  const mid = Math.hypot(m2.x - m1.x, m2.y - m1.y);
  if (mid < 1e-6) return undefined;
  const w = { x: (m2.x - m1.x) / mid, y: (m2.y - m1.y) / mid };
  const turn = (d1: XY, d2: XY) => acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y)));
  const t1 = r * tan(turn(u, w) / 2), t2 = r * tan(turn(w, v) / 2);
  if (!(t1 <= a + 1e-6 && t2 <= b + 1e-6 && t1 + t2 <= mid + 1e-6)) return undefined;
  const arc = (m: XY, d1: XY, d2: XY, t: number): XY[] => {
    const cross = d1.x * d2.y - d1.y * d2.x;
    if (t < 1e-3 || Math.abs(cross) < 1e-9) return [m];
    const side = cross > 0 ? 1 : -1, s0 = { x: m.x - d1.x * t, y: m.y - d1.y * t };
    const centre = { x: s0.x - d1.y * side * r, y: s0.y + d1.x * side * r };
    const a0 = atan2(s0.y - centre.y, s0.x - centre.x), sweep = turn(d1, d2) * side;
    const count = Math.max(2, Math.ceil(Math.abs(sweep) * r / 5));
    return Array.from({ length: count + 1 }, (_, k) => ({ x: centre.x + r * cos(a0 + sweep * k / count), y: centre.y + r * sin(a0 + sweep * k / count) }));
  };
  return [p, ...arc(m1, u, w, t1), ...arc(m2, w, v, t2), q];
}
/** Bounded engine work: rounds of the consolidation pass. */
const JOIN_ROUNDS = 3;
/** A reroute joins its target's road away from the crossing only where that line is at most this share
 * of the straight line to the crossing (search economy; the cheaper buildable one is kept). */
const JOIN_SHORTER = 0.8;
const SHAPED_LINK: Record<LinkProblem, string> = {
  steep: LINK_TOO_STEEP, footprint: LINK_OVER_OUR_ROAD, motorway: LINK_CROSSES_MOTORWAY,
  railway: `${LINK_BLOCKED}railway`, water: `${LINK_BLOCKED}water`, building: `${LINK_BLOCKED}building`,
  river: 'Shaped link crosses a river', far: LINK_TOO_FAR, works: 'Shaped link runs into another road of the project',
};
const linkMessage = (problem: LinkProblem, _shaped: true) => SHAPED_LINK[problem];

/** The player's straightening that cannot be built (the way is built on its own line instead): why, from
 * what the straightened build diagnosed. `lowered`: how deep the way would have to be lowered there, m (where
 * the box on the new line lacks room: our road raised by what is missing would make it). */
function squareIssue(c: CrossingResult, messages: readonly string[], lowered: number | undefined): CrossingIssue {
  const what = ROAD_CLASSES[c.cls]?.label ?? 'road', square = messages.find(m => m.startsWith(SQUARE_FAILS));
  const text = diagnosticText(square ?? messages[0], c), low = !square && messages.includes(UNDERPASS_TOO_LOW) && lowered !== undefined && lowered > LOWERING_RULES.maxDepth;
  return { kind: 'crossing', s0: c.s, s1: c.s, basis: text.basis, rule: text.rule,
    title: `The ${what} cannot be straightened here`,
    fix: low ? `Raise our road here by ${(lowered - LOWERING_RULES.maxDepth).toFixed(1)} m, or choose "Keep its line" on the crossing card` : 'Choose "Keep its line" on the crossing card, or another kind of crossing',
    detail: `${square ? text.detail : `On a new line at a right angle: ${text.title.charAt(0).toLowerCase()}${text.title.slice(1)}.`} It stays on its own line meanwhile.`,
    crossing: { roadId: c.roadId, requested: c.requestedType!, code: 'square',
      ...(low ? { actual: lowered, required: LOWERING_RULES.maxDepth } : {}) } };
}

/** Plain-language violation text for a geometry diagnostic (the diagnostic string stays internal). */
function diagnosticText(message: string, c: CrossingResult): Pick<CrossingIssue, 'title' | 'fix' | 'detail' | 'basis' | 'rule'> {
  const what = ROAD_CLASSES[c.cls]?.label ?? 'road', choice = c.requestedType ? 'your crossing choice' : 'this crossing';
  const ramps = { fix: 'Lower our road here (a cutting makes the ramps shorter), or choose "Our bridge over it", an underpass or "Cut and reroute"',
    rule: `Game rule: ramps no steeper than ${Math.round(ROAD_CLASSES[c.cls].rampGradient * 100)} % for a ${what}, at most 10 m high` }; // research/20
  const trace = { title: `The game cannot trace where this ${what} goes`, fix: 'Set this crossing to "Our bridge over it", or move our road a little',
    detail: `The map data of this ${what} is too short or too detailed for the game to build ${choice}.`, basis: 'engine' as const,
    rule: 'Engine limit: crossings are built only along the real line of the crossed road, within 2 km of our road' };
  if (message === RAMP_TOO_LONG && c.type === 'junction') return { title: `The ${what} cannot be brought to our road's height for the junction`,
    fix: 'Move the junction where the two roads are closer in height, or choose "Our bridge over it" or "Its bridge over us"',
    detail: `Within the allowed slope, the ${what} would have to be raised or lowered all the way to where it ends.`, basis: 'game',
    rule: `Game rule: a ${what} raised or lowered to a junction is no steeper than ${Math.round(ROAD_CLASSES[c.cls].rampGradient * 100)} %` }; // research/20
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
      works: 'another road you build is in the way',
      none: 'no crossing within reach carries traffic over or under our road',
    } as Record<string, string>)[problem] ?? problem);
    const reason = reasons.join('; ');
    // the nearest structure: our bridge over it (raise our road) or its bridge over a deeper cutting;
    // where our road is already that high (deep), the height is not what stops it
    const raise = CROSSING_RULES.overHeight - c.h, lower = CROSSING_RULES.underDepth + c.h;
    const fix = c.h >= 0 && raise >= 0.05
      ? `Raise our road here by ${raise.toFixed(1)} m and put it on a bridge over the ${what}, or choose "Its bridge over us" or an underpass`
      : c.h < 0 && lower >= 0.05 ? `Lower our road here by ${lower.toFixed(1)} m so that the ${what} can cross over it on a bridge, or choose an underpass`
      : `Move our road a little here, or choose "Its bridge over us" or an underpass`;
    return { title: `No buildable reroute for the ${what}`,
      fix,
      detail: `A new piece of ${what} cannot reach the next crossing: ${reason}.`, basis: 'game',
      rule: `Game rule: a new road is no steeper than its class allows (ordinary / where unavoidable: track 10 / 15 %, service road and street 9 or 8 / 12 %, class III 7 / 9 %, class I/II 6 / 7 %) with earthworks at most ${LINK_MAX_SUPPORT} m deep; it crosses streams on culverts, buys out houses in its way and never runs on the ground across motorways, railways, ponds or rivers` };
  }
  if (message === SHAPED_LINK.river) return { title: `Your path for the new ${what} crosses a river`,
    fix: 'Drag its bend points so that it stays on this side of the river, or choose "Automatic path" on the crossing card',
    detail: `The river is too big for a culvert under a ${what}.`, basis: 'game',
    rule: 'Game rule: a new road crosses streams on culverts; rivers need a bridge, which reroutes do not get' };
  if (message === SHAPED_LINK.works) return { title: `Your path for the new ${what} runs into another road you build`,
    fix: 'Drag its bend points clear of that road, or choose "Automatic path" on the crossing card',
    detail: `The new piece of ${what} would come closer than ${INDEPENDENCE_SCREEN.clearance} m to that road's works.`, basis: 'engine',
    rule: `Engine limit: two roads' works are kept ${INDEPENDENCE_SCREEN.clearance} m apart, except where they meet` };
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
      rule: `Game rule: earthworks of a crossing may not cover other roads. A road joining it is regraded to meet it (no steeper than its class allows, at most ${MAX_RAMP_LENGTH} m); a road beside it is kept clear by a retaining wall up to ${RETAINING_RULES.maxHeight} m high` }; // research/18, research/20
  }
  if (message === RAMP_TOO_LONG && c.type === 'underpass') return { title: `Ramps down to the underpass would be longer than ${MAX_RAMP_LENGTH} m`,
    fix: 'Raise our road here (a higher embankment needs less lowering), or choose "Our bridge over it", "Its bridge over us" or "Cut and reroute"',
    detail: `The ${what} itself falls (or climbs) towards our road, so a ramp within the allowed slope gets back to it only far away, if at all.`, basis: 'game',
    rule: `Game rule: ramps no steeper than ${Math.round(ROAD_CLASSES[c.cls].rampGradient * 100)} % for a ${what}, at most ${MAX_RAMP_LENGTH} m long on each side` }; // research/20
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
    basis: 'game', rule: `Game estimate: an underpass box is at most ${UNDERPASS_RULES.maxLength} m long` }; // research/19
  if (message === UNDERPASS_TOO_LOW) return { title: 'Embankment too low for an underpass',
    fix: 'Raise our road here, or choose another crossing',
    detail: `Somewhere under our road the box would stick out of the embankment${c.lowered === undefined ? '' : `, even with the ${what} lowered as far as it may be (${LOWERING_RULES.maxDepth} m)`}: it needs room for its height, roof and earth cover.`,
    basis: 'game', rule: `Game estimate: an underpass needs its inside height plus roof and 0.5 m of earth below our road; the crossed road may be lowered by at most ${LOWERING_RULES.maxDepth} m` }; // research/19, research/37
  if (message === 'This road class cannot pass in a small underpass') return { title: `A ${what} cannot pass through a small underpass`,
    fix: 'Choose "Our bridge over it", "Its bridge over us" or "Cut and reroute"', detail: 'Underpass boxes are sized for tracks, service roads and local roads only.',
    basis: 'game', rule: 'Game estimate: underpass boxes for tracks, service roads and local roads' }; // research/19
  if (message === 'No real ground-level anchor exists for a surviving road branch') return { title: `No place to reconnect the ${what}`,
    fix: 'Choose "Its bridge over us" or an underpass, or "Our bridge over it" if our road is high enough',
    detail: `A cut-off end of the ${what} has no road on the ground nearby to be reconnected to.`, basis: 'game',
    rule: 'Game rule: every cut-off part of a road that still leads somewhere must be reconnected' };
  if (message.startsWith(SQUARE_FAILS)) {
    const reasons = message.slice(SQUARE_FAILS.length).split(',').map(problem => ({
      ends: `the ${what} ends under our earthworks`, same: `the ${what} comes back out of our earthworks on the side it went in`,
      room: 'there is no room for its bends beside our earthworks', steep: 'the ground beside our road is too steep for it',
      railway: 'it would have to cross a railway on the ground', water: 'it would have to run through a pond or river',
      river: 'it would have to cross a river too big for a culvert', motorway: 'it would have to cross a motorway on the ground',
      building: 'it would run through a house', junction: 'another road joining it there would be cut off',
    } as Record<string, string>)[problem] ?? problem).join('; ');
    return { title: `The ${what} cannot be straightened here`, fix: 'Choose "Keep its line" on the crossing card, or another kind of crossing',
      detail: `A new line crossing our road at a right angle cannot be built: ${reasons}.`, basis: 'game',
      rule: `Game rule: a straightened crossing bends no sharper than ${ROAD_CLASSES[c.cls].minRadius} m and is built like any new road` }; // research/44
  }
  if (message === MOVE_FAILS) return { title: `The ${what} cannot just be moved beside our road`,
    fix: 'Choose "Cut and reroute", "Its bridge over us" or an underpass', basis: 'engine',
    detail: `The ${what} crosses our road here, so it needs a crossing.`, rule: 'Engine limit: only a road that comes back out of our earthworks on the side it went in is moved beside them' };
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
  /** Our stations with chainages s0 … s1 (both included): where each is and our grade height there. */
  const between = (s0: number, s1: number, visit: (x: number, y: number, grade: number) => void) => {
    if (reads.on) { note(s0); note(s1); }
    for (let i = firstAbove(route.s, s0, true); i < n && route.s[i] <= s1; i++) visit(route.x[i], route.y[i], route.grade[i]);
  };
  return { at, project, margin, between, reads };
}

function along(path: readonly Readonly<WayPoint>[], d: number): WayPoint {
  let i = 0;
  while (i + 2 < path.length && path[i + 1].d < d) i++;
  const a = path[i], b = path[i + 1], t = Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d || 1)));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, d: Math.max(path[0].d, Math.min(path[path.length - 1].d, d)) };
}

const DENSE_CROPPED = 'OSM detail exceeds the bounded point budget';
/** Retain ALL source bends. A dense way is cropped near the crossing, never straightened. */
function denseWay(input: WayPoint[], diagnose: (s: string) => void): WayPoint[] {
  let path = input;
  if (path.length > MAX_POINTS - 16) {
    let centre = 0;
    for (let i = 1; i < path.length; i++) if (Math.abs(path[i].d) < Math.abs(path[centre].d)) centre = i;
    const start = Math.max(0, Math.min(path.length - MAX_POINTS + 16, centre - Math.floor((MAX_POINTS - 16) / 2)));
    path = path.slice(start, start + MAX_POINTS - 16); diagnose(DENSE_CROPPED);
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

type AnchorSample = Readonly<WayPoint> | CrossingPoint;
/** Stage 1 of buildCrossingGeometryOnce: the crossings' last build is cleared (issues, works) and the tools of
 * this build are made: the crossed ways' lines (`getPath`), their stretch through our earthworks (`cutOf`), the
 * line of a way laid square across us (`squarePath`), the reroute environment, and what the stages hand on
 * to each other per crossing (raw paths, surviving sides, anchors, squared lines). */
function crossingTools(crossings: CrossingResult[], route: CrossingRoute, heightAt: (x: number, y: number) => number, roads: RoadNet | undefined, spatial: ReturnType<typeof routeGeometry>, paths: Map<string, CachedPath>, linkMemo: NonNullable<LinkEnv['memo']>, memo: BuildMemo) {
  const { cuts, squares, anchorBuilds, anchorMemo, crossingWays } = memo;
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
    if (!message.startsWith(SHAPED) && !message.startsWith(REROUTE) && !message.startsWith(SQUARE_FAILS)) g.clipped = true;
    if (!g.diagnostics?.includes(message)) (g.diagnostics ??= []).push(message);
  };
  /** how many of the houses a reroute buys out are homes */
  const homesOf = (c: CrossingResult) => { const k = c.houses?.filter(j => route.dwelling?.(j)).length ?? 0; if (k) c.homes = k; else delete c.homes; };
  // Terrain-only source samples need elevations only at the selected anchors, not along the
  // entire bounded way. Engineered paths retain their full surface/support metadata.
  const rawPaths = new Map<CrossingResult, () => readonly AnchorSample[]>(), rawMade = new Map<CrossingResult, readonly AnchorSample[]>();
  const rawOf = (c: CrossingResult) => {
    let made = rawMade.get(c);
    if (!made && rawPaths.has(c)) rawMade.set(c, made = rawPaths.get(c)!());
    return made;
  };
  /** Ways laid on a new line to cross square (their works are checked along it). */
  const squaredPaths = new Map<CrossingResult, readonly Readonly<WayPoint>[]>();
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
    // (a designed road of the project is drawn and checked by itself: its line, sampled every few metres,
    // is only cropped around the crossing here)
    for (const message of cached.diagnostics) if (!roads.isDesigned(roadId) || message !== DENSE_CROPPED) diagnose(g, message);
    return cached.path;
  };

  const linkEnv: LinkEnv = { heightAt, margin: (q, extra) => margin(q, extra, false), roads, obstacle: route.obstacle, streams: route.streams,
    houses: route.houses, houseCost: route.houseCost, memo: linkMemo };
  /** The crossed way's stretch through our earthworks and the strip a new road keeps clear of them
   * (`extra` beyond the toe): where it enters and leaves (way chainages), the sides of our road it lies
   * on just outside (-1 / 1), whether the way ends inside, and its angle to our road (between the line
   * from where it enters to where it leaves and our road there; a way running along our road reads low). */
  const cutOf = (c: CrossingResult, path: readonly Readonly<WayPoint>[], extra: number) => {
    let centre = 0;
    for (let i = 1; i < path.length; i++) if (Math.abs(path[i].d) < Math.abs(path[centre].d)) centre = i;
    if (margin(path[centre], extra) >= 0) return undefined;
    let first = centre, last = centre;
    while (first > 0 && margin(path[first - 1], extra) < 0) first--;
    while (last + 1 < path.length && margin(path[last + 1], extra) < 0) last++;
    const boundary = (inside: number, outside: number) => {
      let a = path[inside].d, b = path[outside].d;
      for (let k = 0; k < 24; k++) { const m = (a + b) / 2; if (margin(along(path, m), extra) < 0) a = m; else b = m; }
      return b;
    };
    const open = first === 0 || last === path.length - 1;
    const d0 = first > 0 ? boundary(first, first - 1) : path[0].d, d1 = last + 1 < path.length ? boundary(last, last + 1) : path[path.length - 1].d;
    const sideAt = (q: XY) => Math.sign(project(q).lateral) || 1;
    const sides: [number, number] = [first > 0 ? sideAt(path[first - 1]) : 0, last + 1 < path.length ? sideAt(path[last + 1]) : 0];
    const a = along(path, d0), b = along(path, d1), p = at(c.s), chord = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = chord > 1e-6 ? acos(Math.min(1, Math.abs(((b.x - a.x) * p.tx + (b.y - a.y) * p.ty) / chord))) * 180 / Math.PI : 90;
    // (how far along our road it enters and leaves from the crossing: what a square line must make up)
    const run = Math.abs(project(a).s - c.s) + Math.abs(project(b).s - c.s);
    return { d0, d1, open, sides, angle, run };
  };
  /** The crossed way laid on a new line that crosses our road square at the crossing's station
   * (research/44): a straight run square across our earthworks, joined on each side to the old way by
   * one smooth bend no sharper than the class's smallest radius, as near our road as that allows; the
   * old stretch in between (under our earthworks, or cut off by the new line) is removed. */
  /** Junctions with other roads along a (shared, immutable) way path between chainages lo and hi, at
   * its chainages (per segment, memoised for the path). */
  const junctionsIn = (path: readonly Readonly<WayPoint>[], lo: number, hi: number): Junction[] => {
    let memo = pathJunctions.get(path);
    if (!memo) pathJunctions.set(path, memo = new Map());
    const out: Junction[] = [];
    for (let k = 1; roads && k < path.length; k++) {
      const a = path[k - 1], b = path[k];
      if (b.d < lo || a.d > hi) continue;
      let list = memo.get(k);
      if (!list) {
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        memo.set(k, list = roads.junctions(a, b).map(j => {
          const t = Math.max(0, Math.min(1, ((j.x - a.x) * (b.x - a.x) + (j.y - a.y) * (b.y - a.y)) / (len * len)));
          return { x: j.x, y: j.y, d: a.d + t * (b.d - a.d), ways: [...new Set(j.connections.map(r => r.way))] };
        }));
      }
      for (const j of list) if (j.d >= lo && j.d <= hi) out.push(j);
    }
    return out;
  };
  const squarePath = (c: CrossingResult, g: CrossingGeometry, path: readonly Readonly<WayPoint>[], cut: NonNullable<ReturnType<typeof cutOf>>) => {
    if (cut.open) return { problem: 'ends' as const };
    if (cut.sides[0] === cut.sides[1]) return { problem: 'same' as const };
    const row = ROAD_CLASSES[c.cls], radius = row.minRadius, C = at(c.s), half = g.width / 2;
    const clear = (q: XY) => margin(q, half, false);
    // The bend(s) from the old way at chainage d (travelling towards our road) into the square run at its
    // end beside our earthworks, no sharper than the class's smallest radius: one smooth cubic curve
    // tangent to both (its tangent lengths a share of the chord), else two circular bends with a straight
    // between (an S, where the old way and the square run meet inside our corridor). Each shape is tried
    // ever further out along the old way before the next: it may rejoin the old way at another road's
    // junction, never beyond it (that road keeps its junction).
    const curveOf = (p: XY, u: XY, q: XY, v: XY, shape: number): XY[] | undefined => {
      const span = Math.hypot(q.x - p.x, q.y - p.y);
      if (shape >= CURVE_SHARES.length) {
        for (const ta of BEND_SHARES) for (const tb of BEND_SHARES) { const line = twoBends(p, u, q, v, ta * span, tb * span, radius); if (line) return line; }
        return undefined;
      }
      const l = CURVE_SHARES[shape] * span, b1 = { x: p.x + u.x * l, y: p.y + u.y * l }, b2 = { x: q.x - v.x * l, y: q.y - v.y * l };
      const curve: XY[] = [];
      let tightest = Infinity;
      for (let t = 0; t <= 1 + 1e-9; t += 1 / 24) {
        const m = 1 - t;
        curve.push({ x: m * m * m * p.x + 3 * m * m * t * b1.x + 3 * m * t * t * b2.x + t * t * t * q.x,
          y: m * m * m * p.y + 3 * m * m * t * b1.y + 3 * m * t * t * b2.y + t * t * t * q.y });
        const dx = 3 * m * m * (b1.x - p.x) + 6 * m * t * (b2.x - b1.x) + 3 * t * t * (q.x - b2.x);
        const dy = 3 * m * m * (b1.y - p.y) + 6 * m * t * (b2.y - b1.y) + 3 * t * t * (q.y - b2.y);
        const ddx = 6 * m * (b2.x - 2 * b1.x + p.x) + 6 * t * (q.x - 2 * b2.x + b1.x), ddy = 6 * m * (b2.y - 2 * b1.y + p.y) + 6 * t * (q.y - 2 * b2.y + b1.y);
        const speed = Math.hypot(dx, dy), bend = Math.abs(dx * ddy - dy * ddx);
        if (bend > 1e-12) tightest = Math.min(tightest, speed * speed * speed / bend);
      }
      return tightest >= radius - 1e-6 ? curve : undefined;
    };
    const leg = (side: number, direction: number): { d: number; points: XY[] } | undefined => {
      const o = (side > 0 ? C.left : C.right) + half + SETBACK;
      const q = { x: C.x - C.ty * o * side, y: C.y + C.tx * o * side }, v = { x: C.ty * side, y: -C.tx * side };
      const start = direction < 0 ? cut.d0 : cut.d1, end = direction < 0 ? path[0].d : path[path.length - 1].d;
      for (let shape = 0; shape <= CURVE_SHARES.length; shape++) for (let k = 0, last = false; k <= SQUARE_SEARCH / STEP && !last; k++) {
        let d = start + direction * k * STEP;
        if (direction * (d - end) > 0) break;
        const crossed = k ? junctionsIn(path, Math.min(d, d - direction * STEP), Math.max(d, d - direction * STEP)) : [];
        if (crossed.length) { d = crossed.reduce((w, j) => direction < 0 ? Math.max(w, j.d) : Math.min(w, j.d), direction * Infinity); last = true; }
        // (u: the old way's direction at p, travelling towards our road)
        const p = along(path, d), p2 = along(path, d - direction), ul = Math.hypot(p2.x - p.x, p2.y - p.y) || 1;
        const points = curveOf(p, { x: (p2.x - p.x) / ul, y: (p2.y - p.y) / ul }, q, v, shape);
        if (!points) continue;
        // (a few probes first: most failing lines cut the corner into our earthworks)
        if ([points.length >> 1, points.length >> 2, (3 * points.length) >> 2].some(i => clear(points[i]) < SETBACK - 0.5)) continue;
        if (points.every((q, i) => i === 0 || i === points.length - 1 || clear(q) >= SETBACK - 0.5)) return { d, points };
      }
      return undefined;
    };
    const a = leg(cut.sides[0], -1), b = leg(cut.sides[1], 1);
    if (!a || !b) return { problem: 'room' as const };
    // Other roads joining the stretch it gives up would be cut off (also under our earthworks: their
    // own rebuilt stretch beside them joins the crossed road's kept line).
    // (one under our earthworks is no loss where every road meeting there crosses ours and has a remedy of
    // its own for its stretch there)
    if (junctionsIn(path, a.d + 1e-6, b.d - 1e-6).some(j => !(margin(j, 0) < 0 && j.ways.every(w => w === c.roadId || crossingWays.has(w)))))
      return { problem: 'junction' as const };
    const legA = a.points, legB = [...b.points].reverse();
    // what the new pieces run across, as for a reroute (link-route.ts): its line, not its ramps
    const problems = new Set<string>();
    let culvertCost = 0;
    for (const part of [legA, [...legB].reverse()]) {
      // (from the old way to the structure's end of the straight run: the box or the ramps take over there)
      const survey = surveyLink(part, g.width, linkEnv);
      for (const p of survey.problems) if (p !== 'footprint') problems.add(p);
      if (survey.houses.length) problems.add('building');
      culvertCost += survey.culverts.reduce((a, w) => a + w.cost, 0);
    }
    if (problems.size) return { problem: [...problems].sort().join(',') };
    // the new way: the old one up to where it enters the corridor, the new line, the old one beyond
    const xy: XY[] = [...path.filter(q => q.d < a.d), ...legA, { x: C.x, y: C.y }, ...legB, ...path.filter(q => q.d > b.d)];
    const out: WayPoint[] = [];
    let d = 0, centre = 0, start = 0, end = 0;
    const before = path.filter(q => q.d < a.d).length;
    xy.forEach((q, i) => {
      if (i) d += Math.hypot(q.x - xy[i - 1].x, q.y - xy[i - 1].y);
      if (i === before) start = d;
      if (i === before + legA.length) centre = d;
      if (i === before + legA.length + legB.length) end = d;
      if (!i || d > out[out.length - 1].d + 1e-6) out.push({ x: q.x, y: q.y, d });
    });
    for (const q of out) q.d -= centre;
    const notes: string[] = [];
    return { path: denseWay(out, message => notes.push(message)), notes, p0: start - centre, p1: end - centre, culvertCost, removed: [a.d, b.d] as [number, number] };
  };
  /** Everything one crossing's own structure (stage 2) reads of our road; nothing else there may. A build kept
   * from one pass to the next would have to key on what it asked here:
   * - `project`, `margin`, `between`, and `cutOf` / `squarePath` through them and `at`: our line, grade height
   *   and footprint edges at the chainages noted in `spatial.reads` while it is on (each query reads the two
   *   stations around its chainage);
   * - `crownWidth`: the same in every pass of an evaluation;
   * - `linkEnv` (the new road of a straightened crossing): `margin` as above; `houses`, the houses still
   *   standing along it, which changes with the pass's demolitions; `obstacle` and `streams`, which read the
   *   map, the player's kept houses and other roads' works only.
   * (`squarePath` also reads the road network and which ways cross us: `crossingWays`.) */
  const ours = { project, margin, between: spatial.between, crownWidth: route.crownWidth, cutOf, squarePath, linkEnv };
  return { cuts, squares, anchorBuilds, anchorMemo, at, project, margin, reads, terrainPoint, diagnose, homesOf,
    rawPaths, rawOf, squaredPaths, survivingSides, anchors, maxLinkWidth, getPath, linkEnv, cutOf,
    squarePath, ours };
}
type CrossingTools = ReturnType<typeof crossingTools>;
/** What a crossing's structure reads of our road (see `ours` in crossingTools). */
type OurRoad = CrossingTools['ours'];
/** The tools of a build that do not read our road: the crossed ways' lines, the ground, this build's memos
 * and what the stages hand on per crossing. */
type WayTools = Pick<CrossingTools, 'maxLinkWidth' | 'anchorBuilds' | 'rawPaths' | 'survivingSides' | 'getPath' | 'diagnose' | 'cuts' | 'squares' | 'squaredPaths' | 'terrainPoint'>;

/** Stage 2: each crossing's own geometry on the crossed way's real line: how the way meets our road (angle,
 * same side), its line laid square where asked or weighed, a bridge over us with its deck and ramps, a box
 * under us (lowered where our embankment is low), the cut way's ends; what a reroute needs of it (the way's
 * raw line, the sides that survive) is left in the tools' maps. */
function crossingStructures(crossings: CrossingResult[], heightAt: (x: number, y: number) => number, sidesOf: Map<string, [boolean, boolean]>, anchorOnly: ReadonlySet<CrossingResult> | undefined, tools: CrossingTools) {
  for (const c of crossings) crossingStructure(c, tools.ours, heightAt, sidesOf, anchorOnly, tools);
}

/** One crossing's own geometry. Our road is read through `ours` only; `tools` are the ones that do not read it. */
function crossingStructure(c: CrossingResult, ours: OurRoad, heightAt: (x: number, y: number) => number, sidesOf: Map<string, [boolean, boolean]>, anchorOnly: ReadonlySet<CrossingResult> | undefined, tools: WayTools) {
  const { maxLinkWidth, anchorBuilds, rawPaths, survivingSides, getPath, diagnose, cuts, squares, squaredPaths, terrainPoint } = tools;
  const { project, margin, cutOf, squarePath, linkEnv } = ours;
  const anchorKey = anchorOnly?.has(c) ? `${c.roadId}:${c.x},${c.y}:${c.cls}:${c.type}:${c.square ? 1 : 0}:${maxLinkWidth(c)}` : undefined;
  const reuse = anchorKey ? anchorBuilds.get(anchorKey) : undefined;
  if (reuse) { c.geometry = reuse.g; rawPaths.set(c, reuse.raw); survivingSides.set(c, reuse.sides); return; }
  const g: CrossingGeometry = c.geometry = { width: ROAD_CLASSES[c.cls].width, schematic: false };
  let path = getPath(c.roadId, c.x, c.y, g);
  if (path.length < 2) {
    diagnose(g, 'Crossed way has no usable polyline');
    if (c.type === 'overbridge') { c.span = 0; c.approachLength = 0; c.cost = 0; }
    return;
  }
  // How the way meets our road: its angle, and whether it comes back out on the side it went in.
  const cutKey = `${c.roadId}:${c.x},${c.y}:${g.width}`;
  // (only where Auto may weigh a box, a bridge over us or a reroute: not under our bridges or tunnels)
  const cut = cuts.has(cutKey) ? cuts.get(cutKey) : c.type === 'bridge' || c.type === 'tunnel' ? undefined : cutOf(c, path, g.width / 2 + SETBACK);
  cuts.set(cutKey, cut);
  if (cut) { g.skew = cut.angle; g.skewRun = cut.run; if (!cut.open) g.sameSide = cut.sides[0] === cut.sides[1]; }
  // Straightened to cross square (Auto's candidate or the player's choice): the structure and its ramps
  // are built on the new line, and the new road beyond them is billed here.
  let keep: { p0: number; p1: number; culvertCost: number } | undefined;
  if (c.square && (c.type === 'overbridge' || c.type === 'underpass')) {
    const squareKey = `${cutKey}:${c.cls}`;
    const squared = (squares.get(squareKey) as ReturnType<typeof squarePath> | undefined) ?? (cut ? squarePath(c, g, path, cut) : { problem: 'room' as const });
    squares.set(squareKey, squared);
    if ('path' in squared && squared.path) {
      path = squared.path; squaredPaths.set(c, path); keep = squared;
      for (const message of squared.notes) diagnose(g, message);
      c.squared = cut!.angle; g.removed = squared.removed;
    } else diagnose(g, `${SQUARE_FAILS}${squared.problem}`);
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
        return;
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
    ours.between(minS - g.width / 2, maxS + g.width / 2, (x, y, grade) => {
      let d = core[0].d, best = Infinity;
      for (const q of core) { const gap = (q.x - x) ** 2 + (q.y - y) ** 2; if (gap < best) { best = gap; d = q.d; } }
      clear.push({ d, z: grade + CROSSING_RULES.underDepth });
    });
    // The deck may slope like the road it carries (its class gradient, research/20): on a valley side
    // a level deck would leave one end high above the ground and its ramp far too long.
    const ground0 = heightAt(along(path, d0).x, along(path, d0).y), ground1 = heightAt(along(path, d1).x, along(path, d1).y);
    let deck = { base: -Infinity, slope: 0 }, deckCost = Infinity;
    // (or as steep as the old road across the cutting: it is not rebuilt gentler than it was)
    const steepest = Math.max(ROAD_CLASSES[c.cls].rampGradient, Math.abs(ground1 - ground0) / Math.max(1, d1 - d0));
    for (let k = -20; k <= 20; k++) {
      const slope = steepest * k / 20;
      let base = -Infinity;
      for (const q of clear) { const v = q.z - slope * q.d; if (v > base) base = v; }
      const cost = Math.abs(base + slope * d0 - ground0) + Math.abs(base + slope * d1 - ground1) + (k === 0 ? 0 : 1e-6);
      if (cost < deckCost) { deckCost = cost; deck = { base, slope }; }
    }
    const deckAt = (d: number) => deck.base + deck.slope * d;
    const edgeZ = (d: number) => isRaised ? deckAt(d) : project(along(path, d)).z;
    const f0 = foot(d0, -1, edgeZ(d0)), f1 = foot(d1, 1, edgeZ(d1));
    // A crossing whose ramps would run on for hundreds of metres is not a sensible bridge over us.
    if (isRaised && Math.max(d0 - f0, f1 - d1) > MAX_RAMP_LENGTH) diagnose(g, RAMP_TOO_LONG);
    // Short terrain tails make the actual joins visible; tails are maintenance, not new approaches.
    const a = Math.max(path[0].d, Math.min(f0, keep?.p0 ?? Infinity) - STEP), b = Math.min(path[path.length - 1].d, Math.max(f1, keep?.p1 ?? -Infinity) + STEP);
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
      c.span = d1 - d0; c.approachLength = ownApproaches(c) ? 0 : d0 - f0 + f1 - d1;
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
      const crown = (ours.crownWidth ?? 0) / 2 + g.width / 2;
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
      const groundAt = (d: number) => { const q = along(path, d); return heightAt(q.x, q.y); };
      // The box ends where our fill's slope comes down to its roof, behind a headwall; from there to the
      // toe the way runs in the open between wing walls holding up the slope beside it (research/19 §4:
      // the head allowance covers headwall, foundations and modest wings; walls as high as the fill
      // beside the open way are billed as retaining walls, the way's own road at its rate).
      const half = (ours.crownWidth ?? 0) / 2, roofTop = box.height + box.roof;
      const slopeAt = (d: number) => {
        const p = project(along(path, d), false), side = p.lateral >= 0 ? 1 : -1, nx = -p.ty * side, ny = p.tx * side;
        return slopeSurfaceAt(p.z, half, o => heightAt(p.x + nx * o, p.y + ny * o), UNKNOWN_GROUND, Math.abs(p.lateral));
      };
      const portals = (floorAt: (d: number) => number) => {
        // (and never short of the carriageway band the box is checked under)
        const covered = (d: number) => Math.abs(project(along(path, d), false).lateral) <= crown || slopeAt(d) - floorAt(d) >= roofTop;
        const mid = path[centre].d;
        const end = (toe: number, inward: number) => {
          if (covered(toe)) return toe;
          let a = toe, b = NaN;
          for (let d = toe + inward; inward > 0 ? d < mid : d > mid; d += inward) { if (covered(d)) { b = d; break; } a = d; }
          if (Number.isNaN(b)) return toe;
          for (let k = 0; k < 10; k++) { const m = (a + b) / 2; if (covered(m)) b = m; else a = m; }
          return b;
        };
        const e0 = end(d0, 1), e1 = end(d1, -1);
        if (!(e1 - e0 > 1)) return { e0: d0, e1: d1, wings: [[], []] as UnderpassWing[][], open: 0 };
        let open = 0;
        const wings = ([[d0, e0], [e1, d1]] as const).map(([from, to]) => {
          const n = Math.ceil((to - from) / 2), out: UnderpassWing[] = [];
          if (to - from < 1e-6) return out;
          for (let k = 0; k <= n; k++) {
            const d = from + (to - from) * k / n, floor = floorAt(d), h = Math.max(0, Math.min(roofTop, slopeAt(d) - floor));
            out.push({ d, z: floor + h, h });
          }
          open += underpassOpenCost(out, rate);
          return out;
        });
        return { e0, e1, wings, open };
      };
      let portal: ReturnType<typeof portals>;
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
          let base = Infinity, depth = 0;
          for (const q of probes) { const v = q.z - slope * q.d; if (v < base) base = v; }
          for (let i = 0; i < inside.length; i++) { const v = ground[i] - base - slope * inside[i].d; if (v > depth) depth = v; }
          for (const q of probes) { const v = q.ground - base - slope * q.d; if (v > depth) depth = v; }
          const mine = rank(depth, foot(d0, -1, base + slope * d0, true), foot(d1, 1, base + slope * d1, true));
          const i = mine.findIndex((v, j) => Math.abs(v - best.rank[j]) > 1e-6);
          if (i >= 0 && mine[i] < best.rank[i]) best = { base, slope, depth, rank: mine };
        }
        const { base, slope, depth } = best, floor = (d: number) => base + slope * d;
        if (depth > LOWERING_RULES.maxDepth + 1e-6) diagnose(g, UNDERPASS_TOO_LOW);
        const f0 = foot(d0, -1, floor(d0)), f1 = foot(d1, 1, floor(d1));
        if (Math.max(d0 - f0, f1 - d1) > MAX_RAMP_LENGTH) diagnose(g, RAMP_TOO_LONG);
        portal = portals(floor);
        const a = Math.max(path[0].d, Math.min(f0, keep?.p0 ?? Infinity) - STEP), b = Math.min(path[path.length - 1].d, Math.max(f1, keep?.p1 ?? -Infinity) + STEP);
        const distances = [...new Set([a, f0, d0, ...path.filter(q => q.d > a && q.d < b).map(q => q.d), d1, f1, b])].sort((p, q) => p - q);
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
        portal = portals(groundAt);
        const a = Math.max(path[0].d, Math.min(d0 - STEP, keep?.p0 ?? Infinity) - STEP), b = Math.min(path[path.length - 1].d, Math.max(d1 + STEP, keep?.p1 ?? -Infinity) + STEP);
        const distances = [...new Set([a, d0, ...path.filter(q => q.d > a && q.d < b).map(q => q.d), d1, b])].sort((p, q) => p - q);
        road = distances.map(d => terrainPoint(along(path, d)));
      }
      const { e0, e1, wings, open } = portal;
      g.underpass = { start: road.findIndex(q => q.d === d0), end: road.findIndex(q => q.d === d1), width: box.width, height: box.height, roof: box.roof, wall: box.wall,
        portals: [e0, e1], wings: wings as [UnderpassWing[], UnderpassWing[]] };
      c.underpassLength = e1 - e0;
      c.cost = (e1 - e0) * box.perM + 2 * box.head + open + (c.approachLength ?? 0) * rate + (c.drainCost ?? 0);
    }
  }
  if (keep && road.length) {
    // the new line beyond what the structure and its ramps already bill (box or deck, ramps)
    const ends = g.approaches ? [road[g.approaches[0].start]?.d, road[g.approaches[1].end]?.d]
      : g.underpass ? [road[g.underpass.start]?.d, road[g.underpass.end]?.d] : [undefined, undefined];
    const lo = ends[0] ?? 0, hi = ends[1] ?? 0, rate = (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000;
    c.realignLength = Math.max(0, keep.p1 - keep.p0 - Math.max(0, Math.min(hi, keep.p1) - Math.max(lo, keep.p0)));
    // (the new road beyond them is built like a reroute, link-route.ts: within its class's gradient, its
    // steepest where the ground leaves no choice, with earthworks up to LINK_MAX_SUPPORT deep, from the old
    // way's ground to where the structure's ramps meet the ground; drawn as built)
    const row = ROAD_CLASSES[c.cls];
    for (const [d0, d1] of [[keep.p0, Math.min(lo, keep.p1)], [Math.max(hi, keep.p0), keep.p1]]) {
      if (!(d1 - d0 > 1)) continue;
      const survey = surveyLink([along(path, d0), ...path.filter(q => q.d > d0 && q.d < d1), along(path, d1)], g.width, linkEnv);
      let plan = profileLink(survey, row.rampGradient, linkEnv);
      if (plan.problems.includes('steep') && row.rampSteepest > row.rampGradient) plan = profileLink(survey, row.rampSteepest, linkEnv);
      // (its earth slopes reaching a building refuse it, as a building on its line does: squarePath)
      const failed = plan.problems.filter(p => p === 'steep' || p === 'railway' || p === 'water' || p === 'building');
      if (plan.houses.length && !failed.includes('building')) failed.push('building');
      if (failed.length) { diagnose(g, `${SQUARE_FAILS}${failed.join(',')}`); continue; }
      for (const q of road) if (q.d! > d0 + 1e-6 && q.d! < d1 - 1e-6) {
        const z = linkHeight(plan.points, q.d! - d0);
        if (Math.abs(z - q.ground) > 0.01) { q.z = z; q.surface = 'ramp'; q.support = z >= q.ground ? 'embankment' : 'retaining'; }
      }
    }
    c.realignCost = c.realignLength * rate + keep.culvertCost;
    c.cost += c.realignCost;
  }
  // (a raised or lowered way's anchors lie on the ground beyond its ramps, on its old line further out)
  // (built only when a reroute starts or ends here)
  const kept = path;
  let made: readonly AnchorSample[] | undefined;
  rawPaths.set(c, (adjusted || lowered) && road.length ? () => made ??= [...kept.filter(q => q.d < road[0].d!), ...road, ...kept.filter(q => q.d > road[road.length - 1].d!)] : () => kept);
  if (['bridge', 'overbridge', 'tunnel', 'junction', 'underpass'].includes(c.type)) g.road = road;
  // A box or a bridge over us that delivers the way straight back under our earthworks (it runs along
  // our slope on one side, not across our road again) leaves that stretch to be walled or moved:
  // Auto prefers a treatment that does not (a reroute takes that stretch with it).
  if (c.type === 'underpass' && road.length && !c.requestedType) {
    const crown = (ours.crownWidth ?? 0) / 2, d0 = road[0].d!, d1 = road[road.length - 1].d!;
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
  if (anchorKey) anchorBuilds.set(anchorKey, { g, raw: rawPaths.get(c)!, sides: survivingSides.get(c)! });
}

/** Stage 3: the new roads. Ground anchors on the crossed ways, then the roads moved beside ours and the
 * reroutes led to another crossing (smoothed, engineered, priced; reused from the pass cache while our
 * footprint along them is unchanged). */
function crossingReroutes(crossings: CrossingResult[], route: CrossingRoute, roads: RoadNet | undefined, smoothed: Map<string, CrossingPoint[]>, routed: Map<string, LinkPlan>, budget: number, persist: CrossingCache | undefined, anchorOnly: ReadonlySet<CrossingResult> | undefined, tools: ReturnType<typeof crossingTools>) {
  const { project, terrainPoint, margin, anchors, rawPaths, rawOf, maxLinkWidth, anchorMemo, at, diagnose, reads,
    linkEnv, getPath, cutOf, homesOf, survivingSides } = tools;
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
    if (!anchors.has(c) && rawPaths.has(c)) {
      // (the same line and width give the same anchors in every build of this call)
      const raw = rawOf(c)!, width = maxLinkWidth(c);
      let byWidth = anchorMemo.get(raw);
      if (!byWidth) anchorMemo.set(raw, byWidth = new Map());
      let found = byWidth.get(width);
      if (!found) byWidth.set(width, found = groundAnchors(raw, width));
      anchors.set(c, found);
    }
    return anchors.get(c);
  };
  const endAnchors = new Map<string, [CrossingPoint | undefined, CrossingPoint | undefined]>();
  /** One new piece of road from anchor a to b beside our earthworks on `side` (-1: right, 1: left of our
   * road), engineered as a designer would (link-route.ts); `shape`: the player's bend points. */
  const buildSide = (c: CrossingResult, g: CrossingGeometry, a: CrossingPoint, b: CrossingPoint, side: number, shape?: readonly XY[]) => {
    const out = { link: [] as CrossingPoint[], culverts: 0, culvertCost: 0, houses: [] as number[], steepest: 0 };
    const sidePoint = (s: number, side: number) => {
      const p = at(s), offset = (side > 0 ? p.left : p.right) + g.width / 2 + SETBACK;
      return terrainPoint({ x: p.x - p.ty * offset * side, y: p.y + p.tx * offset * side });
    };
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
      out.culverts = plan.culverts.length; out.culvertCost = plan.culvertCost; out.houses = plan.houses;
      if (plan.grade > ROAD_CLASSES[c.cls].rampGradient && !plan.problems.includes('steep')) out.steepest = plan.grade;
    }
    out.link = link;
    return out;
  };
  // A way that comes back out of our earthworks on the side it went in needs no crossing: it is moved
  // beside them, one new piece of road from where it enters to where it leaves (no cut ends).
  for (const c of crossings) if (c.moved && (c.type === 'reconnection' || c.type === 'diversion') && !anchorOnly?.has(c)) {
    const g = c.geometry!, path = getPath(c.roadId, c.x, c.y, g);
    const cut = path.length > 1 ? cutOf(c, path, g.width / 2 + SETBACK) : undefined;
    if (!cut || cut.open || cut.sides[0] !== cut.sides[1]) { diagnose(g, MOVE_FAILS); continue; }
    const rate = (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000;
    const a = terrainPoint(along(path, cut.d0)), b = terrainPoint(along(path, cut.d1));
    if (Math.hypot(b.x - a.x, b.y - a.y) * rate >= budget) { diagnose(g, OVER_BUDGET); continue; }
    const built = buildSide(c, g, a, b, cut.sides[0]);
    g.links = cut.sides[0] < 0 ? [built.link, []] : [[], built.link];
    g.removed = [cut.d0, cut.d1]; g.turnarounds = [];
    c.linkLength = crossingPlanLength(built.link);
    const houseCost = built.houses.reduce((sum, j) => sum + (route.houseCost?.(j) ?? 0), 0);
    c.cost = c.linkLength * rate + built.culvertCost + houseCost;
    if (built.culverts) { c.culverts = built.culverts; c.culvertCost = built.culvertCost; } else { delete c.culverts; delete c.culvertCost; }
    if (built.houses.length) { c.houses = built.houses; c.houseCost = houseCost; } else { delete c.houses; delete c.houseCost; delete c.homes; }
    homesOf(c);
    if (built.steepest) c.linkGrade = built.steepest; else delete c.linkGrade;
  }
  for (const c of crossings) if (c.targetS !== undefined && !c.moved && (c.type === 'reconnection' || c.type === 'diversion')) {
    const g = c.geometry!;
    const target = crossings.find(t => t !== c && t.s === c.targetS && t.roadId === c.targetRoadId && !t.issues?.length && !ROAD_CLASSES[t.cls].noAtGrade);
    // (a crossing moved beside our earthworks carries nothing across our road)
    if (target?.moved) diagnose(g, `${REROUTE_FAILS}none`);
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
    // The new piece joins the target's road wherever on its own side it comes nearest (a designer joins
    // a cut track to the next road that crosses, not necessarily right beside our earthworks), on the
    // ground beyond any ramps, clear of our earthworks.
    const beside = finish;
    if (target && start && finish && rawPaths.has(target)) {
      const width = maxLinkWidth(target), joined: [CrossingPoint | undefined, CrossingPoint | undefined] = [finish[0], finish[1]];
      for (const k of [0, 1] as const) {
        const a = start[k], b = finish[k];
        if (!a || !b) continue;
        // (only a markedly shorter line is worth trying: JOIN_SHORTER of the line to the crossing)
        let best = Math.hypot(b.x - a.x, b.y - a.y) * JOIN_SHORTER, side = k ? 1 : -1;
        for (const q of rawOf(target)!) {
          const gap = Math.hypot(q.x - a.x, q.y - a.y);
          if (gap >= best || !isTerrain(q)) continue;
          const p = project(q);
          if (side * p.lateral <= 0 || margin(q, width / 2 + SETBACK) < 0) continue;
          best = gap; joined[k] = 'surface' in q ? q : terrainPoint(q);
        }
      }
      finish = joined;
    }
    const required = survivingSides.get(c) ?? [true, true];
    if (required.some((needed, k) => needed && (!start?.[k] || !finish?.[k])))
      diagnose(g, 'No real ground-level anchor exists for a surviving road branch');
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
      const k = side < 0 ? 0 : 1, a = start?.[k], b = finish?.[k], issuesBefore = g.diagnostics?.length ?? 0;
      if (k === 1 && anchorOnly && (g.diagnostics?.length || spent + straight[1] * linkRate + access >= budget)) { abandon = true; break; }
      if (!required[k] || !a || !b) { links.push([]); continue; }
      let built = buildSide(c, g, a, b, side, c.via?.[k]);
      // (where the shorter line to the target's road cannot be built, the one to its crossing is tried)
      // (nor where it costs more than the one to its crossing: houses bought out, culverts)
      const fallback = beside?.[k];
      const price = (x: typeof built) => crossingPlanLength(x.link) * linkRate + x.culvertCost + x.houses.reduce((sum, j) => sum + (route.houseCost?.(j) ?? 0), 0);
      if (fallback && fallback !== b) {
        const failed = (g.diagnostics?.length ?? 0) > issuesBefore, saved = g.diagnostics?.slice(issuesBefore) ?? [];
        // (only a line that cannot be built, or that buys houses or needs culverts, can lose to it)
        if (failed || (price(built) > crossingPlanLength(built.link) * linkRate + 1 && price(built) > Math.hypot(fallback.x - a.x, fallback.y - a.y) * linkRate)) {
          if (g.diagnostics) { g.diagnostics.length = issuesBefore; if (!issuesBefore) delete g.diagnostics; }
          const other = buildSide(c, g, a, fallback, side, c.via?.[k]);
          const otherFailed = (g.diagnostics?.length ?? 0) > issuesBefore;
          if (!otherFailed && (failed || price(other) < price(built))) built = other;
          else if (!failed || otherFailed) {
            // keep the first line (and only its problems)
            if (g.diagnostics) { g.diagnostics.length = issuesBefore; if (!issuesBefore) delete g.diagnostics; }
            for (const m of saved) diagnose(g, m);
          } else built = other;
        }
      }
      const link = built.link;
      culverts += built.culverts; culvertCost += built.culvertCost;
      for (const h of built.houses) houses.add(h);
      steepest = Math.max(steepest, built.steepest);
      links.push(link);
      spent += crossingPlanLength(link) * linkRate + (k === 0 ? culvertCost : 0);
    }
    if (abandon) { if (!g.diagnostics?.length) diagnose(g, OVER_BUDGET); continue; }
    g.links = links as [CrossingPoint[], CrossingPoint[]];
    g.turnarounds = links.filter(path => path.length > 0).map(path => path[0]);
    c.linkLength = links.reduce((sum, path) => sum + crossingPlanLength(path), 0);
    const houseCost = [...houses].reduce((a, j) => a + (route.houseCost?.(j) ?? 0), 0);
    c.cost = c.linkLength * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000 + (c.cls === 'service' && c.linkLength > 0 ? ACCESS : 0) + culvertCost + houseCost;
    if (culverts) { c.culverts = culverts; c.culvertCost = culvertCost; } else { delete c.culverts; delete c.culvertCost; delete c.houses; delete c.houseCost; delete c.homes; delete c.linkGrade; }
    if (houses.size) { c.houses = [...houses]; c.houseCost = houseCost; } else { delete c.houses; delete c.houseCost; delete c.homes; delete c.linkGrade; }
    homesOf(c);
    if (steepest) c.linkGrade = steepest; else delete c.linkGrade;
  }
}

/** Stage 4: terrain-only spans refined against the ground between their samples, the works on each crossing
 * (regrades, walls) measured, and the diagnostics turned into the crossings' issues (returned). */
function crossingFinish(crossings: CrossingResult[], route: CrossingRoute, heightAt: (x: number, y: number) => number, roads: RoadNet | undefined, anchorOnly: ReadonlySet<CrossingResult> | undefined, tools: ReturnType<typeof crossingTools>) {
  const { terrainPoint, diagnose, project, squaredPaths, getPath, margin } = tools;
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
    const works = crossingWorks(g.road, g.width, squaredPaths.get(c) ?? getPath(c.roadId, c.x, c.y, g), {
      roads, heightAt, ours: (q, pad) => margin(q, pad) <= 0, rampLimit, maxTie: MAX_RAMP_LENGTH, urban: (route.urban?.[c.i] ?? 0) >= 0.5 ? 1 : 0, claimed });
    for (const message of works.problems) diagnose(g, message);
    if (works.ties.length) g.ties = works.ties;
    for (const [i, wall] of works.walls) g.road[i] = { ...g.road[i], wall };
    if (works.cost > 0) { c.worksCost = works.cost; c.cost += works.cost; }
    if (works.tieLength > 0) c.tieLength = works.tieLength;
    if (works.wallLength > 0) c.wallLength = works.wallLength;
  }
  // A designed road of the project raised onto a bridge over us builds its own approaches (its own grade,
  // held at the deck: project-evaluate.ts heldChecks); a class's ramp limits are not this crossing's.
  for (const c of crossings) if (c.designed && c.geometry?.diagnostics) {
    const left = c.geometry.diagnostics.filter(m => m !== RAMP_TOO_LONG && !m.startsWith(RAMP_TOO_HIGH));
    if (left.length) c.geometry.diagnostics = left; else { delete c.geometry.diagnostics; delete c.geometry.clipped; }
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

function buildCrossingGeometryOnce(crossings: CrossingResult[], route: CrossingRoute,
  heightAt: (x: number, y: number) => number, roads: RoadNet | undefined,
  spatial: ReturnType<typeof routeGeometry>, paths: Map<string, CachedPath>, smoothed: Map<string, CrossingPoint[]>, routed: Map<string, LinkPlan>,
  linkMemo: NonNullable<LinkEnv['memo']>,
  sidesOf: Map<string, [boolean, boolean]> = new Map(), budget: number = Infinity, persist?: CrossingCache, anchorOnly?: ReadonlySet<CrossingResult>,
  memo: BuildMemo = buildMemo()): CrossingIssue[] {
  const tools = crossingTools(crossings, route, heightAt, roads, spatial, paths, linkMemo, memo);
  crossingStructures(crossings, heightAt, sidesOf, anchorOnly, tools);
  crossingReroutes(crossings, route, roads, smoothed, routed, budget, persist, anchorOnly, tools);
  return crossingFinish(crossings, route, heightAt, roads, anchorOnly, tools);
}

/** Geometry-aware, bounded Auto feedback. Explicit choices are never changed. Candidate links
 * grow only onto already connected real roads; dependency checks keep the connection graph acyclic.
 * One final rebuild anchors every dependent link to the treatment actually selected, and remeasures
 * its bill. This is a local feasibility/economic pass, not an unrestricted network optimizer. */
export function buildCrossingGeometry(crossings: CrossingResult[], route: CrossingRoute,
  heightAt: (x: number, y: number) => number, roads?: RoadNet, persist?: CrossingCache): CrossingIssue[] {
  if (route.s.length < 2) return [];
  if (persist) persist.rolledBack = false;
  const spatial = routeGeometry(route);
  // Candidate treatments and the final rebuild use the same immutable OSM alignment. Share only
  // its dense XY samples, not mutable terrain/engineered points or treatment-dependent anchors.
  const paths = persist?.paths ?? new Map<string, CachedPath>(), smoothed = new Map<string, CrossingPoint[]>(), sidesOf = new Map<string, [boolean, boolean]>();
  // Engineered reroutes between the same anchors are the same within one call (terrain and route fixed).
  const routed = new Map<string, LinkPlan>(), linkMemo = { free: new Map<number, number>() }, memo = buildMemo(crossings.map(c => c.roadId));
  const buildOnce = (items: CrossingResult[], budget = Infinity, anchorOnly?: ReadonlySet<CrossingResult>) =>
    buildCrossingGeometryOnce(items, route, heightAt, roads, spatial, paths, smoothed, routed, linkMemo, sidesOf, budget, persist, anchorOnly, memo);
  // The player's straightening that cannot be built (the new line, or the box or ramps on it): the way is
  // built on its own line instead where that works, and why it could not be straightened is said (issue
  // 'square'). A request that cannot be met leaves the rest of the design as it was.
  const build = (items: CrossingResult[], budget = Infinity, anchorOnly?: ReadonlySet<CrossingResult>) => {
    const issues = buildOnce(items, budget, anchorOnly);
    const failed = items.filter(c => c.requestedType && c.square === true && c.geometry?.diagnostics?.length);
    if (!failed.length) return issues;
    const tried = new Map(failed.map(c => [c, { messages: [...c.geometry!.diagnostics!], lowered: c.lowered }]));
    for (const c of failed) { delete c.square; delete c.squared; delete c.realignLength; delete c.realignCost; }
    let plain = buildOnce(items, budget, anchorOnly);
    // (one that fails on its own line too is built as asked, with its problems; the others stay on their line)
    const both = failed.filter(c => c.geometry?.diagnostics?.length);
    if (both.length) { for (const c of both) c.square = true; plain = buildOnce(items, budget, anchorOnly); }
    for (const c of failed) c.square = true;
    for (const c of failed) {
      if (both.includes(c)) continue;
      const { messages, lowered } = tried.get(c)!, issue = squareIssue(c, messages, lowered);
      (c.issues ??= []).push(issue); plain = [...plain, issue];
    }
    return plain;
  };
  build(crossings);
  const clone = (c: CrossingResult): CrossingResult => {
    const copy: CrossingResult = { ...c, geometry: undefined, cost: c.cost - (c.worksCost ?? 0),
      issues: c.issues?.filter(v => !built(v)) };
    delete copy.worksCost; delete copy.tieLength; delete copy.wallLength; delete copy.culverts; delete copy.culvertCost; delete copy.houses; delete copy.houseCost; delete copy.homes; delete copy.linkGrade; delete copy.lowered; delete copy.drainage; delete copy.drainCost;
    delete copy.square; delete copy.squared; delete copy.realignLength; delete copy.realignCost; delete copy.moved;
    return copy;
  };
  /** a reroute that buys out a home: Auto's last resort (expropriation only where nothing else will do,
   * research/60) */
  const takesHome = (x: CrossingResult) => !!x.homes;
  // (a way the player asked to straighten that is built on its own line instead still carries traffic)
  const feasible = (c: CrossingResult) => !c.issues?.some(v => v.crossing.code !== 'square') && !c.geometry?.diagnostics?.length;
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
  const FIELDS = ['span', 'approachLength', 'linkLength', 'targetS', 'targetRoadId', 'underpassLength', 'worksCost', 'tieLength', 'wallLength', 'culverts', 'culvertCost', 'houses', 'houseCost', 'homes', 'linkGrade', 'lowered', 'drainage', 'drainCost', 'square', 'squared', 'realignLength', 'realignCost', 'moved'] as const;
  const leadsTo = (x: CrossingResult, c: CrossingResult) => x !== c && (x.type === 'reconnection' || x.type === 'diversion') && !x.moved && x.targetS === c.s && x.targetRoadId === c.roadId;
  // (a way that comes back out of our earthworks on the side it went in carries nothing across our road)
  const carries = (t: CrossingResult) => feasible(t) && t.type !== 'atGrade' && t.type !== 'reconnection' && t.type !== 'diversion' && !ROAD_CLASSES[t.cls].noAtGrade
    && !t.geometry?.sameSide;
  /** The nearest crossing (other than `not`) carrying traffic over or under us that `x` may be led to. */
  const nearestCarrier = (x: CrossingResult, not: readonly CrossingResult[]) => {
    let target: CrossingResult | undefined;
    for (const t of crossings) if (!not.includes(t) && t !== x && carries(t) && !t.moved && (x.cls === 'track' || x.cls === 'service' || (t.cls !== 'track' && t.cls !== 'service'))
      && Math.abs(t.s - x.s) <= CROSSING_RULES.linkHardReach && !dependsOn(t, x) && (!target || Math.abs(t.s - x.s) < Math.abs(target.s - x.s))) target = t;
    return target;
  };
  // Reroutes already built and weighed (a crossing to the treatment of another), not built again.
  const tried = new Set<string>(), attempt = (c: CrossingResult, t: CrossingResult) => `${c.s}:${c.roadId}>${t.s}:${t.roadId}:${t.type}:${t.square ? 1 : 0}`;
  let changed = false;
  // The dearest treatments are reconsidered first: a crossing others are then rerouted to keeps carrying them.
  // (`stale`: its present treatment no longer works, e.g. a reroute whose crossing no longer carries traffic)
  // (when each crossing was last weighed, began to carry traffic, or was led to its present target: the
  // consolidation pass below tries only what those looks could not see)
  let step = 0;
  const lookedAt = new Map<CrossingResult, number>(), carrierSince = new Map<CrossingResult, number>(), ledSince = new Map<CrossingResult, number>();
  const reconsider = (c: CrossingResult, stale = false) => {
    const wasCarrier = carries(c), wasTarget = c.targetS;
    // (a feasible reroute is weighed against structures only, not against other targets)
    lookedAt.set(c, (c.type === 'reconnection' || c.type === 'diversion') && feasible(c) && !stale ? -2 : step++);
    reconsiderOnce(c, stale);
    if (!wasCarrier && carries(c)) carrierSince.set(c, step++);
    if (c.targetS !== wasTarget) ledSince.set(c, step++);
  };
  const reconsiderOnce = (c: CrossingResult, stale: boolean) => {
    // An automatic junction is reconsidered only when its own works cannot be built (crossing-works.ts).
    const worksFail = c.type === 'junction' && !!c.geometry?.diagnostics?.some(m => m === WORKS_COVER_ROAD || m === WORKS_TIE_TOO_LONG || m === WORKS_TIE_SHARED);
    // The player's underpass or bridge over us on a skewed crossing: Auto still decides whether to
    // straighten it (unless the player did), keeping the cheaper buildable one.
    if (c.requestedType && c.square === undefined && c.type === c.requestedType && (c.type === 'underpass' || c.type === 'overbridge')
      && !c.geometry?.sameSide && (c.geometry?.skew ?? 90) < SQUARE_BELOW) {
      const squared = clone(c); squared.square = true;
      build([squared]);
      if (feasible(squared) && (!feasible(c) || squared.cost < c.cost)) {
        for (const key of FIELDS) delete c[key];
        Object.assign(c, squared); changed = true;
      }
      return;
    }
    if (c.requestedType || ROAD_CLASSES[c.cls].noAtGrade || !(worksFail || ['overbridge', 'reconnection', 'diversion', 'underpass'].includes(c.type))) return;
    // A box or bridge over us whose way runs back under our earthworks (geometry.runsBack) is kept only
    // when nothing else can be built: the stretch under our slope would still have to be walled or moved.
    // (nor one whose reroute takes a home: only where nothing else can be built, research/60)
    const ok = (x: CrossingResult) => (!stale || x !== c) && feasible(x) && !x.geometry?.runsBack && !takesHome(x);
    let best = c, fallback: CrossingResult | undefined;
    const originalFeasible = ok(c);
    const consider = (x: CrossingResult) => {
      if (ok(x)) { if (!ok(best) || x.cost < best.cost) best = x; }
      else if (feasible(x) && (!fallback || x.cost < fallback.cost)) fallback = x;
    };
    // (a crossing the player keeps on its line, square: false, is never straightened)
    const g = c.geometry, skewed = c.square !== false && !g?.sameSide && (g?.skew ?? 90) < SQUARE_BELOW;
    // A measured box through our embankment, when the class, the fill and the structure allow it; a
    // skewed one also on a new line square across our road (research/44), where the box or bridge on
    // its old line could cost more than the square one's least price (its structure alone).
    const row = ROAD_CLASSES[c.cls], rate = (c.roadPerKm ?? row.roadPerKm[0]) / 1000, across = route.width[c.i];
    const boxLeast = row.underpass ? (() => { const box = underpassAssembly(row.underpass!, rate); return across * box.perM + 2 * box.head; })() : Infinity;
    const variants = (type: 'underpass' | 'overbridge', least: number) => {
      let plain: CrossingResult | undefined = c.type === type && !c.square ? c : undefined;
      if (!plain && !(c.type === type && c.square)) {
        plain = clone(c); plain.type = type;
        delete plain.targetS; delete plain.targetRoadId; delete plain.linkLength; delete plain.span; delete plain.approachLength; delete plain.underpassLength;
        build([plain]);
        consider(plain);
      }
      // (nor when the cheapest buildable treatment so far already costs less than its least price)
      const squareLeast = least + (g?.skewRun ?? 0) * rate;
      if (skewed && !(c.type === type && c.square) && (!plain || !ok(plain) || plain.cost > squareLeast) && !(ok(best) && best.cost <= squareLeast)) {
        const squared = clone(c); squared.type = type; squared.square = true;
        delete squared.targetS; delete squared.targetRoadId; delete squared.linkLength; delete squared.span; delete squared.approachLength; delete squared.underpassLength;
        build([squared]);
        consider(squared);
      }
    };
    if (route.kind?.[c.i] === KIND.earth && underpassFits(c, 0)) variants('underpass', boxLeast);
    // (a bridge over us also needs its ramps up from the old road: the class gradient's length for its
    // height, both sides; the deck may slope and ramps steepen, hence only part of that estimate)
    const rampsLeast = 2 * Math.max(0, CROSSING_RULES.underDepth + c.h) / row.rampSteepest * rate;
    if (!originalFeasible || c.cost > deckPrice(c, across)) variants('overbridge', deckPrice(c, across) + rampsLeast);
    // A feasible link keeps its place unless cheaper above; a measured box (estimated from the
    // footprint width) still competes with the bounded link shortlist below.
    // A designed road of the project is never cut and rerouted (resolveCrossings): bridge or box only.
    if (c.designed || (c.type !== 'overbridge' && c.type !== 'underpass' && originalFeasible)) {
      if (best !== c) {
        delete c.linkLength; delete c.targetS; delete c.targetRoadId; delete c.underpassLength;
        delete c.worksCost; delete c.tieLength; delete c.wallLength; delete c.culverts; delete c.culvertCost; delete c.houses; delete c.houseCost; delete c.homes; delete c.linkGrade; delete c.lowered; delete c.drainage; delete c.drainCost;
        delete c.square; delete c.squared; delete c.realignLength; delete c.realignCost; delete c.moved;
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
    // (one others are led to may itself be led on only when nothing else here can be built: those others
    // then look for another crossing below)
    const targets = ledTo && ok(best) ? [] : crossings.filter(t => t !== c && carries(t)
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
      const anchor = clone(target); anchor.square = target.square;
      // A resolved diversion's source is a real ground-level road node; its downstream link need
      // not be rebuilt to evaluate a new branch arriving at that source.
      if (anchor.type === 'reconnection' || anchor.type === 'diversion') anchor.type = 'bridge';
      build([anchor, link], ok(best) ? best.cost * (Math.abs(target.s - c.s) > CROSSING_RULES.linkMaxReach ? 0.5 : 1) : Infinity, new Set([anchor]));
      tried.add(attempt(c, target));
      if (feasible(link) && !takesHome(link) && worth(link, target)) { best = link; break; }
      if (takesHome(link)) consider(link); // (kept only where nothing else can be built)
    }
    // (a way that comes back out of our earthworks on the side it went in: moved beside them when
    // nothing else is buildable; otherwise weighed with the roads led to it, below)
    if (g?.sameSide && !c.moved && !ok(best)) {
      const move = clone(c); move.type = c.cls === 'track' ? 'diversion' : 'reconnection'; move.moved = true;
      delete move.targetS; delete move.targetRoadId; delete move.span; delete move.approachLength; delete move.underpassLength;
      build([move]);
      consider(move);
    }
    if (!ok(best) && fallback && (stale || !feasible(c) || fallback.cost < c.cost)) best = fallback;
    if (best !== c) {
      delete c.span; delete c.approachLength; delete c.linkLength; delete c.targetS; delete c.targetRoadId; delete c.underpassLength;
      delete c.worksCost; delete c.tieLength; delete c.wallLength; delete c.culverts; delete c.culvertCost; delete c.houses; delete c.houseCost; delete c.homes; delete c.linkGrade; delete c.lowered; delete c.drainage; delete c.drainCost;
      delete c.square; delete c.squared; delete c.realignLength; delete c.realignCost; delete c.moved;
      Object.assign(c, best); changed = true;
    }
  };
  for (const c of [...crossings].sort((a, b) => b.cost - a.cost || a.s - b.s)) reconsider(c);
  // (one that found no target while another still led to it looks again, after those led to it found
  // another treatment: a crossing that cannot be built carries nothing)
  for (const c of crossings) if (!feasible(c)) {
    for (const x of crossings) if (leadsTo(x, c) && !x.requestedType) reconsider(x, true);
    reconsider(c);
  }
  // A second look once every crossing has its treatment (designers consolidate neighbouring minor roads
  // onto one crossing, research/45): a track's or service road's own structure is joined by a short new
  // road to a neighbour within 750 m that now carries traffic, and a reroute is led to a nearer crossing
  // that now carries traffic, wherever that is cheaper. Dearest structures first, then the reroutes.
  const join = (c: CrossingResult) => {
    if (c.requestedType || c.moved || ROAD_CLASSES[c.cls].noAtGrade || c.geometry?.runsBack) return;
    const reroute = c.type === 'reconnection' || c.type === 'diversion';
    if (!reroute && !((c.type === 'overbridge' || c.type === 'underpass') && (c.cls === 'track' || c.cls === 'service') && feasible(c))) return;
    // (a reroute whose crossing no longer carries traffic over or under us must find another)
    const current = reroute ? crossings.find(t => t.s === c.targetS && t.roadId === c.targetRoadId) : undefined;
    const stranded = reroute && (!current || !carries(current) || !!current.moved);
    if (stranded) { reconsider(c, true); return; }
    if (reroute && !feasible(c)) return;
    // (a structure others are led to takes them along: all of them are joined to the same crossing)
    const along = reroute ? [] : crossings.filter(x => leadsTo(x, c) && !x.requestedType && x.via === undefined);
    if (!reroute && crossings.some(x => leadsTo(x, c) && !along.includes(x))) return;
    // (a reroute is led to another crossing only where that is markedly nearer: JOIN_SHORTER of the way)
    const reach = stranded ? CROSSING_RULES.linkHardReach : reroute ? Math.min(Math.abs((c.targetS ?? Infinity) - c.s) * JOIN_SHORTER, CROSSING_RULES.linkHardReach) : CROSSING_RULES.linkMaxReach;
    let target: CrossingResult | undefined;
    for (const t of crossings) if (t !== c && carries(t) && !t.moved && !along.includes(t) && (c.cls === 'track' || c.cls === 'service' || (t.cls !== 'track' && t.cls !== 'service'))
      && along.every(x => x.cls === 'track' || x.cls === 'service' || (t.cls !== 'track' && t.cls !== 'service'))
      && (carrierSince.get(t) ?? -1) > ((reroute ? ledSince.get(c) ?? -2 : lookedAt.get(c)) ?? -1)
      && Math.abs(t.s - c.s) < reach - 1e-6 && !dependsOn(t, c) && (!target || Math.abs(t.s - c.s) < Math.abs(target.s - c.s))) target = t;
    if (!target || (reroute && !stranded && target.s === c.targetS && target.roadId === c.targetRoadId)) return;
    // (a join already tried between the same two treatments is not built again in a later round)
    // (nor one that cannot cost less: the new roads run at least as far along our road as the crossing
    // is away, less up to 250 m where a skewed way leaves our corridor further along, on each side)
    const sides = (sidesOf.get(`${c.roadId}:${c.x},${c.y}`) ?? [true, true]).filter(Boolean).length;
    if (!stranded && sides * Math.max(0, Math.abs(target.s - c.s) - 250) * Math.min(...ROAD_CLASSES[c.cls].roadPerKm) / 1000 >= c.cost) return;
    if (tried.has(attempt(c, target))) return;
    tried.add(attempt(c, target));
    const before = stranded ? Infinity : c.cost + along.reduce((sum, x) => sum + x.cost, 0);
    const links: CrossingResult[] = [];
    let spent = 0;
    for (const x of [c, ...along]) {
      const link = clone(x); link.type = x.cls === 'track' ? 'diversion' : 'reconnection';
      delete link.span; delete link.approachLength; delete link.underpassLength;
      link.targetS = target.s; link.targetRoadId = target.roadId;
      const anchor = clone(target); anchor.square = target.square;
      if (anchor.type === 'reconnection' || anchor.type === 'diversion') anchor.type = 'bridge';
      build([anchor, link], before - spent, new Set([anchor]));
      if (!feasible(link) || takesHome(link)) return;
      spent += link.cost; links.push(link);
      if (spent >= before) return;
    }
    [c, ...along].forEach((x, k) => { for (const key of FIELDS) delete x[key]; Object.assign(x, links[k]); ledSince.set(x, step++); });
    changed = true;
  };
  // (until nothing changes, at most JOIN_ROUNDS times: a crossing that starts carrying traffic in one
  // round is a nearer target for its neighbours in the next)
  const state = () => crossings.map(c => `${c.type}:${c.targetS}:${c.cost}`).join();
  for (let round = 0, before = state(); round < JOIN_ROUNDS; round++) {
    for (const c of crossings.filter(c => c.type === 'overbridge' || c.type === 'underpass').sort((a, b) => b.cost - a.cost || a.s - b.s)) join(c);
    for (const c of crossings.filter(c => c.type === 'reconnection' || c.type === 'diversion').sort((a, b) => b.cost - a.cost || a.s - b.s)) join(c);
    const after = state();
    if (after === before) break;
    before = after;
  }
  // A way that comes back out of our earthworks on the side it went in needs no crossing of its own: it is
  // moved beside them where that, with the roads led to its crossing led to the nearest other one, is
  // cheaper than keeping the crossing for them (all priced together).
  for (const c of crossings.filter(c => c.geometry?.sameSide && !c.moved && !c.requestedType && !ROAD_CLASSES[c.cls].noAtGrade && c.type !== 'junction')
    .sort((a, b) => b.cost - a.cost || a.s - b.s)) {
    const followers = crossings.filter(x => leadsTo(x, c));
    // (a follower the player shaped keeps its path; one the player only asked to cut and reroute is led on)
    if (followers.some(x => x.via !== undefined || (x.requestedType && x.requestedType !== 'reconnection'))) continue;
    const before = (feasible(c) ? c.cost : Infinity) + followers.reduce((sum, x) => sum + x.cost, 0);
    const move = clone(c); move.type = c.cls === 'track' ? 'diversion' : 'reconnection'; move.moved = true;
    delete move.targetS; delete move.targetRoadId; delete move.span; delete move.approachLength; delete move.underpassLength;
    build([move], before);
    if (!feasible(move) || takesHome(move)) continue;
    const moves: CrossingResult[] = [];
    let total = move.cost;
    for (const x of followers) {
      const t = nearestCarrier(x, [c, ...followers]);
      // (the player's own "Cut and reroute" with nowhere else to go does not keep this crossing for it: its
      // reroute then has no crossing to lead to, and says so)
      if (!t && x.requestedType === 'reconnection') { total += x.cost; moves.push({ ...x }); continue; }
      if (!t) { total = Infinity; break; }
      const link = clone(x); link.targetS = t.s; link.targetRoadId = t.roadId;
      const anchor = clone(t); anchor.square = t.square;
      if (anchor.type === 'reconnection' || anchor.type === 'diversion') anchor.type = 'bridge';
      build([anchor, link], before - total, new Set([anchor]));
      if (!feasible(link) || takesHome(link)) { total = Infinity; break; }
      total += link.cost; moves.push(link);
      if (total >= before) break;
    }
    if (total >= before) continue;
    [c, ...followers].forEach((x, k) => { for (const key of FIELDS) delete x[key]; Object.assign(x, k ? moves[k - 1] : move); });
    changed = true;
  }
  if (!changed) return crossings.flatMap(c => c.issues?.filter(built) ?? []);
  const issues = build(crossings);
  // A new target treatment can move the ground anchor of a dependent link. Do not buy a cheaper
  // local option by breaking a previously feasible connection elsewhere in the network.
  // (the player's own "Cut and reroute" left without a crossing to lead to is not such a connection: it says so)
  if (crossings.some((c,i) => baseline[i].feasible && !feasible(c) && !(c.requestedType === 'reconnection' && c.via === undefined))) {
    crossings.forEach((c,i) => {
      for (const key of ['geometry','issues','span','approachLength','linkLength','targetS','targetRoadId','underpassLength','worksCost','tieLength','wallLength','culverts','culvertCost','houses','houseCost','homes','linkGrade','lowered','drainage','drainCost','square','squared','realignLength','realignCost','moved'] as const) delete c[key];
      Object.assign(c, baseline[i].state);
    });
    if (persist) persist.rolledBack = true;
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
  const built = crossings.filter(c => c.squared !== undefined && c.geometry?.road).map(c => c.geometry!.road!);
  const onBuilt = (q: XY) => built.some(road => road.some((a, i) => {
    const b = road[i + 1];
    if (!b) return false;
    const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy) <= 0.3;
  }));
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
          if (Math.abs(b.z - a.z) > step * limit + 0.01 && !c.designed && !g.diagnostics?.includes(RAMP_TOO_LONG)) report('Undiagnosed excessive approach gradient');
        }
      }
      if ((c.type === 'overbridge' || c.type === 'underpass') && Math.abs(length - (c.approachLength ?? 0)) > 0.01) report('Approach quantity differs from geometry');
    }
    if (g.links) {
      for (const path of g.links) {
        for (const q of path) if (margin(q, g.width / 2) < -0.1) report('Link intrudes into the earthwork footprint');
        // (a real road, or the new line of a crossing straightened to cross square)
        if (roads && path.length) for (const q of [path[0], path[path.length - 1]])
          if (roads.nearestWay(q.x, q.y, 0.3) === undefined && !onBuilt(q)) report('Link endpoint does not meet a real ground road');
      }
      if (Math.abs(g.links.reduce((sum, path) => sum + crossingPlanLength(path), 0) - (c.linkLength ?? 0)) > 0.01) report('Link quantity differs from geometry');
      const price = (c.linkLength ?? 0) * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000
        + (c.cls === 'service' && (c.linkLength ?? 0) > 0 && !c.moved ? ACCESS : 0) + (c.culvertCost ?? 0) + (c.houseCost ?? 0);
      if (Math.abs(price - c.cost) > 0.01) report('Link bill differs from measured quantities');
    }
    // Side-road regrades and walls, remeasured from the drawn geometry (rural or urban rate).
    const works = ([0, 1] as const).map(u => auditWorks(g, heightAt, u));
    if (c.type === 'underpass' && g.underpass && g.road) {
      const { start, end } = g.underpass, size = ROAD_CLASSES[c.cls].underpass;
      if (start < 0 || end <= start || end >= g.road.length || !size) report('Invalid underpass bounds');
      else {
        const box = underpassAssembly(size, (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000);
        const [e0, e1] = g.underpass.portals ?? [g.road[start].d!, g.road[end].d!];
        if (Math.abs(crossingPlanLength(g.road.slice(start, end + 1)) - (g.road[end].d! - g.road[start].d!)) > 0.01 || !(e0 >= g.road[start].d! - 1e-6 && e1 <= g.road[end].d! + 1e-6)
          || Math.abs(e1 - e0 - (c.underpassLength ?? 0)) > 0.01) report('Underpass quantity differs from geometry');
        const open = (g.underpass.wings ?? []).reduce((sum, wing) => sum + underpassOpenCost(wing, (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000), 0);
        const price = (c.underpassLength ?? 0) * box.perM + 2 * box.head + open + (c.approachLength ?? 0) * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000 + (c.drainCost ?? 0) + (c.realignCost ?? 0);
        if (works.every(w => Math.abs(price + w - c.cost) > 0.01)) report('Underpass bill differs from measured quantities');
        // (a straightened way's new pieces beyond the box are built on their own earthworks)
        if (!c.lowered && g.road.some((q, i) => q.surface !== 'terrain' && (c.squared === undefined || (i >= start && i <= end)))) report('Underpass way leaves its terrain level');
        if (c.lowered !== undefined && (!g.approaches || c.lowered > LOWERING_RULES.maxDepth + 1e-6) && !g.diagnostics?.length) report('Lowered underpass way is not engineered');
        if (!g.diagnostics?.length && underpassLowest(g.road, start, end, (route.crownWidth ?? 0) / 2 + g.width / 2, q => project(q), heightAt)
          < box.minHeight - 1e-6) report('Underpass roof does not clear the carriageway');
      }
    }
    // A straightened way: its new line (beyond the structure and its ramps) remeasured from what is drawn.
    if (c.squared !== undefined && g.road && g.removed) {
      if (!(c.realignLength! >= 0) || c.realignLength! > crossingPlanLength(g.road) + 1e-6) report('Straightened line quantity differs from geometry');
    }
    if (c.type === 'overbridge') {
      const price = deckPrice(c, c.span ?? 0) + (c.approachLength ?? 0) * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000 + (c.realignCost ?? 0);
      if (works.every(w => Math.abs(price + w - c.cost) > 0.01)) report('Overbridge bill differs from measured quantities');
    }
    if (c.type === 'junction' && works.every(w => Math.abs(JUNCTION + w - c.cost) > 0.01)) report('Junction bill differs from measured quantities');
  }
  return issues;
}
