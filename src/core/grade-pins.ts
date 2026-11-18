// Absolute-chainage constraints on the finished (parabolic), not tangent-polygon, grade line.
import type { Violation } from './checks';
import { elevations, type Profile } from './vertical';

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
    if (finite && bound && !outside && Math.abs(actualZ! - p.z) <= tol + 1e-9) continue;
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
      detail: bound ? `You asked for ${p.z.toFixed(2)} m; the road is at ${actualZ!.toFixed(2)} m. Slopes alone allow ${bound.min.toFixed(2)}–${bound.max.toFixed(2)} m here (counting your other pins, but not the room a change of slope needs). ${outside ? 'Pins that conflict may need changing together.' : 'Automatic tries a limited set of heights; a legal one may still exist. The suggested height is where the road is now.'}` : 'A pin stays at its km position when you move the route; it is never moved for you.',
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
