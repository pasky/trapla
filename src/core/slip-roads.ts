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
import { landPerM2 } from './cost';
import { GRADE_PIN_TOLERANCE } from './grade-pins';
import { LAND, PRICES } from './data/prices';

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
  /** A slip road's end put this close along a road to another slip road's end there goes onto its junction (Build →
   * Slip road), m: within a T's zone (data/urban ENDPOINT_JUNCTIONS 'tie-in'), the two would rebuild one mouth. Game rule. */
  shareJunction: 30,
  /** Two ends this close along the road are one junction (a crossroads), m: the map's 1 m rounding. */
  junctionTolerance: 1.5,
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
    `Move this end at least ${Math.ceil(short / 10) * 10} m further along the motorway`, `${name} on the motorway is ${length} m long (ČSN 73 6102 for a 50 km/h slip road on a 130 km/h motorway, as a D35 interchange design uses it; the game uses it for every slip road)`, 'norm')); // research/90 §4
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
 * the speed-change lane (a work of the slip road, drawn and billed); what the two bodies build once where they
 * meet (a credit: its first metres on the motorway's formation, `shared(q)` its cost there, and where their slopes
 * overlap the earth and land between them, as the two directions of a split motorway count it,
 * project-motorway.ts splitLedger); a slope of one standing on the other's carriageway (a problem); and where the
 * two bodies' works are one (`zones`: wherever its works and the motorway's come within `clearance` of each other,
 * the interchange's own earthworks, not land two roads share; `goreZones`: those of its first metres on the
 * motorway's formation, where the slip roads of the other carriageway reach too). `heightAt`: the ground. */
const STEP_TOLERANCE = GRADE_PIN_TOLERANCE + 0.05;
/** Two cuttings side by side whose tops come within this of each other leave a narrow ridge of ground between them:
 * designers dig it out, the two one cutting with one slope from crown edge to crown edge, m. PROVISIONAL: the
 * screen's clearance between two roads' works (project-ledger.ts INDEPENDENCE_SCREEN), what the game calls too narrow
 * a strip to leave. */
export const RIDGE_REACH = 10;
/** Where the motorway's cutting (crown edge at `wm` from its line, height `zm`, its face to the ground at `dayM`,
 * `zDayM`) and a slip road's beside it (its line `d` from the motorway's, the same measured from its own line) leave
 * a ridge too narrow to keep (their tops within RIDGE_REACH, or their faces meeting): the common slope's middle
 * (across from the motorway's line, its height); null where they are not both cuttings that close. */
