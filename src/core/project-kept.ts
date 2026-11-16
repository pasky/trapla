// A rebuilt stretch where its new line still lies on the old road: the old road is KEPT as it is there.
// Nothing is built, so nothing is billed and the design norm does not apply: ČSN 73 6101 covers new roads,
// relocations and rebuilds of the earth body (research/30 §1; the 2004 text, not verified in the 2018 one),
// while a repair keeps the road's line and heights (Decree 104/1997 §9). The norm applies exactly where
// the player builds anew: a bend moved off the old road is a new road's bend.
import type { Result } from './evaluate';
import type { ReplacementWork } from './project-replacement';

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

/** Applies "kept as the old road" to a rebuilt stretch's own result: what the norm would ask there becomes
 * a note (`inherited`), houses there are untouched, and everything the kernel billed there is credited in
 * one line. Returns that credit (null: nothing kept). */
export function applyKept(r: Result, kept: Uint8Array): ReplacementWork | null {
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
  let credit = 0;
  for (const part of Object.values(r.parts) as ArrayLike<number>[]) for (let i = 0; i < r.n; i++) if (kept[i]) credit += part[i];
  let length = 0;
  for (let i = 0; i < r.n; i++) if (kept[i]) length += i === 0 || i === r.n - 1 ? r.ds / 2 : r.ds;
  if (credit > 0) r.keptCredit = -credit;
  return credit > 0 ? { kind: 'kept', s: r.s[first], x: r.x[first], y: r.y[first], length, cost: -credit,
    label: `${Math.round(length)} m stay on the old road: kept as it is, not built anew` } : null;
}
