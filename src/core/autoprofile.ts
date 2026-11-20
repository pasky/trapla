// Automatic grade line by dynamic programming over knots every ~250 m.
// State at knot k: (elevation z_k on a u-metre grid anchored at A, incoming grade as integer
// dz_k = z_k − z_{k−1} in grid units). Constraints: |dz|·u ≤ g_max·Δ (with a small margin for the
// final endpoint correction); grade changes limited so that a vertical curve of the minimum radius
// fits within one knot spacing (|Δg| ≤ Δ / R_min, crest or sag), which also guarantees that
// neighbouring curves never overlap. Cost: per-metre cost f(h) of grade-minus-ground h along the
// centreline (earthworks / bridge / tunnel, whichever is cheaper), a penalty where a required
// clearance (river / railway crossing) is not met, and a small penalty per VPI.
// The returned `feasible` flag comes from checking the reconstructed profile, not from the search.
//
// The search is coarse-to-fine: a 2 m elevation grid over the whole band first, then a 1 m grid
// within ±FINE_BAND of the coarse line (≈ 6× less work than the 1 m grid over the whole band).
// Optional mass-balance search: the per-metre cost may depend on the value of a m³ of fill material
// (cut yields it, fill consumes it); the fine pass is repeated for a few values to find the one
// whose grade line neither buys fill nor tips a surplus.
//
// A full evaluation solves in blocks (`blocks`, research/39 "Local edits"): boundaries in the middle
// of long straights, each boundary's heights from the route within BLOCK_WINDOW of it, each block
// between its boundaries with its own mass balance; knots and cost samples are placed from the block
// ends, never from the route's stations. Same design, same line; an edit moves only the boundaries
// and blocks it reaches.
//
// How costs reach the search (keep to this when adding cost signals, e.g. urban / demolition):
// - A cost enters only as a per-metre cost function of grade-minus-ground h: `costPerM(h, kind,
//   costClass)`, or with a mass-balance search `BalanceSearch.costFor(v)(h, kind, costClass)`. The
//   DP never calls it per station: each (block × cost class × structure kind) gets one height table
//   (`buildLut`), filled lazily on the fixed h grid.
// - The DP sums that table over cost samples: chainage, ground, weight and an offset into the
//   tables (block × class × kind). Blocks: samples are placed evenly between knots at their exact
//   chainage, with `groundAt(s)` and `classAt(s)` there; a cost tied to one place (a stream
//   crossing) is a point class (`points`, its own chainage and ground, weight `pointWeight`).
// - So a location-dependent cost is a cost class (the station array `costClass` + `costClassCount`,
//   and `classAt(s)` returning the same class at any chainage) or a point class. Never a
//   per-station array read by station index inside the DP: stations shift whenever the route
//   length changes, so such a cost would move with every edit upstream and break locality.
// - Hard limits on h (`minH`, `maxH`, `eitherH`) are per station but placed by `clearanceS` (the
//   chainage they apply at); give a new one its exact chainage there.

import { buildProfile, elevationAt, elevations, gradeLimitOf, type GradeLimit, type RadiusLimit, type VPI } from './vertical';
import { clearancePinViolation, GRADE_PIN_TOLERANCE, gradePinViolations, PIN_FIX_NEAR, STEEP_MAX, type GradePin, type GradePinViolation } from './grade-pins';
export { STEEP_MAX } from './grade-pins';

export interface BalanceSearch {
  /** cost per metre of road for grade-minus-ground h, given the value of a m³ of fill material */
  costFor: (materialValue: number) => (h: number, kind?: number, costClass?: number) => number;
  /** usable cut minus fill of a grade line, m³ (> 0 = surplus to tip, < 0 = fill to buy); with a
   * range, of the route between those chainages only (a block's own balance) */
  balanceOf: (vpis: VPI[], materialValue: number, range?: readonly [number, number]) => number;
  start: number;
  lo: number;
  hi: number;
  /** stop when |balance| is below this, m³ */
  tolerance: number;
}

export interface AutoProfileOptions {
  /** Transport-surface endpoint constraints, independent of the real ground used for earthworks. */
  endpointElevations?: { a?: number; b?: number };
  /** Absolute-chainage heights on the smoothed grade (±0.5 m). Out-of-route pins are inactive.
   * Endpoint pins constrain, but never replace, the fixed transport endpoints. */
  pins?: readonly GradePin[];
  /** the steepest grade anywhere (with `gradeAt`: the largest of its limits) */
  maxGradient: number;
  /** the smallest crest / sag radius anywhere (with `crestAt` / `sagAt`: the smallest of theirs) */
  minCrest: number;
  minSag: number;
  /** The steepest grade between two chainages where it varies along the road (terrain class, hairpins):
   * ≤ maxGradient. */
  gradeAt?: (s0: number, s1: number) => number;
  /** The smallest crest / sag radius at a chainage where it varies (a stretch's own design speed). */
  crestAt?: (s: number) => number;
  sagAt?: (s: number) => number;
  /** cost per metre of road for a grade-minus-ground difference h (m); ignored when `balance` is set */
  costPerM: (h: number, kind?: number, costClass?: number) => number;
  /** Small discrete cost classes (e.g. 0 ordinary / 1 stream), indexed by station. */
  costClass?: ArrayLike<number>;
  /** Number of cost classes; each uses four small height LUTs, never a LUT per station. */
  costClassCount?: number;
  /** Blocks (route chainage of the boundaries between them, ascending; see profileBlocks): a
   * block-wise solve, knots spaced evenly within each block and cost sampled evenly between knots, so
   * neither moves when the route changes length elsewhere; with `balance`, each block balances its
   * own cut and fill (its own material value). Boundaries closer than MIN_BLOCK to another or to an
   * end are dropped. */
  blocks?: readonly number[];
  /** With `blocks`: a fixed material value per block instead of a balance search (a retry that
   * keeps the values found). */
  blockValues?: readonly number[];
  /** With `blocks`: ground height at any chainage, for the even cost samples (else interpolated
   * between stations). */
  groundAt?: (s: number) => number;
  /** With `blocks`: cost class of the ground at any chainage (−1: the nearest station's). */
  classAt?: (s: number) => number;
  /** With `blocks`: cost classes priced at one place (a stream crossing), each at its own chainage
   * and ground with the weight `pointWeight`. */
  points?: readonly { s: number; g: number; cls: number }[];
  pointWeight?: number;
  /** Chainage at which each station's clearance applies (NaN: the station's own), so a required
   * clearance does not move with the stations. */
  clearanceS?: ArrayLike<number>;
  /** −1 = automatic, otherwise earth/bridge/tunnel; selects the corresponding cost lookup. */
  structureKind?: ArrayLike<number>;
  /** A tunnel goes on to where the ground is this far above the grade (its portal), m: with it the search
   * has a tunnel mode (the cost function then answers kinds PROFILE_KIND.open / .inTunnel), else a tunnel is
   * priced station by station. */
  portalDepth?: number;
  /** With `portalDepth`: the steepest a line in a tunnel longer than `tunnelHardFrom` may be, as a fraction (NV 264/2009
   * annex 2.2: no new tunnel over 500 m steeper than 5 %): the tunnel mode takes no line steeper between two knots wholly
   * in a tunnel, and where its line still has a tunnel that long steeper anywhere (at its ends), none steeper anywhere
   * in a tunnel. Undefined: the road's own limit. */
  tunnelHardGrade?: number;
  tunnelHardFrom?: number;
  /** optional upper h bound (manual tunnel cover); NaN = none */
  maxH?: ArrayLike<number>;
  /** search for the material value that balances cut and fill (see BalanceSearch) */
  balance?: BalanceSearch;
  /** optional per-station minimum h (NaN = none), e.g. bridge clearance over a river */
  minH?: ArrayLike<number>;
  /** Disjunctive crossing clearance: pass above a channel OR tunnel sufficiently below it. */
  eitherH?: { above: ArrayLike<number>; below: ArrayLike<number> };
  /** With pins: the clearances a pin may not make the line miss (a line through the pin that misses one Auto's own
   * line keeps leaves the pin out). The crossings' own, where a retry has raised the search's bounds for a margin
   * or added floors; default `minH` / `maxH` / `eitherH`. */
  pinBounds?: Pick<AutoProfileOptions, 'minH' | 'maxH' | 'eitherH' | 'clearanceS'>;
  /** A suggestion's check (a height Auto reaches within the norm): a pin met only by missing a crossing's own
   * clearance (`pinBounds`) that Auto's own line keeps is left out (reason 'clearance'), and no pin is met by a
   * line steeper than the norm (`steep`). Without it the player's pins are honoured (PLAN.md "A pin the player
   * set is honoured"). */
  pinStrict?: boolean;
  /** The player's pins Auto honours at a price and the stretches around them it re-solves, its own line without them
   * elsewhere, and where in them it may run steeper than the norm (`grade` there): found by `autoProfile` itself
   * (`honour`); a retry passes its result's back. */
  honoured?: Honoured;
  steep?: readonly SteepWindow[];
  /** (internal, `spliced`) a line whose knot heights the solve keeps outside `spans`, the material value of each
   * block there */
  splice?: { vpis: readonly VPI[]; values: readonly number[]; spans: readonly (readonly [number, number])[] };
  /** CZK per unmet clearance station (default CLEARANCE_PENALTY); larger where a motorway's
   * structures dwarf the default and a missed clearance would rather be paid than built. */
  clearancePenalty?: number;
  /** Per-station penalty instead of `clearancePenalty` (indexed by station). */
  clearancePenaltyAt?: ArrayLike<number>;
  /** 1 = a station whose clearance the law demands (a protected area under our crown, research/75): a
   * boundary's corridor or the normal band that misses one is not taken while a wider search meets it. */
  hardClearance?: ArrayLike<number>;
  knotSpacing?: number;
  /** penalty per grade change, CZK (keeps the line calm) */
  vpiPenalty?: number;
  /** The grade line continues a given one at A / at B with this grade (a separate motorway stretch, a
   * stretch re-solved in a drag preview): the grade change there must fit one vertical curve of the
   * minimum radius within half a knot spacing, like any other knot. Absent: any grade. */
  startGrade?: number;
  endGrade?: number;
  /** …and the largest grade change allowed there (the room its curve has on the given line), grade units */
  startGradeSlack?: number;
  endGradeSlack?: number;
  /** search band above/below the local ground envelope, m */
  pad?: number;
  /** With `blocks` and `balance`: boundary and block solves shared by the evaluations of one design (its
   * retries), keyed by everything they read: one whose inputs did not change is not repeated. */
  memo?: Map<string, unknown>;
}

export interface AutoProfileResult {
  vpis: VPI[];
  feasible: boolean;
  /** objective value (approximate cost) */
  cost: number;
  /** material value the grade line was optimised for (only with a balance search) */
  materialValue?: number;
  /** balance estimate at that value, m³ */
  balance?: number;
  /** Present for active pins; append to evaluation violations. No-pin results stay unchanged. */
  pinViolations?: GradePinViolation[];
  /** Set when pins no legal line meets were left out (`feasible` is then false, `pinViolations` says which):
   * the line is Auto's own without them, and this says whether it keeps every limit itself, i.e. can be
   * engineered as Auto's line. An unreachable pin is reported, not obeyed by bending the whole route. */
  lineOk?: boolean;
  /** The player's pins honoured at a price (`honoured`, `steep` of the options). */
  honoured?: Honoured;
  steep?: SteepWindow[];
  /** With `blocks`: the blocks used (their ends, from 0 to the route length) and, with a balance
   * search or fixed values, each block's material value. */
  blockBounds?: number[];
  blockValues?: number[];
}

/** A grade line that can be engineered as Auto's: every limit kept (pins it could not meet left out, reported). */
export const usableLine = (r: AutoProfileResult): boolean => r.feasible || r.lineOk === true;

/** A stretch (chainage s0–s1) where the line may be as steep as `grade` to meet the pin `pin`. */
export interface SteepWindow { s0: number; s1: number; grade: number; pin: GradePin }
/** Pins Auto meets by re-solving its own line (without them) only within `spans` (chainage, m); `left`: those it
 * could not honour so (left out, said at each) */
export interface Honoured { pins: readonly GradePin[]; spans: readonly (readonly [number, number])[]; left: readonly GradePin[] }

/** Search parameters of a pin honoured at a price (no norm: how far Auto looks for room): Auto holds its own line
 * this far either side of the pin, then twice and four times as far where no line is found; where that is steeper
 * than the norm, the grade from its hold straight to the pin (else the norm's), plus a quarter of the norm's for the
 * curves at its ends. */
const STEEP_WINDOWS = [500, 1000, 2000];
const STEEP_SLACK = 0.25;
/** The search's price of a steep stretch's grade over the norm's, CZK per metre per x(1 + x), x = excess / norm (a
 * search parameter, never billed, like the VPI penalty): far above any difference of the works, so the line is no
 * steeper than it must be anywhere (x) and spreads what it must climb evenly over the stretch (x²: one grade, not a
 * steep piece). */
const STEEP_PENALTY = 1e7;


/** A block boundary is the middle of the longest straight within this distance on either side, m. */
export const BLOCK_SPACING = 2000;
/** A boundary's heights come from the route within this distance of it, m. Measured (research/39
 * "Local edits"): 1.5 km windows cost 2–9 % on the D3/D35 routes against a whole-route solve, 5 km
 * ones match it on the sum of all saved designs, and far violations still do not change. */
export const BLOCK_WINDOW = 5000;
/** A boundary's window searches this far above / below the ground envelope (its corridor only fixes the
 * boundary's heights; the blocks search the full band), m. Not a railway's (gentle grade: its corridor
 * leaves the ground by more, e.g. a tunnel's approach). */
