// Shared plan cross-sections for the terrain cut-out and the physical crossing meshes.
// Work is bounded by the core's point budget and happens only on a new evaluation.
import type { CrossingPoint, CrossingResult } from '../core/crossings';
export interface SurfaceSection {
  p: CrossingPoint; nx: number; ny: number;
  edge: [CrossingPoint, CrossingPoint]; toe: [CrossingPoint, CrossingPoint];
  outer: [CrossingPoint, CrossingPoint];
}
export interface CrossingSurface { crossing: CrossingResult; path: CrossingPoint[]; sections: SurfaceSection[]; link: boolean; deck?: { start: number; end: number } }
export function crossingSurfaces(crossings: CrossingResult[], height: (x: number, y: number) => number): CrossingSurface[] {
  const out: CrossingSurface[] = [];
  for (const crossing of crossings) {
    const g = crossing.geometry;
    if (!g) continue;
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
            surface: terrain ? 'terrain' : 'ramp', ...(terrain ? {} : { support: 'embankment' as const }) });
        }
      }
      const deck = !link && g.deck ? { start: mapping[g.deck.start], end: mapping[g.deck.end] } : undefined;
      const sections = path.map((p, i): SurfaceSection => {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
        const point = (off: number, z?: number): CrossingPoint => {
          const x = p.x + nx * off, y = p.y + ny * off;
          return { ...p, x, y, z: z ?? height(x, y) };
        };
        const edge = [-1, 1].map(side => {
          const q = point(side * g.width / 2);
          // Terrain roads conform across their whole width, not just their centreline.
          return { ...q, z: p.surface === 'terrain' ? q.z : p.z };
        }) as SurfaceSection['edge'];
        const toe = edge.map((e, k) => {
          const side = k ? 1 : -1, ground = height(e.x, e.y), delta = e.z - ground;
          // Deck boundary sections are also the ends of the adjoining embankments.
          if (Math.abs(delta) < .15) return point(side * (g.width / 2 + .6));
          // 1:1.5 fill / cut daylight search. Bounded even for impossible manual grades.
          let off = .5;
          for (; off < 300; off += 1) {
            const q = point(side * (g.width / 2 + off));
            if (delta > 0 ? e.z - off / 1.5 <= q.z : e.z + off / 1.5 >= q.z) break;
          }
          return point(side * (g.width / 2 + off));
        }) as SurfaceSection['toe'];
        const outer = toe.map((q, k) => point((k ? 1 : -1) * (Math.hypot(q.x - p.x, q.y - p.y) + 12))) as SurfaceSection['outer'];
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
