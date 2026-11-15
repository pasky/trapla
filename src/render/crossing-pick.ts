import type { CrossingPoint, CrossingResult } from '../core/crossings';
import { ROAD_CLASSES } from '../core/data/urban';
import { perspectiveFraction } from './route-pick';

type Project = (x: number, y: number, z: number) => { sx: number; sy: number; vis: boolean; depth?: number };
export interface CrossingHit { crossing: CrossingResult; x: number; y: number; z: number; distance: number;
  /** on one of its reroute links: which (the index into geometry.links) */
  link?: 0 | 1 }
interface Segment { a: CrossingPoint; b: CrossingPoint; half: number; crossing: CrossingResult; length: number; link?: 0 | 1 }
interface Disk { c: CrossingPoint; radius: number; crossing: CrossingResult }

/** Everything a crossing draws on the map: the crossed road's rebuilt stretch (junction approach,
 * ramps and deck over our road, underpass box), side roads regraded to meet it, reroute links and
 * turning heads. Width per path: the
 * drawn pavement (an underpass box is wider than the road it carries). */
function owned(c: CrossingResult): { paths: { points: CrossingPoint[]; half: (i: number) => number; link?: 0 | 1 }[]; disks: { c: CrossingPoint; radius: number }[] } {
  const g = c.geometry, paths: ReturnType<typeof owned>['paths'] = [], disks: ReturnType<typeof owned>['disks'] = [];
  if (!g) return { paths, disks };
  const half = g.width / 2;
  if (g.road && g.road.length >= 2) {
    const box = g.underpass, outer = box ? box.width / 2 + box.wall : 0;
    paths.push({ points: g.road, half: i => box && i >= box.start && i < box.end ? Math.max(half, outer) : half });
  }
  (g.links ?? []).forEach((link, k) => { if (link.length >= 2) paths.push({ points: link, half: () => half, link: k as 0 | 1 }); });
  for (const tie of g.ties ?? []) if (tie.path.length >= 2) paths.push({ points: tie.path, half: () => (ROAD_CLASSES[tie.cls]?.width ?? g.width) / 2 });
  // Turning heads: explicit priced disks, else the small drawn heads at severed link starts.
  if (g.turnaroundRadius !== undefined && Number.isFinite(g.turnaroundRadius) && g.turnaroundRadius > 0)
    for (const p of g.turnarounds ?? []) disks.push({ c: p, radius: g.turnaroundRadius });
  else if (c.cls !== 'track') for (const link of g.links ?? []) if (link.length
    && (g.turnarounds === undefined || g.turnarounds.some(p => Math.hypot(p.x - link[0].x, p.y - link[0].y) < .01)))
    disks.push({ c: link[0], radius: g.width * .72 });
  return { paths, disks };
}

/** Picks a crossing by any geometry it owns, on the drawn width plus `pixels` of slack (the same rule
 * as mapped roads). World-grid prefilter, exact screen-space test; built once per result. */
