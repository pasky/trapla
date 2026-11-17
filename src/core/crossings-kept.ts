// A retry's crossings from an earlier finish of the same evaluation (docs/evaluate-performance.md "A retry
// builds only the crossings near what it changed"). A finish (evaluate.ts finishCrossings) keeps what the
// crossing build read of our road and what it built; a later finish of the same evaluation builds again only
// the crossings near the stations where that differs and takes the others as the earlier finish built them.
import { built } from './crossing-geometry';
import type { CrossingIssue, CrossingResult } from './crossings';
import { CROSSING_RULES } from './data/urban';
import { LINK_CORRIDOR } from './link-route';

/** How far from a changed station a crossing is built again, m, in plan (so a hairpin's other leg counts): a
 * crossing's reroute is led to another crossing at most this far along our road, and the crossed way is traced
 * this far from the crossing (ENGINE: the reach of the crossing build's reads). */
export const LOCAL_CORE = CROSSING_RULES.linkHardReach;
/** Crossings this much further out are built along with them (the crossings those may be led to and weighed
 * against), their results not taken, m. */
export const LOCAL_CONTEXT = CROSSING_RULES.linkHardReach;
/** A kept crossing whose works (any point of its built geometry) lie within this of our earthworks at a changed
 * station is built again, m (ENGINE: the corridor beside our earthworks a reroute's line is sought in). */
export const LOCAL_BESIDE = LINK_CORRIDOR;
/** Above this share of all crossings the whole route is built (ENGINE: nothing left to save; at 0.6 direct-80's
 * regrade retry, 66 % of its crossings, was built whole and gained nothing; at 0.9 it is 8 % faster). */
export const LOCAL_MAX_SHARE = 0.9;

/** Which path a finish's crossing build takes: `local` false (the reference) builds the whole route in every
 * finish; `check` builds both ways in each later finish, reports what differs and goes on with the whole
 * route's (scripts/local-retry-report.ts, scripts/dev/local-retry-check.ts). */
export const LOCAL_RETRY: { local: boolean; check?: (report: LocalBuildReport) => void } = { local: true };

/** Our road as the crossing build reads it, per station (CrossingRoute). */
export type CrossingInputs = Record<'grade' | 'kind' | 'width' | 'left' | 'right' | 'urban', ArrayLike<number> & { slice(): ArrayLike<number> }>;

/** One finish's crossing build. */
export interface KeptCrossings {
  /** the stationing it belongs to (a pass's setup `st`) */
  frame: object;
  inputs: CrossingInputs;
  /** buildings our road demolished before the crossings were built: building → station */
  goneAt: ReadonlyMap<number, number>;
  /** each crossing as resolveCrossings left it, and as built */
  resolved: CrossingResult[]; built: CrossingResult[];
  rolledBack: boolean;
}

export interface LocalBuildReport {
  /** 'local', or why the whole route was built */
  path: 'local' | 'first' | 'rollback' | 'share' | 'context' | 'follower';
  crossings: number; core: number; subset: number; changed: number;
  /** check mode: crossings (way@chainage) whose local result is not the whole route's, metres along the road
   * from a change, whether built again */
  differs?: { key: string; s: number; d: number; core: boolean; local: string; whole: string }[];
  issuesDiffer?: boolean;
  ms?: { local: number; whole: number };
}

const key = (c: CrossingResult) => `${c.roadId}@${c.s}`;
const same = (a: unknown, b: unknown) => Object.is(a, b) || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));
const sameResolved = (a: CrossingResult, b: CrossingResult) => {
  const p = a as unknown as Record<string, unknown>, q = b as unknown as Record<string, unknown>;
  for (const k in p) if (!same(p[k], q[k])) return false;
  for (const k in q) if (!(k in p) && q[k] !== undefined) return false;
  return true;
};
const copy = (c: CrossingResult, issue: (v: CrossingIssue) => CrossingIssue): CrossingResult => c.issues ? { ...c, issues: c.issues.map(issue) } : { ...c };
/** what a crossing led to another one, or one led to it, sees of it */
const signature = (c: CrossingResult) => [c.type, c.cost, c.targetS, c.targetRoadId, c.square, c.moved, c.span, c.underpassLength, c.lowered,
  c.issues?.length ?? 0, c.geometry?.diagnostics?.length ?? 0, !!c.geometry?.sameSide].join();

