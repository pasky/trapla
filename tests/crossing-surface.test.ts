import { describe, expect, it } from 'vitest';
import { buildCrossingGeometry, type CrossingResult } from '../src/core/crossings';
import { RoadNet } from '../src/core/roadnet';
import { crossingWallGaps } from '../src/core/crossing-walls';
import { crossingBaseHeight, crossingSurfaces, groundSegment } from '../src/render/crossing-surface';

describe('physical crossing surfaces', () => {
  const route = { s: [0, 100, 200], x: [0, 100, 200], y: [0, 0, 0], tx: [1, 1, 1], ty: [0, 0, 0], grade: [100, 100, 100], width: [30, 30, 30] };
  const road = new RoadNet({ cls: ['tertiary'], ways: [[0, 100, -500, 100, 500]] });
  const crossing = (type: CrossingResult['type']): CrossingResult => ({ s: 100, i: 1, x: 100, y: 0, roadId: 0, cls: 'tertiary', h: 0, cost: 0, type });
  it('keeps both edges of the ground road on terrain, including transverse slope', () => {
    const height = (x: number, y: number) => 100 + .18 * (x - 100) + .02 * y;
    const c = crossing('bridge'); buildCrossingGeometry([c], route, height, road);
    const [surface] = crossingSurfaces([c], height);
    for (const section of surface.sections) for (const edge of section.edge) expect(edge.z).toBeCloseTo(height(edge.x, edge.y), 8);
  });
  it('opens both noise-wall sides at an X junction but only the actual connected side at a T', () => {
    const c = crossing('junction');
    const path = (ys: number[]) => ys.map(y => ({ x: 100, y, z: 100, ground: 100, surface: 'terrain' as const }));
    c.geometry = { width: 6, schematic: false, road: path([-100,0]) };
    const t = crossingWallGaps(route,[c],10);
    expect(t.L[1]).toBe(0); expect(t.R[1]).toBe(1);
    c.geometry.road = path([-100,0,100]);
    const x = crossingWallGaps(route,[c],10);
    expect(x.L[1]).toBe(1); expect(x.R[1]).toBe(1);
    expect(x.L[0]).toBe(0); expect(x.R[2]).toBe(0);
  });
  it('joins a junction onto our engineered formation without digging side slopes through our crown', () => {
    const r = { n: 3, x: Float64Array.from(route.x), y: Float64Array.from(route.y), grade: new Float64Array(3).fill(110),
      kind: new Uint8Array(3), dayL: new Float64Array(3).fill(20), dayR: new Float64Array(3).fill(20),
      zDayL: new Float64Array(3).fill(100), zDayR: new Float64Array(3).fill(100) };
    const c = crossing('junction'), ground = () => 100;
    buildCrossingGeometry([c], { ...route, grade: r.grade, width: [40,40,40] }, ground, road);
    const formation = crossingBaseHeight(r, 10, ground);
    const [surface] = crossingSurfaces([c], ground, formation);
    const centre = surface.sections.reduce((a,b) => Math.abs(a.p.y) < Math.abs(b.p.y) ? a : b);
    expect(centre.p.y).toBe(0);
    for (let k = 0; k < 2; k++) {
      expect(centre.toe[k].z).toBe(110);
      expect(centre.toe[k]).toEqual(centre.edge[k]);
    }
    expect(formation(100, 15)).toBeCloseTo(100 + 10/3);
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
