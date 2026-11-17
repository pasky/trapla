// The curve a slowed bend gets (playtest sweep 3, research/66 §2). A stretch designed for a lower speed may have
// smaller curves; a designer uses them where the faster ones do not fit, not everywhere ("přechod na minimální
// hodnotu návrhového prvku byl pozvolný", the transition to minimum elements gradual: VUT, research/47 §2). So a
// bend whose radius is Auto's and whose stretch is slowed keeps the curve of the fastest speed up to the road's
// that fits where it is (no horizontal problem of its own that its own speed's curve does not have), else its own
// speed's tightest. Only the plan: the stretch's speed, its travel time and its heights' limits stay its own.
import { type CategoryId } from './data/categories';
import { bendRules, designSpeeds, horizontalRules } from './data/norms';
import { buildAlignment, type PI, type Vec2 } from './horizontal';
import { horizontalViolations } from './checks';
import { bendSpeed } from './design-speed';

let memo: { key: string; out: PI[] } | undefined;

/** The bends as the plan is built for them (each slowed Auto-radius bend's `speed`: the speed its curve is built
 * for); `pis` itself where no bend is slowed. */
export function planPis(a: Vec2, b: Vec2, pis: readonly PI[], roadSpeed: number, category: CategoryId): PI[] {
  const slowed: number[] = [];
  pis.forEach((p, k) => { if (p.r === null && !p.hairpin && bendSpeed(p, roadSpeed, category) < roadSpeed) slowed.push(k); });
  if (!slowed.length) return pis as PI[];
  const key = JSON.stringify([a, b, pis, roadSpeed, category]);
  if (memo?.key === key) return memo.out;
  let cur: PI[] = pis.map(p => ({ ...p }));
  /** the horizontal problems bend k has with the bends as in `ps` */
  const issues = (ps: readonly PI[], k: number) => {
    const al = buildAlignment(a, b, ps as PI[], horizontalRules(roadSpeed, category), bendRules(ps, roadSpeed, category));
    return horizontalViolations(al, roadSpeed).filter(v => v.pi === k || v.pis?.includes(k)).length;
  };
  for (const k of slowed) {
    const own = bendSpeed(pis[k], roadSpeed, category), base = issues(cur, k);
    // fastest first: the road's, then each speed down to one step above its own
    for (const v of designSpeeds(category).filter(s => s <= roadSpeed && s > own)) {
      const trial = cur.map((p, j) => j === k ? { ...p, speed: v } : p);
      if (issues(trial, k) <= base) { cur = trial; break; }
    }
  }
  memo = { key, out: cur };
  return cur;
}

/** the speed each bend's curve is built for where it is not its own (null: its own) */
export function planSpeeds(plan: readonly PI[], pis: readonly PI[], roadSpeed: number, category: CategoryId): (number | null)[] {
  return pis.map((p, k) => { const v = bendSpeed(plan[k], roadSpeed, category); return v === bendSpeed(p, roadSpeed, category) ? null : v; });
}
