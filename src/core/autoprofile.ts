// Automatic grade line by dynamic programming over knots every ~250 m.
// State at knot k: (elevation z_k on a u-metre grid anchored at A, incoming grade as integer
// dz_k = z_k − z_{k−1} in grid units). Constraints: |dz|·u ≤ g_max·Δ (with a small margin for the
// final endpoint correction); grade changes limited so that a vertical curve of the minimum radius
// fits within one knot spacing (|Δg| ≤ Δ / R_min, crest or sag), which also guarantees that
// neighbouring curves never overlap. Cost: per-metre cost f(h) of grade-minus-ground h along the
// centreline (earthworks / bridge / tunnel, whichever is cheaper), a penalty where a required
// clearance (river / railway crossing) is not met, and a small penalty per VPI.
// The returned `feasible` flag comes from checking the reconstructed profile, not from the search.

import { buildProfile, type VPI } from './vertical';

export interface AutoProfileOptions {
  maxGradient: number;
  minCrest: number;
  minSag: number;
  /** cost per metre of road for a grade-minus-ground difference h (m) */
  costPerM: (h: number) => number;
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
}

const H_MAX = 100;
const H_STEP = 0.05;
/** CZK per required-clearance station that is not met */
const CLEARANCE_PENALTY = 1e8;
/** extra clearance asked of the polyline grade: vertical curves later shave up to ~1 m off crests */
const CLEARANCE_MARGIN = 1.0;
/** the DP evaluates the cost on every k-th station only (≈ 20 m) */
const DP_STATION_STEP = 20;

function buildLut(f: (h: number) => number): Float64Array {
  const m = Math.round((2 * H_MAX) / H_STEP) + 1;
  const lut = new Float64Array(m);
  for (let i = 0; i < m; i++) lut[i] = f(-H_MAX + i * H_STEP);
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
  const lut = buildLut(opt.costPerM);
  const lutMax = lut.length - 1;
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

  // attempts: normal band; wide band (deep tunnels / high viaducts) at a 2 m grid; then relaxed grades
  // rugged routes (wide ground envelope) are searched on a 2 m grid to bound the work
  let band = 0;
  for (let k = 0; k <= nK; k++) band += gmaxEnv[k] - gmin[k] + 2 * pad;
  const u0 = band / (nK + 1) > 150 ? 2 : 1;
  const attempts: [number, number, number][] = [
    [opt.maxGradient, pad, u0], [opt.maxGradient, pad * 5, 2],
    [opt.maxGradient * 1.5, pad, 1], [opt.maxGradient * 2.5, pad, 2],
  ];
  for (const [gm, pd, u] of attempts) {
    const res = solve(gm, pd, u);
    if (!res) continue;
    const ok = profileOk(res.vpis, opt.maxGradient, opt.minCrest, opt.minSag);
    // a relaxed (non-compliant) search result never beats a compliant straight grade
    if (!ok && straightOk) return { vpis: straight, feasible: true, cost: Infinity };
    return { ...res, feasible: ok };
  }
  return { vpis: straight, feasible: straightOk, cost: Infinity };

  /** DP with elevations on a grid of u metres anchored at zA; dz values are in grid units */
  function solve(gmax: number, padM: number, u: number): AutoProfileResult | null {
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
      let a = Math.max(Math.floor((gmin[k] - padM - zA) / u), rlo);
      let b = Math.min(Math.ceil((gmaxEnv[k] + padM - zA) / u), rhi);
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
            c += (j >= lutMax ? lut[lutMax] : lut[j] + (lut[j + 1] - lut[j]) * (x - j)) * wi;
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
    for (let k = 1; k < nK; k++) if (dzs[k + 1] !== dzs[k]) vpis.push({ s: k * D, z: zAt(k), r: null });
    vpis.push({ s: L, z: zB, r: null });
    return { vpis, feasible: true, cost: best };
  }
}
