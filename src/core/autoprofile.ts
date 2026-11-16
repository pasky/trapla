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

import { buildProfile, type VPI } from './vertical';
import { GRADE_PIN_TOLERANCE, gradePinViolations, type GradePin, type GradePinViolation } from './grade-pins';

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
  maxGradient: number;
  minCrest: number;
  minSag: number;
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
  /** optional upper h bound (manual tunnel cover); NaN = none */
  maxH?: ArrayLike<number>;
  /** search for the material value that balances cut and fill (see BalanceSearch) */
  balance?: BalanceSearch;
  /** optional per-station minimum h (NaN = none), e.g. bridge clearance over a river */
  minH?: ArrayLike<number>;
  /** Disjunctive crossing clearance: pass above a channel OR tunnel sufficiently below it. */
  eitherH?: { above: ArrayLike<number>; below: ArrayLike<number> };
  /** CZK per unmet clearance station (default CLEARANCE_PENALTY); larger where a motorway's
   * structures dwarf the default and a missed clearance would rather be paid than built. */
  clearancePenalty?: number;
  /** Per-station penalty instead of `clearancePenalty` (indexed by station). */
  clearancePenaltyAt?: ArrayLike<number>;
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
  /** With `blocks`: the blocks used (their ends, from 0 to the route length) and, with a balance
   * search or fixed values, each block's material value. */
  blockBounds?: number[];
  blockValues?: number[];
}

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
  return { values: new Array(classes * 4 * costs.length), costs };
}

/** does the grade line satisfy max gradient and the (effective) vertical radii? */
export function profileOk(vpis: VPI[], maxGradient: number, minCrest: number, minSag: number): boolean {
  const p = buildProfile(vpis, minCrest, minSag);
  for (const g of p.grades) if (!(Math.abs(g) <= maxGradient + 1e-9)) return false;
  for (let i = 1; i < vpis.length; i++) if (!(vpis[i].s > vpis[i - 1].s)) return false;
  for (const c of p.curves) {
    if (c.type === 'none') continue;
    if (c.lenEff < c.len - 1e-3) return false;
  }
  return true;
}

