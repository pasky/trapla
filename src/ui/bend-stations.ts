import type { Design, Result } from '../core/evaluate';

/** the plan's bends at their stations along the route: the middle of the bend's arc, or the nearest station */
export function bendStations(r: Result, d: Design): { i: number; s: number }[] {
  return d.pis.map((p, i) => {
    const c = r.curves.find((c) => c.index === i);
    if (c && c.sEnd > c.sStart + 1) return { i, s: (c.sStart + c.sEnd) / 2 };
    let bd = Infinity, s = 0;
    for (let k = 0; k < r.n; k++) { const dd = (r.x[k] - p.x) ** 2 + (r.y[k] - p.y) ** 2; if (dd < bd) { bd = dd; s = r.s[k]; } }
    return { i, s };
  });
}
