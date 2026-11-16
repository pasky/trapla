// Separate stretches of a paired motorway (playtest P0 #3). Both directions are ONE paired body (one
// D 27.5 evaluation of the common spine) except where the player changed one direction's line. There, from
// a join on a straight before the change to a join after it, each direction is its own carriageway
// (D 27.5-1); outside they are the shared body again. A direction's shown line is the spine with its own
// bends in its stretches (its carriageway lies one quarter of the formation to the side of that line), so
// the line stays continuous through the joins and the road widgets edit it like any road.
// Geometry and bookkeeping only; core/project-motorway.ts evaluates.
import type { PI, Vec2 } from './horizontal';
import { buildAlignment, station, type HorizontalRules } from './horizontal';
import type { SeparateLine, SeparateStretch } from './project';

export type Direction = 'forward' | 'reverse';
export const otherDirection = (d: Direction): Direction => d === 'forward' ? 'reverse' : 'forward';

/** Editor tolerances (not norm values): a join stays on a straight, `curve` m from the arcs beyond half
 * the transition the norm asks there; `structure` m from a bridge / tunnel end, `crossing` m from a crossed
 * road or watercourse; outside vertical curves. A shown line closer than `deviation` m to the spine runs on
 * it; `margin` m are added on both sides of where it leaves. */
export const JOIN_RULES = { curve: 10, structure: 20, crossing: 100, deviation: 0.05, margin: 5 } as const;

/** One segment of a direction's shown bend list: spine bends [k0, k1) as they are, or a stretch's own line. */
export interface CompositeSegment { c0: number; c1: number; k0: number; k1: number; stretch: number | null; own: boolean }

/** The direction's shown bends: the spine's, with its own lines in place of the spine bends they replace. */
export function compositePis(spinePis: readonly PI[], stretches: readonly SeparateStretch[], dir: Direction): { pis: PI[]; segs: CompositeSegment[] } {
  const pis: PI[] = [], segs: CompositeSegment[] = [];
  let k = 0;
  const spine = (to: number) => { if (to > k) { segs.push({ c0: pis.length, c1: pis.length + to - k, k0: k, k1: to, stretch: null, own: false }); pis.push(...spinePis.slice(k, to).map(p => ({ ...p }))); } };
  stretches.forEach((t, j) => {
    spine(t.k0);
    const own = t[dir], line = own ? own.pis : spinePis.slice(t.k0, t.k1);
    segs.push({ c0: pis.length, c1: pis.length + line.length, k0: t.k0, k1: t.k1, stretch: j, own: !!own });
    pis.push(...line.map(p => ({ ...p })));
    k = t.k1;
  });
  spine(spinePis.length);
  return { pis, segs };
}
/** Shown index where the spine bend K starts (K at a segment boundary or inside a spine segment). */
export function compositeStart(segs: readonly CompositeSegment[], K: number, total: number): number {
  for (const g of segs) {
    if (g.stretch === null && K >= g.k0 && K < g.k1) return g.c0 + K - g.k0;
    if (g.stretch !== null && K === g.k0) return g.c0;
  }
  return total;
}
/** Spine bend range a shown bend belongs to (a stretch: all of it). */
function spineRange(segs: readonly CompositeSegment[], c: number): [number, number] {
  const g = segs.find(g => c >= g.c0 && c < g.c1);
  if (!g) throw new Error('Bend outside the shown line');
  return g.stretch === null ? [g.k0 + c - g.c0, g.k0 + c - g.c0 + 1] : [g.k0, g.k1];
}

const samePi = (p: PI, q: PI) => p.x === q.x && p.y === q.y && p.r === q.r;

/** A changed bend list of one direction: the stretch it now runs on its own (merged with any it
 * touches, the other direction's own lines there carried over), or null when the bends are unchanged. */
