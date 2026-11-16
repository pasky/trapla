// Land and works of another road of the project that Auto's reroutes must keep clear of: where the
// player's road came too close to one of our automatic reroutes, that reroute is planned again around it
// (project-evaluate.ts). Capsules: a centreline piece and the reach to keep from it (the other road's own
// reach plus the whole clearance between two roads' works, project-ledger.ts INDEPENDENCE_SCREEN).
export type KeepClear = readonly { ax: number; ay: number; bx: number; by: number; r: number }[];

/** Grid cell of the capsule index, m. */
const CELL = 50;

/** Does a new road of half-width `half` from p to q come within reach of any capsule? Indexed once. */
export function capsuleTest(capsules: KeepClear): (p: { x: number; y: number }, q: { x: number; y: number }, half: number) => boolean {
  const grid = new Map<number, number[]>();
  const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
  capsules.forEach((c, k) => {
    for (let i = Math.floor((Math.min(c.ax, c.bx) - c.r) / CELL); i <= Math.floor((Math.max(c.ax, c.bx) + c.r) / CELL); i++)
      for (let j = Math.floor((Math.min(c.ay, c.by) - c.r) / CELL); j <= Math.floor((Math.max(c.ay, c.by) + c.r) / CELL); j++) {
        let list = grid.get(key(i, j)); if (!list) grid.set(key(i, j), list = []); list.push(k);
      }
  });
  return (p, q, half) => {
    const seen = new Set<number>();
    for (let i = Math.floor((Math.min(p.x, q.x) - half) / CELL); i <= Math.floor((Math.max(p.x, q.x) + half) / CELL); i++)
      for (let j = Math.floor((Math.min(p.y, q.y) - half) / CELL); j <= Math.floor((Math.max(p.y, q.y) + half) / CELL); j++)
        for (const k of grid.get(key(i, j)) ?? []) {
          if (seen.has(k)) continue;
          seen.add(k);
          const c = capsules[k];
          if (segmentGap(p, q, { x: c.ax, y: c.ay }, { x: c.bx, y: c.by }) < c.r + half) return true;
        }
    return false;
  };
}

/** Least distance between segments ab and cd (0 where they cross). */
function segmentGap(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }): number {
  const cross = (o: typeof a, p: typeof a, q: typeof a) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  const to = (q: typeof a, p: typeof a, r: typeof a) => {
    const dx = r.x - p.x, dy = r.y - p.y, t = Math.max(0, Math.min(1, ((q.x - p.x) * dx + (q.y - p.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(q.x - p.x - t * dx, q.y - p.y - t * dy);
  };
  return Math.min(to(a, c, d), to(b, c, d), to(c, a, b), to(d, a, b));
}
