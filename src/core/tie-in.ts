// Where a new road's end joins an existing ground road (C1 a): the junction work and its checks.
// The junction itself (priced once, the joined road's rebuilt edge inside its zone) is the kernel's
// endpoint-junction machinery (footprint.ts, data/urban ENDPOINT_JUNCTIONS); this module finds which
// legacy ways meet at the end and checks the things a designer checks at a new junction.
import type { BuildingIndex } from './buildings';
import type { Violation } from './checks';
import { CROSSING_RULES, ENDPOINT_JUNCTIONS, ROAD_CLASSES } from './data/urban';
import type { EndpointJunction, Result } from './evaluate';
import type { EndpointConstraint } from './project';
import type { RoadNet } from './roadnet';
import { BUILTUP_BIT, type Terrain } from './terrain';
import { protectedName } from './data/protected';
import { landPerM2 } from './cost';
import { PRICES } from './data/prices';
import { stationIndex } from './range';
import { KIND } from './structures';

/** A road end this close to a legacy way joins it (legacy coordinates are rounded to 1 m), m. */
const JOIN_TOLERANCE = 1.5;

/** Roads a roundabout may be built on (public roads). */
export const ROUNDABOUT_HOSTS = ['primary', 'secondary', 'tertiary', 'unclassified', 'residential'];
/** A roundabout's ring: 40 m outer diameter, the middle of the 30–50 m compact rural envelope (research/29
 * §4, PROVISIONAL). Its land beyond the joined road, and any house on it, belong to the junction. */
export const ROUNDABOUT_RING = { outerDiameter: 40,
  /** drawn: its ring's carriageway and the paved apron round its island at that diameter, m (TP 135 (2017) tab. 2, a
   * rural single-lane roundabout of D = 40 m: 5.10 m and 1.20 m, the island's unpaved part 27.4 m across; research/29 §4) */
  carriageway: 5.1, apron: 1.2 } as const;
/** A roundabout's ring as drawn: its centre, outer radius and the directions its arms leave it (unit vectors). */
export interface RingMark { x: number; y: number; r: number; arms: { x: number; y: number }[] }
/** The ring of a roundabout at our road `r`'s end `end` on the joined road (`roads`, its ways meeting there) or on a
 * designed road along `host` (unit vector of its line there). */
export function ringMark(r: Pick<Result, 'n' | 'x' | 'y' | 'tx' | 'ty'>, end: 'a' | 'b', joined: { roads: RoadNet } | { host: { x: number; y: number } }): RingMark {
  const i = end === 'a' ? 0 : r.n - 1, x = r.x[i], y = r.y[i];
  const own = end === 'a' ? { x: r.tx[0], y: r.ty[0] } : { x: -r.tx[i], y: -r.ty[i] };
  const others = 'roads' in joined ? joined.roads.connections({ x, y }, JOIN_TOLERANCE).map(c => ({ x: c.dx, y: c.dy }))
    : [joined.host, { x: -joined.host.x, y: -joined.host.y }];
  return { x, y, r: ROUNDABOUT_RING.outerDiameter / 2, arms: [own, ...others] };
}
/** The ring's own works around (x, y): land beyond the joined road's pavement at the local land price,
 * and the houses on it removed (not those a road already removes). */
export function ringWorks(x: number, y: number, joinedWidth: number, urban: number, buildings: BuildingIndex | undefined,
  gone: ReadonlySet<number>): { cost: number; area: number; removed: number[] } {
  const r = ROUNDABOUT_RING.outerDiameter / 2, area = Math.max(0, Math.PI * r * r - joinedWidth * 2 * r);
  let cost = area * landPerM2(urban);
  const removed: number[] = [];
  buildings?.near(x, y, r, j => { if (!gone.has(j) && !removed.includes(j) && buildings.facadeDistance(j, x, y) < r) removed.push(j); });
  for (const j of removed) cost += buildings!.cost[j];
  return { cost, area, removed };
}