export function editStretches(spinePis: readonly PI[], stretches: readonly SeparateStretch[], dir: Direction, next: readonly PI[], newId: () => string): SeparateStretch[] | null {
  const old = compositePis(spinePis, stretches, dir);
  let p = 0;
  while (p < old.pis.length && p < next.length && samePi(old.pis[p], next[p])) p++;
  if (p === old.pis.length && p === next.length) return null;
  let q = 0;
  while (q < old.pis.length - p && q < next.length - p && samePi(old.pis[old.pis.length - 1 - q], next[next.length - 1 - q])) q++;
  // the changed bends and their unchanged neighbours (whose curves change with the legs between)
  const lo = p - 1, hi = old.pis.length - q;
  let K0 = lo < 0 ? 0 : spineRange(old.segs, lo)[0], K1 = hi >= old.pis.length ? spinePis.length : spineRange(old.segs, hi)[1];
  // every stretch it touches joins it (stretches next to each other become one)
  const merged = new Set<number>();
  for (let changed = true; changed;) {
    changed = false;
    stretches.forEach((t, j) => {
      if (merged.has(j) || !(t.k0 <= K1 && t.k1 >= K0)) return;
      merged.add(j); K0 = Math.min(K0, t.k0); K1 = Math.max(K1, t.k1); changed = true;
    });
  }
  const c0 = compositeStart(old.segs, K0, old.pis.length), c1 = compositeStart(old.segs, K1, old.pis.length);
  const own = next.slice(c0, c1 - old.pis.length + next.length).map(p => ({ ...p }));
  const parts = [...merged].map(j => stretches[j]);
  const line = (d: Direction, pis: PI[]): SeparateLine => {
    const lines = parts.flatMap(t => t[d] ? [t[d]!] : []);
    const pins = lines.flatMap(l => l.pins), so = lines.flatMap(l => l.structureOverrides ?? []), wo = lines.flatMap(l => l.wallOverrides ?? []);
    return { pis, pins, ...(so.length ? { structureOverrides: so } : {}), ...(wo.length ? { wallOverrides: wo } : {}) };
  };
  const other = otherDirection(dir);
  let otherLine: SeparateLine | undefined;
  if (parts.some(t => t[other])) {
    const oc = compositePis(spinePis, stretches, other);
    otherLine = line(other, oc.pis.slice(compositeStart(oc.segs, K0, oc.pis.length), compositeStart(oc.segs, K1, oc.pis.length)));
  }
  const stretch: SeparateStretch = { id: parts[0]?.id ?? newId(), k0: K0, k1: K1, a: 0, b: 0, [dir]: line(dir, own), ...(otherLine ? { [other]: otherLine } : {}) };
  const out = stretches.filter((_, j) => !merged.has(j));
  out.push(stretch);
  return out.sort((x, y) => x.k0 - y.k0);
}

/** The spine's bends changed (both directions edited): stretches next to the change are dropped (both
 * directions follow the new shared line there); the others keep their own lines, renumbered. */
export function carryStretches(oldPis: readonly PI[], nextPis: readonly PI[], stretches: readonly SeparateStretch[]): { kept: SeparateStretch[]; after: boolean[]; dropped: number } {
  let p = 0;
  while (p < oldPis.length && p < nextPis.length && samePi(oldPis[p], nextPis[p])) p++;
  if (p === oldPis.length && p === nextPis.length) return { kept: stretches.map(t => structuredClone(t)), after: stretches.map(() => false), dropped: 0 };
  let q = 0;
  while (q < oldPis.length - p && q < nextPis.length - p && samePi(oldPis[oldPis.length - 1 - q], nextPis[nextPis.length - 1 - q])) q++;
  const lo = p - 1, hi = oldPis.length - q, shift = nextPis.length - oldPis.length;
  const kept: SeparateStretch[] = [], after: boolean[] = [];
  let dropped = 0;
  for (const t of stretches) {
    // its own lines start and end on the spine legs [k0−1 → k0] and [k1−1 → k1]: the curves of bends
    // k0−1 … k1 must be unchanged (a changed bend changes its neighbours' curves too: lo … hi)
    if (t.k1 < lo) { kept.push(structuredClone(t)); after.push(false); }
    else if (t.k0 - 1 > hi) { kept.push({ ...structuredClone(t), k0: t.k0 + shift, k1: t.k1 + shift }); after.push(true); }
    else dropped++;
  }
  return { kept, after, dropped };
}

interface Line { n: number; s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>; tx: ArrayLike<number>; ty: ArrayLike<number> }
/** For every station of `a`, the other line's matching point: lateral offset (left of `a` positive), its
 * chainage and tangent agreement. Bounded local search along both polylines. */
