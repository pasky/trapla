// Horizontal alignment: polyline of tangent-intersection points (PIs, "bends") from A to B with a
// circular arc at every bend. Transition curves are not drawn, but the room they need is tracked.
//
// Rules (ČSN 73 6101 as reproduced in the VUT text "Aplikace ČSN 73 6101"; values in HorizontalRules):
//  - an arc whose radius is ≥ plainRadius (transition shift L²/24R ≤ 0.25 m) needs no transitions;
//  - same-direction arcs may meet directly as a compound curve if neighbouring radii differ by at
//    most compoundRatio (the norm's "exceptional" variant without intermediate transitions);
//  - opposite arcs: their transitions may touch; ends without a transition need reverseStraight
//    between them (half of it is asked of each such end).
// Game simplifications: a transition takes ≈ L/2 of the tangent and L/2 of the curve; a compound
// curve only needs room for the transitions at its two ends; a straight between same-direction arcs
// is accepted whenever the required transitions fit (no minimum length); when they do not fit the
// arcs are joined into one compound curve instead (see solveChain).

export interface Vec2 { x: number; y: number }

export interface PI extends Vec2 {
  /** curve radius, m; null = automatic (smallest radius that satisfies the norm) */
  r: number | null;
}

export type Element =
  | { kind: 'line'; s0: number; len: number; x0: number; y0: number; dx: number; dy: number }
  | { kind: 'arc'; s0: number; len: number; cx: number; cy: number; r: number; a0: number; dir: 1 | -1; pi: number };

/** deflections sharper than this (near U-turns) get no arc: a kink that the checks reject */
export const MAX_DEFLECTION = (170 * Math.PI) / 180;

export interface HorizontalRules {
  /** smallest radius for the design speed, m */
  minRadius: number;
  /** transition (clothoid) length, m */
  transition: number;
  /** arcs with at least this radius need no transition, m */
  plainRadius: number;
  /** largest ratio of neighbouring radii in a compound curve */
  compoundRatio: number;
  /** straight between opposite arcs that have no transitions, m */
  reverseStraight: number;
}

/** ČSN 73 6101 road defaults derived from the minimum radius and the transition length (= vn metres) */
export function roadRules(minRadius: number, lt: number): HorizontalRules {
  return { minRadius, transition: lt, plainRadius: (lt * lt) / (24 * 0.25), compoundRatio: 2, reverseStraight: 2 * lt };
}

export interface CurveInfo {
  /** index into the interior PI list */
  index: number;
  x: number; y: number;
  /** absolute deflection angle, rad */
  delta: number;
  /** +1 left turn, -1 right turn */
  dir: 1 | -1;
  /** requested radius: the player's value, or the automatic one (in a compound curve: the solved one) */
  r: number;
  /** radius actually used for the drawn geometry (reduced if neighbouring arcs would overlap) */
  rEff: number;
  /** pure-arc tangent length R·tan(Δ/2) of the requested radius */
  t: number;
  /** tangent length including the room of a transition (where one is required), m */
  tTransition: number;
  /** arc length of the drawn geometry */
  arcLen: number;
  /** stations of the drawn arc start/end */
  sStart: number;
  sEnd: number;
  auto: boolean;
  /** deflection above MAX_DEFLECTION: no arc was built */
  tooSharp: boolean;
  /** index into Alignment.units of the curve this arc belongs to; -1 if the bend has no arc */
  unit: number;
  /**
   * The bend turns against its neighbour where no S-curve fits, and lies within EDIT_TOLERANCE of the
   * straight line between its neighbours: it is left out, i.e. the tangent polygon runs `offset` m beside it.
   */
  ignored: boolean;
  offset: number;
}

export interface LegInfo {
  index: number;
  length: number;
  /** room asked of the leg: tangent lengths plus transitions / straights from each end */
  used: number;
}

/** One curve: a single arc, or several same-direction arcs joined as a compound curve. */
export interface UnitInfo {
  /** first / last PI index (equal for a single-arc bend) */
  first: number;
  last: number;
  sStart: number;
  sEnd: number;
  arcLen: number;
  /** transitions the rules require at its ends (0–2) */
  transitions: number;
  /** compound only: weight of the radius-evenness term that was needed (≈0: arcs meet exactly on the legs) */
  smoothing: number;
  /** compound only: largest distance of an arc junction from its polygon leg, m */
  maxOffset: number;
}

/** What happens on the polygon leg between two consecutive bends (or a route end and a bend). */
export interface JointInfo {
  /** PI index of the bend at each end; -1 = route end (A or B) */
  from: number;
  to: number;
  /** leg length, m (legs through exactly collinear points are merged) */
  length: number;
  /** end: next to A/B (or a kink); reverse: opposite turns; same: same turn with a straight; compound: arcs joined */
  kind: 'end' | 'reverse' | 'same' | 'compound';
  /** tangent lengths asked of the leg by the curve at each end (before any overlap reduction) */
  tFrom: number;
  tTo: number;
  /** extra room asked beyond the tangent point: transition, or half the plain reverse straight */
  needFrom: number;
  needTo: number;
  /** that end has no transition */
  plainFrom: boolean;
  plainTo: boolean;
  /** compound: distance of the arc junction from the leg (+ towards the curve centre), m */
  offset: number;
  /** same-direction neighbours without room for a straight that could not be joined either */
  joinFailed: boolean;
  /** stations of the stretch concerned (both curves) */
  s0: number;
  s1: number;
}

export interface Alignment {
  elements: Element[];
  length: number;
  curves: CurveInfo[];
  legs: LegInfo[];
  units: UnitInfo[];
  joints: JointInfo[];
  rules: HorizontalRules;
}

/** clothoid shift p and tangent offset k for a transition of length L into radius R */
export function transitionTangent(r: number, delta: number, lt: number): number {
  if (delta < 1e-9) return 0;
  const p = (lt * lt) / (24 * r);
  const k = lt / 2 - (lt * lt * lt) / (240 * r * r);
  return (r + p) * Math.tan(delta / 2) + k;
}

/** room a transition takes on the tangent beyond the plain-arc tangent point (≈ L/2) */
export function transitionExtra(r: number, delta: number, lt: number): number {
  if (delta < 1e-9 || lt <= 0 || !(r > 0)) return 0;
  return Math.max(0, transitionTangent(r, delta, lt) - r * Math.tan(delta / 2));
}

