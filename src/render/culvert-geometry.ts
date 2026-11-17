// Where a stream culvert under our embankment stands, as drawn: its barrel from the slope's toe on one side to
// the toe on the other, along the stream, at the stream bed. Display only: the bill prices the barrel's length
// (our footprint across the stream's line, research/17-stream-crossings.md) and two ends; this places that barrel on the drawn
// slopes (the toe lines between the engine's daylight points, earthwork-surface.ts) so its ends meet the ground
// where the mapped stream leaves the embankment.
import type { Result } from '../core/evaluate';
import { CULVERT_RULES } from '../core/data/culverts';
import { KIND } from '../core/structures';
import type { WaterNet, WaterReach, WaterResult } from '../core/watercourses';

/** one end of the barrel: on the toe line, at the ground there (the stream's bed); `ox, oy` points out of the
 * embankment along the barrel; `skew`: the end is cut along the toe (parallel to our road, as skewed culverts are
 * built), outwards by `skew` m per m across the barrel (to its left looking from the first end to the second),
 * at most 45° */
export interface CulvertEnd { x: number; y: number; z: number; ox: number; oy: number; skew: number }
export interface CulvertPlan {
  /** the crossing's station and stream (Result.waterCrossings) */
  s: number; id: number;
  /** precast pipe, precast frame, or a buried bridge (a concrete vault cast in place under a high fill) */
  shape: 'pipe' | 'box' | 'vault';
  /** clear opening, m (a vault: its span and the height of its walls; the arch rises above them) */
  width: number; height: number;
  /** concrete around the opening, m */
  wall: number;
  ends: [CulvertEnd, CulvertEnd];
}

/**
 * Shell thicknesses, illustrative (the bill prices metres of barrel by size, not concrete): a precast pipe
 * ≈ 0.15 m, a precast frame ≈ 0.2 m; a buried bridge's walls are the billed 0.25 m (CULVERT_RULES.buriedWall)
 * of its plan width, at least the billed smallest span.
 */
const PIPE_WALL = 0.15, FRAME_WALL = 0.2;

/** the barrel's shape and size from what is billed */
export function culvertSection(size: NonNullable<WaterResult['size']>): Pick<CulvertPlan, 'shape' | 'width' | 'height' | 'wall'> {
  if (size.type === 'pipe') return { shape: 'pipe', width: size.width, height: size.width, wall: PIPE_WALL };
  if (!size.buried) return { shape: 'box', width: size.width, height: size.height, wall: FRAME_WALL };
  // billed plan: (clear span + 2 walls), at least the smallest span (data/culverts.ts)
  const plan = Math.max(CULVERT_RULES.buriedMinSpan, size.width + 2 * CULVERT_RULES.buriedWall);
  return { shape: 'vault', width: plan - 2 * CULVERT_RULES.buriedWall, height: size.height, wall: CULVERT_RULES.buriedWall };
}

type Route = Pick<Result, 'n' | 'x' | 'y' | 'tx' | 'ty' | 'kind' | 'dayL' | 'dayR'>;

