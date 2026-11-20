// A record said once, as a fact (core/data/records.ts, research/97), and only where the player earned it: never on the
// unedited starter, and never on a starter's structure the player has not touched (the D3 0302 starter's bridge stands
// 146 m over the Sázava; the D35 starters' tunnels are ≈ 3 km long). Touched: our line there is not where the starting
// line (or the From scratch straight) has it, or a height pin or a painted structure of the player's is on it.
import type { Design } from '../core/evaluate';
import type { Result } from '../core/evaluate';
import type { Run } from '../core/structures';
import { KIND } from '../core/structures';
import { recordLine } from '../core/data/records';
import type { OurLine } from '../core/terms';

type XY = { x: number; y: number };
/** a starting design and its ends (a mission route's ends do not move) */
export interface Starter { design: Design; a: XY; b: XY }

const segDist = (p: XY, a: XY, b: XY) => {
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
const polyDist = (p: XY, poly: readonly XY[]) => { let d = Infinity; for (let k = 1; k < poly.length; k++) d = Math.min(d, segDist(p, poly[k - 1], poly[k])); return d; };

/** Did the player change our line over this structure (its plan or its heights) against this starter? */
export function touched(r: Result, d: Design, ends: { a: XY; b: XY }, starter: Starter, run: Pick<Run, 'i0' | 'i1' | 's0' | 's1'>): boolean {
  // (where it is not clear that the player made it, say nothing: By hand alone, which starts from Auto's heights, a
  // pin or a radius beside it, do not count)
  const st = starter.design, on = (s: number) => s >= run.s0 && s <= run.s1;
  const same = (p: object) => (q: object) => JSON.stringify(p) === JSON.stringify(q);
  if ((d.gradePins ?? []).some(p => on(p.s) && !(st.gradePins ?? []).some(same(p)))) return true;
  if ((d.structureOverrides ?? []).some(o => o.s1 > run.s0 && o.s0 < run.s1 && !(st.structureOverrides ?? []).some(same(o)))) return true;
  // the plan: where the bends' lines differ, our line over the structure is nearer one than the other
  const P = [ends.a, ...d.pis.map(p => ({ x: p.x, y: p.y }))], Q = [starter.a, ...st.pis.map(p => ({ x: p.x, y: p.y }))];
  P.push(ends.b); Q.push(starter.b);
  if (JSON.stringify(P) === JSON.stringify(Q)) return false;
  const step = Math.max(1, Math.floor((run.i1 - run.i0) / 40));
  for (let i = run.i0; i <= run.i1; i += step) {
    const p = { x: r.x[i], y: r.y[i] };
    if (Math.abs(polyDist(p, P) - polyDist(p, Q)) > 1) return true;
  }
  return false;
}

/** The record line of this bridge or tunnel of ours, if it beats one and the player made it (`starters`: the
 * mission's starting designs for this route, asked only when a record is beaten; none: a road the player added). */
export function earnedRecord(r: Result, d: Design, line: OurLine, run: Run, ends: { a: XY; b: XY }, starters: () => readonly Starter[]): string | null {
  let height = 0;
  if (run.kind === KIND.bridge) for (let i = run.i0; i <= run.i1; i++) height = Math.max(height, r.grade[i] - r.ground[i]);
  const text = recordLine(run.kind === KIND.bridge ? 'bridge' : 'tunnel', line, run.length, height);
  return text && starters().every(st => touched(r, d, ends, st, run)) ? text : null;
}
