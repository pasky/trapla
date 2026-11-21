// Small allocation-bounded primitives shared by the footprint screens.
export interface Point2 { x: number; y: number }
export interface FootprintCell extends Point2 {
  i: number; s: number; tx: number; ty: number;
  along: number; left: number; right: number;
  structure?: 'abutment' | 'pier' | 'portal';
  /** a raised end's cone of fill round its node (footprint.ts): its surface is the cone's, not the station's */
  cone?: { x: number; y: number; tx: number; ty: number; half: number; top: number };
}
export interface Segment2 { ax: number; ay: number; bx: number; by: number; d: number; length: number }

/** Exact segment/rotated-rectangle clip. Padding includes the existing feature's half width. */
export function clipFootprint(a: Segment2, c: FootprintCell, pad = 0): [number, number] | undefined {
  const dx = a.ax - c.x, dy = a.ay - c.y;
  const u = dx * c.tx + dy * c.ty, v = -dx * c.ty + dy * c.tx;
  const du = (a.bx - a.ax) * c.tx + (a.by - a.ay) * c.ty;
  const dv = -(a.bx - a.ax) * c.ty + (a.by - a.ay) * c.tx;
  let lo = 0, hi = 1;
  // Keep the two clipping steps in their original order without allocating three arrays for
  // every road/channel candidate in every engineering pass.
  if (Math.abs(du) < 1e-10) { if (u < -c.along - pad || u > c.along + pad) return; }
  else {
    const t0 = (-c.along - pad - u) / du, t1 = (c.along + pad - u) / du;
    lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
  }
  if (hi <= lo + 1e-9) return;
  if (Math.abs(dv) < 1e-10) { if (v < -c.right - pad || v > c.left + pad) return; }
  else {
    const t0 = (-c.right - pad - v) / dv, t1 = (c.left + pad - v) / dv;
    lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
  }
  if (hi <= lo + 1e-9) return;
  return [a.d + lo * a.length, a.d + hi * a.length];
}
/** Whether clipFootprint() finds a piece of the segment inside the cell: the same tests, without making the
 * interval (for the screens that only ask whether). */
export function touchesFootprint(a: Segment2, c: FootprintCell, pad = 0): boolean {
  const dx = a.ax - c.x, dy = a.ay - c.y;
  const u = dx * c.tx + dy * c.ty, v = -dx * c.ty + dy * c.tx;
  const du = (a.bx - a.ax) * c.tx + (a.by - a.ay) * c.ty;
  const dv = -(a.bx - a.ax) * c.ty + (a.by - a.ay) * c.tx;
  let lo = 0, hi = 1;
  if (Math.abs(du) < 1e-10) { if (u < -c.along - pad || u > c.along + pad) return false; }
  else {
    const t0 = (-c.along - pad - u) / du, t1 = (c.along + pad - u) / du;
    lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
  }
  if (hi <= lo + 1e-9) return false;
  if (Math.abs(dv) < 1e-10) { if (v < -c.right - pad || v > c.left + pad) return false; }
  else {
    const t0 = (-c.right - pad - v) / dv, t1 = (c.left + pad - v) / dv;
    lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
  }
  return !(hi <= lo + 1e-9);
}
export function cellBounds(c: FootprintCell, pad = 0): [number, number, number, number] {
  const off = (c.left - c.right) / 2, across = (c.left + c.right) / 2 + pad;
  const x = c.x - c.ty * off, y = c.y + c.tx * off;
  const dx = Math.abs(c.tx) * (c.along + pad) + Math.abs(c.ty) * across;
  const dy = Math.abs(c.ty) * (c.along + pad) + Math.abs(c.tx) * across;
  return [x - dx, y - dy, x + dx, y + dy];
}
export function insideFootprint(p: Point2, c: FootprintCell, pad = 0): boolean {
  const dx = p.x - c.x, dy = p.y - c.y, u = dx * c.tx + dy * c.ty, v = -dx * c.ty + dy * c.tx;
  return Math.abs(u) < c.along + pad && v > -c.right - pad && v < c.left + pad;
}

const NO_CELLS: readonly FootprintCell[] = [];
/** Query only local footprint cells when checking a proposed realignment. */
export class FootprintGrid {
  private buckets = new Map<number, FootprintCell[]>();
  constructor(cells: FootprintCell[]) {
    for (const c of cells) {
      const [x0, y0, x1, y1] = cellBounds(c, 20);
      for (let x = Math.floor(x0 / 100); x <= Math.floor(x1 / 100); x++)
        for (let y = Math.floor(y0 / 100); y <= Math.floor(y1 / 100); y++) {
          const key = x * 100003 + y, bucket = this.buckets.get(key);
          if (bucket) bucket.push(c); else this.buckets.set(key, [c]);
        }
    }
  }
  near(p: Point2): readonly FootprintCell[] { return this.buckets.get(Math.floor(p.x / 100) * 100003 + Math.floor(p.y / 100)) ?? NO_CELLS; }
  hits(p: Point2, pad: number): boolean {
    // (no closure and no empty array per query: realignment screens ask this for every sample of every chord)
    const cells = this.near(p);
    for (let k = 0; k < cells.length; k++) if (insideFootprint(p, cells[k], pad)) return true;
    return false;
  }
  /** Interior of the union, not of each shrunken station cell (shrinking cells invents outlet
   * gaps at every station boundary). A real outer edge has at least one outside neighbour. */
  interior(p: Point2): boolean {
    return [[0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05]].every(([dx, dy]) => this.hits({ x: p.x + dx, y: p.y + dy }, 1e-6));
  }
}
