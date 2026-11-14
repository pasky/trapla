import type { CrossingResult } from './crossings';
import { NOISE } from './data/urban';

/** Physical openings where an at-grade side road crosses a noise-wall line. Block whole station
 * cells, consistently with noise pricing/rendering; a T-junction opens only its connected side. */
export function crossingWallGaps(route: { s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>; tx: ArrayLike<number>; ty: ArrayLike<number> },
  crossings: readonly CrossingResult[], crownWidth: number) {
  const n = route.s.length, L = new Uint8Array(n), R = new Uint8Array(n), off = crownWidth / 2 + NOISE.wallEdgeOffset;
  for (const c of crossings) {
    const road = c.type === 'junction' ? c.geometry?.road : undefined;
    if (!road || road.length < 2) continue;
    const radius = c.geometry!.width / 2 + .5;
    for (let j = 1; j < road.length; j++) {
      const a = road[j-1], b = road[j], dx = b.x-a.x, dy = b.y-a.y, len2 = dx*dx+dy*dy;
      for (let i = 0; i < n; i++) {
        const halfCell = n > 1 ? (i ? route.s[i]-route.s[i-1] : route.s[1]-route.s[0])/2 : 0;
        if (route.x[i] < Math.min(a.x,b.x)-off-radius-halfCell || route.x[i] > Math.max(a.x,b.x)+off+radius+halfCell
          || route.y[i] < Math.min(a.y,b.y)-off-radius-halfCell || route.y[i] > Math.max(a.y,b.y)+off+radius+halfCell) continue;
        for (const side of [-1,1]) {
          const x = route.x[i]-route.ty[i]*off*side, y = route.y[i]+route.tx[i]*off*side;
          const t = Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(len2 || 1)));
          // Project the cell extent onto the road normal, rather than growing both sides of a
          // dead-end road by a full cell radius (which would incorrectly open the other side).
          const normal = Math.abs(route.tx[i]*dy-route.ty[i]*dx)/Math.sqrt(len2 || 1);
          const along = ((x-a.x)*dx+(y-a.y)*dy)/Math.sqrt(len2 || 1);
          if (along < -radius || along > Math.sqrt(len2)+radius) continue;
          if (Math.hypot(x-a.x-dx*t,y-a.y-dy*t) <= radius+halfCell*normal) (side > 0 ? L : R)[i] = 1;
        }
      }
    }
  }
  return { L, R };
}