export const TIE_IN_RULES = {
  /** Steepest grade of the joining road within the junction (its zone). VL 3 (2010), sheet note to
   * ČSN 73 6102 §6.8.2: "Nejvhodnější podélný sklon křižujících se komunikací je do 3 %. Nedoporučuji se
   * sklony nad 6 %" (research/29 §2). Older, secondary; the norm's exact approach clause is unverified. */
  maxGrade: 0.06,
  /** Sight triangle legs along the joined road for a passenger car, by its speed: XB (to the left) /
   * XC (to the right), m. ČSN 73 6102 tab. 19 as reproduced by ESTAV 2021 (research/29 §3, medium). */
  sight: { 50: [70, 65], 60: [90, 80], 70: [110, 100], 80: [135, 120], 90: [160, 145] } as Record<number, [number, number]>,
  /** Eye point behind the joined road's edge, outside / inside built-up areas, m (research/29 §3,
   * secondary reproduction). */
  eyeSetback: { rural: 3, urban: 2.5 },
  /** Eye and seen-car height above the road, m. Eye 1.0 m is the reproduced passenger-car value;
   * the seen car's 1.0 m is PROVISIONAL (unverified). Ground or a house within 0.25 m of the sight
   * line blocks it (VL 3 obstacle rule, research/29 §3). */
  eyeHeight: 1, objectHeight: 1, clearance: 0.25,
  /** Ground beside the joined road reaching within `clearance` of a sight line is dug down to it (the sight field
   * graded, as designers keep it clear), up to this deep, m; ground deeper in the way is a cutting: the junction is
   * moved. PROVISIONAL game rule (no source for a depth). The joined road's own surface is not dug: where it reaches a
   * sight line (its crest) the junction is moved (the 1.0 m seen car already its lowest part to be seen: no clearance
   * under the line there, game reading of the VL 3 obstacle rule, research/29 §3). */
  graded: 1,
  /** A crest of the joined road reaching a sight line by no more than this is within the error of the ground model the
   * road's heights are read from, m: DMR 5G's stated accuracy in open ground (research/00; the pack's 5 m grid adds its
   * own): the view is taken as clear. */
  groundAccuracy: 0.18,
  /** the sight field is checked on a grid this fine, m */
  grid: 1,
  /** Speed on the joined road when the map does not say: the legal limits outside / inside a built-up
   * area, Act 361/2000 §18 (90 / 50 km/h). Built-up is the game's urban ground class. */
  defaultSpeed: { rural: 90, urban: 50 },
} as const;

export interface TieIn {
  end: 'a' | 'b';
  x: number; y: number;
  /** the joined road's legacy way (the one the end lies on) and its class */
  way: number; cls: string;
  /** every legacy way meeting at the end: their mouths are part of the junction */
  ways: number[];
  junction: EndpointJunction;
  /** an existing junction rebuilt in place: no new junction on the joined road */
  existing: boolean;
}

/** The junctions at this route's ends that join existing ground roads. Ends on motorways/expressways are
 * returned too (with the class), so the caller can refuse them. */
export function tieIns(roads: RoadNet, ends: { a: EndpointConstraint; b: EndpointConstraint }, rebuilt = false,
  forms: { a?: 'roundabout'; b?: 'roundabout' } = {}): TieIn[] {
  const out: TieIn[] = [];
  for (const end of ['a', 'b'] as const) {
    const e = ends[end];
    if (e.anchor.kind !== 'source') continue;
    const p = e.position, connections = roads.connections(p, JOIN_TOLERANCE);
    if (!connections.length) continue;
    const way = roads.nearestWay(p.x, p.y, JOIN_TOLERANCE + 0.5) ?? connections[0].way, cls = roads.wayClass(way);
    const ways = [...new Set(connections.map(c => c.way))].sort((a, b) => a - b);
    const directions = new Set(connections.map(c => `${c.dx.toFixed(3)},${c.dy.toFixed(3)}`));
    const minor = !['primary', 'secondary'].includes(cls);
    out.push({ end, x: p.x, y: p.y, way, cls, ways, existing: directions.size > 2,
      junction: { x: p.x, y: p.y, kind: rebuilt ? 'continuation' : forms[end] === 'roundabout' ? 'roundabout' : minor ? 'tie-in-minor' : 'tie-in', ways } });
  }
  return out;
}

const issue = (s0: number, s1: number, title: string, fix: string, rule: string, basis: Violation['basis'] = 'norm'): Violation =>
  ({ kind: 'crossing', s0, s1, title, fix, rule, basis });

/** The steepest grade of a road between stations s0 and s1. */
function steepest(r: Result, s0: number, s1: number) {
  let steep = 0;
  for (let k = 1; k < r.n; k++) if (r.s[k] > s0 && r.s[k - 1] < s1) steep = Math.max(steep, Math.abs(r.grade[k] - r.grade[k - 1]) / (r.s[k] - r.s[k - 1]));
  return steep;
}
const tooSteep = (s0: number, s1: number, what: string, zone: number, steep: number) => issue(s0, s1, `Too steep where it joins the ${what}`,
  `Flatten the last ${zone} m to at most ${TIE_IN_RULES.maxGrade * 100} % (now ${(steep * 100).toFixed(1)} %)`,
  'VL 3 (2010) to ČSN 73 6102: crossing roads best below 3 %, not over 6 % at a junction'); // research/29

/** What the ground dug off a sight field costs: its excavation hauled to a tip (data/prices.ts, as a cutting's surplus)
 * and its land, kept clear for good (the local land price, as a roundabout's ring), CZK. */
