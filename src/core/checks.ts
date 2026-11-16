// Norm checks as per-family functions (roads now; rail would add its own family using cant), and the
// player-facing violation messages: a short headline, ONE concrete fix with a number wherever one can be
// computed, a plain-words explanation, and what the requirement rests on (a norm, a game rule, or a
// limitation of the game's own solvers). Words: src/core/terms.ts (glossary + banned jargon), enforced
// for every violation kind by tests/player-text.test.ts.

import { CATEGORIES, type CategoryId } from './data/categories';
import { bendRules, horizontalRules, LOCAL_NORM, SPEED_NORMS, TRACK_NORM, type SpeedNorms } from './data/norms';
import { CATEGORY_RANK, TRAFFIC_THRESHOLDS } from './data/scenario';
import { buildAlignment, EDIT_TOLERANCE, MAX_DEFLECTION, ratioExcess, type Alignment, type CurveInfo, type HorizontalRules, type PI, type Vec2 } from './horizontal';
import { gradeLimitOf, type GradeLimit, type Profile } from './vertical';
import { RAIL_MAX_GRADIENT } from './data/railway';
import { acos, sin, tan } from './detmath';

export const VIOLATION_KINDS = ['radius', 'transition', 'arcShort', 'compound', 'gradient', 'crest', 'sag', 'vcOverlap', 'oob',
  'category', 'time', 'profile', 'section', 'crossing', 'structure', 'building', 'noise', 'footprint', 'station'] as const;
export type ViolationKind = typeof VIOLATION_KINDS[number];

/** what a requirement rests on: a design norm, a rule / simplification of the game, or a limitation of
 *  the game's solvers (they found no valid shape although one may exist) */
export type ViolationBasis = 'norm' | 'game' | 'engine';

/** Numeric diagnostics for the geometry model, not proof that every norm-compliant shape is impossible. */
export interface HorizontalConstraint {
  rule: 'transition-space' | 'reverse-straight' | 'compound-ratio';
  source: string;
  manualRadii: { pi: number; radius: number; maxRadius?: number | null; autoRadius?: number }[];
  requiredLength?: number;
  availableLength?: number;
  /** Extra leg length at unchanged angles/radii, not a guarantee for an arbitrary point move. */
  extraDistance?: number;
  joinFailure?: 'edit-tolerance' | 'fixed-geometry' | 'search';
  requiredOffset?: number;
  editTolerance?: number;
  compoundRatio?: { actual: number; maximum: number };
}

export interface Violation {
  kind: ViolationKind;
  /** short headline in everyday words (no location: s0 / s1 give that) */
  title: string;
  /** one concrete fix, with the number to set / the distance to move where it can be computed */
  fix: string;
  /** why, in plain words (and other ways to fix it) */
  detail?: string;
  basis: ViolationBasis;
  /** the requirement in plain words with its source, e.g. "ČSN 73 6101: …" */
  rule: string;
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
  /** how much the fix asks for (m); of nearby entries merged into one, the largest is kept */
  size?: number;
  horizontal?: HorizontalConstraint;
  /** A missed crossing clearance, independent of the road/railway wording (Auto separation retry):
   * `water` a stream neither high enough over its culvert nor deep enough under it in a tunnel. */
  clearance?: 'above' | 'either' | 'water';
  /** what the violation is about, so the UI can select it and offer the fix as a button */
  target?: ViolationTarget;
}

export interface ViolationTarget {
  /** buildings (pack indices) */
  buildings?: number[];
  /** crossed road (pack road id) */
  road?: number;
  /** a wall that fixes it: sides, height (m) and station range */
  wall?: { sides: ('L' | 'R')[]; height: number; s0: number; s1: number };
}

/** one-line form for logs and scripts */
export const violationText = (v: Violation) => `${v.title} — ${v.fix}`;


/** the inputs of the alignment, so that fixes (e.g. the largest radius that fits) can be computed */
export interface HorizontalInput { a: Vec2; b: Vec2; pis: PI[]; category?: CategoryId }

export interface CheckFamily {
  horizontal(al: Alignment, norms: SpeedNorms, input?: HorizontalInput): Violation[];
  vertical(p: Profile, norms: SpeedNorms, maxGradient: GradeLimit, rail?: boolean, stretch?: StretchNorms): Violation[];
}

const fmt = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const up = (v: number, step = 1) => Math.ceil(v / step - 1e-9) * step;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const deg = (rad: number) => fmt((rad * 180) / Math.PI);

// ---- largest radius that fits ----------------------------------------------------------------------

export const R_MAX = 30000;

/**
 * For bend i: its automatic radius, and the largest radius that adds no horizontal violation (none
 * involving the bend, and no more in total than with its automatic radius); `max` is null if even the
 * automatic radius does not fit.
 * Feasibility is not monotonic in the radius — e.g. room for transitions runs out, then from the
 * transition-free radius on the curve fits again — so the whole range is sampled (12 % steps plus the
 * transition-free boundary) and the upper edge of the last feasible stretch refined. A feasible
 * stretch narrower than the sampling can be missed. The result is rounded down to the editing step
 * when such a value fits, otherwise to the metre.
 */
