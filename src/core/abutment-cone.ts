// Where a fill meets a bridge (playtest sweep 3, P1 #4; research/68). The abutment stands on top of the fill and
// the fill runs on in front of it, under the bridge's end span, as a cone sloped 1:1.5 down to the ground, with
// quarter cones round the wing ends meeting the fill's side slopes; a berm of at least 0.6 m in front of the
// abutment, the slope paved under the deck and ending at a concrete toe sill (MD ČR VL 4 Mosty 2021 sheets 204.02,
// 206.02, 206.03; the D5 Rokycany SO 201 bill of quantities bills the "svahové kužele" as quarter cones inside the
// bridge object). The bridge's first pier stands beyond the cone's toe, so its end span reaches past it.
import type { Terrain } from './terrain';

export const CONE = {
  /** the cone's slope, horizontal per vertical (VL 4 206.02 / 206.03: 1:1.5) */
  slope: 1.5,
  /** the berm in front of the abutment at the cone's top, m (VL 4 206.02: at least 0.6 m) */
  berm: 0.6,
  /** the cone's top under the road: the deck and its bearings, m (PROVISIONAL: a 30–40 m span's deck ≈ span / 20
   * plus the bearing, support-layout's deck depth) */
  deckDepth: 2,
  /** paving under the deck, this far beyond its edges each side, m (research/68 §4: deck width + 1 m) */
  paveMargin: 0.5,
  /** paving, CZK/m²: 200 mm quarry stone on mortar (OTSKP 465512, 7,252.50 / m³) on 150 mm C20/25 (45131A,
   * 4,648.04 / m³), VL 4 206.02: 0.20 × 7,252.50 + 0.15 × 4,648.04 (research/68 §3.1) */
  pavingPerM2: 0.2 * 7_252.50 + 0.15 * 4_648.04,
  /** the toe sill 0.5 × 0.8 m of plain C25/30 (OTSKP 467314, 8,483.77 / m³), CZK per m (research/68 §3.1) */
  sillPerM: 0.4 * 8_483.77,
  /** the longest end span over a cone, m: the longest regular span of either style (data/bridges.ts: long spans
   * 45–60 m; short spans reach 60 m over what lies below). A cone reaching further puts the abutment further out:
   * the bridge is longer (evaluate.ts); fills at an abutment of ≈ 40 m and more (Czech: 7–14 m documented). */
  maxEndSpan: 60,
  /** the grid the cone's volume is summed on, m */
  grid: 2,
};

export interface AbutmentCone {
  /** the bridge's end cell (the cone's paving is billed there) and the earth cell beside it (its fill) */
  i: number; earthCell: number;
  /** the abutment's front (the bridge's end) and the direction into the bridge along the route */
  s: number; x: number; y: number; tx: number; ty: number;
  /** half the crest width, m; the cone's top level, m */
  half: number; top: number;
  /** from the abutment to the toe along the axis, m; the cone's top above the ground at the abutment, m */
  reach: number; height: number;
  /** fill, m³; paving, m²; toe sill, m */
  volume: number; paved: number; sill: number;
}

/** the cone's surface at `u` m into the bridge from the abutment and `v` m off the axis (no ground) */
export function coneSurface(c: Pick<AbutmentCone, 'half' | 'top'>, u: number, v: number): number {
  const off = Math.abs(v) - c.half, d = off <= 0 ? u : Math.hypot(u, off);
  return c.top - Math.max(0, d - CONE.berm) / CONE.slope;
}

/** how far into the bridge the cone of a fill whose top is `top` reaches along the axis, m: where its slope meets
 * the ground (`groundAt(u)`: ground on the axis u m into the bridge), at most `limit` */
export function coneReach(top: number, groundAt: (u: number) => number, limit = 300): number {
  let prev = 0;
  for (let u = 0; u <= limit; u += 0.5) {
    const z = top - Math.max(0, u - CONE.berm) / CONE.slope, g = groundAt(u);
    if (z <= g) {
      if (u === 0) return 0;
      const zp = top - Math.max(0, prev - CONE.berm) / CONE.slope, gp = groundAt(prev);
      return prev + 0.5 * (zp - gp) / Math.max(1e-9, (zp - gp) - (z - g));
    }
    prev = u;
  }
  return limit;
}

/** The cone at a bridge end. `at`: the abutment (the bridge's end) and the direction into the bridge; `grade`:
 * the road's height there; `half`: half the crest width; `deckHalf`: half the deck width. Null where the ground
 * is at the cone's top (an abutment set into a bank: no fill in front of it). */
export function abutmentCone(terrain: Terrain, at: { s: number; x: number; y: number; tx: number; ty: number; i: number; earthCell: number },
  grade: number, half: number, deckHalf: number): AbutmentCone | null {
  const top = grade - CONE.deckDepth, g0 = terrain.heightAt(at.x, at.y);
  if (top - g0 < 0.5) return null;
  const axis = (u: number) => terrain.heightAt(at.x + at.tx * u, at.y + at.ty * u);
  const reach = coneReach(top, axis);
  // the volume over the ground on a grid in front of the abutment (u along, v across)
  const G = CONE.grid, U = reach + G, side = half + CONE.berm + CONE.slope * (top - Math.min(g0, axis(reach))) + G;
  let volume = 0;
  for (let u = G / 2; u < U; u += G) for (let v = -side + G / 2; v < side; v += G) {
    const x = at.x + at.tx * u - at.ty * v, y = at.y + at.ty * u + at.tx * v;
    const dz = coneSurface({ half, top }, u, v) - terrain.heightAt(x, y);
    if (dz > 0) volume += dz * G * G;
  }
  const width = 2 * (deckHalf + CONE.paveMargin);
  const slant = Math.hypot(Math.max(0, reach - CONE.berm), top - axis(reach));
  return { ...at, half, top, reach, height: top - g0, volume, paved: width * slant, sill: width };
}

/** CZK of a cone's paving and toe sill (billed with the bridge) */
export function conePavingCost(c: Pick<AbutmentCone, 'paved' | 'sill'>): number {
  return c.paved * CONE.pavingPerM2 + c.sill * CONE.sillPerM;
}
