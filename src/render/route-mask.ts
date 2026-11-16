// Display masks only: all geometry comes from evaluated roads and their engineered side roads.
// One collection per scene generation, never whichever route finished rebuilding last.
import type { Result } from '../core/evaluate';
import { COLLAR_OVERLAP, GROUND_COLLAR, daylightPoint, groundStations } from './earthwork-surface';
import { endCollars, groundSegment, turnaroundMaskRing, turnaroundSurfaces, underpassOpenings, type CrossingSurface } from './crossing-surface';

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

/** how far short of an embankment's end face at a structure the terrain mask stops, m (≥ the mask
 * raster's bleed: half a ≈ 2.5 m texel plus rasterisation) */
const MASK_END_INSET = 3;

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
    // Where an embankment ends at a structure (an abutment) nothing covers the ground beyond its end face:
    // there the terrain mask stops MASK_END_INSET short of the face, so the raster's bleed (≈ a texel)
    // cannot open a sky-coloured wedge in front of it; the ground it keeps lies inside the embankment.
    // In a cut the mask must reach the face (the ground stands above the road there).
    const fill = (i: number, side: number) => { const p = daylightPoint(r, i, side); return natural(p.x, p.y) <= r.grade[i] + 0.05; };
    const toward = (p: [number, number], q: [number, number]) => {
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]), t = len > 0 ? Math.min(0.45, MASK_END_INSET / len) : 0;
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] as [number, number];
    };
    for (let i = 0; i < r.n - 1; i++) {
      if (!ground[i] || !ground[i + 1]) continue;
      for (const [points, out] of [[P, terrain], [exact, original]] as const) {
        let a0 = points[2 * i], b0 = points[2 * i + 1], a1 = points[2 * i + 2], b1 = points[2 * i + 3];
        if (points === P) {
          if (i > 0 && !ground[i - 1]) { if (fill(i, 1)) a0 = toward(a0, a1); if (fill(i, -1)) b0 = toward(b0, b1); }
          if (i + 2 < r.n && !ground[i + 2]) { if (fill(i + 1, 1)) a1 = toward(a1, a0); if (fill(i + 1, -1)) b1 = toward(b1, b0); }
          // The route's own ends meet the ground (at grade): nothing covers what lies beyond them either,
          // so the mask stops short there too, or a line of sky-coloured slivers opens across the road.
          if (i === 0) { a0 = toward(a0, a1); b0 = toward(b0, b1); }
          if (i + 2 === r.n) { a1 = toward(a1, a0); b1 = toward(b1, b0); }
        }
        for (const p of [a0, b0, a1, b0, b1, a1]) out.push(p[0], 0, p[1]);
      }
    }
    for (const surface of surfaces) {
      // A crossed road's deck end on ground (an abutment at or above it): as at our structures, its mask stops
      // MASK_END_INSET short of the end section, or the raster's bleed opens a sky-coloured line beside the deck.
      const sections = surface.sections, along = [0];
      for (let i = 1; i < sections.length; i++) along.push(along[i - 1] + Math.hypot(sections[i].p.x - sections[i - 1].p.x, sections[i].p.y - sections[i - 1].p.y));
      const onGround = (k: number) => { const p = sections[k].p; return p.z >= natural(p.x, p.y) - 0.05; };
      const deck = !surface.link && surface.deck ? surface.deck : undefined;
      const stopBefore = deck && onGround(deck.start) ? along[deck.start] - MASK_END_INSET : Infinity;
      const startAfter = deck && onGround(deck.end) ? along[deck.end] + MASK_END_INSET : -Infinity;
      for (let i = 0; i + 1 < sections.length; i++) {
        if (!groundSegment(surface, i)) continue;
        const a = sections[i], b = sections[i + 1];
        const inset = (p: typeof a.p, q: typeof a.p) => {
          const t = Math.max(0, 1 - 2 * COLLAR_OVERLAP / Math.hypot(q.x - p.x, q.y - p.y));
          return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
        };
        let a0 = inset(a.p, a.outer[0]), a1 = inset(a.p, a.outer[1]), b0 = inset(b.p, b.outer[0]), b1 = inset(b.p, b.outer[1]);
        const s0 = Math.max(along[i], i < (deck?.start ?? 0) ? -Infinity : startAfter), s1 = Math.min(along[i + 1], i < (deck?.start ?? 0) ? stopBefore : Infinity);
        if (s1 <= s0) continue;
        if (s0 > along[i] || s1 < along[i + 1]) {
          const len = along[i + 1] - along[i], lerp = (p: { x: number; y: number }, q: { x: number; y: number }, t: number) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
          const t0 = (s0 - along[i]) / len, t1 = (s1 - along[i]) / len;
          [a0, a1, b0, b1] = [lerp(a0, b0, t0), lerp(a1, b1, t0), lerp(a0, b0, t1), lerp(a1, b1, t1)];
        }
        addQuad(terrain, a0, a1, b0, b1);
        if (surface.crossing.type === 'junction') addQuad(cuts, a.toe[0], a.toe[1], b.toe[0], b.toe[1]);
      }
    }
    // An underpass's open way between our slope's toe and its portal: our slopes are cut away between the
    // wing walls (drawn with the box).
    for (const surface of surfaces) {
      const g = surface.crossing.geometry;
      if (surface.link || surface.tie || surface.crossing.type !== 'underpass' || !g?.underpass || !g.road) continue;
      const half = g.underpass.width / 2 + g.underpass.wall;
      for (const wing of underpassOpenings(g.road, g.underpass)) for (let k = 1; k < wing.length; k++) {
        const p = wing[k - 1], q = wing[k];
        addQuad(cuts, { x: p.x + p.nx * half, y: p.y + p.ny * half }, { x: p.x - p.nx * half, y: p.y - p.ny * half },
          { x: q.x + q.nx * half, y: q.y + q.ny * half }, { x: q.x - q.nx * half, y: q.y - q.ny * half });
      }
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
