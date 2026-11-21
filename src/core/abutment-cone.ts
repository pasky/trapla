// Where a fill meets a bridge (playtest sweep 3, P1 #4; research/68). The abutment stands on top of the fill and
// the fill runs on in front of it, under the bridge's end span, as a cone sloped 1:1.5 down to the ground, with
// quarter cones round the wing ends meeting the fill's side slopes; a berm of at least 0.6 m in front of the
// abutment, the slope paved under the deck and ending at a concrete toe sill (MD ČR VL 4 Mosty 2021 sheets 204.02,
// 206.02, 206.03; the D5 Rokycany SO 201 bill of quantities bills the "svahové kužele" as quarter cones inside the
// bridge object). The bridge's first pier stands beyond the cone's toe, so its end span reaches past it.
import type { Terrain } from './terrain';
import { retainingAssembly } from './data/remedies';

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
  /** the highest fill an abutment closes off with a wall (a closed abutment, no cone) where a cone would cover what
   * lies under the bridge, m (French SETRA practice: "une culée remblayée … pour une hauteur limitée à une dizaine de
   * mètres", research/68 §1.4, UNVERIFIED, secondary). Above it Auto's bridge goes on instead (support-layout.ts);
   * where it cannot, the cone stands and what it covers is a problem (footprint.ts). */
  closedMax: 10,
  /** the grid the cone's volume is summed on, m */
  grid: 2,
  /** the rows its ground is screened in, m (coneGround) */
  rowLength: 4,
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
  /** how far the fill lies over the ground, m: along the axis from the abutment, and off the axis either side (a
   * cross slope carries it further on its low side); what is drawn (inside the other end's cone where the two meet,
   * hidden by it) */
  length: number; side: number;
  /** fill, m³; paving, m²; toe sill, m */
  volume: number; paved: number; sill: number;
  /** a road's end raised with its junction (core/junction-raise.ts): the fill round the node, its top the road's own
   * level, no deck over it (nothing paved, no sill billed) */
  end?: true;
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

/** where along the bridge (m from its start) the cones at its two ends, whose tops are `topA` and `topB`, meet
 * on the axis of a bridge `length` m long */
export function conesMeet(topA: number, topB: number, length: number): number {
  return Math.max(0, Math.min(length, (length + CONE.slope * (topA - topB)) / 2));
}

/** whether a fill whose road is at `grade` stands above the ground at the abutment by enough for a cone (else the
 * abutment is set into a bank: no fill in front of it) */
export function coneStands(terrain: Terrain, at: { x: number; y: number }, grade: number): boolean {
  return grade - CONE.deckDepth - terrain.heightAt(at.x, at.y) >= 0.5;
}

/** the surface of a cone at a point of the map (its own frame; -Infinity behind its abutment) */
function surfaceAt(c: Pick<AbutmentCone, 'x' | 'y' | 'tx' | 'ty' | 'half' | 'top'>, x: number, y: number): number {
  const dx = x - c.x, dy = y - c.y, u = dx * c.tx + dy * c.ty;
  return u < 0 ? -Infinity : coneSurface(c, u, -dx * c.ty + dy * c.tx);
}

/** The cone at a bridge end. `at`: the abutment (the bridge's end) and the direction into the bridge; `grade`:
 * the road's height there; `half`: half the crest width; `deckHalf`: half the deck width. `limit`: the bridge's
 * length (it goes no further). `rival`: the cone at the bridge's other end, where there is one: where the two
 * meet each fill counts only where its surface is the higher (their union, no fill counted twice), its paving
 * ends where they meet on the axis and there is no toe sill. Null where the ground is at the cone's top (an
 * abutment set into a bank: no fill in front of it, coneStands). */