export function sightDigCost(dig: SightDig, urban: number): number {
  return dig.volume * (PRICES.excavation + PRICES.surplusHaulKm * PRICES.haulPerM3Km) + dig.area * landPerM2(urban);
}
/** A junction's sight field dug clear, as a work of the road: where, and its words. */
export interface SightWork { end: 'a' | 'b'; x: number; y: number; dig: SightDig; cost: number; label: string;
  /** the joined road in words and the end's urban share (what it is priced and named by) */ what: string; urban: number }
export const sightWork = (end: 'a' | 'b', x: number, y: number, dig: SightDig, urban: number, what: string): SightWork =>
  ({ end, x, y, dig, cost: sightDigCost(dig, urban), what, urban, label: `Clear the view along ${what}: ${dig.volume < 1 ? '< 1' : Math.round(dig.volume).toLocaleString('en')} m³ dug` });
/** Sight fields of one junction's arms (slip roads sharing it, in the project's order) dug as one: each cell once, as
 * deep as the deepest of them needs, billed by the arm that digs it deepest (the first of equals); an arm left nothing
 * to dig of its own digs nothing. */
export function sharedSightDigs(digs: readonly (SightDig | null)[]): (SightDig | null)[] {
  const best = new Map<string, { k: number; depth: number }>(), key = (c: { x: number; y: number }) => `${c.x},${c.y}`;
  digs.forEach((d, k) => { for (const c of d?.cells ?? []) { const o = best.get(key(c)); if (!o || c.depth > o.depth) best.set(key(c), { k, depth: c.depth }); } });
  return digs.map((d, k) => {
    const cells = (d?.cells ?? []).filter(c => best.get(key(c))!.k === k).map(c => ({ ...c }));
    return cells.length ? sightDigOf(cells) : null;
  });
}
const sightDigOf = (cells: SightDig['cells']): SightDig => ({ cells, volume: cells.reduce((a, c) => a + c.depth, 0) * TIE_IN_RULES.grid ** 2, area: cells.length * TIE_IN_RULES.grid ** 2 });

/** How far from our road's end no noise wall of ours stands at a junction there, m (whole station cells beyond it:
 * evaluate.ts): a roundabout's ring to its outer edge; a T up to the waiting driver's eye (`joinedHalf` + the eye's
 * setback from the joined road's line, further along our road where it meets it askew, as sightField places it), so that
 * no wall stands in the ring, on the joined road or across the sight lines from the eye to it. */
export function junctionWallClear(form: 'roundabout' | 'T', joinedHalf: number, urban: boolean, sine: number): number {
  if (form === 'roundabout') return ROUNDABOUT_RING.outerDiameter / 2;
  return (joinedHalf + (urban ? TIE_IN_RULES.eyeSetback.urban : TIE_IN_RULES.eyeSetback.rural)) / Math.max(0.25, Math.abs(sine));
}

/** What a designer checks at each new junction: no at-grade junction on a motorway, class I spacing,
 * the joining road's grade in the junction, and the view along the joined road (its sight field dug clear where only
 * ground beside the road is in the way: `sight`, works of the road). */
