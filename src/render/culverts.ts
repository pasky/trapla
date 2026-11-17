// Stream culverts in 3D (culvert-geometry.ts places them): the barrel through our embankment along the stream
// (a precast pipe, a precast frame, or a buried bridge's vault), drawn whole but seen only at its ends; at each
// toe a headwall around the opening, cut along the toe as skewed culverts are built, splayed wing walls and a
// paved apron down to the stream bed, the water running out of the opening onto the mapped stream. The slope
// comes down to the headwall's top over the barrel's last metres (where the billed barrel, toe to toe, would
// otherwise stand out of the slope's foot). Built with the settled result's overlays (RouteExtras), never per drag
// frame. The ends' sizes are illustrative: the bill prices two ends per culvert, not their concrete or the few m³
// of earth over them.
import { SIDE_SLOPES } from '../core/data/prices';
import type { CulvertPlan } from './culvert-geometry';
import { EW_KIND } from './terrainMaterial';

type UV = [number, number];
/** headwall: beyond the barrel on each side, above it and its thickness; foundation below the bed; wing walls
 * splayed at 30° from the stream's line, as long as the headwall is high (at least 1.5 m) and 0.3 m thick;
 * the plug of shadow just inside the opening (the slope surface crosses the barrel's inside near the toe) */
const HEAD_SIDE = 0.5, HEAD_TOP = 0.3, HEAD_THICK = 0.4, FOOTING = 0.5;
const WING_SPLAY = Math.PI / 6, WING_MIN = 1.5, WING_THICK = 0.3, PLUG = 0.2;
/** the earth over the barrel's end: its sides as steep as an embankment's (1:1.5) */
const COVER_SIDE = 1.5;
export const CULVERT_COLORS = { concrete: 0xb7b4a9, shade: 0x8b8982, dark: 0x1f1f1d, apron: 0x8f8a7e, water: 0x4a86c0 };

/** the clear opening and the outer shell, as convex polygons around (0, centre) in (across, up from the bed) */
export function culvertProfiles(p: Pick<CulvertPlan, 'shape' | 'width' | 'height' | 'wall'>): { inner: UV[]; outer: UV[]; centre: number; top: number } {
  const w = p.width / 2, t = p.wall;
  if (p.shape === 'pipe') {
    const r = w, R = r + t, n = 20, inner: UV[] = [], outer: UV[] = [];
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + 2 * Math.PI * k / n;
      inner.push([r * Math.cos(a), r + r * Math.sin(a)]); outer.push([R * Math.cos(a), r + R * Math.sin(a)]);
    }
    return { inner, outer, centre: r, top: r + R };
  }
  if (p.shape === 'box') {
    const h = p.height;
    return { inner: [[-w, 0], [w, 0], [w, h], [-w, h]], outer: [[-w - t, -t], [w + t, -t], [w + t, h + t], [-w - t, h + t]], centre: h / 2, top: h + t };
  }
  // a buried bridge: walls of the opening's height under a segmental arch rising a quarter of the span
  const h = p.height, f = p.width / 4, R = (w * w + f * f) / (2 * f), c = h + f - R, n = 10, roof = 0.15;
  const inner: UV[] = [[-w, 0], [w, 0]], outer: UV[] = [[-w - t, -t], [w + t, -t]];
  const a0 = Math.asin(w / R), Ro = R + t + roof, b0 = Math.asin(Math.min(1, (w + t) / Ro));
  for (let k = 0; k <= n; k++) {
    const a = a0 - 2 * a0 * k / n, b = b0 - 2 * b0 * k / n;
    inner.push([R * Math.sin(a), c + R * Math.cos(a)]); outer.push([Ro * Math.sin(b), c + Ro * Math.cos(b)]);
  }
  // the outer walls reach up to the outer arch's springing
  outer.splice(2, 0, [w + t, c + Ro * Math.cos(b0)]); outer.push([-w - t, c + Ro * Math.cos(b0)]);
  inner.splice(2, 0, [w, h]); inner.push([-w, h]);
  return { inner, outer, centre: h / 2, top: c + Ro };
}

