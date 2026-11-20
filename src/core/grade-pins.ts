// Absolute-chainage constraints on the finished (parabolic), not tangent-polygon, grade line.
import type { Violation } from './checks';
import { elevations, type Profile, type VPI } from './vertical';

export interface GradePin { s: number; z: number }

/** Persistence boundary: finite nonnegative absolute stations, sorted; last edit wins duplicates.
 * No route-length clipping: pins beyond a shortened route remain saved and inactive. */
export function normalizeGradePins(raw: unknown): GradePin[] {
  if (!Array.isArray(raw)) return [];
  const byStation = new Map<number, GradePin>();
  for (const value of raw) {
    if (!value || typeof value !== 'object') continue;
    const { s, z } = value as Partial<GradePin>;
    if (typeof s !== 'number' || typeof z !== 'number' || !Number.isFinite(s) || !Number.isFinite(z) || s < 0) continue;
    byStation.set(s, { s, z });
  }
  return [...byStation.values()].sort((a, b) => a.s - b.s);
}

/** Game rule (PROVISIONAL, no norm says how steep a road may be built against it): a player's pin out of the norm's
 * reach is honoured only by a line at most this many times as steep as the norm allows there (motorway 4.5 % → 11 %, a
 * railway 12.5 ‰ → 31 ‰, still within what vehicles and trains climb), the factor the grade search's own last resort
 * uses (autoprofile.ts `relaxed`). Steeper: out of reach, left out. */
export const STEEP_MAX = 2.5;

/** Metres, inclusive. Applies to the actual smoothed road elevation, including endpoint pins. */
export const GRADE_PIN_TOLERANCE = 0.5;

export interface GradePinViolation extends Violation {
  kind: 'profile';
  pin: {
    index: number;
    requested: GradePin;
    actualZ: number | null;
    tolerance: number;
    reason: 'invalid' | 'gradient-envelope' | 'search' | 'clearance';
    /** reason 'clearance': the chainage of the crossing Auto's line keeps clear and a line through the pin would not */
    clearanceAt?: number;
    /** Necessary gradient-only bounds given fixed tie-ins and the OTHER pins' tolerance bands.
     * Not a claim that a vertical curve or a path through all pins exists. null = invalid station. */
    reachable: { min: number; max: number } | null;
    /** A computed edit, not an automatic edit. Search failures suggest the displayed fallback. */
    suggested: GradePin | null;
  };
}

/** Check active Auto pins against a finished profile. Manual mode must not call this.
 * Sorting + batched profile sampling + two sweeps: O(p log p + v log p) time / O(p)
 * memory for p pins and v VPIs, including coincident pins (curves do not overlap).
 * Profile endpoints are fixed tie-ins; pins never silently move them or clamp their station.
 * Finite pins outside the route are retained by the caller but inactive here.
 */