export function tieInChecks(ties: readonly TieIn[], r: Result, crownWidth: number, roads: RoadNet, terrain: Terrain, buildings?: BuildingIndex): { violations: Violation[]; sight: SightWork[];
  /** each sight field checked: its tie, problem and dig */ checks: (SightCheck & { tie: TieIn })[] } {
  const out: Violation[] = [], sight: SightWork[] = [], checks: (SightCheck & { tie: TieIn })[] = [];
  for (const t of ties) {
    // the old road goes on: no new junction to check, unless other roads meet there (the stretch between junctions ends at
    // one: its grade there is a junction's, as anywhere a road joins, owner report: a slid crossing's ramps rising from it)
    if (t.junction.kind === 'continuation' && !t.existing) continue;
    const row = ROAD_CLASSES[t.cls], atStart = t.end === 'a';
    const zone = ENDPOINT_JUNCTIONS[t.junction.kind].zone;
    const s0 = atStart ? 0 : Math.max(0, r.length - zone), s1 = atStart ? Math.min(r.length, zone) : r.length;
    const what = row?.label ?? 'road';
    if (t.junction.kind === 'continuation') { const steep = steepest(r, s0, s1); if (steep > TIE_IN_RULES.maxGrade + 1e-9) out.push(tooSteep(s0, s1, what, zone, steep)); continue; }
    if (row?.noAtGrade) {
      out.push(issue(s0, s1, `A ${what} cannot be joined at the same level`, 'End the road on another road; the game builds slip roads only onto a motorway of its own',
        'ČSN 73 6101: motorways and expressways are crossed only at a different level, with no direct access')); // research/08
      continue;
    }
    // Class I spacing: an existing junction rebuilt in place adds none.
    if (t.cls === 'primary' && !t.existing) {
      // existing junctions on it, and this road's own other new junction on the same road
      const own = ties.filter(o => o !== t && o.way === t.way && !o.existing && o.junction.kind !== 'continuation')
        .map(o => Math.abs(roads.wayStation(t.way, o.x, o.y) - roads.wayStation(t.way, t.x, t.y)));
      const found = nearestJunction(roads, t), near = [found, ...own].reduce<number | null>((a, d) => d === null ? a : a === null ? d : Math.min(a, d), null);
      if (near !== null && near < CROSSING_RULES.junctionSpacing) out.push(issue(s0, s1, 'Too close to another junction',
        `Move this end along the ${what} to a junction there or at least ${CROSSING_RULES.junctionSpacing} m from the next one (now ${Math.round(near)} m)`,
        'ČSN 73 6101:2018: junctions on class I roads at least 1.5 km apart')); // research/12
    }
    // The joining road's grade inside the junction.
    const steep = steepest(r, s0, s1);
    if (steep > TIE_IN_RULES.maxGrade + 1e-9) out.push(tooSteep(s0, s1, what, zone, steep));
    if (t.junction.kind === 'roundabout' && !ROUNDABOUT_HOSTS.includes(t.cls)) out.push(issue(s0, s1, `A roundabout cannot be built on a ${what}`,
      'Set this junction back to Auto', 'Game rule: roundabouts join public roads (class I–III and local roads), not tracks or service roads.', 'game'));
    // A roundabout's entries see to the left around the ring (TP 135), not along a through road: the T
    // junction's sight triangle does not apply to it.
    if (t.junction.kind === 'roundabout') continue;
    const c = sightCheck(t, r, crownWidth, roads, terrain, buildings);
    if (c.sight) sight.push(c.sight);
    if (c.violation) out.push(c.violation);
    checks.push({ tie: t, ...c });
  }
  return { violations: out, sight, checks };
}
/** One junction's view along the mapped road it joins (tieInChecks; again with what else of the project stands there,
 * `screen`, project-evaluate.ts): its problem, or the ground dug to clear it. */
export function sightCheck(t: TieIn, r: Result, crownWidth: number, roads: RoadNet, terrain: Terrain, buildings?: BuildingIndex, screen?: SightScreen): SightCheck {
  const what = ROAD_CLASSES[t.cls]?.label ?? 'road', zone = ENDPOINT_JUNCTIONS[t.junction.kind].zone;
  const s0 = t.end === 'a' ? 0 : Math.max(0, r.length - zone), s1 = t.end === 'a' ? Math.min(r.length, zone) : r.length;
  // (another mapped road in the sight field is not dug: the roads meeting here are the junction's own mouths)
  const others = (x: number, y: number) => { const w = roads.nearestWay(x, y, OTHER_ROAD); return w !== undefined && !t.ways.includes(w); };
  const field = sightField(t, r, crownWidth / 2, wayLine(roads, t.way, terrain), terrain, buildings, others, screen), blocked = field.blocked;
  return { sight: field.dig ? sightWork(t.end, t.x, t.y, field.dig, r.cell.urban[t.end === 'a' ? 0 : r.n - 1], `the ${what}`) : null,
    violation: blocked ? { ...issue(s0, s1, `No clear view along the ${what}`, blocked.fix,
      `ČSN 73 6102: a driver waiting at the junction must see ${blocked.legs} m along the ${what} (sight triangle)`), // research/29
    ...(blocked.building !== undefined ? { target: { buildings: [blocked.building] } } : {}) } : null };
}
export interface SightCheck { violation: Violation | null; sight: SightWork | null }

/** The road being joined, as a line with stations: an existing way (on its ground) or a designed road. */
export interface HostLine {
  length: number; halfWidth: number;
  /** how far its heights may be off, m: a mapped road's are the ground model's (TIE_IN_RULES.groundAccuracy), a designed
   * road's its own (0) */
  accuracy: number;
  station(x: number, y: number): number;
  /** point at station d, with the road surface height there */
  point(d: number): { x: number; y: number; z: number } | null;
  /** a designed road's own body (its crown and slopes as built) */
  result?: Result;
}
export function wayLine(roads: RoadNet, way: number, terrain: Terrain): HostLine {
  const total = roads.wayPath(way, 0, Infinity).at(-1)?.d ?? 0;
  return { length: total, halfWidth: (ROAD_CLASSES[roads.wayClass(way)]?.width ?? 6.5) / 2, accuracy: TIE_IN_RULES.groundAccuracy,
    station: (x, y) => roads.wayStation(way, x, y),
    point: d => { if (d < 0 || d > total) return null; const run = roads.wayPath(way, Math.max(0, d - 0.5), d), p = run.at(-1);
      return p ? { x: p.x, y: p.y, z: terrain.heightAt(p.x, p.y) } : null; } };
}
export function resultLine(h: Result, halfWidth: number): HostLine {
  return { length: h.length, halfWidth, accuracy: 0, result: h,
    station: (x, y) => { let best = Infinity, s = 0; for (let k = 0; k < h.n; k++) { const d = Math.hypot(h.x[k] - x, h.y[k] - y); if (d < best) { best = d; s = h.s[k]; } } return s; },
    point: d => { if (d < 0 || d > h.length) return null; const i = Math.min(h.n - 2, Math.floor(d / h.ds)), t = (d - h.s[i]) / h.ds;
      return { x: h.x[i] + t * (h.x[i + 1] - h.x[i]), y: h.y[i] + t * (h.y[i + 1] - h.y[i]), z: h.grade[i] + t * (h.grade[i + 1] - h.grade[i]) }; } };
}

