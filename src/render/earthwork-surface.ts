import type { Result } from '../core/evaluate';
import { KIND } from '../core/structures';
import { SIDE_SLOPES } from '../core/data/prices';

export interface GroundPoint { x: number; y: number; z: number }
export interface DaylightSection { edge: GroundPoint; day: GroundPoint; outer: GroundPoint; slopeDay?: GroundPoint }
// The discard edge lives in the replacement ground, never on the exposed cut face.
export const GROUND_COLLAR = 20;
export const COLLAR_OVERLAP = 5;
export type EarthworkRoute = Pick<Result, 'n' | 'x' | 'y' | 'tx' | 'ty' | 'grade' | 'kind' | 'dayL' | 'dayR'> & {
  wallSurfaceL?: Float64Array; wallSurfaceR?: Float64Array;
};
export function daylightPoint(r: EarthworkRoute, i: number, side: number, extra = 0) {
  const off = ((side > 0 ? r.dayL[i] : r.dayR[i]) + extra) * side;
  return { x: r.x[i] - r.ty[i] * off, y: r.y[i] + r.tx[i] * off };
}
/**
 * Stations drawn as ground works (terrain cut away, side faces, replacement ground): the earthwork
 * stations and, at a bridge end set into a bank, the abutment. Its stations run from the earthworks
 * while the natural ground (on the axis or at a daylight point) is still above the deck, plus the first
 * one clear of it, where the abutment's front wall stands. Without them the bank covers the first metres
 * of the deck and the end of the cut is open. Display only: the engine's daylight points, nothing billed.
 */
export function groundStations(r: EarthworkRoute, natural: (x: number, y: number) => number): Uint8Array {
  const out = new Uint8Array(r.n);
  for (let i = 0; i < r.n; i++) out[i] = r.kind[i] === KIND.earth ? 1 : 0;
  const buried = (j: number) => r.kind[j] === KIND.bridge && Math.max(natural(r.x[j], r.y[j]),
    ...[1, -1].map((side) => { const p = daylightPoint(r, j, side); return natural(p.x, p.y); })) > r.grade[j];
  for (let i = 0; i < r.n; i++) {
    if (r.kind[i] !== KIND.earth) continue;
    for (const step of [1, -1]) {
      let j = i + step, abutment = false;
      while (j >= 0 && j < r.n && buried(j)) { out[j] = 1; j += step; abutment = true; }
      if (abutment && j >= 0 && j < r.n && r.kind[j] === KIND.bridge) out[j] = 1;
    }
  }
  return out;
}

/** The slope's main bend between the crown edge and the daylight point, as the engine shapes it
 * (data/prices.ts SIDE_SLOPES): where a fill's flatter 1:2.5 toe band begins, or where a cut's steep rock face
 * meets the soil slope above it (the rock top taken at the station's weathering profile below the daylight
 * height). As a fraction `u` of the way out from the crown edge and a height `dz` off the straight edge–daylight
 * line; null for a straight slope or a slope a wall stops. Display only, from the billed daylight points. */
export function slopeKnee(r: EarthworkRoute & Pick<Result, 'zDayL' | 'zDayR' | 'geology'>, i: number, side: number,
  halfWidth: number): { u: number; dz: number } | null {
  if (Number.isFinite((side > 0 ? r.wallSurfaceL : r.wallSurfaceR)?.[i])) return null;
  const z = r.grade[i], day = side > 0 ? r.dayL[i] : r.dayR[i], zDay = side > 0 ? r.zDayL[i] : r.zDayR[i];
  const run = day - halfWidth, height = zDay - z;
  if (run <= 0.5) return null;
  let o: number, zk: number;
  if (height < 0) {
    if (-height <= SIDE_SLOPES.fillToeHeight + 0.1) return null;
    zk = zDay + SIDE_SLOPES.fillToeHeight; o = day - SIDE_SLOPES.fillToeHeight * SIDE_SLOPES.fillToe;
  } else {
    const g = r.geology.profiles[r.geology.ids[i]];
    const rock = g && !g.normMix ? height - g.classIIto : 0;
    if (rock <= 0.1 || rock >= height - 0.1) return null;
    zk = z + rock;
    o = halfWidth + rock * SIDE_SLOPES.cutRock + Math.floor((rock - 1e-9) / SIDE_SLOPES.rockBenchEvery) * SIDE_SLOPES.benchWidth;
  }
  const u = (o - halfWidth) / run;
  if (!(u > 0.02 && u < 0.98)) return null;
  return { u, dz: zk - (z + u * height) };
}

/** Fine replacement ground, rebuilt only on evaluation. The inner edge meets the slope or
 * vertical retaining face; the outer edge returns to the existing 20 m triangles. `ground` =
 * groundStations (default: the earthwork stations). */
