import type { Result } from '../core/evaluate';
import { CrossingRenderer } from './crossings';
import type { CrossingSurface } from './crossing-surface';
import { buildRouteSurfaces, routeSurfaceContext } from './route-surfaces';
import type { Staged } from './slices';
import type { View } from './view';

/** Ephemeral renderer adapter, not a saved project/schema. Results are authoritative engine outputs. */
export interface RenderRoute { id: string; result: Result; crownWidth: number }
type Box = { x0: number; y0: number; x1: number; y1: number };
type Entry = { input: RenderRoute; surfaces: CrossingSurface[]; box: Box; crossings: CrossingRenderer; dependencies: CrossingSurface[][] };
const overlap = (a: Box, b: Box) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
function bounds(r: Result, surfaces: readonly CrossingSurface[]): Box {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (x: number, y: number, width: number) => {
    b.x0 = Math.min(b.x0, x - width); b.x1 = Math.max(b.x1, x + width);
    b.y0 = Math.min(b.y0, y - width); b.y1 = Math.max(b.y1, y + width);
  };
  // Includes the display collars and the blend reach. This is visual invalidation, not an
  // engineering independence test: project-core decides which Result objects may be reused.
  for (let i = 0; i < r.n; i++) add(r.x[i], r.y[i], Math.max(r.dayL[i], r.dayR[i]) + 40);
  for (const surface of surfaces) for (const q of surface.sections) for (const p of [q.p, ...q.outer]) add(p.x, p.y, 40);
  return b;
}

/** Owns every constructed road body and crossing group, with one coherent shared-mask swap. */
export class RouteScene {
  private entries = new Map<string, Entry>();
  private generation = 0;
  private previews = new Set<string>();
  constructor(private view: View) {}

  *build(inputs: readonly RenderRoute[]): Generator<void, Staged> {
    if (new Set(inputs.map(i => i.id)).size !== inputs.length) throw new Error('Duplicate render route');
    const generation = ++this.generation, next = new Map<string, Entry>(), stages: Staged[] = [], fresh: CrossingRenderer[] = [];
    let handedOver = false, settled = false;
    const dispose = () => {
      if (settled) return;
      settled = true;
      for (const stage of stages) stage.dispose();
      for (const renderer of fresh) renderer.dispose();
    };
    try {
      for (const input of inputs) {
        const old = this.entries.get(input.id);
        const same = old?.input.result === input.result && old.input.crownWidth === input.crownWidth;
        const surfaces = same ? old.surfaces : yield* buildRouteSurfaces(input.result, input.crownWidth, (x, y) => this.view.groundHeight(x, y));
        const crossings = old?.crossings ?? new CrossingRenderer(this.view);
        if (!old) fresh.push(crossings);
        next.set(input.id, { input, surfaces, box: same ? old.box : bounds(input.result, surfaces), crossings, dependencies: [] });
      }
      const all = [...next.values()];
      for (const entry of all) {
        const neighbours = all.filter(other => overlap(entry.box, other.box));
        // Compare both old and new dependency sets: moving a neighbour away must restore the collar.
        entry.dependencies = neighbours.map(other => other.surfaces);
        const old = this.entries.get(entry.input.id);
        if (old?.input.result === entry.input.result && old.input.crownWidth === entry.input.crownWidth &&
          old.dependencies.length === entry.dependencies.length && old.dependencies.every((r, i) => r === entry.dependencies[i])) continue;
        const surfaces = neighbours.flatMap(other => other.surfaces);
        const context = routeSurfaceContext(entry.surfaces, surfaces,
          (x, y) => this.view.groundHeight(x, y), (x, y) => this.view.drape(x, y),
          neighbours.map(other => other.input.result));
        stages.push(yield* this.view.buildResult(entry.input.result, entry.input.crownWidth, entry.input.id, context, true));
        stages.push(yield* entry.crossings.build(entry.input.result, context));
      }
      handedOver = true;
      return {
        commit: () => {
          if (settled) return;
          if (generation !== this.generation) { dispose(); return; }
          // Synchronous: no animation frame can observe mixed road generations or half a mask.
          for (const stage of stages) stage.commit();
          for (const [id, old] of this.entries) if (!next.has(id)) old.crossings.dispose();
          this.entries = next;
          // Even a cache hit must restore the settled indication after a cancelled/reverted drag.
          for (const id of this.previews) {
            const entry = next.get(id); if (entry) this.view.setPreview(entry.input.result, id);
          }
          this.previews.clear();
          this.view.commitRouteScene(new Set(next.keys()));
          settled = true;
        },
        dispose,
      };
    } finally { if (!handedOver) dispose(); }
  }

  preview(id: string, result: Result) {
    if (!this.entries.has(id)) return;
    ++this.generation; this.previews.add(id); this.view.setPreview(result, id);
  }
  dispose() {
    ++this.generation;
    for (const entry of this.entries.values()) entry.crossings.dispose();
    this.entries.clear(); this.previews.clear(); this.view.commitRouteScene(new Set());
  }
}
