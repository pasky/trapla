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
import type { Terrain } from './terrain';
import { landPerM2 } from './cost';
import { PRICES } from './data/prices';
import { stationIndex } from './range';

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
export interface SightWork { end: 'a' | 'b'; x: number; y: number; dig: SightDig; cost: number; label: string }
const sightWork = (end: 'a' | 'b', x: number, y: number, dig: SightDig, urban: number, what: string): SightWork =>
  ({ end, x, y, dig, cost: sightDigCost(dig, urban), label: `Ground dug away so drivers see along ${what}: ${Math.max(1, Math.round(dig.volume)).toLocaleString('en')} m³` });

/** What a designer checks at each new junction: no at-grade junction on a motorway, class I spacing,
 * the joining road's grade in the junction, and the view along the joined road (its sight field dug clear where only
 * ground beside the road is in the way: `sight`, works of the road). */
export function tieInChecks(ties: readonly TieIn[], r: Result, roads: RoadNet, terrain: Terrain, buildings?: BuildingIndex): { violations: Violation[]; sight: SightWork[] } {
  const out: Violation[] = [], sight: SightWork[] = [];
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
    const field = t.junction.kind === 'roundabout' ? null : sightField(t, r, wayLine(roads, t.way, terrain), terrain, buildings), blocked = field?.blocked;
    if (field?.dig) sight.push(sightWork(t.end, t.x, t.y, field.dig, r.cell.urban[t.end === 'a' ? 0 : r.n - 1], `the ${what}`));
    if (blocked) out.push({ ...issue(s0, s1, `No clear view along the ${what}`, blocked.fix,
      `ČSN 73 6102: a driver waiting at the junction must see ${blocked.legs} m along the ${what} (sight triangle)`), // research/29
      ...(blocked.building !== undefined ? { target: { buildings: [blocked.building] } } : {}) });
  }
  return { violations: out, sight };
}