export function radiusOptions(a: Vec2, b: Vec2, pis: PI[], i: number, speed: number, category?: CategoryId): { auto: number; max: number | null } | null {
  const rules = bendRules(pis, speed, category)?.(i) ?? horizontalRules(speed, category);
  const viol = (r: number | null) => {
    const changed = pis.map((p, k) => (k === i ? { ...p, r } : p));
    const al = buildAlignment(a, b, changed, horizontalRules(speed, category), bendRules(changed, speed, category));
    return { al, v: horizontalViolations(al, speed, category ? { a, b, pis: [], category } : undefined) };
  };
  const base = viol(null);
  const c0 = base.al.curves[i];
  if (!c0 || c0.unit < 0) return null;
  const auto = c0.rEff;
  if (base.v.some((x) => x.pis?.includes(i))) return { auto, max: null };
  const fits = (r: number) => { const { v } = viol(r); return v.length <= base.v.length && !v.some((x) => x.pis?.includes(i)); };
  const start = Math.max(c0.rEff, rules.minRadius);
  const samples: number[] = [];
  for (let r = start; r < R_MAX; r *= 1.12) samples.push(r);
  const plain = Math.ceil(rules.plainRadius);
  if (plain > start && plain < R_MAX) samples.push(plain, plain + 5);
  samples.push(R_MAX);
  samples.sort((p, q) => p - q);
  let best = -1;
  samples.forEach((r, k) => { if (fits(r)) best = k; });
  if (best < 0) return { auto, max: null };
  if (best === samples.length - 1) return { auto, max: R_MAX };
  let lo = samples[best], hi = samples[best + 1];
  for (let it = 0; it < 24 && hi - lo > 0.5; it++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  // a round number at the editing step if one fits just below the edge
  const step = lo >= 400 ? 5 : 1;
  for (const r of [Math.floor(hi / step) * step, Math.floor(lo / step) * step, Math.floor(lo)]) if (r > 0 && fits(r)) return { auto, max: r };
  return { auto, max: lo };
}

/** largest radius for bend i that adds no horizontal violation; null if even the automatic one does not fit */
export function maxRadiusThatFits(a: Vec2, b: Vec2, pis: PI[], i: number, speed: number, category?: CategoryId): number | null {
  return radiusOptions(a, b, pis, i, speed, category)?.max ?? null;
}

// ---- railway ends on a track ------------------------------------------------------------------------

/** A railway end on an existing track (a station of the mission, or a mapped line it branches off or
 * rebuilds) leaves it at no more than a turnout's angle (data/railway.ts TURNOUT_ANGLE_RAD). `ends.a` /
 * `ends.b`: that track's direction at the end; `zone`: the tie-in
 * length; `minRadius`: the line's smallest curve (how far out a missing bend goes). The fix turns the
 * end's bend about the end onto the track's line. */
export function trackEndViolations(a: Vec2, b: Vec2, pis: readonly PI[], length: number,
  ends: { a?: TrackEnd; b?: TrackEnd }, maxAngle: number, zone: number, minRadius: number): Violation[] {
  const out: Violation[] = [];
  for (const end of ['a', 'b'] as const) {
    const t = ends[end];
    if (!t) continue;
    const p = end === 'a' ? a : b, k = end === 'a' ? 0 : pis.length - 1, q = pis.length ? pis[k] : end === 'a' ? b : a;
    const vx = q.x - p.x, vy = q.y - p.y, L = Math.hypot(vx, vy);
    if (L < 1e-6) continue;
    const dot = (vx * t.dir.x + vy * t.dir.y) / L, angle = acos(Math.min(1, Math.abs(dot)));
    if (angle <= maxAngle + 1e-9) continue;
    const deg = (angle * 180) / Math.PI, max = fmt((maxAngle * 180) / Math.PI, 1), move = 2 * L * sin(angle / 2);
    if (t.continues) {
      // a rebuilt stretch continuing the old track: its end straight (to the first bend) is the joint
      const reach = Math.min(L, length), s0 = end === 'a' ? 0 : length - reach, s1 = end === 'a' ? reach : length;
      // without a bend: one on the old track's line, a minimum curve's tangent length out (at least 50 m)
      const out1 = Math.max(50, Math.round(minRadius * tan(angle / 2) / 50) * 50);
      out.push({ kind: 'station', basis: 'game', s0, s1, size: move,
        title: 'Our railway meets the old track at a sharp angle',
        fix: pis.length ? `Move ${bend(k)} about ${fmt(move)} m onto the line of the old track`
          : `Add a bend about ${fmt(out1)} m out along the old track`,
        detail: `It turns by ${fmt(deg)}° where it joins the old track. A track turns only in a curve, not at a point; the game allows a corner no sharper than a turnout's ${max}°.`,
        rule: `Game rule: a rebuilt stretch continues the old track; no corner sharper than a standard turnout J60-1:12-500 (${max}°)`,
        ...(pis.length ? { pi: k, pis: [k] } : {}) });
      continue;
    }
    const s0 = end === 'a' ? 0 : Math.max(0, length - zone), s1 = end === 'a' ? Math.min(zone, length) : length;
    const out1 = Math.round((zone + minRadius * tan(angle / 2)) / 50) * 50;
    out.push({ kind: 'station', basis: 'norm', s0, s1, size: move,
      title: 'Our railway leaves the existing tracks at a sharp angle',
      fix: pis.length ? `Move ${bend(k)} about ${fmt(move)} m onto the line of the existing tracks`
        : `Add a bend about ${fmt(out1)} m out along the existing tracks`,
      detail: `It leaves them at ${fmt(deg)}°. A railway branches off a track through a turnout, at no more than ${max}°, and turns only after it.`,
      rule: `Standard turnout J60-1:12-500: branches off at ${max}°`,
      ...(pis.length ? { pi: k, pis: [k] } : {}) });
  }
  return out;
}
/** an existing track at a railway's end: its direction (unit, either way); `continues`: the old track a
 * rebuilt stretch continues (no turnout there: the line goes straight on) */
export interface TrackEnd { dir: Vec2; continues?: boolean }

// ---- horizontal (roads) --------------------------------------------------------------------------

const bend = (k: number) => `bend ${k + 1}`;
const bends = (a: number, b: number) => (a === b ? bend(a) : b === a + 1 ? `bends ${a + 1} and ${b + 1}` : `bends ${a + 1}–${b + 1}`);
/** two neighbours (points between them that carry no curve are not counted) */
const pair = (a: number, b: number) => `bends ${a + 1} and ${b + 1}`;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R = (r: number) => `R ${fmt(r)} m`;
const MAX_RADIUS_SEARCHES = 4;

/** Source line for railway geometry rules: older teaching values, not the current norm (research/23, /34). */
export const RAIL_NORM = 'ČSN 73 6360-1 as taught at VUT (2009 lectures, provisional)';
export function horizontalViolations(al: Alignment, speed: number, input?: HorizontalInput): Violation[] {
  const out: Violation[] = [];
  const rail = !!input?.category && CATEGORIES[input.category].mode === 'railway';
  const minor = input?.category ? CATEGORIES[input.category].minor : undefined;
  const tol = 1e-6;
  /** the rule texts for a bend's own rules (its stretch's design speed) */
  const texts = (RR: HorizontalRules, speed: number) => {
  const lt = RR.transition, plain = Math.ceil(RR.plainRadius);
  return {
    minRadius: rail ? `${RAIL_NORM}: at ${speed} km/h a curve needs a radius of at least ${fmt(RR.minRadius)} m (150 mm cant, 80 mm cant deficiency)`
      : minor === 'track' ? `${TRACK_NORM}: at ${speed} km/h a curve on a paved track must have a radius of at least ${fmt(RR.minRadius)} m`
      : `${minor ? LOCAL_NORM : 'ČSN 73 6101'}: at ${speed} km/h a curve must have a radius of at least ${fmt(RR.minRadius)} m (with the road banked at 6 %)`,
    easing: rail ? `${RAIL_NORM}: every curve needs a linear cant ramp of 10·V per mm of cant, ${fmt(lt)} m at the full 150 mm; half lies on the straight, half on the curve`
      : `ČSN 73 6101:2018 (Radimský 2019, slide 15): minimum transition length is max(${fmt(lt)} m, superelevation runoff length); runoff is not modelled here. Game simplifications: from ${R(plain)} on a curve gets none (derived from ${fmt(lt)} m transitions, not a verified 2018 threshold), and half of each easing curve lies on the straight, half on the curve`,
    reverse: minor ? `Game geometry: two curves turning opposite ways may meet but not overlap; ${minor === 'track' ? TRACK_NORM : LOCAL_NORM} asks for no straight between them (research/42)`
      : `ČSN 73 6101 (as given in a pre-2018 VUT teaching text, not verified against the 2018 edition): between two curves turning opposite ways their easing curves (≥ ${fmt(lt)} m each) may touch, but curves without easing curves (${R(plain)} and more) need a ${fmt(RR.reverseStraight)} m straight between them`,
    compound: minor ? `Game rule (provisional): curves turning the same way that meet as one curve may differ in radius at most ${fmt(RR.compoundRatio)}×`
      : `ČSN 73 6101 (as given in a pre-2018 VUT teaching text, not verified against the 2018 edition): the exceptional compound of same-direction arcs without an intermediate transition requires adjacent radius ratio ≤ ${fmt(RR.compoundRatio)}. The game freely uses this exception and also omits transitions between two transition-free arcs`,
    uturn: `Game limit: no curve is built for a turn sharper than ${deg(MAX_DEFLECTION)}°`,
    noJoin: `Game geometry model: joined arcs must stay within ${fmt(EDIT_TOLERANCE)} m of the tangent legs; intermediate easing curves are not modelled. Failure to join is not proof that no ČSN-compliant alignment exists`,
  };
  };
  /** a bend's rules, design speed and rule texts */
  const at = (k: number) => {
    const RR = al.rulesAt?.[k] ?? al.rules, v = RR.speed ?? speed;
    return { RR, speed: v, lt: RR.transition, plain: Math.ceil(RR.plainRadius), rules: texts(RR, v) };
  };
  const rules = texts(al.rules, speed);
  // fixes that need the design itself (only when the caller passed it; never in the radius search).
  // A search costs ~25 ms on a 13-bend route, so only the first few bends get one per evaluation.
  const cache = new Map<number, ReturnType<typeof radiusOptions>>();
  const options = (k: number) => {
    if (!input || !input.pis[k] || (!cache.has(k) && cache.size >= MAX_RADIUS_SEARCHES)) return null;
    if (!cache.has(k)) cache.set(k, radiusOptions(input.a, input.b, input.pis, k, speed, input.category));
    return cache.get(k)!;
  };
  /** for a hand-set radius among `cs` that is too large: "Set bend k back to auto (R …) or to at most R …" */
  const reduceFix = (cs: (CurveInfo | null)[]) => {
    let best: { c: CurveInfo; auto: number; max: number } | null = null;
    for (const c of cs) {
      if (!c || c.auto) continue;
      const o = options(c.index);
      if (!o || o.max === null || o.max >= c.r - 0.5) continue;
      if (!best || o.max / c.r > best.max / best.c.r) best = { c, auto: o.auto, max: o.max };
    }
    if (!best) return null;
    const auto = up(best.auto);
    return {
      bend: best.c.index,
      text: best.max - auto < 5 ? `Set ${bend(best.c.index)} back to auto (${R(auto)})`
        : `Set ${bend(best.c.index)} back to auto (${R(auto)}) or to at most ${R(best.max)}`,
    };
  };
  const autoOf = (k: number) => { const o = options(k); return o ? ` (${R(up(o.auto))})` : ''; };
  const manualRadii = (cs: (CurveInfo | null)[]): HorizontalConstraint['manualRadii'] =>
    cs.filter((c): c is CurveInfo => !!c && !c.auto).map((c) => {
      const o = options(c.index);
      return { pi: c.index, radius: c.r, ...(o ? { maxRadius: o.max, autoRadius: o.auto } : {}) };
    });

  for (const c of al.curves) {
    if (!c.tooSharp) continue;
    out.push({
      kind: 'radius', s0: c.sStart, s1: c.sEnd, pi: c.index, pis: [c.index],
      title: `${cap(bend(c.index))} turns back almost on itself`,
      fix: `Move ${bend(c.index)} or its neighbours so that the road turns less than ${deg(MAX_DEFLECTION)}° there (now ${deg(c.delta)}°)`,
      detail: 'No curve can be built for a near U-turn. You can also add a bend next to it to split the turn in two.',
      basis: 'game', rule: rules.uturn,
    });
  }
  for (const u of al.units) {
    const { RR, speed, lt, plain, rules } = at(u.first);
    const where = { s0: u.sStart, s1: Math.max(u.sEnd, u.sStart), pi: u.first, pis: range(u.first, u.last) };
    const easeNeed = (u.transitions * lt) / 2;
    if (u.first === u.last) {
      const c = al.curves[u.first];
      if (RR.hairpin && c.r < RR.minRadius - tol) {
        out.push({
          kind: 'radius', ...where,
          title: `Hairpin at ${bend(c.index)} is too tight`,
          fix: `Set ${bend(c.index)} to at least ${R(RR.minRadius)}, or back to auto`,
          detail: `Its radius is ${R(c.r)}; a hairpin needs at least ${R(RR.minRadius)}.`,
          basis: 'norm', rule: 'ČSN 73 6101:2000 §8.5.7, table 12: hairpins of at least 30 m with 8 % banking, driven at 30 km/h (research/54 §1)',
        });
      } else if (c.r < RR.minRadius - tol) {
        out.push({
          kind: 'radius', ...where,
          title: `${cap(bend(c.index))} is too sharp for ${speed} km/h`,
          fix: `Set ${bend(c.index)} to at least ${R(RR.minRadius)}, or back to auto${autoOf(c.index)}`,
          detail: `Its radius is ${R(c.r)}; ${speed} km/h needs at least ${R(RR.minRadius)}. A lower design speed allows sharper curves.`,
          basis: 'norm', rule: rules.minRadius,
        });
      }
      if (u.transitions > 0 && c.r * c.delta < easeNeed - tol) {
        const need = Math.min(Math.ceil(lt / c.delta), plain);
        out.push({
          kind: 'arcShort', ...where,
          title: `${cap(bend(c.index))}: curve too short for its easing curves`,
          fix: `Set ${bend(c.index)} to at least ${R(need)}, or back to auto${autoOf(c.index)}`,
          detail: `At ${R(c.r)} this gentle turn (${deg(c.delta)}°) gives a curve only ${fmt(c.r * c.delta)} m long, but its easing curves take ${fmt(easeNeed)} m of it.${need >= plain ? ` From ${R(plain)} on no easing curves are needed.` : ''}`,
          basis: 'norm', rule: rules.easing,
        });
      }
      continue;
    }
    // compound curve
    const members = al.curves.slice(u.first, u.last + 1).filter((c) => c.unit >= 0);
    const gaps = al.joints.filter((j) => j.kind === 'compound' && j.from >= u.first && j.to <= u.last).map((j) => j.length);
    const apart = gaps.length === 1 || Math.round(Math.min(...gaps)) === Math.round(Math.max(...gaps))
      ? `${fmt(Math.min(...gaps))} m apart` : `${fmt(Math.min(...gaps))}–${fmt(Math.max(...gaps))} m apart`;
    const name = bends(u.first, u.last);
    /** joined automatically, the curve's radii and length grow about in proportion to the spacing */
    const spread = (factor: number) => u.last === u.first + 1
      ? `Move ${name} about ${fmt(up(gaps[0] * (factor - 1), 5))} m further apart`
      : `Spread ${name} out so that the gaps between them grow by about ${fmt(up((factor - 1) * 100, 5))} %`;
    let worst: (typeof members)[number] | null = null;
    for (const c of members) {
      if (c.rEff >= RR.minRadius - tol) continue;
      if (!c.auto) {
        out.push({
          kind: 'radius', s0: c.sStart, s1: c.sEnd, pi: c.index, pis: [c.index],
          title: `${cap(bend(c.index))} is too sharp for ${speed} km/h`,
          fix: `Set ${bend(c.index)} to at least ${R(RR.minRadius)}, or back to auto${autoOf(c.index)}`,
          detail: `It is part of one curve through ${name}; its radius is ${R(c.rEff)}, ${speed} km/h needs at least ${R(RR.minRadius)}.`,
          basis: 'norm', rule: rules.minRadius,
        });
      } else if (!worst || c.rEff < worst.rEff) worst = c;
    }
    if (worst) {
      out.push({
        kind: 'radius', ...where, pi: worst.index,
        title: `${cap(name)} merge into one curve that is too sharp`,
        fix: `${spread(RR.minRadius / worst.rEff)}, or make them turn less`,
        detail: `${cap(name)} turn the same way only ${apart}, so they are drawn as one curve; its radius${u.last > u.first + 1 ? ` at ${bend(worst.index)}` : ''} is ${R(worst.rEff)}, but ${speed} km/h needs at least ${R(RR.minRadius)}. Further apart, the curve gets wider.`,
        basis: 'norm', rule: rules.minRadius,
      });
    }
    if (u.transitions > 0 && u.arcLen < easeNeed - tol) {
      const manual = members.filter((c) => !c.auto);
      out.push({
        kind: 'arcShort', ...where,
        title: `${cap(name)}: joined curve too short for its easing curves`,
        fix: manual.length
          ? `Set ${manual.map((c) => bend(c.index)).join(' and ')} to at least ${R(plain)} (no easing curves needed), or back to auto`
          : `${spread(easeNeed / Math.max(1, u.arcLen))}, or set their radii to at least ${R(plain)}`,
        detail: `${cap(name)} turn the same way ${apart} and are drawn as one curve, only ${fmt(u.arcLen)} m long; its easing curves take ${fmt(easeNeed)} m of it.`,
        basis: 'norm', rule: rules.easing,
      });
    }
  }
  for (const j of al.joints) {
    const { RR, rules } = at(j.to >= 0 ? j.to : Math.max(0, j.from));
    const a = j.from >= 0 ? al.curves[j.from] : null, b = j.to >= 0 ? al.curves[j.to] : null;
    const where = { s0: j.s0, s1: j.s1, pi: j.to >= 0 ? j.to : j.from, pis: [j.from, j.to].filter((k) => k >= 0) };
    if (j.kind === 'compound') {
      if (!a || !b) continue;
      const lo = Math.min(a.rEff, b.rEff), hi = Math.max(a.rEff, b.rEff);
      if (ratioExcess(lo, hi, RR) === 0) continue;
      const big = a.rEff > b.rEff ? a : b, small = big === a ? b : a;
      const fix = !big.auto ? reduceFix([big])?.text ?? `Set ${bend(big.index)} to at most ${R(Math.floor(lo * RR.compoundRatio))}, or back to auto${autoOf(big.index)}`
        : !small.auto ? `Set ${bend(small.index)} to at least ${R(Math.ceil(hi / RR.compoundRatio))}, or back to auto${autoOf(small.index)}`
          : `Move ${pair(j.from, j.to)} so that the turn is spread more evenly between them, or delete one`;
      out.push({
        kind: 'compound', ...where,
        horizontal: {
          rule: 'compound-ratio', source: rules.compound, manualRadii: manualRadii([a, b]),
          compoundRatio: { actual: hi / lo, maximum: RR.compoundRatio },
        },
        title: `${cap(pair(j.from, j.to))}: radii too different for one curve`,
        fix,
        detail: `They turn the same way ${fmt(j.length)} m apart and are drawn as one curve, with ${R(a.rEff)} at ${bend(a.index)} and ${R(b.rEff)} at ${bend(b.index)}: more than ${fmt(RR.compoundRatio)}× apart.${!big.auto ? ` Moving the bends far enough apart for a straight between the curves also works.` : ''}`,
        basis: 'norm', rule: rules.compound,
      });
      continue;
    }
    const used = j.tFrom + j.needFrom + j.tTo + j.needTo;
    const short = used - j.length;
    if (short <= tol) continue;
    const tf = Math.max(0, j.tFrom), tt = Math.max(0, j.tTo); // (a joined curve may begin past its first bend)
    const more = `${fmt(up(short))} m`;
    const ease = j.needFrom + j.needTo;
    const room = `${fmt(tf)} + ${fmt(tt)} m of curve${ease > 0 ? `, ${fmt(ease)} m of ${j.kind === 'reverse' && (j.plainFrom || j.plainTo) ? 'easing curve and straight' : 'easing'}` : ''}`;
    const need = (what: string) => `${what} need ${fmt(used)} m between ${pair(j.from, j.to)} (${room}), but the bends are only ${fmt(j.length)} m apart.`;
    const or = (t: string) => `Alternatively, ${t.charAt(0).toLowerCase()}${t.slice(1)}.`;
    const reverseStraight = j.kind === 'reverse' && (j.plainFrom || j.plainTo);
    const horizontal: HorizontalConstraint = {
      rule: reverseStraight ? 'reverse-straight' : 'transition-space',
      source: reverseStraight ? rules.reverse : rules.easing,
      manualRadii: manualRadii([a, b]), requiredLength: used, availableLength: j.length, extraDistance: short,
      ...(j.joinFailed ? { joinFailure: j.joinFailure ?? 'search', requiredOffset: j.requiredOffset, editTolerance: EDIT_TOLERANCE } : {}),
      ...(j.kind === 'same' && a && b && !a.auto && !b.auto && ratioExcess(a.r, b.r, RR) > 0
        ? { compoundRatio: { actual: Math.max(a.r, b.r) / Math.min(a.r, b.r), maximum: RR.compoundRatio } } : {}),
    };
    if (j.kind === 'end') {
      const c = (a && a.unit >= 0 ? a : b)!;
      const atStart = c === b;
      const other = atStart ? (j.from < 0 ? 'A' : `the U-turn at ${bend(j.from)}`) : j.to < 0 ? 'B' : `the U-turn at ${bend(j.to)}`;
      const t = atStart ? tt : tf, need = atStart ? j.needTo : j.needFrom;
      const red = reduceFix([c]);
      const move = `Move ${bend(c.index)} at least ${more} further from ${other}`;
      out.push({
        kind: 'transition', ...where, pi: c.index, horizontal,
        title: `${cap(bend(c.index))} is too close to ${other}`,
        fix: red ? red.text : move,
        detail: `${cap(bend(c.index))} is ${fmt(j.length)} m from ${other}, but its curve needs ${fmt(t)} m of that${need > 0 ? ` plus ${fmt(need)} m for its easing curve` : ''}. ${red ? or(move) : 'A smaller radius or a gentler turn also helps.'}`,
        basis: 'norm', rule: need > 0 ? rules.easing : rules.minRadius,
      });
    } else if (j.kind === 'reverse') {
      const red = reduceFix([a, b]);
      const move = `Move ${pair(j.from, j.to)} at least ${more} further apart`;
      out.push({
        kind: 'transition', ...where, pi: red?.bend ?? where.pi, horizontal,
        title: `${cap(pair(j.from, j.to))} are too close for an S-bend`,
        fix: red ? red.text : move,
        detail: `${need(j.plainFrom && j.plainTo ? 'The two curves and the straight they need between them' : 'The two curves and their easing curves')} ${red ? or(move) : 'Smaller radii or deleting one bend also help.'}`,
        basis: minor ? 'game' : 'norm', rule: j.plainFrom || j.plainTo || minor ? rules.reverse : rules.easing,
      });
    } else {
      // same direction, too close for a straight; normally such bends are joined into one curve
      const manual = [a, b].filter((c): c is CurveInfo => !!c && !c.auto);
      const red = reduceFix([a, b]);
      const move = `Move ${pair(j.from, j.to)} at least ${more} further apart`;
      const why = need(`The two curves turning the same way${ease > 0 ? ' plus their easing curves' : ''}`);
      const set = manual.length ? ` Hand-set radii: ${manual.map((c) => `${bend(c.index)} ${R(c.r)}`).join(', ')}.` : '';
      const join = !j.joinFailed ? ''
        : j.joinFailure === 'edit-tolerance' && j.requiredOffset !== undefined
          ? ` Joining with these radii would move the arc junction ${fmt(j.requiredOffset, 1)} m off the tangent leg; the editor allows ${fmt(EDIT_TOLERANCE)} m.`
          : j.joinFailure === 'fixed-geometry'
            ? ' These fixed radii cannot close a direct compound between the outer tangent lines in the game model.'
            : ' No joined curve was found within the editor tolerance and neighbouring-leg constraints; this is not a proof of a norm violation.';
      const ratio = horizontal.compoundRatio
        ? ` Their radius ratio ${fmt(horizontal.compoundRatio.actual, 2)} exceeds ${fmt(RR.compoundRatio)} for the exceptional compound without intermediate easing curves.` : '';
      out.push({
        kind: 'transition', ...where, pi: red?.bend ?? manual[0]?.index ?? where.pi, horizontal,
        title: `${cap(pair(j.from, j.to))} are too close for their radii`,
        fix: red ? red.text : `${move}${j.joinFailed && !manual.length ? ', or delete one' : ''}`,
        detail: `${why}${set}${join}${ratio} ${red ? or(move) : manual.length ? 'Try auto to let the neighbouring radii adapt.' : ''} Spacing advice assumes the current turning angles.`.trim(),
        basis: 'game',
        rule: `${rules.easing}. ${rules.noJoin}${ratio ? `. ${rules.compound}` : ''}`,
      });
    }
  }
  return out;
}

// ---- vertical (roads) ----------------------------------------------------------------------------

/** Norms that vary along the road: a stretch's own design speed at a chainage (M4) */
export type StretchNorms = (s: number) => SpeedNorms;

export function verticalViolations(p: Profile, norms: SpeedNorms, maxGradientAt: GradeLimit, rail = false, stretch?: StretchNorms): Violation[] {
  const out: Violation[] = [];
  const last = p.pts.length - 1;
  // "the height point at km …": the points carry no numbers in the profile, the station finds them
  const vpi = (k: number) => (k === 0 ? 'the start' : k === last ? 'the end' : `the height point at km ${fmt(p.pts[k].s / 1000, 2)}`);
  // track grades in per mille, road grades in per cent
  const G = (g: number) => rail ? `${fmt(Math.abs(g) * 1000, 1)} ‰` : `${fmt(Math.abs(g) * 100, 1)} %`;
  const pct = (g: number) => fmt(g * 100, Number.isInteger(Math.round(g * 1000) / 10) ? 0 : 1);
  const gradeRule = (maxGradient: number) => rail && maxGradient > RAIL_MAX_GRADIENT + 1e-9 ? `Game rule: a rebuilt stretch of a line may be as steep as that line is there, ${fmt(maxGradient * 1000, 1)} ‰`
    : rail ? `TSI INF §4.2.3.3: the steepest grade is set for the line's traffic; for passenger and freight trains the game uses ${fmt(maxGradient * 1000, 1)} ‰, as SŽDC's new-line study did (Čech 2018)`
    : norms.norm ? `${norms.norm}: at most ${pct(maxGradient)} % gradient for this road`
    : `ČSN 73 6101: at most ${pct(maxGradient)} % gradient for this road here (by the steepness of the ground around it; less in a hairpin)`;
  for (let i = 0; i < p.grades.length; i++) {
    const g = p.grades[i];
    const a = p.pts[i], b = p.pts[i + 1], L = b.s - a.s;
    const maxGradient = gradeLimitOf(maxGradientAt, a.s, b.s);
    if (Math.abs(g) <= maxGradient + 1e-6) continue;
    const dz = (Math.abs(g) - maxGradient) * L; // height to take out of this stretch
    const rise = g > 0;
    // move one interior end of the stretch; prefer the one whose other grade stays (more) within the limit
    const cands: { k: number; verb: string; other: number }[] = [];
    if (i > 0) { // move the start: raise it on a climb, lower it on a descent
      const s = rise ? dz : -dz;
      cands.push({ k: i, verb: rise ? 'Raise' : 'Lower', other: Math.abs((a.z + s - p.pts[i - 1].z) / (a.s - p.pts[i - 1].s)) });
    }
    if (i + 1 < last) {
      const s = rise ? -dz : dz;
      cands.push({ k: i + 1, verb: rise ? 'Lower' : 'Raise', other: Math.abs((p.pts[i + 2].z - b.z - s) / (p.pts[i + 2].s - b.s)) });
    }
    cands.sort((x, y) => x.other - y.other);
    const h = Math.ceil(dz * 10 - 1e-6) / 10;
    const needL = Math.abs(b.z - a.z) / maxGradient;
    const lengthen = `This ${rise ? 'climb' : 'descent'} of ${fmt(Math.abs(b.z - a.z), 1)} m needs at least ${fmt(up(needL, 10))} m at ${G(maxGradient)}; it has ${fmt(L)} m.`;
    out.push({
      kind: 'gradient', s0: a.s, s1: b.s, vpi: cands[0]?.k ?? i,
      title: `Too steep: ${G(g)} ${rise ? 'climb' : 'descent'}`,
      fix: cands.length ? `${cands[0].verb} ${vpi(cands[0].k)} by ${fmt(h, 1)} m` : 'Pin a lower / higher height here, or make the route longer',
      detail: `Between ${vpi(i)} and ${vpi(i + 1)} the road ${rise ? 'climbs' : 'falls'} ${G(g)}; the limit is ${G(maxGradient)}. ${lengthen}${cands.length > 1 ? ` ${cands[1].verb} ${vpi(cands[1].k)} by ${fmt(h, 1)} m also works.` : ''} Automatic road height stays within the limit when it can.`,
      basis: 'norm', rule: gradeRule(maxGradient),
    });
  }
  const reported = new Set<string>();
  for (const c of p.curves) {
    if (c.type === 'none') continue;
    const where = { s0: c.s - c.lenEff / 2, s1: c.s + c.lenEff / 2, vpi: c.index };
    const crest = c.type === 'crest';
    const n = stretch?.(c.s) ?? norms;
    const min = crest ? n.minCrestRadius : n.minSagRadius;
    const word = crest ? 'Hilltop' : 'Dip';
    if (c.r < min - 1e-6) {
      out.push({
        kind: c.type, ...where,
        title: `${word} too sharp`,
        fix: `Set the ${crest ? 'hilltop' : 'dip'} rounding at ${vpi(c.index)} to ≥ ${fmt(min)} m`,
        detail: `Its radius is ${fmt(c.r)} m; ${n.speed} km/h needs at least ${fmt(min)} m${crest ? ' so that drivers can see far enough over the top' : ' for comfort and for headlights to reach far enough at night'}.`,
        basis: 'norm', rule: rail ? `Plášek, VUT 2009 (provisional): rail vertical curves at ${n.speed} km/h need a radius of at least ${fmt(min)} m (2,000 m, or 0.4·V²)`
          : `${n.verticalNorm ?? n.norm ?? 'ČSN 73 6101'}: ${crest ? 'crest' : 'sag'} curves at ${n.speed} km/h need a radius of at least ${fmt(min)} m`,
      });
    }
    if (c.lenEff < c.len - 1e-3) {
      // the side where the curve and its neighbour fit worst
      const k = p.curves.indexOf(c);
      const side = (dir: -1 | 1) => {
        const nb = p.curves[k + dir], j = c.index + dir;
        const space = Math.abs(p.pts[j].s - c.s);
        return { j, nb, short: c.len / 2 + (nb ? nb.len / 2 : 0) - space };
      };
      const l = side(-1), r = side(1);
      const w = l.short >= r.short ? l : r;
      const key = `${Math.min(w.j, c.index)}-${Math.max(w.j, c.index)}`;
      if (reported.has(key)) continue;
      reported.add(key);
      const both = !!w.nb && w.nb.type !== 'none' && w.nb.len > 0;
      out.push({
        kind: 'vcOverlap', ...where,
        title: both ? 'Two roundings of the road height overlap' : 'Rounding of the road height does not fit',
        fix: `Move ${vpi(c.index)} at least ${fmt(up(w.short))} m further from ${vpi(w.j)}`,
        detail: `The ${crest ? 'hilltop' : 'dip'} rounding at ${vpi(c.index)} needs ${fmt(c.len)} m (radius × change of slope)${both ? ` and the one at ${vpi(w.j)} ${fmt(w.nb!.len)} m; half of each must fit between the two points` : `; half of it must fit before ${vpi(w.j)}`}, but they are only ${fmt(Math.abs(p.pts[w.j].s - c.s))} m apart. A smaller radius (not below the minimum) or a smaller change of slope also helps.`,
        basis: 'game', rule: 'Game rule: every rounding (vertical curve) must fit whole between its neighbours — a squeezed one would be sharper than its radius says',
      });
    }
  }
  return out;
}

export const ROAD_CHECKS: CheckFamily = {
  horizontal(al, norms, input) {
    return horizontalViolations(al, norms.speed, input);
  },
  vertical(p, norms, maxGradient, rail, stretch) {
    return verticalViolations(p, norms, maxGradient, rail, stretch);
  },
};

// ---- other checks of the evaluation (messages only; the conditions live in evaluate.ts) --------------

/** a side slope that does not reach the ground within `width` m; `above` = largest grade − ground there */
export function slopeViolation(s0: number, s1: number, above: number, below: number, width: number): Violation {
  const fill = above >= below;
  return {
    kind: 'section', s0, s1,
    title: fill ? 'Embankment never reaches the ground' : 'Cutting never reaches the top of the slope',
    // (a height that rounds to 0.0 m: the hillside alone is too steep, the height is no lever)
    fix: fill ? (above >= 0.05 ? `Lower the road here (now up to ${fmt(above, 1)} m above the ground), or move it off the steep hillside` : 'Move the road off the steep hillside here')
      : below >= 0.05 ? `Raise the road here (now up to ${fmt(below, 1)} m below the ground), or move it off the steep hillside` : 'Move the road off the steep hillside here',
    detail: `The hillside is about as steep as the ${fill ? 'embankment' : 'cutting'} slope, so the side slope runs on for more than ${fmt(width)} m without meeting the ground.`,
    basis: 'game', rule: `Game limit: side slopes are modelled only ${fmt(width)} m to each side of the road`,
    size: Math.max(above, below),
  };
}

/** How the clearance problem's title starts (over a river, a railway …): evaluate.ts recognises it by
 * this when it rewords a railway's problems, so the wording and the logic cannot drift apart. */
export const ROAD_TOO_LOW = 'Road too low';
/** the grade too low over a river / railway (`below` undefined), or neither above nor below a motorway */
export function crossingViolation(s: number, what: string, above: number, need: number, below?: number): Violation {
  const raise = Math.ceil((need - above) * 10 - 1e-6) / 10;
  const h = (v: number) => `${fmt(Math.abs(v), 1)} m ${v >= 0 ? 'above' : 'below'} it`;
  if (below === undefined) {
    return {
      kind: 'crossing', s0: s, s1: s, clearance: 'above',
      title: `${ROAD_TOO_LOW} over the ${what}`,
      fix: `Raise the road here by ${fmt(raise, 1)} m`,
      detail: `To bridge the ${what} the road must be at least ${fmt(need, 1)} m above it; it is ${h(above)}.`,
      basis: 'game', rule: `Game assumption: a bridge needs the road at least ${fmt(need, 1)} m above a ${what} (deck plus clearance)`,
      size: raise,
    };
  }
  const lower = Math.ceil((above + below) * 10 - 1e-6) / 10;
  const r = `Raise the road here by ${fmt(raise, 1)} m to bridge over it`, l = `lower it by ${fmt(lower, 1)} m to pass under it`;
  return {
    kind: 'crossing', s0: s, s1: s, clearance: 'either',
    title: `The ${what} cannot be crossed on the level`,
    fix: raise <= lower ? `${r} (or ${l})` : `${cap(l)} (or ${r.charAt(0).toLowerCase()}${r.slice(1)})`,
    detail: `The road must be at least ${fmt(need, 1)} m above the ${what} (a bridge) or ${fmt(below, 1)} m below it (then its own bridge carries it over our cutting); it is ${h(above)}.`,
    basis: 'norm', rule: `ČSN 73 6101: motorways and expressways are crossed only at a different level (research/08). The ${fmt(need, 1)} m / ${fmt(below, 1)} m heights are game estimates`,
    size: Math.min(raise, lower),
  };
}

const MERGEABLE = new Set<ViolationKind>(['crossing', 'section', 'oob']);

/**
 * Entries of the same kind and cause (same headline) less than `gap` m apart become one: it spans them
 * all and keeps the text of the one whose fix asks for most. Bend / profile-point violations stay
 * separate (each names its own point). Expects each kind in station order.
 */
export function mergeNearby(vs: Violation[], gap = 100): Violation[] {
  const out: Violation[] = [];
  const last = new Map<string, { v: Violation; n: number; s0: number }>();
  const groups: { v: Violation; n: number; s0: number }[] = [];
  for (const v of vs) {
    if (!MERGEABLE.has(v.kind)) { out.push(v); continue; }
    const key = `${v.kind}|${v.title}`;
    const g = last.get(key);
    if (g && v.s0 - g.v.s1 <= gap) {
      const s1 = Math.max(g.v.s1, v.s1);
      if ((v.size ?? 0) > (g.v.size ?? 0)) Object.assign(g.v, v);
      g.v.s0 = g.s0; g.v.s1 = s1;
      g.n++;
      continue;
    }
    const e = { v: { ...v }, n: 1, s0: v.s0 };
    last.set(key, e);
    groups.push(e);
    out.push(e.v);
  }
  for (const g of groups) {
    if (g.n > 1) g.v.detail = `${g.v.detail ?? ''} (${g.n} places between km ${fmt(g.v.s0 / 1000, 2)} and km ${fmt(g.v.s1 / 1000, 2)}; the numbers are for the worst.)`.trim();
  }
  return out;
}

export function oobViolation(s0: number, s1: number, length: number): Violation {
  return {
    kind: 'oob', s0, s1,
    title: 'Road leaves the map',
    fix: 'Move the route back inside the play area',
    detail: `${fmt(length)} m of the road or its side slopes lie outside the terrain data.`,
    basis: 'game', rule: 'Game limit: the road and its slopes must stay on the terrain data',
    size: length,
  };
}

export function profileViolation(length: number, maxGradient: number, rail = false): Violation {
  return {
    kind: 'profile', s0: 0, s1: length,
    title: 'Auto found no legal road height',
    fix: 'Climb more gently (longer route), or set heights by hand',
    detail: `None of the road heights it tried stays within ${rail ? `${fmt(maxGradient * 1000, 1)} ‰` : `${fmt(maxGradient * 100, 0)} %`} with the minimum hilltop and dip roundings and the required clearances. The other messages show where it fails.`,
    basis: 'engine', rule: 'Engine limitation: Automatic tries a limited set of road heights; a legal one may still exist',
  };
}

export function categoryViolation(length: number, category: CategoryId, traffic: number, needed: CategoryId): Violation {
  const cap = (c: CategoryId) => TRAFFIC_THRESHOLDS.find((t) => t.category === c)?.maxAadt ?? Infinity;
  const short = (c: CategoryId) => CATEGORIES[c].label.split(' (')[0];
  return {
    kind: 'category', goal: true, s0: 0, s1: length,
    title: 'Road too narrow for the traffic',
    fix: `Switch the category to ${CATEGORIES[needed].label}`,
    detail: `${short(category)} ${CATEGORIES[category].minor ? 'is built for local traffic only' : `carries up to ${fmt(cap(category))} vehicles a day`}; the scenario expects ${fmt(traffic)}.${CATEGORY_RANK[needed] >= CATEGORY_RANK['D27.5'] ? ' (No playable category is wide enough.)' : ''}`,
    basis: 'norm', rule: 'TP 188 / TP 189: the road must keep traffic flowing at level of service C in the design hour (research/14)',
  };
}

/** `average`: length ÷ travel time where stretches have their own design speeds (absent: `speed` throughout) */
export function timeViolation(length: number, speed: number, travelMin: number, maxMin: number, average = speed): Violation {
  const mixed = Math.abs(average - speed) > 1e-6;
  const maxLen = (maxMin * 60 * average) / 3.6;
  const faster = mixed ? undefined : Object.keys(SPEED_NORMS).map(Number).filter((v) => v > speed && (length / (v / 3.6)) / 60 <= maxMin).sort((p, q) => p - q)[0];
  return {
    kind: 'time', goal: true, s0: 0, s1: length,
    title: `Too slow: ${fmt(travelMin, 2)} min`,
    fix: mixed ? `Shorten the route by at least ${fmt(up(length - maxLen, 10))} m, or raise the design speed of a slower stretch`
      : `Shorten the route by at least ${fmt(up(length - maxLen, 10))} m${faster ? ` (or raise the design speed to ${faster} km/h)` : ''}`,
    detail: mixed ? `Travel time is each stretch's length ÷ its design speed: ${fmt(length / 1000, 2)} km at ${fmt(average)} km/h on average. The target is ${fmt(maxMin, 1)} min.`
      : `Travel time is length ÷ speed: ${fmt(length / 1000, 2)} km at ${fmt(speed)} km/h. The target is ${fmt(maxMin, 1)} min, i.e. at most ${fmt(maxLen / 1000, 2)} km at ${fmt(speed)} km/h.${faster ? ' A higher design speed needs wider curves.' : ''}`,
    basis: 'game', rule: `Scenario goal: travel time at most ${fmt(maxMin, 1)} min`,
  };
}
