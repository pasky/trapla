import type { Result } from '../core/evaluate';
import { KIND } from '../core/structures';

export interface GroundPoint { x: number; y: number; z: number }
export interface DaylightSection { edge: GroundPoint; day: GroundPoint; outer: GroundPoint }
// The discard edge lives in the replacement ground, never on the exposed cut face.
export const GROUND_COLLAR = 20;
export const COLLAR_OVERLAP = 5;
export type EarthworkRoute = Pick<Result, 'n' | 'x' | 'y' | 'tx' | 'ty' | 'grade' | 'kind' | 'dayL' | 'dayR'>;
export function daylightPoint(r: EarthworkRoute, i: number, side: number, extra = 0) {
  const off = ((side > 0 ? r.dayL[i] : r.dayR[i]) + extra) * side;
  return { x: r.x[i] - r.ty[i] * off, y: r.y[i] + r.tx[i] * off };
}
/** Fine replacement ground, rebuilt only on evaluation. The inner edge is shared with the
 * slope; the outer edge returns to the existing 20 m triangles. No camera-dependent seams. */
export function daylightSections(r: EarthworkRoute, i: number, side: number, halfWidth: number,
  natural: (x: number, y: number) => number): DaylightSection[] {
  if (i + 1 >= r.n || r.kind[i] !== KIND.earth || r.kind[i + 1] !== KIND.earth) return [];
  const a = daylightPoint(r, i, side), b = daylightPoint(r, i + 1, side);
  const ao = daylightPoint(r, i, side, GROUND_COLLAR), bo = daylightPoint(r, i + 1, side, GROUND_COLLAR);
  const edge = (j: number) => ({ x: r.x[j] - r.ty[j] * halfWidth * side, y: r.y[j] + r.tx[j] * halfWidth * side, z: r.grade[j] });
  const ae = edge(i), be = edge(i + 1);
  const count = Math.max(1, Math.ceil(Math.max(Math.hypot(b.x-a.x,b.y-a.y), Math.hypot(bo.x-ao.x,bo.y-ao.y)) / 2.5));
  return Array.from({ length: count + 1 }, (_, j) => {
    const t = j/count, at = (p: { x: number; y: number }, q: typeof p) => ({ x: p.x+(q.x-p.x)*t, y: p.y+(q.y-p.y)*t });
    const day = at(a,b), outer = at(ao,bo);
    return { edge: { ...at(ae,be), z: ae.z+(be.z-ae.z)*t }, day: { ...day, z: natural(day.x,day.y) }, outer: { ...outer, z: natural(outer.x,outer.y) } };
  });
}
export interface GroundCorridor { a: { x: number; y: number }; b: { x: number; y: number }; width: number }
/** All replacement patches share a blend field. Otherwise one patch's coarse outer collar
 * can cover a neighbouring road at true ground, notably diversion tie-ins beneath bridges. */
export function groundBlend(corridors: GroundCorridor[]) {
  const cell = 100, grid = new Map<string, GroundCorridor[]>();
  for (const c of corridors) {
    const reach = c.width + GROUND_COLLAR;
    for (let x = Math.floor((Math.min(c.a.x,c.b.x)-reach)/cell); x <= Math.floor((Math.max(c.a.x,c.b.x)+reach)/cell); x++)
      for (let y = Math.floor((Math.min(c.a.y,c.b.y)-reach)/cell); y <= Math.floor((Math.max(c.a.y,c.b.y)+reach)/cell); y++) {
        const key = `${x},${y}`, list = grid.get(key) ?? []; list.push(c); grid.set(key,list);
      }
  }
  return (x: number, y: number) => {
    let blend = 1;
    for (const c of grid.get(`${Math.floor(x/cell)},${Math.floor(y/cell)}`) ?? []) {
      const dx = c.b.x-c.a.x, dy = c.b.y-c.a.y;
      const t = Math.max(0,Math.min(1,((x-c.a.x)*dx+(y-c.a.y)*dy)/(dx*dx+dy*dy || 1)));
      const distance = Math.hypot(x-c.a.x-t*dx,y-c.a.y-t*dy)-c.width;
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
  const ground = natural(x,y), coarse = mesh(x,y);
  const blend = Math.max(0, Math.min(1, (t * GROUND_COLLAR - 10) / (GROUND_COLLAR - COLLAR_OVERLAP - 2.5 - 10)));
  const join = (section.day.z-natural(section.day.x,section.day.y))*Math.max(0,1-t*8);
  return { x, y, z: ground+join+(Math.max(ground,coarse)-ground)*blend };
}
