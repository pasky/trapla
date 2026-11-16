// Design speed by stretch (docs/design-realism-plan.md M4, research/47 §2): a bend may carry its own design
// speed; a stretch is a run of consecutive bends of one speed, and where two stretches meet the speed changes
// in the middle of the straight between their curves (PROVISIONAL: no public rule says where).
import type { CategoryId } from './data/categories';
import { designSpeeds } from './data/norms';
import type { Alignment, PI } from './horizontal';

export interface SpeedStretch { s0: number; s1: number; speed: number }

/** a bend's design speed: its own where the category has that speed, else the road's */
export function bendSpeed(p: PI | undefined, roadSpeed: number, category?: CategoryId): number {
  return p?.speed !== undefined && (!category || designSpeeds(category).includes(p.speed)) ? p.speed : roadSpeed;
}

/** The road from 0 to its length in stretches of one design speed (one stretch where no bend has its own). */
export function speedStretches(al: Pick<Alignment, 'curves' | 'length'>, pis: readonly PI[], roadSpeed: number, category?: CategoryId): SpeedStretch[] {
  const out: SpeedStretch[] = [];
  let speed = roadSpeed, s0 = 0, lastEnd = 0, first = true;
  for (const c of al.curves) {
    const v = bendSpeed(pis[c.index], roadSpeed, category);
    // the road's start belongs to the first bend's stretch
    if (first) { speed = v; first = false; }
    else if (v !== speed) {
      const at = (lastEnd + c.sStart) / 2;
      out.push({ s0, s1: at, speed }); s0 = at; speed = v;
    }
    lastEnd = Math.max(lastEnd, c.sEnd);
  }
  out.push({ s0, s1: al.length, speed });
  return out;
}

/** Travel time over the stretches at their design speeds, minutes. */
export function travelMinutes(stretches: readonly SpeedStretch[]): number {
  return stretches.reduce((t, x) => t + (x.s1 - x.s0) / (x.speed / 3.6) / 60, 0);
}
