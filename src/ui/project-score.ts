// The score in the HUD: the project's total (while a road is dragged: with that road's live price), the
// price of the line being edited alone, whose roads are "ours", and when the single-road verdict of the
// original exercise applies. Moved out of main.ts verbatim.
import type { RouteId } from '../core/project';
import { corridorOfRoute } from '../core/project-motorway';
import type { ProjectStore } from '../project-store';
import type { Session } from '../session';
import type { ActiveRouteStore } from './active-route-store';
import type { Hud } from './hud';

export interface ProjectScoreContext {
  readonly session: Session;
  readonly store: ActiveRouteStore; readonly projectStore: ProjectStore; readonly hud: Hud;
}

export function createProjectScore(app: ProjectScoreContext) {
  const missionRouteId = () => app.projectStore.snapshot.design.routes.find(r => r.role === 'mission')?.id;
  /** exactly the one legacy road: the unchanged single-road score/verdict applies (core's facade) */
  const legacyFacade = () => {
    const d = app.projectStore.snapshot.design, only = d.routes[0];
    return d.routes.length === 1 && !d.corridors.length && !d.connections.length && only.role === 'mission' && !only.source
      && app.store.activeRouteId === only.id && app.store.read() !== null;
  };
  /** player names of the routes; a motorway's two directions are one motorway (its forward name) */
  const routeNames = () => {
    const d = app.projectStore.snapshot.design, names = Object.fromEntries(d.routes.map(r => [r.id, r.name]));
    for (const c of d.corridors) if (names[c.children.forward]) names[c.children.reverse] = names[c.children.forward];
    return names;
  };
  const projectScore = (pending: boolean) => {
    const mission = missionRouteId(), active = app.store.activeRouteId, alone = app.session.projectFull?.cost.alone ?? {};
    // While a road is dragged the project total follows its live price: the last full total with this road's
    // own bill replaced by the preview's (≈).
    const total = app.session.projectFull?.cost.total;
    const live = app.session.activePreviewPrice !== null && total !== null && total !== undefined && active && active in alone
      ? total - alone[active] + app.session.activePreviewPrice : null;
    // our road: the mission's route, and a motorway mission's other direction
    const missionCorridor = mission ? corridorOfRoute(app.projectStore.snapshot.design, mission) : undefined;
    const ours = new Set([mission, missionCorridor?.children.forward, missionCorridor?.children.reverse].filter((id): id is RouteId => !!id));
    const groups = Object.fromEntries(app.projectStore.snapshot.design.corridors.flatMap(c => [[c.children.forward, c.id], [c.children.reverse, c.id]]));
    // which road a bill is, across steps: a rebuilt stretch is the mapped road it rebuilds (a saved or best design
    // loaded gives it another id; the change line would list it twice), a motorway its corridor
    const lines: Record<RouteId, string> = { ...groups };
    for (const r of app.projectStore.snapshot.design.routes) if (!groups[r.id] && r.source?.intervals.length)
      lines[r.id] = `source:${r.source.intervals.map(i => `${i.sourceId}:${Math.round(i.s0)}-${Math.round(i.s1)}`).join('+')}`;
    // "Our road only" / "This railway only": what the price shown is for, in the active line's own word
    const word = (id: RouteId | null | undefined) => { const k = app.projectStore.snapshot.design.routes.find(r => r.id === id)?.kind; return k === 'railway' ? 'railway' : k === 'motorway' ? 'motorway' : 'road'; };
    const only = (id: RouteId | null | undefined) => `${id && ours.has(id) ? 'Our' : 'This'} ${word(id)} only`;
    const own = app.session.activePreviewPrice !== null ? { total: app.session.activePreviewPrice, approx: true, label: only(active), routeId: active ?? undefined }
      : active && active in alone ? { total: alone[active], approx: false, label: only(active), routeId: active }
        : mission && mission in alone ? { total: alone[mission], approx: false, label: only(mission), routeId: mission } : null;
    app.hud.setProject(app.session.projectFull, pending, app.projectStore.best, { missionRouteId: mission, ours, groups, lines, legacy: legacyFacade(), ownPrice: own,
      liveTotal: live, dragging: app.session.activePreviewPrice !== null && app.projectStore.inTransaction,
      activeRouteId: active ?? undefined, names: routeNames(),
      lengths: Object.fromEntries(Object.values(app.session.projectFull?.routes ?? {}).flatMap(r => {
        const length = r.legacy?.length ?? r.surface?.points.at(-1)?.s; return length === undefined ? [] : [[r.routeId, length]];
      })) });
  };
  return { missionRouteId, legacyFacade, projectScore };
}
