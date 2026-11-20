// Slip roads of an interchange the player builds on a motorway of the project (Build → Slip road). A slip road is
// one-way, from its start to its end: one that starts on the motorway leaves it (an exit), one that ends on it
// joins it (an entry). Where it meets the motorway it meets ONE carriageway, the one on the side it was put on
// (traffic keeps right: the forward direction A → B runs on the right of the motorway's line). There, its gore,
// the motorway gets a speed-change lane: before the gore an exit lane, after it an entry lane, on the hard
// shoulder's place, the carriageway's paving 0.5 m wider (research/90 §4, D35 design + MD VL 3 sheets 400.11–12).
// This module is the geometry, bill and checks of that lane and gore; project-evaluate.ts builds them.
import type { Violation } from './checks';
import { CATEGORIES, pairedName, type PairedCategoryId, type TerrainClass } from './data/categories';
import { PAIRED_SECTIONS } from './data/motorway';
import type { Result } from './evaluate';
import type { ProjectDesign, RouteDesign, XYZ } from './project';
import { stationIndex } from './range';
import { KIND } from './structures';
import { landPerM2 } from './cost';
import { GRADE_PIN_TOLERANCE } from './grade-pins';
import { LAND, PRICES } from './data/prices';
import { speedStretches } from './design-speed';
import { motorwayCategory } from './route-section';
import { railOverPrice } from './rail-over';

/** A slip road's speed-change lane beside the carriageway of a paired road (D 27.5, S 21.5): 3.50 m with 0.25 m guide
 * strips, the paved shoulder beside it narrowed to 0.25 m (D35 design p. 9; VL 3 sheets 400.11–12 "zpevněná krajnice
 * na dálnicích a rychlostních silnicích podél připojovacích a odbočovacích pruhů … = 0,25 m", the rychlostní silnice
 * R 21.5 being today's D / S 21.5), research/90 §4b, §4c. */
export const LANE = { width: 3.5, guideStrip: 0.25, shoulder: 0.25 };
/** Where a slip road meets a carriageway of a paired road of category `c`, m from the road's line: the through lanes'
 * outer edge (`through`), their paved shoulder's (`paved`), the formation's (`half`), the slip road's line at the gore
 * (`goreOffset`: the speed-change lane's middle), how much wider one carriageway is paved along the lane
 * (`widening`: D 27.5 (0.5 + 2 × 3.75 + 0.25 + 3.5 + 0.25) − 11.5 = 0.5; S 21.5 (0.5 + 3.25 + 3.5 + 0.25 + 3.5 +
 * 0.25) − 8.75 = 2.5), and the road in the player's words. */
export interface SlipSection { through: number; paved: number; half: number; goreOffset: number; widening: number; word: string }
const slipSection = (c: PairedCategoryId): SlipSection => {
  const d = PAIRED_SECTIONS[c], through = d.median / 2 + d.innerPavedShoulder + (d.innerLane + d.outerLane);
  return { through, paved: through + d.outerPavedShoulder, half: CATEGORIES[c].crownWidth / 2,
    goreOffset: through + LANE.guideStrip + LANE.width / 2,
    widening: (d.innerPavedShoulder + (d.innerLane + d.outerLane) + LANE.guideStrip + LANE.width + LANE.shoulder)
      - (d.innerPavedShoulder + (d.innerLane + d.outerLane) + d.outerPavedShoulder),
    word: pairedName(c).toLowerCase() };
};
export const SLIP_SECTIONS: Record<PairedCategoryId, SlipSection> = { 'D27.5': slipSection('D27.5'), 'S21.5': slipSection('S21.5') };