/**
 * Smallest radius the rules allow for an isolated bend: ≥ minRadius, and either long enough for its
 * two transitions (R·Δ ≥ lt) or large enough to need none (plainRadius).
 */
export function autoRadius(delta: number, rules: HorizontalRules): number {
  if (delta < 1e-9) return rules.minRadius;
  const r = Math.max(rules.minRadius, Math.min(rules.transition / delta, rules.plainRadius));
  return Math.ceil(r / 5 - 1e-9) * 5;
}

// ---- compound curves -----------------------------------------------------------------------------

export interface ChainSol {
  /** radius per bend */
  R: number[];
  /** tangent length on the leg before the first / after the last bend */
  sIn: number;
  sOut: number;
  /** offset of the junction after each bend from its leg (last one is the closing condition ≈ 0) */
  w: number[];
  lam: number;
  /** largest distance of an arc junction from its leg, m */
  offset: number;
  /** all rules the solver can influence hold (minimum radius of automatic arcs, radius ratio) within the tolerance */
  ok: boolean;
}

/** Gaussian elimination with partial pivoting; overwrites M (n×n, row-major) and rhs. */
function solveLinear(M: Float64Array, rhs: Float64Array, n: number): boolean {
  for (let c = 0; c < n; c++) {
    let p = c, best = Math.abs(M[c * n + c]);
    for (let r = c + 1; r < n; r++) { const v = Math.abs(M[r * n + c]); if (v > best) { best = v; p = r; } }
    if (!(best > 1e-13)) return false;
    if (p !== c) {
      for (let k = c; k < n; k++) { const t = M[c * n + k]; M[c * n + k] = M[p * n + k]; M[p * n + k] = t; }
      const t = rhs[c]; rhs[c] = rhs[p]; rhs[p] = t;
    }
    const d = M[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r * n + c] / d;
      if (f === 0) continue;
      for (let k = c; k < n; k++) M[r * n + k] -= f * M[c * n + k];
      rhs[r] -= f * rhs[c];
    }
  }
  for (let c = n - 1; c >= 0; c--) {
    let v = rhs[c];
    for (let k = c + 1; k < n; k++) v -= M[c * n + k] * rhs[k];
    rhs[c] = v / M[c * n + c];
  }
  return true;
}

export interface ChainInput {
  /** bends of the chain */
  px: number[]; py: number[];
  /** unit directions of the m+1 legs around them (incoming, between, outgoing) */
  ux: number[]; uy: number[];
  /** tan(Δ/2) per bend */
  tau: number[];
  /** player radius per bend, or null */
  manual: (number | null)[];
}

/**
 * Compound curve through m ≥ 2 same-direction bends. Arc j turns from the direction of leg j−1 to that
 * of leg j, so the curve is G1 for any radii; the unknowns are the radii and the start point on the
 * incoming leg. The classic solution has the arcs meet on the legs (T[j] + T[j+1] = leg): that leaves
 * one degree of freedom, which is spent on making the radii even. When that solution breaks the
 * minimum radius or the radius-ratio rule, tangency to the inner legs is relaxed step by step (least
 * squares: junction offsets from the legs vs. λ · radius unevenness) until the rules hold; the curve
 * then misses the inner legs by the reported offsets (at most `tolerance`) but stays tangent to the
 * two outer legs. Returns the least rule-breaking curve within the tolerance if none satisfies the
 * rules, or null if there is none at all.
 * `fixIn` / `fixOut` pin the outer tangent lengths (used when a neighbour limits the room).
 */