export function gradePinViolations(pins: readonly GradePin[], profile: Profile, maxGradient: number): GradePinViolation[] {
  const a = profile.pts[0], b = profile.pts[profile.pts.length - 1];
  const tol = GRADE_PIN_TOLERANCE;
  const ordered = pins.map((p, index) => ({ ...p, index }))
    .filter((p) => Number.isFinite(p.s) && Number.isFinite(p.z) && p.s >= a.s && p.s <= b.s)
    .sort((p, q) => p.s - q.s || p.index - q.index);
  const sampled = elevations(profile, ordered.map((p) => p.s));
  const actual = new Float64Array(pins.length);
  for (let i = 0; i < ordered.length; i++) actual[ordered[i].index] = sampled[i];
  const bounds = new Map<number, { min: number; max: number }>();
  let low = a.z + maxGradient * a.s, high = a.z - maxGradient * a.s;
  for (const p of ordered) {
    bounds.set(p.index, { min: low - maxGradient * p.s, max: high + maxGradient * p.s });
    low = Math.max(low, p.z - tol + maxGradient * p.s);
    high = Math.min(high, p.z + tol - maxGradient * p.s);
  }
  low = b.z - maxGradient * b.s; high = b.z + maxGradient * b.s;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const p = ordered[i], bound = bounds.get(p.index)!;
    bound.min = Math.max(bound.min, low + maxGradient * p.s);
    bound.max = Math.min(bound.max, high - maxGradient * p.s);
    if (p.s === a.s) { bound.min = Math.max(bound.min, a.z); bound.max = Math.min(bound.max, a.z); }
    if (p.s === b.s) { bound.min = Math.max(bound.min, b.z); bound.max = Math.min(bound.max, b.z); }
    low = Math.max(low, p.z - tol - maxGradient * p.s);
    high = Math.min(high, p.z + tol + maxGradient * p.s);
  }
  const out: GradePinViolation[] = [];
  for (let index = 0; index < pins.length; index++) {
    const p = pins[index];
    const finite = Number.isFinite(p.s) && Number.isFinite(p.z);
    const bound = bounds.get(index) ?? null;
    if (finite && !bound) continue; // saved absolute station is inactive on this route
    const actualZ = bound ? actual[index] : null;
    const outside = bound && (p.z + tol < bound.min - 1e-9 || p.z - tol > bound.max + 1e-9 || bound.min > bound.max + 1e-9);
    // (a pin met is met: out of the slopes' reach, only by a line steeper than the norm, said where it is)
    if (finite && bound && Math.abs(actualZ! - p.z) <= tol + 1e-9) continue;
    const reason = !finite ? 'invalid' : outside ? 'gradient-envelope' : 'search';
    const suggestedS = finite ? Math.max(a.s, Math.min(b.s, p.s)) : null;
    const suggestedZ = bound && bound.min <= bound.max
      ? outside ? Math.max(bound.min, Math.min(bound.max, p.z)) : actualZ!
      : actualZ;
    const suggested = suggestedS !== null && suggestedZ !== null ? { s: suggestedS, z: suggestedZ } : null;
    out.push({
      kind: 'profile', basis: outside ? 'norm' : 'engine',
      s0: Number.isFinite(p.s) ? p.s : a.s, s1: Number.isFinite(p.s) ? p.s : a.s,
      title: reason === 'invalid' ? 'Pinned height is not a number'
        : outside ? 'Pinned height out of reach: too steep' : 'Pinned height: no legal road found',
      fix: suggested ? `Set it to ${suggested.z.toFixed(2)} m, or unpin`
        : 'Unpin it',
      detail: bound ? `You asked for ${p.z.toFixed(2)} m; the road is at ${actualZ!.toFixed(2)} m. ${outside ? `Auto finds no road to it even ${STEEP_MAX} times as steep as allowed, so it leaves it out. Within the limit, slopes alone allow ${bound.min.toFixed(2)}–${bound.max.toFixed(2)} m here (counting your other pins, but not the room a change of slope needs); pins that conflict may need changing together.` : 'Auto found no road through it, not even a steeper one, so it leaves it out; it tries a limited set of heights, a legal one may still exist. The suggested height is where the road is now.'}` : 'A pin stays at its km position when you move the route; it is never moved for you.',
      rule: `The finished road must pass within ±${tol} m of each pinned height; the heights at A and B are fixed.`,
      size: actualZ !== null ? Math.abs(actualZ - p.z) : undefined,
      pin: { index, requested: { ...p }, actualZ, tolerance: tol, reason, reachable: bound, suggested },
    });
  }
  return out;
}

/** A pin Auto meets only by missing a clearance its own line keeps (at chainage `at`): left out, the line stays
 * Auto's own. evaluate.ts names what lies there. */
