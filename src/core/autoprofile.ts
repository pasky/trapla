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

import { buildProfile, type VPI } from './vertical';

export interface BalanceSearch {
  /** cost per metre of road for grade-minus-ground h, given the value of a m³ of fill material */
  costFor: (materialValue: number) => (h: number, costClass: number) => number;
  /** usable cut minus fill of a grade line, m³ (> 0 = surplus to tip, < 0 = fill to buy) */
  balanceOf: (vpis: VPI[], materialValue: number) => number;
  start: number;
  lo: number;
  hi: number;
  /** stop when |balance| is below this, m³ */
  tolerance: number;
}

export interface AutoProfileOptions {
  maxGradient: number;
  minCrest: number;
  minSag: number;
  /** cost per metre of road for a grade-minus-ground difference h (m); ignored when `balance` is set */
  costPerM: (h: number, costClass: number) => number;
  /** Categorical per-station cost model (e.g. mapped geology); one cached height LUT per class. */
  costClasses?: ArrayLike<number>;
  /** search for the material value that balances cut and fill (see BalanceSearch) */
  balance?: BalanceSearch;
  /** optional per-station minimum h (NaN = none), e.g. bridge clearance over a river */
  minH?: ArrayLike<number>;
  knotSpacing?: number;
  /** penalty per grade change, CZK (keeps the line calm) */
  vpiPenalty?: number;
  /** search band above/below the local ground envelope, m */
  pad?: number;
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
}

const H_MAX = 100;
const H_STEP = 0.05;
/** CZK per required-clearance station that is not met */
const CLEARANCE_PENALTY = 1e8;
/** extra clearance asked of the polyline grade: vertical curves later shave up to ~1 m off crests */
const CLEARANCE_MARGIN = 1.0;
/** the DP evaluates the cost on every k-th station only (≈ 20 m) */
const DP_STATION_STEP = 20;
/** elevation grids of the coarse and the fine pass, m */
const COARSE_GRID = 2, FINE_GRID = 1;
/** the fine pass searches this far above / below the coarse line, m */
const FINE_BAND = 6;
/** fine passes spent on the mass-balance search (incl. the first) */
const BALANCE_EVALS = 4;