/** Distance along the joined way to the nearest other junction (null: none found within 1.5 km). */
function nearestJunction(roads: RoadNet, t: TieIn): number | null {
  const at = roads.wayStation(t.way, t.x, t.y), reach = CROSSING_RULES.junctionSpacing;
  const path = roads.wayPath(t.way, Math.max(0, at - reach), at + reach);
  let best: number | null = null;
  for (let k = 1; k < path.length; k++) for (const j of roads.junctions(path[k - 1], path[k])) {
    const d = Math.abs(roads.wayStation(t.way, j.x, j.y) - at);
    if (Math.hypot(j.x - t.x, j.y - t.y) > JOIN_TOLERANCE + 0.5 && (best === null || d < best)) best = d;
  }
  return best;
}

/** What else stands in a junction's sight field (project-evaluate.ts, once every road of the project is built). */
export interface SightScreen {
  /** works of the project not this junction's own at (x, y): their surface's height and whose they are (never dug: in the
   * way where they reach within the clearance of a sight line, as a house); null: none there */
  works?(x: number, y: number): { z: number; name: string } | null;
  /** the junction's other arms (slip roads sharing it): their pavement and slopes as built, dug as ground beside it */
  arms?(x: number, y: number): { z: number; pavement: boolean } | null;
  /** the joined road's pavement where a crossing of the project rebuilds it (its ramps and deck: the seen car on them) */
  host?(x: number, y: number): number | null;
}
/** Ground dug off a junction's sight triangles (TIE_IN_RULES.graded): its cells (centre, depth), volume and area. */
export interface SightDig { cells: { x: number; y: number; depth: number }[]; volume: number; area: number }
/** The sight triangle's two legs along the joined road (eye, junction, the seen car `length` m along the road, or as far
 * as the road goes): every sight line from the eye to the road between the junction and that car must be clear (a fan
 * of lines to the road's own points, so a bend is followed). A house in the triangle, or on its far sight line, blocks
 * it; so does the joined road's own surface reaching a sight line past what its heights may be off (its profile along
 * its line: a crest), our own road's pavement, another road (`others`: not dug), other works of the project (`screen`:
 * not dug, as a house), ground in a protected nature area that takes no works (not dug, research/75), or ground that
 * would have to be dug deeper than TIE_IN_RULES.graded. Ground beside the roads reaching within the clearance of a sight line is dug down to
 * it (`dig`: billed with the junction, tieInChecks). Measured on the existing ground, on our road's own crown (half
 * width `ownHalf`) and slopes where they are. */
