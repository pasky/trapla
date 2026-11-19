// The cross-section a designed line is built to, from its specification: one answer for the evaluator's
// screens, the 3D bodies and the noise band (each used to work it out for itself).
import { CATEGORIES, pairedCategoryOf, type CategoryId, type PairedCategoryId } from './data/categories';
import type { RouteDesign } from './project';
import { carriagewayCategory, MOTORWAY_CATEGORY } from './project-motorway';

/** The category row a railway of this many tracks is built to. */
export const railCategory = (tracks: 1 | 2): CategoryId => (tracks === 1 ? 'R1' : 'R2');

/** The category row of a designed line; 'existing': a mapped road kept at its own width (no row).
 * A motorway is the paired formation while it follows its corridor, one carriageway when on its own. */
export function routeCategory(route: RouteDesign): CategoryId | 'existing' {
  if (route.kind === 'motorway') {
    const paired = motorwayCategory(route);
    return route.alignment.kind === 'corridor' ? paired : carriagewayCategory(paired);
  }
  if (route.kind === 'railway') return railCategory(route.specification.tracks);
  return route.specification.crossSection;
}

/** The paired corridor category of a motorway route (D 27.5 or S 21.5), from its cross-section. */
export function motorwayCategory(route: Extract<RouteDesign, { kind: 'motorway' }>): PairedCategoryId {
  const cs = route.specification.crossSection;
  return (cs in CATEGORIES ? pairedCategoryOf(cs as CategoryId) : undefined) ?? MOTORWAY_CATEGORY;
}

/** Crown (formation) width of a designed line, m; an existing road's own mapped width. */
export function routeCrownWidth(route: RouteDesign): number {
  const category = routeCategory(route);
  return category === 'existing' ? (route.kind === 'road' ? route.specification.existingWidth! : 0) : CATEGORIES[category].crownWidth;
}