export function dugRidge(m: { z: number; zDay: number; day: number; w: number }, r: { z: number; zDay: number; day: number; w: number }, d: number) {
  if (!(m.zDay > m.z && r.zDay > r.z && m.day > m.w && r.day > r.w)) return null;
  const x0 = m.w, x1 = d - r.w;
  if (!(x1 > x0 + 1e-6) || (d - r.day) - m.day >= RIDGE_REACH) return null;
  return { x0, x1, x: (x0 + x1) / 2, z: (m.z + r.z) / 2 };
}
export function slipRoadAtMotorway(ramp: Result, end: 'a' | 'b', line: Result, direction: 1 | -1, speed: number, terrain: TerrainClass,
  shared: (q: number) => number, clearance: number, heightAt: (x: number, y: number) => number) {
  const i = end === 'a' ? 0 : ramp.n - 1, kind = end === 'a' ? 'exit' as const : 'entry' as const;
  let k = 0, best = Infinity;
  for (let j = 0; j < line.n; j++) { const dd = Math.hypot(line.x[j] - ramp.x[i], line.y[j] - ramp.y[i]); if (dd < best) { best = dd; k = j; } }
  const zone = SLIP_ROAD.exit.taper;
  const at = end === 'a' ? { s0: 0, s1: Math.min(ramp.length, zone) } : { s0: Math.max(0, ramp.length - zone), s1: ramp.length };
  const lane = speedChangeLane(line, line.s[k], direction, kind, speed, terrain, at);
  const violations = [...lane.violations];
  // (where it leaves or joins the motorway it is on the ground: as Build refuses a bridge or tunnel there)
  if (line.kind[k] !== KIND.earth) violations.push({ kind: 'crossing', ...at, basis: 'game',
    title: end === 'a' ? 'It leaves the motorway on a bridge or in a tunnel' : 'It joins the motorway on a bridge or in a tunnel',
    fix: 'Move this end along the motorway to where it runs on the ground',
    rule: 'Game rule: a slip road leaves and joins a motorway where it runs on the ground (a wider bridge or tunnel is not built by the game)' });
  // it leaves (joins) along the traffic: its first straight heads the carriageway's way, not against it
  const g = gore(line, line.s[k], direction), sign = end === 'a' ? 1 : -1;
  const q1 = end === 'a' ? Math.min(ramp.n - 1, i + 2) : Math.max(0, i - 2);
  const hx = sign * (ramp.x[q1] - ramp.x[i]), hy = sign * (ramp.y[q1] - ramp.y[i]);
  if (hx * g.travel.x + hy * g.travel.y < 0) violations.push({ kind: 'crossing', ...at, basis: 'game',
    title: end === 'a' ? 'It leaves the motorway against the traffic' : 'It joins the motorway against the traffic',
    fix: end === 'a' ? 'Turn it to leave the way the traffic goes, or start it on the other side of the motorway'
      : 'Turn it to join the way the traffic goes, or end it on the other side of the motorway',
    rule: 'Game rule: a slip road leaves and joins a carriageway along its traffic, on its right' });
  const wm = CATEGORIES['D27.5'].crownWidth / 2, wr = CATEGORIES['V7.25'].crownWidth / 2, formation = wm + SLIP_ROAD.widening;
  // (each m³ at what the slip road pays for its own earth; one with no cut of its own at the motorway's rate)
  const cutOf = (r: Result) => r.quantities.cut > 0 ? (r.cost.earthDetail.excavation + r.cost.earthDetail.surplusHaul + r.cost.earthDetail.unsuitable) / r.quantities.cut : 0;
  const rate = {
    fill: ramp.quantities.fill > 0 ? (ramp.cost.earthDetail.fillPlacing + ramp.cost.earthDetail.borrow) / ramp.quantities.fill : 0,
    cut: cutOf(ramp) || cutOf(line),
    haul: ramp.quantities.cut + ramp.quantities.fill > 0 ? ramp.cost.earthDetail.haul / (ramp.quantities.cut + ramp.quantities.fill) : 0,
  };
  let inside = 0, credit = 0, overlap = 0, dug = 0, dugCost = 0;
  const zones: { x: number; y: number; r: number }[] = [], goreZones: typeof zones = [];
  const clashes: { s0: number; s1: number; need: number }[] = [];
  let across: number | null = null;
  for (let step = 0; step < ramp.n; step++) {
    const q = end === 'a' ? step : ramp.n - 1 - step;
    let kk = 0, dd = Infinity;
    for (let j = 0; j < line.n; j++) { const e = Math.hypot(line.x[j] - ramp.x[q], line.y[j] - ramp.y[q]); if (e < dd) { dd = e; kk = j; } }
    // over to the other side of the motorway's line: it crosses the motorway (a slip road keeps to its carriageway's side)
    const side = -(ramp.x[q] - line.x[kk]) * line.ty[kk] + (ramp.y[q] - line.y[kk]) * line.tx[kk];
    if (across === null && kk > 0 && kk < line.n - 1 && dd < 2 * wm && Math.sign(side) === direction) across = ramp.s[q];
    const mine = Math.max(Math.abs(ramp.dayL[q]), Math.abs(ramp.dayR[q]), ramp.cell.width[q] / 2);
    const theirs = Math.max(Math.abs(line.dayL[kk]), Math.abs(line.dayR[kk]), line.cell.width[kk] / 2);
    if (dd - mine - theirs > clearance) continue;
    const zone = { x: ramp.x[q], y: ramp.y[q], r: Math.max(mine, dd) + theirs + clearance };
    zones.push(zone);
    if (inside === step && dd <= formation) { inside = step + 1; credit += shared(q); goreZones.push(zone); continue; }
    if (ramp.kind[q] !== KIND.earth || line.kind[kk] !== KIND.earth || !(dd > 1e-6)) continue;
    // Across the motorway's line towards the slip road (x from its line, the slip road's line at d): each body's
    // top, its crown then its slope facing the other (as the two directions of a split motorway, splitLedger).
    const nx = (ramp.x[q] - line.x[kk]) / dd, ny = (ramp.y[q] - line.y[kk]) / dd, d = dd;
    const left = -line.ty[kk] * nx + line.tx[kk] * ny > 0, rampLeft = -ramp.ty[q] * -nx + ramp.tx[q] * -ny > 0;
    const dayM = left ? line.dayL[kk] : line.dayR[kk], zDayM = left ? line.zDayL[kk] : line.zDayR[kk], zm = line.grade[kk];
    const dayR = rampLeft ? ramp.dayL[q] : ramp.dayR[q], zDayR = rampLeft ? ramp.zDayL[q] : ramp.zDayR[q], zr = ramp.grade[q];
    const face = (z: number, zDay: number, u: number, w: number, day: number) => u <= w ? z : u <= day ? z + (zDay - z) * (u - w) / Math.max(1e-6, day - w) : NaN;
    const lo = d - dayR, hi = dayM, fillM = zDayM <= zm, fillR = zDayR <= zr;
    // a ridge too narrow to keep between two cuttings: dug out to one slope from crown edge to crown edge (what
    // stands above it, under neither face nor dug by either, is cut too)
    const ridge = dugRidge({ z: zm, zDay: zDayM, day: dayM, w: wm }, { z: zr, zDay: zDayR, day: dayR, w: wr }, d);
    if (ridge) {
      const steps = Math.max(2, Math.ceil((ridge.x1 - ridge.x0) / 0.5)), dx = (ridge.x1 - ridge.x0) / steps;
      let area = 0;
      for (let m = 0; m < steps; m++) {
        const x = ridge.x0 + (m + 0.5) * dx, gz = heightAt(line.x[kk] + nx * x, line.y[kk] + ny * x);
        const a = face(zm, zDayM, x, wm, dayM), b = face(zr, zDayR, d - x, wr, dayR);
        const top = Math.min(gz, Number.isNaN(a) ? gz : a, Number.isNaN(b) ? gz : b), common = zm + (zr - zm) * (x - ridge.x0) / (ridge.x1 - ridge.x0);
        area += Math.max(0, top - common) * dx;
      }
      dug += area * ramp.ds; dugCost += area * ramp.ds * (rate.cut + rate.haul);
    }
    if (!(hi - lo > 1e-6)) continue;
    const steps = Math.max(2, Math.ceil((hi - lo) / 0.5)), dx = (hi - lo) / steps, len = ramp.ds;
    let fill = 0, cut = 0, worst = 0;
    for (let m = 0; m < steps; m++) {
      const x = lo + (m + 0.5) * dx, gz = heightAt(line.x[kk] + nx * x, line.y[kk] + ny * x);
      const a = x >= 0 ? face(zm, zDayM, x, wm, dayM) : zm, b = x <= d ? face(zr, zDayR, d - x, wr, dayR) : zr;
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      if (a > gz && b > gz) fill += (Math.min(a, b) - gz) * dx; else if (a < gz && b < gz) cut += (gz - Math.max(a, b)) * dx;
      // an embankment face standing on the other's carriageway, or a cutting face undermining it (a face buried
      // in the other's embankment, or cut away by the other's cutting, is one body)
      // (within the height a slip road is held at beside the motorway, MERGE_TOLERANCE: one body)
      if (x > wm && x >= d - wr && x <= d + wr && (fillM ? a > zr + STEP_TOLERANCE : a < zr - STEP_TOLERANCE)) worst = Math.max(worst, hi - (d - wr));
      if (x < d - wr && x <= wm && (fillR ? b > zm + STEP_TOLERANCE : b < zm - STEP_TOLERANCE)) worst = Math.max(worst, wm - lo);
    }
    overlap += fill * (rate.fill + rate.haul) * len + cut * (rate.cut + rate.haul) * len
      + (hi - lo) * len * (landPerM2(ramp.cell.urban[q]) + ramp.cell.forest[q] * LAND.forestExtraPerM2 + PRICES.topsoilDepth * PRICES.topsoil);
    if (worst > 0) {
      const last = clashes[clashes.length - 1], s = ramp.s[q];
      if (last && Math.min(Math.abs(s - last.s0), Math.abs(s - last.s1)) <= ramp.ds + 1e-6) { last.s0 = Math.min(last.s0, s); last.s1 = Math.max(last.s1, s); last.need = Math.max(last.need, worst); }
      else clashes.push({ s0: s, s1: s, need: worst });
    }
  }
  if (across !== null) violations.push({ kind: 'crossing', s0: Math.max(0, across - 20), s1: Math.min(ramp.length, across + 20), basis: 'engine',
    title: 'It crosses the motorway', fix: 'Keep it on the side of the carriageway it leaves or joins',
    rule: 'Engine limit: a slip road crossing its own motorway needs a bridge, which the game does not build for it yet.' });
  for (const c of clashes) violations.push({ kind: 'footprint', basis: 'engine', s0: c.s0, s1: c.s1,
    title: 'Its slope and the motorway\'s clash',
    fix: `Move it at least ${Math.ceil(c.need)} m further from the motorway here, or give it the motorway's height`,
    detail: 'Beside the motorway at another height, the slope of one would stand on the other. Walls between them are not built by the game.',
    rule: 'Engine limit: a slip road shares the motorway\'s earthworks only at its height; otherwise each needs room for its own slopes.' });
  const insideM = Math.min(ramp.length, inside * ramp.ds);
  return { kind, lane, violations, zones, goreZones, credit, insideM, overlap: Math.max(0, overlap), dug, dugCost, gore: g, sGore: line.s[k] };
}

