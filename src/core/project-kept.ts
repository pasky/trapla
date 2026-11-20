// A rebuilt stretch where its new line still lies on the old road: the old road is KEPT as it is there.
// Nothing is built, so nothing is billed and the design norm does not apply: ČSN 73 6101 covers new roads,
// relocations and rebuilds of the earth body (research/30 §1; the 2004 text, not verified in the 2018 one),
// while a repair keeps the road's line and heights (Decree 104/1997 §9). The norm applies exactly where
// the player builds anew: a bend moved off the old road is a new road's bend.
// The same for a rebuilt railway stretch and its old track (project-railway.ts): a line kept on its old
// track is maintained, not built (ČSN 73 6360-1 is the design norm of new and rebuilt track geometry).
import { STEP, type Design, type Result } from './evaluate';
import type { ReplacementWork } from './project-replacement';
import { PART_KEYS, sumParts, type CostParts } from './cost';
import { KIND } from './structures';
import { buildAlignment, station } from './horizontal';
import { bendRules, horizontalRules } from './data/norms';
import { oldLineWords, type OurLine } from './terms';
import { stationIndex } from './range';

type Pt = { x: number; y: number };
/** An old line: its centreline as one or more polylines (a stretch may claim several pieces of old line). */
export type OldPaths = readonly (readonly Pt[])[];

/** PROVISIONAL game tolerance, m: the new line counts as "on the old road" within this of its centreline.
 * The old line is drawn as bends that stray up to 8 m from it (ui/road-edit.ts FIT_TOLERANCE) plus the
 * rounding of each bend; no cadastral road-land width is known (research/30 §3). */
export const KEPT_TOLERANCE = 12;
/** PROVISIONAL, m: a shorter run on the old road is a new road merely crossing or touching it. */
export const KEPT_MIN_RUN = 50;
/** What the norm asks of a line and its heights (not what the road meets, covers or needs). */
const GEOMETRY: ReadonlySet<string> = new Set(['radius', 'transition', 'arcShort', 'compound', 'gradient', 'crest', 'sag', 'vcOverlap']);