export function solveChain(inp: ChainInput, rules: HorizontalRules, fixIn: number | null, fixOut: number | null, tolerance = Infinity): ChainSol | null {
  const m = inp.tau.length, N = m + 1;
  const { px, py, ux, uy, tau, manual } = inp;
  // junction j (after bend j, 1-based) = P1 − s·u0 + Σ_{i≤j} R_i·tau_i·(u_{i−1} + u_i)
  // w_j = (J_j − P_j)·n_j ; sOut = (J_m − P_m)·u_m ; all linear in x = [s, R_1..R_m]
  const aW = new Float64Array(m * N), cW = new Float64Array(m);
  const aOut = new Float64Array(N);
  for (let j = 1; j <= m; j++) {
    const nx = -uy[j], ny = ux[j];
    aW[(j - 1) * N] = -(ux[0] * nx + uy[0] * ny);
    for (let i = 1; i <= j; i++) aW[(j - 1) * N + i] = tau[i - 1] * ((ux[i - 1] + ux[i]) * nx + (uy[i - 1] + uy[i]) * ny);
    cW[j - 1] = (px[0] - px[j - 1]) * nx + (py[0] - py[j - 1]) * ny;
  }
  aOut[0] = -(ux[0] * ux[m] + uy[0] * uy[m]);
  for (let i = 1; i <= m; i++) aOut[i] = tau[i - 1] * ((ux[i - 1] + ux[i]) * ux[m] + (uy[i - 1] + uy[i]) * uy[m]);
  const cOut = (px[0] - px[m - 1]) * ux[m] + (py[0] - py[m - 1]) * uy[m];

  // the player's radii (and a pinned start) are known: only the rest, y, is solved for
  const known = new Float64Array(N), col = new Int32Array(N).fill(-1);
  const free: number[] = [];
  for (let k = 0; k < N; k++) {
    const v = k === 0 ? fixIn : manual[k - 1];
    if (v !== null) known[k] = v; else { col[k] = free.length; free.push(k); }
  }
  const F = free.length;
  const freeRadii = free.some((k) => k > 0);
  const reduce = (row: ArrayLike<number>, off: number, c: number) => {
    const r = new Float64Array(F);
    for (let k = 0; k < N; k++) { if (col[k] < 0) c += row[off + k] * known[k]; else r[col[k]] = row[off + k]; }
    return { r, c };
  };
  const W = Array.from({ length: m }, (_, j) => reduce(aW, j * N, cW[j])); // w_j = W[j].r·y + W[j].c
  const O = reduce(aOut, 0, cOut); // sOut = O.r·y + O.c
  // hard conditions: the curve ends on the outgoing leg's line, and a pinned end tangent. A condition
  // that no unknown can influence (e.g. a 180° turn of given radii) either holds already or never will.
  const cons: { row: Float64Array; d: number }[] = [];
  const require = (row: Float64Array, d: number): boolean => {
    let big = 0;
    for (let f = 0; f < F; f++) big = Math.max(big, Math.abs(row[f]));
    if (big < 1e-9) return Math.abs(d) < 1e-6;
    cons.push({ row, d });
    return true;
  };
  if (!require(W[m - 1].r, -W[m - 1].c)) return null;
  if (fixOut !== null && !require(O.r, fixOut - O.c)) return null;
  const K = cons.length, S = F + K;
  if (K > F) return null;

  // tangency part of the normal equations (independent of λ)
  const H0 = new Float64Array(F * F), g0 = new Float64Array(F);
  for (let j = 0; j < m - 1; j++) {
    const { r, c } = W[j];
    for (let a = 0; a < F; a++) {
      if (r[a] === 0) continue;
      g0[a] -= r[a] * c;
      for (let b = 0; b < F; b++) H0[a * F + b] += r[a] * r[b];
    }
  }
  let tr = 0;
  for (let a = 0; a < F; a++) tr += H0[a * F + a];
  const ridge = 1e-15 * (tr / Math.max(1, F) + 1e-6); // keeps the system solvable when a radius is left undetermined

  const floorR = Math.max(1, 0.02 * rules.minRadius);
  const tauMean = tau.reduce((v, t) => v + t, 0) / m;
  // the curve may begin a little past the first bend (or end before the last one) on the outer
  // legs' lines, but not beyond the middle of the neighbouring inner leg
  const sMinIn = 0.5 * Math.hypot(px[1] - px[0], py[1] - py[0]) + 1e-9;
  const sMinOut = 0.5 * Math.hypot(px[m - 1] - px[m - 2], py[m - 1] - py[m - 2]) + 1e-9;
  type Sol = ChainSol & { bad: number };
  /** x = [s, R_1..R_m] for the evenness weight λ and the pair weights wt */
  const solveOnce = (lam: number, wt: Float64Array): Float64Array | null => {
    const x = Float64Array.from(known);
    if (F === 0) return x;
    const M = new Float64Array(S * S), rhs = new Float64Array(S);
    for (let a = 0; a < F; a++) {
      for (let b = 0; b < F; b++) M[a * S + b] = H0[a * F + b];
      M[a * S + a] += ridge;
      rhs[a] = g0[a];
    }
    for (let j = 1; j < m; j++) {
      // evenness of the neighbouring radii j, j+1; tauMean turns a radius difference into metres of tangent length
      const q = lam * tauMean * tauMean * wt[j - 1], fa = col[j], fb = col[j + 1];
      if (fa >= 0) { M[fa * S + fa] += q; if (fb < 0) rhs[fa] += q * known[j + 1]; }
      if (fb >= 0) { M[fb * S + fb] += q; if (fa < 0) rhs[fb] += q * known[j]; }
      if (fa >= 0 && fb >= 0) { M[fa * S + fb] -= q; M[fb * S + fa] -= q; }
    }
    for (let k = 0; k < K; k++) {
      const { row, d } = cons[k];
      for (let a = 0; a < F; a++) { M[(F + k) * S + a] = row[a]; M[a * S + F + k] = row[a]; }
      rhs[F + k] = d;
    }
    if (!solveLinear(M, rhs, S)) return null;
    for (let f = 0; f < F; f++) x[free[f]] = rhs[f];
    return x;
  };
  const run = (lam: number): Sol | null => {
    // the rule is about radius ratios, so the evenness term is reweighted to measure relative differences
    const wt = new Float64Array(m - 1).fill(1);
    let x: Float64Array | null = null;
    for (let it = 0; it < 5; it++) {
      const xi = solveOnce(lam, wt);
      if (!xi) break;
      x = xi;
      if (!freeRadii) break;
      let lg = 0, positive = true;
      for (let i = 1; i <= m; i++) { if (xi[i] >= floorR) lg += Math.log(xi[i]); else positive = false; }
      if (!positive) break;
      const g2 = Math.exp((2 * lg) / m);
      let change = 0;
      for (let j = 0; j < m - 1; j++) {
        const nw = g2 / (xi[j + 1] * xi[j + 2]);
        change = Math.max(change, Math.abs(nw - wt[j]) / wt[j]);
        wt[j] = nw;
      }
      if (change < 1e-3) break;
    }
    if (!x) return null;
    const R: number[] = [];
    for (let i = 1; i <= m; i++) R.push(x[i]);
    const sIn = x[0];
    let sOut = cOut;
    for (let a = 0; a < N; a++) sOut += aOut[a] * x[a];
    const w: number[] = [];
    let off = 0;
    for (let j = 0; j < m; j++) {
      let v = cW[j];
      for (let a = 0; a <= j + 1; a++) v += aW[j * N + a] * x[a];
      w.push(v);
      if (j < m - 1) off = Math.max(off, Math.abs(v));
    }
    if (!(Math.abs(w[m - 1]) < 1e-6) || !(sIn > -sMinIn) || !(sOut > -sMinOut)) return null;
    let bad = 0;
    for (let i = 0; i < m; i++) {
      if (!(R[i] >= floorR) || !Number.isFinite(R[i])) return null;
      if (manual[i] === null && R[i] < rules.minRadius) bad = Math.max(bad, rules.minRadius / R[i] - 1);
      if (i > 0 && (manual[i] === null || manual[i - 1] === null)) bad = Math.max(bad, ratioExcess(R[i], R[i - 1], rules));
    }
    return { R, sIn, sOut, w, lam, offset: off, ok: bad === 0 && off <= tolerance, bad };
  };
  /** from an acceptable solution at `hi`, the smallest relaxation that still is (keeps dragging continuous) */
  const least = (lo: number, hi: number, good: Sol): Sol => {
    for (let it = 0; it < 12; it++) {
      const mid = Math.sqrt(lo * hi), sm = run(mid);
      if (sm && sm.ok) { hi = mid; good = sm; } else lo = mid;
    }
    return good;
  };

  if (!freeRadii) { // nothing to trade: the given radii fit within the tolerance or they do not
    const sol = run(1);
    return sol && sol.offset <= tolerance ? sol : null;
  }
  const ladder = [1e-8, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1, 10, 100, 1e3, 1e4, 1e6];
  let best: Sol | null = null; // least rule-breaking solution that stays within the tolerance
  let nearLam = 0; // largest relaxation tried that stayed within the tolerance (rules still broken)
  for (let k = 0; k < ladder.length; k++) {
    const sol = run(ladder[k]);
    if (!sol) continue;
    if (sol.ok) return k === 0 ? sol : least(ladder[k - 1], ladder[k], sol);
    if (sol.offset <= tolerance) {
      if (!best || sol.bad < best.bad) best = sol;
      nearLam = ladder[k];
    } else if (sol.bad === 0 && nearLam > 0) {
      // rules hold here but the curve strays too far; just below, it stayed close but broke a rule: look between
      let lo = nearLam, hi = ladder[k];
      for (let it = 0; it < 14; it++) {
        const mid = Math.sqrt(lo * hi), sm = run(mid);
        if (sm && sm.ok) return least(lo, mid, sm);
        if (sm && sm.offset <= tolerance) { lo = mid; if (!best || sm.bad < best.bad) best = sm; } else hi = mid;
      }
      break;
    }
  }
  return best;
}

