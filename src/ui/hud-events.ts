// What the HUD's controls do (category, speed, road height mode, Start over, the motorway's directions,
// Load best) and where a click on a listed problem leads. Moved out of main.ts verbatim.
import type { CategoryId } from '../core/data/categories';
import type { Design, Result } from '../core/evaluate';
import type { ProjectResult, RouteId } from '../core/project';
import { corridorOfRoute, rejoinCorridor } from '../core/project-motorway';
import { DIRECTIONS_TEXT } from '../core/terms';
import type { ProjectStore } from '../project-store';
import type { View } from '../render/view';
import type { ActiveRouteStore } from './active-route-store';
import type { Hud, HudEvents } from './hud';
import type { Sel } from './inspector';
import type { Intro } from './intro';
import { pieceAt } from './pieces';
import type { ProfilePanel } from './profile';
import { toast } from './toast';

export interface HudEventContext {
  readonly store: ActiveRouteStore; readonly projectStore: ProjectStore; readonly view: View; readonly profile: ProfilePanel;
  readonly hud: Hud; readonly intro: Intro;
  /** the active road's shown result and its last full one; the last full project result */
  readonly last: Result | null; readonly lastFull: Result | null; readonly projectFull: ProjectResult | null;
  /** the newest request is a full one and its result is in */
  settled(): boolean;
  /** exactly the one legacy road (the single-road score and problem list apply) */
  legacyFacade(): boolean;
  takeProfile(d: Design): void;
  select(next: Sel | null, fly?: boolean): void;
  switchRoute(id: RouteId, created?: boolean, oneDirection?: boolean): boolean;
  joinStretch(id: string): void;
}

