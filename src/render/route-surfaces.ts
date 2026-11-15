import type { Result } from '../core/evaluate';
import { KIND } from '../core/structures';
import { crossingBaseHeight, crossingSurfaces, footprintSurfaces, groundSegment, turnaroundSurfaces, type CrossingSurface } from './crossing-surface';
import { groundBlend, type GroundCorridor } from './earthwork-surface';

/** Immutable display context for one staged generation. No geometry is installed on View while building. */
export interface RouteSurfaceContext {
  surfaces: readonly CrossingSurface[];
  /** All roads whose collars can influence this one, including other constructed routes. */
  neighbours: readonly CrossingSurface[];
  replacementHeight: (x: number, y: number) => number;
  /** Identity of additional main-road blend inputs, for crossing-mesh reuse. */
  groundKey?: string;
}

export function* buildRouteSurfaces(r: Result, crownWidth: number, natural: (x: number, y: number) => number): Generator<void, CrossingSurface[]> {
  const surfaces: CrossingSurface[] = [], base = crossingBaseHeight(r, crownWidth, natural);
  for (const c of r.crossings) { surfaces.push(...crossingSurfaces([c], natural, base)); yield; }
  for (const c of r.footprintConflicts ?? []) { surfaces.push(...footprintSurfaces([c], natural)); yield; }
  return surfaces;
}

export function routeSurfaceContext(surfaces: readonly CrossingSurface[], neighbours: readonly CrossingSurface[],
  natural: (x: number, y: number) => number, drape: (x: number, y: number) => number,
  roads: readonly Result[] = [], groundKey?: string): RouteSurfaceContext {
  const corridors: GroundCorridor[] = [];
  for (const r of roads) for (let i = 0; i + 1 < r.n; i++) {
    if (r.kind[i] !== KIND.earth || r.kind[i + 1] !== KIND.earth) continue;
    corridors.push({ a: { x: r.x[i], y: r.y[i] }, b: { x: r.x[i + 1], y: r.y[i + 1] },
      width: Math.max(r.dayL[i], r.dayR[i], r.dayL[i + 1], r.dayR[i + 1]) });
  }
  for (const surface of neighbours) for (let i = 0; i + 1 < surface.sections.length; i++) {
    if (!groundSegment(surface, i)) continue;
    const a = surface.sections[i], b = surface.sections[i + 1];
    const width = Math.max(...[a, b].flatMap(s => s.toe.map(p => Math.hypot(p.x - s.p.x, p.y - s.p.y))));
    corridors.push({ a: a.p, b: b.p, width });
  }
  for (const head of turnaroundSurfaces(neighbours, natural)) corridors.push({ a: head.center, b: head.center, width: head.radius });
  const blend = groundBlend(corridors);
  return { surfaces, neighbours, groundKey, replacementHeight: (x, y) => {
    const z = natural(x, y);
    return z + (drape(x, y) - z) * blend(x, y);
  } };
}
