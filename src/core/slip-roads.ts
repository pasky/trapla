// Slip roads of an interchange the player builds on a motorway of the project (Build → Slip road). A slip road is
// one-way, from its start to its end: one that starts on the motorway leaves it (an exit), one that ends on it
// joins it (an entry). Where it meets the motorway it meets ONE carriageway, the one on the side it was put on
// (traffic keeps right: the forward direction A → B runs on the right of the motorway's line). There, its gore,
// the motorway gets a speed-change lane: before the gore an exit lane, after it an entry lane, on the hard
// shoulder's place, the carriageway's paving 0.5 m wider (research/90 §4, D35 design + MD VL 3 sheets 400.11–12).
// This module is the geometry, bill and checks of that lane and gore; project-evaluate.ts builds them.
import type { Violation } from './checks';
import { CATEGORIES, type TerrainClass } from './data/categories';
import { D275_SECTION } from './data/motorway';
import type { Result } from './evaluate';
import type { ProjectDesign, RouteDesign, XYZ } from './project';
import { stationIndex } from './range';
import { KIND } from './structures';

const d = D275_SECTION;
/** Through-lanes' outer edge from the motorway's line, m (median half + inner shoulder + two lanes). */
const THROUGH_EDGE = d.median / 2 + d.innerPavedShoulder + d.lanesPerDirection * d.laneWidth;
export const SLIP_ROAD = {
  /** Speed-change lane: 3.50 m with 0.25 m guide strips; the paved shoulder beside it narrows to 0.25 m, so the
   * carriageway is paved 12.00 m wide (D35 design p. 9; VL 3 sheets 400.11–12 "zpevněná krajnice … podél
   * připojovacích a odbočovacích pruhů = 0,25 m"), research/90 §4. */
  laneWidth: 3.5, guideStrip: 0.25,
  /** how much wider one carriageway is paved along the lane, m: (0.5 + 2 × 3.75 + 0.25 + 3.5 + 0.25) − 11.5 */
  widening: (d.innerPavedShoulder + d.lanesPerDirection * d.laneWidth + 0.25 + 3.5 + 0.25) - (d.innerPavedShoulder + d.lanesPerDirection * d.laneWidth + d.outerPavedShoulder),
  /** Exit (deceleration) lane, whole length incl. its 100 m taper, by the slip road's design speed, m: D35 design
   * at D 130, ramp 50 km/h 100 + 134 = 234 m (research/90 §4, medium). PROVISIONAL: the same at 120 km/h and for
   * a 40 km/h slip road (their rows were not found; slower needs longer, so this is a lower bound). */
  exit: { taper: 100, length: { 50: 234, 40: 234 } as Record<number, number> },
  /** Entry (acceleration) lane: 30 + 175 + 90 = 295 m for a 50 km/h slip road at D 130, its 90 m taper at the far
   * end (same source, same PROVISIONAL use). */
  entry: { taper: 90, length: { 50: 295, 40: 295 } as Record<number, number> },
  /** The V 2b dashed line between the through lane and the speed-change lane (VL 3 sheet 400.12: 1.5 / 1.5 / 0.25 m). */
  marking: { width: 0.25, dash: 1.5, gap: 1.5 },
  /** The slip road's line at the gore: the speed-change lane's middle, m from the motorway's line. */
  goreOffset: THROUGH_EDGE + 0.25 + 3.5 / 2,
  /** Earth-built ramps already in the motorway's price: SPK CN 2026 report p. 7, the D road standard includes
   * "větve MÚK budované na zemním tělese … za předpokladu 1 MÚK/7 km trasy" (research/33 §3), per interchange
   * PROVISIONAL the A.4.N standard for one interchange's earth-built ramps in two quadrants, 76,700,900 CZK
   * (report p. 10: lower class I roads; the motorway's own share is not stated). */
  allowance: { perKm: 1 / 7, perInterchange: 76_700_900, code: 'A.4.N' },
  /** Gores closer than this along one motorway make one interchange (its four ramps), m. Game rule. */
  interchangeReach: 1500,
};

export const isSlipRoad = (route: RouteDesign | undefined): boolean =>
  route?.kind === 'road' && route.specification.kind === 'road' && route.specification.crossSection !== 'existing'
  && !!CATEGORIES[route.specification.crossSection].ramp;

/** The carriageway a motorway route is: its corridor and travel direction along the corridor's line (forward: A → B,
 * on the right of the line; reverse: B → A, on the left). Null: not a motorway of the project. */
