// What one undo / redo step changes, in a few plain words for the Undo / Redo buttons ("Undo: moving bend 3").
// Worked out from the two designs either side of the step, so every edit is named the same way wherever it
// was made (map, profile, cards, build tools).
import type { ProjectDesign, RouteDesign } from './project';

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const lineWord = (r: RouteDesign) => r.kind === 'railway' ? 'railway' : r.kind === 'motorway' ? 'motorway' : 'road';
const nameOf = (r: RouteDesign) => r.role === 'mission' ? `our ${lineWord(r)}` : r.name;

/** One route's change, or null when nothing of it changed. */
function routeChange(a: RouteDesign, b: RouteDesign): string | null {
  // (a route's revision counts edits and undos alike: not a change of its own)
  if (same({ ...a, revision: 0 }, { ...b, revision: 0 })) return null;
  const pa = a.alignment.kind === 'pi' ? a.alignment : null, pb = b.alignment.kind === 'pi' ? b.alignment : null;
  if (pa && pb) {
    const x = pa.pis, y = pb.pis;
    if (y.length === x.length + 1) return 'adding a bend';
    if (y.length === x.length - 1) return 'deleting a bend';
    if (y.length === x.length) {
      const moved = y.flatMap((p, k) => p.x !== x[k].x || p.y !== x[k].y ? [k] : []);
      if (moved.length === 1) return `moving bend ${moved[0] + 1}`;
      if (moved.length > 1) return 'moving the bends';
      const k = y.findIndex((p, i) => !same(p, x[i]));
      if (k >= 0) {
        const p = y[k], q = x[k];
        if (!!p.hairpin !== !!q.hairpin) return `bend ${k + 1}'s hairpin`;
        if (p.speed !== q.speed) return `bend ${k + 1}'s design speed`;
        return `bend ${k + 1}'s radius`;
      }
    } else return 'the bends';
    if (!same(pa.vertical, pb.vertical)) return 'the height';
    const ca = pa.controls, cb = pb.controls;
    if (!same(ca.structureOverrides, cb.structureOverrides)) return 'a bridge or tunnel';
    if (!same(ca.crossings, cb.crossings)) return 'a crossing';
    if (!same(ca.wallOverrides, cb.wallOverrides)) return 'noise walls';
    if (!same(ca.junctionForms, cb.junctionForms)) return 'a junction';
  }
  if (!same(a.endpoints, b.endpoints)) return 'moving an end';
  if (!same(a.source, b.source)) return 'the stretch rebuilt';
  if (!same(a.specification, b.specification)) {
    const sa = a.specification as unknown as Record<string, unknown>, sb = b.specification as unknown as Record<string, unknown>;
    if (!same(sa.operations, sb.operations)) return 'traffic';
    if (sa.designSpeed !== sb.designSpeed) return 'the design speed';
    return 'the road type';
  }
  if (a.name !== b.name) return 'the name';
  return 'an edit';
}

/** The step from `before` to `after`, e.g. "moving bend 3", "a new road", "removing Road III/3012". */
export function historyLabel(before: ProjectDesign, after: ProjectDesign): string {
  const added = after.routes.filter(r => !before.routes.some(q => q.id === r.id));
  const removed = before.routes.filter(r => !after.routes.some(q => q.id === r.id));
  // (a motorway's two directions come and go together)
  if (added.length && !removed.length) {
    const r = added[0];
    return r.source ? `changing ${r.name}` : `a new ${lineWord(r)}`;
  }
  if (removed.length && !added.length) return `removing ${nameOf(removed[0])}`;
  if (added.length || removed.length) return 'the roads';
  if (!same(before.buildingOverrides, after.buildingOverrides)) return 'a building';
  const changed = after.routes.flatMap(r => { const q = before.routes.find(p => p.id === r.id)!; const c = routeChange(q, r); return c ? [{ r, c }] : []; });
  const corridors = (d: ProjectDesign) => d.corridors.map(c => ({ ...c, revision: 0 }));
  if (!same(corridors(before), corridors(after)) && changed.length !== 1) return 'the motorway';
  if (!changed.length) return same(before.connections, after.connections) ? 'an edit' : 'a connection';
  // a paired motorway's two directions change together: one change
  const kinds = new Set(changed.map(x => x.c));
  if (changed.length > 1 && !(kinds.size === 1 && changed.every(x => x.r.kind === 'motorway'))) return 'several roads';
  const { r, c } = changed[0];
  return r.role === 'mission' ? c : `${c} (${r.name})`;
}
