// Hover links between the map and the profile, and the map's cursor: a bend marker lights up its mark in
// the profile and back; the road, a crossed road, a reroute or a mapped road under the mouse says what a
// click or a drag there would do. Moved out of main.ts verbatim; it reads the app through `MapHoverContext`.
import { ROAD_CLASSES } from '../core/data/urban';
import type { Design, Result } from '../core/evaluate';
import type { SourceInterval } from '../core/project';
import type { ProjectTransportIndex } from '../core/project-network';
import type { TransportGraphData } from '../core/project-transport';
import { KIND } from '../core/structures';
import type { RouteExtras } from '../render/extras';
import type { View } from '../render/view';
import type { Pack } from '../scenario';
import type { BuildRoadTool, Placement } from './build-road';
import { shapeable } from './link-shape';
import type { MapPicks } from './map-picks';
import type { ProfilePanel } from './profile';
import { mappedLineKindFor } from './route-kinds';

export interface MapHoverContext extends Pick<MapPicks, 'routeAt' | 'roadAt' | 'crossingAt' | 'crossingWorksAt' | 'buildingAt' | 'sourceAt'> {
  readonly view: View; readonly pack: Pack; readonly profile: ProfilePanel; readonly extras: RouteExtras; readonly buildTool: BuildRoadTool;
  /** the active road's shown result (a preview while dragging) and its last full one; its design (throws when not editable) */
  readonly last: Result | null; readonly lastFull: Result | null; readonly design: Design;
  readonly transportIndex: ProjectTransportIndex | null; readonly transportGraph: TransportGraphData | null;
  /** the last pointer position over the map (client px), kept for double clicks */
  readonly lastClient: { x: number; y: number };
  ensureTransport(): Promise<void>;
  placeAt(clientX: number, clientY: number, x: number, y: number): Placement;
  mappedGrab(clientX: number, clientY: number): SourceInterval | null;
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
  const rebuildableSources = new Map<string, boolean>();
  const canRebuild = (sourceId: string) => {
    let ok = rebuildableSources.get(sourceId);
    if (ok === undefined && app.transportIndex) rebuildableSources.set(sourceId, ok = mappedLineKindFor(app.transportIndex, sourceId).verdict.ok);
    return ok ?? false;
  };
  const mapHoverTick = () => {
    mapHoverFrame = 0;
    const at = mapHoverAt, r = app.last, canvas = app.view.renderer.domElement;
    let cursor = '', key = '';
    // Build → Road: where a click would put the end, what it would join, how long the road would be
    if (app.buildTool.active) {
      const g = at && app.view.pick(at.x, at.y);
      app.buildTool.hover(at && g ? app.placeAt(at.x, at.y, g.x, g.y) : null, g ? { x: g.x, y: g.y, z: app.pack.terrain.heightAt(g.x, g.y) } : null);
      key = 'placing';
    } else if (at && app.mappedGrab(at.x, at.y) && !(r && app.roadAt(at.x, at.y, 10) >= 0)) {
      cursor = 'grab'; key = 'mapped';
      if (key !== mapHoverKey) { const g = app.view.pick(at.x, at.y); if (g) app.view.setHover({ x: g.x, y: g.y, z: app.view.drape(g.x, g.y) }, 'drag to change'); }
    } else if (at && r && !app.buildTool.active) {
      const culvert = app.extras.culvertAt(at.x, at.y), cross = culvert ? null : app.crossingAt(at.x, at.y);
      const k = cross || culvert ? -1 : app.roadAt(at.x, at.y, 10);
      const building = cross || k >= 0 ? null : app.buildingAt(at.x, at.y);
      let works: ReturnType<typeof app.crossingWorksAt> = null, src: ReturnType<typeof app.sourceAt> = null;
      if (culvert) {
        cursor = 'pointer'; key = `c${culvert.s}`;
        if (key !== mapHoverKey) { app.view.setHover(null); app.profile.setHover(culvert.s, true); }
      } else if (cross) {
        cursor = 'pointer'; key = `x${cross.roadId}`;
        if (key !== mapHoverKey) { app.view.setHover({ x: cross.x, y: cross.y, z: r.grade[cross.i] }, ROAD_CLASSES[cross.cls].label); app.profile.setHover(cross.s, true); }
      } else if (k >= 0) {
        cursor = 'grab'; key = `r${k}`;
        if (key !== mapHoverKey) { app.view.setHover({ x: r.x[k], y: r.y[k], z: r.kind[k] === KIND.tunnel ? r.ground[k] : r.grade[k] }, app.bendLabel()); app.profile.setHover(r.s[k], true); }
      } else if (app.routeAt(at.x, at.y, 10)) { cursor = 'pointer'; key = 'other-route'; }
      else if ((works = app.crossingWorksAt(at.x, at.y))) {
        const c = works.crossing, link = works.link !== undefined && shapeable(app.lastFull, app.design, c.roadId!);
        cursor = link ? 'grab' : 'pointer'; key = `x${c.roadId}${link ? 'l' : ''}`;
        if (key !== mapHoverKey) { app.view.setHover({ x: works.x, y: works.y, z: works.z }, `${ROAD_CLASSES[c.cls].label}${link ? ' · drag to reshape' : ''}`); app.profile.setHover(c.s, true); }
      } else if (building !== null) { cursor = 'pointer'; key = `b${building}`; }
      else if (app.extras.wallAt(at.x, at.y)) { cursor = 'pointer'; key = 'w'; }
      else if ((src = app.sourceAt(at.x, at.y))) {
        // a drag there rebuilds the road or railway (one that cannot be changed: a click says why)
        const grab = src.kind === 'source' && canRebuild(src.hit.sourceId);
        cursor = grab ? 'grab' : 'pointer'; key = grab ? 'grab-source' : 'source';
        if (grab && key !== mapHoverKey) { const g = app.view.pick(at.x, at.y); if (g) app.view.setHover({ x: g.x, y: g.y, z: app.view.drape(g.x, g.y) }, 'drag to change its line'); }
      }
    }
    // before the road links are loaded (fetched when idle, parsed on first need): the first hover starts
    // them, and a mapped road already shows that it can be grabbed
    if (at && !app.buildTool.active && !app.transportGraph && app.pack.transportMeta) {
      void app.ensureTransport();
      const g = !cursor ? app.view.pick(at.x, at.y) : null;
      if (g && app.mappedRoadNear(g.x, g.y)) cursor = 'grab';
    }
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    if (key === mapHoverKey) return;
    if (!key.startsWith('x') && !key.startsWith('r') && !key.startsWith('c') && key !== 'mapped' && key !== 'grab-source') { app.view.setHover(null); app.profile.setHover(null, true); }
    mapHoverKey = key;
  };
  app.view.renderer.domElement.addEventListener('pointermove', (e) => {
    app.lastClient.x = e.clientX; app.lastClient.y = e.clientY;
    mapHoverAt = e.buttons ? null : { x: e.clientX, y: e.clientY }; // not while panning / rotating
    if (!mapHoverFrame) mapHoverFrame = requestAnimationFrame(mapHoverTick);
  });
  app.view.renderer.domElement.addEventListener('pointerleave', () => { mapHoverAt = null; if (!mapHoverFrame) mapHoverFrame = requestAnimationFrame(mapHoverTick); });
  return { highlightBend };
}