export function sightField(t: Pick<TieIn, 'end' | 'x' | 'y'>, r: Result, ownHalf: number, host: HostLine, terrain: Terrain, buildings?: BuildingIndex,
  others?: (x: number, y: number) => boolean, screen?: SightScreen): { blocked: { fix: string; legs: string; building?: number } | null; dig: SightDig | null } {
  const i = t.end === 'a' ? 0 : r.n - 1, urban = r.cell.urban[i] >= 0.5;
  const speed = urban ? TIE_IN_RULES.defaultSpeed.urban : TIE_IN_RULES.defaultSpeed.rural;
  const [xb, xc] = TIE_IN_RULES.sight[speed];
  const half = host.halfWidth, setback = urban ? TIE_IN_RULES.eyeSetback.urban : TIE_IN_RULES.eyeSetback.rural;
  // our road's direction INTO the junction, and the joined road's direction there
  const ix = t.end === 'a' ? -r.tx[0] : r.tx[r.n - 1], iy = t.end === 'a' ? -r.ty[0] : r.ty[r.n - 1];
  const at = host.station(t.x, t.y), p0 = host.point(Math.max(0, at - 1)), p1 = host.point(Math.min(host.length, at + 1));
  if (!p0 || !p1) return { blocked: null, dig: null };
  let hx = p1.x - p0.x, hy = p1.y - p0.y;
  const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
  // left of a driver facing into the junction: rotate the inward direction +90°
  const leftSign = Math.sign(hx * -iy + hy * ix) || 1;
  const legs: [number, number][] = [[xb, leftSign], [xc, -leftSign]];
  // the eye on our road as designed, (half + setback) m out from the joined road's line (further along our road where it
  // meets it askew), at its height there
  const sine = Math.max(0.25, Math.abs(hx * iy - hy * ix)), back = Math.min(r.length, (half + setback) / sine), sEye = t.end === 'a' ? back : r.length - back;
  const k0 = Math.max(0, Math.min(r.n - 2, Math.floor(sEye / r.ds))), f = Math.max(0, Math.min(1, (sEye - r.s[k0]) / ((r.s[k0 + 1] - r.s[k0]) || 1)));
  const lerp = (a: ArrayLike<number>) => a[k0] + (a[k0 + 1] - a[k0]) * f;
  const eye = { x: lerp(r.x), y: lerp(r.y) }, zEye = lerp(r.grade) + TIE_IN_RULES.eyeHeight;
  const side = (sign: number) => sign === leftSign ? 'to the left' : 'to the right';
  const blockedBy = (length: number, sign: number, fix = `Move this end along the road to where the ground lets a driver see ${length} m ${side(sign)}`) =>
    ({ blocked: { fix, legs: `${xb} / ${xc}` }, dig: null });
  // (ground no works may touch: a protected nature area that takes none, research/75, as our road's own works there)
  const areas = terrain.protectedAreas;
  const banned = (x: number, y: number) => {
    if (!areas) return -1;
    const col = Math.floor(x / terrain.cell), row = Math.floor((terrain.height - y) / terrain.cell);
    if (col < 0 || row < 0 || col >= terrain.nx || row >= terrain.ny) return -1;
    return areas.rulingSite(areas.comboAtCell(col, row), false, (terrain.lc[row * terrain.nx + col] & BUILTUP_BIT) !== 0);
  };
  const ends = t.end === 'a' ? [0, Math.min(r.n - 1, Math.ceil(60 / r.ds))] : [Math.max(0, r.n - 1 - Math.ceil(60 / r.ds)), r.n - 1];
  const own = bodySurface(r, ends[0], ends[1], ownHalf);
  // (a designed road joined: its slopes as built beside its pavement, along the two legs)
  const h = host.result, reach = Math.max(xb, xc) + 20;
  const theirs = h ? bodySurface(h, Math.max(0, Math.floor((at - reach) / h.ds)), Math.min(h.n - 1, Math.ceil((at + reach) / h.ds)), half) : null;
  const dug = new Map<string, { x: number; y: number; depth: number }>(), grid = TIE_IN_RULES.grid;
  for (const [length, sign] of legs) {
    // the joined road from the junction to the seen car, ON the road (it may bend), or as far as it goes on the map
    const towards = sign > 0 ? 1 : -1, road: { x: number; y: number; z: number }[] = [];
    const along = Array.from({ length: Math.ceil(length / 2) + 1 }, (_, k) => Math.min(length, 2 * k));
    for (const d of along) {
      const p = host.point(at + towards * d);
      if (!p || terrain.isOob(p.x, p.y)) break;
      const lifted = screen?.host?.(p.x, p.y);
      road.push(lifted === null || lifted === undefined ? p : { ...p, z: lifted });
    }
    if (road.length < 2) continue;
    // the road's surface at (x, y) where it is on its pavement: its height along its line (null: off it); searched about
    // its point `near` (a sight line's point at u of the way to the road's point q is by the road's point u·q)
    const onRoad = (x: number, y: number, near: number) => {
      let best = Infinity, z = 0;
      for (let k = Math.max(1, near - 10); k < Math.min(road.length, near + 11); k++) {
        const a = road[k - 1], b = road[k], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
        const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)), d = Math.hypot(a.x + u * dx - x, a.y + u * dy - y);
        if (d < best) { best = d; z = a.z + u * (b.z - a.z); }
      }
      return best <= half ? z : null;
    };
    for (const [kq, q] of road.entries()) {
      const dx = q.x - eye.x, dy = q.y - eye.y, d = Math.hypot(dx, dy), zq = q.z + TIE_IN_RULES.objectHeight;
      for (let w = grid; w < d; w += grid) {
        const u = w / d, x = eye.x + u * dx, y = eye.y + u * dy, ray = zEye + u * (zq - zEye);
        // on the joined road: its own surface, clear of the line itself (past what its heights may be off)
        const zr = onRoad(x, y, Math.round(u * kq));
        if (zr !== null) { if (zr > ray + host.accuracy) return blockedBy(length, sign); continue; }
        // on our road's pavement: as built; beside the roads: the ground (their slopes where they are), kept the clearance
        // under the line, dug so where it is not (not another road)
        const mine = own(x, y) ?? theirs?.(x, y) ?? screen?.arms?.(x, y);
        if (mine?.pavement) { if (mine.z > ray) return blockedBy(length, sign); continue; }
        // (other works of the project: not dug, as a house; in the way where they reach within the clearance of the line)
        const works = mine ? null : screen?.works?.(x, y);
        if (works) {
          if (works.z > ray - TIE_IN_RULES.clearance) return blockedBy(length, sign, `Move this end along the road clear of ${works.name}'s earthworks, to where a driver sees ${length} m ${side(sign)}`);
          continue;
        }
        const depth = (mine?.z ?? terrain.heightAt(x, y)) - (ray - TIE_IN_RULES.clearance);
        if (!(depth > 0)) continue;
        // (another road is not dug: as the joined road's surface, in the way only where it reaches the line itself)
        if (others?.(x, y)) { if (depth > TIE_IN_RULES.clearance + TIE_IN_RULES.groundAccuracy) return blockedBy(length, sign); continue; }
        const site = banned(x, y);
        if (site >= 0) return blockedBy(length, sign, `Move this end along the road to where a driver sees ${length} m ${side(sign)} without digging in ${protectedName(areas!.sites[site])}`);
        if (depth > TIE_IN_RULES.graded) return blockedBy(length, sign);
        const cx = (Math.floor(x / grid) + 0.5) * grid, cy = (Math.floor(y / grid) + 0.5) * grid, key = `${cx},${cy}`, old = dug.get(key);
        if (!old || old.depth < depth) dug.set(key, { x: cx, y: cy, depth });
      }
    }
    // a house (one our road does not demolish or buy) in the sight field: a corner inside it (the eye and the road to the
    // seen car round it), or a wall across its sight lines to the junction or to the car
    if (buildings) {
      const field = [eye, ...road], target = road[road.length - 1];
      const cx = (eye.x + t.x + target.x) / 3, cy = (eye.y + t.y + target.y) / 3;
      const gone = new Set([...r.demolished, ...r.boughtOut].map(b => b.j));
      let hit: number | undefined;
      buildings.near(cx, cy, length, j => {
        if (hit !== undefined || gone.has(j)) return;
        const c = buildings.corners(j);
        if (c.some(([x, y]) => inPolygon(x, y, field))
          || c.some((p, k) => [road[0], target].some(q => crosses(p, c[(k + 1) % 4], [eye.x, eye.y], [q.x, q.y])))) hit = j;
      });
      if (hit !== undefined) return { blocked: { fix: `Buy out the building in the way, or move this end along the road`, legs: `${xb} / ${xc}`, building: hit }, dig: null };
    }
  }
  if (!dug.size) return { blocked: null, dig: null };
  return { blocked: null, dig: sightDigOf([...dug.values()]) };
}
/** A road's surface at (x, y) between its stations q0 and q1: its crown (`pavement`, half width `half`) and slopes, by its
 * line between its stations; null: off its body there. */