export function carriagewayOf(design: ProjectDesign, routeId: string): { corridorId: string; direction: 1 | -1; paired: boolean } | null {
  const c = design.corridors.find(q => q.children.forward === routeId || q.children.reverse === routeId);
  if (!c) return null;
  return { corridorId: c.id, direction: c.children.forward === routeId ? 1 : -1, paired: c.mode === 'paired' && !(c.mode === 'paired' && c.stretches?.length) };
}
/** Which carriageway a point beside the motorway's line at station s is on (`line`: the paired body's result). */
export function sideAt(line: Pick<Result, 'n' | 'ds' | 'x' | 'y' | 'tx' | 'ty'>, s: number, p: { x: number; y: number }): 1 | -1 {
  const k = stationIndex(line, s), across = -(p.x - line.x[k]) * line.ty[k] + (p.y - line.y[k]) * line.tx[k];
  return across > 0 ? -1 : 1;
}
/** Unit vector to the right of travel on carriageway `direction` at station index k. */
const rightOf = (line: Pick<Result, 'tx' | 'ty'>, k: number, direction: 1 | -1) => ({ x: direction * line.ty[k], y: -direction * line.tx[k] });
/** The gore: where the slip road's line meets the carriageway, at the motorway's height there. `travel`: the
 * carriageway's direction of travel there (a slip road leaves and joins along it). */
export function gore(line: Pick<Result, 'n' | 'ds' | 's' | 'x' | 'y' | 'tx' | 'ty' | 'grade'>, s: number, direction: 1 | -1): XYZ & { s: number; travel: { x: number; y: number } } {
  const k = stationIndex(line, s), r = rightOf(line, k, direction);
  return { x: line.x[k] + r.x * SLIP_ROAD.goreOffset, y: line.y[k] + r.y * SLIP_ROAD.goreOffset, z: line.grade[k], s: line.s[k],
    travel: { x: direction * line.tx[k], y: direction * line.ty[k] } };
}
/** The bend a new slip road gets so that it leaves (joins) the carriageway along it: `reach` m along the travel
 * from the gore (back against it for an entry), 8 m further out (≈ 3°: a speed-change lane's divergence). */
export function leavingBend(g: { x: number; y: number; travel: { x: number; y: number } }, kind: 'exit' | 'entry', reach: number) {
  const t = kind === 'exit' ? 1 : -1, r = { x: g.travel.y, y: -g.travel.x };
  return { x: g.x + g.travel.x * reach * t + r.x * 8, y: g.y + g.travel.y * reach * t + r.y * 8, r: null };
}

export interface SpeedChangeLane {
  kind: 'exit' | 'entry';
  /** spine stations it covers (s0 < s1), and its whole length, m */
  s0: number; s1: number; length: number;
  /** paved area added to the carriageway (the 0.5 m widening; tapers at half), on ground / on bridges, m² */
  area: { ground: number; bridge: number };
  cost: number;
  /** the dashed line between it and the through lane, and its taper's edge (drawn; either may be empty) */
  lines: XYZ[][];
  violations: Violation[];
}
const issue = (s0: number, s1: number, title: string, fix: string, rule: string, basis: Violation['basis'] = 'game'): Violation =>
  ({ kind: 'crossing', s0, s1, title, fix, rule, basis });

/** The speed-change lane of a slip road whose end `end` meets the carriageway `direction` of the motorway `line`
 * at station sGore, for a slip road of design speed `speed`; its violations are worded for the slip road
 * (stations [s0, s1] of the slip road's own line: where it meets the motorway). */
export function speedChangeLane(line: Result, sGore: number, direction: 1 | -1, kind: 'exit' | 'entry', speed: number,
  terrain: TerrainClass, at: { s0: number; s1: number }): SpeedChangeLane {
  const spec = SLIP_ROAD[kind], length = spec.length[speed] ?? spec.length[50];
  // u: along the travel from the lane's upstream end (an exit: its taper's start; an entry: the gore) to its downstream end
  const upstream = kind === 'exit' ? sGore - direction * length : sGore;
  const s0 = Math.min(upstream, upstream + direction * length), s1 = Math.max(upstream, upstream + direction * length);
  const violations: Violation[] = [];
  const what = kind === 'exit' ? 'exit lane' : 'entry lane', name = kind === 'exit' ? 'An exit lane' : 'An entry lane';
  const short = s0 < 0 ? -s0 : s1 > line.length ? s1 - line.length : 0;
  if (short > 0.5) violations.push(issue(at.s0, at.s1, `Its ${what} runs off the end of the motorway`,
    `Move this end at least ${Math.ceil(short / 10) * 10} m further along the motorway`, `${name} on the motorway is ${length} m long (ČSN 73 6102, as a D35 interchange design uses it)`, 'norm')); // research/90 §4
  // its share of full width: an exit opens over its first `taper` m, an entry closes over its last
  const width = (u: number) => Math.min(1, Math.max(0, (kind === 'exit' ? u : length - u) / spec.taper));
  const area = { ground: 0, bridge: 0 }, lines: XYZ[][] = [[], []];
  const per = CATEGORIES['D27.5'], perM2 = { ground: per.normPerKm[terrain] / 1000 / per.crownWidth, bridge: per.bridgePerKm / 1000 / per.crownWidth };
  let tunnel = false;
  const steps = Math.max(1, Math.ceil(length / line.ds)), du = length / steps;
  for (let q = 0; q <= steps; q++) {
    const u = q * du, s = upstream + direction * u;
    if (s < 0 || s > line.length) continue;
    const k = stationIndex(line, s), w = width(u);
    if (line.kind[k] === KIND.tunnel) tunnel = true;
    // (the paving each sample stands for: half a step at the ends)
    const da = SLIP_ROAD.widening * w * (q === 0 || q === steps ? du / 2 : du);
    if (line.kind[k] === KIND.bridge) area.bridge += da; else area.ground += da;
    const r = rightOf(line, k, direction), z = line.grade[k];
    // the dashed line at the through lanes' edge where the lane is full width; along the taper its outer edge
    if (w >= 1 - 1e-9) lines[0].push({ x: line.x[k] + r.x * (THROUGH_EDGE + 0.125), y: line.y[k] + r.y * (THROUGH_EDGE + 0.125), z });
    else { const off = THROUGH_EDGE + 0.25 + 3.5 * w; lines[1].push({ x: line.x[k] + r.x * off, y: line.y[k] + r.y * off, z }); }
  }
  if (tunnel) violations.push(issue(at.s0, at.s1, `Its ${what} runs into a tunnel`, 'Move this end along the motorway, out of the tunnel',
    'Game rule: a speed-change lane is built in the open (a wider tunnel is not in the game)'));
  const cost = area.ground * perM2.ground + area.bridge * perM2.bridge;
  return { kind, s0, s1, length, area, cost, lines, violations };
}

