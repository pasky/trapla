// A rebuilt stretch where its new line still lies on the old road: the old road is KEPT as it is there.
// Nothing is built, so nothing is billed and the design norm does not apply: ČSN 73 6101 covers new roads,
// relocations and rebuilds of the earth body (research/30 §1; the 2004 text, not verified in the 2018 one),
// while a repair keeps the road's line and heights (Decree 104/1997 §9). The norm applies exactly where
// the player builds anew: a bend moved off the old road is a new road's bend.
import type { Result } from './evaluate';
import type { ReplacementWork } from './project-replacement';
import { PART_KEYS, sumParts, type CostParts } from './cost';
import { KIND } from './structures';

/** PROVISIONAL game tolerance, m: the new line counts as "on the old road" within this of its centreline.
 * The old line is drawn as bends that stray up to 8 m from it (ui/road-edit.ts FIT_TOLERANCE) plus the
 * rounding of each bend; no cadastral road-land width is known (research/30 §3). */
export const KEPT_TOLERANCE = 12;
/** PROVISIONAL, m: a shorter run on the old road is a new road merely crossing or touching it. */
export const KEPT_MIN_RUN = 50;
/** What the norm asks of a line and its heights (not what the road meets, covers or needs). */
const GEOMETRY: ReadonlySet<string> = new Set(['radius', 'transition', 'arcShort', 'compound', 'gradient', 'crest', 'sag', 'vcOverlap']);

/** Station cells of `r` that lie on the old road (1) or are built anew (0). */
export function keptCells(r: Pick<Result, 'n' | 'x' | 'y' | 'ds'>, old: readonly { x: number; y: number }[],
  tolerance = KEPT_TOLERANCE, minRun = KEPT_MIN_RUN): Uint8Array {
  const kept = new Uint8Array(r.n);
  if (old.length < 2) return kept;
  for (let i = 0; i < r.n; i++) {
    let best = Infinity;
    for (let k = 1; k < old.length && best > tolerance; k++) {
      const a = old[k - 1], b = old[k], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((r.x[i] - a.x) * dx + (r.y[i] - a.y) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(r.x[i] - a.x - t * dx, r.y[i] - a.y - t * dy));
    }
    if (best <= tolerance) kept[i] = 1;
  }
  for (let i = 0; i < r.n; i++) {
    if (!kept[i]) continue;
    let j = i;
    while (j + 1 < r.n && kept[j + 1]) j++;
    if ((j - i) * r.ds < minRun) kept.fill(0, i, j + 1);
    i = j;
  }
  return kept;
}

/** PROVISIONAL, m: where a new part leaves or rejoins the old road, its heights run out into the old
 * road's surface over this length of old road (drawn only; the old road there is still not billed). */
export const TIE_LENGTH = 50;

/** The old road where it is drawn: its centreline (`path`) and the ground (`heightAt`). */
export interface OldRoad { path: readonly { x: number; y: number }[]; heightAt: (x: number, y: number) => number }
/** The point of a polyline nearest to (x, y). */
function nearestPoint(path: readonly { x: number; y: number }[], x: number, y: number) {
  let best = Infinity, px = x, py = y;
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const qx = a.x + t * dx, qy = a.y + t * dy, d = (qx - x) ** 2 + (qy - y) ** 2;
    if (d < best) { best = d; px = qx; py = qy; }
  }
  return { x: px, y: py };
}
/** The old road is drawn as it lies: on its own line (`old`; the new line may stray up to KEPT_TOLERANCE
 * and still be "kept", which must not show as a moved road), on the ground, as wide as the road, without
 * slopes. Beside a new part the kernel's line and heights (held near the ground there, evaluate.ts
 * OLD_ROAD_TIE) fade into it over TIE_LENGTH. The result gets its own arrays: the kernel's are never changed. */
