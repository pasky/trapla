// Norm checks as per-family functions (roads now; rail would add its own family using cant).

import type { Alignment } from './horizontal';
import type { Profile } from './vertical';
import type { SpeedNorms } from './data/norms';

export type ViolationKind =
  | 'radius' | 'transition' | 'arcShort' | 'gradient' | 'crest' | 'sag' | 'vcOverlap' | 'oob'
  | 'category' | 'time' | 'profile' | 'section' | 'crossing';

export interface Violation {
  kind: ViolationKind;
  msg: string;
  /** station range, m (may be equal) */
  s0: number;
  s1: number;
  /** goal violations (time, category) are not geometric */
  goal?: boolean;
  /** PI / VPI index when the fix is on a specific point */
  pi?: number;
  vpi?: number;
}

export interface CheckFamily {
  horizontal(al: Alignment, norms: SpeedNorms): Violation[];
  vertical(p: Profile, norms: SpeedNorms, maxGradient: number): Violation[];
}

const fmt = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

export const ROAD_CHECKS: CheckFamily = {
  horizontal(al, norms) {
    const out: Violation[] = [];
    const lt = norms.minTransition;
    for (const c of al.curves) {
      if (c.delta < 1e-6) continue;
      const where = { s0: c.sStart, s1: Math.max(c.sEnd, c.sStart), pi: c.index };
      if (c.tooSharp) {
        out.push({ kind: 'radius', msg: `PI ${c.index + 1}: deflection ${fmt((c.delta * 180) / Math.PI)}° is a near U-turn — no curve possible`, ...where });
        continue;
      }
      if (c.r < norms.minRadius - 1e-6) {
        out.push({ kind: 'radius', msg: `PI ${c.index + 1}: radius ${fmt(c.r)} m < minimum ${norms.minRadius} m`, ...where });
      }
      if (c.delta * c.r < lt - 1e-6) {
        out.push({
          kind: 'arcShort', ...where,
          msg: `PI ${c.index + 1}: curve too short for two ${lt} m transitions (needs R ≥ ${fmt(Math.ceil(lt / c.delta))} m)`,
        });
      }
    }
    for (const leg of al.legs) {
      if (leg.used > leg.length + 1e-6) {
        const prev = al.curves[leg.index - 1], next = al.curves[leg.index];
        const s0 = prev ? prev.sStart : 0;
        const s1 = next ? next.sEnd : al.length;
        const name = leg.index === 0 ? 'A' : `PI ${leg.index}`;
        const name2 = leg.index === al.legs.length - 1 ? 'B' : `PI ${leg.index + 1}`;
        out.push({
          kind: 'transition', s0, s1, pi: next ? next.index : prev?.index,
          msg: `${name}–${name2}: curves + ${lt} m transitions need ${fmt(leg.used)} m, leg is ${fmt(leg.length)} m`,
        });
      }
    }
    return out;
  },
  vertical(p, norms, maxGradient) {
    const out: Violation[] = [];
    for (let i = 0; i < p.grades.length; i++) {
      const g = p.grades[i];
      if (Math.abs(g) > maxGradient + 1e-6) {
        out.push({
          kind: 'gradient', s0: p.pts[i].s, s1: p.pts[i + 1].s, vpi: i,
          msg: `gradient ${fmt(Math.abs(g) * 100, 1)} % > ${fmt(maxGradient * 100, 1)} %`,
        });
      }
    }
    for (const c of p.curves) {
      if (c.type === 'none') continue;
      const where = { s0: c.s - c.lenEff / 2, s1: c.s + c.lenEff / 2, vpi: c.index };
      const min = c.type === 'crest' ? norms.minCrestRadius : norms.minSagRadius;
      if (c.r < min - 1e-6) {
        out.push({ kind: c.type, ...where, msg: `${c.type} radius ${fmt(c.r)} m < ${fmt(min)} m` });
      }
      if (c.lenEff < c.len - 1e-3) {
        out.push({ kind: 'vcOverlap', ...where, msg: `vertical curve (${fmt(c.len)} m) overlaps its neighbour — move VPIs apart` });
      }
    }
    return out;
  },
};
