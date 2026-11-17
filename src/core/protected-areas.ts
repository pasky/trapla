// Nature protection areas on the terrain grid (data/protected.ts, research/75): each grid row holds the runs of
// cells whose centre lies inside one or more areas, so a lookup is a binary search in one row and a scan of a
// rectangle visits only the runs it crosses (never every cell of the map). Built once per pack from the
// pack's polygons (even-odd fill, cell centres, like the land-cover raster).
import { PROTECTED_ORDER, protectedRule, type ProtectedData, type ProtectedRule, type ProtectedSiteData } from './data/protected';

export class ProtectedAreas {
  readonly sites: readonly ProtectedSiteData[];
  /** distinct sets of sites covering a cell, each strictest first (PROTECTED_ORDER) */
  readonly combos: readonly (readonly number[])[];
  /** runs of row r: rowStart[r] … rowStart[r + 1] − 1, each (col0, col1 inclusive, combo) in `runs` */
  private readonly rowStart: Int32Array;
  private readonly runs: Int32Array;
  private readonly ruling = new Map<number, number>();
  /** local metres covered by any run: [x0, y0, x1, y1] (empty: x0 > x1) */
  readonly extent: readonly [number, number, number, number];

  constructor(data: ProtectedData, readonly nx: number, readonly ny: number, readonly cell: number) {
    this.sites = data.sites;
    const height = ny * cell;
    // per row, per site: the x crossings of the row's centre line with the site's rings
    const crossings: Map<number, number[]>[] = Array.from({ length: ny }, () => new Map());
    data.sites.forEach((site, k) => {
      for (const ring of site.rings) {
        const m = ring.length / 2;
        for (let i = 0; i < m; i++) {
          const ax = ring[2 * i], ay = ring[2 * i + 1], j = (i + 1) % m, bx = ring[2 * j], by = ring[2 * j + 1];
          if (ay === by) continue;
          const lo = Math.min(ay, by), hi = Math.max(ay, by);
          // rows whose centre y = height − (r + 0.5)·cell lies in [lo, hi)
          const r0 = Math.max(0, Math.ceil((height - hi) / cell - 0.5)), r1 = Math.min(ny - 1, Math.floor((height - lo) / cell - 0.5));
          for (let r = r0; r <= r1; r++) {
            const y = height - (r + 0.5) * cell;
            if (y < lo || y >= hi) continue;
            const x = ax + (bx - ax) * (y - ay) / (by - ay);
            let list = crossings[r].get(k);
            if (!list) crossings[r].set(k, list = []);
            list.push(x);
          }
        }
      }
    });
    const comboIds = new Map<string, number>(), combos: number[][] = [];
    const starts = new Int32Array(ny + 1), runs: number[] = [];
    const rank = (k: number) => PROTECTED_ORDER.indexOf(data.sites[k].kind);
    for (let r = 0; r < ny; r++) {
      starts[r] = runs.length / 3;
      // even-odd intervals of each site in cell columns (centre (c + 0.5)·cell inside [x0, x1))
      const events: [number, number, number][] = [];
      for (const [k, xs] of crossings[r]) {
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          const c0 = Math.max(0, Math.ceil(xs[i] / cell - 0.5)), c1 = Math.min(nx - 1, Math.ceil(xs[i + 1] / cell - 0.5) - 1);
          if (c1 >= c0) { events.push([c0, 1, k], [c1 + 1, -1, k]); }
        }
      }
      if (!events.length) continue;
      events.sort((a, b) => a[0] - b[0]);
      const count = new Map<number, number>();
      let at = events[0][0];
      for (let e = 0; e < events.length;) {
        const col = events[e][0];
        if (col > at && count.size) {
          const set = [...count.keys()].sort((a, b) => rank(a) - rank(b) || a - b), key = set.join(',');
          let id = comboIds.get(key);
          if (id === undefined) { id = combos.length; comboIds.set(key, id); combos.push(set); }
          const last = runs.length - 3;
          if (last >= starts[r] * 3 && runs[last + 2] === id && runs[last + 1] === at - 1) runs[last + 1] = col - 1;
          else runs.push(at, col - 1, id);
        }
        at = col;
        for (; e < events.length && events[e][0] === col; e++) {
          const [, d, k] = events[e], v = (count.get(k) ?? 0) + d;
          if (v > 0) count.set(k, v); else count.delete(k);
        }
      }
    }
    starts[ny] = runs.length / 3;
    this.rowStart = starts; this.runs = Int32Array.from(runs); this.combos = combos;
    let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for (let r = 0; r < ny; r++) if (starts[r + 1] > starts[r]) {
      r0 = Math.min(r0, r); r1 = r;
      c0 = Math.min(c0, runs[3 * starts[r]]); c1 = Math.max(c1, runs[3 * (starts[r + 1] - 1) + 1]);
    }
    this.extent = [c0 * cell, height - (r1 + 1) * cell, (c1 + 1) * cell, height - r0 * cell];
  }

  /** the combo of sites covering grid cell (col, row), or −1 */
  comboAtCell(col: number, row: number): number {
    if (row < 0 || row >= this.ny || col < 0 || col >= this.nx) return -1;
    let lo = this.rowStart[row], hi = this.rowStart[row + 1] - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, c0 = this.runs[3 * mid], c1 = this.runs[3 * mid + 1];
      if (col < c0) hi = mid - 1; else if (col > c1) lo = mid + 1; else return this.runs[3 * mid + 2];
    }
    return -1;
  }

  /** the combo of sites covering point (x, y) (the cell whose centre is nearest), or −1 */
  comboAt(x: number, y: number): number {
    return this.comboAtCell(Math.floor(x / this.cell), Math.floor((this.ny * this.cell - y) / this.cell));
  }

  /** Runs of row `row` overlapping columns col0…col1: visit(c0, c1, combo) clipped to that range. */
  rowRuns(row: number, col0: number, col1: number, visit: (c0: number, c1: number, combo: number) => void): void {
    if (row < 0 || row >= this.ny) return;
    for (let k = this.rowStart[row]; k < this.rowStart[row + 1]; k++) {
      const c0 = this.runs[3 * k], c1 = this.runs[3 * k + 1];
      if (c1 < col0) continue;
      if (c0 > col1) break;
      visit(Math.max(c0, col0), Math.min(c1, col1), this.runs[3 * k + 2]);
    }
  }

  /** The site that rules works in this combo for a road: the first, strictest first, that takes no works, else
   * (`any`) the first that needs consent, else the first at all; −1 if none (or, without `any`, if none bans works). */
  rulingSite(combo: number, motorway = false, builtUp = false, any = false): number {
    if (combo < 0) return -1;
    const key = combo * 8 + (motorway ? 4 : 0) + (builtUp ? 2 : 0) + (any ? 1 : 0);
    let v = this.ruling.get(key);
    if (v === undefined) {
      const sites = this.combos[combo], level = (k: number) => protectedRule(this.sites[k], motorway, builtUp).level;
      v = sites.find(k => level(k) === 'ban') ?? (any ? sites.find(k => level(k) === 'consent') ?? sites[0] : -1);
      this.ruling.set(key, v);
    }
    return v;
  }

  rule(site: number, motorway = false, builtUp = false): ProtectedRule {
    return protectedRule(this.sites[site], motorway, builtUp);
  }
}
