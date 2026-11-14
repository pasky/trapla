// Shared plan cross-sections for the terrain cut-out and the physical crossing meshes.
// Work is bounded by the core's point budget and happens only on a new evaluation.
import type { CrossingPoint, CrossingResult } from '../core/crossings';
import type { Result } from '../core/evaluate';
import { KIND } from '../core/structures';
import { GROUND_COLLAR } from './earthwork-surface';

/** Existing engineered formation beneath a junction: indexed once, never scan the route per vertex. */
export function crossingBaseHeight(r: Pick<Result, 'n' | 'x' | 'y' | 'grade' | 'kind' | 'dayL' | 'dayR' | 'zDayL' | 'zDayR'>,
  crownWidth: number, natural: (x: number, y: number) => number) {
  const cell = 200, grid = new Map<string, number[]>();
  for (let i = 0; i + 1 < r.n; i++) {
    if (r.kind[i] !== KIND.earth || r.kind[i+1] !== KIND.earth) continue;
    const width = Math.max(r.dayL[i], r.dayR[i], r.dayL[i+1], r.dayR[i+1]);
    for (let x = Math.floor((Math.min(r.x[i],r.x[i+1])-width)/cell); x <= Math.floor((Math.max(r.x[i],r.x[i+1])+width)/cell); x++)
      for (let y = Math.floor((Math.min(r.y[i],r.y[i+1])-width)/cell); y <= Math.floor((Math.max(r.y[i],r.y[i+1])+width)/cell); y++) {
        const key = `${x},${y}`, list = grid.get(key) ?? []; list.push(i); grid.set(key,list);
      }
  }
  return (x: number, y: number) => {
    let nearest = Infinity, z = natural(x,y);
    for (const i of grid.get(`${Math.floor(x/cell)},${Math.floor(y/cell)}`) ?? []) {
      const dx = r.x[i+1]-r.x[i], dy = r.y[i+1]-r.y[i], len = Math.hypot(dx,dy) || 1;
      const raw = ((x-r.x[i])*dx+(y-r.y[i])*dy)/(len*len);
      if (raw < 0 || raw > 1) continue;
      const t = raw, lateral = ((y-r.y[i])*dx-(x-r.x[i])*dy)/len, d = Math.abs(lateral);
      const at = (v: ArrayLike<number>) => v[i]+(v[i+1]-v[i])*t;
      const day = at(lateral >= 0 ? r.dayL : r.dayR);
      if (d > day || d >= nearest) continue;
      nearest = d;
      const q = Math.max(0, Math.min(1, (d-crownWidth/2)/Math.max(.01,day-crownWidth/2)));
      z = at(r.grade)*(1-q)+at(lateral >= 0 ? r.zDayL : r.zDayR)*q;
    }
    return z;
  };
}
export interface SurfaceSection {
  p: CrossingPoint; nx: number; ny: number;
  edge: [CrossingPoint, CrossingPoint]; toe: [CrossingPoint, CrossingPoint];
  outer: [CrossingPoint, CrossingPoint];
}
export interface CrossingSurface { crossing: CrossingResult; path: CrossingPoint[]; sections: SurfaceSection[]; link: boolean; deck?: { start: number; end: number } }
export function crossingSurfaces(crossings: CrossingResult[], height: (x: number, y: number) => number,
  formation = height): CrossingSurface[] {
  const out: CrossingSurface[] = [];
  for (const crossing of crossings) {
    const g = crossing.geometry;
    if (!g) continue;
    const base = crossing.type === 'junction' ? formation : height;
    for (const [source, link] of [...(g.road ? [[g.road, false] as const] : []), ...(g.links ?? []).map(p => [p, true] as const)]) {
      // Centreline refinement alone misses transverse terrain ridges. A bounded fine ground mesh
      // keeps the full road width in contact; preserve every OSM bend and every deck boundary.
      const path: CrossingPoint[] = [], mapping: number[] = [];
      let length = 0;
      for (let i = 1; i < source.length; i++) length += Math.hypot(source[i].x-source[i-1].x, source[i].y-source[i-1].y);
      const step = Math.max(2, length / 3500);
      for (let i = 0; i < source.length; i++) {
        mapping.push(path.length); path.push(source[i]);
        const a = source[i], b = source[i+1];
        if (!b || (a.surface === 'deck' && b.surface === 'deck')) continue;
        const count = Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/step);
        for (let k = 1; k < count; k++) {
          const t = k/count, x = a.x+(b.x-a.x)*t, y = a.y+(b.y-a.y)*t, ground = height(x,y);
          const terrain = a.surface === 'terrain' && b.surface === 'terrain';
          path.push({ x, y, ground, z: terrain ? ground : a.z+(b.z-a.z)*t,
            ...(a.d !== undefined && b.d !== undefined ? { d: a.d+(b.d-a.d)*t } : {}),
            surface: terrain ? 'terrain' : 'ramp', ...(terrain ? {} : { support: 'embankment' as const }) });
        }
      }
      const deck = !link && g.deck ? { start: mapping[g.deck.start], end: mapping[g.deck.end] } : undefined;
      const sections = path.map((p, i): SurfaceSection => {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
        const point = (off: number, z?: number): CrossingPoint => {
          const x = p.x + nx * off, y = p.y + ny * off;
          return { ...p, x, y, z: z ?? base(x, y) };
        };
        const edge = [-1, 1].map(side => {
          const q = point(side * g.width / 2);
          // Terrain roads conform across their whole width, not just their centreline.
          return { ...q, z: p.surface === 'terrain' || p.connection === 'main-road' ? q.z : p.z };
        }) as SurfaceSection['edge'];
        const toe = edge.map((e, k) => {
          const side = k ? 1 : -1, ground = base(e.x, e.y), delta = e.z - ground;
          // Deck boundary sections are also the ends of the adjoining embankments.
          if (Math.abs(delta) < .15) return { ...e, z: ground };
          // 1:1.5 fill / cut daylight search. Bounded even for impossible manual grades.
          let off = .5;
          for (; off < 300; off += 1) {
            const q = point(side * (g.width / 2 + off));
            if (delta > 0 ? e.z - off / 1.5 <= q.z : e.z + off / 1.5 >= q.z) break;
          }
          return point(side * (g.width / 2 + off));
        }) as SurfaceSection['toe'];
        const outer = toe.map((q, k) => point((k ? 1 : -1) * (Math.hypot(q.x - p.x, q.y - p.y) + GROUND_COLLAR))) as SurfaceSection['outer'];
        return { p, nx, ny, edge, toe, outer };
      });
      out.push({ crossing, path, sections, link, deck });
    }
  }
  return out;
}
/** Ground collars beyond each endpoint let the original textured road continue at the tie-in
 * elevation before blending back into the coarse terrain mesh. No extra road is invented. */
export function endCollars(surface: CrossingSurface, height: (x: number, y: number) => number): CrossingPoint[][] {
  if (surface.sections.length < 2) return [];
  return [0, surface.sections.length - 1].map(i => {
    const a = surface.sections[i], b = surface.sections[i ? i - 1 : 1];
    const length = Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) || 1;
    const dx = (a.p.x - b.p.x) / length * 18, dy = (a.p.y - b.p.y) / length * 18;
    return [a.outer[0], a.outer[1], ...a.outer.map(p => ({ ...p, x: p.x + dx, y: p.y + dy, z: height(p.x + dx, p.y + dy) }))];
  });
}
/** Whether this segment needs a real ground surface, rather than a bridge void. */
export function groundSegment(surface: CrossingSurface, i: number): boolean {
  const deck = surface.deck;
  return surface.link || !deck || i < deck.start || i >= deck.end;
}