/**
 * How far two neighbouring radii of a compound curve exceed the ratio rule (0 = fine). Two arcs that
 * both need no transition against a straight need none between them either (the same 0.25 m shift
 * rule covers the intermediate transition), whatever their ratio.
 */
export function ratioExcess(r1: number, r2: number, rules: HorizontalRules): number {
  const lo = Math.min(r1, r2), hi = Math.max(r1, r2);
  if (lo >= rules.plainRadius - 1e-9) return 0;
  return hi > lo * rules.compoundRatio * (1 + 1e-9) ? hi / (lo * rules.compoundRatio) - 1 : 0;
}

// ---- alignment -----------------------------------------------------------------------------------

const EPS_ANG = 1e-9;
const EPS_LEN = 1e-6;
/**
 * Editor tolerance (not a norm value), m: how far the road may be moved off the tangent polygon the
 * player drew in order to satisfy the rules — arc junctions of a compound curve off their legs, the
 * road passing a bend that only wiggles against its neighbours, arcs moved by joining them.
 */
export const EDIT_TOLERANCE = 5;
/** larger manual radii are taken as this (keeps the arithmetic finite), m */
const MAX_RADIUS = 1e7;

interface Unit {
  /** range of effective vertices */
  i0: number; i1: number;
  sIn: number; sOut: number;
  /** junction offsets (chains only) */
  w: number[] | null;
  lam: number;
}