/** Where a slip road and its carriageway are one paved area at one level: from the gore while their crowns are
 * within this of each other, m. MODELLING ASSUMPTION (no source found for how far a ramp keeps the motorway's
 * level): a gap a person could stand in; beyond it each has its own slopes (and slipRoadAtMotorway checks them). */
export const MERGE_GAP = 4;
/** Beyond MERGE_GAP, how much the two crowns' heights may differ per metre of gap between them: a low fill's slope
 * (1 : 2.5 up to 3 m high, the flattest fill slope the game builds: data/prices.ts side slopes, research/48 §1), so that neither body's slope
 * stands on the other's carriageway (slipRoadAtMotorway's clash). Held while the gap is under MERGE_REACH, m. */
export const MERGE_SLOPE = 2.5, MERGE_REACH = 30;
/** How closely a slip road is held at the motorway's height where they adjoin, m: a grade pin's tolerance
 * (grade-pins.ts GRADE_PIN_TOLERANCE), what the grade search can hold on its 1 m height grid (a narrower band is
 * missed between its steps). PROVISIONAL: the crossfall that joins the two pavements is not modelled. */
export const MERGE_TOLERANCE = GRADE_PIN_TOLERANCE;
/** The heights a slip road is held at near its gore (its plan line `xy`, [x0, y0, …] from its start; `end`: the
 * end on the motorway `line`): the motorway's height while their crowns are within MERGE_GAP, then within a low
 * slope's fall of it across the gap between them (as designers keep a slip road beside the motorway's body until it
 * has room for its own slopes), until the gap is MERGE_REACH. */