function buildLut(f: (h: number, costClass: number) => number, classes: number): Float64Array {
  const m = Math.round((2 * H_MAX) / H_STEP) + 1;
  const lut = new Float64Array(m * classes);
  for (let k = 0; k < classes; k++) for (let i = 0; i < m; i++) lut[k * m + i] = f(-H_MAX + i * H_STEP, k);
  return lut;
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
  const zA = g[0], zB = g[n - 1];
  const straight: VPI[] = [{ s: 0, z: zA, r: null }, { s: L, z: zB, r: null }];
  const straightOk = Math.abs(zB - zA) <= opt.maxGradient * L + 1e-9;
  const spacing = opt.knotSpacing ?? 250;
  if (L < 2 * spacing * 0.8) return { vpis: straight, feasible: straightOk, cost: Infinity };
  const nK = Math.max(2, Math.round(L / spacing));
  const D = L / nK;
  const ds = n > 1 ? s[1] - s[0] : L;
  const stride = Math.max(1, Math.round(DP_STATION_STEP / ds));
  const lutMax = Math.round((2 * H_MAX) / H_STEP);
  const lutOffsets = new Int32Array(n);
  let classes = 1;
  for (let i = 0; i < n; i++) {
    const k = opt.costClasses?.[i] ?? 0;
    classes = Math.max(classes, k + 1);
    lutOffsets[i] = k * (lutMax + 1);
  }
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
      const end = (k + 1) * D + 1e-6;
      while (i < n && s[i] <= end) i++;
      last[k] = i - 1;
    }
    last[nK - 1] = n - 1;
  }
  for (let k = 0; k < nK; k++) {
    clrStart[k] = clrIdx.length;
    if (opt.minH) for (let i = first[k]; i <= last[k]; i++) if (opt.minH[i] > -Infinity) clrIdx.push(i);
  }
  clrStart[nK] = clrIdx.length;
  const minH = opt.minH;
  // ground envelope per knot (min/max ground within ±3 knot spacings)
  const win = 3 * D;
  const gmin = new Float64Array(nK + 1), gmaxEnv = new Float64Array(nK + 1);
  for (let k = 0; k <= nK; k++) {
    const sk = k * D;
    let mn = Infinity, mx = -Infinity;
    const i0 = Math.max(0, Math.floor((sk - win) / ds)), i1 = Math.min(n - 1, Math.ceil((sk + win) / ds));
    for (let i = i0; i <= i1; i++) { const v = g[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    gmin[k] = mn; gmaxEnv[k] = mx;
  }

  const ok = (r: Solved | null): r is Solved => !!r && profileOk(r.vpis, opt.maxGradient, opt.minCrest, opt.minSag);
  /**
   * coarse pass: normal band, then a wide one (deep tunnels / high viaducts); if the coarse grid finds
   * nothing compliant (its grade steps are twice as large, which matters near the gradient limit),
   * the fine grid over the whole band
   */
  const coarse = (lut: Float64Array): Solved | null => {
    for (const [u, pd] of [[COARSE_GRID, pad], [COARSE_GRID, pad * 5], [FINE_GRID, pad]]) {
      const r = solve(lut, opt.maxGradient, u, pd, null);
      if (ok(r)) return r;
    }
    return null;
  };
  /** fine pass around a coarse line; keeps the coarse line if the fine one is not compliant */
  const refine = (lut: Float64Array, c: Solved): Solved => {
    const f = solve(lut, opt.maxGradient, FINE_GRID, FINE_BAND, c.z);
    return ok(f) ? f : c;
  };
  /** last resort when no compliant line was found: relaxed gradients, reported as not feasible */
  const relaxed = (lut: Float64Array): AutoProfileResult => {
    if (straightOk) return { vpis: straight, feasible: true, cost: Infinity };
    for (const [gm, u] of [[opt.maxGradient * 1.5, 1], [opt.maxGradient * 2.5, 2]]) {
      const r = solve(lut, gm, u, pad, null);
      if (r) return { vpis: r.vpis, cost: r.cost, feasible: ok(r) };
    }
    return { vpis: straight, feasible: false, cost: Infinity };
  };

  const bal = opt.balance;
  if (!bal) {
    const lut = buildLut(opt.costPerM, classes);
    const c = coarse(lut);
    if (!c) return relaxed(lut);
    const f = refine(lut, c);
    return { vpis: f.vpis, cost: f.cost, feasible: true };
  }
  // mass-balance search: one coarse pass fixes the corridor, then the fine pass is repeated within
  // it for a few material values. The balance grows with the value (more cut, less fill), so the
  // root is bracketed and interpolated. (The coarse line's own balance is no proxy for the fine one's.)
  const clampV = (v: number) => Math.max(bal.lo, Math.min(bal.hi, v));
  let v = clampV(bal.start);
  let lut = buildLut(bal.costFor(v), classes);
  const c = coarse(lut);
  if (!c) return { ...relaxed(lut), materialValue: v };
  let best = refine(lut, c);
  let bestV = v, bestB = bal.balanceOf(best.vpis, v);
  let neg: [number, number] | null = bestB < 0 ? [v, bestB] : null; // [value, balance] with a deficit
  let pos: [number, number] | null = bestB >= 0 ? [v, bestB] : null; // … with a surplus
  let step = (bal.hi - bal.lo) / 12;
  for (let it = 1; it < BALANCE_EVALS && Math.abs(bestB) > bal.tolerance; it++) {
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
    lut = buildLut(bal.costFor(v), classes);
    const f = solve(lut, opt.maxGradient, FINE_GRID, FINE_BAND, c.z);
    if (!ok(f)) break;
    const b = bal.balanceOf(f.vpis, v);
    if (b < 0) { if (!neg || v > neg[0]) neg = [v, b]; } else if (!pos || v < pos[0]) pos = [v, b];
    if (Math.abs(b) < Math.abs(bestB)) { best = f; bestV = v; bestB = b; }
  }
  return { vpis: best.vpis, cost: best.cost, feasible: true, materialValue: bestV, balance: bestB };

  /**
   * DP with elevations on a grid of u metres anchored at zA; dz values are in grid units. The band
   * searched at each knot is the ground envelope ± padM, or `around[k]` ± padM when given.
   */
  function solve(lut: Float64Array, gmax: number, u: number, padM: number, around: Float64Array | null): Solved | null {
    // the end correction below spreads ≤ u/2 over the route: keep that much grade in reserve
    const dzMax = Math.floor(((gmax - u / L) * D) / u + 1e-9);
    const crestLim = Math.floor((D * D) / opt.minCrest / u + 1e-9);
    const sagLim = Math.floor((D * D) / opt.minSag / u + 1e-9);
    if (dzMax < 1) return null;
    const ND = 2 * dzMax + 1;
    const uB = Math.round((zB - zA) / u); // end knot in grid units relative to zA
    const zlo = new Int32Array(nK + 1), zhi = new Int32Array(nK + 1);
    for (let k = 0; k <= nK; k++) {
      const rlo = Math.max(-dzMax * k, uB - dzMax * (nK - k));
      const rhi = Math.min(dzMax * k, uB + dzMax * (nK - k));
      if (rlo > rhi) return null;
      let a = Math.max(Math.floor(((around ? around[k] : gmin[k]) - padM - zA) / u), rlo);
      let b = Math.min(Math.ceil(((around ? around[k] : gmaxEnv[k]) + padM - zA) / u), rhi);
      if (k === 0) { a = 0; b = 0; }
      if (k === nK) { a = uB; b = uB; }
      if (a > b) { a = rlo; b = rhi; } // ground band unreachable: use the reachable set
      zlo[k] = a; zhi[k] = b;
    }
    let cur = new Float64Array(ND).fill(Infinity);
    cur[dzMax] = 0; // knot 0 (dz is ignored there: any first grade is allowed)
    const parents: Int32Array[] = [];
    const seg = new Float64Array(ND);
    for (let k = 0; k < nK; k++) {
      const Z0 = zhi[k] - zlo[k] + 1, Z1 = zhi[k + 1] - zlo[k + 1] + 1;
      const next = new Float64Array(Z1 * ND).fill(Infinity);
      const par = new Int32Array(Z1 * ND).fill(-1);
      const fi = first[k], la = last[k];
      const sk = k * D;
      const w = ds * stride;
      for (let zi = 0; zi < Z0; zi++) {
        let any = false;
        for (let d = 0; d < ND; d++) if (cur[zi * ND + d] < Infinity) { any = true; break; }
        if (!any) continue;
        const z = zlo[k] + zi;
        const zm = zA + z * u;
        for (let d2 = 0; d2 < ND; d2++) {
          const dz2 = d2 - dzMax;
          const z2 = z + dz2;
          if (z2 < zlo[k + 1] || z2 > zhi[k + 1]) { seg[d2] = Infinity; continue; }
          let c = 0;
          const slope = (dz2 * u) / D;
          for (let i = fi; i <= la; i += stride) {
            const h = zm + slope * (s[i] - sk) - g[i];
            let x = (h + H_MAX) / H_STEP;
            if (x < 0) x = 0; else if (x > lutMax) x = lutMax;
            const j = x | 0;
            // each sample stands for `stride` stations (fewer in the interval's last block)
            const wi = i + stride <= la + 1 ? w : (la + 1 - i) * ds;
            const q = lutOffsets[i] + j;
            c += (j >= lutMax ? lut[q] : lut[q] + (lut[q + 1] - lut[q]) * (x - j)) * wi;
          }
          for (let q = clrStart[k]; q < clrStart[k + 1]; q++) {
            const i = clrIdx[q];
            if (zm + slope * (s[i] - sk) - g[i] < minH![i] + CLEARANCE_MARGIN) c += CLEARANCE_PENALTY;
          }
          seg[d2] = c;
        }
        for (let d = 0; d < ND; d++) {
          const base = cur[zi * ND + d];
          if (base === Infinity) continue;
          const dz = d - dzMax;
          // knot 0 has no incoming grade: any first grade is allowed
          const dmin = k === 0 ? -dzMax : Math.max(-dzMax, dz - crestLim);
          const dmax = k === 0 ? dzMax : Math.min(dzMax, dz + sagLim);
          for (let dz2 = dmin; dz2 <= dmax; dz2++) {
            const d2 = dz2 + dzMax;
            const sc = seg[d2];
            if (sc === Infinity) continue;
            const st = (z + dz2 - zlo[k + 1]) * ND + d2;
            const v = base + sc + (k > 0 && dz2 !== dz ? penalty : 0);
            if (v < next[st]) { next[st] = v; par[st] = zi * ND + d; }
          }
        }
      }
      parents.push(par);
      cur = next;
    }
    let best = Infinity, bi = -1;
    for (let d = 0; d < ND; d++) if (cur[d] < best) { best = cur[d]; bi = d; }
    if (bi < 0) return null;
    const zs = new Float64Array(nK + 1);
    const dzs = new Int32Array(nK + 1);
    let st = bi;
    for (let k = nK; k >= 1; k--) {
      const zi = Math.floor(st / ND), d = st % ND;
      zs[k] = zlo[k] + zi;
      dzs[k] = d - dzMax;
      st = parents[k - 1][st];
    }
    // grid → metres, with a linear correction so that B is met exactly (|corr| ≤ u/2)
    const corr = zB - (zA + uB * u);
    const zAt = (k: number) => zA + zs[k] * u + (corr * k) / nK;
    const vpis: VPI[] = [{ s: 0, z: zA, r: null }];
    const z = new Float64Array(nK + 1);
    z[0] = zA; z[nK] = zB;
    for (let k = 1; k < nK; k++) {
      z[k] = zAt(k);
      if (dzs[k + 1] !== dzs[k]) vpis.push({ s: k * D, z: z[k], r: null });
    }
    vpis.push({ s: L, z: zB, r: null });
    return { vpis, cost: best, z };
  }
}

/** a DP solution: the VPIs, the objective and the elevation at every knot */
interface Solved { vpis: VPI[]; cost: number; z: Float64Array }
