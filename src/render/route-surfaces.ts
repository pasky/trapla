import type { Result } from '../core/evaluate';
import { footprintBlend, mainRoadFootprintsSliced, type GroundFootprint } from './ground-footprint';
import { crossingBaseHeight, crossingSurfaces, footprintSurfaces, groundSegment, turnaroundSurfaces, type CrossingSurface } from './crossing-surface';
import { groundBlend, type GroundCorridor } from './earthwork-surface';

/** Immutable display context for one staged generation. No geometry is installed on View while building. */
export interface RouteSurfaceContext {
  surfaces: readonly CrossingSurface[];
  /** All roads whose collars can influence this one, including other constructed routes. */
  neighbours: readonly CrossingSurface[];
  replacementHeight: (x: number, y: number) => number;
  /** Exact footprint dependencies; crossing reuse keys only the nearby geometry. */
  groundFootprints?: readonly GroundFootprint[];
}

export function* buildRouteSurfaces(r: Result, crownWidth: number, natural: (x: number, y: number) => number): Generator<void, CrossingSurface[]> {
  const surfaces: CrossingSurface[] = [], base = crossingBaseHeight(r, crownWidth, natural);
  for (const c of r.crossings) { surfaces.push(...crossingSurfaces([c], natural, base)); yield; }
  for (const c of r.footprintConflicts ?? []) { surfaces.push(...footprintSurfaces([c], natural)); yield; }
  return surfaces;
}

export function routeSurfaceContext(surfaces: readonly CrossingSurface[], neighbours: readonly CrossingSurface[],
  natural: (x: number, y: number) => number, drape: (x: number, y: number) => number,
  roads: readonly Result[] = []): RouteSurfaceContext {
  const run = routeSurfaceContextSliced(surfaces, neighbours, natural, drape, roads);
  for (let step = run.next(); ; step = run.next()) if (step.done) return step.value;
}
/** The same context, yielding along the way (a long route's 3D rebuild runs in slices). */
export function* routeSurfaceContextSliced(surfaces: readonly CrossingSurface[], neighbours: readonly CrossingSurface[],
  natural: (x: number, y: number) => number, drape: (x: number, y: number) => number,
  roads: readonly Result[] = []): Generator<void, RouteSurfaceContext> {
  const groundFootprints = yield* mainRoadFootprintsSliced(roads);
  yield;
  const mainBlend = footprintBlend(groundFootprints);
  const corridors: GroundCorridor[] = [];
  let count = 0;
  for (const surface of neighbours) for (let i = 0; i + 1 < surface.sections.length; i++) {
    if (++count % 2000 === 0) yield;
    if (!groundSegment(surface, i)) continue;
    const a = surface.sections[i], b = surface.sections[i + 1];
    const width = Math.max(...[a, b].flatMap(s => s.toe.map(p => Math.hypot(p.x - s.p.x, p.y - s.p.y))));
    corridors.push({ a: a.p, b: b.p, width });
  }
  for (const head of turnaroundSurfaces(neighbours, natural)) corridors.push({ a: head.center, b: head.center, width: head.radius });
  yield;
  const blend = groundBlend(corridors);
  return { surfaces, neighbours, groundFootprints, replacementHeight: (x, y) => {
    const z = natural(x, y);
    return z + (drape(x, y) - z) * Math.min(blend(x, y), mainBlend(x, y));
  } };
}
