// Road links: the pack's transport graph, which lets the game change mapped roads and railways. It is not
// part of start-up: its bytes are fetched when idle after the first frame and parsed on first need (a click
// on a mapped road, the photo overlay, a project that already rebuilds roads). Once parsed: the index, the
// picker of mapped roads, the mapped-road card and the drag handles of a rebuilt stretch's ends; the
// workers learn which legacy way each mapped road is. Moved out of main.ts verbatim.
import { ProjectTransportIndex } from '../core/project-network';
import type { TransportGraphData } from '../core/project-transport';
import { RoadNet } from '../core/roadnet';
import type { ProjectStore } from '../project-store';
import { lineHalfWidth } from '../render/landcover';
import { SourcePicker } from '../render/source-pick';
import type { View } from '../render/view';
import type { Pack } from '../scenario';
import type { Session } from '../session';
import type { WorkerIn } from '../worker-protocol';
import type { ActiveRouteStore } from './active-route-store';
import type { Sel } from './inspector';
import { MappedRoadCard } from './mapped-road';
import { DeadEndHandles } from './dead-end';
import { mappedRoadName } from '../core/terms';
import { coveredStretches } from './road-edit';
import { mappedLineKindOf } from './route-kinds';
import { StretchEnds } from './stretch-ends';
import { toast } from './toast';

export interface RoadLinksContext {
  readonly session: Session;
  readonly store: ActiveRouteStore; readonly projectStore: ProjectStore; readonly pack: Pack; readonly view: View;
  /** the pack's road-link fingerprint; null: a pack without road links */
  readonly transportData: string | null;
  readonly worker: Worker; readonly previewWorker: Worker;
  select(next: Sel | null): void;
}
export type RoadLinks = ReturnType<typeof createRoadLinks>;

