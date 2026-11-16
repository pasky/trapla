import { describe, expect, it } from 'vitest';
import { collarPoint, daylightSections, groundBlend, groundStations, type EarthworkRoute } from '../src/render/earthwork-surface';

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
    for (const side of [-1,1]) {
      const retained = { ...route, grade: side > 0 ? f([115,120]) : f([85,87]),
        wallSurfaceL: f([108,112]), wallSurfaceR: f([92,94]) };
      const sections = daylightSections(retained,0,side,5,natural);
      for (const [j,s] of sections.entries()) {
        const t = j/(sections.length-1), toe = s.slopeDay!;
        expect(toe.x).toBe(s.day.x); expect(toe.y).toBe(s.day.y);
        expect(toe.z).toBeCloseTo(side > 0 ? 108+4*t : 92+2*t);
        expect((toe.z-s.day.z)*side).toBeGreaterThan(0);
        expect((s.edge.z-toe.z)*side).toBeGreaterThan(0);
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
      // the wall's end is down on the ground by the half station it is billed to (no unbilled flare)
      const wallEnd = Number.isNaN(walls[0]) ? sections.at(-1)! : sections[0];
      expect(wallEnd.slopeDay!.z).toBeCloseTo(110);
      sections.forEach((s, j) => { const t = j / (sections.length - 1);
        if (Number.isNaN(walls[0]) ? t <= 0.5 : t >= 0.5) expect(s.slopeDay!.z).toBeCloseTo(s.day.z); });
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
  it('draws a bridge end set into a bank as the abutment, up to the first station clear of the ground', () => {
    // cut, two bridge stations still under the bank, the abutment front, the open span, a normal far end
    const n = 8, bridge = Uint8Array.of(0,1,1,1,1,1,1,0), ground = [102,101,100.5,98,90,90,95,99];
    const r: EarthworkRoute = { n, x: f(Array.from({ length: n }, (_, i) => 10*i)), y: f(Array(n).fill(0)), tx: f(Array(n).fill(1)),
      ty: f(Array(n).fill(0)), grade: f(Array(n).fill(100)), kind: bridge, dayL: f(Array(n).fill(6)), dayR: f(Array(n).fill(6)) };
    const at = (x: number) => ground[Math.round(x/10)];
    expect([...groundStations(r, at)]).toEqual([1,1,1,1,0,0,0,1]);
    expect(daylightSections(r, 2, 1, 5, at, groundStations(r, at)).length).toBeGreaterThan(0);
    expect(daylightSections(r, 4, 1, 5, at, groundStations(r, at))).toEqual([]);
  });
});
