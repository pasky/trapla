// Windowed drag preview for long routes. A drag changes the route only locally: a moved bend changes the
// plan between its neighbours' curves, a moved height pin the grade line near it. The preview then
// re-solves only that stretch plus a margin (the grade continuing the last full result's line at both
// window ends) and takes everything else from the last full result, shifted by the change of length.
// The cost of a preview so follows the size of the edit, not the length of the route.
//
// A preview is never a score: the full evaluation that follows the pause is unchanged and exact.
// Anything this cannot map (another category, overrides changed, no full result yet, or a window over
// most of the route) returns null and the caller runs the ordinary whole-route preview.

import { sumParts, PART_KEYS, type CostParts } from './cost';
import { speedNorms, horizontalRules } from './data/norms';
import { buildAlignment, station, type CurveInfo, type Stationing } from './horizontal';
import type { Run } from './structures';
import type { Terrain } from './terrain';
import { buildProfile, elevations, type VPI } from './vertical';
import type { Design, EvalContext, EvalOptions, Result } from './evaluate';

/** re-solved beyond the changed stretch on each side, m (the auto-profile knots are 250 m apart) */
export const WINDOW_MARGIN = 1500;
/** a window over more than this share of the route is no cheaper than the whole-route preview */
const WINDOW_MAX_SHARE = 0.6;
/** plan positions closer than this to the last full result count as unchanged, m (chord of a 10 m
 * station step on a 500 m curve: 2.5 cm) */
const SAME_PLAN = 0.2;
const STEP = 10;
let enabled = true;
/** Benchmarks and tests: compare against the whole-route preview. */
export function setPreviewWindows(on: boolean): void { enabled = on; }

/** the stations of [s0, s1] (both on the stationing) re-based to start at 0 */
export function stationWindow(st: Stationing, s0: number, s1: number): Stationing {
  const i0 = Math.round(s0 / st.ds), i1 = Math.round(s1 / st.ds), n = i1 - i0 + 1;
  const out: Stationing = { n, ds: st.ds, s: new Float64Array(n), x: st.x.slice(i0, i1 + 1), y: st.y.slice(i0, i1 + 1),
    tx: st.tx.slice(i0, i1 + 1), ty: st.ty.slice(i0, i1 + 1) };
  for (let i = 0; i < n; i++) out.s[i] = st.s[i0 + i] - st.s[i0];
  return out;
}

interface FullEntry { key: string; design: Design; result: Result }
const fullResults = new WeakMap<Terrain, FullEntry[]>();
/** full results kept per terrain (several routes of one project, both directions of a motorway) */
const KEEP = 6;

/** Everything except the plan and the grade inputs must match for a full result to stand in. */
function lineageKey(ctx: EvalContext, d: Design, opts: EvalOptions): string {
  return JSON.stringify([ctx.a, ctx.b, d.category, d.speed, d.profileMode, d.structureOverrides ?? [], d.crossingOverrides ?? [],
    d.buildingOverrides ?? [], d.wallOverrides ?? [], d.objectData ?? null, opts.endpointElevations ?? null, opts.goals ?? null,
    opts.operatingSpeed ?? null, opts.capacityTraffic ?? null, opts.railTraffic ?? null]);
  // Not keyed: a split direction's joined ranges follow its plan, and its preview prices crossings the
  // full evaluation shares with the other direction (window only).
}

export function rememberFull(ctx: EvalContext, d: Design, opts: EvalOptions, result: Result): void {
  let list = fullResults.get(ctx.terrain);
  if (!list) fullResults.set(ctx.terrain, list = []);
  result.lineage = { key: lineageKey(ctx, d, opts), design: structuredClone(d) };
  adoptFull(ctx.terrain, result);
}

/** What a windowed preview takes from a full result: without crossing geometry, noise maps, remedies
 * and building lists, which no preview shows (keeps the full worker → preview worker message small). */
export function previewBase(r: Result): Result {
  return { ...r, crossings: r.crossings.map(({ geometry: _g, ...c }) => c), waterCrossings: [], footprintConflicts: [], retainingWalls: [],
    walls: [], demolished: [], boughtOut: [], kept: [], noise: { receivers: [], footprint: null } };
}