export function clearancePinViolation(v: GradePinViolation, at: number): GradePinViolation {
  const z = v.pin.actualZ!;
  return { ...v, basis: 'game', title: 'Pinned height out of reach: a crossing',
    fix: `Set it to ${z.toFixed(2)} m, or unpin`,
    detail: `You asked for ${v.pin.requested.z.toFixed(2)} m; through it our road would not clear what it crosses at km ${(at / 1000).toFixed(2)}.`,
    pin: { ...v.pin, reason: 'clearance', clearanceAt: at } };
}

/** Inward to the editor's 0.1 m step (towards `from`): a height typed from the card is the one checked. */
const inward = (z: number, from: number) => (z > from ? Math.floor(z * 10 + 1e-9) : Math.ceil(z * 10 - 1e-9)) / 10;
/** Most solves spent on one pin's suggestion (each re-solves only the windows and blocks around the pin when the
 * solve shares its memo). 0.1 m steps over the ≈ 3 m an envelope overshoots a 0.5 m grid search: 5 halvings. */
const SUGGEST_SOLVES = 6;

/**
 * Each pin Auto could not meet, with a suggested height the same solve does meet. The slopes' envelope is only
 * necessary: the search's grid (a 0.5 m grid takes ≤ 3 m per 254 m knot on a 12.5 ‰ railway, not 3.18 m) and
 * the changes of slope it needs leave its edge out of reach (the Královec railway at km 2.03: 440.44 m suggested,
 * 439.0 m reachable). `solve(pins)`: the grade search as the route's first solve, with these pins; a candidate is
 * reachable where its result reports no problem at it. Tried: the envelope's edge, then halving towards the
 * height the line has now (met by Auto's own line, so reachable), on the 0.1 m step, inward.
 */
export function reachableSuggestions(violations: readonly GradePinViolation[], pins: readonly GradePin[],
  solve: (pins: GradePin[]) => { pinViolations?: readonly GradePinViolation[] }): GradePinViolation[] {
  const missed = new Set(violations.map((v) => v.pin.index));
  const met = pins.filter((_, i) => !missed.has(i));
  return violations.map((v) => {
    const { requested, actualZ, suggested, reason } = v.pin;
    if (reason === 'invalid' || actualZ === null || !suggested) return v;
    const reaches = (z: number) => {
      const r = solve([...met, { s: requested.s, z }]);
      return !r.pinViolations?.some((x) => x.pin.index === met.length);
    };
    // (a failed search suggests the height now: the edge to try is the request itself)
    const from = inward(actualZ, requested.z), edge = inward(reason === 'search' || reason === 'clearance' ? requested.z : suggested.z, actualZ);
    let best = from;
    if (Math.abs(edge - from) > 1e-9) {
      // (a pin left out for a crossing was just found out of reach itself)
      if (reason !== 'clearance' && reaches(edge)) best = edge;
      else {
        // (lo reachable, hi not, in 0.1 m steps)
        let lo = Math.round(from * 10), hi = Math.round(edge * 10);
        for (let k = 1; k < SUGGEST_SOLVES && Math.abs(hi - lo) > 1; k++) {
          const mid = Math.trunc((lo + hi) / 2);
          if (reaches(mid / 10)) lo = mid; else hi = mid;
        }
        best = lo / 10;
      }
    }
    if (best === suggested.z) return v;
    return { ...v, fix: `Set it to ${best.toFixed(1)} m, or unpin`,
      detail: reason === 'clearance' ? v.detail : `You asked for ${requested.z.toFixed(2)} m; the road is at ${actualZ.toFixed(2)} m. Auto can reach at ${requested.z > actualZ ? 'most' : 'least'} ${best.toFixed(1)} m here.`,
      pin: { ...v.pin, suggested: { s: suggested.s, z: best } } };
  });
}

/** A pin the player set, honoured at a price (`kind` 'steep': the line steeper than the norm over s0–s1 next to it;
 * 'clearance': it misses what it crosses at s0 = s1): `z` is the height Auto reaches there within the norm (null: none
 * found), the fix of the problems there. */