export function hudEvents(app: HudEventContext): HudEvents {
  const events: HudEvents = {
    onCategory: (c) => app.store.update((d) => { d.category = c as CategoryId; }),
    onSpeed: (s) => app.store.update((d) => { d.speed = s; }),
    onProfileMode: (mode) => {
      // heights by hand are one setting of the whole motorway: back to both directions for it
      const corridor = app.store.route && corridorOfRoute(app.projectStore.snapshot.design, app.store.route.id);
      if (app.store.oneDirection && corridor?.mode === 'paired') {
        app.switchRoute(corridor.children.forward, false, false); toast('Heights by hand or Auto: set for both directions together.');
      }
      if (mode === app.store.design.profileMode || (mode === 'manual' && (!app.last || !app.settled()))) return;
      app.store.update((d) => { if (mode === 'manual') app.takeProfile(d); else d.profileMode = 'auto'; });
    },
    onReset: () => {
      app.select(null);
      app.store.reset(); app.view.resetCamera(); app.profile.fit();
      toast('Back to the starting road.', 'Undo', () => app.store.undo());
    },
    onIntro: () => app.intro.show(),
    onJoinStretch: (id) => app.joinStretch(id),
    onDirection: (which) => {
      const route = app.store.route, corridor = route ? corridorOfRoute(app.projectStore.snapshot.design, route.id) : undefined;
      if (!corridor || app.projectStore.inTransaction) return;
      if (which === 'both') {
        if (corridor.mode !== 'independent') { app.select(null); app.switchRoute(corridor.children.forward, false, false); return; }
        app.select(null);
        app.store.editProject(d => { Object.assign(d, rejoinCorridor(d, corridor.id)); });
        app.switchRoute(corridor.children.forward);
        toast(DIRECTIONS_TEXT.join, 'Undo', () => app.store.undo());
        return;
      }
      // choosing a direction only chooses what a drag moves: the design changes with the first edit
      app.select(null);
      app.switchRoute(corridor.children[which], false, corridor.mode === 'paired');
    },
    onLoadBest: () => { if (app.store.best) { app.store.loadBest(); toast('Loaded your best design.', 'Undo', () => app.store.undo()); } },
    onViolation: (k) => {
      // the list shows the last full result's violations (previews do not replace it)
      if (app.legacyFacade() || !app.projectFull) { showViolation(app.lastFull?.violations[k]); return; }
      const issue = app.hud.listedIssue(k), owner = issue?.scope.routeIds[0];
      if (!issue) return;
      // not checked yet (e.g. where two new roads meet): show the place; there is nothing to select or fix there
      if (issue.check === 'not-checked') {
        if (issue.at) app.view.flyTo(issue.at.x, issue.at.y, 1200);
        const here = issue.locations.find(l => l.routeId === app.store.activeRouteId);
        if (here && app.last) app.profile.focus(Math.max(0, here.s0 - 150), Math.min(app.last.length, here.s1 + 150));
        if (!issue.at && !here) app.hud.reveal('viol');
        return;
      }
      if (owner && owner !== app.store.activeRouteId) app.switchRoute(owner);
      if (issue.scope.buildingIndex !== undefined) { app.select({ kind: 'building', j: issue.scope.buildingIndex }, true); return; }
      // A road's own check: core lists each road's kernel violations in order, route-qualified. Its
      // ordinal among that road's 'invalid' issues identifies the kernel violation (never its title).
      const own = app.projectFull.issues.filter(i => i.blocking === 'invalid' && i.scope.routeIds.length === 1 && i.scope.routeIds[0] === app.store.activeRouteId);
      const n = own.indexOf(issue), v = n >= 0 && app.lastFull && own.length === app.lastFull.violations.length ? app.lastFull.violations[n] : undefined;
      if (v && v.title === issue.violation.title) { showViolation(v); return; }
      const at = issue.locations.find(l => l.routeId === app.store.activeRouteId), d = app.store.read();
      if (!at) { app.hud.reveal('viol'); return; }
      if (at.pi !== undefined && d?.pis[at.pi]) app.select({ kind: 'bend', i: at.pi }, true);
      else if (at.vpi !== undefined && d?.profileMode === 'manual' && app.lastFull && at.vpi > 0 && at.vpi < app.lastFull.vpis.length - 1) app.select({ kind: 'vpi', i: at.vpi }, true);
      else app.select({ kind: 'stretch', s0: at.s0, s1: at.s1 }, true);
    },
  };
  const showViolation = (v: Result['violations'][number] | undefined) => {
    const r = app.lastFull;
    if (!v || !r) return;
    const roadId = (v as { crossing?: { roadId?: number } }).crossing?.roadId;
    const pin = v.kind === 'profile' ? app.store.design.gradePins?.find((p) => p.s >= v.s0 - 1 && p.s <= v.s1 + 1) : undefined;
    const t: Sel | null = v.target?.buildings?.length ? { kind: 'building', j: v.target.buildings[0] }
      : roadId !== undefined ? { kind: 'crossing', roadId }
        : v.pi !== undefined ? { kind: 'bend', i: v.pi } : v.pis?.length ? { kind: 'bend', i: v.pis[0] }
          : v.vpi !== undefined && app.store.design.profileMode === 'manual' && v.vpi > 0 && v.vpi < r.vpis.length - 1 ? { kind: 'vpi', i: v.vpi }
          : pin ? { kind: 'pin', s: pin.s } : v.goal ? null
            : v.s1 - v.s0 < 60 ? (() => { const p = pieceAt(r, (v.s0 + v.s1) / 2); return { kind: 'stretch', s0: p.s0, s1: p.s1, piece: p.kind } as Sel; })()
              : { kind: 'stretch', s0: v.s0, s1: v.s1 };
    if (!t) { app.hud.reveal('viol'); return; }
    app.select(t);
    const i = Math.max(0, Math.min(r.n - 1, Math.round((v.s0 + v.s1) / 2 / r.ds)));
    app.view.lookAt(r.x[i], r.y[i], Math.max(1200, (v.s1 - v.s0) * 1.5), 20, 45);
    app.profile.focus(v.s0, v.s1);
  };
  return events;
}
