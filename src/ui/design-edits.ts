// The player's edits of the active road as commands: structure and wall choices over a stretch, pinned
// heights, bends, height points, crossing choices and reroute shapes, and the inspector's and the
// decision list's events that call them. Moved out of main.ts verbatim; every edit goes through the
// active-route store (one undo step each).
import { RAIL_CHOICE_REACH } from '../core/rail-over';
import { paintWallOverride, setBuildingOverride } from '../core/build-controls';
import type { LinkEnd, LinkVia } from '../core/crossings';
import { normalizeVpis, type Design, type Result } from '../core/evaluate';
import { paintOverride, type StructureChoice, type StructureKind } from '../core/overrides';
import { cellsInRange } from '../core/range';
import type { ActiveRouteStore } from './active-route-store';
import { bendStations } from './bend-stations';
import type { DecisionEvents } from './build-tools';
import type { InspectorEvents, Sel } from './inspector';
import type { ProfilePanel } from './profile';

export interface DesignEditContext {
  readonly store: ActiveRouteStore; readonly profile: ProfilePanel;
  /** the active road's shown result */
  readonly last: Result | null;
  select(next: Sel | null, fly?: boolean): void;
  /** nothing selected, the road included (a card's ✕, as Esc) */
  deselect(): void;
}

export function createDesignEdits(app: DesignEditContext) {
  const cellsRange = (s0: number, s1: number) => {
    if (!app.last) return null;
    const [i0, i1] = cellsInRange(app.last, Math.max(0, s0), Math.min(s1, app.last.length));
    return { s0: Math.max(0, (i0 - 0.5) * app.last.ds), s1: Math.min(app.last.length, (i1 + 0.5) * app.last.ds) };
  };
  const setStructure = (kind: StructureKind | null, a: number, b: number, method?: StructureChoice, auto?: boolean) => {
    const range = cellsRange(a, b);
    if (!range) return;
    const previous = app.store.design.structureOverrides ?? [];
    const next = paintOverride(previous, range.s0, range.s1, kind, method, auto);
    if (JSON.stringify(previous) !== JSON.stringify(next)) app.store.update((d) => { d.structureOverrides = next; });
  };
  const setWall = (sides: ('L' | 'R')[], height: number | null, a: number, b: number) => {
    const range = cellsRange(a, b);
    if (!range) return;
    const previous = app.store.design.wallOverrides ?? [];
    const next = sides.reduce((o, side) => paintWallOverride(o, range.s0, range.s1, side, height), previous);
    if (JSON.stringify(previous) !== JSON.stringify(next)) app.store.update((d) => { d.wallOverrides = next; });
  };
  const setPin = (s: number, z: number | null, commit = true) => app.store.update((d) => {
    d.gradePins = (d.gradePins ?? []).filter((p) => Math.abs(p.s - s) >= 0.1);
    if (z !== null) d.gradePins.push({ s, z });
    d.gradePins.sort((a, b) => a.s - b.s);
  }, commit);
  /** a field half-typed in the card applies to what it belongs to before indices shift */
  const commitFields = () => { const a = document.activeElement as HTMLElement | null; if (a && document.getElementById('inspector')?.contains(a)) a.blur(); };
  const deletePi = (i: number) => { commitFields(); app.store.update((d) => { d.pis.splice(i, 1); }); app.select(null); };
  const takeProfile = (d: Design) => {
    if (d.profileMode === 'auto' && app.last) d.vpis = app.last.vpis.map((v) => ({ ...v }));
    d.profileMode = 'manual';
    // keep the stored list identical to what the evaluator uses, so panel indices match the design
    if (app.last) d.vpis = normalizeVpis(d.vpis, app.last.length, app.last.vpis[0].z, app.last.vpis[app.last.vpis.length - 1].z);
  };
  /** Auto: pin the road's current height at station s; By hand: add a height point */
  const addHeightAt = (s: number) => {
    if (!app.last) return;
    const i = Math.max(0, Math.min(app.last.n - 2, Math.floor(s / app.last.ds))), t = (s - app.last.s[i]) / app.last.ds;
    const z = Math.round((app.last.grade[i] + t * (app.last.grade[i + 1] - app.last.grade[i])) * 10) / 10;
    if (app.store.design.profileMode === 'manual') { app.profile.ev.onVpiAdd?.(s, z); return; }
    if (!app.store.design.gradePins?.some((p) => Math.abs(p.s - s) < 0.1)) setPin(s, z);
    app.select({ kind: 'pin', s });
  };
  /** a reroute's shape (null: its automatic path again); shaping a crossing makes it a reroute */
  const setVia = (roadId: number, via: LinkVia | null, commit: boolean, to?: number) => app.store.update((d) => {
    const list = d.crossingOverrides ??= [];
    let o = list.find((x) => x.roadId === roadId);
    if (!o) { if (!via) return; list.push(o = { roadId, type: 'reconnection' }); }
    if (via) { o.type = 'reconnection'; o.via = via; if (o.to === undefined && to !== undefined) o.to = to; } else { delete o.via; delete o.to; }
  }, commit);
  /** where one side's new piece of a reroute leads (null: Auto's target again); leading it elsewhere drops that
   * side's bend points (they were laid towards the old target) and makes the crossing a reroute */
  const setEnd = (roadId: number, side: 0 | 1 | null, end: LinkEnd | null, commit = true) => app.store.update((d) => {
    const list = d.crossingOverrides ??= [];
    let o = list.find((x) => x.roadId === roadId);
    if (!o) { if (!end) return; list.push(o = { roadId, type: 'reconnection' }); }
    if (end && side !== null) {
      o.type = 'reconnection';
      const ends: [LinkEnd | null, LinkEnd | null] = o.ends ? [o.ends[0], o.ends[1]] : [null, null];
      ends[side] = { way: end.way, x: Math.round(end.x * 10) / 10, y: Math.round(end.y * 10) / 10 };
      o.ends = ends;
      if (o.via?.[side].length) {
        const via: LinkVia = [o.via[0], o.via[1]]; via[side] = [];
        if (via[0].length || via[1].length) o.via = via; else { delete o.via; delete o.to; }
      }
    } else if (side === null || !o.ends) delete o.ends;
    else {
      const ends: [LinkEnd | null, LinkEnd | null] = [o.ends[0], o.ends[1]]; ends[side] = null;
      if (ends[0] || ends[1]) o.ends = ends; else delete o.ends;
    }
  }, commit);
  const inspectorEvents: InspectorEvents = {
    close: () => app.deselect(),
    select: (t) => app.select(t, true),
    structure: setStructure,
    wall: setWall,
    pin: (s, z) => setPin(s, z),
    crossing: (roadId, type) => app.store.update((d) => {
      // a reroute keeps the player's shape while it stays a reroute
      const kept = type === 'reconnection' ? d.crossingOverrides?.find((o) => o.roadId === roadId && o.via) : undefined;
      const ended = type === 'reconnection' ? d.crossingOverrides?.find((o) => o.roadId === roadId && o.ends)?.ends : undefined;
      d.crossingOverrides = (d.crossingOverrides ?? []).filter((o) => o.roadId !== roadId);
      if (type !== null) d.crossingOverrides.push({ roadId, type, ...(kept ? { via: kept.via, ...(kept.to !== undefined ? { to: kept.to } : {}) } : {}), ...(ended ? { ends: ended } : {}) });
    }),
    // how our road crosses a mapped railway: the choice holds for the crossing nearest where it was made (rail-over.ts)
    railCrossing: (x, y, choice) => app.store.update((d) => {
      const rest = (d.railCrossings ?? []).filter((c) => Math.hypot(c.x - x, c.y - y) > RAIL_CHOICE_REACH);
      if (choice) rest.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, choice });
      if (rest.length) d.railCrossings = rest; else delete d.railCrossings;
    }),
    crossingPathAuto: (roadId) => setVia(roadId, null, true),
    crossingEndAuto: (roadId) => setEnd(roadId, null, null),
    crossingSquare: (roadId, type, square) => app.store.update((d) => {
      d.crossingOverrides = (d.crossingOverrides ?? []).filter((o) => o.roadId !== roadId);
      d.crossingOverrides.push({ roadId, type, square });
    }),
    building: (js, action) => app.store.editProject(d => { for (const j of js) d.buildingOverrides = setBuildingOverride(d.buildingOverrides, j, action); }),
    unpin: (s0, s1) => app.store.update((d) => { d.gradePins = (d.gradePins ?? []).filter((p) => p.s < s0 || p.s > s1); }),
    heightAt: (s) => addHeightAt(s),
    commit: () => app.store.commit(),
    radius: (i, r, commit = true) => app.store.update((d) => { if (d.pis[i]) { d.pis[i].r = r; delete d.pis[i].mapped; } }, commit),
    // a bend's stretch speed: the road's own is no setting of its own
    bendSpeed: (i, v) => app.store.update((d) => { const p = d.pis[i]; if (!p) return; if (v === null || v === d.speed) delete p.speed; else p.speed = v; }),
    // a hairpin takes its own radius: back to Auto either way
    // (with `speed`: its stretch's speed too, one step to undo — a problem's "Make it a hairpin")
    hairpin: (i, on, speed) => app.store.update((d) => {
      const p = d.pis[i]; if (!p) return; if (on) p.hairpin = true; else delete p.hairpin; p.r = null; delete p.mapped;
      if (on && speed !== undefined) { if (speed === d.speed) delete p.speed; else p.speed = speed; }
    }),
    deletePi,
    bendHeight: (i) => { const b = app.last && bendStations(app.last, app.store.design)[i]; if (b) addHeightAt(Math.round(b.s)); },
    vpiRadius: (i, r) => app.store.update((d) => { takeProfile(d); if (d.vpis[i]) d.vpis[i].r = r; }),
    pinAt: (at, change) => {
      commitFields();
      app.store.update((d) => {
        takeProfile(d);
        const i = d.vpis.findIndex((v, k) => k > 0 && k < d.vpis.length - 1 && Math.abs(v.s - at) < 0.01);
        if (i < 0) return;
        if (change) Object.assign(d.vpis[i], change); else d.vpis.splice(i, 1);
      });
      if (!change) app.select(null);
    },
    deleteVpi: (i) => { commitFields(); app.store.update((d) => { takeProfile(d); d.vpis.splice(i, 1); }); app.select(null); },
  };
  const decisionEvents: DecisionEvents = {
    select: (t) => app.select(t.kind === 'stretch' && app.last ? { ...t } : t, true),
    forget: (roadId) => app.store.update((d) => { d.crossingOverrides = (d.crossingOverrides ?? []).filter((o) => o.roadId !== roadId); }),
  };
  return { setStructure, setWall, setPin, commitFields, deletePi, takeProfile, addHeightAt, setVia, setEnd, inspectorEvents, decisionEvents };
}