export interface PinFix { index: number; pin: GradePin; kind: 'steep' | 'clearance'; s0: number; s1: number; z: number | null;
  /** 'clearance': the ways past the crossing the pin can take within the norm, each a height and what it builds there
   * (evaluate.ts pinWays; absent: `z` alone) */
  ways?: { z: number; label: string }[];
  /** 'clearance': what it misses (a railway, a river, a stream, a motorway …), our line's height over it and the
   * height it needs there, m */
  crossing?: { what: string; above: number; need: number };
}

/**
 * The pins a result honours at a price, each with the height its fix suggests (`reachableSuggestions` with the other
 * pins as they are, `strict` the route's first solve within the norm; none where that is the height it has). `steep`:
 * the stretches the line ran steep to meet a pin (autoprofile.ts honour); `blame(own)`: the crossings the line misses
 * that Auto's own line `own()` (no pins) keeps, by the pin in the way (autoprofile.ts pinClearanceBlame). Each pin's
 * problem without it (against `own()`) is what its suggestion is found from.
 */
export function honouredPinFixes(pins: readonly GradePin[], result: { steep?: readonly { s0: number; s1: number; pin: GradePin }[] },
  strict: (pins: GradePin[]) => { pinViolations?: readonly GradePinViolation[] }, own: () => VPI[],
  blame: (own: () => VPI[]) => Map<number, number[]>, profile: (vpis: VPI[]) => Profile, maxGradient: number): PinFix[] {
  const out: PinFix[] = [];
  let ownLine: VPI[] | undefined, lefts: GradePinViolation[] | undefined;
  const ownOnce = () => (ownLine ??= own());
  const leftOf = (k: number) => (lefts ??= gradePinViolations(pins, profile(ownOnce()), maxGradient)).find(v => v.pin.index === k);
  const heights = new Map<number, number | null>();
  const suggest = (k: number, at?: number) => {
    if (heights.has(k)) return heights.get(k)!;
    const v = leftOf(k), z = v ? reachableSuggestions([at !== undefined && v.pin.reason === 'search' ? clearancePinViolation(v, at) : v], pins, strict)[0].pin.suggested?.z ?? null : null;
    // (no edit that leaves the pin as it is)
    const h = z !== null && Math.abs(z - pins[k].z) > 0.05 ? z : null;
    heights.set(k, h);
    return h;
  };
  const steep = new Map<number, { s0: number; s1: number }>();
  for (const w of result.steep ?? []) {
    const k = pins.findIndex(p => p.s === w.pin.s && p.z === w.pin.z);
    if (k < 0) continue;
    const e = steep.get(k);
    if (e) { e.s0 = Math.min(e.s0, w.s0); e.s1 = Math.max(e.s1, w.s1); } else steep.set(k, { s0: w.s0, s1: w.s1 });
  }
  const blamed = blame(ownOnce);
  for (const [k, e] of steep) out.push({ index: k, pin: { ...pins[k] }, kind: 'steep', s0: e.s0, s1: e.s1, z: suggest(k) });
  for (const [k, ats] of blamed) for (const at of ats) out.push({ index: k, pin: { ...pins[k] }, kind: 'clearance', s0: at, s1: at, z: suggest(k, ats[0]) });
  return out;
}

/** A problem within this of where a pin's line misses a crossing is that crossing's, m (a bridge's span problem, a
 * stream's earthworks, at the crossing's own chainage or the bridge's ends). */
export const PIN_FIX_NEAR = 60;
/** what a crossing missed shows as: its clearance, our structure there, our works on it (a stream, a railway, a
 * protected area) */
const CROSSING_KINDS: ReadonlySet<string> = new Set(['crossing', 'structure', 'footprint']);

/** Of the problems at one crossing a pin's line misses, the one kept (its clearance before our works on it and the
 * structure there: one problem per crossing, the owner) */
