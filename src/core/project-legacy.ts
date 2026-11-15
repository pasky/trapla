// Lossless geometry/control migration to the project envelope; no evaluation or storage side effects.
import type { Design } from './evaluate';
import type { EndpointPair, MissionRequirements, ProjectDesign, RoadOperations, RouteDesign } from './project';
import { assertProjectDesign } from './project-validation';

export interface LegacyProjectContext {
  scenarioId: string; presetId: string; packId: string; objectData: string; transportData: string | null;
  endpoints: EndpointPair; mission: MissionRequirements; operations: RoadOperations;
}
const copy = <T>(v: T): T => structuredClone(v);

/** The caller reads exact legacy bytes before ever constructing Store. Unknown shapes are not defaults. */
export function projectFromLegacyDesign(value: unknown, context: LegacyProjectContext): ProjectDesign {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid legacy design');
  const d = value as Design & { schemaVersion?: unknown; naive?: unknown };
  if ('schemaVersion' in d || d.naive || !['S7.5', 'S9.5', 'S11.5'].includes(d.category)
    || !['auto', 'manual'].includes(d.profileMode) || !Array.isArray(d.vpis)) throw new Error('Unsupported legacy design');
  const objectData = d.objectData || context.objectData;
  const { category, speed, pis, profileMode, vpis, gradePins, crossingOverrides, buildingOverrides,
    objectData: _objectData, ...controls } = copy(d);
  const route: RouteDesign = {
    id: 'route:legacy-mission', name: 'Road', role: 'mission', revision: 0, kind: 'road', acousticSourceId: 'acoustic:legacy-mission',
    endpoints: copy(context.endpoints),
    alignment: { kind: 'pi', pis, controls: { ...controls,
      ...(crossingOverrides === undefined ? {} : { crossings: crossingOverrides.map(c => ({ choice: c.type,
        target: { kind: 'legacy-way' as const, objectData, roadId: c.roadId } })) }) },
      vertical: profileMode === 'auto' ? { kind: 'auto', pins: gradePins ?? [], manualVpis: vpis }
        : { kind: 'manual', vpis, ...(gradePins === undefined ? {} : { autoPins: gradePins }) } },
    specification: { kind: 'road', policy: 'legacy-road', legalClass: category === 'S7.5' ? 'II' : 'I',
      crossSection: category as 'S7.5' | 'S9.5' | 'S11.5', designSpeed: speed, operations: { ...copy(context.operations), speed } },
  };
  const project: ProjectDesign = {
    schemaVersion: 1, scenarioId: context.scenarioId, presetId: context.presetId, packId: context.packId,
    objectData, transportData: context.transportData, routes: [route], corridors: [], connections: [],
    buildingOverrides: buildingOverrides ?? [], mission: copy(context.mission),
  };
  assertProjectDesign(project);
  return project;
}

/** Active-route legacy widget/kernel adapter. It refuses any representation that would need fitting,
 * foreign-source remapping or mode physics. Building choices have exactly one project owner. */
export function legacyDesignForRoute(project: ProjectDesign, routeId: string): Design {
  const r = project.routes.find(r => r.id === routeId);
  if (!r || r.kind !== 'road' || r.specification.policy !== 'legacy-road' || r.specification.crossSection === 'existing'
    || r.alignment.kind !== 'pi' || !['auto', 'manual'].includes(r.alignment.vertical.kind)) throw new Error('Route needs a non-legacy kernel');
  const a = r.alignment, v = a.vertical;
  const crossings = a.controls.crossings?.map(c => {
    if (c.target.kind !== 'legacy-way' || c.target.objectData !== project.objectData) throw new Error('Crossing binding needs repair');
    return { roadId: c.target.roadId, type: c.choice };
  });
  const { crossings: _crossings, ...controls } = a.controls;
  if (v.kind !== 'auto' && v.kind !== 'manual') throw new Error('Unsupported vertical authority');
  return copy({ ...controls, category: r.specification.crossSection, speed: r.specification.designSpeed,
    pis: a.pis, profileMode: v.kind, vpis: v.kind === 'manual' ? v.vpis : v.manualVpis ?? [],
    gradePins: v.kind === 'auto' ? v.pins : v.autoPins,
    crossingOverrides: crossings, buildingOverrides: project.buildingOverrides, objectData: project.objectData });
}

/** Apply legacy editing without replacing route identity/endpoints/operations or another route's controls. */
export function replaceRouteFromLegacy(project: ProjectDesign, routeId: string, design: Design): ProjectDesign {
  const old = project.routes.find(r => r.id === routeId);
  if (!old || old.kind !== 'road') throw new Error('Unknown road');
  // Refuse silent flattening of imported paths/corridor children before editing through old widgets.
  legacyDesignForRoute(project, routeId);
  const adapted = projectFromLegacyDesign(design, { ...project, endpoints: old.endpoints,
    mission: project.mission, operations: old.specification.operations });
  const next = copy(project), replacement = adapted.routes[0];
  next.routes = next.routes.map(r => r.id === routeId ? { ...replacement, id: old.id, name: old.name, role: old.role,
    acousticSourceId: old.acousticSourceId, revision: old.revision, source: old.source } : r);
  next.buildingOverrides = adapted.buildingOverrides;
  assertProjectDesign(next);
  return next;
}
