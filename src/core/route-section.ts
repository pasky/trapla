// The cross-section a designed line is built to, from its specification: one answer for the evaluator's
// screens, the 3D bodies and the noise band (each used to work it out for itself).
import { CATEGORIES, type CategoryId } from './data/categories';
import type { RouteDesign } from './project';
import { CARRIAGEWAY_CATEGORY, MOTORWAY_CATEGORY } from './project-motorway';

/** The category row a railway of this many tracks is built to. */
export const railCategory = (tracks: 1 | 2): CategoryId => (tracks === 1 ? 'R1' : 'R2');

/** The category row of a designed line; 'existing': a mapped road kept at its own width (no row).
 * A motorway is the paired formation while it follows its corridor, one carriageway when on its own. */
export function routeCategory(route: RouteDesign): CategoryId | 'existing' {
  if (route.kind === 'motorway') return route.alignment.kind === 'corridor' ? MOTORWAY_CATEGORY : CARRIAGEWAY_CATEGORY;
  if (route.kind === 'railway') return railCategory(route.specification.tracks);
  return route.specification.crossSection;
}

/** Crown (formation) width of a designed line, m; an existing road's own mapped width. */
export function routeCrownWidth(route: RouteDesign): number {
  const category = routeCategory(route);
  return category === 'existing' ? (route.kind === 'road' ? route.specification.existingWidth! : 0) : CATEGORIES[category].crownWidth;
}