export function autoProfile(s: ArrayLike<number>, g: ArrayLike<number>, opt: AutoProfileOptions): AutoProfileResult {
  const n = s.length;
  const L = s[n - 1];
  const zA = opt.endpointElevations?.a ?? g[0], zB = opt.endpointElevations?.b ?? g[n - 1];
  if (!Number.isFinite(zA) || !Number.isFinite(zB)) throw new Error('Non-finite endpoint elevation');
  const straight: VPI[] = [{ s: 0, z: zA, r: null }, { s: L, z: zB, r: null }];
  const straightOk = Math.abs(zB - zA) <= opt.maxGradient * L + 1e-9;
  // Keep the no-pin path (including empty/inactive saved pins) numerically unchanged.
  const pins = opt.pins?.filter((p) => !Number.isFinite(p.s) || !Number.isFinite(p.z) || (p.s >= 0 && p.s <= L));
  const hasPins = !!pins?.length;
  const pinChecks = (vpis: VPI[]) => gradePinViolations(opt.pins ?? [], buildProfile(vpis, opt.minCrest, opt.minSag), opt.maxGradient);
  const finish = (r: AutoProfileResult): AutoProfileResult => {
    if (!hasPins) return r;
    const pinViolations = pinChecks(r.vpis);
    return { ...r, feasible: r.feasible && pinViolations.length === 0, pinViolations };
  };
  if (hasPins && pinChecks(straight).some((v) => v.pin.reason !== 'search')) {
    return finish({ vpis: straight, feasible: false, cost: Infinity });
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
  const perBlock = classes * 4;
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
          const off = cls * 4 + kind + 1;
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
      costS.push(p.s); costG.push(p.g); costWeight.push(opt.pointWeight ?? ds); costOffset.push(base + p.cls * 4 + kind + 1);
    }
    for (let j = 0; j < m; j++) {
      const x = s0 + (j + 0.5) * w;
      const f = Math.min(n - 1 - 1e-9, Math.max(0, x / ds)), fi = Math.floor(f);
      const gx = opt.groundAt ? opt.groundAt(x) : fi + 1 < n ? g[fi] + (g[fi + 1] - g[fi]) * (f - fi) : g[fi];
      const near = Math.min(n - 1, Math.round(x / ds)), at = opt.classAt?.(x) ?? -1;
      if (at >= 0) {
        costS.push(x); costG.push(gx); costWeight.push(w); costOffset.push(base + at * 4 + (kinds?.[near] ?? -1) + 1);
        continue;
      }
      const i0 = Math.max(0, Math.ceil((x - w / 2) / ds - 1e-9)), i1 = Math.min(n - 1, Math.ceil((x + w / 2) / ds - 1e-9) - 1);
      const lo = Math.min(i0, i1), count = Math.max(1, i1 - i0 + 1);
      const blockStart = costS.length;
      for (let i = lo; i <= Math.max(lo, i1); i++) {
        const kind = kinds?.[i] ?? -1, cls = costClasses?.[i] ?? 0;
        const off = base + cls * 4 + kind + 1;
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

  const ok = (r: Solved | null): r is Solved => !!r && profileOk(r.vpis, opt.maxGradient, opt.minCrest, opt.minSag);
  const okAll = (r: Solved | null): r is Solved => ok(r) && (!hasPins || pinChecks(r.vpis).length === 0);
  const ALL = { ka: 0, kb: nK, fixed: new Map([[0, zA], [nK, zB]]) };
  type Range = typeof ALL;
  /** Whether a line misses a clearance it is asked for within range `r` (as the DP judges it: the
   * polyline at the clearance's own chainage, CLEARANCE_MARGIN inside the bound). */
  const missesClearance = (x: Solved, r: Range) => {
    for (let k = r.ka; k < r.kb; k++) for (let q = clrStart[k]; q < clrStart[k + 1]; q++) {
      const i = clrIdx[q], h = x.z[k] + (x.z[k + 1] - x.z[k]) * (clrX[q] - knotS[k]) / Dk(k) - g[i];
      if ((minH && h < minH[i] + CLEARANCE_MARGIN) || (maxH && h > maxH[i] - CLEARANCE_MARGIN)
        || (opt.eitherH && h < opt.eitherH.above[i] + CLEARANCE_MARGIN && h > opt.eitherH.below[i] - CLEARANCE_MARGIN)) return true;
    }
    return false;
  };
  /**
   * coarse pass: normal band, then a wide one (deep tunnels / high viaducts); if the coarse grid finds
   * nothing compliant (its grade steps are twice as large, which matters near the gradient limit),
   * the fine grid over the whole band. On a gentle gradient (a railway: kilometres to climb out of a
   * valley, so its line leaves the ground's band more often) a line of the normal band that misses a
   * clearance is weighed against the wide band's: the band only bounds the search, it must not decide
   * that a stream is left in a cutting where a deeper tunnel clears it for less. (Roads keep the normal
   * band: there the wide one also lands on the other side of near-ties, e.g. D35 stage 1 −1.1 bn and the
   * whole D35 +0.4 bn, a search question of its own.)
   */
  const coarse = (lut: CostLut, r: Range = ALL): Solved | null => {
    // Half-metre fallback only for pins: a narrow target can fall between coarse-grid paths.
    const passes = [[coarseGrid, pad], [coarseGrid, pad * 5], [fineGrid, pad]];
    if (hasPins) passes.push([0.5, pad]);
    const check = r === ALL ? okAll : ok;
    for (const [u, pd] of passes) {
      const x = solve(lut, opt.maxGradient, u, pd, null, r);
      if (!check(x)) continue;
      if (gentle && pd === pad && missesClearance(x, r)) {
        const wide = solve(lut, opt.maxGradient, u, pad * 5, null, r);
        if (check(wide) && wide.cost < x.cost) return wide;
      }
      return x;
    }
    return null;
  };
  /** fine pass around a coarse line; keeps the coarse line if the fine one is not compliant */
  const refine = (lut: CostLut, c: Solved, r: Range = ALL): Solved => {
    const f = solve(lut, opt.maxGradient, fineGrid, FINE_BAND, c.z, r);
    return (r === ALL ? okAll : ok)(f) ? f : c;
  };
  /** last resort when no compliant line was found: relaxed gradients, reported as not feasible */
  const relaxed = (lut: CostLut): AutoProfileResult => {
    // Pins never enable a relaxed-gradient search or a posthoc edited/manual profile.
    if (hasPins) return finish({ vpis: straight, feasible: straightOk, cost: Infinity });
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
  if ('fail' in whole) return { ...relaxed(whole.fail), materialValue: whole.v, ...blockInfo(anchored ? Array(nb).fill(whole.v) : null) };
  return finish({ vpis: whole.line.vpis, cost: whole.line.cost, feasible: true, materialValue: whole.v, balance: whole.b,
    ...blockInfo(anchored ? Array(nb).fill(whole.v) : null) });

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
    add(zA); add(zB); add(L); add(nK); add(corrFrom); add(opt.maxGradient); add(opt.minCrest); add(opt.minSag); add(opt.vpiPenalty ?? NaN); add(pad);
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
      add(penaltyAt ? penaltyAt[i] : clearancePenalty);
    }
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
      const key = memo && rangeKey('w', r, [bal!.start]);
      let pins = key ? memo!.get(key) as number[] | null | undefined : undefined;
      if (pins === undefined) {
        // a narrower band first (it only fixes the corridor), the full passes where that finds nothing
        const w = gentle ? null : solve(pre, opt.maxGradient, coarseGrid, WINDOW_PAD, null, r, 2);
        const c = w && ok(w) ? w : coarse(pre, r);
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
    if (!profileOk(vpis, opt.maxGradient, opt.minCrest, opt.minSag)) return null;
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
  function solve(table: CostLut, gmax: number, u: number, padM: number, around: Float64Array | null, range: Range, step = 1): Solved | null {
    const { ka, kb, fixed } = range;
    const lut = table.values;
    // the end correction below spreads ≤ u/2 over the knots after corrFrom: keep that much grade in
    // reserve there (anchored: the last block only, so the other blocks keep their full gradient)
    const dzMaxK = new Int32Array(nK), crestK = new Int32Array(nK), sagK = new Int32Array(nK);
    let ndMax = 0;
    for (let k = ka; k < kb; k++) {
      const d = Dk(k);
      dzMaxK[k] = Math.floor(((gmax - (k >= corrFrom ? u / corrSpan : 0)) * d) / u + 1e-9);
      crestK[k] = Math.floor((d * d) / opt.minCrest / u + 1e-9);
      sagK[k] = Math.floor((d * d) / opt.minSag / u + 1e-9);
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
          const reach = gmax * Math.abs(p.s - sk) + GRADE_PIN_TOLERANCE + shave;
          a = Math.max(a, Math.ceil((p.z - reach - zA - corrAt(k)) / u - 1e-9));
          b = Math.min(b, Math.floor((p.z + reach - zA - corrAt(k)) / u + 1e-9));
        }
        if (a > b) return null;
      }
      zlo[k] = a; zhi[k] = b;
    }
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
    for (let block = 0; block < low.length; block++) {
      if (high[block] < 0) continue;
      const cost = table.costs[Math.floor(block / perBlock)], within = block % perBlock;
      const kind = within % 4 - 1, cls = Math.floor(within / 4);
      const values = lut[block] ??= cost.table?.(kind, cls) ?? new Float64Array(lutMax + 1).fill(NaN);
      for (let j = low[block]; j <= high[block]; j++) if (Number.isNaN(values[j])) {
        values[j] = cost(-H_MAX + j * H_STEP, kind, cls);
      }
    }
    // Continuing grades at the route's ends, in grid units per knot (real-valued).
    const gA = ka === 0 ? opt.startGrade : undefined, gB = kb === nK ? opt.endGrade : undefined;
    const dzA = gA === undefined ? NaN : gA * Dk(0) / u, dzB = gB === undefined ? NaN : gB * Dk(nK - 1) / u;
    // grade changes where the line continues a given one: one curve within its room there (grid units)
    const slack = (g: number | undefined, lim: number, k: number) => g === undefined ? lim : Math.min(lim, g * Dk(k) / u);
    const startCrest = slack(opt.startGradeSlack, crestK[0], 0), startSag = slack(opt.startGradeSlack, sagK[0], 0);
    const endCrest = slack(opt.endGradeSlack, crestK[nK - 1], nK - 1), endSag = slack(opt.endGradeSlack, sagK[nK - 1], nK - 1);
    let cur = new Float64Array((zhi[ka] - zlo[ka] + 1) * ndAt(ka)).fill(Infinity);
    for (let zi = 0; zi <= zhi[ka] - zlo[ka]; zi++) cur[zi * ndAt(ka) + dzMaxK[ka]] = 0; // first knot: dz is ignored there (any first grade)
    const parents: Int32Array[] = [];
    const seg = new Float64Array(ndMax);
    const slopes = new Float64Array(ndMax);
    for (let k = ka; k < kb; k++) {
      const NDin = ndAt(k), ND = ndAt(k + 1), dzMax = dzMaxK[k], dzMaxIn = dzMaxK[Math.max(ka, k - 1)];
      const first = k === ka;
      const d = Dk(k), dIn = first ? d : Dk(k - 1), sameD = d === dIn;
      const crestLim = crestK[k], sagLim = sagK[k];
      // a grade change at a block joint: limited by the shorter interval, in this interval's units
      const dMin = Math.min(d, dIn), jointTol = u / (2 * Math.min(d, dIn)) + 1e-12;
      for (let d2 = 0; d2 < ND; d2++) slopes[d2] = ((d2 - dzMax) * u) / d;
      const Z0 = zhi[k] - zlo[k] + 1, Z1 = zhi[k + 1] - zlo[k + 1] + 1;
      const next = new Float64Array(Z1 * ND).fill(Infinity);
      const par = new Int32Array(Z1 * ND).fill(-1);
      const sk = knotS[k];
      const c0 = costStart[k], c1 = costStart[k + 1];
      const zk = (z: number) => zA + z * u + corrAt(k);
      /** valid outgoing dz range for an incoming dz (not at the first knot) */
      const outLo = (dz: number) => sameD ? dz - crestLim : Math.ceil(((dz * u) / dIn - dMin / opt.minCrest) * d / u - 1e-9);
      const outHi = (dz: number) => sameD ? dz + sagLim : Math.floor(((dz * u) / dIn + dMin / opt.minSag) * d / u + 1e-9);
      // the knot's height correction moves to the next knot's over this interval
      const cIn = corrAt(k), cSlope = (corrAt(k + 1) - cIn) / d;
      for (let zi = 0; zi < Z0; zi++) {
        // Only grades some reachable incoming state can transition to are ever read below.
        let reachLo = ND, reachHi = -1;
        for (let dd = 0; dd < NDin; dd++) if (cur[zi * NDin + dd] < Infinity) {
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
        for (let q = c0; q < c1; q += step) {
          const dsq = cS[q] - sk, gi = cG[q] - cIn - cSlope * dsq, weight = step === 1 || q + 1 >= c1 ? cW[q] : cW[q] + cW[q + 1];
          const values = lut[cO[q]];
          // the LUT position at grade d2: one multiply-add from the sample's base
          const x0 = (zm - gi + H_MAX) / H_STEP, inc = (u * dsq) / (d * H_STEP);
          for (let d2 = d2lo; d2 <= d2hi; d2++) {
            let x = x0 + (d2 - dzMax) * inc;
            if (x < 0) x = 0; else if (x > lutMax) x = lutMax;
            const j = x | 0;
            seg[d2] += (j >= lutMax ? values[lutMax] : values[j] + (values[j + 1] - values[j]) * (x - j)) * weight;
          }
        }
        for (let d2 = d2lo; d2 <= d2hi; d2++) {
          let c = seg[d2];
          const slope = slopes[d2];
          for (let q = clrStart[k]; q < clrStart[k + 1]; q++) {
            const i = clrIdx[q], dx = clrX[q] - sk;
            const h = zm + slope * dx - g[i] + cIn + cSlope * dx;
            const pen = penaltyAt ? penaltyAt[i] : clearancePenalty;
            if (minH && h < minH[i] + CLEARANCE_MARGIN) c += pen;
            if (maxH && h > maxH[i] - CLEARANCE_MARGIN) c += pen;
            if (opt.eitherH && h < opt.eitherH.above[i] + CLEARANCE_MARGIN && h > opt.eitherH.below[i] - CLEARANCE_MARGIN) c += pen;
          }
          // Last half-cell has no curve: the last tangent and the exact endpoint correction.
          if (knotPins && k === nK - 1) for (const p of knotPins[nK]) {
            const actual = zm + slope * (p.s - sk) + cIn + cSlope * (p.s - sk);
            if (Math.abs(actual - p.z) > GRADE_PIN_TOLERANCE + 1e-9) { c = Infinity; break; }
          }
          seg[d2] = c;
        }
        for (let dd = 0; dd < NDin; dd++) {
          const base = cur[zi * NDin + dd];
          if (base === Infinity) continue;
          const dz = dd - dzMaxIn;
          // the first knot has no incoming grade: any first grade is allowed (unless it continues a given one)
          const dmin = first ? (Number.isNaN(dzA) ? -dzMax : Math.max(-dzMax, Math.ceil(dzA - startCrest - 1e-9)))
            : Math.max(-dzMax, outLo(dz));
          const dmax = first ? (Number.isNaN(dzA) ? dzMax : Math.min(dzMax, Math.floor(dzA + startSag + 1e-9)))
            : Math.min(dzMax, outHi(dz));
          const gIn = (dz * u) / dIn;
          for (let dz2 = dmin; dz2 <= dmax; dz2++) {
            const d2 = dz2 + dzMax;
            const sc = seg[d2];
            if (sc === Infinity) continue;
            // at a block joint the grids differ: the nearest grade on the next grid continues the line
            const turns = !first && (sameD ? dz2 !== dz : Math.abs((dz2 * u) / d - gIn) > jointTol);
            // pins at the first knot of a range are checked by the range before it (or at A)
            if (knotPins && knotPins[k].length && (!first || k === 0)) {
              let matches = true;
              const dg = first ? 0 : (dz2 * u) / d - gIn;
              const len = Math.abs(dg) * (dg < 0 ? opt.minCrest : opt.minSag);
              for (const p of knotPins[k]) {
                const t = p.s - sk;
                let actual = zk(z) + (t < 0 ? gIn : (dz2 * u) / d) * t;
                const x = len / 2 - Math.abs(t);
                if (x > 0) actual += dg * x * x / (2 * len);
                if (Math.abs(actual - p.z) > GRADE_PIN_TOLERANCE + 1e-9) { matches = false; break; }
              }
              if (!matches) continue;
            }
            const st = (z + dz2 - zlo[k + 1]) * ND + d2;
            const v = base + sc + (turns ? penalty : 0);
            if (v < next[st]) { next[st] = v; par[st] = zi * NDin + dd; }
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
      const ND = ndAt(k);
      zs[k] = zlo[k] + Math.floor(st / ND);
      dzs[k] = st % ND - dzMaxK[k - 1];
      st = parents[k - 1 - ka][st];
    }
    zs[ka] = zlo[ka] + Math.floor(st / ndAt(ka));
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
    return { vpis, cost: best, z };
  }
}

/** a DP solution: the VPIs, the objective and the elevation at every knot (NaN outside its range) */
interface Solved { vpis: VPI[]; cost: number; z: Float64Array }