/** A full result evaluated elsewhere (the full worker) becomes a base for windowed previews here. */
export function adoptFull(terrain: Terrain, result: Result): void {
  if (!result.lineage || result.preview) return;
  let list = fullResults.get(terrain);
  if (!list) fullResults.set(terrain, list = []);
  const { key, design } = result.lineage;
  // The newest full result of a lineage replaces its predecessor.
  const at = list.findIndex(e => e.key === key);
  if (at >= 0) list.splice(at, 1);
  list.unshift({ key, design, result });
  if (list.length > KEEP) list.length = KEEP;
}

/** value of a per-station array of `r` at chainage s (linear between stations, clamped) */
function at(r: Result, values: ArrayLike<number>, s: number): number {
  const x = Math.max(0, Math.min(r.n - 1, s / r.ds)), i = Math.min(r.n - 2, Math.floor(x)), t = x - i;
  return r.n < 2 ? values[0] : values[i] + (values[i + 1] - values[i]) * t;
}
const nearest = (r: Result, s: number) => Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));

/** chainage range whose inputs changed between the full result's design and `d`, or null if unmappable */
function changedRange(base: FullEntry, d: Design, st: Stationing, length: number, curves: readonly CurveInfo[]): [number, number] | null {
  const r = base.result, shift = length - r.length;
  let a = Infinity, b = -Infinity;
  for (let i = 0; i < st.n; i++) {
    const s = st.s[i];
    if (s > r.length || Math.hypot(st.x[i] - at(r, r.x, s), st.y[i] - at(r, r.y, s)) > SAME_PLAN) { a = s; break; }
  }
  if (a < Infinity) for (let i = st.n - 1; i >= 0; i--) {
    const s = st.s[i], old = s - shift;
    if (old < 0 || Math.hypot(st.x[i] - at(r, r.x, old), st.y[i] - at(r, r.y, old)) > SAME_PLAN) { b = s; break; }
  }
  // Grade inputs in the route's own chainage: pins (Auto) or height points (By hand).
  const changed = (now: { s: number; z: number }[], before: { s: number; z: number }[]) => {
    const key = (p: { s: number; z: number }) => `${p.s}|${p.z}`;
    const old = new Set(before.map(key)), next = new Set(now.map(key));
    for (const p of now) if (!old.has(key(p))) { a = Math.min(a, p.s); b = Math.max(b, p.s); }
    // A removed or moved input: its old position, mapped like the plan (shifted beyond its change).
    for (const p of before) if (!next.has(key(p))) {
      const s = p.s > planStart ? p.s + shift : p.s;
      a = Math.min(a, s); b = Math.max(b, s);
    }
  };
  const planStart = a;
  if (d.profileMode === 'auto') changed(d.gradePins ?? [], base.design.gradePins ?? []);
  else changed(d.vpis.slice(1, -1), base.design.vpis.slice(1, -1));
  // An edited bend whose plan moved by less than the tolerance (a large radius changed a little): its
  // own curve and its neighbours' are the stretch to re-solve.
  const before = base.design.pis;
  if (d.pis.length === before.length) d.pis.forEach((p, k) => {
    const q = before[k];
    if (p.x === q.x && p.y === q.y && p.r === q.r) return;
    for (const c of curves) if (Math.abs(c.index - k) <= 1) { a = Math.min(a, c.sStart); b = Math.max(b, c.sEnd); }
  });
  return a <= b ? [a, b] : null;
}