/** where a ray from (0, cv) at angle a meets a convex polygon around it */
function rayHit(poly: UV[], cv: number, a: number): UV {
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = Infinity;
  for (let k = 0; k < poly.length; k++) {
    const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % poly.length];
    const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax) * ey - (ay - cv) * ex) / den, u = ((ax) * dy - (ay - cv) * dx) / den;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return [dx * best, cv + dy * best];
}
/** the ring between two convex polygons around (0, cv), as quads matched by angle (every corner of both kept) */
function ring(a: UV[], b: UV[], cv: number): [UV, UV, UV, UV][] {
  const angles = [...a, ...b].map(([u, v]) => Math.atan2(v - cv, u)).sort((x, y) => x - y);
  const out: [UV, UV, UV, UV][] = [];
  for (let k = 0; k < angles.length; k++) {
    const p = angles[k], q = k + 1 < angles.length ? angles[k + 1] : angles[0] + 2 * Math.PI;
    if (q - p < 1e-9) continue;
    out.push([rayHit(a, cv, p), rayHit(a, cv, q), rayHit(b, cv, p), rayHit(b, cv, q)]);
  }
  return out;
}

/** vertex attributes for the earthwork material (terrainMaterial.ts makeEarthworkMaterial): concrete and water as
 * structures (vertex colours), the earth over the ends as fill slope (its texture and contours) */
export interface CulvertMeshData { position: number[]; color: number[]; elev: number[]; ink: number[]; ewKind: number[]; ewGeo: number[] }
/** fill slope's nominal colour (the shader textures it) */
const EARTH = -1;
/**
 * Triangles of the culverts (flat-shaded), in world coordinates through `local`. `natural`: the terrain's height
 * (feet go below it, wing tips come down to it).
 */
