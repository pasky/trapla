// Horizontal alignment: polyline of tangent-intersection points (PIs) from A to B, with a circular
// arc at every interior PI. Transition curves are not drawn but the room they need is checked.

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

export interface CurveInfo {
  /** index into the interior PI list */
  index: number;
  x: number; y: number;
  /** absolute deflection angle, rad */
  delta: number;
  /** +1 left turn, -1 right turn */
  dir: 1 | -1;
  /** requested radius (resolved from auto) */
  r: number;
  /** radius actually used for the drawn geometry (reduced if neighbouring arcs would overlap) */
  rEff: number;
  /** pure-arc tangent length R·tan(Δ/2) */
  t: number;
  /** tangent length including the transition curve shift, m */
  tTransition: number;
  /** arc length of the drawn geometry */
  arcLen: number;
  /** stations of the drawn arc start/end */
  sStart: number;
  sEnd: number;
  auto: boolean;
  /** deflection above MAX_DEFLECTION: no arc was built */
  tooSharp: boolean;
}

export interface LegInfo {
  index: number;
  length: number;
  /** tangent lengths (incl. transitions) consumed from each end */
  used: number;
}

export interface Alignment {
  elements: Element[];
  length: number;
  curves: CurveInfo[];
  legs: LegInfo[];
}

/** clothoid shift p and tangent offset k for a transition of length L into radius R */
export function transitionTangent(r: number, delta: number, lt: number): number {
  if (delta < 1e-9) return 0;
  const p = (lt * lt) / (24 * r);
  const k = lt / 2 - (lt * lt * lt) / (240 * r * r);
  return (r + p) * Math.tan(delta / 2) + k;
}

/** Smallest radius ≥ minRadius whose arc leaves room for two transitions of length lt (Δ ≥ lt/R). */
export function autoRadius(delta: number, minRadius: number, lt: number): number {
  if (delta < 1e-6) return minRadius;
  const r = Math.max(minRadius, lt / delta);
  return Math.ceil(r / 5) * 5;
}

export function buildAlignment(a: Vec2, b: Vec2, pis: PI[], minRadius: number, lt: number): Alignment {
  const pts: Vec2[] = [a, ...pis, b];
  const n = pts.length;
  const legLen: number[] = [];
  const ux: number[] = [], uy: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
    const L = Math.hypot(dx, dy);
    legLen.push(L);
    ux.push(L > 1e-9 ? dx / L : 1);
    uy.push(L > 1e-9 ? dy / L : 0);
  }
  // per interior PI: deflection, radius, tangent lengths
  const m = pis.length;
  const delta: number[] = [], rawDelta: number[] = [], dir: (1 | -1)[] = [], R: number[] = [], T: number[] = [], Tt: number[] = [];
  for (let k = 0; k < m; k++) {
    const i = k + 1;
    const cross = ux[i - 1] * uy[i] - uy[i - 1] * ux[i];
    const dot = ux[i - 1] * ux[i] + uy[i - 1] * uy[i];
    const raw = Math.abs(Math.atan2(cross, dot));
    const d = raw > MAX_DEFLECTION ? 0 : raw; // near-reversal: no arc (geometry stays continuous)
    delta.push(d);
    rawDelta.push(raw);
    dir.push(cross >= 0 ? 1 : -1);
    const r = pis[k].r ?? autoRadius(d, minRadius, lt);
    R.push(r);
    T.push(d > 1e-9 ? r * Math.tan(d / 2) : 0);
    Tt.push(transitionTangent(r, d, lt));
  }
  // reduce tangents so that neighbouring arcs never overlap (geometry stays continuous; the
  // violation itself is reported by the checks using the unreduced values)
  const Teff = T.slice();
  for (let k = 0; k < m; k++) {
    const i = k + 1;
    const prev = k > 0 ? T[k - 1] : 0, next = k < m - 1 ? T[k + 1] : 0;
    const capIn = T[k] + prev > legLen[i - 1] ? legLen[i - 1] * (T[k] / (T[k] + prev)) : Infinity;
    const capOut = T[k] + next > legLen[i] ? legLen[i] * (T[k] / (T[k] + next)) : Infinity;
    Teff[k] = Math.min(T[k], capIn, capOut);
  }
  const elements: Element[] = [];
  const curves: CurveInfo[] = [];
  let s = 0;
  let cur: Vec2 = { x: a.x, y: a.y };
  for (let k = 0; k <= m; k++) {
    const i = k; // leg index from pts[i] to pts[i+1]
    // end of this tangent: TC of the next curve, or B
    let end: Vec2;
    if (k < m) {
      const P = pts[k + 1];
      end = { x: P.x - ux[i] * Teff[k], y: P.y - uy[i] * Teff[k] };
    } else end = b;
    const lineLen = Math.max(0, (end.x - cur.x) * ux[i] + (end.y - cur.y) * uy[i]);
    if (lineLen > 1e-6) {
      elements.push({ kind: 'line', s0: s, len: lineLen, x0: cur.x, y0: cur.y, dx: ux[i], dy: uy[i] });
      s += lineLen;
    }
    if (k < m) {
      const d = delta[k];
      const P = pts[k + 1];
      const tc = end;
      const ct = { x: P.x + ux[i + 1] * Teff[k], y: P.y + uy[i + 1] * Teff[k] };
      const rEff = d > 1e-9 ? Teff[k] / Math.tan(d / 2) : R[k];
      const sStart = s;
      if (d > 1e-9 && rEff > 1e-6) {
        // left normal of incoming direction
        const nx = -uy[i] * dir[k], ny = ux[i] * dir[k];
        const cx = tc.x + nx * rEff, cy = tc.y + ny * rEff;
        const a0 = Math.atan2(tc.y - cy, tc.x - cx);
        const len = rEff * d;
        elements.push({ kind: 'arc', s0: s, len, cx, cy, r: rEff, a0, dir: dir[k], pi: k });
        s += len;
      }
      curves.push({
        index: k, x: P.x, y: P.y, delta: rawDelta[k], dir: dir[k], r: R[k], rEff, t: T[k], tTransition: Tt[k],
        arcLen: d > 1e-9 ? rEff * d : 0, sStart, sEnd: s, auto: pis[k].r === null, tooSharp: rawDelta[k] > MAX_DEFLECTION,
      });
      cur = ct;
    }
  }
  const legs: LegInfo[] = legLen.map((L, i) => ({
    index: i, length: L,
    used: (i > 0 ? Tt[i - 1] : 0) + (i < m ? Tt[i] : 0),
  }));
  return { elements, length: s, curves, legs };
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
