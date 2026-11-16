// Vertical alignment: grade line through vertical intersection points (VPIs) with symmetric
// parabolic vertical curves.

export interface VPI {
  s: number;
  z: number;
  /** vertical curve radius, m; null = minimum for the design speed (crest or sag) */
  r: number | null;
}

export interface VCurve {
  index: number; // index into the full VPI list (incl. endpoints)
  s: number;
  z: number;
  g1: number;
  g2: number;
  /** 'crest' when the grade decreases */
  type: 'crest' | 'sag' | 'none';
  r: number;
  /** requested length R·|Δg| */
  len: number;
  /** length actually used (reduced if neighbouring curves would overlap) */
  lenEff: number;
}

export interface Profile {
  /** full VPI list including the two endpoints */
  pts: { s: number; z: number }[];
  grades: number[];
  curves: VCurve[];
}

/** A minimum vertical radius: one for the whole road, or by chainage (a stretch's own design speed). */
export type RadiusLimit = number | ((s: number) => number);
/** The steepest grade: one for the whole road, or for the stretch between two chainages (terrain class,
 * hairpins): the smallest limit of the stations on it. */
export type GradeLimit = number | ((s0: number, s1: number) => number);
export const gradeLimitOf = (g: GradeLimit, s0: number, s1: number) => typeof g === 'number' ? g : g(s0, s1);

export function buildProfile(pts: VPI[], minCrest: RadiusLimit, minSag: RadiusLimit): Profile {
  const n = pts.length;
  const grades: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const ds = pts[i + 1].s - pts[i].s;
    grades.push(ds > 1e-9 ? (pts[i + 1].z - pts[i].z) / ds : 0);
  }
  const curves: VCurve[] = [];
  for (let i = 1; i < n - 1; i++) {
    const g1 = grades[i - 1], g2 = grades[i];
    const dg = g2 - g1;
    const type = Math.abs(dg) < 1e-9 ? 'none' : dg < 0 ? 'crest' : 'sag';
    const min = type === 'crest' ? minCrest : minSag;
    const r = pts[i].r ?? (typeof min === 'number' ? min : min(pts[i].s));
    const len = type === 'none' ? 0 : r * Math.abs(dg);
    curves.push({ index: i, s: pts[i].s, z: pts[i].z, g1, g2, type, r, len, lenEff: len });
  }
  // shrink overlapping curves proportionally (reported as a violation by the checks)
  for (let k = 0; k < curves.length; k++) {
    const c = curves[k];
    let eff = c.len;
    const leftSpace = c.s - pts[c.index - 1].s;
    const leftNeighbour = k > 0 ? curves[k - 1].len : 0;
    if (c.len / 2 + leftNeighbour / 2 > leftSpace) eff = Math.min(eff, 2 * leftSpace * c.len / (c.len + leftNeighbour));
    const rightSpace = pts[c.index + 1].s - c.s;
    const rightNeighbour = k < curves.length - 1 ? curves[k + 1].len : 0;
    if (c.len / 2 + rightNeighbour / 2 > rightSpace) eff = Math.min(eff, 2 * rightSpace * c.len / (c.len + rightNeighbour));
    c.lenEff = Math.max(0, eff);
  }
  return { pts: pts.map((p) => ({ s: p.s, z: p.z })), grades, curves };
}

/** grade-line elevation at stations s[] (sorted ascending) */
export function elevations(p: Profile, s: ArrayLike<number>, out?: Float64Array): Float64Array {
  const z = out ?? new Float64Array(s.length);
  const pts = p.pts;
  let seg = 0;
  for (let i = 0; i < s.length; i++) {
    const si = s[i];
    while (seg < pts.length - 2 && si > pts[seg + 1].s) seg++;
    z[i] = pts[seg].z + p.grades[seg] * (si - pts[seg].s);
  }
  // add parabolic corrections
  for (const c of p.curves) {
    if (c.lenEff <= 1e-9) continue;
    const b0 = c.s - c.lenEff / 2, b1 = c.s + c.lenEff / 2;
    const dg = c.g2 - c.g1;
    // first index ≥ b0
    let lo = 0, hi = s.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] < b0) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < s.length && s[i] <= b1; i++) {
      const x = s[i] - b0;
      // tangent-line value through the VPI on the incoming side is already in z for s<VPI and the
      // outgoing side for s>VPI; parabola: z = zBVC + g1 x + dg x²/(2L)
      const zBVC = c.z - c.g1 * c.lenEff / 2;
      const zc = zBVC + c.g1 * x + (dg * x * x) / (2 * c.lenEff);
      z[i] = zc;
    }
  }
  return z;
}

/** single-point convenience */
export function elevationAt(p: Profile, s: number): number {
  return elevations(p, [s])[0];
}