const CROSSING_RANK: Record<string, number> = { crossing: 0, footprint: 1, structure: 2 };
const m1 = (x: number) => x.toFixed(1);

/**
 * The problems a player's pin causes where Auto honours it (`fixes`, honouredPinFixes): the fix is the pin's (each way
 * past a crossing it can take within the norm, a button each: `target.pin`; or the height Auto reaches; or unpin), and
 * the detail says the pin holds the line. 'steep': the too-steep stretches next to the pin; 'clearance': the crossing
 * it misses, one problem for it (its clearance, said as what our road does there: "Our road meets the railway at its
 * level (2.2 m under its rails)"), the others there (our works on it, our bridge's span) dropped.
 */
export function applyPinFixes(vs: readonly Violation[], fixes: readonly PinFix[]): Violation[] {
  if (!fixes.length) return [...vs];
  const fixOf = vs.map((v) => 'pin' in v || v.goal ? undefined : fixes.find((f) => f.kind === 'steep' ? v.kind === 'gradient' && v.s1 > f.s0 - 1 && v.s0 < f.s1 + 1
    : CROSSING_KINDS.has(v.kind) && v.s0 - PIN_FIX_NEAR <= f.s0 && f.s0 <= v.s1 + PIN_FIX_NEAR));
  // (one problem per crossing: the best ranked of those it has)
  const kept = new Map<PinFix, number>();
  vs.forEach((v, i) => {
    const f = fixOf[i];
    if (!f || f.kind !== 'clearance') return;
    const k = kept.get(f);
    if (k === undefined || CROSSING_RANK[v.kind] < CROSSING_RANK[vs[k].kind]) kept.set(f, i);
  });
  return vs.flatMap((v, i) => {
    const f = fixOf[i];
    if (!f) return [v];
    if (f.kind === 'clearance' && kept.get(f) !== i) return [];
    const km = (f.pin.s / 1000).toFixed(2), at = `${m1(f.pin.z)} m at km ${km}`;
    const ways = f.ways ?? (f.z !== null ? [{ z: f.z, label: '' }] : []);
    const verb = (z: number) => (z > f.pin.z ? 'raise' : 'lower');
    const fix = !ways.length ? `Unpin the height at km ${km}`
      : !f.ways ? `Set the pin at km ${km} to ${m1(ways[0].z)} m, or unpin`
        : `${ways.map((w, q) => `${q ? verb(w.z) : `${verb(w.z).replace(/^./, (c) => c.toUpperCase())} the pin at km ${km}`} ${q ? 'it ' : ''}to ${m1(w.z)} m (${w.label})`).join(', ')}, or unpin`;
    const why = f.kind === 'steep'
      ? `Your height pin (${at}) is out of reach within the limit: Auto builds our road through it as steep as it must be.`
      : `Your height pin (${at}) holds our road here.${ways.length ? ` At ${m1(ways[0].z)} m it clears this.` : ''}`;
    // (Auto's own line's words, "Auto keeps … within the limit when it can …": the pin is why)
    const detail = (v.detail ?? '').replace(/ Auto keeps the \w+ within the limit when it can;.*$/, '');
    // (a railway or a river only bridged: what our road does there)
    const c = f.crossing, over = v.kind === 'crossing' && v.clearance === 'above' && c && (c.what === 'railway' || c.what === 'river');
    const title = !over ? v.title : c.above < 0
      ? `Our road meets the ${c.what} at its level (${m1(-c.above)} m under its ${c.what === 'railway' ? 'rails' : 'water'})`
      : `Our bridge over the ${c.what} is too low (${m1(c.above)} m over it, it needs ${m1(c.need)} m)`;
    return [{ ...v, title, fix, detail: `${detail ? `${detail} ` : ''}${why}`,
      target: { ...v.target, pin: { s: f.pin.s, z: ways[0]?.z ?? null, ...(f.ways ? { ways: f.ways.map((w) => ({ ...w })) } : {}) } } }];
  });
}