/** Windowed preview of `d`, or null when the ordinary whole-route preview should run. */
export function windowedPreview(ctx: EvalContext, d: Design, opts: EvalOptions,
  evaluateRoute: (ctx: EvalContext, d: Design, opts: EvalOptions) => Result): Result | null {
  if (!enabled) return null;
  const started = performance.now();
  const base = fullResults.get(ctx.terrain)?.find(e => e.key === lineageKey(ctx, d, opts));
  if (!base) return null;
  const al = buildAlignment(ctx.a, ctx.b, d.pis, horizontalRules(d.speed, d.category));
  const st = station(al, STEP), L = al.length, n = st.n, ds = st.ds;
  const range = changedRange(base, d, st, L, al.curves);
  if (!range) return null;
  const i0 = Math.max(0, Math.floor((range[0] - WINDOW_MARGIN) / ds)), i1 = Math.min(n - 1, Math.ceil((range[1] + WINDOW_MARGIN) / ds));
  if ((i1 - i0) * ds > WINDOW_MAX_SHARE * L) return null;
  const s0 = st.s[i0], s1 = st.s[i1];
  const r = base.result, shift = L - r.length, old1 = s1 - shift;
  const norms = speedNorms(d.speed, d.category);
  const baseProfile = buildProfile(r.vpis, norms.minCrestRadius, norms.minSagRadius);
  // Heights and grades of the full result's line where the window meets it (the route ends keep theirs).
  const z = elevations(baseProfile, [s0, s0 + 1, old1 - 1, old1]);
  const startsAtA = i0 === 0, endsAtB = i1 === n - 1;
  const endpointElevations = {
    ...(startsAtA ? opts.endpointElevations?.a === undefined ? {} : { a: opts.endpointElevations.a } : { a: z[0] }),
    ...(endsAtB ? opts.endpointElevations?.b === undefined ? {} : { b: opts.endpointElevations.b } : { b: z[3] }),
  };
  const grades = { ...(startsAtA ? {} : { a: z[1] - z[0] }), ...(endsAtB ? {} : { b: z[3] - z[2] }) };
  // By hand: the player's height points inside the window, in its own chainage.
  const local: Design = d.profileMode === 'auto'
    ? { ...d, gradePins: (d.gradePins ?? []).filter(p => p.s >= s0 && p.s <= s1).map(p => ({ ...p, s: p.s - s0 })) }
    : { ...d, vpis: [{ s: 0, z: 0, r: null }, ...d.vpis.slice(1, -1).filter(p => p.s > s0 && p.s < s1).map(p => ({ ...p, s: p.s - s0 })), { s: s1 - s0, z: 0, r: null }] };
  const tWindow = performance.now();
  const w = evaluateRoute(ctx, local, { ...opts, preview: true, endpointElevations, window: { s0, s1, grades } });

  const tStitch = performance.now();
  // --- stitch: window stations from w, the rest from the full result (downstream shifted) ---
  const oldS = (s: number) => s <= s0 ? s : s - shift;
  const inWindow = (i: number) => i >= i0 && i <= i1;
  const vpis: VPI[] = [
    ...r.vpis.filter(v => v.s < s0 - 1e-6),
    ...w.vpis.map(v => ({ ...v, s: v.s + s0 })),
    ...r.vpis.filter(v => v.s > old1 + 1e-6).map(v => ({ ...v, s: v.s + shift })),
  ];
  const profile = buildProfile(vpis, norms.minCrestRadius, norms.minSagRadius);
  const grade = elevations(profile, st.s);
  const ground = new Float64Array(n);
  for (let i = 0; i < n; i++) ground[i] = inWindow(i) ? w.ground[i - i0] : ctx.terrain.heightAt(st.x[i], st.y[i]);
  type Num = Float64Array | Float32Array | Uint8Array;
  const stitch = <T extends Num>(make: (n: number) => T, mine: ArrayLike<number>, theirs: ArrayLike<number>, interpolate = false): T => {
    const out = make(n);
    for (let i = 0; i < n; i++) out[i] = inWindow(i) ? mine[i - i0] : interpolate ? at(r, theirs, oldS(st.s[i])) : theirs[nearest(r, oldS(st.s[i]))];
    return out;
  };
  const f64 = (k: number) => new Float64Array(k), f32 = (k: number) => new Float32Array(k), u8 = (k: number) => new Uint8Array(k);
  const kind = stitch(u8, w.kind, r.kind);
  const runs: Run[] = [];
  for (let i = 0; i < n; i++) {
    if (kind[i] === 0) continue;
    let j = i;
    while (j + 1 < n && kind[j + 1] === kind[i]) j++;
    runs.push({ kind: kind[i] as 1 | 2, i0: i, i1: j, s0: st.s[i], s1: st.s[j], length: st.s[j] - st.s[i] + ds });
    i = j;
  }
  // Per-cell costs: window cells priced now; the others are the full result's, per metre of its cells.
  const scale = ds / r.ds;
  const parts = {} as CostParts;
  for (const key of PART_KEYS) {
    const out = new Float64Array(n), mine = w.parts[key], theirs = r.parts[key];
    for (let i = 0; i < n; i++) out[i] = inWindow(i) ? mine[i - i0] : theirs[nearest(r, oldS(st.s[i]))] * scale;
    parts[key] = out;
  }
  const profiles = [...w.geology.profiles, ...r.geology.profiles];
  const geologyIds = stitch(u8, w.geology.ids, Uint8Array.from(r.geology.ids, v => v + w.geology.profiles.length));
  // Lists in the full result's chainage: before the window unchanged, after it shifted.
  const shiftS = <T extends { s0: number; s1: number }>(v: T, by: number): T => ({ ...v, s0: v.s0 + by, s1: v.s1 + by });
  const violations = [...r.violations.filter(v => v.s1 < s0), ...w.violations.map(v => shiftS(v, s0)),
    ...r.violations.filter(v => v.s0 > old1).map(v => shiftS(v, shift))];
  // Without their measured geometry, like a whole-route preview's (a long route's would dominate the
  // message to the main thread).
  const lean = (c: Result['crossings'][number]) => { const { geometry: _g, ...rest } = c; return rest; };
  const crossings = [...r.crossings.filter(c => c.s < s0).map(lean), ...w.crossings.map(c => ({ ...c, s: c.s + s0, i: c.i + i0 })),
    ...r.crossings.filter(c => c.s > old1).map(c => ({ ...lean(c), s: c.s + shift, i: Math.min(n - 1, Math.round((c.s + shift) / ds)) }))];
  const travelMin = L / (d.speed / 3.6) / 60;
  const cost = sumParts(parts);
  return {
    ...r,
    length: L, ds, n, s: st.s, x: st.x, y: st.y, tx: st.tx, ty: st.ty, ground, grade, kind, runs,
    geology: { ids: geologyIds, profiles },
    cut: stitch(f64, w.cut, r.cut, true), fill: stitch(f64, w.fill, r.fill, true),
    dayL: stitch(f64, w.dayL, r.dayL, true), dayR: stitch(f64, w.dayR, r.dayR, true),
    zDayL: stitch(f64, w.zDayL, r.zDayL, true), zDayR: stitch(f64, w.zDayR, r.zDayR, true),
    oob: stitch(u8, w.oob, r.oob),
    wallSurfaceL: stitch(f64, w.wallSurfaceL, r.wallSurfaceL), wallSurfaceR: stitch(f64, w.wallSurfaceR, r.wallSurfaceR),
    vpis, vcurves: profile.curves.map(c => ({ s: c.s, z: c.z, len: c.lenEff, r: c.r, type: c.type })), grades: profile.grades,
    curves: al.curves.map(c => ({ index: c.index, x: c.x, y: c.y, r: c.r, rEff: c.rEff, delta: c.delta, auto: c.auto, sStart: c.sStart, sEnd: c.sEnd, t: c.t, unit: c.unit })),
    violations, geomViolations: violations.filter(v => !v.goal).length, cost, parts,
    cell: { width: stitch(f64, w.cell.width, r.cell.width), urban: stitch(f32, w.cell.urban, r.cell.urban),
      forest: stitch(f32, w.cell.forest, r.cell.forest), wall: stitch(u8, w.cell.wall, r.cell.wall) },
    crossings, waterCrossings: [], footprintConflicts: [], retainingWalls: [], walls: [], demolished: [], boughtOut: [], kept: [],
    noise: { receivers: [], footprint: null },
    travelMin, valid: false, profileFeasible: w.profileFeasible,
    timing: { ...w.timing, total: performance.now() - started, 'window.length': s1 - s0,
      'w.setup': tWindow - started, 'w.window': tStitch - tWindow, 'w.stitch': performance.now() - tStitch },
    preview: true, lineage: undefined,
  };
}