const WINDOW_PAD = 15;
// …and prices every other cost sample (twice the weight): the sum of all saved designs and starters within
// 0.1 % of every sample, half the work.
/** Blocks shorter than this (from the previous boundary or to B) are not split off, m. */
const MIN_BLOCK = 1000;

/** A straight longer than this has its boundaries at the BLOCK_GRID lines, not in its middle, m. */
const LONG_STRAIGHT = 2 * BLOCK_SPACING;
/** Lines across the A–B axis this far apart (measured along the axis from A), m. */
export const BLOCK_GRID = 4000;

/** A block longer than this (no straight long enough to bound it, e.g. straights each a little shorter than
 * the one before) is split where the route crosses the BLOCK_GRID lines, m. */
const LONG_BLOCK = 5000;

/**
 * `bounds` (ascending boundaries) with the BLOCK_GRID crossings `grid` (route chainage, ascending) added
 * inside every block longer than LONG_BLOCK, at least MIN_BLOCK from its ends.
 */
/** The ends of the blocks a solve with `blocks` uses (0, the boundaries kept, L): a boundary closer than
 * MIN_BLOCK to the previous one or to the end is dropped. */
export function blockEnds(blocks: readonly number[], L: number): number[] {
  const bounds = [0];
  for (const b of blocks) if (b - bounds[bounds.length - 1] >= MIN_BLOCK && L - b >= MIN_BLOCK) bounds.push(b);
  bounds.push(L);
  return bounds;
}

export function fillLongBlocks(bounds: readonly number[], grid: readonly number[], L: number): number[] {
  const ends = [0, ...bounds, L], out = [...bounds];
  for (let q = 0; q + 1 < ends.length; q++) {
    if (ends[q + 1] - ends[q] <= LONG_BLOCK) continue;
    for (const g of grid) if (g > ends[q] + MIN_BLOCK && g < ends[q + 1] - MIN_BLOCK) out.push(g);
  }
  return out.sort((x, y) => x - y);
}

/** A straight of the plan: its chainage and its ends' distance along the A–B axis (from A, m); `end`:
 * it starts at A or ends at B. */
export interface PlanStraight { s0: number; s1: number; p0: number; p1: number; end?: boolean }

/**
 * Block boundaries of the grade solve, from the plan alone. Candidates: the middle of each straight
 * between two curves, and on a straight longer than LONG_STRAIGHT (also the first and the last one)
 * the points where it crosses lines across the A–B axis every BLOCK_GRID (fixed on the map, so a bend
 * moved elsewhere does not move them: the middle of a long straight would move with either of its
 * ends, and a straight start would have no boundary at all). A candidate is kept where it lies the
 * farthest from its straight's ends within BLOCK_SPACING on either side (the earlier of equal ones).
 * Depends only on the plan near each candidate: moving a bend moves only nearby boundaries.
 */
export function profileBlocks(straights: readonly PlanStraight[]): number[] {
  const cands: { s: number; room: number }[] = [];
  for (const t of straights) {
    const len = t.s1 - t.s0;
    if (!(len > 0)) continue;
    if (len <= LONG_STRAIGHT) { if (!t.end) cands.push({ s: t.s0 + len / 2, room: len / 2 }); continue; }
    const lo = Math.min(t.p0, t.p1), hi = Math.max(t.p0, t.p1);
    let any = false;
    for (let k = Math.ceil(lo / BLOCK_GRID); k * BLOCK_GRID <= hi; k++) {
      if (k <= 0 || hi === lo) continue;
      const s = t.s0 + len * (k * BLOCK_GRID - t.p0) / (t.p1 - t.p0);
      if (s > t.s0 && s < t.s1) { cands.push({ s, room: Math.min(s - t.s0, t.s1 - s) }); any = true; }
    }
    if (!any && !t.end) cands.push({ s: t.s0 + len / 2, room: len / 2 });
  }
  cands.sort((x, y) => x.s - y.s);
  return cands.filter((t, i) => cands.every((o, j) => j === i || Math.abs(o.s - t.s) > BLOCK_SPACING
    || (j < i ? o.room < t.room : o.room <= t.room))).map(t => t.s);
}

export const PROFILE_HEIGHT_MAX = 100;
export const PROFILE_HEIGHT_STEP = 0.05;
const H_MAX = PROFILE_HEIGHT_MAX, H_STEP = PROFILE_HEIGHT_STEP;
/**
 * Height tables per cost class: one per structure kind −1 (Auto: the cheapest of earthworks, bridge and
 * tunnel), 0 earthworks, 1 bridge, 2 tunnel (the player's choices) and, for the tunnel mode below, 3 (Auto
 * without a tunnel) and 4 (Auto inside a tunnel: a tunnel wherever the ground is deeper than its portal).
 */
export const PROFILE_KINDS = 6;
export const PROFILE_KIND = { open: 3, inTunnel: 4 } as const;
/** CZK per required-clearance station that is not met */
export const CLEARANCE_PENALTY = 1e8;
/** extra clearance asked of the polyline grade: vertical curves later shave up to ~1 m off crests */
export const CLEARANCE_MARGIN = 1.0;
/** the DP evaluates the cost on every k-th station only (≈ 20 m) */
const DP_STATION_STEP = 20;
/** elevation grids of the coarse and the fine pass, m */
const COARSE_GRID = 2, FINE_GRID = 1;
/** the fine pass searches this far above / below the coarse line, m */
const FINE_BAND = 6;
/** Grid steps per knot interval (gradient, curve limits) are rounded down from this much below the
 * exact value: a block of a round length (a straight start's 3 km blocks) would otherwise sit exactly on
 * a whole number of steps, and a millimetre shorter block (a bend added 10 km away) would lose a step
 * of gradient and pick other knots. */
const GRID_MARGIN = 1e-3;
/** fine passes spent on the mass-balance search (incl. the first) */
const BALANCE_EVALS = 4;

/** Optional NaN-initialised height tables shared by the caller across solves (and evaluations).
 * Entries are only ever filled with `cost(h, kind, costClass)` at the fixed height grid, so a
 * shared table must belong to exactly that cost function's inputs. */
export type SharedCostTable = (kind: number, costClass: number) => Float64Array | undefined;
type CostFn = AutoProfileOptions['costPerM'] & { table?: SharedCostTable };
/**
 * Knots in a block of this length: about one per `spacing`, chosen so that the steepest grade the
 * coarse and fine grids can represent (a whole number of grid steps per knot interval) is as close to
 * the maximum gradient as possible: a block whose spacing loses a step loses up to u/D of gradient,
 * which on a long climb at the limit means a tunnel or viaduct instead of the hillside.
 */
