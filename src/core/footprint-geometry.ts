// Small allocation-bounded primitives shared by the footprint screens.
export interface Point2 { x: number; y: number }
export interface FootprintCell extends Point2 {
  i: number; s: number; tx: number; ty: number;
  along: number; left: number; right: number;
  structure?: 'abutment' | 'pier' | 'portal';
}
export interface Segment2 { ax: number; ay: number; bx: number; by: number; d: number; length: number }

/** Exact segment/rotated-rectangle clip. Padding includes the existing feature's half width. */
export function clipFootprint(a: Segment2, c: FootprintCell, pad = 0): [number, number] | undefined {
  const dx = a.ax - c.x, dy = a.ay - c.y;
  const u = dx * c.tx + dy * c.ty, v = -dx * c.ty + dy * c.tx;
  const du = (a.bx - a.ax) * c.tx + (a.by - a.ay) * c.ty;
  const dv = -(a.bx - a.ax) * c.ty + (a.by - a.ay) * c.tx;
  let lo = 0, hi = 1;
  for (const [p, q, min, max] of [[u, du, -c.along - pad, c.along + pad], [v, dv, -c.right - pad, c.left + pad]]) {
    if (Math.abs(q) < 1e-10) { if (p < min || p > max) return; }
    else { const t0 = (min - p) / q, t1 = (max - p) / q; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
    if (hi <= lo + 1e-9) return;
  }
  return [a.d + lo * a.length, a.d + hi * a.length];
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
  near(p: Point2): readonly FootprintCell[] { return this.buckets.get(Math.floor(p.x / 100) * 100003 + Math.floor(p.y / 100)) ?? []; }
  hits(p: Point2, pad: number): boolean { return this.near(p).some(c => insideFootprint(p, c, pad)); }
}