export function buildAlignment(a: Vec2, b: Vec2, pis: PI[], rules: HorizontalRules): Alignment;
export function buildAlignment(a: Vec2, b: Vec2, pis: PI[], minRadius: number, lt: number): Alignment;
export function buildAlignment(a: Vec2, b: Vec2, pis: PI[], rulesOrMin: HorizontalRules | number, ltArg = 0): Alignment {
  const rules = typeof rulesOrMin === 'number' ? roadRules(rulesOrMin, ltArg) : rulesOrMin;
  const lt = rules.transition, plain = rules.plainRadius;
  const m = pis.length;

  // ---- effective vertices: drop points that coincide with their predecessor (or B) or are collinear ----
  let keep: number[] = [];
  {
    let lx = a.x, ly = a.y;
    for (let k = 0; k < m; k++) {
      if (Math.hypot(pis[k].x - lx, pis[k].y - ly) < EPS_LEN) continue;
      keep.push(k); lx = pis[k].x; ly = pis[k].y;
    }
    while (keep.length && Math.hypot(pis[keep[keep.length - 1]].x - b.x, pis[keep[keep.length - 1]].y - b.y) < EPS_LEN) keep.pop();
    const pt = (i: number): Vec2 => (i < 0 ? a : i >= keep.length ? b : pis[keep[i]]);
    keep = keep.filter((_, i) => {
      const p0 = pt(i - 1), p1 = pt(i), p2 = pt(i + 1);
      const ax = p1.x - p0.x, ay = p1.y - p0.y, bx = p2.x - p1.x, by = p2.y - p1.y;
      return Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) >= EPS_ANG;
    });
  }
  // ---- layout for the current set of bends; bends that only wiggle are then left out and it is redone ----
  const ignored = new Map<number, number>(); // PI index → distance of the point from the line between its neighbours
  let L = layout();
  for (let it = 0; it < m && L.drop >= 0; it++) {
    ignored.set(keep[L.drop], L.chordOffset(L.drop));
    keep.splice(L.drop, 1);
    L = layout();
  }
  const { nv, P, EL, U, raw, d, dir, tau, manual, Rv, units, Teff, noChain, legKind, endNeed, mandatory, isChain, maxOffsetOf } = L;

  function layout() {
    const nv = keep.length;
    const P = (i: number): Vec2 => (i < 0 ? a : i >= nv ? b : pis[keep[i]]);
    // effective legs e = 0..nv: from P(e−1) to P(e)
    const EL: number[] = [], U: Vec2[] = [];
    for (let e = 0; e <= nv; e++) {
      const dx = P(e).x - P(e - 1).x, dy = P(e).y - P(e - 1).y, L = Math.hypot(dx, dy);
      EL.push(L);
      U.push(L > 1e-12 ? { x: dx / L, y: dy / L } : { x: 1, y: 0 });
    }
    const raw: number[] = [], d: number[] = [], dir: (1 | -1)[] = [], tau: number[] = [], manual: (number | null)[] = [];
    const Rreq: number[] = [];
    for (let i = 0; i < nv; i++) {
      const cross = U[i].x * U[i + 1].y - U[i].y * U[i + 1].x;
      const dot = U[i].x * U[i + 1].x + U[i].y * U[i + 1].y;
      const rw = Math.abs(Math.atan2(cross, dot));
      raw.push(rw);
      d.push(rw > MAX_DEFLECTION ? 0 : rw); // near-reversal: no arc (geometry stays continuous)
      dir.push(cross >= 0 ? 1 : -1);
      tau.push(Math.tan(d[i] / 2));
      const r = pis[keep[i]].r;
      manual.push(r !== null && Number.isFinite(r) && r > 0 ? Math.min(r, MAX_RADIUS) : null);
      Rreq.push(manual[i] ?? autoRadius(d[i], rules));
    }
    /** what the leg e joins: the two curves next to it */
    const legKind = (e: number): 'end' | 'same' | 'reverse' =>
      e <= 0 || e >= nv || d[e - 1] === 0 || d[e] === 0 ? 'end' : dir[e - 1] === dir[e] ? 'same' : 'reverse';

    // ---- layout: units (single arcs / compound chains), restarted with fewer chains if one cannot be built ----
    const noChain = new Uint8Array(nv + 1); // legs across which arcs must not be joined
    const Rv: number[] = new Array(nv).fill(0);
    let units: Unit[] = [];
    let Teff: { in: number; out: number }[] = [];
    const isChain = (u: Unit) => u.i1 > u.i0;
    const maxOffsetOf = (u: Unit) => { let v = 0; if (u.w) for (let j = 0; j < u.w.length - 1; j++) v = Math.max(v, Math.abs(u.w[j])); return v; };
    const arcLenOf = (u: Unit) => { let s = 0; for (let i = u.i0; i <= u.i1; i++) s += Rv[i] * d[i]; return s; };
    const mandatory = (u: Unit) => (d[u.i0] > 0 && Rv[u.i0] < plain - 1e-9 ? 1 : 0) + (d[u.i1] > 0 && Rv[u.i1] < plain - 1e-9 ? 1 : 0);
    /** room beyond the tangent point asked by a unit end, and whether that end is without a transition */
    const endNeed = (u: Unit, side: 0 | 1): { need: number; plain: boolean } => {
      const i = side === 0 ? u.i0 : u.i1;
      if (d[i] === 0 || lt <= 0) return { need: 0, plain: true };
      if (Rv[i] < plain - 1e-9) return { need: transitionExtra(Rv[i], d[i], lt), plain: false };
      if (legKind(side === 0 ? u.i0 : u.i1 + 1) !== 'reverse') return { need: 0, plain: true };
      // a large-radius arc facing an opposite curve: it may still carry a transition if it is long enough
      const nRev = (legKind(u.i0) === 'reverse' && Rv[u.i0] >= plain - 1e-9 ? 1 : 0)
        + (legKind(u.i1 + 1) === 'reverse' && Rv[u.i1] >= plain - 1e-9 ? 1 : 0);
      if (arcLenOf(u) >= (mandatory(u) + nRev) * (lt / 2) - 1e-6) return { need: transitionExtra(Rv[i], d[i], lt), plain: false };
      return { need: rules.reverseStraight / 2, plain: true };
    };
    /** unit before / after leg e */
    const unitAt = (q: number): Unit | null => (q >= 0 && q < units.length ? units[q] : null);
    const slack = (q: number): number => { // leg between units[q-1] and units[q]
      const Uu = unitAt(q - 1), Vv = unitAt(q);
      const e = Vv ? Vv.i0 : nv;
      return EL[e] - (Uu ? Uu.sOut + endNeed(Uu, 1).need : 0) - (Vv ? Vv.sIn + endNeed(Vv, 0).need : 0);
    };
    const chainInput = (i0: number, i1: number): ChainInput => {
      const inp: ChainInput = { px: [], py: [], ux: [], uy: [], tau: [], manual: [] };
      for (let i = i0; i <= i1; i++) { inp.px.push(P(i).x); inp.py.push(P(i).y); inp.tau.push(tau[i]); inp.manual.push(manual[i]); }
      for (let e = i0; e <= i1 + 1; e++) { inp.ux.push(U[e].x); inp.uy.push(U[e].y); }
      return inp;
    };
    const applyChain = (u: Unit, sol: ChainSol) => {
      for (let i = u.i0; i <= u.i1; i++) Rv[i] = sol.R[i - u.i0];
      u.sIn = sol.sIn; u.sOut = sol.sOut; u.w = sol.w; u.lam = sol.lam;
    };

    /** distance of bend i from the straight line between its neighbours (−1: not between them) */
    const chordOffset = (i: number): number => {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1);
      const cx = p2.x - p0.x, cy = p2.y - p0.y, c2 = cx * cx + cy * cy;
      if (c2 < EPS_LEN * EPS_LEN) return -1;
      const t = ((p1.x - p0.x) * cx + (p1.y - p0.y) * cy) / c2;
      return t > 0 && t < 1 ? Math.abs((p1.x - p0.x) * cy - (p1.y - p0.y) * cx) / Math.sqrt(c2) : -1;
    };
    /**
     * An automatic bend that turns against its neighbour with no room for an S-curve between them, and
     * lies within EDIT_TOLERANCE of the straight line between its neighbours: the bend to leave out
     * (the one closest to that line), or −1. `lone`: only bends that turn against both neighbours.
     */
    const wiggle = (lone: boolean): number => {
      let best = -1, bestH = EDIT_TOLERANCE;
      for (let q = 1; q < units.length; q++) {
        const e = units[q].i0;
        if (legKind(e) !== 'reverse' || slack(q) >= -EPS_LEN) continue;
        for (const i of [e - 1, e]) {
          if (manual[i] !== null || (lone && (legKind(i) !== 'reverse' || legKind(i + 1) !== 'reverse'))) continue;
          const h = chordOffset(i);
          if (h >= 0 && h < bestH) { bestH = h; best = i; }
        }
      }
      return best;
    };
    let drop = -1;

    for (let attempt = 0; attempt <= nv + 1; attempt++) {
      units = [];
      for (let i = 0; i < nv; i++) {
        Rv[i] = Rreq[i];
        units.push({ i0: i, i1: i, sIn: Rv[i] * tau[i], sOut: Rv[i] * tau[i], w: null, lam: 0 });
      }
      // a gentle automatic bend next to an opposite curve: the larger radius that holds two transitions
      // (R·Δ = lt) asks less of that leg than a plain arc with its straight
      for (let q = 0; q < units.length; q++) {
        const u = units[q], i = u.i0;
        if (manual[i] !== null || d[i] === 0 || lt <= 0 || lt / d[i] <= plain) continue;
        if (!((legKind(i) === 'reverse' && slack(q) < -EPS_LEN) || (legKind(i + 1) === 'reverse' && slack(q + 1) < -EPS_LEN))) continue;
        const old = Rv[i], was = [slack(q), slack(q + 1)];
        Rv[i] = Math.ceil(lt / d[i] / 5 - 1e-9) * 5;
        u.sIn = u.sOut = Rv[i] * tau[i];
        // kept unless it makes a leg worse that is (still) short of room; the neighbour may yet do the same
        const now = [slack(q), slack(q + 1)];
        if ((now[0] < -EPS_LEN && now[0] < was[0]) || (now[1] < -EPS_LEN && now[1] < was[1])) { Rv[i] = old; u.sIn = u.sOut = old * tau[i]; }
      }
      /** join same-direction neighbours that have no room for a straight with their transitions */
      const link = () => {
        for (let q = 1; q < units.length; q++) {
          const e = units[q].i0;
          const short = (qq: number) => legKind(units[qq].i0) === 'same' && !noChain[units[qq].i0] && slack(qq) < -EPS_LEN;
          if (!short(q)) continue;
          // take the whole run of neighbours that are short of room in one go (one solve instead of one per bend)
          let qe = q;
          while (qe + 1 < units.length && short(qe + 1)) qe++;
          let sol: ChainSol | null = null;
          for (;;) { // if the whole run cannot be one curve, try half of it, and so on
            sol = solveChain(chainInput(units[q - 1].i0, units[qe].i1), rules, null, null, EDIT_TOLERANCE);
            if (sol || qe === q) break;
            qe = q + ((qe - q) >> 1);
          }
          if (!sol) { noChain[e] = 1; continue; }
          const u: Unit = { i0: units[q - 1].i0, i1: units[qe].i1, sIn: 0, sOut: 0, w: null, lam: 0 };
          applyChain(u, sol);
          units.splice(q - 1, qe - q + 2, u);
          q = Math.max(0, q - 2); // the grown curve may now reach its predecessor
        }
      };
      /**
       * A curve short of room next to an opposite curve or a route end: pull its outer tangent(s) in. Only a
       * compound curve can give way (its radii rebalance), so a single arc is first joined with a
       * same-direction neighbour on its other side. Kept only if every rule then holds.
       */
      const pull = (): boolean => {
        let any = false;
        const fails = (q: number, e: number) => legKind(e) !== 'same' && slack(q) < -EPS_LEN;
        for (let q = 0; q < units.length; q++) {
          const u0 = units[q];
          if (d[u0.i0] === 0) continue;
          const failIn = fails(q, u0.i0), failOut = fails(q + 1, u0.i1 + 1);
          if (!failIn && !failOut) continue;
          let qa = q, qb = q;
          if (!isChain(u0)) {
            if (!failIn && q > 0 && legKind(u0.i0) === 'same' && !noChain[u0.i0]) qa = q - 1;
            else if (!failOut && q + 1 < units.length && legKind(u0.i1 + 1) === 'same' && !noChain[u0.i1 + 1]) qb = q + 1;
            else continue;
          }
          const backup = { units: units.map((u) => ({ ...u })), Rv: Rv.slice() };
          let good = false;
          // first with the far end free to move; if that breaks the far leg, with the far end held where it is
          for (const pin of [false, true]) {
            good = true;
            let u = units[q];
            if (qa !== qb) {
              u = { i0: units[qa].i0, i1: units[qb].i1, sIn: 0, sOut: 0, w: null, lam: 0 };
              const sol = solveChain(chainInput(u.i0, u.i1), rules, null, null, EDIT_TOLERANCE);
              if (sol) { applyChain(u, sol); units.splice(qa, 2, u); } else good = false;
            }
            let fixIn: number | null = null, fixOut: number | null = null;
            for (let it = 0; good && it < 3; it++) { // the room a transition needs changes a little with the radii
              const dIn = legKind(u.i0) !== 'same' ? -slack(qa) : 0, dOut = legKind(u.i1 + 1) !== 'same' ? -slack(qa + 1) : 0;
              if (dIn <= EPS_LEN && dOut <= EPS_LEN) break;
              if (dIn > EPS_LEN) fixIn = u.sIn - dIn - 0.05; else if (pin && fixIn === null) fixIn = u.sIn;
              if (dOut > EPS_LEN) fixOut = u.sOut - dOut - 0.05; else if (pin && fixOut === null) fixOut = u.sOut;
              const sol = solveChain(chainInput(u.i0, u.i1), rules, fixIn, fixOut, EDIT_TOLERANCE);
              if (sol && sol.ok) applyChain(u, sol); else good = false;
            }
            if (good && (fails(qa, u.i0) || fails(qa + 1, u.i1 + 1) || arcLenOf(u) < (mandatory(u) * lt) / 2 - EPS_LEN)) good = false;
            // … and joining must not reshape curves that were fine: no arc may move by more than the tolerance
            if (good && qa !== qb) {
              for (let i = u.i0; i <= u.i1; i++) {
                if (Math.abs(Rv[i] - backup.Rv[i]) * (Math.sqrt(1 + tau[i] * tau[i]) - 1) > EDIT_TOLERANCE) good = false;
              }
            }
            if (good) break;
            units = backup.units.map((v) => ({ ...v }));
            for (let i = 0; i < nv; i++) Rv[i] = backup.Rv[i];
          }
          if (good) { any = true; q = qa; }
        }
        return any;
      };
      link();
      // a bend that merely wiggles against the curve around it is left out before anything gives way to it
      drop = wiggle(true);
      if (drop >= 0) break;
      for (let round = 0; round < 5; round++) {
        if (!pull()) break;
        link(); // a pulled curve may now need joining with its far neighbour: go round again
      }
      // physical overlap of tangents: share the leg in proportion (the checks report it from the
      // unreduced values); a compound curve is re-solved into its share, or dissolved if that fails
      Teff = units.map((u) => ({ in: u.sIn, out: u.sOut }));
      let failed: Unit | null = null;
      for (let q = 0; q <= units.length && !failed; q++) {
        const Uu = unitAt(q - 1), Vv = unitAt(q);
        const e = Vv ? Vv.i0 : nv;
        const tU = Uu ? Uu.sOut : 0, tV = Vv ? Vv.sIn : 0;
        if (tU + tV <= EL[e] + 1e-9) continue;
        // (a compound curve may begin past its first bend: a tangent length ≤ 0 leaves the other one all the room)
        if (Uu && tU > 0) Teff[q - 1].out = tV > 0 ? EL[e] * (tU / (tU + tV)) : EL[e] - tV;
        if (Vv && tV > 0) Teff[q].in = tU > 0 ? EL[e] * (tV / (tU + tV)) : EL[e] - tU;
      }
      for (let q = 0; q < units.length && !failed; q++) {
        const u = units[q], te = Teff[q];
        const cutIn = te.in < u.sIn, cutOut = te.out < u.sOut;
        if (!cutIn && !cutOut) continue;
        if (!isChain(u)) { te.in = te.out = Math.min(te.in, te.out); continue; }
        // (no tolerance here: this only keeps the line continuous where the checks already complain)
        // the other end stays where it is if possible, so that the squeeze cannot start an overlap there
        const sol = solveChain(chainInput(u.i0, u.i1), rules, te.in, te.out)
          ?? solveChain(chainInput(u.i0, u.i1), rules, cutIn ? te.in : null, cutOut ? te.out : null);
        if (!sol) { failed = u; break; }
        applyChain(u, sol); // the far end may have moved: the scan below checks every leg again
        te.in = sol.sIn; te.out = sol.sOut;
      }
      if (!failed) {
        for (let q = 0; q <= units.length && !failed; q++) {
          const e = q < units.length ? units[q].i0 : nv;
          if ((q > 0 ? Teff[q - 1].out : 0) + (q < units.length ? Teff[q].in : 0) > EL[e] + 1e-6) {
            failed = (q < units.length && isChain(units[q]) ? units[q] : null) ?? (q > 0 && isChain(units[q - 1]) ? units[q - 1] : null)
              ?? units.find(isChain) ?? null;
            if (!failed) break; // cannot happen for single arcs (shares add up to the leg)
          }
        }
      }
      if (!failed) { drop = wiggle(false); break; }
      for (let e = failed.i0 + 1; e <= failed.i1; e++) noChain[e] = 1;
    }
    return { nv, P, EL, U, raw, d, dir, tau, manual, Rv, units, Teff, noChain, legKind, endNeed, mandatory, isChain, maxOffsetOf, drop, chordOffset };
  }

  // ---- elements ----
  const elements: Element[] = [];
  const curves: CurveInfo[] = [];
  const unitInfo: UnitInfo[] = [];
  const lineStart: { s: number; x: number; y: number; len: number }[] = [];
  const curveOf: (CurveInfo | null)[] = new Array(m).fill(null);
  let s = 0;
  let cur: Vec2 = { x: a.x, y: a.y };
  const line = (e: number, to: Vec2) => {
    const len = Math.max(0, (to.x - cur.x) * U[e].x + (to.y - cur.y) * U[e].y);
    lineStart[e] = { s, x: cur.x, y: cur.y, len };
    if (len > EPS_LEN) {
      elements.push({ kind: 'line', s0: s, len, x0: cur.x, y0: cur.y, dx: U[e].x, dy: U[e].y });
      s += len;
      cur = { x: cur.x + U[e].x * len, y: cur.y + U[e].y * len };
    }
  };
  units.forEach((u, q) => {
    const chain = isChain(u);
    const tIn = Teff[q].in;
    line(u.i0, { x: P(u.i0).x - U[u.i0].x * tIn, y: P(u.i0).y - U[u.i0].y * tIn });
    const sStart = s;
    let arcTotal = 0;
    for (let i = u.i0; i <= u.i1; i++) {
      const k = keep[i];
      // single arcs: the radius that fits the (possibly reduced) tangent
      const rEff = chain ? Rv[i] : d[i] > EPS_ANG ? Math.min(Teff[q].in, Teff[q].out) / tau[i] : Rv[i];
      const s0 = s;
      if (i > u.i0) lineStart[i] = { s, x: cur.x, y: cur.y, len: 0 }; // arcs meet: no straight on this leg
      if (d[i] > EPS_ANG && rEff > 1e-6) {
        const nx = -U[i].y * dir[i], ny = U[i].x * dir[i];
        const cx = cur.x + nx * rEff, cy = cur.y + ny * rEff;
        const len = rEff * d[i];
        elements.push({ kind: 'arc', s0: s, len, cx, cy, r: rEff, a0: Math.atan2(cur.y - cy, cur.x - cx), dir: dir[i], pi: k });
        s += len;
        arcTotal += len;
        const ox = -U[i + 1].y * dir[i], oy = U[i + 1].x * dir[i];
        cur = { x: cx - ox * rEff, y: cy - oy * rEff };
      } else if (!chain) {
        cur = { x: P(i).x, y: P(i).y };
      }
      const t = Rv[i] * tau[i];
      const c: CurveInfo = {
        index: k, x: P(i).x, y: P(i).y, delta: raw[i], dir: dir[i], r: Rv[i], rEff, t,
        tTransition: t + (d[i] > 0 && Rv[i] < plain - 1e-9 ? transitionExtra(Rv[i], d[i], lt) : 0),
        arcLen: s - s0, sStart: s0, sEnd: s, auto: manual[i] === null, tooSharp: raw[i] > MAX_DEFLECTION,
        unit: d[i] > 0 ? unitInfo.length : -1, ignored: false, offset: 0,
      };
      curveOf[k] = c;
    }
    if (d[u.i0] > 0) {
      const maxOffset = maxOffsetOf(u);
      unitInfo.push({
        first: keep[u.i0], last: keep[u.i1], sStart, sEnd: s, arcLen: arcTotal,
        transitions: lt > 0 ? mandatory(u) : 0, smoothing: chain ? u.lam : 0, maxOffset,
      });
    }
  });
  line(nv, b);
  // a route of no length still has a place
  if (!elements.length) elements.push({ kind: 'line', s0: 0, len: 0, x0: a.x, y0: a.y, dx: U[0].x, dy: U[0].y });
  // bends without geometry of their own (collinear, duplicate or left-out points): station of the point
  // on its leg, never before the bend listed before it
  {
    let e = 0, last = 0;
    for (let k = 0; k < m; k++) {
      while (e < nv && keep[e] < k) e++;
      if (e < nv && keep[e] === k) { curves.push(curveOf[k]!); last = curveOf[k]!.sEnd; continue; }
      const ls = lineStart[e];
      const along = Math.min(Math.max((pis[k].x - ls.x) * U[e].x + (pis[k].y - ls.y) * U[e].y, 0), ls.len);
      const r = pis[k].r ?? rules.minRadius;
      last = Math.max(last, ls.s + along);
      curves.push({
        index: k, x: pis[k].x, y: pis[k].y, delta: 0, dir: 1, r, rEff: r, t: 0, tTransition: 0, arcLen: 0,
        sStart: last, sEnd: last, auto: pis[k].r === null, tooSharp: false, unit: -1,
        ignored: ignored.has(k), offset: ignored.get(k) ?? 0,
      });
    }
  }

  // ---- joints (one per effective leg) and legs (one per polygon leg) ----
  const joints: JointInfo[] = [];
  const unitOfVertex: number[] = new Array(nv).fill(0);
  units.forEach((u, q) => { for (let i = u.i0; i <= u.i1; i++) unitOfVertex[i] = q; });
  for (let e = 0; e <= nv; e++) {
    const qa = e > 0 ? unitOfVertex[e - 1] : -1, qb = e < nv ? unitOfVertex[e] : -1;
    const from = e > 0 ? keep[e - 1] : -1, to = e < nv ? keep[e] : -1;
    const ca = from >= 0 ? curveOf[from]! : null, cb = to >= 0 ? curveOf[to]! : null;
    const s0 = ca ? ca.sStart : 0, s1 = cb ? cb.sEnd : s;
    if (qa >= 0 && qa === qb) {
      const u = units[qa];
      joints.push({
        from, to, length: EL[e], kind: 'compound', tFrom: ca!.t, tTo: cb!.t, needFrom: 0, needTo: 0, plainFrom: true, plainTo: true,
        offset: (u.w ? u.w[e - 1 - u.i0] : 0) * dir[e], joinFailed: false, s0, s1,
      });
      continue;
    }
    const na = qa >= 0 ? endNeed(units[qa], 1) : { need: 0, plain: true };
    const nb = qb >= 0 ? endNeed(units[qb], 0) : { need: 0, plain: true };
    const kind = legKind(e);
    joints.push({
      from, to, length: EL[e], kind, tFrom: qa >= 0 ? units[qa].sOut : 0, tTo: qb >= 0 ? units[qb].sIn : 0,
      needFrom: na.need, needTo: nb.need, plainFrom: na.plain, plainTo: nb.plain, offset: 0,
      joinFailed: kind === 'same' && noChain[e] === 1, s0, s1,
    });
  }
  const legs: LegInfo[] = [];
  {
    let e = 0;
    for (let i = 0; i <= m; i++) { // polygon leg i ends at PI i (or B)
      while (e < nv && keep[e] < i) e++;
      const j = joints[e];
      legs.push({ index: i, length: j.length, used: j.kind === 'compound' ? j.length : j.tFrom + j.needFrom + j.tTo + j.needTo });
    }
  }
  return { elements, length: s, curves, legs, units: unitInfo, joints, rules };
}

