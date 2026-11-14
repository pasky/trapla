import { describe, expect, it } from 'vitest';
import { buildCrossingGeometry, type CrossingResult } from '../src/core/crossings';
import { RoadNet } from '../src/core/roadnet';
import { crossingSurfaces, endCollars, groundSegment } from '../src/render/crossing-surface';

describe('physical crossing surfaces', () => {
  const route = { s: [0, 100, 200], x: [0, 100, 200], y: [0, 0, 0], tx: [1, 1, 1], ty: [0, 0, 0], grade: [100, 100, 100], width: [30, 30, 30] };
  const road = new RoadNet({ cls: ['tertiary'], ways: [[0, 100, -500, 100, 500]] });
  const crossing = (type: CrossingResult['type']): CrossingResult => ({ s: 100, i: 1, x: 100, y: 0, roadId: 0, cls: 'tertiary', h: 0, cost: 0, type });
  it('keeps both edges of the ground road on terrain, including transverse slope', () => {
    const height = (x: number, y: number) => 100 + .18 * (x - 100) + .02 * y;
    const c = crossing('bridge'); buildCrossingGeometry([c], route, height, road);
    const [surface] = crossingSurfaces([c], height);
    for (const section of surface.sections) for (const edge of section.edge) expect(edge.z).toBeCloseTo(height(edge.x, edge.y), 8);
    const collars = endCollars(surface, height);
    expect(collars).toHaveLength(2);
    expect(Math.hypot(collars[0][0].x-collars[0][2].x, collars[0][0].y-collars[0][2].y)).toBeCloseTo(18);
  });
  it('supports raised approaches with daylighting side slopes but leaves the deck gap clear', () => {
    const height = (x: number) => 100 + .03 * (x - 100);
    const c = crossing('overbridge'); buildCrossingGeometry([c], route, height, road);
    const [surface] = crossingSurfaces([c], height);
    let ramps = 0, gap = 0;
    for (let i = 0; i + 1 < surface.sections.length; i++) {
      const a = surface.sections[i];
      if (!groundSegment(surface, i)) { gap++; continue; }
      if (a.p.z <= a.p.ground + .5) continue;
      ramps++;
      for (let k = 0; k < 2; k++) {
        const e = a.edge[k], toe = a.toe[k];
        expect(toe.z).toBeCloseTo(height(toe.x), 8);
        expect(Math.hypot(e.x-toe.x, e.y-toe.y)).toBeGreaterThan(0);
        expect(Math.abs(e.z-toe.z) / Math.hypot(e.x-toe.x, e.y-toe.y)).toBeLessThanOrEqual(1/1.5 + .01);
      }
    }
    expect(ramps).toBeGreaterThan(0); expect(gap).toBeGreaterThan(0);
  });
});
