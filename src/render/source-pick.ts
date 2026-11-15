import type { TransportGraphData, TransportRenderInterval } from '../core/project-transport';
import type { VectorPack } from './vectorPack';
import { sourceReplacementCuts, type LineCuts } from './source-intervals';
import { perspectiveFraction } from './route-pick';

type Projection = (x: number, y: number) => { sx: number; sy: number; vis: boolean; depth?: number };
export interface SourceHit { sourceId: string; s: number; x: number; y: number; distance: number }
type Segment = { ax: number; ay: number; bx: number; by: number; d: number; length: number; feature: Feature };
type Feature = { id: string; layer: string; index: number; owners: TransportRenderInterval[] };

function sourceStation(interval: TransportRenderInterval, renderS: number): number | null {
  const knots = interval.correspondence;
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1], b = knots[i];
    if (renderS < Math.min(a.renderS, b.renderS) - 1e-6 || renderS > Math.max(a.renderS, b.renderS) + 1e-6) continue;
    const t = (renderS - a.renderS) / (b.renderS - a.renderS);
    return a.sourceS + Math.max(0, Math.min(1, t)) * (b.sourceS - a.sourceS);
  }
  return null;
}

/** Picks the mapped render polylines, then maps back to canonical source chainage. No rounded-XY
 * topology, nearest OSM way guess or hidden PI fitting. Long diagonal segments are indexed in small
 * boxes along their length, not a potentially enormous Cartesian bounding rectangle. */
export class SourcePicker {
  private grid = new Map<string, number[]>();
  private segments: Segment[] = [];
  private cuts = new Map<string, LineCuts>();
  private cell = 100;
  constructor(private graph: TransportGraphData, vectors: VectorPack) {
    const owners = new Map<string, TransportRenderInterval[]>();
    for (const source of graph.sources) for (const mapping of source.render) {
      const list = owners.get(mapping.featureId); if (list) list.push(mapping); else owners.set(mapping.featureId, [mapping]);
    }
    const layers = new Map(vectors.lines.map(l => [l.name, l]));
    for (const ref of graph.renderFeatures) {
      const mappings = owners.get(ref.id), layer = layers.get(ref.layer);
      if (!mappings?.length || !layer || ref.polylineIndex + 1 >= layer.starts.length) continue;
      const feature: Feature = { id: ref.id, layer: ref.layer, index: ref.polylineIndex, owners: mappings };
      let d = 0;
      for (let i = layer.starts[ref.polylineIndex]; i + 1 < layer.starts[ref.polylineIndex + 1]; i++) {
        const ax = layer.verts[2 * i], ay = layer.verts[2 * i + 1], bx = layer.verts[2 * i + 2], by = layer.verts[2 * i + 3];
        const length = Math.hypot(bx - ax, by - ay); if (!length) continue;
        const index = this.segments.length; this.segments.push({ ax, ay, bx, by, d, length, feature }); d += length;
        const cells = new Set<string>(), steps = Math.max(1, Math.ceil(length / this.cell));
        for (let k = 0; k < steps; k++) {
          const x0 = ax + (bx - ax) * k / steps, y0 = ay + (by - ay) * k / steps;
          const x1 = ax + (bx - ax) * (k + 1) / steps, y1 = ay + (by - ay) * (k + 1) / steps;
          for (let x = Math.floor(Math.min(x0, x1) / this.cell); x <= Math.floor(Math.max(x0, x1) / this.cell); x++)
            for (let y = Math.floor(Math.min(y0, y1) / this.cell); y <= Math.floor(Math.max(y0, y1) / this.cell); y++) cells.add(`${x}:${y}`);
        }
        for (const cell of cells) { const list = this.grid.get(cell); if (list) list.push(index); else this.grid.set(cell, [index]); }
      }
    }
  }
  setAccepted(intervals: readonly TransportRenderInterval[]) { this.cuts = sourceReplacementCuts(this.graph, intervals); }
  at(screenX: number, screenY: number, worldX: number, worldY: number, metres: number, pixels: number, project: Projection,
    onlySource?: string): SourceHit | null {
    const candidates = new Set<number>();
    for (let x = Math.floor((worldX - metres) / this.cell); x <= Math.floor((worldX + metres) / this.cell); x++)
      for (let y = Math.floor((worldY - metres) / this.cell); y <= Math.floor((worldY + metres) / this.cell); y++)
        for (const i of this.grid.get(`${x}:${y}`) ?? []) candidates.add(i);
    let hit: SourceHit | null = null, best = pixels * pixels;
    for (const i of candidates) {
      const seg = this.segments[i], a = project(seg.ax, seg.ay), b = project(seg.bx, seg.by);
      if (!a.vis || !b.vis) continue;
      const dx = b.sx - a.sx, dy = b.sy - a.sy, length2 = dx * dx + dy * dy;
      const t = length2 ? Math.max(0, Math.min(1, ((screenX - a.sx) * dx + (screenY - a.sy) * dy) / length2)) : 0;
      const distance2 = (screenX - a.sx - t * dx) ** 2 + (screenY - a.sy - t * dy) ** 2;
      if (distance2 >= best) continue;
      const along = perspectiveFraction(t, a.depth, b.depth), renderS = seg.d + along * seg.length;
      if (this.cuts.get(seg.feature.layer)?.get(seg.feature.index)?.some(([a, b]) => renderS > a && renderS < b)) continue;
      for (const owner of seg.feature.owners) {
        if (onlySource && owner.sourceId !== onlySource) continue;
        const s = sourceStation(owner, renderS); if (s === null) continue;
        best = distance2; hit = { sourceId: owner.sourceId, s, x: seg.ax + along * (seg.bx - seg.ax), y: seg.ay + along * (seg.by - seg.ay), distance: Math.sqrt(distance2) };
        break;
      }
    }
    return hit;
  }
}