/** Stations where what the crossing build reads differs between two finishes (and how many). */
function changedStations(n: number, inputs: CrossingInputs, goneAt: ReadonlyMap<number, number>, resolved: readonly CrossingResult[], base: KeptCrossings) {
  const changed = new Uint8Array(n);
  for (const k of Object.keys(inputs) as (keyof CrossingInputs)[]) {
    const a = inputs[k], b = base.inputs[k];
    for (let i = 0; i < n; i++) if (a[i] !== b[i] && (a[i] === a[i] || b[i] === b[i])) changed[i] = 1;
  }
  for (const [j, i] of goneAt) if (!base.goneAt.has(j)) changed[i] = 1;
  for (const [j, i] of base.goneAt) if (!goneAt.has(j)) changed[i] = 1;
  const before = new Map<string, CrossingResult | null>();
  for (const c of base.resolved) before.set(key(c), before.has(key(c)) ? null : c);
  const seen = new Set<string>();
  for (const c of resolved) {
    const b = before.get(key(c));
    if (!b || seen.has(key(c)) || !sameResolved(c, b)) changed[c.i] = 1;
    seen.add(key(c));
  }
  for (const c of base.resolved) if (!seen.has(key(c))) changed[c.i] = 1;
  let count = 0;
  for (let i = 0; i < n; i++) count += changed[i];
  return { changed, count };
}

/** Whether a point lies within `reach` of a changed station's axis point (a grid of those stations). */
function besideChanged(x: ArrayLike<number>, y: ArrayLike<number>, changed: Uint8Array, reach: number) {
  // (cells numbered from the changed stations' own corner; most points fall outside their box at once)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < changed.length; i++) if (changed[i]) { x0 = Math.min(x0, x[i]); x1 = Math.max(x1, x[i]); y0 = Math.min(y0, y[i]); y1 = Math.max(y1, y[i]); }
  x0 -= reach; x1 += reach; y0 -= reach; y1 += reach;
  const cells = new Map<number, number[]>(), rows = Math.floor((y1 - y0) / reach) + 3, at = (px: number, py: number) => (Math.floor((px - x0) / reach) + 1) * rows + Math.floor((py - y0) / reach) + 1;
  for (let i = 0; i < changed.length; i++) if (changed[i]) {
    const k = at(x[i], y[i]), list = cells.get(k);
    if (list) list.push(i); else cells.set(k, [i]);
  }
  return (px: number, py: number) => {
    if (!(px >= x0 && px <= x1 && py >= y0 && py <= y1)) return false;
    const k = at(px, py);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = cells.get(k + a * rows + b);
      if (list) for (const i of list) if ((x[i] - px) ** 2 + (y[i] - py) ** 2 <= reach * reach) return true;
    }
    return false;
  };
}
/** Whether any point of a built crossing's geometry (anything in it with an x and a y) passes `test`. */
function anyPoint(value: unknown, test: (x: number, y: number) => boolean): boolean {
  if (value === null || typeof value !== 'object' || ArrayBuffer.isView(value)) return false;
  const p = value as { x?: unknown; y?: unknown };
  // (a point holds nothing further)
  if (typeof p.x === 'number' && typeof p.y === 'number') return test(p.x, p.y);
  if (Array.isArray(value)) { for (const v of value) if (anyPoint(v, test)) return true; return false; }
  for (const k in value) if (anyPoint((value as Record<string, unknown>)[k], test)) return true;
  return false;
}

/** Metres along the road from each station to the nearest changed one. */
function distances(s: ArrayLike<number>, changed: Uint8Array): Float64Array {
  const n = changed.length, d = new Float64Array(n).fill(Infinity);
  for (let i = 0, last = -Infinity; i < n; i++) { if (changed[i]) last = s[i]; d[i] = s[i] - last; }
  for (let i = n - 1, last = Infinity; i >= 0; i--) { if (changed[i]) last = s[i]; d[i] = Math.min(d[i], last - s[i]); }
  return d;
}

