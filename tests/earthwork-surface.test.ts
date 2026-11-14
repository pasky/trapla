import { describe, expect, it } from 'vitest';
import { collarPoint, daylightSections, groundBlend, type EarthworkRoute } from '../src/render/earthwork-surface';

describe('daylight stitching', () => {
  const f = (v: number[]) => Float64Array.from(v);
  const route: EarthworkRoute = { n: 2, x: f([0,20]), y: f([0,0]), tx: f([1,1]), ty: f([0,0]),
    grade: f([90,110]), kind: new Uint8Array(2), dayL: f([20,30]), dayR: f([25,15]) };
  const natural = (x: number, y: number) => 100 + Math.sin(x/5) + y*.1;
  const coarse = (x: number, y: number) => natural(x,y)+2;
  it('shares fine terrain vertices with both cut and fill slopes, not the old raised 20 m edge', () => {
    for (const side of [-1,1]) {
      const sections = daylightSections(route, 0, side, 5, natural);
      expect(sections.length).toBeGreaterThan(2);
      expect(sections[0].edge.z).toBeLessThan(sections[0].day.z);
      expect(sections.at(-1)!.edge.z).toBeGreaterThan(sections.at(-1)!.day.z);
      for (const s of sections) {
        expect(collarPoint(s,0,natural,coarse)).toEqual(s.day);
        expect(s.day.z).toBe(natural(s.day.x,s.day.y));
        // The raster-mask transition lies inside this overlap, away from the cut face.
        for (const t of [.75,.875,1]) {
          const p = collarPoint(s,t,natural,coarse);
          expect(p.z).toBeGreaterThanOrEqual(coarse(p.x,p.y)-1e-10);
        }
      }
    }
  });
  it('keeps retained fill and cut slopes vertically separate from natural ground collars on either side', () => {
    const retained = { ...route, wallSurfaceL: f([108,112]), wallSurfaceR: f([92,94]) };
    for (const side of [-1,1]) {
      const sections = daylightSections(retained,0,side,5,natural);
      for (const [j,s] of sections.entries()) {
        const t = j/(sections.length-1), toe = s.slopeDay!;
        expect(toe.x).toBe(s.day.x); expect(toe.y).toBe(s.day.y);
        expect(toe.z).toBeCloseTo(side > 0 ? 108+4*t : 92+2*t);
        expect((toe.z-s.day.z)*side).toBeGreaterThan(0);
        expect(s.day.z).toBe(natural(s.day.x,s.day.y));
        expect(collarPoint(s,0,natural,coarse)).toEqual(s.day);
        // Ground outside the face cannot rise to the wall top and bury a nearby feature.
        const p = collarPoint(s,1/8,natural,coarse);
        expect(p.z).toBe(natural(p.x,p.y));
      }
    }
  });
  it('tapers to unretained stations and leaves NaN or absent walls on natural daylight', () => {
    for (const walls of [[NaN,110],[110,NaN]]) {
      const sections = daylightSections({ ...route, wallSurfaceL: f(walls) },0,1,5,natural);
      const noWall = Number.isNaN(walls[0]) ? sections[0] : sections.at(-1)!;
      expect(noWall.slopeDay!.z).toBeCloseTo(noWall.day.z);
      expect(sections.every(s => Number.isFinite(s.slopeDay!.z))).toBe(true);
    }
    for (const wallSurfaceL of [undefined,f([NaN,NaN])]) {
      const sections = daylightSections({ ...route, wallSurfaceL },0,1,5,natural);
      expect(sections.every(s => s.slopeDay === undefined)).toBe(true);
    }
  });
  it('keeps overlapping collars at natural height near either road, including an endpoint tie-in', () => {
    const blend = groundBlend([{ a: { x: 0,y: 0 }, b: { x: 100,y: 0 }, width: 3 },
      { a: { x: 50,y: 0 }, b: { x: 50,y: 100 }, width: 2 }]);
    expect(blend(50,20)).toBe(0); // outer collar of first road, centre of the second
    expect(blend(105,0)).toBe(0); // endpoint collar must not lift a connected ground road
    expect(blend(20,15)).toBeGreaterThan(0);
    expect(blend(20,15)).toBeLessThan(1);
    expect(blend(20,25)).toBe(1);
    expect(blend(10000,10000)).toBe(1);
  });
  it('does not lay replacement ground across a bridge or tunnel void', () => {
    for (const kind of [1,2]) expect(daylightSections({ ...route, kind: new Uint8Array([0,kind]) },0,1,5,natural)).toEqual([]);
  });
});