export function abutmentCone(terrain: Terrain, at: { s: number; x: number; y: number; tx: number; ty: number; i: number; earthCell: number },
  grade: number, half: number, deckHalf: number, limit = 300, rival?: Pick<AbutmentCone, 'x' | 'y' | 'tx' | 'ty' | 'half' | 'top'>): AbutmentCone | null {
  if (!coneStands(terrain, at, grade)) return null;
  const top = grade - CONE.deckDepth, g0 = terrain.heightAt(at.x, at.y);
  const axis = (u: number) => terrain.heightAt(at.x + at.tx * u, at.y + at.ty * u);
  // (on the axis: where it meets the ground, or the other cone)
  const meet = rival ? conesMeet(top, rival.top, Math.hypot(rival.x - at.x, rival.y - at.y)) : limit;
  const met = coneReach(top, axis, Math.min(limit, meet)), reach = Math.min(limit, meet, met);
  // the volume over the ground on a grid in front of the abutment (u along, v across), row by row and outwards
  // from the axis until the cone meets the ground (also where a cross slope carries it further than on the axis);
  // the last row may be cut short by the bridge's far end
  const G = CONE.grid, edge = half + CONE.berm, end = Math.min(limit, 300);
  let volume = 0, length = 0, side = 0;
  for (let u0 = 0; u0 < end; u0 += G) {
    const du = Math.min(G, end - u0), u = u0 + du / 2;
    let any = false;
    for (const sgn of [-1, 1]) for (let v = G / 2; v < 300; v += G) {
      const x = at.x + at.tx * u - at.ty * v * sgn, y = at.y + at.ty * u + at.tx * v * sgn;
      const z = coneSurface({ half, top }, u, v), dz = z - terrain.heightAt(x, y);
      if (dz > 0) {
        any = true; side = Math.max(side, v + G / 2);
        if (!rival || z >= surfaceAt(rival, x, y)) volume += dz * du * G;
      } else if (v > edge) break;
    }
    if (any) length = u0 + du;
    else if (u > reach) break;
  }
  const width = 2 * (deckHalf + CONE.paveMargin);
  const run = Math.max(0, reach - CONE.berm), slant = Math.hypot(run, run / CONE.slope);
  // (two cones meeting under a short bridge: no toe sill between them)
  return { ...at, half, top, reach, height: top - g0, volume, paved: width * slant, sill: met >= Math.min(limit, meet) ? 0 : width, length, side };
}

/** A bridge end of a route, as its cone and its wall read it: the abutment (the bridge's end at `s`) and the direction
 * into the bridge (`into` along the route), the cone's top (the road there, linear between the stations, less the deck)
 * and the ground there. One reading for the choice of the end (support-layout.ts), its wall and the screen of its
 * cone's ground (footprint.ts). */
export interface BridgeEnd { s: number; into: number; x: number; y: number; tx: number; ty: number; top: number; ground: number }
export function bridgeEnd(terrain: Terrain, r: { n: number; ds: number; s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>;
  tx: ArrayLike<number>; ty: ArrayLike<number>; grade: ArrayLike<number> }, s: number, into: number): BridgeEnd {
  const j = Math.max(0, Math.min(r.n - 2, Math.floor(s / r.ds))), t = Math.max(0, Math.min(1, (s - r.s[j]) / r.ds));
  const tx = r.tx[j] * (1 - t) + r.tx[j + 1] * t, ty = r.ty[j] * (1 - t) + r.ty[j + 1] * t, len = (Math.hypot(tx, ty) || 1) * Math.sign(into);
  const x = r.x[j] * (1 - t) + r.x[j + 1] * t, y = r.y[j] * (1 - t) + r.y[j + 1] * t;
  return { s, into: Math.sign(into), x, y, tx: tx / len, ty: ty / len, top: r.grade[j] * (1 - t) + r.grade[j + 1] * t - CONE.deckDepth, ground: terrain.heightAt(x, y) };
}

