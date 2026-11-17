// What the profile panel's gestures do (the same verbs as the map: click selects, drag pins or moves a
// height). Moved out of main.ts verbatim.
import { MIN_VPI_GAP, type Design, type Result } from '../core/evaluate';
import type { View } from '../render/view';
import type { ActiveRouteStore } from './active-route-store';
import type { Sel } from './inspector';
import type { ProfileEvents } from './profile';
import { stationIndex } from '../core/range';

export interface ProfileEventContext {
  readonly store: ActiveRouteStore; readonly view: View;
  /** the active road's shown result; the selection */
  readonly last: Result | null; readonly sel: Sel | null;
  select(next: Sel | null, fly?: boolean): void;
  selectPiece(s: number, fly?: boolean): void;
  /** the active road itself selected (ui/selection.ts) */
  selectRoad(): void;
  /** By hand from here on: the design takes over Auto's height points */
  takeProfile(d: Design): void;
  commitFields(): void;
  addHeightAt(s: number): void;
  setPin(s: number, z: number | null, commit?: boolean): void;
  updateZoomButtons(): void;
  highlightBend(i: number | null): void;
}

export function profileEvents(app: ProfileEventContext): ProfileEvents {
  /** the height points as they were when a By hand drag began */
  let vpiDragBase: Design['vpis'] | null = null;

  const events: ProfileEvents = {
    onStationSelect: (s) => app.select({ kind: 'pin', s }, true),
    onCrossingSelect: (roadId) => app.select({ kind: 'crossing', roadId }, true),
    onCulvertSelect: (id, s) => app.select({ kind: 'culvert', id, s }, true),
    onPick: (s) => app.selectPiece(s, true),
    onPress: () => app.selectRoad(),
    onVpiDrag: (i, s, z, a, b) => app.store.update((d) => {
      app.takeProfile(d);
      const base = vpiDragBase ??= d.vpis.map((v) => ({ ...v }));
      if (!d.vpis[i] || !base[a] || !base[b]) return;
      d.vpis[i].s = s; d.vpis[i].z = z;
      // the height points hidden between it and its shown neighbours keep their shape and follow
      // in proportion, so the line bends only at the points the player sees
      const dz = z - base[i].z;
      for (let j = a + 1; j < b; j++) if (j !== i) {
        const t = j < i ? (base[j].s - base[a].s) / Math.max(1e-6, s - base[a].s) : (base[b].s - base[j].s) / Math.max(1e-6, base[b].s - s);
        d.vpis[j].z = Math.round((base[j].z + dz * Math.max(0, Math.min(1, t))) * 100) / 100;
      }
    }, false),
    onVpiDragEnd: () => { vpiDragBase = null; app.store.commit(); },
    onVpiAdd: (s, z) => {
      const vp = app.store.design.profileMode === 'auto' && app.last ? app.last.vpis : app.store.design.vpis;
      if (vp.some((v) => Math.abs(v.s - s) < MIN_VPI_GAP)) return;
      app.store.update((d) => {
        app.takeProfile(d);
        const k = d.vpis.findIndex((v) => v.s > s);
        d.vpis.splice(k < 0 ? d.vpis.length - 1 : k, 0, { s, z, r: null });
      });
    },
    onVpiDelete: (i) => { app.commitFields(); app.store.update((d) => { app.takeProfile(d); d.vpis.splice(i, 1); }); app.select(null); },
    onVpiSelect: (i) => { if (i !== null) app.select({ kind: 'vpi', i }); else if (app.sel?.kind === 'vpi') app.select(null); },
    onSelect: (range) => app.select(range ? { kind: 'stretch', s0: range.s0, s1: range.s1 } : null),
    onHover: (s, label) => {
      if (s === null || !app.last) { app.view.setHover(null); return; }
      const i = stationIndex(app.last, s);
      app.view.setHover({ x: app.last.x[i], y: app.last.y[i], z: app.last.grade[i] }, label);
    },
    onView: () => app.updateZoomButtons(),
    onBendHover: (i) => app.highlightBend(i),
    onBendSelect: (i) => app.select({ kind: 'bend', i }, true),
    onPinAdd: (s) => app.addHeightAt(s),
    onLineDrag: (s, z) => app.setPin(s, z, false),
    onPinDrag: (s, z) => app.store.update((d) => { const p = d.gradePins?.find((p) => Math.abs(p.s - s) < 0.1); if (p) p.z = z; }, false),
    onPinDragEnd: () => app.store.commit(),
  };
  return events;
}