/** The lengths of a speed-change lane (exit: Lv taper + Ld braking; entry: Lod + Lm + Lz, its Lz taper at the far end),
 * by the paired road's design speed: the row of the slowest tabulated speed at or above it, m (research/90 §4, §4c).
 * - 120 and up: the D35 design at D 130 for a 50 km/h slip road (exit 100 + 134 = 234 m, its own grade; entry 30 + 175
 *   + 90 = 295 m, ČSN 73 6102's 120 column); PROVISIONAL the same at 120 km/h and for a 40 km/h slip road.
 * - 110, 100, 90: Lv and the entry from ČSN 73 6102's tables as the ČVUT K612 course reproduces them (Lv for a 3.50 m
 *   lane 70 / 80 / 100 m at 90 / 100 / 120; entry 230 / 255 / 295 m at 90 / 100 / 120; no 110 column: the 120 one, the
 *   longer), Ld = ((0.75 vn)² − vc²) / (26 · (d + s / 10)) with d = 1.7 m/s² on the level (s = 0; the grade term
 *   not applied), vc the slip road's design speed, rounded up to the metre. */
const braking = (vn: number, vc: number) => Math.ceil(((0.75 * vn) ** 2 - vc ** 2) / (26 * 1.7));
const laneRow = (speed: number, lv: number, entry: { length: number; taper: number }) =>
  ({ speed, exit: { taper: lv, length: { 50: lv + braking(speed, 50), 40: lv + braking(speed, 40) } as Record<number, number> }, entry: { taper: entry.taper, length: { 50: entry.length, 40: entry.length } as Record<number, number> } });
export const LANE_LENGTHS = [
  laneRow(90, 70, { length: 230, taper: 70 }),
  laneRow(100, 80, { length: 255, taper: 80 }),
  laneRow(110, 100, { length: 295, taper: 90 }),
  { speed: 120, exit: { taper: 100, length: { 50: 234, 40: 234 } as Record<number, number> }, entry: { taper: 90, length: { 50: 295, 40: 295 } as Record<number, number> } },
];
/** The lane lengths' row for a paired road of design speed `speed`. */
export const laneLengths = (speed: number) => LANE_LENGTHS.find(r => r.speed >= speed) ?? LANE_LENGTHS[LANE_LENGTHS.length - 1];