/** The ground a cone covers, in its own frame: rows CONE.rowLength m long from the abutment (`u0`…`u1` along the
 * direction into the bridge), each with how far the cone lies over the ground to the left and the right of its axis, m
 * (the cone's surface at the row's start, the highest, over the lower of the ground at its two ends; a cross slope carries
 * it further on its low side). Out to where it meets the ground on the axis and no row is above it, at most `limit` m (the
 * bridge's length); none where the ground is at its top (coneStands). What support-layout.ts keeps clear of what nothing
 * moves aside, and footprint.ts screens (a minor way there is moved aside, as under an abutment): the surface
 * abutmentCone bills and the 3D view draws. */
export function coneGround(terrain: Terrain, e: BridgeEnd, half: number, limit = 300): { u0: number; u1: number; left: number; right: number }[] {
  if (e.top - e.ground < 0.5) return [];
  const G = CONE.rowLength, edge = half + CONE.berm, rows: { u0: number; u1: number; left: number; right: number }[] = [];
  const reach = coneReach(e.top, u => terrain.heightAt(e.x + e.tx * u, e.y + e.ty * u), limit);
  for (let u0 = 0; u0 < limit; u0 += G) {
    const u1 = Math.min(limit, u0 + G), side = [0, 0];
    for (const [k, sgn] of [[0, 1], [1, -1]] as const) for (let v = 0.5; v < 300; v += 1) {
      const nx = -e.ty * v * sgn, ny = e.tx * v * sgn;
      const g = Math.min(terrain.heightAt(e.x + e.tx * u0 + nx, e.y + e.ty * u0 + ny), terrain.heightAt(e.x + e.tx * u1 + nx, e.y + e.ty * u1 + ny));
      if (coneSurface({ half, top: e.top }, u0, v) > g) side[k] = v + 0.5;
      else if (v > edge) break;
    }
    if (side[0] || side[1]) rows.push({ u0, u1, left: side[0], right: side[1] });
    else if (u0 > reach) break;
  }
  return rows;
}

/** Whether a cone lies over the ground at a point of the map (`grow` > 0: or within `grow` m of where it does, its
 * surface grown by that much out over the ground: a working strip round it). `length`: how far it goes into the bridge. */
export function coneCovers(c: Pick<AbutmentCone, 'x' | 'y' | 'tx' | 'ty' | 'half' | 'top'>, length: number, grow: number,
  heightAt: (x: number, y: number) => number): (x: number, y: number) => boolean {
  return (x, y) => {
    const dx = x - c.x, dy = y - c.y, u = dx * c.tx + dy * c.ty;
    if (u < -grow || u > length + grow) return false;
    return coneSurface(c, Math.max(0, u), -dx * c.ty + dy * c.tx) + grow / CONE.slope > heightAt(x, y);
  };
}

/** A closed abutment (no cone, CONE.closedMax): the fill ends in a wall from the cone's top (`height` m above the
 * ground) down to the ground, across the fill's whole end section: full height under the crest (`crownWidth`), falling
 * with the 1:1.5 side slopes to nothing at their toes (the drawn end face). Billed as a cantilever retaining wall of the
 * height it has at each point (data/remedies.ts retainingAssembly: OTSKP April 2026 items, research/18; the wall's
 * shape PROVISIONAL, research/68 §1.4), on top of the abutment the bridge price already holds. */
export function closedEndWall(height: number, crownWidth: number): { height: number; area: number; cost: number } {
  if (!(height > 0)) return { height: 0, area: 0, cost: 0 };
  const side = CONE.slope * height, steps = 20;
  let cost = crownWidth * retainingAssembly(height).perM;
  for (let k = 0; k < steps; k++) cost += 2 * side / steps * retainingAssembly(height * (1 - (k + 0.5) / steps)).perM;
  return { height, area: crownWidth * height + side * height, cost };
}

/** CZK of a cone's paving and toe sill (billed with the bridge) */
export function conePavingCost(c: Pick<AbutmentCone, 'paved' | 'sill'>): number {
  return c.paved * CONE.pavingPerM2 + c.sill * CONE.sillPerM;
}
