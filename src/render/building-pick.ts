// All buildings, not only exposed noise receivers, can be selected for a voluntary buyout.
import { buildingLevels } from '../core/buildings';
import type { Pack } from '../scenario';
import type { View } from './view';

export class BuildingPicker {
  // Fixed nine numbers per building; no ray × building matrix or render-mesh triangle queries.
  private boxes: Float64Array;
  constructor(private view: View, pack: Pack) {
    const buildings = pack.overlays.buildings;
    this.boxes = new Float64Array(buildings.length * 9);
    buildings.forEach((b, j) => {
      const f = pack.overlays.binfo?.[j], a = (f?.[7] ?? 0) * Math.PI / 180;
      const x = f?.[3] ?? b[0], y = f?.[4] ?? b[1], ground = pack.terrain.heightAt(x, y);
      this.boxes.set([x, y, Math.cos(a), Math.sin(a), f?.[5] ?? b[2] / Math.SQRT2,
        f?.[6] ?? b[2] / Math.SQRT2, ground, ground + 3 * buildingLevels(f?.[1] ?? 0, f?.[2] ?? 0) + 1, j], 9 * j);
    });
  }
  at(clientX: number, clientY: number, ground: { x: number; y: number; z: number }): number | null {
    const { o, d } = this.view.rayAt(clientX, clientY);
    // The first terrain hit occludes boxes behind hills; allow only a small ground-pick tolerance.
    let best = ((ground.x - o.x) * d.x + (ground.y - o.y) * d.y + (ground.z - o.z) * d.z) / (d.x * d.x + d.y * d.y + d.z * d.z) + 2;
    let hit: number | null = null;
    const b = this.boxes;
    for (let k = 0; k < b.length; k += 9) {
      const ox = o.x - b[k], oy = o.y - b[k + 1], ux = b[k + 2], uy = b[k + 3];
      const origin = [ox * ux + oy * uy, -ox * uy + oy * ux, o.z];
      const dir = [d.x * ux + d.y * uy, -d.x * uy + d.y * ux, d.z];
      const lo = [-b[k + 4], -b[k + 5], b[k + 6]], hi = [b[k + 4], b[k + 5], b[k + 7]];
      let t0 = 0, t1 = best;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(dir[a]) < 1e-12) { if (origin[a] < lo[a] || origin[a] > hi[a]) { t1 = -1; break; } continue; }
        let p = (lo[a] - origin[a]) / dir[a], q = (hi[a] - origin[a]) / dir[a];
        if (p > q) [p, q] = [q, p];
        t0 = Math.max(t0, p); t1 = Math.min(t1, q);
        if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < best) { best = t0; hit = b[k + 8]; }
    }
    return hit;
  }
}