export function pairStations(a: Line, b: Line): { d: Float64Array; sb: Float64Array; dot: Float64Array } {
  const d = new Float64Array(a.n).fill(NaN), sb = new Float64Array(a.n).fill(NaN), dot = new Float64Array(a.n).fill(NaN);
  let j = -1;
  const dist = (i: number, k: number) => (a.x[i] - b.x[k]) ** 2 + (a.y[i] - b.y[k]) ** 2;
  for (let i = 0; i < a.n; i++) {
    if (j < 0 || i % 50 === 0) { let best = Infinity; for (let k = 0; k < b.n; k += 4) { const q = dist(i, k); if (q < best) { best = q; j = k; } } }
    for (let moved = true, guard = 0; moved && guard < 400; guard++) {
      moved = false;
      for (const k of [j - 1, j + 1]) if (k >= 0 && k < b.n && dist(i, k) < dist(i, j)) { j = k; moved = true; }
    }
    // foot of the perpendicular from b's segment onto a's normal line
    const nx = -a.ty[i], ny = a.tx[i];
    for (const k of [j - 1, j]) {
      if (k < 0 || k + 1 >= b.n) continue;
      const u0 = (b.x[k] - a.x[i]) * a.tx[i] + (b.y[k] - a.y[i]) * a.ty[i], u1 = (b.x[k + 1] - a.x[i]) * a.tx[i] + (b.y[k + 1] - a.y[i]) * a.ty[i];
      if (u0 * u1 > 0) continue; // (an end of the segment on the normal counts)
      const t = u0 / (u0 - u1 || 1e-12), px = b.x[k] + (b.x[k + 1] - b.x[k]) * t, py = b.y[k] + (b.y[k + 1] - b.y[k]) * t;
      d[i] = (px - a.x[i]) * nx + (py - a.y[i]) * ny; sb[i] = b.s[k] + (b.s[k + 1] - b.s[k]) * t;
      dot[i] = a.tx[i] * b.tx[k] + a.ty[i] * b.ty[k];
      break;
    }
  }
  return { d, sb, dot };
}

/** Spine chainage ranges where a shown line leaves the spine (plan only). */
export function deviations(a: Vec2, b: Vec2, spinePis: readonly PI[], shown: readonly PI[], rules: HorizontalRules): { a: number; b: number }[] {
  const spine = station(buildAlignment(a, b, [...spinePis], rules), 2), line = station(buildAlignment(a, b, [...shown], rules), 2);
  const p = pairStations(line, spine), L = spine.s[spine.n - 1], out: { a: number; b: number }[] = [];
  const on = (i: number) => Math.abs(p.d[i]) <= JOIN_RULES.deviation && p.dot[i] > 0.9999;
  let last = 0, run: { a: number; b: number } | null = null;
  for (let i = 0; i < line.n; i++) {
    if (on(i)) { if (run) { run.b = p.sb[i]; out.push(run); run = null; } last = p.sb[i]; }
    else if (!run) run = { a: i ? last : 0, b: L };
  }
  if (run) out.push(run);
  // the curve that leaves the spine needs its easing curve's room on the straight before it
  const room = JOIN_RULES.margin + JOIN_RULES.curve + rules.transition / 2;
  return out.map(r => ({ a: Math.max(0, r.a - room), b: Math.min(L, r.b + room) }));
}

/** Where each stretch's own lines actually leave the spine ([a, b], both directions); a stretch whose
 * lines all run on the spine again is dropped. */
export function locateStretches(a: Vec2, b: Vec2, spinePis: readonly PI[], stretches: readonly SeparateStretch[], rules: HorizontalRules): SeparateStretch[] {
  if (!stretches.length) return [];
  const al = buildAlignment(a, b, [...spinePis], rules);
  const window = (t: SeparateStretch) => [t.k0 > 0 ? al.curves[t.k0 - 1].sEnd : 0, t.k1 < spinePis.length ? al.curves[t.k1].sStart : al.length] as const;
  const found = stretches.map(() => ({ a: Infinity, b: -Infinity }));
  for (const dir of ['forward', 'reverse'] as const) {
    if (!stretches.some(t => t[dir])) continue;
    for (const run of deviations(a, b, spinePis, compositePis(spinePis, stretches, dir).pis, rules)) {
      const mid = (run.a + run.b) / 2;
      const j = stretches.findIndex(t => { const [w0, w1] = window(t); return mid >= w0 - JOIN_RULES.margin && mid <= w1 + JOIN_RULES.margin; });
      if (j < 0) continue;
      found[j].a = Math.min(found[j].a, run.a); found[j].b = Math.max(found[j].b, run.b);
    }
  }
  return stretches.flatMap((t, j) => found[j].a <= found[j].b ? [{ ...structuredClone(t), a: found[j].a, b: found[j].b }] : []);
}

/** Plan-only: stations of `a` where the other line runs beside it as one formation (crowns touch) on
 * `side`. `same`: both run the same way (one direction of a stretch each, both A→B). */
export function joinedRanges(a: Line, b: Line, gap: number, tolerance: number, side: 'L' | 'R' = 'L', same = false): { s0: number; s1: number }[] {
  const p = pairStations(a, b), out: { s0: number; s1: number }[] = [], sign = side === 'L' ? 1 : -1;
  for (let i = 0; i < a.n; i++) {
    if (!(Math.abs(p.d[i] - sign * gap) <= tolerance && (same ? p.dot[i] > 0.95 : p.dot[i] < -0.95))) continue;
    const last = out[out.length - 1];
    if (last && a.s[i] - last.s1 <= a.s[1] - a.s[0] + 1e-6) last.s1 = a.s[i]; else out.push({ s0: a.s[i], s1: a.s[i] });
  }
  return out;
}
