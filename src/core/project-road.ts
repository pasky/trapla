// Explicit dispatch boundary for the legacy road kernel. This is a ROUTE evaluation, not a network bill.
import { editedNetwork, type ResolvedEnds, type SourceWays } from './project-roadnet';
import { KIND } from './structures';
import { evaluate, OLD_ROAD_TIE, type EvalContext, type EvalOptions, type Result } from './evaluate';
import { legacyDesignForRoute } from './project-legacy';
import { modeCapability } from './mode-policy';
import type { ProjectDesign, RoadSpec, XYZ } from './project';
import { ringWorks, tieInChecks, tieIns } from './tie-in';
import { replacementWorks, type Replacement, type ReplacementWork } from './project-replacement';
import { applyKept, plannedKept, releaseHeld } from './project-kept';
import { ROAD_CLASSES } from './data/urban';
import { CATEGORIES } from './data/categories';

export type ProjectRoadEvaluation =
  /** `unpriced`: the road itself was engineered, but the project cannot price this change yet. */
  | { status: 'evaluated'; result: Result; unpriced?: 'source-needs-network'[];
      /** Ends joined to an existing ground road whose junction this road's bill includes. */
      junctionEnds?: ('a' | 'b')[];
      /** A rebuilt stretch: removing its old road and reconnecting its side roads (C1 b). */
      replacement?: Replacement;
      /** A roundabout's ring at an end: its land and the houses on it. */
      ringWorks?: ReplacementWork[];
      /** A rebuilt stretch: what the kernel billed where the old road is kept as it is (a credit). */
      keptWork?: ReplacementWork }
  | { status: 'incomplete'; reason: 'unsupported-mode' | 'unsupported-policy' | 'unsupported-alignment'
      | 'unresolved-binding' | 'unimplemented-tangent' | 'source-needs-network' | 'mission-needs-network' | 'unsupported-crossing' };

/** Legacy road-net way of each mapped source (pack sidecar `legacyNetIndex`), to leave a rebuilt
 * stretch out of the network every road is checked against. */
export type { SourceWays } from './project-roadnet';
/** Cross-sections the road kernel prices for each legal class (data/categories.ts `legalClasses`); the legal
 * class itself selects no other rule in this kernel. */
const legalClassFits = (spec: RoadSpec) => spec.crossSection !== 'existing' && !!CATEGORIES[spec.crossSection].legalClasses?.includes(spec.legalClass);