function knotCount(len: number, spacing: number, gmax: number, last: boolean, grids: readonly [number, number]): number {
  const base = Math.max(1, Math.round(len / spacing));
  let best = base, bestScore = -Infinity;
  for (let m = Math.max(1, base - 2); m <= base + 2; m++) {
    const d = len / m;
    if (m !== base && (d < 0.8 * spacing || d > 1.2 * spacing)) continue;
    // the last block keeps a reserve for B's off-grid height (solve: u / its length)
    const reach = (u: number) => Math.floor(((gmax - (last ? u / len : 0)) * d) / u - GRID_MARGIN) * u / d;
    const coarse = reach(grids[0]), fine = reach(grids[1]);
    const score = coarse + 0.5 * fine - 1e-6 * Math.abs(d - spacing);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

/** Height tables per cost block (block × class × kind); one cost function per block. */
interface CostLut { values: Float64Array[]; costs: CostFn[] }
function buildLut(costs: AutoProfileOptions['costPerM'][], classes: number): CostLut {
  // Sparse crossing classes used to price all 4,001 heights, even for narrow search bands.
  // Each solve fills its required envelope, retaining the identical grid and interpolation.
  // Allocate only class/kind blocks actually used by stations, not four blocks per class.
  return { values: new Array(classes * PROFILE_KINDS * costs.length), costs };
}

/** does the grade line satisfy max gradient and the (effective) vertical radii? */
export function profileOk(vpis: VPI[], maxGradient: GradeLimit, minCrest: RadiusLimit, minSag: RadiusLimit): boolean {
  const p = buildProfile(vpis, minCrest, minSag);
  for (let i = 0; i < p.grades.length; i++) if (!(Math.abs(p.grades[i]) <= gradeLimitOf(maxGradient, p.pts[i].s, p.pts[i + 1].s) + 1e-9)) return false;
  for (let i = 1; i < vpis.length; i++) if (!(vpis[i].s > vpis[i - 1].s)) return false;
  for (const c of p.curves) {
    if (c.type === 'none') continue;
    if (c.lenEff < c.len - 1e-3) return false;
  }
  return true;
}

/** A finished line may miss a clearance by this much before it counts, m (the search keeps CLEARANCE_MARGIN inside
 * each bound on its polygon; the rounding shaves a little of it). */
const PIN_CLEARANCE_SLACK = 0.05;

/** The stations whose clearance (`pinBounds`, else `minH`, `maxH`, `eitherH`) a grade line misses: the finished
 * (rounded) line, as built, at the clearance's own chainage. */
function missedClearances(s: ArrayLike<number>, g: ArrayLike<number>, opt: AutoProfileOptions, vpis: readonly VPI[]): number[] {
  const { minH, maxH, eitherH } = opt.pinBounds ?? opt, clearanceS = opt.pinBounds ? opt.pinBounds.clearanceS : opt.clearanceS;
  const at: number[] = [], xs: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (Number.isNaN(minH ? minH[i] : NaN) && Number.isNaN(maxH ? maxH[i] : NaN) && Number.isNaN(eitherH ? eitherH.above[i] : NaN)) continue;
    at.push(i); xs.push(clearanceS && !Number.isNaN(clearanceS[i]) ? clearanceS[i] : s[i]);
  }
  if (!at.length) return [];
  const order = xs.map((_, q) => q).sort((p, q) => xs[p] - xs[q]);
  const z = elevations(buildProfile([...vpis], opt.crestAt ?? opt.minCrest, opt.sagAt ?? opt.minSag), order.map(q => xs[q]));
  const out: number[] = [], e = PIN_CLEARANCE_SLACK;
  order.forEach((q, k) => {
    const i = at[q], h = z[k] - g[i];
    const lo = minH ? minH[i] : NaN, hi = maxH ? maxH[i] : NaN, above = eitherH ? eitherH.above[i] : NaN, below = eitherH ? eitherH.below[i] : NaN;
    if (h < lo - e || h > hi + e || (h < above - e && h > below + e)) out.push(i);
  });
  return out.sort((p, q) => p - q);
}

/**
 * Auto's grade line (searchProfile) through the player's pins (PLAN.md "A pin the player set is honoured"). A pin
 * the search cannot meet within the norm (out of the slopes' reach, or no line found), or meets only by missing a
 * crossing Auto's own line clears, is met by a line that is Auto's own from STEEP_WINDOWS[i] m either side of it
 * (`honour`): steeper than the norm next to it where it must be, the crossing missed where it must be, each said
 * where it is (evaluate.ts, grade-pins.ts honouredPinFixes). Only a pin out of reach even so is left out, said at
 * the pin. With `pinStrict` (a suggestion's check): the line Auto builds within the norm (`strictProfile`).
 */
export function autoProfile(s: ArrayLike<number>, g: ArrayLike<number>, opt: AutoProfileOptions): AutoProfileResult {
  if (opt.pinStrict) return strictProfile(s, g, opt);
  if (opt.honoured) {
    // (a retry with the pins honoured before: the same stretches, on its own line now)
    const h = opt.honoured, steep = opt.steep ?? [];
    opt = { ...opt, honoured: undefined, steep: undefined };
    const all = opt.pins ?? [], same = (p: GradePin) => (q: GradePin) => q.s === p.s && q.z === p.z;
    const searched = all.filter(p => !h.left.some(same(p))), rest = searched.filter(p => !h.pins.some(same(p)));
    const r = spliced(s, g, opt, searched, autoProfile(s, g, { ...opt, pins: rest }), h, steep);
    if (r) return reported(opt, r, new Map());
  }
  return honour(s, g, opt, searchProfile(s, g, opt));
}

/** Auto's line `ref` (without the pins `h.pins`) re-solved through the pins `searched` within `h.spans` only, steep
 * where `steep` says: null where that misses any of them. */
function spliced(s: ArrayLike<number>, g: ArrayLike<number>, opt: AutoProfileOptions, searched: readonly GradePin[], ref: AutoProfileResult, h: Honoured, steep: readonly SteepWindow[]): AutoProfileResult | null {
  if (!usableLine(ref) || !searched.length) return null;
  const values = ref.blockValues ?? [ref.materialValue ?? opt.balance?.start ?? 0];
  const t = searchProfile(s, g, { ...opt, pins: searched, steep, splice: { vpis: ref.vpis, values, spans: h.spans } });
  if (t.pinViolations?.length || !usableLine(t)) return null;
  return { ...t, honoured: { pins: h.pins.map(p => ({ ...p })), spans: h.spans.map(([a, b]) => [a, b] as const), left: h.left.map(p => ({ ...p })) },
    ...(steep.length ? { steep: [...steep] } : {}) };
}

/** A line through some of the player's pins (`r`, its pins met) with every pin of `opt.pins` checked against it: the ones
 * it leaves out reported (left out for a crossing `why`: that crossing's chainage). */
function reported(opt: AutoProfileOptions, r: AutoProfileResult, why: ReadonlyMap<number, number>): AutoProfileResult {
  const prof = buildProfile(r.vpis, opt.crestAt ?? opt.minCrest, opt.sagAt ?? opt.minSag);
  const pinViolations = gradePinViolations(opt.pins ?? [], prof, opt.maxGradient)
    .map(v => why.has(v.pin.index) && v.pin.reason === 'search' ? clearancePinViolation(v, why.get(v.pin.index)!) : v);
  return { ...r, feasible: r.feasible && !pinViolations.length, pinViolations, lineOk: usableLine(r) };
}

/** Of the CULPRIT_TRIES pins nearest a crossing a line through the pins misses, the first without which Auto's line
 * clears it is the one in the way (a pin nearer it may hold the line where it clears: QA P2 re-check), else the
 * nearest. */
const CULPRIT_TRIES = 3;

/**
 * The crossings (their own clearances, `pinBounds`, at their stations `mine`) a line through the pins misses that Auto's
 * own line without pins (`own()`) keeps, each put down to a pin `eligible` (`blamed` above), pin index → the
 * crossings' chainages (one per PIN_FIX_NEAR). `without(k)`: Auto's line with the pins but pin k.
 */
function blameMisses(s: ArrayLike<number>, g: ArrayLike<number>, opt: AutoProfileOptions, mine: readonly number[], own: () => readonly VPI[],
  without: (k: number) => readonly VPI[], eligible: (k: number) => boolean): Map<number, number[]> {
  const out = new Map<number, number[]>(), pins = opt.pins ?? [];
  if (!mine.length) return out;
  const ownMissed = new Set(missedClearances(s, g, opt, own()));
  const { clearanceS } = opt.pinBounds ?? opt;
  const missedWithout = new Map<number, Set<number>>();
  for (const i of mine) {
    if (ownMissed.has(i)) continue;
    const x = clearanceS && !Number.isNaN(clearanceS[i]) ? clearanceS[i] : s[i];
    const near = pins.map((_, k) => k).filter(eligible).sort((a, b) => Math.abs(pins[a].s - x) - Math.abs(pins[b].s - x) || a - b);
    if (!near.length) continue;
    let k = near[0];
    if (near.length > 1) for (const c of near.slice(0, CULPRIT_TRIES)) {
      let m = missedWithout.get(c);
      if (!m) missedWithout.set(c, m = new Set(missedClearances(s, g, opt, without(c))));
      if (!m.has(i)) { k = c; break; }
    }
    const list = out.get(k) ?? [];
    if (!list.some(y => Math.abs(y - x) <= PIN_FIX_NEAR)) list.push(x);
    out.set(k, list);
  }
  return out;
}

/**
 * The player's pins `r` (the search's result) leaves out (out of the slopes' reach, or no line met them: the line is
 * then Auto's own without them) or meets only by missing a crossing Auto's own line (no pins) clears (`blameMisses`):
 * honoured by Auto's own line without them, re-solved only within STEEP_WINDOWS[i] m either side of each (`spliced`:
 * the same knots, its heights and grades kept at the ends), so the far line stays Auto's own exactly (QA sweep 3: a pin
 * left out, or met by a far-reaching line, is no answer; the owner: honour it, say what it costs, keep it local; a line
 * through the pin and Auto's heights there as two more pins still moved the Královec railway 4 m at km 12, a line at
 * its limit). Within them the search's line through the pins, as steep as the way from Auto's line at the ends to the
 * pins needs (`steep`, plus STEEP_SLACK for its curves, never beyond STEEP_MAX times the norm), missing the crossings it
 * must. Pins more than twice the widest window apart are honoured each on their own (one out of reach does not take the
 * others with it), the first window that finds a line kept; a pin with none is left out (`r`'s problem at it, or out of
 * reach for the crossing it misses), said at it.
 */
function honour(s: ArrayLike<number>, g: ArrayLike<number>, opt: AutoProfileOptions, r: AutoProfileResult): AutoProfileResult {
  const pins = opt.pins ?? [], L = s[s.length - 1];
  if (!pins.length) return r;
  const active = (k: number) => pins[k].s >= 0 && pins[k].s <= L && Number.isFinite(pins[k].z);
  const out = new Set((r.pinViolations ?? []).filter(v => v.pin.reason === 'gradient-envelope' || v.pin.reason === 'search').map(v => v.pin.index));
  if (!usableLine(r)) return r;
  // (a pin met by missing a crossing Auto's own line clears)
  let conflict = new Map<number, number[]>();
  let own: AutoProfileResult | undefined;
  const ownLine = () => (own ??= autoProfile(s, g, { ...opt, pins: [] })).vpis;
  const bounds = opt.pinBounds ?? opt;
  if (bounds.minH || bounds.maxH || bounds.eitherH) {
    const mine = missedClearances(s, g, opt, r.vpis);
    if (mine.length) conflict = blameMisses(s, g, opt, mine, ownLine,
      k => autoProfile(s, g, { ...opt, pins: pins.filter((_, j) => j !== k) }).vpis, k => active(k) && !out.has(k));
  }
  const treated = [...new Set([...out, ...conflict.keys()])].filter(active).sort((a, b) => pins[a].s - pins[b].s);
  if (!treated.length) return r;
  // Auto's own line without them (with the other pins)
  const rest = pins.filter((_, k) => active(k) && !treated.includes(k));
  const ref = !conflict.size ? r : !rest.length ? (ownLine(), own!) : autoProfile(s, g, { ...opt, pins: rest });
  if (!usableLine(ref)) return r;
  const refP = buildProfile(ref.vpis, opt.crestAt ?? opt.minCrest, opt.sagAt ?? opt.minSag);
  const norm = (a: number, b: number) => opt.gradeAt ? opt.gradeAt(a, b) : opt.maxGradient;
  /** the spans and steep stretches of the pins `group` with windows of W m, null if a pin is out of STEEP_MAX's reach */
  const plan = (group: readonly number[], W: number) => {
    const spans: [number, number][] = [];
    for (const k of group) {
      const a = Math.max(0, pins[k].s - W), b = Math.min(L, pins[k].s + W), last = spans[spans.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b); else spans.push([a, b]);
    }
    const windows: SteepWindow[] = [];
    for (const [a, b] of spans) {
      // from Auto's own line at its ends, through the player's pins within it
      const inside = pins.map((p, k) => ({ ...p, k })).filter(p => active(p.k) && p.s > a && p.s < b && (group.includes(p.k) || !treated.includes(p.k))).sort((p, q) => p.s - q.s);
      const nodes = [{ s: a, z: elevationAt(refP, a), k: -1 }, ...inside, { s: b, z: elevationAt(refP, b), k: -1 }];
      for (let q = 0; q + 1 < nodes.length; q++) {
        const u = nodes[q], v = nodes[q + 1], k = group.includes(v.k) ? v.k : group.includes(u.k) ? u.k : -1;
        if (k < 0) continue;
        // (every side of the pin, also one within the norm: its curve at the pin takes height; STEEP_PENALTY keeps the
        // line no steeper than it must be)
        const lim = norm(u.s, v.s), need = v.s - u.s < 1e-9 ? Infinity : Math.abs(v.z - u.z) / (v.s - u.s);
        if (!(need <= STEEP_MAX * lim)) return null;
        windows.push({ s0: u.s, s1: v.s, grade: Math.min(STEEP_MAX * lim, Math.max(need, lim) + STEEP_SLACK * lim), pin: { ...pins[k] } });
      }
    }
    return { spans, windows };
  };
  // groups that no window joins
  const reach = 2 * STEEP_WINDOWS[STEEP_WINDOWS.length - 1], groups: number[][] = [];
  for (const k of treated) {
    const last = groups[groups.length - 1];
    if (last && pins[k].s - pins[last[last.length - 1]].s <= reach) last.push(k); else groups.push([k]);
  }
  const met: number[] = [], spans: [number, number][] = [], windows: SteepWindow[] = [];
  let only: AutoProfileResult | null = null;
  for (const group of groups) for (const W of STEEP_WINDOWS) {
    const p = plan(group, W);
    if (!p) continue;
    const t = spliced(s, g, opt, [...rest, ...group.map(k => pins[k])], ref, { pins: group.map(k => pins[k]), spans: p.spans, left: [] }, p.windows);
    if (!t) continue;
    met.push(...group); spans.push(...p.spans); windows.push(...p.windows); only = t;
    break;
  }
  if (!met.length) return r;
  const left = treated.filter(k => !met.includes(k)).map(k => ({ ...pins[k] }));
  const h: Honoured = { pins: met.map(k => ({ ...pins[k] })), spans, left };
  // (several groups: all their spans in one line, each re-solved as on its own)
  const line = groups.length === 1 ? only! : spliced(s, g, opt, [...rest, ...met.map(k => pins[k])], ref, h, windows);
  if (!line) return r;
  const why = new Map([...conflict].filter(([k]) => !met.includes(k)).map(([k, at]) => [k, at[0]]));
  return reported(opt, { ...line, honoured: { ...h, left } }, why);
}

/**
 * The crossings a line through the pins misses (their own clearances, `pinBounds`) that Auto's own line without pins
 * (`own`) keeps, each put down to a pin (`blameMisses`): pin index → the crossings' chainages. The finished (rounded)
 * line at each clearance's own chainage. `without(k)`: Auto's line with the pins but pin k.
 */
export function pinClearanceBlame(s: ArrayLike<number>, g: ArrayLike<number>, opt: AutoProfileOptions, vpis: readonly VPI[], own: () => readonly VPI[],
  without: (k: number) => readonly VPI[]): Map<number, number[]> {
  const pins = opt.pins ?? [], L = s[s.length - 1];
  if (!pins.length) return new Map();
  return blameMisses(s, g, opt, missedClearances(s, g, opt, vpis), own, without, k => pins[k].s >= 0 && pins[k].s <= L && Number.isFinite(pins[k].z));
}

/**
 * Auto's grade line within the norm (a suggestion's check, `pinStrict`): the pins it can meet only by missing a
 * clearance its own line keeps (a stream it would leave in an open cut, a railway it would cross at grade) left out
 * like a pin out of the slopes' reach, the line Auto's own and the pin saying why. Only the crossings' own clearances
 * count (`pinBounds`). Each new miss is put down to the pin nearest to it; without pins, or where the pinned line
 * misses nothing new, it is the search's result as it was.
 */
function strictProfile(s: ArrayLike<number>, g: ArrayLike<number>, opt: AutoProfileOptions): AutoProfileResult {
  const r = searchProfile(s, g, opt);
  const pins = opt.pins ?? [], L = s[s.length - 1];
  const active = (p: GradePin) => p.s >= 0 && p.s <= L && Number.isFinite(p.z);
  const bounds = opt.pinBounds ?? opt;
  if (!pins.some(active) || !(bounds.minH || bounds.maxH || bounds.eitherH)) return r;
  const mine = missedClearances(s, g, opt, r.vpis);
  if (!mine.length) return r;
  const ownLine = autoProfile(s, g, { ...opt, pins: [] }), own = new Set(missedClearances(s, g, opt, ownLine.vpis));
  const fresh = mine.filter(i => !own.has(i));
  if (!fresh.length) return r;
  const out = new Set(r.pinViolations?.map(v => v.pin.index) ?? []);
  const blamed = new Map<number, number>();
  for (const i of fresh) {
    const x = opt.clearanceS && !Number.isNaN(opt.clearanceS[i]) ? opt.clearanceS[i] : s[i];
    let best = -1;
    pins.forEach((p, k) => {
      if (out.has(k) || !active(p)) return;
      if (best < 0 || Math.abs(p.s - x) < Math.abs(pins[best].s - x)) best = k;
    });
    if (best >= 0 && !blamed.has(best)) blamed.set(best, x);
  }
  if (!blamed.size) return r;
  const keptOf = () => pins.flatMap((_, k) => !blamed.has(k) && !out.has(k) ? [k] : []);
  let keptIndex = keptOf();
  let line = keptIndex.length ? autoProfile(s, g, { ...opt, pins: keptIndex.map(k => pins[k]) }) : ownLine;
  // (the pins the kept ones' own line had to leave out for a clearance too)
  for (const v of line.pinViolations ?? []) if (v.pin.clearanceAt !== undefined) blamed.set(keptIndex[v.pin.index], v.pin.clearanceAt);
  // (the nearest pin is not always the one in the way: with several left out, each is tried back on its own, kept
  // where the line through it and the rest meets them all and misses nothing new)
  if (blamed.size > 1) for (const k of [...blamed.keys()]) {
    const trial = autoProfile(s, g, { ...opt, pins: pins.filter((_, j) => (j === k || !blamed.has(j)) && !out.has(j)) });
    if (trial.pinViolations?.length || missedClearances(s, g, opt, trial.vpis).some(i => !own.has(i))) continue;
    blamed.delete(k); line = trial; keptIndex = keptOf();
    break;
  }
  const crestR: RadiusLimit = opt.crestAt ?? opt.minCrest, sagR: RadiusLimit = opt.sagAt ?? opt.minSag;
  const pinViolations = gradePinViolations(pins, buildProfile(line.vpis, crestR, sagR), opt.maxGradient).map(v => {
    const at = blamed.get(v.pin.index);
    return at === undefined || v.pin.reason !== 'search' ? v : clearancePinViolation(v, at);
  });
  return { ...line, feasible: line.feasible && !pinViolations.length, pinViolations, lineOk: usableLine(line) };
}

function searchProfile(s: ArrayLike<number>, g: ArrayLike<number>, opt: AutoProfileOptions): AutoProfileResult {
  const n = s.length;
  const L = s[n - 1];
  const zA = opt.endpointElevations?.a ?? g[0], zB = opt.endpointElevations?.b ?? g[n - 1];
  if (!Number.isFinite(zA) || !Number.isFinite(zB)) throw new Error('Non-finite endpoint elevation');
  const straight: VPI[] = [{ s: 0, z: zA, r: null }, { s: L, z: zB, r: null }];
  const straightOk = Math.abs(zB - zA) <= opt.maxGradient * L + 1e-9;
  // Keep the no-pin path (including empty/inactive saved pins) numerically unchanged.
  const pins = opt.pins?.filter((p) => !Number.isFinite(p.s) || !Number.isFinite(p.z) || (p.s >= 0 && p.s <= L));
  const hasPins = !!pins?.length;
  const crestR: RadiusLimit = opt.crestAt ?? opt.minCrest, sagR: RadiusLimit = opt.sagAt ?? opt.minSag;
  // Steep stretches to the player's pins (`steep`, those of pins on the route): the grade limit there is theirs.
  const steepW = hasPins && !opt.pinStrict ? (opt.steep ?? []).filter(w => pins!.some(p => p.s === w.pin.s && p.z === w.pin.z)) : [];
  const steepAt = steepW.length ? (a: number, b: number) => {
    let x = 0;
    for (const w of steepW) if (b > w.s0 && a < w.s1 && w.grade > x) x = w.grade;
    return x;
  } : null;
  const gradeL: GradeLimit = steepAt ? (a, b) => Math.max(opt.gradeAt ? opt.gradeAt(a, b) : opt.maxGradient, steepAt(a, b)) : opt.gradeAt ?? opt.maxGradient;
  /** the steepest grade anywhere, for the pins' slopes' reach */
  const gEnv = Math.max(opt.maxGradient, ...steepW.map(w => w.grade));
  const pinChecks = (vpis: VPI[]) => gradePinViolations(opt.pins ?? [], buildProfile(vpis, crestR, sagR), gEnv);
  const finish = (r: AutoProfileResult): AutoProfileResult => {
    if (!hasPins) return r;
    const pinViolations = pinChecks(r.vpis);
    return { ...r, feasible: r.feasible && pinViolations.length === 0, pinViolations };
  };
  /** Auto's line without the pins it cannot meet (`kept`: the rest), each pin reported against it. Neither
   * the straight line from A to B nor any other far-reaching stand-in: what an unreachable pin changes is
   * its own problem, not the whole route (QA sweep 3: a pin 4 m over the climb at the Královec portal
   * used to move the line 25 m at km 7). */
  const without = (kept: GradePin[]): AutoProfileResult => {
    const r = autoProfile(s, g, { ...opt, pins: kept });
    // (a kept pin its own line left out for a crossing keeps that reason)
    const keptIndex = kept.map(p => (opt.pins ?? []).indexOf(p)), why = new Map<number, number>();
    for (const v of r.pinViolations ?? []) if (v.pin.clearanceAt !== undefined) why.set(keptIndex[v.pin.index], v.pin.clearanceAt);
    const pinViolations = pinChecks(r.vpis).map(v => why.has(v.pin.index) && v.pin.reason === 'search' ? clearancePinViolation(v, why.get(v.pin.index)!) : v);
    return { ...r, feasible: r.feasible && !pinViolations.length, pinViolations, lineOk: usableLine(r) };
  };
  if (hasPins && !opt.splice) {
    const out = new Set(pinChecks(straight).filter((v) => v.pin.reason !== 'search').map((v) => v.pin.index));
    if (out.size) return without((opt.pins ?? []).filter((_, i) => !out.has(i)));
  }
  const spacing = opt.knotSpacing ?? 250;
  // A gentle gradient limit (track: 12.5 ‰ × 250 m = 3.1 m a knot, 2 m on the 1 m grid after the end
  // reserve) leaves the 2 m and 1 m grids too few steps to rise over a crossing: search a 0.5 m grid.
  // Roads and motorways (≥ 4 %: ≥ 10 m a knot) keep the 2 m / 1 m grids.
  const gentle = opt.maxGradient * spacing < 3 * COARSE_GRID;
  const coarseGrid = gentle ? FINE_GRID / 2 : COARSE_GRID, fineGrid = gentle ? FINE_GRID / 2 : FINE_GRID;
  if (L < 2 * spacing * 0.8 && (!hasPins || pinChecks(straight).length === 0)) {
    return finish({ vpis: straight, feasible: straightOk, cost: Infinity });
  }
  const ds = n > 1 ? s[1] - s[0] : L;
  // Knots: evenly over the route, or (blocks) evenly within each block, so a block's knots, cost
  // samples and material value depend on that block alone.
  const anchored = !!opt.blocks;
  const bounds = anchored ? blockEnds(opt.blocks!, L) : [0, L];
  const nb = bounds.length - 1;
  const knotList: number[] = [], knotBlock: number[] = [];
  let nK: number, D: number;
  if (!anchored) {
    nK = Math.max(2, Math.round(L / spacing));
    D = L / nK;
    for (let k = 0; k <= nK; k++) { knotList.push(k * D); knotBlock.push(0); }
  } else {
    D = NaN;
    for (let b = 0; b < nb; b++) {
      const m = knotCount(bounds[b + 1] - bounds[b], spacing, opt.maxGradient, b === nb - 1, [coarseGrid, fineGrid]), w = (bounds[b + 1] - bounds[b]) / m;
      for (let i = 0; i < m; i++) { knotList.push(bounds[b] + i * w); knotBlock.push(b); }
    }
    knotList.push(L); knotBlock.push(nb - 1);
    nK = knotList.length - 1;
  }
  /** knot index of each block's start (and of B) */
  const boundaryKnot: number[] = [];
  for (let k = 0; k <= nK; k++) if (k === 0 || k === nK || knotBlock[k] !== knotBlock[k - 1]) boundaryKnot.push(k);
  /** B's height off the grid is corrected over the knots after this one */
  const corrFrom = anchored ? boundaryKnot[nb - 1] : 0, corrSpan = L - knotList[corrFrom];
  const knotS = Float64Array.from(knotList);
  /** the ground at knot k (where a line may enter or leave a tunnel) */
  const groundAtKnot = (k: number) => {
    const x = knotS[k];
    if (opt.groundAt) return opt.groundAt(x);
    const f = Math.min(n - 1 - 1e-9, Math.max(0, x / ds)), fi = Math.floor(f);
    return fi + 1 < n ? g[fi] + (g[fi + 1] - g[fi]) * (f - fi) : g[fi];
  };
  /** interval k's length and block */
  const Dk = (k: number) => anchored ? knotS[k + 1] - knotS[k] : D;
  const blockOf = (k: number) => knotBlock[k];
  // A curve is at most D long. In a knot's half-cell only that knot's curve can contribute.
  // Its exact elevation is known when both incoming/outgoing grades are selected in the DP.
  const nearestKnot = (x: number) => {
    if (!anchored) return Math.min(nK, Math.round(x / D));
    let k = 0;
    while (k < nK && Math.abs(knotS[k + 1] - x) <= Math.abs(knotS[k] - x)) k++;
    return k;
  };
  const knotPins: GradePin[][] | null = hasPins ? Array.from({ length: nK + 1 }, () => []) : null;
  if (knotPins) for (const p of pins!) knotPins[nearestKnot(p.s)].push(p);
  const stride = Math.max(1, Math.round(DP_STATION_STEP / ds));
  const classes = opt.costClassCount ?? 1;
  const lutMax = Math.round((2 * H_MAX) / H_STEP);
  const pad = opt.pad ?? 25;
  const penalty = opt.vpiPenalty ?? 1e6;
  // clearance stations per interval (always evaluated, regardless of the DP station stride)
  const clrStart = new Int32Array(nK + 1);
  const clrIdx: number[] = [];

  // interval station ranges: stations with s in (s_k, s_{k+1}]
  const first = new Int32Array(nK), last = new Int32Array(nK);
  {
    let i = 1;
    for (let k = 0; k < nK; k++) {
      first[k] = i;
      const end = (anchored ? knotS[k + 1] : (k + 1) * D) + 1e-6;
      while (i < n && s[i] <= end) i++;
      last[k] = i - 1;
    }
    last[nK - 1] = n - 1;
  }
  // Cost samples: chainage, ground, weight, LUT block (block × class × kind).
  // Preserve ~20 m quadrature within each cost category, splitting a block at geology/stream
  // changes. Sparse streams must not double the work on the entire route or disappear between
  // samples. Manual ranges retain individual samples, with exactly the same total weight.
  const costStart = new Int32Array(nK + 1), costS: number[] = [], costG: number[] = [], costWeight: number[] = [], costOffset: number[] = [];
  const kinds = opt.structureKind, costClasses = opt.costClass;
  const perBlock = classes * PROFILE_KINDS;
  /** interval of a chainage */
  const intervalOf = (x: number) => {
    if (!anchored) return Math.max(0, Math.min(nK - 1, Math.ceil(x / D - 1e-9) - 1));
    let lo = 0, hi = nK - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (knotS[mid + 1] < x - 1e-6) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const pointsIn: { s: number; g: number; cls: number }[][] = Array.from({ length: nK }, () => []);
  if (anchored) for (const p of opt.points ?? []) pointsIn[intervalOf(p.s)].push(p);
  for (let k = 0; k < nK; k++) {
    costStart[k] = costS.length;
    if (!anchored) {
      for (let i = first[k]; i <= last[k]; i += stride) {
        const blockStart = costS.length;
        for (let j = i; j < Math.min(i + stride, last[k] + 1); j++) {
          const kind = kinds?.[j] ?? -1, cls = costClasses?.[j] ?? 0;
          const off = cls * PROFILE_KINDS + kind + 1;
          let same = -1;
          if (kind < 0) for (let q = blockStart; q < costS.length; q++) if (costOffset[q] === off) { same = q; break; }
          if (same >= 0) costWeight[same] += ds;
          else { costS.push(s[j]); costG.push(g[j]); costWeight.push(ds); costOffset.push(off); }
        }
      }
      continue;
    }
    // Anchored: samples evenly within the interval, each with the ground and class at its own place
    // (else interpolated / the stations it covers); a point class (a stream) at its own place.
    const s0 = knotS[k], s1 = knotS[k + 1], m = Math.max(1, Math.round((s1 - s0) / DP_STATION_STEP)), w = (s1 - s0) / m;
    const base = blockOf(k) * perBlock;
    for (const p of pointsIn[k]) {
      const kind = kinds?.[Math.min(n - 1, Math.round(p.s / ds))] ?? -1;
      costS.push(p.s); costG.push(p.g); costWeight.push(opt.pointWeight ?? ds); costOffset.push(base + p.cls * PROFILE_KINDS + kind + 1);
    }
    for (let j = 0; j < m; j++) {
      const x = s0 + (j + 0.5) * w;
      const f = Math.min(n - 1 - 1e-9, Math.max(0, x / ds)), fi = Math.floor(f);
      const gx = opt.groundAt ? opt.groundAt(x) : fi + 1 < n ? g[fi] + (g[fi + 1] - g[fi]) * (f - fi) : g[fi];
      const near = Math.min(n - 1, Math.round(x / ds)), at = opt.classAt?.(x) ?? -1;
      if (at >= 0) {
        costS.push(x); costG.push(gx); costWeight.push(w); costOffset.push(base + at * PROFILE_KINDS + (kinds?.[near] ?? -1) + 1);
        continue;
      }
      const i0 = Math.max(0, Math.ceil((x - w / 2) / ds - 1e-9)), i1 = Math.min(n - 1, Math.ceil((x + w / 2) / ds - 1e-9) - 1);
      const lo = Math.min(i0, i1), count = Math.max(1, i1 - i0 + 1);
      const blockStart = costS.length;
      for (let i = lo; i <= Math.max(lo, i1); i++) {
        const kind = kinds?.[i] ?? -1, cls = costClasses?.[i] ?? 0;
        const off = base + cls * PROFILE_KINDS + kind + 1;
        let same = -1;
        for (let q = blockStart; q < costS.length; q++) if (costOffset[q] === off && costS[q] === x) { same = q; break; }
        if (same >= 0) costWeight[same] += w / count;
        else { costS.push(x); costG.push(gx); costWeight.push(w / count); costOffset.push(off); }
      }
    }
  }
  costStart[nK] = costS.length;
  // typed copies for the DP's inner loop
  const cS = Float64Array.from(costS), cG = Float64Array.from(costG), cW = Float64Array.from(costWeight), cO = Int32Array.from(costOffset);
  const clrX: number[] = [];
  const hasClearance = (i: number) => (opt.minH && opt.minH[i] > -Infinity) || (opt.maxH && opt.maxH[i] < Infinity) || opt.eitherH?.above[i]! > -Infinity;
  if (anchored && opt.clearanceS) {
    // each by the chainage it applies at (its interval too)
    const byK: number[][] = Array.from({ length: nK }, () => []);
    for (let i = 0; i < n; i++) if (hasClearance(i)) byK[intervalOf(Number.isNaN(opt.clearanceS[i]) ? s[i] : opt.clearanceS[i])].push(i);
    for (let k = 0; k < nK; k++) {
      clrStart[k] = clrIdx.length;
      for (const i of byK[k]) { clrIdx.push(i); clrX.push(Number.isNaN(opt.clearanceS[i]) ? s[i] : opt.clearanceS[i]); }
    }
  } else for (let k = 0; k < nK; k++) {
    clrStart[k] = clrIdx.length;
    for (let i = first[k]; i <= last[k]; i++) if (hasClearance(i)) { clrIdx.push(i); clrX.push(s[i]); }
  }
  clrStart[nK] = clrIdx.length;
  const minH = opt.minH, maxH = opt.maxH, clearancePenalty = opt.clearancePenalty ?? CLEARANCE_PENALTY, penaltyAt = opt.clearancePenaltyAt;
  // ground envelope per knot (min/max ground within ±3 knot spacings)
  const gmin = new Float64Array(nK + 1), gmaxEnv = new Float64Array(nK + 1);
  for (let k = 0; k <= nK; k++) {
    let mn = Infinity, mx = -Infinity;
    if (anchored) {
      // from the even cost samples (and the ends), which do not move with the stations
      const sk = knotS[k], win = 3 * Dk(Math.min(k, nK - 1));
      for (let q = costStart[Math.max(0, k - 4)]; q < costStart[Math.min(nK, k + 4)]; q++) {
        if (Math.abs(costS[q] - sk) > win) continue;
        const v = costG[q]; if (v < mn) mn = v; if (v > mx) mx = v;
      }
      for (const v of k <= 3 ? [g[0]] : k >= nK - 3 ? [g[n - 1]] : []) { if (v < mn) mn = v; if (v > mx) mx = v; }
    } else {
      const sk = k * D, win = 3 * D;
      const i0 = Math.max(0, Math.floor((sk - win) / ds)), i1 = Math.min(n - 1, Math.ceil((sk + win) / ds));
      for (let i = i0; i <= i1; i++) { const v = g[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    gmin[k] = mn; gmaxEnv[k] = mx;
  }

  const ok = (r: Solved | null): r is Solved => !!r && profileOk(r.vpis, gradeL, crestR, sagR);
  const okAll = (r: Solved | null): r is Solved => ok(r) && (!hasPins || pinChecks(r.vpis).length === 0);
  const ALL = { ka: 0, kb: nK, fixed: new Map([[0, zA], [nK, zB]]) };
  type Range = typeof ALL;
  /** Whether a line misses a clearance it is asked for within range `r` (as the DP judges it: the
   * polyline at the clearance's own chainage, CLEARANCE_MARGIN inside the bound). */
  const hard = opt.hardClearance;
  const missesClearance = (x: Solved, r: Range, onlyHard = false) => {
    for (let k = r.ka; k < r.kb; k++) for (let q = clrStart[k]; q < clrStart[k + 1]; q++) {
      if (onlyHard && !hard![clrIdx[q]]) continue;
      const i = clrIdx[q], h = x.z[k] + (x.z[k + 1] - x.z[k]) * (clrX[q] - knotS[k]) / Dk(k) - g[i];
      if ((minH && h < minH[i] + CLEARANCE_MARGIN) || (maxH && h > maxH[i] - CLEARANCE_MARGIN)
        || (opt.eitherH && h < opt.eitherH.above[i] + CLEARANCE_MARGIN && h > opt.eitherH.below[i] - CLEARANCE_MARGIN)) return true;
    }
    return false;
  };
  /** Whether a line misses a clearance the law demands (`hardClearance`) within range `r`. */
  const missesHard = (x: Solved, r: Range) => !!hard && missesClearance(x, r, true);
  const hardIn = (r: Range) => {
    if (!hard) return false;
    for (let q = clrStart[r.ka]; q < clrStart[r.kb]; q++) if (hard[clrIdx[q]]) return true;
    return false;
  };
  /**
   * Whether every line a pass on grid `u` within `padM` of the ground envelope could find over range `r` misses a
   * clearance the law demands (`hardClearance`): the pass's own height range at each knot (solveIn's) narrowed by
   * its grade steps, with no curves; so a pass it rules out would find no line meeting it.
   */
  const surelyMissesHard = (lut: CostLut, r: Range, u: number, padM: number) => {
    if (!hard || hasPins) return false;
    let miss = false;
    solveIn(lut, opt.maxGradient, u, padM, null, r, 1, false, (zlo, zhi, dzMaxK, corrAt) => {
      const n = r.kb - r.ka + 1, lo = new Float64Array(n), hi = new Float64Array(n);
      for (let k = r.ka; k <= r.kb; k++) { lo[k - r.ka] = zlo[k]; hi[k - r.ka] = zhi[k]; }
      for (let j = 1; j < n; j++) { lo[j] = Math.max(lo[j], lo[j - 1] - dzMaxK[r.ka + j - 1]); hi[j] = Math.min(hi[j], hi[j - 1] + dzMaxK[r.ka + j - 1]); }
      for (let j = n - 2; j >= 0; j--) { lo[j] = Math.max(lo[j], lo[j + 1] - dzMaxK[r.ka + j]); hi[j] = Math.min(hi[j], hi[j + 1] + dzMaxK[r.ka + j]); }
      for (let j = 0; j < n; j++) if (!(lo[j] <= hi[j])) return;
      for (let k = r.ka; k < r.kb && !miss; k++) {
        const j = k - r.ka, c0 = corrAt(k), c1 = corrAt(k + 1);
        const la = zA + lo[j] * u + c0, ha = zA + hi[j] * u + c0, lb = zA + lo[j + 1] * u + c1, hb = zA + hi[j + 1] * u + c1;
        for (let q = clrStart[k]; q < clrStart[k + 1] && !miss; q++) {
          const i = clrIdx[q];
          if (!hard[i]) continue;
          const t = (clrX[q] - knotS[k]) / Dk(k);
          const hLo = (1 - t) * (t <= 1 ? la : ha) + t * (t >= 0 ? lb : hb) - g[i] - 1e-6;
          const hHi = (1 - t) * (t <= 1 ? ha : la) + t * (t >= 0 ? hb : lb) - g[i] + 1e-6;
          if ((minH && hHi < minH[i] + CLEARANCE_MARGIN) || (maxH && hLo > maxH[i] - CLEARANCE_MARGIN)
            || (opt.eitherH && hHi < opt.eitherH.above[i] + CLEARANCE_MARGIN && hLo > opt.eitherH.below[i] - CLEARANCE_MARGIN)) miss = true;
        }
      }
    });
    return miss;
  };
  /**
   * coarse pass: normal band, then a wide one (deep tunnels / high viaducts); if the coarse grid finds
   * nothing compliant (its grade steps are twice as large, which matters near the gradient limit),
   * the fine grid over the whole band. On a gentle gradient (a railway: kilometres to climb out of a
   * valley, so its line leaves the ground's band more often) a line of the normal band that misses a
   * clearance is weighed against the wide band's: the band only bounds the search, it must not decide
   * that a stream is left in a cutting where a deeper tunnel clears it for less. (Roads keep the normal
   * band: there the wide one also lands on the other side of near-ties, e.g. D35 stage 1 −1.1 bn and the
   * whole D35 +0.4 bn, a search question of its own. Exception, model 45: a range holding a protected area's hard
   * clearance that the normal band misses takes the wide band too.)
   */
  const coarse = (lut: CostLut, r: Range = ALL): Solved | null => {
    // Half-metre fallback only for pins: a narrow target can fall between coarse-grid paths.
    const passes = [[coarseGrid, pad], [coarseGrid, pad * 5], [fineGrid, pad]];
    if (hasPins) passes.push([0.5, pad]);
    const check = r === ALL ? okAll : ok;
    // Where the law demands a clearance in the range (a protected area, `hardClearance`), a line that misses it is
    // only a fallback while a wider band or the finer grid may meet it (its grade steps are half as large, which
    // matters near a grade limit).
    // (a pass whose band surely misses it is solved only if it is that fallback)
    const lawful = hardIn(r);
    let fallback: Solved | null = null, skipped = -1;
    for (let p = 0; p < passes.length; p++) {
      const [u, pd] = passes[p];
      if (lawful && fallback === null && skipped < 0 && surelyMissesHard(lut, r, u, pd)) { skipped = p; continue; }
      const x = solve(lut, opt.maxGradient, u, pd, null, r);
      if (!check(x)) continue;
      if (lawful && missesHard(x, r)) { fallback ??= x; continue; }
      // A line with a tunnel the law forbids (over 500 m, steeper than 5 %: solve) that the normal band holds: the
      // wide band's line, where it has none (a tunnel kept to the limit may run deeper than the band; D35 road)
      if (!gentle && pd === pad && steepLongTunnel(x, r)) {
        const wide = solve(lut, opt.maxGradient, u, pad * 5, null, r);
        if (check(wide) && !(lawful && missesHard(wide, r)) && !steepLongTunnel(wide, r)) return wide;
      }
      if (gentle && pd === pad && missesClearance(x, r)) {
        const wide = solve(lut, opt.maxGradient, u, pad * 5, null, r);
        if (check(wide) && wide.cost < x.cost) return wide;
      }
      return x;
    }
    if (skipped >= 0) {
      const x = solve(lut, opt.maxGradient, passes[skipped][0], passes[skipped][1], null, r);
      if (check(x)) return x;
    }
    return fallback;
  };
  /** fine pass around a coarse line; keeps the coarse line if the fine one is not compliant */
  const refine = (lut: CostLut, c: Solved, r: Range = ALL): Solved => {
    const f = solve(lut, opt.maxGradient, fineGrid, FINE_BAND, c.z, r);
    return (r === ALL ? okAll : ok)(f) ? f : c;
  };
  /** last resort when no compliant line was found: relaxed gradients, reported as not feasible */
  const relaxed = (lut: CostLut): AutoProfileResult => {
    // Pins never enable a relaxed-gradient search or a posthoc edited/manual profile.
    if (hasPins) return without([]);
    if (straightOk) return { vpis: straight, feasible: true, cost: Infinity };
    for (const [gm, u] of [[opt.maxGradient * 1.5, 1], [opt.maxGradient * 2.5, 2]]) {
      const r = solve(lut, gm, u, pad, null, ALL);
      if (r) return { vpis: r.vpis, cost: r.cost, feasible: ok(r) };
    }
    return { vpis: straight, feasible: false, cost: Infinity };
  };
  const costsAt = (vals: readonly number[]) => vals.map(x => bal ? bal.costFor(x) : opt.costPerM);
  const bal = opt.balance;

  /**
   * Mass-balance search over a range: one coarse pass fixes the corridor, then the fine pass is
   * repeated within it for a few material values. The balance grows with the value (more cut, less
   * fill), so the root is bracketed and interpolated. (The coarse line's own balance is no proxy for
   * the fine one's.) `valuesFor` turns the range's value into one per block.
   */
  const searchBalance = (r: Range, valuesFor: (v: number) => number[], balanceOf: (vpis: VPI[], v: number) => number, tolerance: number):
    { line: Solved; v: number; b: number } | { fail: CostLut; v: number } => {
    const clampV = (v: number) => Math.max(bal!.lo, Math.min(bal!.hi, v));
    let v = clampV(bal!.start);
    let lut = buildLut(costsAt(valuesFor(v)), classes);
    const c = coarse(lut, r);
    if (!c) return { fail: lut, v };
    let best = refine(lut, c, r);
    let bestV = v, bestB = balanceOf(best.vpis, v);
    let neg: [number, number] | null = bestB < 0 ? [v, bestB] : null; // [value, balance] with a deficit
    let pos: [number, number] | null = bestB >= 0 ? [v, bestB] : null; // … with a surplus
    let step = (bal!.hi - bal!.lo) / 12;
    for (let it = 1; it < BALANCE_EVALS && Math.abs(bestB) > tolerance; it++) {
      let next: number;
      if (neg && pos) {
        // regula falsi, kept away from the ends of the bracket
        const t = Math.max(0.15, Math.min(0.85, -neg[1] / (pos[1] - neg[1])));
        next = neg[0] + (pos[0] - neg[0]) * t;
      } else {
        next = clampV(neg ? neg[0] + step : pos![0] - step);
        step *= 2;
      }
      if (Math.abs(next - v) < 1e-6) break;
      v = next;
      lut = buildLut(costsAt(valuesFor(v)), classes);
      const f = solve(lut, opt.maxGradient, fineGrid, FINE_BAND, c.z, r);
      if (!(r === ALL ? okAll : ok)(f)) break;
      const b = balanceOf(f.vpis, v);
      if (b < 0) { if (!neg || v > neg[0]) neg = [v, b]; } else if (!pos || v < pos[0]) pos = [v, b];
      if (Math.abs(b) < Math.abs(bestB)) { best = f; bestV = v; bestB = b; }
    }
    return { line: best, v: bestV, b: bestB };
  };

  /**
   * The line a balance search would have kept at value(s) `vals` (a retry that keeps the values found):
   * the corridor at the starting value, the fine pass at the given ones.
   */
  const fixedSolve = (r: Range, vals: readonly number[]): Solved | null => {
    const start = buildLut(costsAt(vals.map(() => bal ? bal.start : 0)), classes);
    const c = coarse(start, r);
    if (!c) return null;
    if (!bal || vals.every(x => x === bal.start)) return refine(start, c, r);
    const f = solve(buildLut(costsAt(vals), classes), opt.maxGradient, fineGrid, FINE_BAND, c.z, r);
    return (r === ALL ? okAll : ok)(f) ? f : refine(start, c, r);
  };
  if (opt.splice) return splicedSolve(opt.splice);
  if (anchored && nb > 1) {
    const r = blockwise();
    if (r) return r;
  }
  if (!bal || opt.blockValues) {
    const vals = opt.blockValues && opt.blockValues.length === nb ? opt.blockValues : null;
    if (vals && bal) {
      const f = fixedSolve(ALL, vals);
      if (!f) return { ...relaxed(buildLut(costsAt(vals), classes)), ...blockInfo(vals) };
      return finish({ vpis: f.vpis, cost: f.cost, feasible: true, ...blockInfo(vals) });
    }
    const lut = buildLut(Array(nb).fill(opt.costPerM), classes);
    const c = coarse(lut);
    if (!c) return { ...relaxed(lut), ...blockInfo(null) };
    const f = refine(lut, c);
    return finish({ vpis: f.vpis, cost: f.cost, feasible: true, ...blockInfo(null) });
  }
  // the whole route at once: one material value
  const whole = searchBalance(ALL, v => Array(nb).fill(v), bal.balanceOf, bal.tolerance);
  // (with pins: Auto's own line without them, at its own material value)
  if ('fail' in whole) return hasPins ? without([]) : { ...relaxed(whole.fail), materialValue: whole.v, ...blockInfo(anchored ? Array(nb).fill(whole.v) : null) };
  return finish({ vpis: whole.line.vpis, cost: whole.line.cost, feasible: true, materialValue: whole.v, balance: whole.b,
    ...blockInfo(anchored ? Array(nb).fill(whole.v) : null) });

  /**
   * The line `sp.vpis` (a solve of these knots: its heights at them are on this grid) kept at every knot outside the
   * spans, re-solved within each (from the knots before it to those after it, fixed: its heights and grades there), at
   * the material values `sp.values` (per block); a failed solve (no line through the pins there) is a failure.
   */
  function splicedSolve(sp: NonNullable<AutoProfileOptions['splice']>): AutoProfileResult {
    const fail: AutoProfileResult = { vpis: straight, feasible: false, cost: Infinity, pinViolations: pinChecks(straight) };
    const vals = sp.values.length === nb ? sp.values : Array(nb).fill(sp.values[0] ?? bal?.start ?? 0);
    const own = elevations(buildProfile([...sp.vpis], 0, 0), knotS), z = Float64Array.from(own);
    let cost = 0;
    for (const [a, b] of sp.spans) {
      let ka = 0, kb = nK;
      while (ka < nK && knotS[ka + 1] <= a + 1e-6) ka++;
      while (kb > 0 && knotS[kb - 1] >= b - 1e-6) kb--;
      const lo = Math.max(0, ka - 1), hi = Math.min(nK, kb + 1);
      if (hi - lo < 2) return fail;
      const fixed = new Map<number, number>([lo, ka, kb, hi].map(k => [k, own[k]]));
      const line = fixedSolve({ ka: lo, kb: hi, fixed }, vals);
      if (!line) return fail;
      // (its fixed knots keep the line's own heights: on another grid the solve rounds them, by up to half a step and B's
      // correction; profileOk below judges the joints)
      for (let k = ka + 1; k < kb; k++) z[k] = line.z[k];
      cost += line.cost;
    }
    z[0] = zA; z[nK] = zB;
    const vpis: VPI[] = [{ s: 0, z: z[0], r: null }];
    for (let k = 1; k < nK; k++) {
      const gIn = (z[k] - z[k - 1]) / Dk(k - 1), gOut = (z[k + 1] - z[k]) / Dk(k);
      if (Math.abs(gOut - gIn) > 1e-9) vpis.push({ s: knotS[k], z: z[k], r: null });
    }
    vpis.push({ s: L, z: z[nK], r: null });
    if (!profileOk(vpis, gradeL, crestR, sagR)) return fail;
    return finish({ vpis, feasible: true, cost, ...blockInfo(anchored ? vals : null), ...(!anchored && bal ? { materialValue: vals[0] } : {}) });
  }

  function blockInfo(vals: readonly number[] | null) {
    if (!anchored) return {};
    const out: Pick<AutoProfileResult, 'blockBounds' | 'blockValues' | 'materialValue'> = { blockBounds: bounds.slice() };
    if (vals) Object.assign(out, { blockValues: [...vals], materialValue: meanValue(vals) });
    return out;
  }
  function meanValue(vals: readonly number[]) {
    let sum = 0;
    for (let b = 0; b < nb; b++) sum += vals[b] * (bounds[b + 1] - bounds[b]);
    return sum / L;
  }

  /** A key of everything a solve over range `r` reads (knots, cost samples, clearances, bands, pins, the
   * grid anchor and B's correction) and `extra`. */
  function rangeKey(tag: string, r: Range, extra: readonly number[]): string {
    const f = new Float64Array(1), w = new Uint32Array(f.buffer);
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995, count = 0;
    const add = (x: number) => { f[0] = x; h1 = Math.imul(h1 ^ w[0], 16777619); h1 = Math.imul(h1 ^ w[1], 16777619); h2 = Math.imul(h2 ^ w[1], 0x5bd1e995) ^ w[0]; count++; };
    for (const x of extra) add(x);
    add(r.ka); add(r.kb);
    for (const [k, v] of [...r.fixed].sort((a, b) => a[0] - b[0])) { add(k); add(v); }
    add(zA); add(zB); add(L); add(nK); add(corrFrom); add(opt.maxGradient); add(opt.minCrest); add(opt.minSag); add(opt.vpiPenalty ?? NaN); add(pad); add(opt.portalDepth ?? NaN);
    // limits that vary along the road: their values on this range's knots
    for (let k = r.ka; k <= r.kb; k++) {
      if (opt.gradeAt && k < r.kb) add(opt.gradeAt(knotS[k], knotS[k + 1]));
      if (steepAt && k < r.kb) add(steepAt(knotS[k], knotS[k + 1]));
      if (opt.crestAt) add(opt.crestAt(knotS[k]));
      if (opt.sagAt) add(opt.sagAt(knotS[k]));
    }
    if (r.ka === 0) { add(opt.startGrade ?? NaN); add(opt.startGradeSlack ?? NaN); }
    if (r.kb === nK) { add(opt.endGrade ?? NaN); add(opt.endGradeSlack ?? NaN); }
    for (let k = r.ka; k <= r.kb; k++) {
      add(knotS[k]); add(gmin[k]); add(gmaxEnv[k]);
      if (knotPins) for (const p of knotPins[k]) { add(p.s); add(p.z); }
    }
    for (let q = costStart[r.ka]; q < costStart[r.kb]; q++) { add(costS[q]); add(costG[q]); add(costWeight[q]); add(costOffset[q]); }
    for (let q = clrStart[r.ka]; q < clrStart[r.kb]; q++) {
      const i = clrIdx[q];
      add(clrX[q]); add(g[i]); add(minH?.[i] ?? NaN); add(maxH?.[i] ?? NaN); add(opt.eitherH?.above[i] ?? NaN); add(opt.eitherH?.below[i] ?? NaN);
      add(penaltyAt ? penaltyAt[i] : clearancePenalty); add(hard?.[i] ?? 0);
    }
    add(opt.tunnelHardGrade ?? NaN); add(opt.tunnelHardFrom ?? NaN);
    // (every pin bounds every knot's heights by the slopes' reach from it, and pins add a finer pass: a solve with
    // pins is not one without them, however far they are; a pinned and an unpinned solve share a memo)
    if (hasPins) { add(-1); for (const p of pins!) { add(p.s); add(p.z); } }
    return `${tag}:${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}:${count}`;
  }

  /**
   * Block-wise solve. Each boundary's heights (its knot and the knots either side of it) come from a
   * solve of the route within BLOCK_WINDOW of it, with free ends and the starting material value; each
   * block is then solved between its boundaries' pinned knots with its own mass balance (or the given
   * values). Where a block cannot meet its pins (the two windows saw different ways through a valley),
   * it runs on to the next boundary. A change of the inputs therefore moves only the boundaries whose
   * window it reaches and the blocks next to them. Null if a window or a block finds no compliant line.
   */
  function blockwise(): AutoProfileResult | null {
    const fixedVals = opt.blockValues && opt.blockValues.length === nb ? opt.blockValues : null;
    // shared solves only where every input is in the key (a balance search's cost function is one of the
    // material value)
    const memo = bal ? opt.memo : undefined;
    const pre = buildLut(Array(nb).fill(bal ? bal.costFor(bal.start) : opt.costPerM), classes);
    const half = Math.max(2, Math.round(BLOCK_WINDOW / spacing));
    const pinsAt: Map<number, number>[] = [new Map()];
    for (let j = 1; j < nb; j++) {
      const K = boundaryKnot[j], ka = Math.max(0, K - half), kb = Math.min(nK, K + half);
      const fixed = new Map<number, number>();
      if (ka === 0) fixed.set(0, zA);
      if (kb === nK) fixed.set(nK, zB);
      const r: Range = { ka, kb, fixed };
      const key = memo && rangeKey('w', r, [bal!.start, K]);
      let pins = key ? memo!.get(key) as number[] | null | undefined : undefined;
      if (pins === undefined) {
        // a narrower band first (it only fixes the corridor), the full passes where that finds nothing
        // (not where the law demands a clearance in the window: a protected area's tunnel lies deeper than the corridor)
        const w = gentle || hardIn(r) ? null : solve(pre, opt.maxGradient, coarseGrid, WINDOW_PAD, null, r, 2);
        let c = w && ok(w) && !missesHard(w, r) ? w : coarse(pre, r);
        // (a corridor whose boundary heights lie at its band's edge was held there by the band, not by the prices:
        // the wide band's line is taken where it is cheaper; d3-full km 11.67, a pin 16 m low put an 800 m tunnel
        // in, 1.66 bn dearer)
        if (w && c === w && [K - 1, K, K + 1].some(k => w.z[k] <= gmin[k] - WINDOW_PAD || w.z[k] >= gmaxEnv[k] + WINDOW_PAD)) {
          const wide = solve(pre, opt.maxGradient, coarseGrid, pad * 5, null, r, 2);
          if (ok(wide) && !missesHard(wide, r) && wide.cost < w.cost) c = wide;
        }
        // the corridor pass suffices: its heights are on the fine grid too
        pins = c ? [c.z[K - 1], c.z[K], c.z[K + 1]] : null;
        if (key) memo!.set(key, pins);
      }
      if (!pins) return null;
      pinsAt.push(new Map([K - 1, K, K + 1].map((k, q) => [k, pins![q]])));
    }
    pinsAt.push(new Map());
    const z = new Float64Array(nK + 1).fill(NaN);
    const values: number[] = [];
    let cost = 0, balance = 0;
    for (let j = 0; j < nb;) {
      let done = false;
      for (let e = j + 1; e <= nb && !done; e++) {
        const ka = j === 0 ? 0 : boundaryKnot[j] - 1, kb = e === nb ? nK : boundaryKnot[e] + 1;
        const fixed = new Map<number, number>([...pinsAt[j], ...pinsAt[e]]);
        if (j === 0) fixed.set(0, zA);
        if (e === nb) fixed.set(nK, zB);
        const r: Range = { ka, kb, fixed };
        const s0 = bounds[j], s1 = bounds[e];
        type Block = { z: number[]; v: number; b: number; cost: number } | null;
        const key = memo && rangeKey('b', r, [fixedVals ? fixedVals[j] : NaN, bal!.start, bal!.lo, bal!.hi, bal!.tolerance, s0, s1]);
        let blk = key ? memo!.get(key) as Block | undefined : undefined;
        if (blk === undefined) {
          let line: Solved | null = null, v = NaN, b = 0;
          if (fixedVals || !bal) {
            line = fixedSolve(r, Array(nb).fill(fixedVals ? fixedVals[j] : 0));
          } else {
            const res = searchBalance(r, x => Array(nb).fill(x), (vp, x) => bal.balanceOf(vp, x, [s0, s1]), bal.tolerance * (s1 - s0) / L);
            if (!('fail' in res)) ({ line, v, b } = res);
          }
          blk = line ? { z: Array.from(line.z.subarray(ka, kb + 1)), v, b, cost: line.cost } : null;
          if (key) memo!.set(key, blk);
          // the line a balance search kept is the one a later solve at its value finds (a retry that keeps
          // the values found: the corridor at the starting value, the fine pass at that value)
          if (key && blk && !fixedVals) memo!.set(rangeKey('b', r, [v, bal!.start, bal!.lo, bal!.hi, bal!.tolerance, s0, s1]), { ...blk, b: 0 });
        }
        if (!blk) continue;
        const { v, b } = blk;
        const line = { cost: blk.cost };
        for (let k = ka; k <= kb; k++) z[k] = blk.z[k - ka];
        for (let q = j; q < e; q++) values.push(fixedVals ? fixedVals[j] : v);
        cost += line.cost; balance += b;
        j = e; done = true;
      }
      if (!done) return null;
    }
    const vpis: VPI[] = [{ s: 0, z: z[0], r: null }];
    for (let k = 1; k < nK; k++) {
      const gIn = (z[k] - z[k - 1]) / Dk(k - 1), gOut = (z[k + 1] - z[k]) / Dk(k);
      if (Math.abs(gOut - gIn) > 1e-9) vpis.push({ s: knotS[k], z: z[k], r: null });
    }
    vpis.push({ s: L, z: z[nK], r: null });
    if (!profileOk(vpis, gradeL, crestR, sagR)) return null;
    const out: AutoProfileResult = { vpis, feasible: true, cost, blockBounds: bounds.slice() };
    if (bal || fixedVals) Object.assign(out, { blockValues: values, materialValue: meanValue(values), ...(bal && !fixedVals ? { balance } : {}) });
    const res = finish(out);
    return res.feasible ? res : null;
  }

  /**
   * DP over knots ka…kb with elevations on a grid of u metres anchored at zA; dz values are in grid
   * units per knot interval. `fixed` pins knots to heights; an end without a pin is free. The band
   * searched at each knot is the ground envelope ± padM, or `around[k]` ± padM when given.
   * Anchored knots: interval lengths differ between blocks; a grade change at a knot is limited by
   * the shorter of its two intervals. B's height off the grid is met by a correction spread over the
   * last block (the whole route without blocks).
   */
  /** `step` 2: every other cost sample of an interval with the pair's weight (a boundary's corridor). */
  /** the smallest crest / sag radius at knot k */
  function crestAtKnot(k: number) { return opt.crestAt ? opt.crestAt(knotS[Math.min(k, nK)]) : opt.minCrest; }
  function sagAtKnot(k: number) { return opt.sagAt ? opt.sagAt(knotS[Math.min(k, nK)]) : opt.minSag; }
  /**
   * Tunnel mode: a tunnel goes on out to its portals, where the ground is portalDepth above the grade
   * (structures.ts), so a stretch deeper than that is all tunnel or all open, never a tunnel ending in a deep
   * cut. Station by station the search would mix them (a short tunnel between deep cuts it could not build).
   * Where its line takes no tunnel anywhere, that line is also the best under the rule (no other line is
   * cheaper under it: an open line costs no less than station by station, and so does a line in a tunnel, as
   * cut and cover costs more than the shallow cut it replaces), so it is kept; else the search runs again with a
   * second layer of states (in a tunnel): an open line prices Auto without a tunnel, a line in a tunnel
   * prices a tunnel wherever the ground is deeper than its portal, and a line enters or leaves a tunnel
   * only at a knot where the ground is shallower than that.
   */
  function solve(table: CostLut, gmax: number, u: number, padM: number, around: Float64Array | null, range: Range, step = 1): Solved | null {
    const plain = solveIn(table, gmax, u, padM, around, range, step, false);
    if (!plain?.tunnel) return plain;
    const t = solveIn(table, gmax, u, padM, around, range, step, true);
    if (!t || !steepLongTunnel(t, range)) return t ?? plain;
    return solveIn(table, gmax, u, padM, around, range, step, true, undefined, true) ?? t;
  }
  /** Whether a line has a tunnel (deeper than its portal at the cost samples along the road, each standing for its
   * ≈ DP_STATION_STEP) longer than `tunnelHardFrom` that is steeper than `tunnelHardGrade` between two knots anywhere
   * in it. */
  function steepLongTunnel(x: Solved, r: Range): boolean {
    const cap = opt.tunnelHardGrade, portal = opt.portalDepth, from = opt.tunnelHardFrom ?? 0;
    if (cap === undefined || portal === undefined) return false;
    let start = NaN, steep = false;
    for (let k = r.ka; k < r.kb; k++) {
      const slope = (x.z[k + 1] - x.z[k]) / Dk(k);
      // (a stream's point samples come first in an interval, at the bed: not the ground along the road)
      for (let q = costStart[k] + (anchored ? pointsIn[k].length : 0); q < costStart[k + 1]; q++) {
        if (x.z[k] + slope * (cS[q] - knotS[k]) - cG[q] <= -portal) {
          if (Number.isNaN(start)) { start = cS[q]; steep = false; }
          if (Math.abs(slope) > cap + 1e-9) steep = true;
          if (steep && cS[q] - start + DP_STATION_STEP > from) return true;
        } else start = NaN;
      }
    }
    return false;
  }
  /** `probe`: only the height range each knot's line may take (grid units from zA, with B's correction `corrAt`)
   * and the steepest grade step of each interval, handed to it; no line is searched. */
  /** `strict` (tunnel mode): the tunnel grade limit holds for every interval with any of its line in a tunnel. */
  function solveIn(table: CostLut, gmax: number, u: number, padM: number, around: Float64Array | null, range: Range, step: number, tunnelMode: boolean,
    probe?: (zlo: Int32Array, zhi: Int32Array, dzMaxK: Int32Array, corrAt: (k: number) => number) => void, strict = false): Solved | null {
    const { ka, kb, fixed } = range;
    const lut = table.values;
    // the end correction below spreads ≤ u/2 over the knots after corrFrom: keep that much grade in
    // reserve there (anchored: the last block only, so the other blocks keep their full gradient)
    const dzMaxK = new Int32Array(nK), crestK = new Int32Array(nK), sagK = new Int32Array(nK);
    let ndMax = 0;
    for (let k = ka; k < kb; k++) {
      const d = Dk(k);
      // (a pass that relaxes the limit relaxes every stretch's in proportion)
      const gk = steepAt ? gmax * (gradeL as (a: number, b: number) => number)(knotS[k], knotS[k + 1]) / opt.maxGradient
        : opt.gradeAt ? gmax * opt.gradeAt(knotS[k], knotS[k + 1]) / opt.maxGradient : gmax;
      dzMaxK[k] = Math.floor(((gk - (k >= corrFrom ? u / corrSpan : 0)) * d) / u + 1e-9);
      crestK[k] = Math.floor((d * d) / Math.max(crestAtKnot(k), crestAtKnot(k + 1)) / u + 1e-9);
      sagK[k] = Math.floor((d * d) / Math.max(sagAtKnot(k), sagAtKnot(k + 1)) / u + 1e-9);
      if (dzMaxK[k] < 1) return null;
      ndMax = Math.max(ndMax, 2 * dzMaxK[k] + 1);
    }
    /** grade states of the layer at knot k: the incoming interval's (the first knot: the first interval's) */
    const ndAt = (k: number) => 2 * dzMaxK[Math.max(ka, k - 1)] + 1;
    // Include pin-envelope pruning itself, before its O(knots × pins) sweep starts.
    const pinBoundWork = hasPins ? (kb - ka + 1) * pins!.length : 0;
    if (pinBoundWork > 60_000_000) return null;
    const uB = Math.round((zB - zA) / u); // B in grid units relative to zA
    const corr = zB - (zA + uB * u);
    const corrAt = (k: number) => k <= corrFrom ? 0 : corr * (anchored ? (knotS[k] - knotS[corrFrom]) / (L - knotS[corrFrom]) : k / nK);
    const gridOf = (k: number, zz: number) => Math.round((zz - zA - corrAt(k)) / u);
    const zlo = new Int32Array(nK + 1), zhi = new Int32Array(nK + 1);
    // reachable grid range from the pinned knots
    const fLo = new Float64Array(nK + 1), fHi = new Float64Array(nK + 1);
    for (let k = ka; k <= kb; k++) {
      let lo = k === ka ? -Infinity : fLo[k - 1] - dzMaxK[k - 1], hi = k === ka ? Infinity : fHi[k - 1] + dzMaxK[k - 1];
      const p = fixed.get(k);
      if (p !== undefined) { const q = gridOf(k, p); lo = Math.max(lo, q); hi = Math.min(hi, q); }
      fLo[k] = lo; fHi[k] = hi;
    }
    for (let k = kb - 1; k >= ka; k--) {
      fLo[k] = Math.max(fLo[k], fLo[k + 1] - dzMaxK[k]);
      fHi[k] = Math.min(fHi[k], fHi[k + 1] + dzMaxK[k]);
    }
    const shave = hasPins ? Math.max(...Array.from({ length: kb - ka }, (_, q) => Dk(ka + q))) ** 2 / (8 * Math.min(opt.minCrest, opt.minSag)) : 0;
    for (let k = ka; k <= kb; k++) {
      const rlo = fLo[k], rhi = fHi[k];
      if (rlo > rhi) return null;
      let a = Math.max(Math.floor(((around ? around[k] : gmin[k]) - padM - zA) / u), rlo);
      let b = Math.min(Math.ceil(((around ? around[k] : gmaxEnv[k]) + padM - zA) / u), rhi);
      if (fixed.has(k)) { a = rlo; b = rhi; }
      if (a > b) { a = rlo; b = rhi; } // ground band unreachable: use the reachable set
      if (!(b - a < 1e7)) return null;
      if (hasPins) {
        // Necessary bounds only. Smoothing shifts a VPI by at most D²/(8 Rmin).
        const sk = knotS[k];
        for (const p of pins!) {
          const reach = (steepAt ? gmax * gEnv / opt.maxGradient : gmax) * Math.abs(p.s - sk) + GRADE_PIN_TOLERANCE + shave;
          a = Math.max(a, Math.ceil((p.z - reach - zA - corrAt(k)) / u - 1e-9));
          b = Math.min(b, Math.floor((p.z + reach - zA - corrAt(k)) / u + 1e-9));
        }
        if (a > b) return null;
      }
      zlo[k] = a; zhi[k] = b;
    }
    if (probe) { probe(zlo, zhi, dzMaxK, corrAt); return null; }
    if (hasPins) {
      // Hard preflight budgets per pass: ≤16 MB of parent indices and ≤60 M estimated inner
      // iterations. Four coarse attempts + refinement/balance are bounded; never allocate a
      // station × elevation × grade tensor. Budget exhaustion is a search failure, not proof.
      let states = 0, work = pinBoundWork;
      for (let k = ka; k < kb; k++) {
        const ND = ndAt(k + 1);
        states += (zhi[k + 1] - zlo[k + 1] + 1) * ND;
        work += (zhi[k] - zlo[k] + 1) * ndAt(k) * (costStart[k + 1] - costStart[k]
          + clrStart[k + 1] - clrStart[k] + (crestK[k] + sagK[k] + 1) * (1 + knotPins![k].length));
        // Endpoint-half-cell pins are tested per valid segment, outside the transition loop.
        if (k === nK - 1) work += (zhi[k] - zlo[k] + 1)
          * Math.min(ND, zhi[k + 1] - zlo[k + 1] + 1) * knotPins![nK].length;
      }
      if (states > 4_000_000 || work > 60_000_000) return null;
    }
    // Fill only the height envelope this pass can visit, outside the DP's candidate loop.
    // Bounds include interpolation's j+1 read and an extra entry for roundoff. Even below
    // -H_MAX, interpolation reads entry 1 (with zero weight): it must not remain NaN.
    // (B's off-grid correction included: an entry left NaN there would bar the lines that read it, unless
    // an earlier evaluation had filled the shared table, so the line would depend on what was evaluated before)
    const low = new Int32Array(lut.length).fill(lutMax + 1), high = new Int32Array(lut.length).fill(-1);
    for (let k = ka; k < kb; k++) {
      const sk = knotS[k], d = Dk(k), dzMax = dzMaxK[k], c0 = corrAt(k), c1 = corrAt(k + 1);
      for (let q = costStart[k]; q < costStart[k + 1]; q++) {
        const block = costOffset[q], corr = c0 + (c1 - c0) / d * (costS[q] - sk);
        const h0 = zA + zlo[k] * u + (-dzMax * u) / d * (costS[q] - sk) - costG[q] + corr;
        const h1 = zA + zhi[k] * u + (dzMax * u) / d * (costS[q] - sk) - costG[q] + corr;
        low[block] = Math.min(low[block], Math.max(0, Math.min(lutMax, Math.floor((h0 + H_MAX) / H_STEP) - 1)));
        high[block] = Math.max(high[block], Math.max(1, Math.min(lutMax, Math.ceil((h1 + H_MAX) / H_STEP) + 1)));
      }
    }
    const fill = (block: number, lo: number, hi: number) => {
      const cost = table.costs[Math.floor(block / perBlock)], within = block % perBlock;
      const kind = within % PROFILE_KINDS - 1, cls = Math.floor(within / PROFILE_KINDS);
      const values = lut[block] ??= cost.table?.(kind, cls) ?? new Float64Array(lutMax + 1).fill(NaN);
      for (let j = lo; j <= hi; j++) if (Number.isNaN(values[j])) values[j] = cost(-H_MAX + j * H_STEP, kind, cls);
      return values;
    };
    for (let block = 0; block < low.length; block++) if (high[block] >= 0) fill(block, low[block], high[block]);
    const autoBlock = (block: number) => block % perBlock % PROFILE_KINDS === 0;
    if (tunnelMode) for (let block = 0; block < low.length; block++) if (high[block] >= 0 && autoBlock(block)) {
      fill(block + PROFILE_KIND.open + 1, low[block], high[block]);
      fill(block + PROFILE_KIND.inTunnel + 1, low[block], high[block]);
    }
    // the tables each sample reads on an open line / in a tunnel (the player's kinds: their own)
    const oOpen = tunnelMode ? new Int32Array(cO.length) : cO, oTunnel = tunnelMode ? new Int32Array(cO.length) : cO;
    if (tunnelMode) for (let q = 0; q < cO.length; q++) {
      const a = autoBlock(cO[q]);
      oOpen[q] = a ? cO[q] + PROFILE_KIND.open + 1 : cO[q];
      oTunnel[q] = a ? cO[q] + PROFILE_KIND.inTunnel + 1 : cO[q];
    }
    const layers = tunnelMode ? 2 : 1, portalDepth = opt.portalDepth ?? Infinity;
    // Continuing grades at the route's ends, in grid units per knot (real-valued).
    const gA = ka === 0 ? opt.startGrade : undefined, gB = kb === nK ? opt.endGrade : undefined;
    const dzA = gA === undefined ? NaN : gA * Dk(0) / u, dzB = gB === undefined ? NaN : gB * Dk(nK - 1) / u;
    // grade changes where the line continues a given one: one curve within its room there (grid units)
    const slack = (g: number | undefined, lim: number, k: number) => g === undefined ? lim : Math.min(lim, g * Dk(k) / u);
    const startCrest = slack(opt.startGradeSlack, crestK[0], 0), startSag = slack(opt.startGradeSlack, sagK[0], 0);
    const endCrest = slack(opt.endGradeSlack, crestK[nK - 1], nK - 1), endSag = slack(opt.endGradeSlack, sagK[nK - 1], nK - 1);
    /** states of one layer at knot k */
    const layerSize = (k: number) => (zhi[k] - zlo[k] + 1) * ndAt(k);
    let cur = new Float64Array(layers * layerSize(ka)).fill(Infinity);
    // first knot: dz is ignored there (any first grade), in or out of a tunnel
    for (let t = 0; t < layers; t++) for (let zi = 0; zi <= zhi[ka] - zlo[ka]; zi++) cur[t * layerSize(ka) + zi * ndAt(ka) + dzMaxK[ka]] = 0;
    const parents: Int32Array[] = [];
    const seg = new Float64Array(ndMax), segIn = tunnelMode ? new Float64Array(ndMax) : seg;
    // (in a tunnel mode with a tunnel grade limit: whether a grade's line runs in a tunnel anywhere in the interval,
    // and whether it leaves it anywhere: the limit holds for intervals wholly in a tunnel, as only a long one has
    // those (NV 264/2009: tunnels over 500 m))
    const tunnelGrade = tunnelMode ? opt.tunnelHardGrade : undefined, deepIn = new Uint8Array(ndMax), openIn = new Uint8Array(ndMax);
    const deepX = (H_MAX - (opt.portalDepth ?? 0)) / H_STEP;
    const slopes = new Float64Array(ndMax);
    for (let k = ka; k < kb; k++) {
      // (a steep stretch to an honoured pin: the norm's grade there, over which the search pays STEEP_PENALTY)
      const steepNorm = steepAt && steepAt(knotS[k], knotS[k + 1]) > 0
        ? gmax * (opt.gradeAt ? opt.gradeAt(knotS[k], knotS[k + 1]) : opt.maxGradient) / opt.maxGradient : NaN;
      const NDin = ndAt(k), ND = ndAt(k + 1), dzMax = dzMaxK[k], dzMaxIn = dzMaxK[Math.max(ka, k - 1)];
      const first = k === ka;
      const d = Dk(k), dIn = first ? d : Dk(k - 1), sameD = d === dIn;
      const crestLim = crestK[k], sagLim = sagK[k];
      // a grade change at a block joint: limited by the shorter interval, in this interval's units
      const dMin = Math.min(d, dIn), jointTol = u / (2 * Math.min(d, dIn)) + 1e-12;
      for (let d2 = 0; d2 < ND; d2++) slopes[d2] = ((d2 - dzMax) * u) / d;
      const Z0 = zhi[k] - zlo[k] + 1, Z1 = zhi[k + 1] - zlo[k + 1] + 1;
      const inSize = Z0 * NDin, outSize = Z1 * ND;
      const next = new Float64Array(layers * outSize).fill(Infinity);
      const par = new Int32Array(layers * outSize).fill(-1);
      const gKnot = tunnelMode ? groundAtKnot(k) : 0;
      const sk = knotS[k];
      const c0 = costStart[k], c1 = costStart[k + 1];
      const zk = (z: number) => zA + z * u + corrAt(k);
      /** valid outgoing dz range for an incoming dz (not at the first knot) */
      const outLo = (dz: number) => sameD ? dz - crestLim : Math.ceil(((dz * u) / dIn - dMin / crestAtKnot(k)) * d / u - 1e-9);
      const outHi = (dz: number) => sameD ? dz + sagLim : Math.floor(((dz * u) / dIn + dMin / sagAtKnot(k)) * d / u + 1e-9);
      // the knot's height correction moves to the next knot's over this interval
      const cIn = corrAt(k), cSlope = (corrAt(k + 1) - cIn) / d;
      for (let zi = 0; zi < Z0; zi++) {
        // Only grades some reachable incoming state can transition to are ever read below.
        let reachLo = ND, reachHi = -1;
        for (let dd = 0; dd < NDin; dd++) if (cur[zi * NDin + dd] < Infinity || (tunnelMode && cur[inSize + zi * NDin + dd] < Infinity)) {
          const dz = dd - dzMaxIn;
          const lo = first ? 0 : Math.max(0, outLo(dz) + dzMax), hi = first ? ND - 1 : Math.min(ND - 1, outHi(dz) + dzMax);
          if (lo < reachLo) reachLo = lo;
          if (hi > reachHi) reachHi = hi;
        }
        if (reachHi < 0) continue;
        const z = zlo[k] + zi;
        const zm = zA + z * u;
        // Valid next-knot grades form one contiguous range. Accumulate each cost point across
        // that range (q outer): every seg[d2] still sums its terms in the original q order, with
        // the identical per-term arithmetic, so results are bit-for-bit unchanged.
        const d2lo = Math.max(reachLo, zlo[k + 1] - z + dzMax), d2hi = Math.min(reachHi, zhi[k + 1] - z + dzMax);
        seg.fill(Infinity);
        for (let d2 = d2lo; d2 <= d2hi; d2++) seg[d2] = 0;
        if (tunnelMode) { segIn.fill(Infinity); for (let d2 = d2lo; d2 <= d2hi; d2++) segIn[d2] = 0; }
        if (tunnelGrade !== undefined) { deepIn.fill(0); openIn.fill(0); }
        for (let q = c0; q < c1; q += step) {
          const dsq = cS[q] - sk, gi = cG[q] - cIn - cSlope * dsq, weight = step === 1 || q + 1 >= c1 ? cW[q] : cW[q] + cW[q + 1];
          const values = lut[oOpen[q]];
          // the LUT position at grade d2: one multiply-add from the sample's base
          const x0 = (zm - gi + H_MAX) / H_STEP, inc = (u * dsq) / (d * H_STEP);
          if (!tunnelMode) for (let d2 = d2lo; d2 <= d2hi; d2++) {
            let x = x0 + (d2 - dzMax) * inc;
            if (x < 0) x = 0; else if (x > lutMax) x = lutMax;
            const j = x | 0;
            seg[d2] += (j >= lutMax ? values[lutMax] : values[j] + (values[j + 1] - values[j]) * (x - j)) * weight;
          } else {
            const inside = lut[oTunnel[q]];
            for (let d2 = d2lo; d2 <= d2hi; d2++) {
              let x = x0 + (d2 - dzMax) * inc;
              if (x < 0) x = 0; else if (x > lutMax) x = lutMax;
              const j = x | 0;
              const a = j >= lutMax ? values[lutMax] : values[j] + (values[j + 1] - values[j]) * (x - j);
              seg[d2] += a * weight;
              if (tunnelGrade !== undefined) { if (x > deepX) openIn[d2] = 1; else deepIn[d2] = 1; }
              segIn[d2] += (inside === values ? a : j >= lutMax ? inside[lutMax] : inside[j] + (inside[j + 1] - inside[j]) * (x - j)) * weight;
            }
          }
        }
        for (let d2 = d2lo; d2 <= d2hi; d2++) {
          let c = seg[d2], ci = tunnelMode ? segIn[d2] : 0;
          const slope = slopes[d2];
          for (let q = clrStart[k]; q < clrStart[k + 1]; q++) {
            const i = clrIdx[q], dx = clrX[q] - sk;
            const h = zm + slope * dx - g[i] + cIn + cSlope * dx;
            const pen = penaltyAt ? penaltyAt[i] : clearancePenalty;
            if (minH && h < minH[i] + CLEARANCE_MARGIN) { c += pen; ci += pen; }
            if (maxH && h > maxH[i] - CLEARANCE_MARGIN) { c += pen; ci += pen; }
            if (opt.eitherH && h < opt.eitherH.above[i] + CLEARANCE_MARGIN && h > opt.eitherH.below[i] - CLEARANCE_MARGIN) { c += pen; ci += pen; }
          }
          if (steepNorm === steepNorm) {
            const ex = Math.abs(slope + cSlope) / steepNorm - 1;
            if (ex > 0) { const p = STEEP_PENALTY * d * ex * (1 + ex); c += p; ci += p; }
          }
          // Last half-cell has no curve: the last tangent and the exact endpoint correction.
          if (knotPins && k === nK - 1) for (const p of knotPins[nK]) {
            const actual = zm + slope * (p.s - sk) + cIn + cSlope * (p.s - sk);
            if (Math.abs(actual - p.z) > GRADE_PIN_TOLERANCE + 1e-9) { c = ci = Infinity; break; }
          }
          seg[d2] = c;
          // no line wholly in a tunnel steeper than the law allows
          // (the line's own slope, with B's off-grid correction)
          if (tunnelMode) segIn[d2] = tunnelGrade === undefined || !deepIn[d2] || (openIn[d2] && !strict) || Math.abs(slope + cSlope) <= tunnelGrade + 1e-9 ? ci : Infinity;
        }
        // a line may enter or leave a tunnel here where the ground is shallower than a portal
        const free = tunnelMode && gKnot - (zm + cIn) < portalDepth;
        for (let t = 0; t < layers; t++) for (let dd = 0; dd < NDin; dd++) {
          let from = t * inSize + zi * NDin + dd;
          if (free) { const other = (1 - t) * inSize + zi * NDin + dd; if (cur[other] < cur[from]) from = other; }
          const base = cur[from];
          if (base === Infinity) continue;
          const segT = t ? segIn : seg, out = t * outSize;
          const dz = dd - dzMaxIn;
          // the first knot has no incoming grade: any first grade is allowed (unless it continues a given one)
          const dmin = first ? (Number.isNaN(dzA) ? -dzMax : Math.max(-dzMax, Math.ceil(dzA - startCrest - 1e-9)))
            : Math.max(-dzMax, outLo(dz));
          const dmax = first ? (Number.isNaN(dzA) ? dzMax : Math.min(dzMax, Math.floor(dzA + startSag + 1e-9)))
            : Math.min(dzMax, outHi(dz));
          const gIn = (dz * u) / dIn;
          for (let dz2 = dmin; dz2 <= dmax; dz2++) {
            const d2 = dz2 + dzMax;
            const sc = segT[d2];
            if (sc === Infinity) continue;
            // at a block joint the grids differ: the nearest grade on the next grid continues the line
            const turns = !first && (sameD ? dz2 !== dz : Math.abs((dz2 * u) / d - gIn) > jointTol);
            // pins at the first knot of a range are checked by the range before it (or at A)
            if (knotPins && knotPins[k].length && (!first || k === 0)) {
              let matches = true;
              const dg = first ? 0 : (dz2 * u) / d - gIn;
              const len = Math.abs(dg) * (dg < 0 ? crestAtKnot(k) : sagAtKnot(k));
              for (const p of knotPins[k]) {
                const t = p.s - sk;
                let actual = zk(z) + (t < 0 ? gIn : (dz2 * u) / d) * t;
                const x = len / 2 - Math.abs(t);
                if (x > 0) actual += dg * x * x / (2 * len);
                if (Math.abs(actual - p.z) > GRADE_PIN_TOLERANCE + 1e-9) { matches = false; break; }
              }
              if (!matches) continue;
            }
            const st = out + (z + dz2 - zlo[k + 1]) * ND + d2;
            const v = base + sc + (turns ? penalty : 0);
            if (v < next[st]) { next[st] = v; par[st] = from; }
          }
        }
      }
      parents.push(par);
      cur = next;
    }
    const NDl = ndAt(kb), dzMaxL = dzMaxK[kb - 1];
    let best = Infinity, bi = -1;
    for (let q = 0; q < cur.length; q++) {
      const dd = q % NDl;
      // A given end grade must be reachable from the last tangent by one vertical curve.
      if (!Number.isNaN(dzB) && (dd - dzMaxL < dzB - endSag - 1e-9 || dd - dzMaxL > dzB + endCrest + 1e-9)) continue;
      if (cur[q] < best) { best = cur[q]; bi = q; }
    }
    if (bi < 0) return null;
    const zs = new Float64Array(nK + 1).fill(NaN);
    const dzs = new Int32Array(nK + 1);
    let st = bi;
    for (let k = kb; k > ka; k--) {
      const ND = ndAt(k), local = st % layerSize(k);
      zs[k] = zlo[k] + Math.floor(local / ND);
      dzs[k] = local % ND - dzMaxK[k - 1];
      st = parents[k - 1 - ka][st];
    }
    zs[ka] = zlo[ka] + Math.floor(st % layerSize(ka) / ndAt(ka));
    // (a line found station by station: does it take a tunnel anywhere? Then the tunnel mode decides)
    // (only where deeper than a portal: shallower, Auto takes no tunnel)
    let tunnel = false;
    const xPortal = (H_MAX - (opt.portalDepth ?? 0)) / H_STEP + 1;
    if (!tunnelMode && opt.portalDepth !== undefined) for (let k = ka; k < kb && !tunnel; k++) {
      const sk = knotS[k], d = Dk(k), cIn = corrAt(k), cSlope = (corrAt(k + 1) - cIn) / d, zm = zA + zs[k] * u, dz = zs[k + 1] - zs[k];
      for (let q = costStart[k]; q < costStart[k + 1] && !tunnel; q += step) {
        if (!autoBlock(cO[q])) continue;
        const dsq = cS[q] - sk, gi = cG[q] - cIn - cSlope * dsq;
        let x = (zm - gi + H_MAX) / H_STEP + dz * (u * dsq) / (d * H_STEP);
        if (x > xPortal) continue;
        if (x < 0) x = 0;
        const j = x | 0, auto = lut[cO[q]], open = fill(cO[q] + PROFILE_KIND.open + 1, j, Math.min(lutMax, j + 1));
        if (auto[j] !== open[j] || (j < lutMax && auto[j + 1] !== open[j + 1])) tunnel = true;
      }
    }
    // grid → metres, with B's correction
    const z = new Float64Array(nK + 1).fill(NaN);
    for (let k = ka; k <= kb; k++) z[k] = zA + zs[k] * u + corrAt(k);
    if (ka === 0) z[0] = zA;
    if (kb === nK) z[nK] = zB;
    const vpis: VPI[] = [{ s: knotS[ka], z: z[ka], r: null }];
    for (let k = ka + 1; k < kb; k++) {
      const turns = Dk(k) !== Dk(k - 1) ? Math.abs(dzs[k + 1] / Dk(k) - dzs[k] / Dk(k - 1)) * u > 1e-9 : dzs[k + 1] !== dzs[k];
      if (turns) vpis.push({ s: knotS[k], z: z[k], r: null });
    }
    vpis.push({ s: knotS[kb], z: z[kb], r: null });
    return { vpis, cost: best, z, tunnel };
  }
}

/** a DP solution: the VPIs, the objective and the elevation at every knot (NaN outside its range) */
interface Solved { vpis: VPI[]; cost: number; z: Float64Array; /** a station-by-station line that takes a tunnel */ tunnel?: boolean }
