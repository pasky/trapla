// Hover links between the map and the profile, and the map's cursor: a bend marker lights up its mark in
// the profile and back; the road, a crossed road, a reroute or a mapped road under the mouse says what a
// click or a drag there would do: "drag to …" only on what is selected, "click to select" on a road that is
// not (a drag there moves the map). It reads the app through `MapHoverContext`.
import { ROAD_CLASSES } from '../core/data/urban';
import type { Design, Result } from '../core/evaluate';
import type { SourceInterval } from '../core/project';
import type { ProjectTransportIndex } from '../core/project-network';
import type { TransportGraphData } from '../core/project-transport';
import { KIND } from '../core/structures';
import { SELECT_TEXT } from '../core/terms';
import type { RouteExtras } from '../render/extras';
import type { View } from '../render/view';
import type { Pack } from '../scenario';
import type { BuildRoadTool, Placement } from './build-road';
import { shapeable } from './link-shape';
import type { MapPicks } from './map-picks';
import type { ProfilePanel } from './profile';
import type { CrossingDragPlan } from './crossing-drag';

export interface MapHoverContext extends Pick<MapPicks, 'routeAt' | 'roadAt' | 'crossingAt' | 'crossingWorksAt' | 'buildingAt' | 'sourceAt' | 'officialAt'> {
  readonly view: View; readonly pack: Pack; readonly profile: ProfilePanel; readonly extras: RouteExtras; readonly buildTool: BuildRoadTool;
  /** the active road's shown result (a preview while dragging) and its last full one; its design (throws when not editable) */
  readonly last: Result | null; readonly lastFull: Result | null; readonly design: Design;
  readonly transportIndex: ProjectTransportIndex | null; readonly transportGraph: TransportGraphData | null;
  /** the active road is selected (a drag on it bends it); the crossed road whose card is open */
  readonly roadSelected: boolean; readonly selectedCrossing: number | null;
  /** the last pointer position over the map (client px), kept for double clicks */
  readonly lastClient: { x: number; y: number };
  ensureTransport(): Promise<void>;
  placeAt(clientX: number, clientY: number, x: number, y: number): Placement;
  mappedGrab(clientX: number, clientY: number): SourceInterval | null;
  /** the selected crossing's part under the pointer and what a drag there does (ui/crossing-drag.ts) */
  crossingPlan(clientX: number, clientY: number): CrossingDragPlan | null;
  mappedRoadNear(x: number, y: number): boolean;
  /** what a drag of the active line bends (the hover label on our road) */
  bendLabel(): string;
}