export function mergeBands(xy: readonly number[], end: 'a' | 'b', line: Pick<Result, 'n' | 'x' | 'y' | 'grade'>): { s: number; min: number; max: number }[] {
  const n = xy.length / 2, out: { s: number; min: number; max: number }[] = [];
  if (n < 2) return out;
  const edges = CATEGORIES['D27.5'].crownWidth / 2 + SLIP_ROAD.widening + CATEGORIES['V7.25'].crownWidth / 2, reach = edges + MERGE_REACH;
  // (the samples' own stations: the line is sampled at length / ⌈length / step⌉, not at `step`)
  const along = [0]; for (let p = 1; p < n; p++) along.push(along[p - 1] + Math.hypot(xy[2 * p] - xy[2 * p - 2], xy[2 * p + 1] - xy[2 * p - 1]));
  let k = -1;
  for (let step0 = 0; step0 < n; step0++) {
    const p = end === 'a' ? step0 : n - 1 - step0, x = xy[2 * p], y = xy[2 * p + 1];
    let best = Infinity, kk = 0;
    const j0 = k < 0 ? 0 : Math.max(0, k - 30), j1 = k < 0 ? line.n - 1 : Math.min(line.n - 1, k + 30);
    for (let j = j0; j <= j1; j++) { const e = Math.hypot(line.x[j] - x, line.y[j] - y); if (e < best) { best = e; kk = j; } }
    k = kk;
    if (best > reach) break;
    const off = MERGE_TOLERANCE + Math.max(0, best - edges - MERGE_GAP) / MERGE_SLOPE;
    out.push({ s: along[p], min: line.grade[kk] - off, max: line.grade[kk] + off });
  }
  return out.sort((a, b) => a.s - b.s);
}