export function evaluateProjectRoad(ctx: EvalContext, project: ProjectDesign, routeId: string,
  objectData: string, options: Pick<EvalOptions, 'preview' | 'materialValue' | 'structureValue'> & { sourceWays?: SourceWays;
    /** Heights where a higher-ranking road's crossing holds this road (EvalOptions.holds). */
    holds?: EvalOptions['holds'];
    /** Ends on another designed road follow that road's CURRENT line (its nearest point and height). */
    ends?: { a?: XYZ; b?: XYZ };
    /** The same for the designed roads in this road's network (project-roadnet.ts editedNetwork). */
    endsOf?: (route: ProjectDesign['routes'][number]) => ResolvedEnds } = {}): ProjectRoadEvaluation {
  const route = project.routes.find(r => r.id === routeId);
  if (!route) throw new Error('Unknown project route');
  // BEFORE categories, horizontal/vertical norms, AADT, pricing or emissions are selected.
  if (!modeCapability(route.kind).scoring || route.kind !== 'road') return { status: 'incomplete', reason: 'unsupported-mode' };
  const spec = route.specification;
  if (spec.policy !== 'legacy-road' || spec.crossSection === 'existing' || !CATEGORIES[spec.crossSection].speeds.includes(spec.designSpeed)
    || !legalClassFits(spec)) return { status: 'incomplete', reason: 'unsupported-policy' };
  if (project.objectData !== objectData || route.endpoints.a.binding !== 'resolved' || route.endpoints.b.binding !== 'resolved')
    return { status: 'incomplete', reason: 'unresolved-binding' };
  if (route.endpoints.a.tangent || route.endpoints.b.tangent) return { status: 'incomplete', reason: 'unimplemented-tangent' };
  // Every road is checked against the network as the player edited it: rebuilt stretches gone, the
  // designed roads it crosses present (project-roadnet.ts). A rebuilt stretch needs the sidecar's link.
  let roads = ctx.roads, sourceWay: number | undefined;
  if (route.source) {
    sourceWay = options.sourceWays?.get(route.source.intervals[0]?.sourceId ?? '');
    if (route.role !== 'auxiliary' || !ctx.roads || sourceWay === undefined) return { status: 'incomplete', reason: 'source-needs-network' };
  }
  if (ctx.roads) {
    const edited = editedNetwork(ctx.roads, project, [route], options.sourceWays, options.endsOf);
    if (!edited) return { status: 'incomplete', reason: 'source-needs-network' };
    roads = edited.roads;
  }
  if (route.alignment.kind !== 'pi' || !['auto', 'manual'].includes(route.alignment.vertical.kind)) return { status: 'incomplete', reason: 'unsupported-alignment' };
  const mission = route.role === 'mission';
  const goals = project.mission.connections;
  if (mission && (goals.length !== 1 || !goals[0].kinds.includes('road')
    || route.endpoints.a.anchor.kind !== 'mission' || route.endpoints.b.anchor.kind !== 'mission'
    || route.endpoints.a.anchor.portId !== goals[0].from || route.endpoints.b.anchor.portId !== goals[0].to))
    return { status: 'incomplete', reason: 'mission-needs-network' };
  if (mission) for (const e of [route.endpoints.a, route.endpoints.b]) {
    const anchor = e.anchor;
    const port = anchor.kind === 'mission' ? project.mission.ports.find(p => p.id === anchor.portId) : undefined;
    if (!port || Math.hypot(e.position.x - port.position.x, e.position.y - port.position.y, e.position.z - port.position.z) > 1e-6)
      return { status: 'incomplete', reason: 'unresolved-binding' };
  }
  const goal = mission ? goals[0] : undefined;
  if (goal?.demand && goal.demand.kind !== 'road') return { status: 'incomplete', reason: 'mission-needs-network' };
  for (const c of route.alignment.controls.crossings ?? []) {
    if (c.target.kind !== 'legacy-way' && c.target.kind !== 'route') return { status: 'incomplete', reason: 'unsupported-crossing' };
    if (c.target.kind === 'legacy-way' && c.target.objectData !== project.objectData) return { status: 'incomplete', reason: 'unresolved-binding' };
  }
  const design = legacyDesignForRoute(project, routeId);
  // On its bridge over a higher-ranking road this road is that bridge (the player's own structures win).
  const decks = (options.holds ?? []).flatMap(h => h.bridge ? [{ s0: h.bridge[0], s1: h.bridge[1], kind: KIND.bridge }] : []);
  if (decks.length) design.structureOverrides = [...decks, ...design.structureOverrides ?? []];
  const a = options.ends?.a ?? route.endpoints.a.position, b = options.ends?.b ?? route.endpoints.b.position;
  // A ground-level end keeps the kernel's own terrain sample at its end station (legacy, bit-exact);
  // only an explicit non-ground XYZ (e.g. another road's deck) overrides it.
  const explicitZ = (p: typeof a) => p.z === ctx.terrain.heightAt(p.x, p.y) ? undefined : p.z;
  // A side road's ends on existing ground roads are junction works of this road (C1 a); a rebuilt
  // stretch's ends continue as its old road.
  const forms = route.alignment.kind === 'pi' ? route.alignment.controls.junctionForms ?? {} : {};
  const ties = route.role === 'auxiliary' && roads ? tieIns(roads, route.endpoints, !!route.source, forms) : [];
  const junctions = ties.length ? { junctions: [...ctx.junctions ?? [], ...ties.map(t => t.junction)] } : {};
  // Where a rebuilt stretch's line stays on its old road, the old road is kept as it is (project-kept.ts).
  // Known before the kernel runs (it depends on the line only), so the kernel builds nothing there.
  let kept: Uint8Array | undefined, oldPath: { x: number; y: number }[] = [];
  if (route.source && sourceWay !== undefined && ctx.roads) {
    const da = ctx.roads.wayStation(sourceWay, a.x, a.y), db = ctx.roads.wayStation(sourceWay, b.x, b.y);
    oldPath = ctx.roads.wayPath(sourceWay, Math.min(da, db), Math.max(da, db));
    const planned = plannedKept(a, b, design, [oldPath]), st = planned.st;
    kept = planned.kept;
    // (not where another road's crossing lifts or lowers it: there it is rebuilt, ramps included)
    if (options.holds?.length) releaseHeld(kept, st.s, i => ctx.terrain.heightAt(st.x[i], st.y[i]), options.holds, ctx.scenario.maxGradient, OLD_ROAD_TIE);
  }
  const result = evaluate({ ...ctx, roads, ...junctions, a, b, scenario: { ...ctx.scenario,
    traffic: spec.operations.aadt, heavyShare: spec.operations.heavyShare,
    maxTravelMin: goal?.maxTravelMin ?? ctx.scenario.maxTravelMin } }, design,
  { ...options, ...(kept?.some(Boolean) ? { oldRoad: kept } : {}), endpointElevations: { a: explicitZ(a), b: explicitZ(b) }, operatingSpeed: spec.operations.speed, acousticSourceId: route.acousticSourceId,
    capacityTraffic: goal?.demand?.kind === 'road' ? goal.demand.aadt : undefined,
    goals: { time: mission && goal?.maxTravelMin !== undefined, capacity: mission && goal?.demand !== undefined } });
  if (ties.length && roads && !options.preview) {
    const found = tieInChecks(ties, result, roads, ctx.terrain, ctx.buildings);
    if (found.length) { result.violations.push(...found); result.valid = false; }
  }
  // Where a rebuilt stretch stays on its old road, the old road is kept as it is: no norm, no works, no bill.
  let keptWork: ReplacementWork | null = null;
  if (kept) {
    if (kept.length !== result.n) throw new Error('Kept cells do not match the road’s stations');
    keptWork = applyKept(result, kept, CATEGORIES[design.category].crownWidth / 2, { paths: [oldPath], heightAt: (x, y) => ctx.terrain.heightAt(x, y) });
  }
  // The replacement's own works; without the old road's link (no road links) it cannot be priced.
  const replacement = route.source && sourceWay !== undefined && ctx.roads && !options.preview
    ? replacementWorks(route, result, ctx.roads, sourceWay, project.connections, id => options.sourceWays?.get(id), kept) : undefined;
  if (replacement?.violations.length) { result.violations.push(...replacement.violations); result.valid = false; }
  const unpriced = route.source && !replacement && !options.preview ? ['source-needs-network' as const] : [];
  const junctionEnds = ties.filter(t => t.junction.kind !== 'continuation').map(t => t.end);
  const gone = new Set([...result.demolished, ...result.boughtOut].map(b => b.j));
  const rings: ReplacementWork[] = options.preview ? [] : ties.filter(t => t.junction.kind === 'roundabout').map(t => {
    const i = t.end === 'a' ? 0 : result.n - 1, w = ringWorks(t.x, t.y, ROAD_CLASSES[t.cls]?.width ?? 6.5, result.cell.urban[i], ctx.buildings, gone);
    return { kind: 'junction' as const, s: result.s[i], x: t.x, y: t.y, length: 0, cost: w.cost, ...(w.removed.length ? { removes: [...w.removed] } : {}),
      label: `Roundabout's ring: ${Math.round(w.area)} m² of land${w.removed.length ? `, ${w.removed.length} building${w.removed.length > 1 ? 's' : ''} removed` : ''}` };
  });
  return { status: 'evaluated', result, ...(unpriced.length ? { unpriced } : {}), ...(junctionEnds.length ? { junctionEnds } : {}),
    ...(replacement ? { replacement } : {}), ...(rings.length ? { ringWorks: rings } : {}), ...(keptWork ? { keptWork } : {}) };
}