/** Inside our earthworks as drawn: in one of the quads between two earthwork stations' daylight points. */
function insideEarthworks(r: Route, i0: number, i1: number, x: number, y: number): boolean {
  for (let i = Math.max(0, i0); i < Math.min(r.n - 1, i1); i++) {
    if (r.kind[i] !== KIND.earth || r.kind[i + 1] !== KIND.earth) continue;
    const corner = (k: number, side: number) => {
      const off = side > 0 ? r.dayL[k] : -r.dayR[k];
      return [r.x[k] - r.ty[k] * off, r.y[k] + r.tx[k] * off];
    };
    const q = [corner(i, 1), corner(i + 1, 1), corner(i + 1, -1), corner(i, -1)];
    let inside = false;
    for (let a = 0, b = 3; a < 4; b = a++) {
      const [xa, ya] = q[a], [xb, yb] = q[b];
      if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

const reachIndex = new WeakMap<WaterNet, Map<number, WaterReach>>();
function reachOf(water: WaterNet | undefined, id: number): WaterReach | undefined {
  if (!water || id < 0) return undefined;
  let index = reachIndex.get(water);
  if (!index) reachIndex.set(water, index = new Map(water.data.reaches.map(w => [w.id, w])));
  return index.get(id);
}

/** A path out of the crossing point: along the mapped stream (`dir` +1 downstream of its points, −1 up), or a
 * straight line. Returns the point `d` metres along it, or null past its end. */
type Path = (d: number) => { x: number; y: number } | null;
function streamPath(w: WaterReach, x: number, y: number, dir: number): Path {
  // the segment the crossing lies on (the nearest)
  let j = 0, best = Infinity;
  for (let k = 0; k + 1 < w.points.length; k++) {
    const [ax, ay] = w.points[k], [bx, by] = w.points[k + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)), e = Math.hypot(ax + t * dx - x, ay + t * dy - y);
    if (e < best) { best = e; j = k; }
  }
  // distances along the reach from the crossing to each vertex in the walking direction
  const verts: [number, number][] = [[x, y]];
  if (dir > 0) for (let k = j + 1; k < w.points.length; k++) verts.push([w.points[k][0], w.points[k][1]]);
  else for (let k = j; k >= 0; k--) verts.push([w.points[k][0], w.points[k][1]]);
  const cum = [0];
  for (let k = 1; k < verts.length; k++) cum.push(cum[k - 1] + Math.hypot(verts[k][0] - verts[k - 1][0], verts[k][1] - verts[k - 1][1]));
  return (d) => {
    if (d > cum[cum.length - 1]) return null;
    let k = 1;
    while (k < cum.length - 1 && cum[k] < d) k++;
    const span = cum[k] - cum[k - 1] || 1, t = (d - cum[k - 1]) / span;
    return { x: verts[k - 1][0] + t * (verts[k][0] - verts[k - 1][0]), y: verts[k - 1][1] + t * (verts[k][1] - verts[k - 1][1]) };
  };
}
const straightPath = (x: number, y: number, tx: number, ty: number): Path => (d) => ({ x: x + tx * d, y: y + ty * d });

/** where a path first leaves our earthworks (to 5 cm), or null if it does not within `reach` m */
function exit(path: Path, inside: (x: number, y: number) => boolean, reach: number): { x: number; y: number } | null {
  const step = 0.5;
  let lo = 0;
  for (let d = step; d <= reach; d += step) {
    const p = path(d);
    if (!p) return null;
    if (inside(p.x, p.y)) { lo = d; continue; }
    let hi = d;
    while (hi - lo > 0.05) { const mid = (lo + hi) / 2, q = path(mid)!; if (inside(q.x, q.y)) lo = mid; else hi = mid; }
    return path(hi);
  }
  return null;
}

/**
 * The culverts of a result as drawn: each billed pipe / frame / buried bridge (WaterResult.size), its ends
 * where the mapped stream leaves our embankment (else where the stream's line at the crossing does), at the
 * ground there. `natural`: the terrain's height.
 */
export function culvertPlans(r: Route & Pick<Result, 'waterCrossings' | 'ds'>, water: WaterNet | undefined,
  natural: (x: number, y: number) => number): CulvertPlan[] {
  const out: CulvertPlan[] = [];
  for (const c of r.waterCrossings) {
    if (!c.size || (c.structure !== 'pipe' && c.structure !== 'box')) continue;
    const i = Math.max(0, Math.min(r.n - 1, c.i));
    // the billed barrel's direction: the channel's at the crossing (a raster stream: square to ours, as billed)
    const cos = Math.sqrt(Math.max(0, 1 - c.sine ** 2));
    const tx = c.channelTx ?? r.tx[i] * cos - r.ty[i] * c.sine, ty = c.channelTy ?? r.ty[i] * cos + r.tx[i] * c.sine;
    const reach = Math.max(60, 3 * c.length), cells = Math.ceil(reach / r.ds) + 2;
    const inside = (x: number, y: number) => insideEarthworks(r, i - cells, i + cells, x, y);
    const w = reachOf(water, c.id);
    const ends = ([1, -1] as const).map(dir => (w && exit(streamPath(w, c.x, c.y, dir), inside, reach))
      || exit(straightPath(c.x, c.y, tx * dir, ty * dir), inside, reach));
    if (!ends[0] || !ends[1]) continue;
    const [a, b] = ends as { x: number; y: number }[], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const ux = (a.x - b.x) / len, uy = (a.y - b.y) / len, nx = uy, ny = -ux;
    // our road's direction at an end, in the barrel's terms: along = skew × across
    const skew = (p: { x: number; y: number }, ox: number, oy: number) => {
      let k = i, best = Infinity;
      for (let j = Math.max(0, i - cells); j < Math.min(r.n, i + cells); j++) { const d = (r.x[j] - p.x) ** 2 + (r.y[j] - p.y) ** 2; if (d < best) { best = d; k = j; } }
      const along = r.tx[k] * ox + r.ty[k] * oy, across = r.tx[k] * nx + r.ty[k] * ny;
      return Math.max(-1, Math.min(1, along / (Math.abs(across) > 1e-6 ? across : 1e-6)));
    };
    out.push({ s: c.s, id: c.id, ...culvertSection(c.size), ends: [
      { x: a.x, y: a.y, z: natural(a.x, a.y), ox: ux, oy: uy, skew: skew(a, ux, uy) },
      { x: b.x, y: b.y, z: natural(b.x, b.y), ox: -ux, oy: -uy, skew: skew(b, -ux, -uy) }] });
  }
  return out;
}