/** Station cells of `r` that lie on the old road (1) or are built anew (0). */
export function keptCells(r: Pick<Result, 'n' | 'x' | 'y' | 'ds'>, olds: OldPaths,
  tolerance = KEPT_TOLERANCE, minRun = KEPT_MIN_RUN): Uint8Array {
  const kept = new Uint8Array(r.n);
  for (let i = 0; i < r.n; i++) {
    let best = Infinity;
    for (const old of olds) for (let k = 1; k < old.length && best > tolerance; k++) {
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

/** The old road where it is drawn: its centreline (`paths`) and the ground (`heightAt`). */
export interface OldRoad { paths: OldPaths; heightAt: (x: number, y: number) => number }
/** The point of the polylines nearest to (x, y), and the direction of the line there. */
function nearestPoint(paths: OldPaths, x: number, y: number) {
  let best = Infinity, px = x, py = y, ux = 1, uy = 0;
  for (const path of paths) for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const qx = a.x + t * dx, qy = a.y + t * dy, d = (qx - x) ** 2 + (qy - y) ** 2;
    if (d < best) { best = d; px = qx; py = qy; const l = Math.hypot(dx, dy) || 1; ux = dx / l; uy = dy / l; }
  }
  return { x: px, y: py, ux, uy };
}
/** The old road is drawn as it lies: on its own line (`old`; the new line may stray up to KEPT_TOLERANCE
 * and still be "kept", which must not show as a moved road), on the ground, as wide as the road, without
 * slopes. Beside a new part the kernel's line and heights (held near the ground there, evaluate.ts
 * OLD_ROAD_TIE) fade into it over TIE_LENGTH. The result gets its own arrays: the kernel's are never changed. */
/** Along kept cells, how far each lies from the nearest cell built anew, m (Infinity: none is). */
function farFromNew(kept: ArrayLike<number>, ds: number): Float64Array {
  const n = kept.length, far = new Float64Array(n).fill(Infinity);
  for (let i = 0, d = Infinity; i < n; i++) { d = kept[i] ? d + ds : 0; far[i] = d; }
  for (let i = n - 1, d = Infinity; i >= 0; i--) { d = kept[i] ? d + ds : 0; far[i] = Math.min(far[i], d); }
  return far;
}
/** Where a point of the line at a kept cell (`far` from the nearest new part) is drawn: on the old line, fading
 * into the line itself over TIE_LENGTH beside a new part. */
function onOld(paths: OldPaths, x: number, y: number, far: number) {
  const w = Math.max(0, 1 - far / TIE_LENGTH), p = nearestPoint(paths, x, y);
  return { x: p.x + w * (x - p.x), y: p.y + w * (y - p.y) };
}
/** A rebuilt stretch's line as it is built and drawn (layOnGround), sampled at `st` (any spacing, along the kernel's
 * alignment): at the kernel's kept cells (`kept`, spacing `ds`) it lies on the old line `old` itself (drawn through
 * the kernel's stations snapped the same way). What other roads cross (the plan line in their networks,
 * project-roadnet.ts): the old road where it is kept, not the line within KEPT_TOLERANCE of it that the kernel
 * designs. Null: nothing is kept. */
export function lineAsDrawn(st: { n: number; s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number> },
  kept: ArrayLike<number>, ds: number, old: OldPaths): { x: Float64Array; y: Float64Array } | null {
  if (!old.some(p => p.length > 1) || !Array.prototype.some.call(kept, Boolean)) return null;
  const far = farFromNew(kept, ds), x = Float64Array.from(st.x), y = Float64Array.from(st.y);
  for (let k = 0; k < st.n; k++) {
    const i = Math.max(0, Math.min(kept.length - 1, Math.round(st.s[k] / ds)));
    if (!kept[i]) continue;
    const p = onOld(old, st.x[k], st.y[k], far[i]);
    x[k] = p.x; y[k] = p.y;
  }
  return { x, y };
}
/** Where another road's crossing lifts or lowers a kept stretch (releaseHeld: `planned` kept, `kept` not), the piece is
 * rebuilt on its old line as it is drawn (lineAsDrawn with `planned`), not on the kernel's line up to KEPT_TOLERANCE off
 * it: that is the line the other road crossed (project-roadnet.ts planLine), so the crossing, the drawing and the bill
 * agree. The kernel then builds the whole stretch on that line (its kept cells too: no jump where a piece rebuilt meets
 * one kept). The move of the kernel's line (EvalOptions.line); undefined: nothing released. */
export function heldOnOldLine(planned: ArrayLike<number>, kept: ArrayLike<number>, ds: number, old: OldPaths) {
  const n = kept.length;
  if (!old.some(p => p.length > 1) || !Array.prototype.some.call(planned, (v: number, i: number) => v && !kept[i])) return undefined;
  const far = farFromNew(planned, ds);
  return (s: number, p: { x: number; y: number; tx: number; ty: number }) => {
    const i = Math.max(0, Math.min(n - 1, Math.round(s / ds)));
    if (!planned[i]) return;
    const w = Math.max(0, 1 - far[i] / TIE_LENGTH), q = nearestPoint(old, p.x, p.y), sign = q.ux * p.tx + q.uy * p.ty < 0 ? -1 : 1;
    const tx = (1 - w) * sign * q.ux + w * p.tx, ty = (1 - w) * sign * q.uy + w * p.ty, l = Math.hypot(tx, ty) || 1;
    p.x = q.x + w * (p.x - q.x); p.y = q.y + w * (p.y - q.y); p.tx = tx / l; p.ty = ty / l;
  };
}
/** `onLine`: the kernel built the stretch on its line as drawn already (heldOnOldLine): only its heights are laid. */
function layOnGround(r: Result, kept: Uint8Array, crownHalf: number, old?: OldRoad, onLine = false) {
  const far = farFromNew(kept, r.ds);
  // The kernel's own bridges and tunnels on kept cells (wholly on them: keepWholeStructures) are not built: the old
  // road lies there as it is, on the ground or on its own old bridge's deck (OldRoad.heightAt), and is drawn so.
  const dropped = r.runs.filter(u => kept[u.i0] && kept[u.i1]);
  const kind = dropped.length ? r.kind.slice() : r.kind, laid = new Uint8Array(r.n);
  for (const u of dropped) for (let i = u.i0; i <= u.i1; i++) { kind[i] = KIND.earth; laid[i] = 1; }
  if (dropped.length) {
    const q = r.quantities, bridges = dropped.filter(u => u.kind === KIND.bridge), tunnels = dropped.filter(u => u.kind === KIND.tunnel);
    const length = (list: typeof dropped) => list.reduce((a, u) => a + u.length, 0);
    Object.assign(r, { kind, runs: r.runs.filter(u => !dropped.includes(u)),
      ...r.cones ? { cones: r.cones.filter(c => !laid[c.i]) } : {},
      ...r.faceL ? { faceL: r.faceL.map((f, i) => laid[i] ? undefined : f) } : {},
      ...r.faceR ? { faceR: r.faceR.map((f, i) => laid[i] ? undefined : f) } : {},
      quantities: { ...q, bridges: q.bridges - bridges.length, bridgeLength: q.bridgeLength - length(bridges),
        tunnels: q.tunnels - tunnels.length, tunnelLength: q.tunnelLength - length(tunnels) } });
  }
  if (old && old.paths.some(p => p.length > 1) && !onLine) {
    const x = r.x.slice(), y = r.y.slice(), tx = r.tx.slice(), ty = r.ty.slice(), ground = r.ground.slice();
    let moved = false;
    for (let i = 0; i < r.n; i++) {
      if (!kept[i]) continue;
      const p = onOld(old.paths, r.x[i], r.y[i], far[i]);
      x[i] = p.x; y[i] = p.y;
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
    // (where the kernel's structure was, the old road's own surface: nothing of the kernel's heights)
    const w = laid[i] ? 0 : Math.max(0, 1 - far[i] / TIE_LENGTH), z = laid[i] ? old?.heightAt(r.x[i], r.y[i]) ?? r.ground[i] : r.ground[i] + w * (r.grade[i] - r.ground[i]);
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

/** Where a rebuilt stretch's planned line (between `a` and `b`, as `design` bends it) stays on its old line
 * (`old`): known before the kernel runs (it depends on the line only), so the kernel builds nothing there
 * (EvalOptions.oldRoad). Null: none of it does. `pis`: the bends the kernel builds, where an old road's own
 * curve (PI.mapped) that no longer lies wholly on the old road is the rules' (Auto): a new road's curve. */
export function plannedKept(a: Pt, b: Pt, design: Pick<Design, 'pis' | 'speed' | 'category'>, old: OldPaths) {
  const plan = (pis: Design['pis']) => {
    const al = buildAlignment(a, b, pis, horizontalRules(design.speed, design.category), bendRules(pis, design.speed, design.category)), st = station(al, STEP);
    return { al, st, kept: keptCells(st, old) };
  };
  let pis = design.pis, p = plan(pis);
  const anew = (k: number) => {
    const c = p.al.curves.find(c => c.index === k);
    if (!c || !(c.sEnd > c.sStart)) return false;
    for (let i = 0; i < p.st.n; i++) if (p.st.s[i] >= c.sStart && p.st.s[i] <= c.sEnd && !p.kept[i]) return true;
    return false;
  };
  const yielded = pis.map((q, k) => q.mapped && q.r !== null && anew(k));
  if (yielded.some(Boolean)) { pis = pis.map((q, k) => yielded[k] ? { ...q, r: null } : q); p = plan(pis); }
  return { kept: p.kept, st: p.st, pis, al: p.al };
}

/** A bridge or tunnel the kernel built partly on kept cells, partly on cells built anew, is built whole: none of it is
 * kept (it is drawn and billed as the kernel built it). One wholly on kept cells is not built (layOnGround). */
function keepWholeStructures(r: Result, kept: Uint8Array) {
  for (const u of r.runs) {
    let some = false, all = true;
    for (let i = u.i0; i <= u.i1; i++) if (kept[i]) some = true; else all = false;
    if (some && !all) kept.fill(0, u.i0, u.i1 + 1);
  }
}

/** Applies "kept as the old road" to a rebuilt stretch's own result: what the norm would ask there becomes
 * a note (`inherited`), houses there are untouched, nothing is billed there (the bill and its per-cell
 * parts cover the new parts only) and the road is drawn on the ground there (`crownHalf`: half its paved
 * width, m). Returns the line that says so in the road's works (no amount; null: nothing kept). */
export function applyKept(r: Result, kept: Uint8Array, crownHalf?: number, old?: OldRoad, line: OurLine = 'road', onLine = false): ReplacementWork | null {
  keepWholeStructures(r, kept);
  let cells = 0, first = -1;
  for (let i = 0; i < r.n; i++) if (kept[i]) { cells++; if (first < 0) first = i; }
  if (!cells) return null;
  r.keptCells = kept;
  const within = (s0: number, s1: number) => {
    const i0 = stationIndex(r, s0), i1 = Math.max(i0, Math.min(r.n - 1, Math.round(s1 / r.ds)));
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
  r.waterCrossings = r.waterCrossings.filter(c => !kept[stationIndex(r, c.s)]);
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
  if (crownHalf !== undefined) layOnGround(r, kept, crownHalf, old, onLine);
  // Nothing is built there, so nothing is billed: the road's bill is what it builds anew. (The kernel
  // designs and prices the whole line; its own arrays are not changed.)
  const parts = {} as CostParts;
  for (const key of PART_KEYS) { const a = r.parts[key].slice(); for (let i = 0; i < r.n; i++) if (kept[i]) a[i] = 0; parts[key] = a; }
  r.parts = parts; r.cost = sumParts(parts);
  let length = 0;
  for (let i = 0; i < r.n; i++) if (kept[i]) length += i === 0 || i === r.n - 1 ? r.ds / 2 : r.ds;
  return { kind: 'kept', s: r.s[first], x: r.x[first], y: r.y[first], length, cost: 0,
    label: `${Math.round(length)} m stay on the ${oldLineWords(line)}: kept as it is, not built anew` };
}
