// Lossless geometry/control migration to the project envelope; no evaluation or storage side effects.
import type { Design, EvalContext } from './evaluate';
import { NOISE } from './data/urban';
import type { EndpointPair, MissionRequirements, ProjectDesign, RoadOperations, RouteDesign } from './project';
import { assertProjectDesign } from './project-validation';

export interface LegacyProjectContext {
  scenarioId: string; presetId: string; packId: string; objectData: string; transportData: string | null;
  endpoints: EndpointPair; mission: MissionRequirements; operations: RoadOperations;
}
const copy = <T>(v: T): T => structuredClone(v);

/** Bootstrap factory for the unchanged ground-ended legacy challenge ONLY. Existing transport
 * promotion uses surveyed/source surfaces instead, never this terrain-ended compatibility helper. */
export function makeLegacyProjectContext(ctx: EvalContext, identity: {
  presetId: string; packId: string; objectData: string; transportData: string | null;
}): LegacyProjectContext {
  const a = { ...ctx.a, z: ctx.terrain.heightAt(ctx.a.x, ctx.a.y) }, b = { ...ctx.b, z: ctx.terrain.heightAt(ctx.b.x, ctx.b.y) };
  return { ...identity, scenarioId: ctx.scenario.id,
    endpoints: { a: { position: a, anchor: { kind: 'mission', portId: 'a' }, binding: 'resolved' },
      b: { position: b, anchor: { kind: 'mission', portId: 'b' }, binding: 'resolved' } },
    mission: { id: `${ctx.scenario.id}:${identity.presetId}`, revision: 0,
      ports: [{ id: 'a', name: ctx.scenario.labels.a, position: { ...a } }, { id: 'b', name: ctx.scenario.labels.b, position: { ...b } }],
      connections: [{ from: 'a', to: 'b', direction: 'both', kinds: ['road'], maxTravelMin: ctx.scenario.maxTravelMin,
        demand: { kind: 'road', aadt: ctx.scenario.traffic } }] },
    operations: { aadt: ctx.scenario.traffic, heavyShare: ctx.scenario.heavyShare ?? NOISE.heavyShare, speed: 90 } };
}

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
        target: { kind: 'legacy-way' as const, objectData, roadId: c.roadId }, ...(c.via ? { via: c.via } : {}), ...(c.to !== undefined ? { to: c.to } : {}) })) }) },
      vertical: profileMode === 'auto' ? { kind: 'auto', pins: gradePins ?? [], manualVpis: vpis }
        : { kind: 'manual', vpis, ...(gradePins === undefined ? {} : { autoPins: gradePins }) } },
    specification: { kind: 'road', policy: 'legacy-road', legalClass: category === 'S7.5' ? 'II' : 'I',
      crossSection: category as 'S7.5' | 'S9.5' | 'S11.5', designSpeed: speed, operations: { ...copy(context.operations), speed, speedPolicy: 'design' } },
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
    return { roadId: c.target.roadId, type: c.choice, ...(c.via ? { via: c.via } : {}), ...(c.to !== undefined ? { to: c.to } : {}) };
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
  if (design.objectData && design.objectData !== project.objectData) throw new Error('Foreign object binding needs repair');
  // Refuse silent flattening of imported paths/corridor children before editing through old widgets.
  legacyDesignForRoute(project, routeId);
  // Validate editable fields in isolation without pretending external endpoint anchors disappeared.
  // Their real anchors are preserved below and checked against the complete project.
  const isolatedEndpoints: EndpointPair = { a: { ...old.endpoints.a, anchor: { kind: 'free' } },
    b: { ...old.endpoints.b, anchor: { kind: 'free' } } };
  const adapted = projectFromLegacyDesign(design, { ...project, endpoints: isolatedEndpoints,
    mission: project.mission, operations: old.specification.operations });
  const next = copy(project), replacement = adapted.routes[0];
  if (replacement.kind !== 'road') throw new Error('Legacy adapter mode mismatch');
  replacement.specification.operations = copy(old.specification.operations);
  if (design.speed !== old.specification.designSpeed && old.specification.operations.speedPolicy !== 'independent')
    replacement.specification.operations.speed = design.speed;
  next.routes = next.routes.map(r => r.id === routeId ? { ...replacement, id: old.id, name: old.name, role: old.role,
    endpoints: copy(old.endpoints), acousticSourceId: old.acousticSourceId, revision: old.revision, source: old.source } : r);
  next.buildingOverrides = adapted.buildingOverrides;
  assertProjectDesign(next);
  return next;
}