/** What a slip road builds where it meets the motorway (`end` on carriageway `direction` of the paired body `line`):
 * the speed-change lane (a work of the slip road, drawn and billed), the slip road's own first metres inside the
 * motorway's formation (a credit: not built twice), and where the two bodies' works are one (`zones`: wherever the
 * slip road's works and the motorway's come within `clearance` of each other, the interchange's own earthworks,
 * not land two roads share; `gore`: those of its first metres inside the motorway's formation, where the slip
 * roads of the other carriageway reach too). `shared(q)`: the slip road's cost at its station q that the
 * motorway's body provides where it lies inside it. */
export function slipRoadAtMotorway(ramp: Result, end: 'a' | 'b', line: Result, direction: 1 | -1, speed: number, terrain: TerrainClass,
  shared: (q: number) => number, clearance: number) {
  const i = end === 'a' ? 0 : ramp.n - 1, kind = end === 'a' ? 'exit' as const : 'entry' as const;
  let k = 0, best = Infinity;
  for (let j = 0; j < line.n; j++) { const dd = Math.hypot(line.x[j] - ramp.x[i], line.y[j] - ramp.y[i]); if (dd < best) { best = dd; k = j; } }
  const zone = SLIP_ROAD.exit.taper;
  const at = end === 'a' ? { s0: 0, s1: Math.min(ramp.length, zone) } : { s0: Math.max(0, ramp.length - zone), s1: ramp.length };
  const lane = speedChangeLane(line, line.s[k], direction, kind, speed, terrain, at);
  const violations = [...lane.violations];
  // it leaves (joins) along the traffic: its first straight heads the carriageway's way, not against it
  const g = gore(line, line.s[k], direction), sign = end === 'a' ? 1 : -1;
  const q1 = end === 'a' ? Math.min(ramp.n - 1, i + 2) : Math.max(0, i - 2);
  const hx = sign * (ramp.x[q1] - ramp.x[i]), hy = sign * (ramp.y[q1] - ramp.y[i]);
  if (hx * g.travel.x + hy * g.travel.y < 0) violations.push({ kind: 'crossing', ...at, basis: 'game',
    title: end === 'a' ? 'It leaves the motorway against the traffic' : 'It joins the motorway against the traffic',
    fix: end === 'a' ? 'Turn it to leave the way the traffic goes, or start it on the other side of the motorway'
      : 'Turn it to join the way the traffic goes, or end it on the other side of the motorway',
    rule: 'Game rule: a slip road leaves and joins a carriageway along its traffic, on its right' });
  // the slip road's stations from this end inward, while its line is inside the motorway's formation (credited),
  // and while the two bodies' works come close (the interchange's own zone)
  const formation = CATEGORIES['D27.5'].crownWidth / 2 + SLIP_ROAD.widening;
  let inside = 0, credit = 0;
  const zones: { x: number; y: number; r: number }[] = [], goreZones: typeof zones = [];
  for (let step = 0; step < ramp.n; step++) {
    const q = end === 'a' ? step : ramp.n - 1 - step;
    let kk = 0, dd = Infinity;
    for (let j = 0; j < line.n; j++) { const e = Math.hypot(line.x[j] - ramp.x[q], line.y[j] - ramp.y[q]); if (e < dd) { dd = e; kk = j; } }
    const mine = Math.max(Math.abs(ramp.dayL[q]), Math.abs(ramp.dayR[q]), ramp.cell.width[q] / 2);
    const theirs = Math.max(Math.abs(line.dayL[kk]), Math.abs(line.dayR[kk]), line.cell.width[kk] / 2);
    if (dd - mine - theirs > clearance) continue;
    const zone = { x: ramp.x[q], y: ramp.y[q], r: Math.max(mine, dd) + theirs + clearance };
    zones.push(zone);
    if (inside === step && dd <= formation) { inside = step + 1; credit += shared(q); goreZones.push(zone); }
  }
  const insideM = Math.min(ramp.length, inside * ramp.ds);
  return { kind, lane, violations, zones, goreZones, credit, insideM, gore: g, sGore: line.s[k] };
}
