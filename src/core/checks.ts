// Norm checks as per-family functions (roads now; rail would add its own family using cant).

import { MAX_DEFLECTION, type Alignment } from './horizontal';
import type { Profile } from './vertical';
import type { SpeedNorms } from './data/norms';

export type ViolationKind =
  | 'radius' | 'transition' | 'arcShort' | 'compound' | 'gradient' | 'crest' | 'sag' | 'vcOverlap' | 'oob'
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
  /** horizontal violations: every bend (PI index) involved */
  pis?: number[];
}

export interface CheckFamily {
  horizontal(al: Alignment, norms: SpeedNorms): Violation[];
  vertical(p: Profile, norms: SpeedNorms, maxGradient: number): Violation[];
}

const fmt = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

// ---- horizontal (roads) --------------------------------------------------------------------------
// Every message names the bends, says what is required against what is available, and offers a fix.

const bend = (k: number) => `bend ${k + 1}`;
const bends = (a: number, b: number) => (a === b ? bend(a) : b === a + 1 ? `bends ${a + 1} and ${b + 1}` : `bends ${a + 1}–${b + 1}`);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function horizontalViolations(al: Alignment, speed: number): Violation[] {
  const out: Violation[] = [];
  const R = al.rules, lt = R.transition, tol = 1e-6;
  for (const c of al.curves) {
    if (!c.tooSharp) continue;
    out.push({
      kind: 'radius', s0: c.sStart, s1: c.sEnd, pi: c.index, pis: [c.index],
      msg: `${bend(c.index)}: a turn of ${fmt((c.delta * 180) / Math.PI)}° is a near U-turn, no curve fits (limit ${fmt((MAX_DEFLECTION * 180) / Math.PI)}°) — move it or its neighbours to open the angle, or add a bend to split the turn`,
    });
  }
  for (const u of al.units) {
    const where = { s0: u.sStart, s1: Math.max(u.sEnd, u.sStart), pi: u.first, pis: range(u.first, u.last) };
    const trans = `${u.transitions === 2 ? 'two ' : ''}${fmt(lt)} m transition${u.transitions === 2 ? 's' : ''}`;
    if (u.first === u.last) {
      const c = al.curves[u.first];
      if (c.r < R.minRadius - tol) {
        out.push({
          kind: 'radius', ...where,
          msg: `${bend(c.index)}: radius ${fmt(c.r)} m is below the ${fmt(R.minRadius)} m minimum for ${speed} km/h — set it to ≥ ${fmt(R.minRadius)} m or back to auto (or lower the design speed)`,
        });
      }
      if (u.transitions > 0 && c.r * c.delta < (u.transitions * lt) / 2 - tol) {
        const need = Math.ceil(lt / c.delta);
        out.push({
          kind: 'arcShort', ...where,
          msg: `${bend(c.index)}: at radius ${fmt(c.r)} m its arc is only ${fmt(c.r * c.delta)} m long, too short for its ${trans} — raise the radius to ≥ ${fmt(Math.min(need, Math.ceil(R.plainRadius)))} m${need > R.plainRadius ? ' (no transitions needed from there)' : ''} or set it back to auto`,
        });
      }
      continue;
    }
    // compound curve
    const members = al.curves.slice(u.first, u.last + 1).filter((c) => c.unit >= 0);
    const gaps = al.joints.filter((j) => j.kind === 'compound' && j.from >= u.first && j.to <= u.last).map((j) => j.length);
    const apart = gaps.length === 1 || Math.round(Math.min(...gaps)) === Math.round(Math.max(...gaps))
      ? `${fmt(Math.min(...gaps))} m apart` : `${fmt(Math.min(...gaps))}–${fmt(Math.max(...gaps))} m apart`;
    let worst: (typeof members)[number] | null = null;
    for (const c of members) {
      if (c.rEff >= R.minRadius - tol) continue;
      if (!c.auto) {
        out.push({
          kind: 'radius', s0: c.sStart, s1: c.sEnd, pi: c.index, pis: [c.index],
          msg: `${bend(c.index)} (part of the curve through ${bends(u.first, u.last)}): radius ${fmt(c.rEff)} m is below the ${fmt(R.minRadius)} m minimum for ${speed} km/h — set it to ≥ ${fmt(R.minRadius)} m or back to auto`,
        });
      } else if (!worst || c.rEff < worst.rEff) worst = c;
    }
    if (worst) {
      out.push({
        kind: 'radius', ...where, pi: worst.index,
        msg: `${bends(u.first, u.last)} turn the same way ${apart}: they are joined as one curve, but its radius ${fmt(worst.rEff)} m${u.last > u.first + 1 ? ` at ${bend(worst.index)}` : ''} < minimum ${fmt(R.minRadius)} m — move them apart or reduce the turn`,
      });
    }
    if (u.transitions > 0 && u.arcLen < (u.transitions * lt) / 2 - tol) {
      out.push({
        kind: 'arcShort', ...where,
        msg: `${bends(u.first, u.last)}: the curve joined from them is only ${fmt(u.arcLen)} m long, too short for its ${trans} (needs ${fmt((u.transitions * lt) / 2)} m) — move them apart, or raise the radii to ≥ ${fmt(Math.ceil(R.plainRadius))} m where no transitions are needed`,
      });
    }
  }
  for (const j of al.joints) {
    const a = j.from >= 0 ? al.curves[j.from] : null, b = j.to >= 0 ? al.curves[j.to] : null;
    const where = { s0: j.s0, s1: j.s1, pi: j.to >= 0 ? j.to : j.from, pis: [j.from, j.to].filter((k) => k >= 0) };
    if (j.kind === 'compound') {
      if (!a || !b) continue;
      const lo = Math.min(a.rEff, b.rEff), hi = Math.max(a.rEff, b.rEff);
      if (hi <= lo * R.compoundRatio * (1 + 1e-9)) continue;
      const big = a.rEff > b.rEff ? a : b, small = big === a ? b : a;
      const fix = !big.auto ? `reduce the radius of ${bend(big.index)} (to ≤ ${fmt(Math.floor(lo * R.compoundRatio))} m, or far enough that the two no longer touch) or set it back to auto`
        : !small.auto ? `set the radius of ${bend(small.index)} to ≥ ${fmt(Math.ceil(hi / R.compoundRatio))} m or back to auto`
          : 'move the bends so that the turn is spread more evenly, or delete one of them';
      out.push({
        kind: 'compound', ...where,
        msg: `${bends(j.from, j.to)} are joined as one curve, but their radii ${fmt(a.rEff)} m and ${fmt(b.rEff)} m differ by more than ${fmt(R.compoundRatio)}× — ${fix}`,
      });
      continue;
    }
    const used = j.tFrom + j.needFrom + j.tTo + j.needTo;
    const short = used - j.length;
    if (short <= tol) continue;
    const tf = Math.max(0, j.tFrom), tt = Math.max(0, j.tTo); // (a joined curve may begin past its first bend)
    const more = `≥ ${fmt(Math.ceil(short))} m`;
    if (j.kind === 'end') {
      const c = (a && a.unit >= 0 ? a : b)!;
      const atStart = c === b;
      const other = atStart ? (j.from < 0 ? 'A' : `the U-turn at ${bend(j.from)}`) : j.to < 0 ? 'B' : `the U-turn at ${bend(j.to)}`;
      const t = atStart ? tt : tf, need = atStart ? j.needTo : j.needFrom;
      out.push({
        kind: 'transition', ...where, pi: c.index,
        msg: `${bend(c.index)} is too close to ${other}: its curve takes ${fmt(t)} m of that leg${need > 0 ? ` and its transition ${fmt(need)} m more` : ''}, but the leg is only ${fmt(j.length)} m — move it ${more} away from ${other}, or reduce its radius or turn`,
      });
    } else if (j.kind === 'reverse') {
      const between = !j.plainFrom && !j.plainTo ? `their two transitions ${fmt(j.needFrom + j.needTo)} m`
        : j.plainFrom && j.plainTo ? `arcs without transitions (radius ≥ ${fmt(Math.ceil(R.plainRadius))} m) need a ${fmt(R.reverseStraight)} m straight between them`
          : `the transition of ${bend(j.plainFrom ? j.to : j.from)} ${fmt(j.plainFrom ? j.needTo : j.needFrom)} m and the straight before the plain arc of ${bend(j.plainFrom ? j.from : j.to)} ${fmt(j.plainFrom ? j.needFrom : j.needTo)} m`;
      out.push({
        kind: 'transition', ...where,
        msg: `${bends(j.from, j.to)} turn opposite ways ${fmt(j.length)} m apart: the curves take ${fmt(tf)} + ${fmt(tt)} m of that leg and ${between}, ${fmt(used)} m in all — move them ${more} further apart, reduce a radius, or delete one of them`,
      });
    } else {
      // same direction, too close for a straight; normally such bends are joined into one curve
      const manual = [a, b].filter((c) => c && !c.auto).map((c) => bend(c!.index));
      const tail = !j.joinFailed ? ` — move them ${more} further apart, reduce a radius, or delete one of them`
        : manual.length ? `, and with the radius set on ${manual.join(' and ')} they cannot be joined into one curve either — set it back to auto or reduce it, or move them ${more} further apart`
          : `, and they could not be joined into one curve that fits between its neighbours — move them ${more} further apart, or delete one of them`;
      out.push({
        kind: 'transition', ...where,
        msg: `${bends(j.from, j.to)} turn the same way ${fmt(j.length)} m apart: their curves take ${fmt(tf)} + ${fmt(tt)} m of that leg${j.needFrom + j.needTo > 0 ? ` and transitions ${fmt(j.needFrom + j.needTo)} m more` : ''}, too much for a straight between them${tail}`,
      });
    }
  }
  return out;
}

export const ROAD_CHECKS: CheckFamily = {
  horizontal(al, norms) {
    return horizontalViolations(al, norms.speed);
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