export const SLIP_ROAD = {
  /** The V 2b dashed line between the through lane and the speed-change lane (VL 3 sheet 400.12: 1.5 / 1.5 / 0.25 m). */
  marking: { width: 0.25, dash: 1.5, gap: 1.5 },
  /** The stretch of a slip road by its end a problem there is marked on, m (display; the D 130 exit lane's taper). */
  endZone: 100,
  /** Earth-built ramps already in a divided road's price: SPK CN 2026 report p. 7, the standard of a divided road
   * "od kategorie S 20,75 výše" (D 27.5; D 21.5, the row S 21.5 is priced on) includes "větve MÚK budované na zemním
   * tělese … za předpokladu 1 MÚK/7 km trasy" (research/33 §3, research/90 §7b), per interchange PROVISIONAL the A.4.N
   * standard for one interchange's earth-built ramps in two quadrants, 76,700,900 CZK (report p. 10: lower class I
   * roads; the divided road's own share is not stated). */
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
/** The paired road a slip road meets: its category (its cross-section, price and word) and design speed (its lanes'
 * lengths): the road's own, and where its bends are slower, theirs (`stretches`, design-speed.ts speedStretches). */
export interface SlipHost { category: PairedCategoryId; speed: number; stretches?: readonly { s0: number; s1: number; speed: number }[] }
/** The design speed of the paired road at its station s. */
export const hostSpeedAt = (host: SlipHost, s: number) => host.stretches?.find(x => s >= x.s0 && s <= x.s1)?.speed ?? host.speed;
/** The paired road (a motorway or a four-lane road of the project) `routeId` is a direction of, as a slip road meets it;
 * `line`: its evaluated body (its bends' speeds). Null: not a paired road of the project. */
export function slipHost(design: ProjectDesign, routeId: string, line?: Pick<Result, 'curves' | 'length'>): SlipHost | null {
  const r = design.routes.find(q => q.id === routeId);
  if (r?.kind !== 'motorway') return null;
  const category = motorwayCategory(r), speed = r.specification.designSpeed;
  const c = design.corridors.find(q => q.children.forward === routeId || q.children.reverse === routeId);
  const pis = c?.mode === 'paired' && c.spine.kind === 'pi' ? c.spine.pis : undefined;
  return { category, speed, ...(line && pis ? { stretches: speedStretches(line, pis, speed, category) } : {}) };
}
/** The gore: where the slip road's line meets the carriageway of a paired road of category `c`, at its height there.
 * `travel`: the carriageway's direction of travel there (a slip road leaves and joins along it). */
export function gore(line: Pick<Result, 'n' | 'ds' | 's' | 'x' | 'y' | 'tx' | 'ty' | 'grade'>, s: number, direction: 1 | -1, c: PairedCategoryId): XYZ & { s: number; travel: { x: number; y: number } } {
  const k = stationIndex(line, s), r = rightOf(line, k, direction), off = SLIP_SECTIONS[c].goreOffset;
  return { x: line.x[k] + r.x * off, y: line.y[k] + r.y * off, z: line.grade[k], s: line.s[k],
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
  /** paved area added to the carriageway (SlipSection.widening; tapers at half), on ground / on bridges, m² */
  area: { ground: number; bridge: number };
  cost: number;
  /** the dashed line between it and the through lane, its taper's edge, and the paving it adds beyond the paved
   * shoulder (the middle of that strip, `halfWidth` its half; drawn; any may be empty) */
  lines: (XYZ & { halfWidth?: number })[][];
  /** how much wider the formation is on its side, at the paired road's stations `k` (drawn, as billed: `area`) */
  widen: { k: number; extra: number }[];
  /** a railway carried over the paired road's cutting on its new bridge (rail-over.ts) where the lane widens that
   * cutting: the bridge that much longer on its side (`span`, m, along the railway), and what that adds (`cost`, in
   * `cost`; drawn: render/slip-merge.ts) */
  rail: { s: number; extra: number; span: number; cost: number }[];
  /** the side of the paired road's line it is on (1: left of the line's direction) */
  side: 1 | -1;
  violations: Violation[];
}
const issue = (s0: number, s1: number, title: string, fix: string, rule: string, basis: Violation['basis'] = 'game'): Violation =>
  ({ kind: 'crossing', s0, s1, title, fix, rule, basis });

/** The speed-change lane of a slip road whose end `end` meets the carriageway `direction` of the paired road `line`
 * (`host`) at station sGore, for a slip road of design speed `speed`; its violations are worded for the slip road
 * (stations [s0, s1] of the slip road's own line: where it meets the paired road). */
export function speedChangeLane(line: Result, sGore: number, direction: 1 | -1, kind: 'exit' | 'entry', speed: number,
  terrain: TerrainClass, at: { s0: number; s1: number }, host: SlipHost): SpeedChangeLane {
  const vn = hostSpeedAt(host, sGore), sec = SLIP_SECTIONS[host.category], spec = laneLengths(vn)[kind], length = spec.length[speed] ?? spec.length[50];
  const word = `the ${sec.word}`;
  // u: along the travel from the lane's upstream end (an exit: its taper's start; an entry: the gore) to its downstream end
  const upstream = kind === 'exit' ? sGore - direction * length : sGore;
  const s0 = Math.min(upstream, upstream + direction * length), s1 = Math.max(upstream, upstream + direction * length);
  const violations: Violation[] = [];
  const what = kind === 'exit' ? 'exit lane' : 'entry lane', name = kind === 'exit' ? 'An exit lane' : 'An entry lane';
  const short = s0 < 0 ? -s0 : s1 > line.length ? s1 - line.length : 0;
  if (short > 0.5) violations.push(issue(at.s0, at.s1, `Its ${what} runs off the end of ${word}`,
    `Move this end at least ${Math.ceil(short / 10) * 10} m further along ${word}`, `${name} is ${length} m long for a ${speed} km/h slip road on a ${vn} km/h ${sec.word} (after ČSN 73 6102)`, 'norm')); // research/90 §4, §4c
  // its share of full width: an exit opens over its first `taper` m, an entry closes over its last
  const width = (u: number) => Math.min(1, Math.max(0, (kind === 'exit' ? u : length - u) / spec.taper));
  const area = { ground: 0, bridge: 0 }, lines: SpeedChangeLane['lines'] = [[], [], []], widen: SpeedChangeLane['widen'] = [];
  const per = CATEGORIES[host.category], perM2 = { ground: per.normPerKm[terrain] / 1000 / per.crownWidth, bridge: per.bridgePerKm / 1000 / per.crownWidth };
  let tunnel = false;
  const steps = Math.max(1, Math.ceil(length / line.ds)), du = length / steps;
  for (let q = 0; q <= steps; q++) {
    const u = q * du, s = upstream + direction * u;
    if (s < 0 || s > line.length) continue;
    const k = stationIndex(line, s), w = width(u);
    if (line.kind[k] === KIND.tunnel) tunnel = true;
    // (the paving each sample stands for: half a step at the ends)
    const da = sec.widening * w * (q === 0 || q === steps ? du / 2 : du);
    if (line.kind[k] === KIND.bridge) area.bridge += da; else area.ground += da;
    const r = rightOf(line, k, direction), z = line.grade[k];
    // the dashed line at the through lanes' edge where the lane is full width; along the taper its outer edge
    if (w >= 1 - 1e-9) lines[0].push({ x: line.x[k] + r.x * (sec.through + 0.125), y: line.y[k] + r.y * (sec.through + 0.125), z });
    else { const off = sec.through + 0.25 + 3.5 * w; lines[1].push({ x: line.x[k] + r.x * off, y: line.y[k] + r.y * off, z }); }
    // the paving beyond the paved shoulder, and the formation that much wider (as billed: `da`)
    const extra = sec.widening * w;
    if (extra > 1e-6) { const mid = sec.paved + extra / 2; lines[2].push({ x: line.x[k] + r.x * mid, y: line.y[k] + r.y * mid, z, halfWidth: extra / 2 }); }
  }
  for (let k = 0; k < line.n; k++) if (line.s[k] >= s0 && line.s[k] <= s1) widen.push({ k, extra: sec.widening * width(direction * (line.s[k] - upstream)) });
  if (tunnel) violations.push(issue(at.s0, at.s1, `Its ${what} runs into a tunnel`, `Move this end along ${word}, out of the tunnel`,
    'Game rule: a speed-change lane is built in the open (a wider tunnel is not in the game)'));
  // (a railway's new bridge over the cutting it widens spans its walls that much further apart: as wide as built; two
  // lanes under one bridge each add theirs to the bridge as Auto priced it)
  const rail: SpeedChangeLane['rail'] = [];
  for (const c of line.railCrossings ?? []) {
    const extra = c.how === 'railway' && c.price ? widen.find(w => w.k === c.i)?.extra ?? 0 : 0;
    if (!(extra > 1e-6)) continue;
    const longer = railOverPrice(c.price!.span * Math.max(0.3, Math.abs(c.sine)) + extra, c.sine, c.tracks);
    rail.push({ s: c.s, extra, span: longer.span - c.price!.span, cost: longer.cost - c.price!.cost });
  }
  const cost = area.ground * perM2.ground + area.bridge * perM2.bridge + rail.reduce((a, r) => a + r.cost, 0);
  // (the right of travel on the forward carriageway is the line's right)
  return { kind, s0, s1, length, area, cost, lines, widen, rail, side: direction === 1 ? -1 : 1, violations };
}

/** A step between the two pavements this small is one body (the height a slip road is held at, MERGE_TOLERANCE), m. */
export const STEP_TOLERANCE = GRADE_PIN_TOLERANCE + 0.05;
/** Two cuttings side by side whose tops come within this of each other leave a narrow ridge of ground between them:
 * designers dig it out, the two one cutting with one slope from crown edge to crown edge, m. PROVISIONAL: the
 * screen's clearance between two roads' works (project-ledger.ts INDEPENDENCE_SCREEN), what the game calls too narrow
 * a strip to leave. */
export const RIDGE_REACH = 10;
/** Where the motorway's cutting (crown edge at `w` from its line, height `z`, its face to the ground at `day`, `zDay`)
 * and a slip road's beside it (its line `d` from the motorway's, the same measured from its own line) leave a ridge too
 * narrow to keep (their tops within RIDGE_REACH, or their faces meeting): the crown edges' offsets and the common
 * slope's middle (across from the motorway's line, its height); null where they are not both cuttings that close. */
export function dugRidge(m: { z: number; zDay: number; day: number; w: number }, r: { z: number; zDay: number; day: number; w: number }, d: number) {
  if (!(m.zDay > m.z && r.zDay > r.z && m.day > m.w && r.day > r.w)) return null;
  const x0 = m.w, x1 = d - r.w;
  if (!(x1 > x0 + 1e-6) || (d - r.day) - m.day >= RIDGE_REACH) return null;
  return { x0, x1, x: (x0 + x1) / 2, z: (m.z + r.z) / 2 };
}
/** Where a dug-out ridge ends, what is left of it is cut down to it along the road at a cutting's slope (1 : 1.75,
 * data/prices.ts side slopes in cuts over 2 m deep, research/48 §1): its nose, not a cliff. */
export const RIDGE_NOSE = 1.75;
/** The ridge between a slip road's cutting and its motorway's dug out (dugRidge), and its nose where that ends (RIDGE_NOSE),
 * per station q of the slip road (`ramp`): the motorway's station beside it (`k`), across from the motorway's line
 * where the two faces end (`x`, NaN: nowhere), the height there (`z`), which side of each faces the other, how far
 * across from the motorway's line it is (`d`) and how square the slip road's cross-section runs to the motorway's
 * (`cos`: a distance across the motorway is that much longer across the slip road), and the ground
 * taken out beyond what the two cuttings dig, m² of cross-section (`area`). Billed (slipRoadAtMotorway) and drawn
 * (render/slip-merge.ts) from this one answer. `heightAt`: the ground; `c`: the paired road's category. */
export function dugRidges(ramp: Result, line: Result, heightAt: (x: number, y: number) => number, c: PairedCategoryId) {
  const n = ramp.n, wm = SLIP_SECTIONS[c].half, wr = CATEGORIES['V7.25'].crownWidth / 2;
  const out = { k: new Int32Array(n).fill(-1), x: new Float64Array(n).fill(NaN), z: new Float64Array(n).fill(NaN), area: new Float64Array(n),
    mLeft: new Uint8Array(n), rLeft: new Uint8Array(n), d: new Float64Array(n).fill(NaN), cos: new Float64Array(n).fill(1) };
  type At = { kk: number; d: number; nx: number; ny: number; zm: number; zDayM: number; dayM: number; zr: number; zDayR: number; dayR: number; x0: number; x1: number };
  const at: (At | null)[] = [];
  const face = (z: number, zDay: number, u: number, w: number, day: number) => u <= w ? z : u <= day ? z + (zDay - z) * (u - w) / Math.max(1e-6, day - w) : NaN;
  const dug: number[] = [];
  for (let q = 0; q < n; q++) {
    at.push(null);
    if (ramp.kind[q] !== KIND.earth) continue;
    let kk = 0, dd = Infinity;
    for (let j = 0; j < line.n; j++) { const e = Math.hypot(line.x[j] - ramp.x[q], line.y[j] - ramp.y[q]); if (e < dd) { dd = e; kk = j; } }
    if (line.kind[kk] !== KIND.earth || !(dd > 1e-6) || dd > wm + wr + 2 * RIDGE_REACH + 80) continue;
    // (across the motorway's line at its station: square to it, not the slant distance to that station)
    const across = -(ramp.x[q] - line.x[kk]) * line.ty[kk] + (ramp.y[q] - line.y[kk]) * line.tx[kk];
    if (!(Math.abs(across) > 1e-6)) continue;
    const nx = -line.ty[kk] * Math.sign(across), ny = line.tx[kk] * Math.sign(across);
    dd = Math.abs(across);
    const mLeft = -line.ty[kk] * nx + line.tx[kk] * ny > 0, rLeft = -ramp.ty[q] * -nx + ramp.tx[q] * -ny > 0;
    const a: At = { kk, d: dd, nx, ny, zm: line.grade[kk], zDayM: (mLeft ? line.zDayL : line.zDayR)[kk], dayM: (mLeft ? line.dayL : line.dayR)[kk],
      zr: ramp.grade[q], zDayR: (rLeft ? ramp.zDayL : ramp.zDayR)[q], dayR: (rLeft ? ramp.dayL : ramp.dayR)[q], x0: wm, x1: dd - wr };
    // (both cuttings, their crowns apart)
    if (!(a.zDayM > a.zm && a.zDayR > a.zr && a.dayM > wm && a.dayR > wr && a.x1 > a.x0 + 1e-6)) continue;
    at[q] = a; out.k[q] = kk; out.mLeft[q] = mLeft ? 1 : 0; out.rLeft[q] = rLeft ? 1 : 0; out.d[q] = dd;
    out.cos[q] = Math.max(0.2, Math.abs(-ramp.ty[q] * nx + ramp.tx[q] * ny));
    const r = dugRidge({ z: a.zm, zDay: a.zDayM, day: a.dayM, w: wm }, { z: a.zr, zDay: a.zDayR, day: a.dayR, w: wr }, dd);
    if (r) { out.x[q] = r.x; out.z[q] = r.z; dug.push(q); }
  }
  // the ground between the crown edges at station q above the bottom from crown edge to (x, z) to crown edge, m²
  // (NaN: that bottom would stand above the cuttings' faces or the ground somewhere)
  const taken = (q: number, x: number, z: number) => {
    const a = at[q]!, steps = Math.max(4, Math.ceil((a.x1 - a.x0) / 0.5)), dx = (a.x1 - a.x0) / steps;
    let area = 0;
    for (let m = 0; m < steps; m++) {
      const u = a.x0 + (m + 0.5) * dx, gz = heightAt(line.x[a.kk] + a.nx * u, line.y[a.kk] + a.ny * u);
      const fm = face(a.zm, a.zDayM, u, wm, a.dayM), fr = face(a.zr, a.zDayR, a.d - u, wr, a.dayR);
      const top = Math.min(gz, Number.isNaN(fm) ? gz : fm, Number.isNaN(fr) ? gz : fr);
      const bottom = u <= x ? a.zm + (z - a.zm) * (u - a.x0) / Math.max(1e-6, x - a.x0) : z + (a.zr - z) * (u - x) / Math.max(1e-6, a.x1 - x);
      if (bottom > top + 0.05 && dug.indexOf(q) < 0) return NaN;
      area += Math.max(0, top - bottom) * dx;
    }
    return area;
  };
  // (a station whose ground cannot be measured is not dug: neither billed nor drawn)
  for (const q of dug) { const area = taken(q, out.x[q], out.z[q]); if (Number.isFinite(area)) out.area[q] = area; else { out.x[q] = NaN; out.z[q] = NaN; } }
  // the nose: on from either end of a dug stretch, along the stations next to it where both are still cuttings, what
  // stands of the ridge is cut down to the slope rising from it along the road
  const isDug = (q: number) => Number.isFinite(out.x[q]) && out.area[q] >= 0 && dug.includes(q);
  for (const q0 of dug) if (isDug(q0)) for (const step of [-1, 1]) {
    if (isDug(q0 + step)) continue;
    for (let q = q0 + step; q >= 0 && q < n && at[q] && !Number.isFinite(out.x[q]); q += step) {
      const a = at[q]!, x = (a.x0 + a.x1) / 2, z = out.z[q0] + Math.abs(ramp.s[q] - ramp.s[q0]) / RIDGE_NOSE;
      const g = heightAt(line.x[a.kk] + a.nx * x, line.y[a.kk] + a.ny * x);
      const fm = face(a.zm, a.zDayM, x, wm, a.dayM), fr = face(a.zr, a.zDayR, a.d - x, wr, a.dayR);
      const top = Math.min(g, Number.isNaN(fm) ? g : fm, Number.isNaN(fr) ? g : fr);
      if (!(z < top - 0.1)) break;
      const area = taken(q, x, z);
      if (!Number.isFinite(area)) break;
      out.x[q] = x; out.z[q] = z; out.area[q] = area;
    }
  }
  return out;
}

/** The speed-change lane of a slip road's end `end` on carriageway `direction` of the paired road `line` (`host`): at
 * the line's station nearest that end (`k`; `i` the slip road's), and where on the slip road its problems are marked. */
export function laneOf(ramp: Pick<Result, 'n' | 'x' | 'y' | 'length'>, end: 'a' | 'b', line: Result, direction: 1 | -1, speed: number,
  terrain: TerrainClass, host: SlipHost) {
  const i = end === 'a' ? 0 : ramp.n - 1, kind = end === 'a' ? 'exit' as const : 'entry' as const;
  let k = 0, best = Infinity;
  for (let j = 0; j < line.n; j++) { const dd = Math.hypot(line.x[j] - ramp.x[i], line.y[j] - ramp.y[i]); if (dd < best) { best = dd; k = j; } }
  const zone = SLIP_ROAD.endZone;
  const at = end === 'a' ? { s0: 0, s1: Math.min(ramp.length, zone) } : { s0: Math.max(0, ramp.length - zone), s1: ramp.length };
  return { i, k, kind, at, lane: speedChangeLane(line, line.s[k], direction, kind, speed, terrain, at, host) };
}
/** What a slip road builds where it meets the motorway (`end` on carriageway `direction` of the paired body `line`):
 * the speed-change lane (a work of the slip road, drawn and billed); what the two bodies build once where they
 * meet (a credit: its first metres on the motorway's formation, `shared(q)` its cost there, and where their slopes
 * overlap the earth and land between them, as the two directions of a split motorway count it,
 * project-motorway.ts splitLedger); a slope of one standing on the other's carriageway (a problem); and where the
 * two bodies' works are one (`zones`: wherever its works and the motorway's come within `clearance` of each other,
 * the interchange's own earthworks, not land two roads share; `goreZones`: those of its first metres on the
 * motorway's formation, where the slip roads of the other carriageway reach too). `heightAt`: the ground. */
export function slipRoadAtMotorway(ramp: Result, end: 'a' | 'b', line: Result, direction: 1 | -1, speed: number, terrain: TerrainClass,
  shared: (q: number) => number, clearance: number, heightAt: (x: number, y: number) => number, host: SlipHost) {
  const sec = SLIP_SECTIONS[host.category], the = `the ${sec.word}`;
  const { i, k, kind, at, lane } = laneOf(ramp, end, line, direction, speed, terrain, host);
  const violations = [...lane.violations];
  // (where it leaves or joins the motorway it is on the ground: as Build refuses a bridge or tunnel there)
  if (line.kind[k] !== KIND.earth) violations.push({ kind: 'crossing', ...at, basis: 'game',
    title: end === 'a' ? `It leaves ${the} on a bridge or in a tunnel` : `It joins ${the} on a bridge or in a tunnel`,
    fix: `Move this end along ${the} to where it runs on the ground`,
    rule: `Game rule: a slip road leaves and joins a ${sec.word} where it runs on the ground (its start on a bridge or in a tunnel is not built by the game)` });
  // it leaves (joins) along the traffic: its first straight heads the carriageway's way, not against it
  const g = gore(line, line.s[k], direction, host.category), sign = end === 'a' ? 1 : -1;
  const q1 = end === 'a' ? Math.min(ramp.n - 1, i + 2) : Math.max(0, i - 2);
  const hx = sign * (ramp.x[q1] - ramp.x[i]), hy = sign * (ramp.y[q1] - ramp.y[i]);
  if (hx * g.travel.x + hy * g.travel.y < 0) violations.push({ kind: 'crossing', ...at, basis: 'game',
    title: end === 'a' ? `It leaves ${the} against the traffic` : `It joins ${the} against the traffic`,
    fix: end === 'a' ? `Turn it to leave the way the traffic goes, or start it on the other side of ${the}`
      : `Turn it to join the way the traffic goes, or end it on the other side of ${the}`,
    rule: 'Game rule: a slip road leaves and joins a carriageway along its traffic, on its right' });
  // (its formation: the paired road's half, wider along the speed-change lane, which ends at the gore)
  const wm = sec.half, wr = CATEGORIES['V7.25'].crownWidth / 2, wide = new Map(lane.widen.map(w => [w.k, w.extra]));
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
    if (inside === step && dd <= wm + (wide.get(kk) ?? 0)) { inside = step + 1; credit += shared(q); goreZones.push(zone); continue; }
    if (ramp.kind[q] !== KIND.earth || line.kind[kk] !== KIND.earth || !(dd > 1e-6)) continue;
    // Across the motorway's line towards the slip road (x from its line, the slip road's line at d): each body's
    // top, its crown then its slope facing the other (as the two directions of a split motorway, splitLedger).
    const nx = (ramp.x[q] - line.x[kk]) / dd, ny = (ramp.y[q] - line.y[kk]) / dd, d = dd;
    const left = -line.ty[kk] * nx + line.tx[kk] * ny > 0, rampLeft = -ramp.ty[q] * -nx + ramp.tx[q] * -ny > 0;
    const dayM = left ? line.dayL[kk] : line.dayR[kk], zDayM = left ? line.zDayL[kk] : line.zDayR[kk], zm = line.grade[kk];
    const dayR = rampLeft ? ramp.dayL[q] : ramp.dayR[q], zDayR = rampLeft ? ramp.zDayL[q] : ramp.zDayR[q], zr = ramp.grade[q];
    const face = (z: number, zDay: number, u: number, w: number, day: number) => u <= w ? z : u <= day ? z + (zDay - z) * (u - w) / Math.max(1e-6, day - w) : NaN;
    const lo = d - dayR, hi = dayM, fillM = zDayM <= zm, fillR = zDayR <= zr;
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
    title: `It crosses ${the}`, fix: 'Keep it on the side of the carriageway it leaves or joins',
    rule: `Engine limit: a slip road crossing its own ${sec.word} needs a bridge, which the game does not build for it yet.` });
  for (const c of clashes) violations.push({ kind: 'footprint', basis: 'engine', s0: c.s0, s1: c.s1,
    title: `Its slope and ${the}'s clash`,
    fix: `Move it at least ${Math.ceil(c.need)} m further from ${the} here, or give it ${the}'s height`,
    detail: `Beside ${the} at another height, the slope of one would stand on the other. Walls between them are not built by the game.`,
    rule: `Engine limit: a slip road shares ${the}'s earthworks only at its height; otherwise each needs room for its own slopes.` });
  // the ridge between two cuttings dug out (and its nose), at what the slip road pays for a m³ of its cut
  const ridge = dugRidges(ramp, line, heightAt, host.category);
  for (let q = 0; q < ramp.n; q++) if (ridge.area[q] > 0) { dug += ridge.area[q] * ramp.ds; dugCost += ridge.area[q] * ramp.ds * (rate.cut + rate.haul); }
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
 * end on the paired road `line` of category `c`): the motorway's height while their crowns are within MERGE_GAP, then within a low
 * slope's fall of it across the gap between them (as designers keep a slip road beside the motorway's body until it
 * has room for its own slopes), until the gap is MERGE_REACH. */
export function mergeBands(xy: readonly number[], end: 'a' | 'b', line: Pick<Result, 'n' | 'x' | 'y' | 'grade'>, c: PairedCategoryId): { s: number; min: number; max: number }[] {
  const n = xy.length / 2, out: { s: number; min: number; max: number }[] = [];
  if (n < 2) return out;
  // (beside its gore the paired road's own crown: its speed-change lane ends there)
  const edges = SLIP_SECTIONS[c].half + CATEGORIES['V7.25'].crownWidth / 2, reach = edges + MERGE_REACH;
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