function layOnGround(r: Result, kept: Uint8Array, crownHalf: number, old?: OldRoad) {
  const far = new Float64Array(r.n).fill(Infinity);
  for (let i = 0, d = Infinity; i < r.n; i++) { d = kept[i] ? d + r.ds : 0; far[i] = d; }
  for (let i = r.n - 1, d = Infinity; i >= 0; i--) { d = kept[i] ? d + r.ds : 0; far[i] = Math.min(far[i], d); }
  if (old && old.path.length > 1) {
    const x = r.x.slice(), y = r.y.slice(), tx = r.tx.slice(), ty = r.ty.slice(), ground = r.ground.slice();
    let moved = false;
    for (let i = 0; i < r.n; i++) {
      if (!kept[i]) continue;
      const w = Math.max(0, 1 - far[i] / TIE_LENGTH), p = nearestPoint(old.path, r.x[i], r.y[i]);
      x[i] = p.x + w * (r.x[i] - p.x); y[i] = p.y + w * (r.y[i] - p.y);
      if (x[i] !== r.x[i] || y[i] !== r.y[i]) { moved = true; ground[i] = old.heightAt(x[i], y[i]); }
    }
    if (moved) {
      for (let i = 0; i < r.n; i++) {
        if (!kept[i] && !(i > 0 && kept[i - 1]) && !(i + 1 < r.n && kept[i + 1])) continue;
        const a = Math.max(0, i - 1), b = Math.min(r.n - 1, i + 1), dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy);
        if (l > 1e-9) { tx[i] = dx / l; ty[i] = dy / l; }
      }
      Object.assign(r, { x, y, tx, ty, ground });
    }
  }
  const grade = r.grade.slice(), cut = r.cut.slice(), fill = r.fill.slice();
  const dayL = r.dayL.slice(), dayR = r.dayR.slice(), zDayL = r.zDayL.slice(), zDayR = r.zDayR.slice();
  // (no retaining wall is built along the old road either: its slope edges are natural ground again)
  const wallSurfaceL = r.wallSurfaceL.slice(), wallSurfaceR = r.wallSurfaceR.slice();
  for (let i = 0; i < r.n; i++) {
    if (!kept[i] || r.kind[i] !== KIND.earth) continue;
    wallSurfaceL[i] = NaN; wallSurfaceR[i] = NaN;
    const w = Math.max(0, 1 - far[i] / TIE_LENGTH), z = r.ground[i] + w * (r.grade[i] - r.ground[i]);
    grade[i] = z; cut[i] *= w; fill[i] *= w;
    dayL[i] = crownHalf + w * (r.dayL[i] - crownHalf); dayR[i] = crownHalf + w * (r.dayR[i] - crownHalf);
    zDayL[i] = z + w * (r.zDayL[i] - r.grade[i]); zDayR[i] = z + w * (r.zDayR[i] - r.grade[i]);
  }
  Object.assign(r, { grade, cut, fill, dayL, dayR, zDayL, zDayR, wallSurfaceL, wallSurfaceR,
    retainingWalls: r.retainingWalls.filter(w => !(kept[w.i] && r.kind[w.i] === KIND.earth)) });
}

/** PROVISIONAL, m: room for the vertical curves at either end of a ramp (70 km/h: crest 2 500 m, sag
 * 1 500 m; a 6 % change of grade takes 150 m and 90 m of curve, half of each beyond the ramp). */
export const HELD_APPROACH = 100;
/** Where a higher-ranking road's crossing takes this road off its old height (onto its bridge over that
 * road, or down under that road's bridge), the road is rebuilt there with its ramps: those cells are not
 * kept. `holds` as EvalOptions.holds; `ground`: the old road's surface at a cell; `tie`: how far a hold
 * may be from it and still be the old road as it lies. */
export function releaseHeld(kept: Uint8Array, s: ArrayLike<number>, ground: (i: number) => number,
  holds: readonly { s: number; min: number; max: number; bridge?: [number, number] }[], maxGradient: number, tie: number): void {
  const n = kept.length; if (n < 2) return;
  const ds = s[1] - s[0];
  for (const h of holds) {
    const i = Math.max(0, Math.min(n - 1, Math.round(h.s / ds))), g = ground(i);
    const rise = Math.max(h.min - g, g - h.max, 0);
    if (!h.bridge && !(rise > tie)) continue;
    const reach = (h.bridge ? (h.bridge[1] - h.bridge[0]) / 2 : 0) + rise / Math.max(0.01, maxGradient) + HELD_APPROACH;
    for (let k = 0; k < n; k++) if (Math.abs(s[k] - h.s) <= reach) kept[k] = 0;
  }
}