/** The crossing build of a finish. `crossings` come resolved (`issues`: what resolveCrossings returned);
 * `build(items)` is buildCrossingGeometry on this finish's road, `resolve()` resolveCrossings again on all of
 * them (a local build that cannot be kept starts over), `rolledBack()` whether the last build rolled back.
 * Returns the finish's crossing issues, as the whole-route build lists them; `kept` gets this finish's. */
export function buildCrossings(kept: KeptCrossings[] | undefined, frame: { s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number> }, inputs: CrossingInputs, goneAt: ReadonlyMap<number, number>,
  crossings: CrossingResult[], issues: CrossingIssue[], build: (items: CrossingResult[]) => CrossingIssue[], resolve: () => CrossingIssue[], rolledBack: () => boolean,
  count: (path: LocalBuildReport['path']) => void = () => {}): CrossingIssue[] {
  const whole = (list: CrossingIssue[]) => [...list, ...build(crossings)];
  if (!kept || !(LOCAL_RETRY.local || LOCAL_RETRY.check)) return whole(issues);
  // (kept as copies: a result's crossings and their issues are written to later, e.g. what raising our road would cost)
  const { s, x, y } = frame, n = s.length, resolved = crossings.map(c => copy(c, v => ({ ...v }))), own = crossings.map(c => c.issues ? [...c.issues] : []);
  const keep = (was: boolean) => {
    kept.push({ frame, inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.slice()])) as CrossingInputs,
      goneAt, resolved, built: crossings.map(c => copy(c, v => ({ ...v }))), rolledBack: was });
  };
  // The earlier finish that differs at the fewest stations (the latest of equals).
  let base: KeptCrossings | undefined, diff: ReturnType<typeof changedStations> | undefined;
  for (const k of kept) if (k.frame === frame) {
    const d = changedStations(n, inputs, goneAt, resolved, k);
    if (!diff || d.count <= diff.count) { base = k; diff = d; }
  }
  const report: LocalBuildReport = { path: 'first', crossings: crossings.length, core: 0, subset: 0, changed: diff?.count ?? 0 };
  const t0 = performance.now();
  let out: CrossingIssue[] | undefined, again = new Set<CrossingResult>();
  const dist = base && diff ? distances(s, diff.changed) : undefined;
  if (base && diff && dist) {
    const before = new Map(base.built.map(c => [key(c), c])), at = new Map(crossings.map(c => [key(c), c]));
    // Metres in plan from each crossing to the nearest changed station (never more than along the road).
    const stations: number[] = [];
    diff.changed.forEach((on, i) => { if (on) stations.push(i); });
    const away = crossings.map(c => dist[c.i] <= LOCAL_CORE ? dist[c.i] : Math.min(dist[c.i], Math.sqrt(stations.reduce((m, i) => Math.min(m, (x[i] - c.x) ** 2 + (y[i] - c.y) ** 2), Infinity))));
    // Built again: the crossings near a change; a reroute the player shaped (it may run 8 km); a kept crossing
    // whose works lie beside our earthworks at a changed station, however far along the road its crossing is.
    const half = stations.reduce((m, i) => Math.max(m, inputs.left[i], inputs.right[i], base!.inputs.left[i], base!.inputs.right[i]), 0);
    const beside = besideChanged(x, y, diff.changed, half + LOCAL_BESIDE);
    const core = new Set(diff.count ? crossings.filter((c, k) => away[k] <= LOCAL_CORE || c.via !== undefined || anyPoint(before.get(key(c))?.geometry, beside)) : []);
    // With them: the crossings further out (from the change, and along the road from each one built again), and
    // whatever those and they are led to or led from (as the kept finish built them and as this one resolved
    // them), so that none of them misses its neighbours.
    const rebuilt = [...core];
    const subset = new Set(crossings.filter((c, k) => core.has(c) || (diff!.count > 0 && (away[k] <= LOCAL_CORE + LOCAL_CONTEXT || rebuilt.some(q => Math.abs(q.s - c.s) <= LOCAL_CONTEXT)))));
    const led = new Map<CrossingResult, CrossingResult[]>();
    for (const list of [base.built, resolved]) for (const c of list) {
      const me = at.get(key(c)), t = c.targetS === undefined ? undefined : at.get(`${c.targetRoadId}@${c.targetS}`);
      if (me && t && me !== t) { led.set(me, [...led.get(me) ?? [], t]); led.set(t, [...led.get(t) ?? [], me]); }
    }
    for (const c of subset) for (const t of led.get(c) ?? []) subset.add(t);
    report.core = core.size; report.subset = subset.size; again = core;
    report.path = base.rolledBack ? 'rollback' : subset.size > LOCAL_MAX_SHARE * crossings.length ? 'share' : 'local';
    if (report.path === 'local' && core.size) {
      build(crossings.filter(c => subset.has(c)));
      if (rolledBack()) report.path = 'rollback';
      // A crossing built again may be led to and is weighed against those within reach of it along the road:
      // each of them that is not built again must have come out as it was kept.
      else if (crossings.some(t => subset.has(t) && !core.has(t) && rebuilt.some(c => Math.abs(t.s - c.s) <= CROSSING_RULES.linkHardReach)
        && signature(t) !== signature(before.get(key(t))!))) report.path = 'context';
      // A kept crossing is led to one built again: that one must still be what it was led to.
      else if (base.built.some(c => { const t = c.targetS === undefined ? undefined : at.get(`${c.targetRoadId}@${c.targetS}`), b = t && before.get(key(t)), me = at.get(key(c));
        return t && me && !core.has(me) && core.has(t) && (!b || signature(t) !== signature(b)); })) report.path = 'follower';
      if (report.path !== 'local') issues = resolve();
    }
    if (report.path === 'local') {
      crossings.forEach((c, k) => {
        if (core.has(c)) return;
        const b = before.get(key(c))!, fresh = own[k];
        let r = 0;
        for (const q of Object.keys(c)) delete (c as unknown as Record<string, unknown>)[q];
        Object.assign(c, copy(b, v => built(v) ? { ...v } : fresh[r++] ?? { ...v }));
      });
      const of = (pick: (v: CrossingIssue) => boolean) => crossings.flatMap(c => c.issues?.filter(v => built(v) && pick(v)) ?? []);
      out = [...issues, ...of(v => v.crossing.code !== 'square'), ...of(v => v.crossing.code === 'square')];
    }
  }
  const t1 = performance.now();
  if (out && LOCAL_RETRY.check) {
    // The reference: the whole route built on the same crossings; the finish goes on with it.
    // (keys sorted: a kept crossing's are in the order the earlier finish set them)
    const text = (c: CrossingResult) => JSON.stringify(c, (k, v) => k === 'issues' ? (v as CrossingIssue[] | undefined)?.map(x => [x.title, x.fix, x.detail, x.crossing])
      : v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v) ? Object.fromEntries(Object.entries(v as object).sort(([p], [q]) => p < q ? -1 : p > q ? 1 : 0)) : v);
    const local = crossings.map(text), localIssues = JSON.stringify(out), near = dist!;
    out = whole(resolve());
    report.differs = crossings.flatMap((c, k) => text(c) === local[k] ? [] : [{ key: `${c.roadId}@${Math.round(c.s)}`, s: c.s, d: near[c.i], core: again.has(c),
      local: brief(JSON.parse(local[k])), whole: brief(c) }]);
    report.issuesDiffer = JSON.stringify(out) !== localIssues;
    report.ms = { local: t1 - t0, whole: performance.now() - t1 };
    keep(rolledBack());
  } else if (out) keep(false);
  else { out = whole(issues); keep(rolledBack()); }
  count(report.path);
  LOCAL_RETRY.check?.(report);
  return out;
}
const brief = (c: CrossingResult) => `${c.type}${c.square ? ' square' : ''}${c.moved ? ' moved' : ''} ${Math.round(c.cost)}${c.targetS === undefined ? '' : ` → ${Math.round(c.targetS)}`}${c.issues?.length ? ` (${c.issues.length} issues)` : ''}`;