export interface PointOnAlignment { x: number; y: number; /** unit tangent */ tx: number; ty: number; curvature: number }

/** Evaluate position at station s (clamped). `hint` speeds up monotone scans. */
export function pointAt(al: Alignment, s: number, out?: PointOnAlignment, hint = 0): PointOnAlignment {
  const els = al.elements;
  const o = out ?? { x: 0, y: 0, tx: 1, ty: 0, curvature: 0 };
  if (els.length === 0) return o;
  let i = Math.min(Math.max(hint, 0), els.length - 1);
  while (i > 0 && s < els[i].s0) i--;
  while (i < els.length - 1 && s > els[i].s0 + els[i].len) i++;
  const e = els[i];
  const u = Math.min(Math.max(s - e.s0, 0), e.len);
  if (e.kind === 'line') {
    o.x = e.x0 + e.dx * u; o.y = e.y0 + e.dy * u; o.tx = e.dx; o.ty = e.dy; o.curvature = 0;
  } else {
    const ang = e.a0 + e.dir * (u / e.r);
    o.x = e.cx + e.r * Math.cos(ang);
    o.y = e.cy + e.r * Math.sin(ang);
    // tangent is perpendicular to radius vector, rotated by dir
    o.tx = -Math.sin(ang) * e.dir;
    o.ty = Math.cos(ang) * e.dir;
    o.curvature = e.dir / e.r;
  }
  return o;
}

