// Display masks only: all geometry comes from evaluated roads and their engineered side roads.
// One collection per scene generation, never whichever route finished rebuilding last.
import type { Result } from '../core/evaluate';
import { COLLAR_OVERLAP, GROUND_COLLAR, daylightPoint, groundStations } from './earthwork-surface';
import { endCollars, groundSegment, turnaroundMaskRing, turnaroundSurfaces, type CrossingSurface } from './crossing-surface';

export interface RouteMaskInput {
  result: Pick<Result, 'n' | 'x' | 'y' | 'tx' | 'ty' | 'dayL' | 'dayR' | 'zDayL' | 'zDayR' | 'grade' | 'kind'>;
  surfaces: readonly CrossingSurface[];
}
export interface RouteMask {
  terrain: number[];
  original: number[];
  cuts: number[];
  box: { minX: number; minZ: number; maxX: number; maxZ: number } | null;
}

/** Coordinates match View.local's horizontal axes. Empty scenes have no mask, not infinite bounds. */
export function routeMask(inputs: readonly RouteMaskInput[], cx: number, cy: number,
  natural: (x: number, y: number) => number): RouteMask {
  const terrain: number[] = [], original: number[] = [], cuts: number[] = [];
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const bounds = (x: number, z: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  };
  const addQuad = (out: number[], a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => {
    for (const p of [a, b, c, b, d, c]) {
      const x = p.x - cx, z = cy - p.y;
      out.push(x, 0, z); bounds(x, z);
    }
  };
  for (const { result: r, surfaces } of inputs) {
    const P: [number, number][] = [], exact: [number, number][] = [];
    for (let i = 0; i < r.n; i++) {
      const nx = -r.ty[i], ny = r.tx[i];
      const L = r.dayL[i] + GROUND_COLLAR - COLLAR_OVERLAP, R = r.dayR[i] + GROUND_COLLAR - COLLAR_OVERLAP;
      for (const side of [1, -1]) {
        const p = daylightPoint(r, i, side);
        exact.push([p.x - cx, cy - p.y]);
      }
      const a: [number, number] = [r.x[i] + nx * L - cx, cy - r.y[i] - ny * L];
      const b: [number, number] = [r.x[i] - nx * R - cx, cy - r.y[i] + ny * R];
      P.push(a, b); bounds(a[0], a[1]); bounds(b[0], b[1]);
    }
    const ground = groundStations(r, natural);
    for (let i = 0; i < r.n - 1; i++) {
      if (!ground[i] || !ground[i + 1]) continue;
      for (const [points, out] of [[P, terrain], [exact, original]] as const) {
        const a0 = points[2 * i], b0 = points[2 * i + 1], a1 = points[2 * i + 2], b1 = points[2 * i + 3];
        for (const p of [a0, b0, a1, b0, b1, a1]) out.push(p[0], 0, p[1]);
      }
    }
    for (const surface of surfaces) for (let i = 0; i + 1 < surface.sections.length; i++) {
      if (!groundSegment(surface, i)) continue;
      const a = surface.sections[i], b = surface.sections[i + 1];
      const inset = (p: typeof a.p, q: typeof a.p) => {
        const t = Math.max(0, 1 - 2 * COLLAR_OVERLAP / Math.hypot(q.x - p.x, q.y - p.y));
        return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
      };
      addQuad(terrain, inset(a.p, a.outer[0]), inset(a.p, a.outer[1]), inset(b.p, b.outer[0]), inset(b.p, b.outer[1]));
      if (surface.crossing.type === 'junction') addQuad(cuts, a.toe[0], a.toe[1], b.toe[0], b.toe[1]);
    }
    for (const surface of surfaces) for (const [a, b, c, d] of endCollars(surface, natural)) {
      const inset = (p: typeof a, q: typeof a, metres: number) => {
        const t = Math.min(.45, metres / Math.hypot(q.x - p.x, q.y - p.y));
        return { ...p, x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
      };
      const l = inset(a, b, 2 * COLLAR_OVERLAP), rr = inset(b, a, 2 * COLLAR_OVERLAP);
      const endL = inset(c, d, 2 * COLLAR_OVERLAP), endR = inset(d, c, 2 * COLLAR_OVERLAP);
      addQuad(terrain, l, rr, inset(endL, l, 2 * COLLAR_OVERLAP), inset(endR, rr, 2 * COLLAR_OVERLAP));
    }
    for (const head of turnaroundSurfaces(surfaces, natural)) {
      const ring = turnaroundMaskRing(head);
      for (let j = 0; j < ring.length; j++) for (const p of [head.center, ring[j], ring[(j + 1) % ring.length]]) {
        const x = p.x - cx, z = cy - p.y;
        terrain.push(x, 0, z); bounds(x, z);
      }
    }
  }
  return { terrain, original, cuts, box: Number.isFinite(minX) ? { minX: minX - 20, minZ: minZ - 20, maxX: maxX + 20, maxZ: maxZ + 20 } : null };
}