export function culvertMeshData(plans: readonly CulvertPlan[], natural: (x: number, y: number) => number,
  local: (x: number, y: number, z: number) => { x: number; y: number; z: number }): CulvertMeshData {
  const out: CulvertMeshData = { position: [], color: [], elev: [], ink: [], ewKind: [], ewGeo: [] };
  const rgb = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255].map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  type P = { x: number; y: number; z: number };
  const tri = (a: P, b: P, c: P, hex: number) => {
    const earth = hex === EARTH, col = rgb(earth ? 0x8aa95a : hex);
    for (const p of [a, b, c]) {
      const v = local(p.x, p.y, p.z);
      out.position.push(v.x, v.y, v.z); out.color.push(col[0], col[1], col[2]); out.elev.push(p.z);
      out.ink.push(earth ? 1 : 0); out.ewKind.push(earth ? EW_KIND.fill : EW_KIND.structure); out.ewGeo.push(-3, -3, 0);
    }
  };
  const quad = (a: P, b: P, c: P, d: P, hex: number) => { tri(a, b, c, hex); tri(b, d, c, hex); };
  for (const plan of plans) {
    const { inner, outer, centre, top } = culvertProfiles(plan);
    const [A, B] = plan.ends;
    // across: one direction for both ends (to the left of A → B)
    const nx = A.oy, ny = -A.ox;
    // (an end is cut along the toe: `along` counts from that skewed line)
    const raw = (E: typeof A, u: number, v: number, d: number): P => ({ x: E.x + nx * u + E.ox * d, y: E.y + ny * u + E.oy * d, z: E.z + v });
    const at = (E: typeof A, u: number, v: number, along = 0): P => raw(E, u, v, along + E.skew * u);
    // the barrel: its outer shell and its dark inside, end to end
    for (let k = 0; k < outer.length; k++) {
      const [u0, v0] = outer[k], [u1, v1] = outer[(k + 1) % outer.length];
      quad(at(A, u0, v0), at(A, u1, v1), at(B, u0, v0), at(B, u1, v1), v0 + v1 > 2 * centre ? CULVERT_COLORS.concrete : CULVERT_COLORS.shade);
    }
    for (let k = 0; k < inner.length; k++) {
      const [u0, v0] = inner[k], [u1, v1] = inner[(k + 1) % inner.length];
      quad(at(A, u0, v0), at(A, u1, v1), at(B, u0, v0), at(B, u1, v1), CULVERT_COLORS.dark);
    }
    const half = Math.max(...outer.map(p => Math.abs(p[0]))) + HEAD_SIDE, headTop = top + HEAD_TOP;
    const wl = plan.shape === 'pipe' ? 0.12 * plan.height : 0.1;
    const waterHalf = plan.shape === 'pipe' ? Math.sqrt(Math.max(0, plan.width * wl - wl * wl)) : Math.min(plan.width - 0.2, Math.max(0.6, plan.width * 0.6)) / 2;
    const wingLen = Math.max(WING_MIN, headTop), ca = Math.cos(WING_SPLAY), sa = Math.sin(WING_SPLAY);
    const tipAlong = wingLen * ca, tipOut = half + wingLen * sa, barrel = Math.hypot(A.x - B.x, A.y - B.y);
    for (const E of plan.ends) {
      // a wing's points from its root at the headwall's end (`along` out from it, `across` from the axis), its
      // outer face `thick` beyond its inner face, square to it
      const wing = (s: number, along: number, across: number, z: number, thick = 0) =>
        raw(E, s * (across + thick * ca), z, E.skew * s * half + along - thick * sa);
      const ground = (p: P) => natural(p.x, p.y) - E.z;
      // the footing goes below the ground anywhere under the headwall and the wings
      const low = Math.min(-plan.wall, ground(at(E, -half, 0)), ground(at(E, half, 0)),
        ground(wing(-1, tipAlong, tipOut, 0)), ground(wing(1, tipAlong, tipOut, 0))) - FOOTING;
      const rect: UV[] = [[-half, low], [half, low], [half, headTop], [-half, headTop]];
      // headwall: its face around the opening, its back around the barrel, top and ends
      for (const [a, b, c, d] of ring(inner, rect, centre)) quad(at(E, ...a), at(E, ...b), at(E, ...c), at(E, ...d), CULVERT_COLORS.concrete);
      for (const [a, b, c, d] of ring(outer, rect, centre)) quad(at(E, ...a, -HEAD_THICK), at(E, ...b, -HEAD_THICK), at(E, ...c, -HEAD_THICK), at(E, ...d, -HEAD_THICK), CULVERT_COLORS.shade);
      quad(at(E, -half, headTop), at(E, half, headTop), at(E, -half, headTop, -HEAD_THICK), at(E, half, headTop, -HEAD_THICK), CULVERT_COLORS.concrete);
      for (const s of [-1, 1]) quad(at(E, s * half, low), at(E, s * half, headTop), at(E, s * half, low, -HEAD_THICK), at(E, s * half, headTop, -HEAD_THICK), CULVERT_COLORS.shade);
      // shadow just inside the opening
      for (let k = 1; k + 1 < inner.length; k++) tri(at(E, ...inner[0], -PLUG), at(E, ...inner[k], -PLUG), at(E, ...inner[k + 1], -PLUG), CULVERT_COLORS.dark);
      // wing walls from the headwall's ends, splayed out over the stream's banks, down to the ground at their tips
      for (const s of [-1, 1]) {
        const tipTop = Math.min(headTop, ground(wing(s, tipAlong, tipOut, 0)) + HEAD_TOP);
        for (const [thick, hex] of [[0, CULVERT_COLORS.concrete], [WING_THICK, CULVERT_COLORS.shade]] as const)
          quad(wing(s, 0, half, low, thick), wing(s, 0, half, headTop, thick), wing(s, tipAlong, tipOut, low, thick), wing(s, tipAlong, tipOut, tipTop, thick), hex);
        quad(wing(s, 0, half, headTop), wing(s, 0, half, headTop, WING_THICK), wing(s, tipAlong, tipOut, tipTop), wing(s, tipAlong, tipOut, tipTop, WING_THICK), CULVERT_COLORS.concrete);
        quad(wing(s, tipAlong, tipOut, low), wing(s, tipAlong, tipOut, tipTop), wing(s, tipAlong, tipOut, low, WING_THICK), wing(s, tipAlong, tipOut, tipTop, WING_THICK), CULVERT_COLORS.shade);
      }
      // the apron between the wings at the bed, its end wall down into the ground, the water over it
      const apron = 0.04, surface = apron + 0.03;
      const tipL = wing(-1, tipAlong, tipOut, apron), tipR = wing(1, tipAlong, tipOut, apron);
      quad(at(E, -half, apron), at(E, half, apron), tipL, tipR, CULVERT_COLORS.apron);
      quad(tipL, tipR, { ...tipL, z: E.z + low }, { ...tipR, z: E.z + low }, CULVERT_COLORS.shade);
      // (on to the apron's end, between its tips)
      const end = (u: number) => { const t = (u + tipOut) / (2 * tipOut); return { x: tipL.x + (tipR.x - tipL.x) * t, y: tipL.y + (tipR.y - tipL.y) * t, z: E.z + surface }; };
      quad(at(E, -waterHalf, wl, -PLUG), at(E, waterHalf, wl, -PLUG), at(E, -waterHalf, Math.max(wl, surface)), at(E, waterHalf, Math.max(wl, surface)), CULVERT_COLORS.water);
      quad(at(E, -waterHalf, surface), at(E, waterHalf, surface), end(-waterHalf), end(waterHalf), CULVERT_COLORS.water);
      // The earth over the barrel's end, behind the headwall: level with its top until our slope (its toe band
      // 1:2.5 rising from the toe, the end cut along it) covers that height, its sides down beside the wings.
      // (it rises with the barrel: the bed climbs or falls along it)
      const other = E === A ? B : A, rise = (other.z - E.z) / Math.max(1, barrel);
      const gain = 1 / (SIDE_SLOPES.fillToe * Math.hypot(1, E.skew)) - rise, coverTop = headTop - 0.05, back = -HEAD_THICK;
      const reach = Math.min(barrel / 2, gain > 0.02 ? (coverTop + 0.5) / gain + 2 : Infinity);
      // (its sides reach a little below the bed: the banks beside a stream's mouth stand above it)
      const bottom = Math.max(low, -0.5);
      const side = (s: number, z: number, along: number) => at(E, s * (half + COVER_SIDE * (coverTop - z)), z - rise * along, along);
      quad(at(E, -half, coverTop - rise * back, back), at(E, half, coverTop - rise * back, back), at(E, -half, coverTop + rise * reach, -reach), at(E, half, coverTop + rise * reach, -reach), EARTH);
      for (const s of [-1, 1]) {
        quad(side(s, coverTop, back), side(s, bottom, back), side(s, coverTop, -reach), side(s, bottom, -reach), EARTH);
        // in front of the side slope, down from the wing's top to the ground at its tip
        const tipTop = Math.min(headTop, ground(wing(s, tipAlong, tipOut, 0)) + HEAD_TOP), foot = Math.max(bottom, tipTop - HEAD_TOP);
        tri(side(s, coverTop, back), wing(s, 0, half, headTop, WING_THICK), side(s, foot, back), EARTH);
        tri(wing(s, 0, half, headTop, WING_THICK), wing(s, tipAlong, tipOut, tipTop, WING_THICK), side(s, foot, back), EARTH);
      }
    }
  }
  return out;
}