export interface Stationing {
  n: number;
  ds: number;
  s: Float64Array;
  x: Float64Array;
  y: Float64Array;
  /** unit tangent */
  tx: Float64Array;
  ty: Float64Array;
}

/** Sample the alignment at a uniform spacing close to `step` metres (both ends included). */
export function station(al: Alignment, step: number): Stationing {
  const segs = Math.max(1, Math.ceil(al.length / step));
  const ds = al.length / segs;
  const n = segs + 1;
  const st: Stationing = {
    n, ds, s: new Float64Array(n), x: new Float64Array(n), y: new Float64Array(n),
    tx: new Float64Array(n), ty: new Float64Array(n),
  };
  const p: PointOnAlignment = { x: 0, y: 0, tx: 1, ty: 0, curvature: 0 };
  let hint = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    while (hint < al.elements.length - 1 && s > al.elements[hint].s0 + al.elements[hint].len) hint++;
    pointAt(al, s, p, hint);
    st.s[i] = s; st.x[i] = p.x; st.y[i] = p.y; st.tx[i] = p.tx; st.ty[i] = p.ty;
  }
  return st;
}

/** Index of the leg (segment between consecutive points of [A, ...pis, B]) nearest to p. */
export function nearestLeg(a: Vec2, b: Vec2, pis: Vec2[], p: Vec2): number {
  const pts = [a, ...pis, b];
  let best = 0, bd = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(p, pts[i], pts[i + 1]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