export function createRoadLinks(app: RoadLinksContext) {
  // ---- base roads: any mapped road can be inspected and offered for change (one inspector card) ----
  // The transport graph is not part of startup: its bytes are fetched when idle after the first frame
  // and parsed on first need (base-road click, photo overlay, a project that already rebuilds roads).
  let transportIndex: ProjectTransportIndex | null = null, sourcePicker: SourcePicker | null = null;
  let transportGraph: TransportGraphData | null = null, sourceEditor: MappedRoadCard | null = null, stretchEnds: StretchEnds | null = null;
  const syncEnds = () => (stretchEnds as StretchEnds | null)?.sync(app.store.route);
  const inspectorEl = document.getElementById('inspector')!;
  // (a dead end taken up is gone too: nothing rebuilds it)
  const claimedSources = () => [...app.projectStore.snapshot.design.routes.flatMap(r => r.source?.intervals ?? []),
    ...(app.projectStore.snapshot.design.takenUp ?? []).map(t => t.interval)];
  let transportReady: Promise<void> | null = null;
  const ensureTransport = () => transportReady ??= (async () => {
    let graph: TransportGraphData | null;
    try { graph = await app.pack.loadTransport(); } catch (error) {
      // Visible, and retried on the next need (a click on a road, the photo, a reload of a project).
      console.warn('Road map links are unavailable', error); transportReady = null;
      toast(error instanceof Error && /Reload|Rebuild/.test(error.message) ? error.message : 'Mapped roads could not be loaded. Click a road to try again.');
      return;
    }
    if (!graph || !app.pack.vectors || !app.transportData) return;
    // what the mapped roads carry today (the pack's traffic census; without it: class averages)
    const census = await app.pack.loadTraffic();
    try {
      transportIndex = new ProjectTransportIndex(graph, app.transportData, graph.vectorData, app.pack.terrain, census);
      // only the drawn road is clickable: its drawn width at the local scale (map or photo overlay), plus slack
      sourcePicker = new SourcePicker(graph, app.pack.vectors, (layer, res) => lineHalfWidth(layer, res, app.view.photoWithNetwork));
    } catch (error) { console.warn('Road map links are unavailable', error); transportIndex = null; sourcePicker = null; return; }
    transportGraph = graph;
    // where other roads' earthworks cover a mapped road it is gone: a rebuilt stretch stops short of them
    const covered = (sourceId: string) => coveredStretches(transportIndex!, sourceId, app.projectStore.snapshot.design.routes.flatMap(r => {
      const built = app.session.projectFull?.routes[r.id]?.legacy;
      return built && !r.source?.intervals.some(i => i.sourceId === sourceId) ? [{ ...built, name: r.role === 'mission' ? 'our road' : r.name }] : [];
    }));
    // a selected road's dead end cut back (ui/dead-end.ts): one undo step, the card shown again as it is now
    const deadEndHandles = new DeadEndHandles(document.getElementById('overlay')!, app.view, transportIndex, {
      shorten: (sourceId, end, piece, label) => {
        const store = app.projectStore;
        if (store.inTransaction) store.commit();
        store.begin();
        try {
          store.update(d => {
            const rest = (d.takenUp ?? []).filter(t => !(t.interval.sourceId === sourceId && t.end === end));
            if (piece) rest.push(piece);
            if (rest.length) d.takenUp = rest; else delete d.takenUp;
          });
          store.commit(label);
        } catch (error) { store.cancel(); console.warn('Not shortened', error); toast('This road cannot be shortened here.'); }
      },
    });
    const editor = sourceEditor = new MappedRoadCard(() => inspectorEl, app.view, transportIndex, claimedSources, covered,
      () => app.projectStore.snapshot.design.takenUp ?? [], deadEndHandles,
      () => app.projectStore.snapshot.design.routes.flatMap(r => [r.endpoints.a.anchor, r.endpoints.b.anchor]).flatMap(a => a.kind === 'source' ? [{ sourceId: a.location.sourceId, s: a.location.s }] : []));
    editor.onClose = () => app.select(null);
    // (a step, an undo or a redo: the selected road's card as it is now, its station kept on what is left of it)
    app.projectStore.subscribe((_snapshot, committed) => {
      const hit = editor.selected;
      if (!committed || !hit || deadEndHandles.dragging) return;
      const piece = (app.projectStore.snapshot.design.takenUp ?? []).find(t => t.interval.sourceId === hit.sourceId && hit.s >= t.interval.s0 && hit.s <= t.interval.s1);
      editor.show(piece ? { ...hit, s: piece.end === 'a' ? piece.interval.s1 + 1 : piece.interval.s0 - 1 } : hit);
    });
    const ends = stretchEnds = new StretchEnds(document.getElementById('overlay')!, app.view, transportIndex,
      () => [...app.projectStore.snapshot.design.routes.flatMap(r => (r.source?.intervals ?? []).map(interval => ({ routeId: r.id, interval }))),
        ...(app.projectStore.snapshot.design.takenUp ?? []).map(t => ({ routeId: '', interval: t.interval }))]);
    ends.onMove = (id, s0, s1) => {
      const kind = mappedLineKindOf(app.store.route!);
      try { if (!kind) throw new Error('No kind moves these ends'); app.store.editProject(d => { const next = kind.moveEnds(transportIndex!, d, id, s0, s1); Object.assign(d, next); }); }
      catch (error) { console.warn('Stretch ends not moved', error); toast('The rebuilt stretch cannot end there.'); ends.sync(app.store.route); }
    };
    ends.sync(app.store.route);
    // Road links let the game change mapped roads: the worker learns which legacy way each mapped road is.
    // ... and where each mapped railway runs (what a rebuilt railway stretch takes up).
    const sourceWays = { type: 'source-ways', ways: graph.sources.flatMap(s => s.legacyNetIndex === undefined ? [] : [[s.id, s.legacyNetIndex]]),
      rails: graph.sources.flatMap(s => s.kind === 'railway' ? [[s.id, s.xy, s.stations]] : []) } satisfies WorkerIn;
    app.worker.postMessage(sourceWays); app.previewWorker.postMessage(sourceWays);
    app.view.setTransport(graph);
  })();
  /** Without road links (an older map pack) mapped roads are still recognised, to say why they cannot change. */
  let legacyNet: RoadNet | null = null;
  /** a drawn mapped road near this ground point (the pack's road overlay; no road links needed) */
  const mappedRoadNear = (x: number, y: number, px = 8, min = 6) => {
    if (!app.pack.roadNet) return false;
    legacyNet ??= new RoadNet(app.pack.roadNet);
    return legacyNet.nearestWay(x, y, Math.max(min, px * app.view.metresPerPixel)) !== undefined;
  };
  /** a mapped road's own name or number by its index in the pack's network ("road II/325", a street's name), once the
   * road links are parsed (undefined: none, or not loaded yet) */
  let names: Map<number, string> | null = null;
  const wayName = (way: number) => {
    if (!names && transportGraph) {
      names = new Map();
      for (const s of transportGraph.sources) if (s.legacyNetIndex !== undefined && (s.tags.name || s.tags.ref)) names.set(s.legacyNetIndex, mappedRoadName(s.tags));
    }
    return names?.get(way);
  };
  /** a mapped road in a pack without road links (its card says it cannot be changed here) */
  const legacyRoadAt = (x: number, y: number) => !app.transportData && mappedRoadNear(x, y, 4, 4);
  return {
    /** null until the road links are parsed (or in a pack without them) */
    get index() { return transportIndex; }, get picker() { return sourcePicker; }, get graph() { return transportGraph; },
    get editor() { return sourceEditor; },
    ensure: ensureTransport, syncEnds, claimedSources, mappedRoadNear, legacyRoadAt, wayName,
  };
}
