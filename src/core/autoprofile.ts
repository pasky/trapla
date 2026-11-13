// Automatic grade line by dynamic programming over knots every ~200 m.
// State at knot k: (elevation z_k on a 1 m grid, incoming grade as integer dz_k = z_k − z_{k−1}).
// Constraints: |dz| ≤ g_max·Δ; grade changes limited so that a vertical curve of the minimum radius
// fits within one knot spacing (|Δg| ≤ Δ / R_min, crest or sag), which also guarantees that
// neighbouring curves never overlap. Cost: per-metre cost f(h) of grade-minus-ground h along the
// centreline (earthworks / bridge / tunnel, whichever is cheaper) + a small penalty per VPI.

import type { VPI } from './vertical';

export interface AutoProfileOptions {
  maxGradient: number;
  minCrest: number;
  minSag: number;
  /** cost per metre of road for a grade-minus-ground difference h (m) */
  costPerM: (h: number) => number;
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

function buildLut(f: (h: number) => number): Float64Array {
  const m = Math.round((2 * H_MAX) / H_STEP) + 1;
  const lut = new Float64Array(m);
  for (let i = 0; i < m; i++) lut[i] = f(-H_MAX + i * H_STEP);
  return lut;
}

export function autoProfile(s: ArrayLike<number>, g: ArrayLike<number>, opt: AutoProfileOptions): AutoProfileResult {
  const n = s.length;
  const L = s[n - 1];
  const spacing = opt.knotSpacing ?? 250;
  const nK = Math.max(2, Math.round(L / spacing));
  const D = L / nK;
  const ds = n > 1 ? s[1] - s[0] : L;
  const zA = Math.round(g[0]);
  const zB = Math.round(g[n - 1]);
  const lut = buildLut(opt.costPerM);
  const lutMax = lut.length - 1;
  const pad = opt.pad ?? 25;
  const penalty = opt.vpiPenalty ?? 1e6;

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
  const attempts: [number, number, number][] = [
    [opt.maxGradient, pad, 1], [opt.maxGradient, pad * 5, 2],
    [opt.maxGradient * 1.5, pad, 1], [opt.maxGradient * 2.5, pad, 2],
  ];
  for (const [gm, pd, u] of attempts) {
    const res = solve(gm, pd, u, gm > opt.maxGradient);
    if (res) return res;
  }
  // give up: straight grade A→B
  return { vpis: [{ s: 0, z: zA, r: null }, { s: L, z: zB, r: null }], feasible: false, cost: Infinity };

  /** DP with elevations on a grid of u metres; dz values are in grid units */
  function solve(gmax: number, padM: number, u: number, relaxed: boolean): AutoProfileResult | null {
    const dzMax = Math.max(1, Math.floor((gmax * D) / u + 1e-9));
    const crestLim = Math.max(1, Math.floor((D * D) / opt.minCrest / u + 1e-9));
    const sagLim = Math.max(1, Math.floor((D * D) / opt.minSag / u + 1e-9));
    const ND = 2 * dzMax + 1;
    const uA = Math.round(zA / u), uB = Math.round(zB / u);
    const zlo = new Int32Array(nK + 1), zhi = new Int32Array(nK + 1);
    for (let k = 0; k <= nK; k++) {
      const rlo = Math.max(uA - dzMax * k, uB - dzMax * (nK - k));
      const rhi = Math.min(uA + dzMax * k, uB + dzMax * (nK - k));
      if (rlo > rhi) return null;
      let a = Math.max(Math.floor((gmin[k] - padM) / u), rlo);
      let b = Math.min(Math.ceil((gmaxEnv[k] + padM) / u), rhi);
      if (k === 0) { a = uA; b = uA; }
      if (k === nK) { a = uB; b = uB; }
      if (a > b) { a = rlo; b = rhi; } // ground band unreachable: use the reachable set
      zlo[k] = a; zhi[k] = b;
    }
    let cur = new Float64Array(ND).fill(0); // knot 0: any incoming grade, cost 0
    const parents: Int32Array[] = [];
    for (let k = 0; k < nK; k++) {
      const Z0 = zhi[k] - zlo[k] + 1, Z1 = zhi[k + 1] - zlo[k + 1] + 1;
      const next = new Float64Array(Z1 * ND).fill(Infinity);
      const par = new Int32Array(Z1 * ND).fill(-1);
      const fi = first[k], la = last[k];
      const sk = k * D;
      const seg = new Float64Array(ND);
      for (let zi = 0; zi < Z0; zi++) {
        // best incoming cost for this z (any dz) — skip unreachable z
        let any = false;
        for (let d = 0; d < ND; d++) if (cur[zi * ND + d] < Infinity) { any = true; break; }
        if (!any) continue;
        const z = zlo[k] + zi;
        const zm = z * u;
        // segment costs for each outgoing dz'
        for (let d2 = 0; d2 < ND; d2++) {
          const dz2 = d2 - dzMax;
          const z2 = z + dz2;
          if (z2 < zlo[k + 1] || z2 > zhi[k + 1]) { seg[d2] = Infinity; continue; }
          let c = 0;
          const slope = (dz2 * u) / D;
          for (let i = fi; i <= la; i++) {
            const h = zm + slope * (s[i] - sk) - g[i];
            let x = (h + H_MAX) / H_STEP;
            if (x < 0) x = 0; else if (x > lutMax) x = lutMax;
            const j = x | 0;
            c += j >= lutMax ? lut[lutMax] : lut[j] + (lut[j + 1] - lut[j]) * (x - j);
          }
          seg[d2] = c * ds;
        }
        for (let d = 0; d < ND; d++) {
          const base = cur[zi * ND + d];
          if (base === Infinity) continue;
          const dz = d - dzMax;
          const dmin = Math.max(-dzMax, dz - crestLim), dmax = Math.min(dzMax, dz + sagLim);
          for (let dz2 = dmin; dz2 <= dmax; dz2++) {
            const d2 = dz2 + dzMax;
            const sc = seg[d2];
            if (sc === Infinity) continue;
            const z2 = z + dz2;
            const st = (z2 - zlo[k + 1]) * ND + d2;
            const v = base + sc + (k > 0 && dz2 !== dz ? penalty : 0);
            if (v < next[st]) { next[st] = v; par[st] = zi * ND + d; }
          }
        }
      }
      parents.push(par);
      cur = next;
    }
    // end state: z = zB, best dz
    let best = Infinity, bi = -1;
    for (let d = 0; d < ND; d++) if (cur[d] < best) { best = cur[d]; bi = d; }
    if (bi < 0) return null;
    const zs = new Float64Array(nK + 1);
    const dzs = new Int32Array(nK + 1);
    let st = bi; // at knot nK, zi = 0
    for (let k = nK; k >= 1; k--) {
      const ND_ = ND;
      const zi = Math.floor(st / ND_), d = st % ND_;
      zs[k] = (zlo[k] + zi) * u;
      dzs[k] = d - dzMax;
      st = parents[k - 1][st];
    }
    zs[0] = uA * u;
    const vpis: VPI[] = [{ s: 0, z: uA * u, r: null }];
    for (let k = 1; k < nK; k++) if (dzs[k + 1] !== dzs[k]) vpis.push({ s: k * D, z: zs[k], r: null });
    vpis.push({ s: L, z: uB * u, r: null });
    return { vpis, feasible: !relaxed, cost: best };
  }
}