export function bodySurface(r: Pick<Result, 'n' | 'x' | 'y' | 'grade' | 'dayL' | 'dayR' | 'zDayL' | 'zDayR' | 'kind'> & { keptCells?: ArrayLike<number> }, q0: number, q1: number, half: number,
  /** only its earth body (not over a bridge or a tunnel, nor a stretch kept as the old road) */ earth = false) {
  return (x: number, y: number): { z: number; pavement: boolean } | null => {
    let best = Infinity, hit: { k: number; u: number; across: number } | null = null;
    for (let k = q0; k < Math.min(q1, r.n - 1); k++) {
      if (earth && (r.kind[k] !== KIND.earth || r.kind[k + 1] !== KIND.earth || r.keptCells?.[k] || r.keptCells?.[k + 1])) continue;
      const dx = r.x[k + 1] - r.x[k], dy = r.y[k + 1] - r.y[k], l2 = dx * dx + dy * dy || 1;
      const u = ((x - r.x[k]) * dx + (y - r.y[k]) * dy) / l2;
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      const across = (-(x - r.x[k]) * dy + (y - r.y[k]) * dx) / Math.sqrt(l2);
      if (Math.abs(across) < best) { best = Math.abs(across); hit = { k, u, across }; }
    }
    if (!hit) return null;
    const { k, u, across } = hit, at = (a: ArrayLike<number>) => a[k] + (a[k + 1] - a[k]) * u;
    const z = at(r.grade), o = Math.abs(across), left = across > 0, day = at(left ? r.dayL : r.dayR), zDay = at(left ? r.zDayL : r.zDayR);
    if (o <= half) return { z, pavement: true };
    if (o <= day && day > half) return { z: z + (zDay - z) * (o - half) / (day - half), pavement: false };
    return null;
  };
}
function inPolygon(px: number, py: number, poly: readonly { x: number; y: number }[]) {
  let inside = false;
  for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
    const a = poly[k], b = poly[m];
    if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/** Whether segments a–b and c–d cross. */
function crosses(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]) {
  const side = (p: readonly number[], q: readonly number[], r: readonly number[]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
}

/** Ground within this of another mapped road's line is that road (not dug off a sight field), m: a lane's half width
 * and its edge (the class tables' narrowest roads, data/urban ROAD_CLASSES, are about 6 m across). */
const OTHER_ROAD = 3;

/** A side road's end on another designed road (our road): the junction it builds there, priced as the
 * one onto an existing road of the same class, and the same checks against the designed road (`sideCrown`: the side
 * road's crown width, m). */
export function designedTieIn(side: Result, sideCrown: number, end: 'a' | 'b', host: { name: string; legalClass: string; crownWidth: number; result: Result;
  /** stations of the other junctions on the designed road (its ends count, as for our road's own junctions) */
  junctions: number[] }, terrain: Terrain, buildings?: BuildingIndex, form?: 'roundabout', screen?: SightScreen): { violations: Violation[]; cost: number; label: string; s: number; ring?: ReturnType<typeof ringWorks>; sight?: SightWork } {
  const h = host.result, i = end === 'a' ? 0 : side.n - 1, line = resultLine(h, host.crownWidth / 2);
  const s = line.station(side.x[i], side.y[i]), k = stationIndex(h, s);
  const zone = ENDPOINT_JUNCTIONS['tie-in'].zone, atStart = end === 'a';
  const s0 = atStart ? 0 : Math.max(0, side.length - zone), s1 = atStart ? Math.min(side.length, zone) : side.length;
  const out: Violation[] = [], what = host.name;
  if (h.kind[k] !== 0) out.push(issue(s0, s1, `Cannot join ${what} on a bridge or in a tunnel`, `Move this end along ${what} to where it runs on the ground`,
    'Game rule: a junction is built where both roads are on the ground.', 'game'));
  if (host.legalClass === 'I') {
    const near = host.junctions.reduce((a, j) => Math.min(a, Math.abs(j - s)), Infinity);
    if (near < CROSSING_RULES.junctionSpacing) out.push(issue(s0, s1, 'Too close to another junction',
      `Move this end along ${what} to at least ${CROSSING_RULES.junctionSpacing} m from its next junction or end (now ${Math.round(near)} m)`,
      'ČSN 73 6101:2018: junctions on class I roads at least 1.5 km apart, counting both ends of the route')); // research/12
  }
  let steep = 0;
  for (let q = 1; q < side.n; q++) if (side.s[q] > s0 && side.s[q - 1] < s1) steep = Math.max(steep, Math.abs(side.grade[q] - side.grade[q - 1]) / (side.s[q] - side.s[q - 1]));
  if (steep > TIE_IN_RULES.maxGrade + 1e-9) out.push(issue(s0, s1, `Too steep where it joins ${what}`,
    `Flatten the last ${zone} m to at most ${TIE_IN_RULES.maxGrade * 100} % (now ${(steep * 100).toFixed(1)} %)`,
    'VL 3 (2010) to ČSN 73 6102: crossing roads best below 3 %, not over 6 % at a junction')); // research/29
  const field = form === 'roundabout' ? null : sightField({ end, x: side.x[i], y: side.y[i] }, side, sideCrown / 2, line, terrain, buildings, undefined, screen), blocked = field?.blocked;
  const sight = field?.dig ? sightWork(end, side.x[i], side.y[i], field.dig, side.cell.urban[i], what) : undefined;
  if (blocked) out.push({ ...issue(s0, s1, `No clear view along ${what}`, blocked.fix,
    `ČSN 73 6102: a driver waiting at the junction must see ${blocked.legs} m along ${what} (sight triangle)`), // research/29
    ...(blocked.building !== undefined ? { target: { buildings: [blocked.building] } } : {}) });
  const major = host.legalClass === 'I' || host.legalClass === 'II';
  if (form === 'roundabout') {
    const gone = new Set([...side.demolished, ...side.boughtOut, ...h.demolished, ...h.boughtOut].map(b => b.j));
    const ring = ringWorks(side.x[i], side.y[i], host.crownWidth, side.cell.urban[i], buildings, gone);
    return { violations: out, cost: ENDPOINT_JUNCTIONS.roundabout.cost, label: `Roundabout on ${what}`, s, ring };
  }
  return { violations: out, cost: ENDPOINT_JUNCTIONS[major ? 'tie-in' : 'tie-in-minor'].cost, label: `Junction with ${what}`, s, ...(sight ? { sight } : {}) };
}