export class CrossingPicker {
  private source: readonly CrossingResult[] | null = null;
  private segments: Segment[] = [];
  private disks: Disk[] = [];
  private grid = new Map<string, number[]>();
  private cell = 50;
  set(crossings: readonly CrossingResult[]) {
    if (crossings === this.source) return;
    this.source = crossings; this.segments = []; this.disks = []; this.grid.clear();
    for (const c of crossings) {
      if (c.roadId === undefined) continue;
      const { paths, disks } = owned(c);
      for (const d of disks) this.add(this.disks.push({ ...d, crossing: c }) - 1, d.c.x - d.radius, d.c.y - d.radius, d.c.x + d.radius, d.c.y + d.radius, true);
      for (const { points, half, link } of paths) for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        if (!(length > 0)) continue;
        const w = half(i - 1);
        this.add(this.segments.push({ a, b, half: w, crossing: c, length, ...(link !== undefined ? { link } : {}) }) - 1,
          Math.min(a.x, b.x) - w, Math.min(a.y, b.y) - w, Math.max(a.x, b.x) + w, Math.max(a.y, b.y) + w, false);
      }
    }
  }
  private add(index: number, x0: number, y0: number, x1: number, y1: number, disk: boolean) {
    const id = disk ? ~index : index;
    for (let x = Math.floor(x0 / this.cell); x <= Math.floor(x1 / this.cell); x++)
      for (let y = Math.floor(y0 / this.cell); y <= Math.floor(y1 / this.cell); y++) {
        const key = `${x}:${y}`, list = this.grid.get(key); if (list) list.push(id); else this.grid.set(key, [id]);
      }
  }
  /** The crossing whose drawn geometry is nearest to the screen point (by distance from its drawn
   * edge), within `pixels`; `worldX/Y ± metres` bounds the candidates. */
  at(screenX: number, screenY: number, worldX: number, worldY: number, metres: number, pixels: number, project: Project): CrossingHit | null {
    const candidates = new Set<number>();
    for (let x = Math.floor((worldX - metres) / this.cell); x <= Math.floor((worldX + metres) / this.cell); x++)
      for (let y = Math.floor((worldY - metres) / this.cell); y <= Math.floor((worldY + metres) / this.cell); y++)
        for (const i of this.grid.get(`${x}:${y}`) ?? []) candidates.add(i);
    let hit: CrossingHit | null = null, best = pixels;
    for (const id of candidates) {
      if (id < 0) {
        // a turning disk lies on the ground: measure on the ground under the pointer, in pixels along
        // the direction from its centre to the pointer
        const d = this.disks[~id], gap = Math.hypot(worldX - d.c.x, worldY - d.c.y);
        const ux = gap > 1e-9 ? (worldX - d.c.x) / gap : 1, uy = gap > 1e-9 ? (worldY - d.c.y) / gap : 0;
        const c = project(d.c.x, d.c.y, d.c.z), e = project(d.c.x + ux, d.c.y + uy, d.c.z);
        if (!c.vis || !e.vis) continue;
        const edge = (gap - d.radius) * Math.hypot(e.sx - c.sx, e.sy - c.sy);
        if (edge <= best) { best = edge; hit = { crossing: d.crossing, x: d.c.x, y: d.c.y, z: d.c.z, distance: Math.max(0, edge) }; }
        continue;
      }
      const seg = this.segments[id], a = project(seg.a.x, seg.a.y, seg.a.z), b = project(seg.b.x, seg.b.y, seg.b.z);
      if (!a.vis || !b.vis) continue;
      const dx = b.sx - a.sx, dy = b.sy - a.sy, length2 = dx * dx + dy * dy;
      const t = length2 ? Math.max(0, Math.min(1, ((screenX - a.sx) * dx + (screenY - a.sy) * dy) / length2)) : 0;
      // the drawn half-width across the road, projected at the nearest point (not its foreshortened length)
      const along0 = perspectiveFraction(t, a.depth, b.depth), mx = seg.a.x + along0 * (seg.b.x - seg.a.x), my = seg.a.y + along0 * (seg.b.y - seg.a.y);
      const mz = seg.a.z + along0 * (seg.b.z - seg.a.z), plan = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) || 1;
      const m = project(mx, my, mz), side = project(mx - (seg.b.y - seg.a.y) / plan * seg.half, my + (seg.b.x - seg.a.x) / plan * seg.half, mz);
      const halfPx = m.vis && side.vis ? Math.hypot(side.sx - m.sx, side.sy - m.sy) : seg.half * Math.sqrt(length2) / seg.length;
      const edge = Math.hypot(screenX - a.sx - t * dx, screenY - a.sy - t * dy) - halfPx;
      if (edge > best) continue;
      const along = along0;
      best = edge;
      hit = { crossing: seg.crossing, x: seg.a.x + along * (seg.b.x - seg.a.x), y: seg.a.y + along * (seg.b.y - seg.a.y),
        z: seg.a.z + along * (seg.b.z - seg.a.z), distance: Math.max(0, edge), ...(seg.link !== undefined ? { link: seg.link } : {}) };
    }
    return hit;
  }
}