/** Applies "kept as the old road" to a rebuilt stretch's own result: what the norm would ask there becomes
 * a note (`inherited`), houses there are untouched, nothing is billed there (the bill and its per-cell
 * parts cover the new parts only) and the road is drawn on the ground there (`crownHalf`: half its paved
 * width, m). Returns the line that says so in the road's works (no amount; null: nothing kept). */
export function applyKept(r: Result, kept: Uint8Array, crownHalf?: number, old?: OldRoad): ReplacementWork | null {
  let cells = 0, first = -1;
  for (let i = 0; i < r.n; i++) if (kept[i]) { cells++; if (first < 0) first = i; }
  if (!cells) return null;
  r.keptCells = kept;
  const within = (s0: number, s1: number) => {
    const i0 = Math.max(0, Math.min(r.n - 1, Math.round(s0 / r.ds))), i1 = Math.max(i0, Math.min(r.n - 1, Math.round(s1 / r.ds)));
    for (let i = i0; i <= i1; i++) if (!kept[i]) return false;
    return true;
  };
  // What the norm would ask of a new line there is a note about the old road; any other finding wholly on
  // a kept part (a crossing, a slope, a house, noise) is about works that are not built.
  const moot = r.violations.filter(v => !v.goal && v.kind !== 'oob' && within(v.s0, v.s1));
  if (moot.length) {
    const inherited = moot.filter(v => GEOMETRY.has(v.kind));
    if (inherited.length) r.inherited = inherited;
    r.violations = r.violations.filter(v => !moot.includes(v));
    r.geomViolations = r.violations.filter(v => !v.goal).length; r.valid = r.violations.length === 0;
  }
  // the old road's junctions, culverts and edges stay as they are
  r.crossings = r.crossings.filter(c => !kept[c.i]);
  r.footprintConflicts = r.footprintConflicts.filter(f => !kept[f.i]);
  r.waterCrossings = r.waterCrossings.filter(c => !kept[Math.max(0, Math.min(r.n - 1, Math.round(c.s / r.ds)))]);
  // houses beside a kept part: nothing is built there, so none is removed and no new noise decision is made
  const gone = new Set([...r.demolished.filter(b => kept[b.i]), ...r.boughtOut.filter(b => kept[b.i] && b.reason !== 'manual')].map(b => b.j));
  const beside = new Set([...gone, ...r.noise.receivers.filter(p => kept[p.i]).map(p => p.j)]);
  if (beside.size) {
    r.demolished = r.demolished.filter(b => !gone.has(b.j)); r.boughtOut = r.boughtOut.filter(b => !gone.has(b.j));
    r.noise = { ...r.noise, receivers: r.noise.receivers.filter(p => !beside.has(p.j) || r.boughtOut.some(b => b.j === p.j)) };
    r.quantities = { ...r.quantities, buildingsHit: r.demolished.length, hitBuildings: r.demolished.map(b => b.j), noiseBuyouts: r.boughtOut.length };
    r.besideOldRoad = [...beside].filter(j => !r.boughtOut.some(b => b.j === j));
  }
  // noise walls that would stand wholly along a kept part are not built
  r.walls = r.walls.filter(w => { for (let i = w.i0; i <= w.i1; i++) if (!kept[i]) return true; return false; });
  if (crownHalf !== undefined) layOnGround(r, kept, crownHalf, old);
  // Nothing is built there, so nothing is billed: the road's bill is what it builds anew. (The kernel
  // designs and prices the whole line; its own arrays are not changed.)
  const parts = {} as CostParts;
  for (const key of PART_KEYS) { const a = r.parts[key].slice(); for (let i = 0; i < r.n; i++) if (kept[i]) a[i] = 0; parts[key] = a; }
  r.parts = parts; r.cost = sumParts(parts);
  let length = 0;
  for (let i = 0; i < r.n; i++) if (kept[i]) length += i === 0 || i === r.n - 1 ? r.ds / 2 : r.ds;
  return { kind: 'kept', s: r.s[first], x: r.x[first], y: r.y[first], length, cost: 0,
    label: `${Math.round(length)} m stay on the old road: kept as it is, not built anew` };
}
