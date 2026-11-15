// Kind-generic hooks of the two "any line" flows, so motorways and railways plug into the same UX:
//
//  1. Mapped line → rebuild: a click selects any mapped road/railway (MappedRoadCard), a drag on its
//     highlighted stretch rebuilds it. `MappedLineKind` says whether a mapped source can be rebuilt by
//     this kind, what it becomes (one plain sentence) and makes the atomic promote command. The stretch
//     itself (junction to junction, never into another project road's claim) is kind-neutral.
//  2. Build → <kind>: click start and end. `BuildKind` says where an end may go (on a mapped source, on
//     a project route, or on open ground) and creates the straight route between the two placed ends.
//
// Register a kind once at startup (`registerMappedLineKind`, `registerBuildKind`); the Build menu lists
// exactly the registered build kinds, in registration order. The road kinds below are registered by
// default. A kind returns `null` from `rebuildable` for sources that are not its own (another kind may
// take them), and a plain `why` for its own sources it cannot rebuild yet. Player text goes through the
// conventions of core/terms.ts and tests/player-text.test.ts: plain words, no IDs.
import type { ProjectDesign, RouteDesign, RouteKind, RouteResult, SourceInterval } from '../core/project';
import type { ProjectTransportIndex } from '../core/project-network';
import type { ProjectCommand } from '../project-store-contract';
import { ROAD_CLASSES } from '../core/data/urban';
import { KIND } from '../core/structures';
import { moveStretchEnds, newRoad, rebuildable, rebuildCommand, type PlacedEnd } from './road-edit';

export interface RouteIds { routeId: string; acousticSourceId: string }
export type Verdict<T> = ({ ok: true } & T) | { ok: false; why: string };

export interface MappedLineKind {
  kind: RouteKind;
  /** null: not this kind's source. Otherwise what it would be rebuilt as ("class III road (S 7.5)"). */
  rebuildable(base: ProjectTransportIndex, sourceId: string): Verdict<{ becomes: string }> | null;
  /** The atomic, undoable promote command for this stretch (its line converted explicitly once). */
  rebuild(base: ProjectTransportIndex, interval: SourceInterval, ids: RouteIds): Extract<ProjectCommand, { type: 'promote' }>;
  /** The project with this rebuilt route's ends moved along its old line to [s0, s1] (one edit). */
  moveEnds(base: ProjectTransportIndex, project: ProjectDesign, routeId: string, s0: number, s1: number): ProjectDesign;
}
export interface BuildKind {
  kind: RouteKind;
  /** Build menu label. */
  label: string;
  /** An end on a mapped source at canonical station s, or a plain refusal. */
  onSource(base: ProjectTransportIndex, sourceId: string, s: number): Verdict<{ end: PlacedEnd; label: string }>;
  /** An end on a project route at station s, given its engineered result. */
  onRoute(route: RouteDesign, result: RouteResult, s: number): Verdict<{ end: PlacedEnd; label: string }>;
  /** The new straight route between two placed ends. */
  create(project: ProjectDesign, a: PlacedEnd, b: PlacedEnd, ids: RouteIds): RouteDesign;
}

const mappedKinds: MappedLineKind[] = [], buildKinds: BuildKind[] = [];
export function registerMappedLineKind(kind: MappedLineKind) { mappedKinds.push(kind); }
export function registerBuildKind(kind: BuildKind) { buildKinds.push(kind); }
export const registeredBuildKinds = (): readonly BuildKind[] => buildKinds;
/** The kind that rebuilds this mapped source, with its verdict; a plain refusal when none does. */
export function mappedLineKindFor(base: ProjectTransportIndex, sourceId: string): { kind: MappedLineKind; verdict: Verdict<{ becomes: string }> } | { kind: null; verdict: { ok: false; why: string } } {
  let refusal: { kind: MappedLineKind; verdict: Verdict<{ becomes: string }> } | null = null;
  for (const kind of mappedKinds) {
    const verdict = kind.rebuildable(base, sourceId);
    if (verdict?.ok) return { kind, verdict };
    if (verdict && !refusal) refusal = { kind, verdict };
  }
  const source = base.source(sourceId);
  return refusal ?? { kind: null, verdict: { ok: false, why: source?.kind === 'railway' ? 'Railways cannot be changed yet.' : 'This line cannot be changed yet.' } };
}
/** The mapped-line kind that owns a rebuilt route (for moving its ends). */
export const mappedLineKindOf = (route: RouteDesign) => mappedKinds.find(k => k.kind === route.kind) ?? null;

const roadName = (base: ProjectTransportIndex, sourceId: string) => {
  const t = base.source(sourceId)?.tags;
  return t?.name || [ROAD_CLASSES[t?.highway ?? '']?.label ?? 'road', t?.ref].filter(Boolean).join(' ');
};

export const ROAD_LINE: MappedLineKind = {
  kind: 'road',
  rebuildable(base, sourceId) {
    if (base.source(sourceId)?.kind !== 'road') return null;
    const what = rebuildable(base, sourceId);
    return what.ok ? { ok: true, becomes: what.spec.crossSection === 'S9.5' ? 'class I road (S 9.5)' : `class ${what.spec.legalClass} road (S 7.5)` } : what;
  },
  rebuild: (base, interval, ids) => rebuildCommand(base, interval, ids),
  moveEnds: (base, project, routeId, s0, s1) => moveStretchEnds(base, project, routeId, s0, s1),
};
export const ROAD_BUILD: BuildKind = {
  kind: 'road', label: 'Road',
  onSource(base, sourceId, s) {
    const source = base.source(sourceId);
    if (!source || source.kind !== 'road') return { ok: false, why: 'A road cannot end on a railway.' };
    if (ROAD_CLASSES[source.tags.highway ?? '']?.noAtGrade) return { ok: false, why: 'A motorway can only be joined at an interchange; those are not in the game yet.' };
    const p = source.elevation === 'terrain' && !source.bridge && !source.tunnel ? base.position(source.id, s) : null;
    if (!p) return { ok: false, why: 'A road cannot join on a bridge or in a tunnel.' };
    return { ok: true, label: `joins ${roadName(base, sourceId)}`,
      end: { position: p, anchor: { kind: 'source', location: { transportData: base.transportData, sourceId, s } } } };
  },
  onRoute(route, result, s) {
    const r = result.legacy;
    if (route.kind !== 'road' || !r) return { ok: false, why: 'This road is not checked yet, so nothing can join it.' };
    const i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));
    if (r.kind[i] !== KIND.earth) return { ok: false, why: 'A road cannot join on a bridge or in a tunnel.' };
    return { ok: true, label: route.role === 'mission' ? 'joins our road' : `joins ${route.name}`, end: { position: { x: r.x[i], y: r.y[i], z: r.grade[i] }, anchor: { kind: 'route', routeId: route.id, s: r.s[i] } } };
  },
  create: (project, a, b, ids) => newRoad(project, a, b, ids),
};
registerMappedLineKind(ROAD_LINE);
registerBuildKind(ROAD_BUILD);
