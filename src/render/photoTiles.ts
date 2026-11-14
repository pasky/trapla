// Bookkeeping for the toroidal clip levels and the orthophoto tile cache (pure, no WebGL).
// All rectangles are in texels of one level: [x, y, w, h] with integer coordinates.

export type Rect = [number, number, number, number];

/** what moving a level's window from `old` (origin) to `now` uncovers: at most two disjoint rectangles */
export function exposed(old: [number, number], now: [number, number], size: number): Rect[] {
  const dx = now[0] - old[0], dy = now[1] - old[1];
  if (Math.abs(dx) >= size || Math.abs(dy) >= size) return [[now[0], now[1], size, size]];
  const out: Rect[] = [];
  // columns that are new over the full height of the new window …
  if (dx > 0) out.push([old[0] + size, now[1], dx, size]);
  else if (dx < 0) out.push([now[0], now[1], -dx, size]);
  // … and rows that are new over the columns both windows share
  const sx = Math.max(old[0], now[0]), sw = size - Math.abs(dx);
  if (dy > 0) out.push([sx, old[1] + size, sw, dy]);
  else if (dy < 0) out.push([sx, now[1], sw, -dy]);
  return out;
}

/** intersection of two rectangles, or null when they do not overlap */
export function clip(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
}

/** grid tiles of `tile` texels touched by a rectangle: [i, j] */
export function tilesIn(r: Rect, tile: number): [number, number][] {
  const out: [number, number][] = [];
  const i1 = Math.ceil((r[0] + r[2]) / tile), j1 = Math.ceil((r[1] + r[3]) / tile);
  for (let j = Math.floor(r[1] / tile); j < j1; j++) for (let i = Math.floor(r[0] / tile); i < i1; i++) out.push([i, j]);
  return out;
}

/**
 * Split a rectangle of a toroidal texture of `size` texels (texel x lives at x mod size) into the pieces
 * that do not wrap: [x, y, w, h, texture x, texture y]. A rectangle at most `size` wide gives ≤ 4 pieces.
 */
export function wrapPieces(r: Rect, size: number): [number, number, number, number, number, number][] {
  const mod = (v: number) => ((v % size) + size) % size;
  const split = (a: number, n: number): [number, number][] => {
    const cut = (Math.floor(a / size) + 1) * size;
    return a + n > cut ? [[a, cut - a], [cut, a + n - cut]] : [[a, n]];
  };
  const out: [number, number, number, number, number, number][] = [];
  for (const [y, h] of split(r[1], r[3])) for (const [x, w] of split(r[0], r[2])) out.push([x, y, w, h, mod(x), mod(y)]);
  return out;
}

/** least-recently-used map bounded by a total cost; `evict` is called for what falls out */
export class Lru<V> {
  private map = new Map<string, { v: V; cost: number }>();
  total = 0;
  constructor(private cap: number, private evict: (v: V, key: string) => void = () => {}) {}
  get size() { return this.map.size; }
  has(k: string) { return this.map.has(k); }
  /** the value, marked as just used */
  get(k: string): V | undefined {
    const e = this.map.get(k);
    if (!e) return undefined;
    this.map.delete(k);
    this.map.set(k, e);
    return e.v;
  }
  set(k: string, v: V, cost = 1) {
    this.delete(k);
    this.map.set(k, { v, cost });
    this.total += cost;
    // the newest entry stays even when it alone exceeds the cap
    for (const [key, e] of this.map) {
      if (this.total <= this.cap || key === k) break;
      this.map.delete(key);
      this.total -= e.cost;
      this.evict(e.v, key);
    }
  }
  delete(k: string) {
    const e = this.map.get(k);
    if (!e) return;
    this.map.delete(k);
    this.total -= e.cost;
    this.evict(e.v, k);
  }
  clear() { for (const k of [...this.map.keys()]) this.delete(k); }
}