export function daylightSections(r: EarthworkRoute, i: number, side: number, halfWidth: number,
  natural: (x: number, y: number) => number, ground?: ArrayLike<number>): DaylightSection[] {
  if (i + 1 >= r.n || (ground ? !ground[i] || !ground[i + 1] : r.kind[i] !== KIND.earth || r.kind[i + 1] !== KIND.earth)) return [];
  const a = daylightPoint(r, i, side), b = daylightPoint(r, i + 1, side);
  const ao = daylightPoint(r, i, side, GROUND_COLLAR), bo = daylightPoint(r, i + 1, side, GROUND_COLLAR);
  const edge = (j: number) => ({ x: r.x[j] - r.ty[j] * halfWidth * side, y: r.y[j] + r.tx[j] * halfWidth * side, z: r.grade[j] });
  const ae = edge(i), be = edge(i + 1);
  const wall = side > 0 ? r.wallSurfaceL : r.wallSurfaceR;
  const wallA = Number.isFinite(wall?.[i]), wallB = Number.isFinite(wall?.[i+1]);
  const az = wallA ? wall![i] : natural(a.x,a.y), bz = wallB ? wall![i+1] : natural(b.x,b.y);
  const count = Math.max(1, Math.ceil(Math.max(Math.hypot(b.x-a.x,b.y-a.y), Math.hypot(bo.x-ao.x,bo.y-ao.y)) / 2.5));
  return Array.from({ length: count + 1 }, (_, j) => {
    const t = j/count, at = (p: { x: number; y: number }, q: typeof p) => ({ x: p.x+(q.x-p.x)*t, y: p.y+(q.y-p.y)*t });
    const day = at(a,b), outer = at(ao,bo);
    const ground = { ...day, z: natural(day.x,day.y) };
    // NaN means no wall. Preserve the fine natural daylight there, and taper a wall to
    // the neighbouring unretained station without ever lifting its ground collar.
    const slopeDay = wallA || wallB ? { ...day, z: az+(bz-az)*t } : undefined;
    return { edge: { ...at(ae,be), z: ae.z+(be.z-ae.z)*t }, day: ground,
      outer: { ...outer, z: natural(outer.x,outer.y) }, slopeDay };
  });
}
export interface GroundCorridor { a: { x: number; y: number }; b: { x: number; y: number }; width: number }
/** All replacement patches share a blend field. Otherwise one patch's coarse outer collar
 * can cover a neighbouring road at true ground, notably diversion tie-ins beneath bridges. */
export function groundBlend(corridors: GroundCorridor[]) {
  // Called for every collar vertex of every evaluation (≈ 10⁵ queries): a fine numeric-key grid
  // over flat corridor terms, and a squared-distance reject for corridors too far to lower the
  // blend (it is 1 from 12.5 m beyond a corridor's width). Same minimum as a full scan.
  const cell = 25, grid = new Map<number, number[]>(), KEY = 1 << 20, OFF = 1 << 19;
  const terms = new Float64Array(corridors.length * 6);
  corridors.forEach((c, k) => {
    const dx = c.b.x-c.a.x, dy = c.b.y-c.a.y;
    terms.set([c.a.x, c.a.y, dx, dy, dx*dx+dy*dy || 1, c.width], k * 6);
    const reach = c.width + GROUND_COLLAR;
    for (let x = Math.floor((Math.min(c.a.x,c.b.x)-reach)/cell); x <= Math.floor((Math.max(c.a.x,c.b.x)+reach)/cell); x++)
      for (let y = Math.floor((Math.min(c.a.y,c.b.y)-reach)/cell); y <= Math.floor((Math.max(c.a.y,c.b.y)+reach)/cell); y++) {
        const key = (x + OFF) * KEY + y + OFF, list = grid.get(key);
        if (list) list.push(k * 6); else grid.set(key, [k * 6]);
      }
  });
  return (x: number, y: number) => {
    const list = grid.get((Math.floor(x/cell) + OFF) * KEY + Math.floor(y/cell) + OFF);
    if (!list) return 1;
    let blend = 1;
    for (let j = 0; j < list.length; j++) {
      const o = list[j], ax = terms[o], ay = terms[o+1], dx = terms[o+2], dy = terms[o+3], width = terms[o+5];
      const t = Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/terms[o+4]));
      const px = x-ax-t*dx, py = y-ay-t*dy, far = width + 12.5;
      if (px*px+py*py >= far*far) continue;
      const distance = Math.hypot(px,py)-width;
      blend = Math.min(blend,Math.max(0,(distance-10)/2.5));
      if (!blend) break;
    }
    return blend;
  };
}

/** The overlap is wholly above the coarse triangles, while the daylight is at true ground. */
export function collarPoint(section: Pick<DaylightSection, 'day' | 'outer'>, t: number, natural: (x: number, y: number) => number,
  mesh: (x: number, y: number) => number): GroundPoint {
  const x = section.day.x+(section.outer.x-section.day.x)*t, y = section.day.y+(section.outer.y-section.day.y)*t;
  const ground = natural(x,y);
  const blend = Math.max(0, Math.min(1, (t * GROUND_COLLAR - 10) / (GROUND_COLLAR - COLLAR_OVERLAP - 2.5 - 10)));
  // the coarse mesh (an expensive lookup) only matters where it is blended in, the daylight
  // join only next to the slope: skip each where its weight is exactly zero
  const fade = Math.max(0,1-t*8);
  const join = fade ? (section.day.z-natural(section.day.x,section.day.y))*fade : 0;
  return { x, y, z: ground+join+(blend ? (Math.max(ground,mesh(x,y))-ground)*blend : 0) };
}