/** The road being joined, as a line with stations: an existing way (on its ground) or a designed road. */
export interface HostLine {
  length: number; halfWidth: number;
  station(x: number, y: number): number;
  /** point at station d, with the road surface height there */
  point(d: number): { x: number; y: number; z: number } | null;
}
export function wayLine(roads: RoadNet, way: number, terrain: Terrain): HostLine {
  const total = roads.wayPath(way, 0, Infinity).at(-1)?.d ?? 0;
  return { length: total, halfWidth: (ROAD_CLASSES[roads.wayClass(way)]?.width ?? 6.5) / 2,
    station: (x, y) => roads.wayStation(way, x, y),
    point: d => { if (d < 0 || d > total) return null; const run = roads.wayPath(way, Math.max(0, d - 0.5), d), p = run.at(-1);
      return p ? { x: p.x, y: p.y, z: terrain.heightAt(p.x, p.y) } : null; } };
}
export function resultLine(h: Result, halfWidth: number): HostLine {
  return { length: h.length, halfWidth,
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

/** Ground dug off a junction's sight triangles (TIE_IN_RULES.graded): its cells (centre, depth), volume and area. */
export interface SightDig { cells: { x: number; y: number; depth: number }[]; volume: number; area: number }
/** The sight triangle's two legs along the joined road (eye, junction, the seen car `length` m along the road): every
 * sight line from the eye to the road between the junction and that car must be clear. A house in the triangle, or on
 * its far sight line, blocks it; so does the joined road's own surface reaching a sight line (its profile along its
 * line: a crest), or ground that would have to be dug deeper than TIE_IN_RULES.graded. Ground beside the road reaching
 * within the clearance of a sight line is dug down to it (`dig`: billed with the junction, tieInChecks). Measured on the
 * existing ground, on our road's own crown and slopes where they are. */
export function sightField(t: Pick<TieIn, 'end' | 'x' | 'y'>, r: Result, host: HostLine, terrain: Terrain, buildings?: BuildingIndex):
  { blocked: { fix: string; legs: string; building?: number } | null; dig: SightDig | null } {
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
  const eye = { x: t.x - ix * (half + setback), y: t.y - iy * (half + setback) };
  // left of a driver facing into the junction: rotate the inward direction +90°
  const leftSign = Math.sign(hx * -iy + hy * ix) || 1;
  const legs: [number, number][] = [[xb, leftSign], [xc, -leftSign]];
  // the eye is on our road as designed, (half + setback) m before its end (its height between its stations there)
  const back = Math.min(r.length, half + setback), sEye = t.end === 'a' ? back : r.length - back;
  const k0 = Math.max(0, Math.min(r.n - 2, Math.floor(sEye / r.ds))), f = Math.max(0, Math.min(1, (sEye - r.s[k0]) / ((r.s[k0 + 1] - r.s[k0]) || 1)));
  const zEye = r.grade[k0] + (r.grade[k0 + 1] - r.grade[k0]) * f + TIE_IN_RULES.eyeHeight;
  const words = (length: number, sign: number) => `Move this end along the road to where the ground lets a driver see ${length} m ${sign === leftSign ? 'to the left' : 'to the right'}`;
  // what stands at (x, y): our road's crown and slopes near its end where they are, else the ground
  const surface = ownSurface(r, t.end, (x, y) => terrain.heightAt(x, y));
  const dug = new Map<string, { x: number; y: number; depth: number }>(), grid = TIE_IN_RULES.grid;
  for (const [length, sign] of legs) {
    // the seen car is ON the joined road, `length` m along it (it may bend), not on its tangent
    const towards = sign > 0 ? 1 : -1, dist = at + towards * length;
    const far = host.point(dist);
    if (!far) continue; // the joined road ends sooner: nothing comes from there on it
    const target = { x: far.x, y: far.y };
    if (terrain.isOob(target.x, target.y)) continue;
    // every point of the triangle eye – junction – car, against the sight line through it to the road (the chord
    // junction – car standing for the road, its height the road's at the matching station)
    const jx = t.x, jy = t.y, ex = target.x - jx, ey = target.y - jy;
    const x0 = Math.min(eye.x, jx, target.x), x1 = Math.max(eye.x, jx, target.x), y0 = Math.min(eye.y, jy, target.y), y1 = Math.max(eye.y, jy, target.y);
    for (let x = Math.floor(x0 / grid) * grid + grid / 2; x < x1; x += grid) for (let y = Math.floor(y0 / grid) * grid + grid / 2; y < y1; y += grid) {
      if (!inTriangle(x, y, eye, t, target)) continue;
      // where the line eye → (x, y) meets the chord: eye + u·(p − eye) = j + v·e
      const px = x - eye.x, py = y - eye.y, den = px * ey - py * ex;
      if (Math.abs(den) < 1e-9) continue;
      const u = ((jx - eye.x) * ey - (jy - eye.y) * ex) / den, v = ((jx - eye.x) * py - (jy - eye.y) * px) / den;
      if (!(u >= 1 - 1e-9) || v < 0 || v > 1) continue;
      const q = host.point(at + towards * v * length);
      if (!q) continue;
      const ray = zEye + (q.z + TIE_IN_RULES.objectHeight - zEye) / u;
      // on the joined road: its own surface (its height along its line), clear of the line itself (within the ground
      // model's error, TIE_IN_RULES.groundAccuracy); beside it: the
      // ground, kept the clearance under it (dug so where it is not)
      const st = host.station(x, y), on = host.point(st);
      if (on && Math.hypot(on.x - x, on.y - y) <= half) {
        if (on.z > ray + TIE_IN_RULES.groundAccuracy) return { blocked: { fix: words(length, sign), legs: `${xb} / ${xc}` }, dig: null };
        continue;
      }
      const depth = surface(x, y) - (ray - TIE_IN_RULES.clearance);
      if (!(depth > 0)) continue;
      if (depth > TIE_IN_RULES.graded) return { blocked: { fix: words(length, sign), legs: `${xb} / ${xc}` }, dig: null };
      const key = `${Math.round(x / grid)},${Math.round(y / grid)}`, old = dug.get(key);
      if (!old || old.depth < depth) dug.set(key, { x, y, depth });
    }
    // a house (one our road does not demolish or buy) inside the triangle eye – junction – target, or on its sight line
    if (buildings) {
      const dx = target.x - eye.x, dy = target.y - eye.y, steps = Math.ceil(Math.hypot(dx, dy) / 5);
      const cx = (eye.x + t.x + target.x) / 3, cy = (eye.y + t.y + target.y) / 3;
      const gone = new Set([...r.demolished, ...r.boughtOut].map(b => b.j));
      let hit: number | undefined;
      buildings.near(cx, cy, length, j => {
        if (hit !== undefined || gone.has(j)) return;
        const b = buildings.items[j];
        if (inTriangle(b[0], b[1], eye, t, target)) { hit = j; return; }
        for (let k = 0; k <= steps; k++) if (buildings.facadeDistance(j, eye.x + k / steps * dx, eye.y + k / steps * dy) < 0.5) { hit = j; return; }
      });
      if (hit !== undefined) return { blocked: { fix: `Buy out the building in the way, or move this end along the road`, legs: `${xb} / ${xc}`, building: hit }, dig: null };
    }
  }
  if (!dug.size) return { blocked: null, dig: null };
  const cells = [...dug.values()];
  return { blocked: null, dig: { cells, volume: cells.reduce((a, c) => a + c.depth, 0) * grid * grid, area: cells.length * grid * grid } };
}
/** The height of our road's crown and slopes at (x, y) within its last (first) 60 m by end `end`, else `ground`. */
function ownSurface(r: Result, end: 'a' | 'b', ground: (x: number, y: number) => number) {
  const reach = Math.ceil(60 / r.ds), q0 = end === 'a' ? 0 : Math.max(0, r.n - 1 - reach), q1 = end === 'a' ? Math.min(r.n - 1, reach) : r.n - 1;
  return (x: number, y: number) => {
    const g = ground(x, y);
    let k = q0, best = Infinity;
    for (let q = q0; q <= q1; q++) { const d = Math.hypot(r.x[q] - x, r.y[q] - y); if (d < best) { best = d; k = q; } }
    const dx = x - r.x[k], dy = y - r.y[k], along = dx * r.tx[k] + dy * r.ty[k], across = -dx * r.ty[k] + dy * r.tx[k];
    if (Math.abs(along) > r.ds) return g;
    const o = Math.abs(across), w = r.cell.width[k] / 2, left = across > 0, day = left ? r.dayL[k] : r.dayR[k], zDay = left ? r.zDayL[k] : r.zDayR[k];
    if (o <= w) return r.grade[k];
    if (o <= day && day > w) return r.grade[k] + (zDay - r.grade[k]) * (o - w) / (day - w);
    return g;
  };
}
function inTriangle(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const s = (p: { x: number; y: number }, q: { x: number; y: number }) => (q.x - p.x) * (py - p.y) - (q.y - p.y) * (px - p.x);
  const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** A side road's end on another designed road (our road): the junction it builds there, priced as the
 * one onto an existing road of the same class, and the same checks against the designed road. */
export function designedTieIn(side: Result, end: 'a' | 'b', host: { name: string; legalClass: string; crownWidth: number; result: Result;
  /** stations of the other junctions on the designed road (its ends count, as for our road's own junctions) */
  junctions: number[] }, terrain: Terrain, buildings?: BuildingIndex, form?: 'roundabout'): { violations: Violation[]; cost: number; label: string; s: number; ring?: ReturnType<typeof ringWorks>; sight?: SightWork } {
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
  const field = form === 'roundabout' ? null : sightField({ end, x: side.x[i], y: side.y[i] }, side, line, terrain, buildings), blocked = field?.blocked;
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