/** @returns `highlightBend`: light up a bend's marker on the map (the profile → map half of the link) */
export function installMapHover(app: MapHoverContext): { highlightBend(i: number | null): void } {
  // the bend markers: profile → map
  const highlightBend = (i: number | null) => {
    for (const el of document.querySelectorAll<HTMLElement>('.pi.hl')) el.classList.remove('hl');
    if (i !== null) document.querySelector<HTMLElement>(`.pi[data-i="${i}"]`)?.classList.add('hl');
  };
  // map → profile: a bend marker, or the road under the mouse
  const overlayEl = document.getElementById('overlay')!;
  overlayEl.addEventListener('pointerover', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.pi');
    if (el) app.profile.setBendHover(Number(el.dataset.i));
  });
  overlayEl.addEventListener('pointerout', (e) => { if ((e.target as HTMLElement).closest('.pi')) app.profile.setBendHover(null); });
  let mapHoverAt: { x: number; y: number } | null = null, mapHoverFrame = 0, mapHoverKey = '';
  const mapHoverTick = () => {
    mapHoverFrame = 0;
    const at = mapHoverAt, r = app.last, canvas = app.view.renderer.domElement;
    let cursor = '', key = '';
    // Build → Road: where a click would put the end, what it would join, how long the road would be
    if (app.buildTool.active) {
      const g = at && app.view.pick(at.x, at.y);
      app.buildTool.hover(at && g ? app.placeAt(at.x, at.y, g.x, g.y) : null, g ? { x: g.x, y: g.y, z: app.pack.terrain.heightAt(g.x, g.y) } : null);
      key = 'placing';
    } else if (at && app.mappedGrab(at.x, at.y) && !app.routeAt(at.x, at.y, 10)) {
      cursor = 'grab'; key = 'mapped';
      if (key !== mapHoverKey) { const g = app.view.pick(at.x, at.y); if (g) app.view.setHover({ x: g.x, y: g.y, z: app.view.drape(g.x, g.y) }, 'drag to change'); }
    } else if (at && r && !app.buildTool.active) {
      const culvert = app.extras.culvertAt(at.x, at.y), cross = culvert ? null : app.crossingAt(at.x, at.y);
      const k = cross || culvert ? -1 : app.roadAt(at.x, at.y, 10);
      const building = cross || k >= 0 ? null : app.buildingAt(at.x, at.y);
      let works: ReturnType<typeof app.crossingWorksAt> = null;
      if (culvert) {
        cursor = 'pointer'; key = `c${culvert.s}`;
        if (key !== mapHoverKey) { app.view.setHover(null); app.profile.setHover(culvert.s, true); }
      } else if (cross) {
        // (its ring, once selected: a drag there moves where it crosses, or the hover says why it cannot)
        const plan = app.selectedCrossing === cross.roadId ? app.crossingPlan(at.x, at.y) : null;
        cursor = plan?.ok ? 'grab' : 'pointer'; key = `x${cross.roadId}${plan ? (plan.ok ? 'g' : 'n') : ''}`;
        const text = plan?.ok ? `${ROAD_CLASSES[cross.cls].label} · ${plan.hover}` : plan ? plan.hover : ROAD_CLASSES[cross.cls].label;
        if (key !== mapHoverKey) { app.view.setHover({ x: cross.x, y: cross.y, z: r.grade[cross.i] }, text); app.profile.setHover(cross.s, true); }
      } else if (k >= 0) {
        const on = app.roadSelected;
        cursor = on ? 'grab' : 'pointer'; key = `r${k}${on ? '' : 'u'}`;
        if (key !== mapHoverKey) { app.view.setHover({ x: r.x[k], y: r.y[k], z: r.kind[k] === KIND.tunnel ? r.ground[k] : r.grade[k] }, on ? app.bendLabel() : SELECT_TEXT.hover); app.profile.setHover(r.s[k], true); }
      } else if (app.routeAt(at.x, at.y, 10)) {
        // (the road of the project a selected crossing crosses: a drag bends it)
        const plan = app.selectedCrossing !== null ? app.crossingPlan(at.x, at.y) : null;
        cursor = plan?.ok ? 'grab' : 'pointer'; key = plan?.ok ? `other-route-g${plan.name}` : 'other-route';
        const g = key !== mapHoverKey ? app.view.pick(at.x, at.y) : null; if (g) app.view.setHover({ x: g.x, y: g.y, z: app.view.drape(g.x, g.y) }, plan?.ok ? plan.hover : SELECT_TEXT.hover);
      } else if ((works = app.crossingWorksAt(at.x, at.y))) {
        const c = works.crossing, link = works.link !== undefined && shapeable(app.lastFull, app.design, c.roadId!), on = link && app.selectedCrossing === c.roadId;
        // (the crossed road's own works, once its crossing is selected: a drag bends that road, or the hover says why not)
        const plan = !link && app.selectedCrossing === c.roadId ? app.crossingPlan(at.x, at.y) : null;
        cursor = on || plan?.ok ? 'grab' : 'pointer'; key = `x${c.roadId}${link ? 'l' : ''}${on ? 's' : ''}${plan ? (plan.ok ? 'w' : 'n') : ''}`;
        const text = plan ? plan.hover : `${ROAD_CLASSES[c.cls].label}${on ? ' · drag to reshape' : link ? ` · ${SELECT_TEXT.hover}` : ''}`;
        if (key !== mapHoverKey) { app.view.setHover({ x: works.x, y: works.y, z: works.z }, text); app.profile.setHover(c.s, true); }
      } else if (building !== null) { cursor = 'pointer'; key = `b${building}`; }
      else if (app.extras.wallAt(at.x, at.y)) { cursor = 'pointer'; key = 'w'; }
      else if (app.sourceAt(at.x, at.y)) {
        // a click selects it (its card: the stretch a drag would rebuild, or why it cannot be changed)
        cursor = 'pointer'; key = 'select-source';
        if (key !== mapHoverKey) { const g = app.view.pick(at.x, at.y); if (g) app.view.setHover({ x: g.x, y: g.y, z: app.view.drape(g.x, g.y) }, SELECT_TEXT.hover); }
      } else if (app.officialAt(at.x, at.y)) { cursor = 'pointer'; key = 'official'; } // (a click: its card)
    }
    // before the road links are loaded (fetched when idle, parsed on first need): the first hover starts
    // them, and a mapped road already shows that a click picks it
    if (at && !app.buildTool.active && !app.transportGraph && app.pack.transportMeta) {
      void app.ensureTransport();
      const g = !cursor ? app.view.pick(at.x, at.y) : null;
      if (g && app.mappedRoadNear(g.x, g.y)) cursor = 'pointer';
    }
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    if (key === mapHoverKey) return;
    if (!key.startsWith('x') && !key.startsWith('r') && !key.startsWith('c') && key !== 'mapped' && key !== 'select-source' && !key.startsWith('other-route')) { app.view.setHover(null); app.profile.setHover(null, true); }
    mapHoverKey = key;
  };
  app.view.renderer.domElement.addEventListener('pointermove', (e) => {
    app.lastClient.x = e.clientX; app.lastClient.y = e.clientY;
    mapHoverAt = e.buttons ? null : { x: e.clientX, y: e.clientY }; // not while panning / rotating
    if (!mapHoverFrame) mapHoverFrame = requestAnimationFrame(mapHoverTick);
  });
  // a click or Esc may select or deselect what is under the pointer: say what a drag there does now
  const again = () => { if (!mapHoverFrame) mapHoverFrame = requestAnimationFrame(mapHoverTick); };
  app.view.renderer.domElement.addEventListener('pointerup', (e) => { mapHoverAt = { x: e.clientX, y: e.clientY }; mapHoverKey = ''; again(); });
  window.addEventListener('keyup', (e) => { if (e.key === 'Escape') { mapHoverKey = ''; again(); } });
  app.view.renderer.domElement.addEventListener('pointerleave', () => { mapHoverAt = null; if (!mapHoverFrame) mapHoverFrame = requestAnimationFrame(mapHoverTick); });
  return { highlightBend };
}
