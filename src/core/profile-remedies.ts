// Cheap local Auto refinement after an obstacle-free bridge layout reveals its actual depth.
// This is not another DP search: raise a smooth neighbourhood, propagate grade bounds, and accept
// only a complete norm/pin-compliant profile. Manual grades are never passed to this helper.
import { ROAD_CHECKS, type StretchNorms } from './checks';
import { speedNorms } from './data/norms';
import type { CategoryId } from './data/categories';
import { buildProfile, elevations, gradeLimitOf, type GradeLimit, type RadiusLimit, type VPI } from './vertical';

export function liftAutoProfile(vpis: readonly VPI[], requirements: readonly { s: number; z: number }[],
  speed: number, maxGradient: GradeLimit, pins: readonly { s: number; z: number }[] = [], diagnostic?: (message: string) => void,
  category?: CategoryId, range?: readonly [number, number], free?: readonly [number, number],
  radii?: { crest: RadiusLimit; sag: RadiusLimit; stretch?: StretchNorms }): VPI[] | undefined {
  if (!requirements.length || vpis.length < 3) return;
  const targets = [...requirements].sort((a, b) => a.s - b.s), norms = speedNorms(speed, category);
  const crest = radii?.crest ?? norms.minCrestRadius, sag = radii?.sag ?? norms.minSagRadius;
  // `free`: only the line between these chainages may move (a block of the grade solve): a vertex is put
  // at each of its ends and held there with everything beyond it
  const base = buildProfile([...vpis], crest, sag);
  if (free) vpis = withVertices(vpis, free);
  const locked = vpis.map((p, i) => i === 0 || i === vpis.length - 1 || pins.some(pin => Math.abs(pin.s - p.s) < 0.1)
    || (!!free && (p.s <= free[0] + 0.5 || p.s >= free[1] - 0.5)));
  // (the issues the line had before, outside the range: not this lift's to answer for unless it makes them worse)
  const had = new Map(range ? ROAD_CHECKS.vertical(base, norms, maxGradient, false, radii?.stretch).map(v => [issueKey(base.pts, v), v.size ?? 0]) : []);
  const pinZ0 = elevations(base, [...pins].sort((a, b) => a.s - b.s).map(p => p.s));
  for (const radius of [600, 1200, 2400]) {
    const candidate = vpis.map(p => ({ ...p }));
    let impossible = false;
    for (let iteration = 0; iteration < 6; iteration++) {
      // everything judged on the line it returns (a vertex put in at a free stretch's end and not turning there
      // is no point of it: it would clip the curves beside it)
      const out = free ? straightened(candidate) : candidate;
      const profile = buildProfile(out, crest, sag), z = elevations(profile, targets.map(p => p.s));
      const deficits = targets.map((p, i) => Math.max(0, p.z + 0.15 - z[i]));
      if (deficits.every(d => d <= 0.01)) {
        const pinZ = elevations(profile, [...pins].sort((a, b) => a.s - b.s).map(p => p.s));
        // With a range (one stretch of several lifted separately): the issues there, and any elsewhere that the
        // line before did not have, or had smaller (where it turns at a free stretch's end, beside a curve).
        const inRange = (v: { s0: number; s1: number }) => !range || (v.s1 >= range[0] && v.s0 <= range[1]);
        const issues = ROAD_CHECKS.vertical(profile, norms, maxGradient, false, radii?.stretch)
          .filter(v => inRange(v) || (v.size ?? 0) > (had.get(issueKey(profile.pts, v)) ?? -Infinity) + 0.05);
        // a pin keeps the height the line had there (the DP meets a pin within its tolerance, not exactly)
        if (issues.length === 0 && pinZ.every((z, i) => Math.abs(z - pinZ0[i]) <= 0.05)) return out;
        diagnostic?.(`radius ${radius}: ${issues.map(v => `${v.title}@${v.s0.toFixed(0)}`).join(', ') || 'grade pin moved'}`);
        break;
      }
      for (let i = 1; i + 1 < candidate.length; i++) {
        if (locked[i]) continue;
        let lift = 0;
        for (let j = 0; j < targets.length; j++) {
          const distance = Math.abs(candidate[i].s - targets[j].s) / radius;
          if (distance >= 1) continue;
          lift = Math.max(lift, deficits[j] * (1 - distance * distance) ** 2 * 1.12);
        }
        candidate[i].z += lift;
      }
      // Least upward envelope satisfying both grade directions; endpoints and pins stay exact.
      for (const direction of [1, -1]) for (let k = 1; k < candidate.length; k++) {
        const i = direction > 0 ? k : candidate.length - 1 - k, j = i - direction;
        const need = candidate[j].z - gradeLimitOf(maxGradient, Math.min(candidate[i].s, candidate[j].s), Math.max(candidate[i].s, candidate[j].s)) * Math.abs(candidate[i].s - candidate[j].s);
        if (candidate[i].z >= need - 1e-8) continue;
        // (between two fixed points the line is as it was: a player's pin honoured by a stretch steeper than the norm)
        if (locked[i] && locked[j] && pins.length) continue;
        if (locked[i]) { diagnostic?.(`radius ${radius}: grade bound reaches fixed km ${(candidate[i].s / 1000).toFixed(3)} (+${(need - candidate[i].z).toFixed(2)} m)`); impossible = true; break; }
        candidate[i].z = need;
      }
      if (impossible) break;
    }
  }
}

/** an issue of a line, by what it is and where: a grade or an overlap by the two points it lies between, a curve
 * too sharp by its point */
const issueKey = (pts: readonly { s: number }[], v: { kind: string; vpi?: number; s0: number; s1: number }) =>
  v.kind === 'crest' || v.kind === 'sag' ? `${v.kind}@${Math.round(pts[v.vpi!].s * 10)}` : `${v.kind}@${Math.round(v.s0 * 10)}-${Math.round(v.s1 * 10)}`;

/** The polyline with a vertex at each of the given chainages (on the line: the profile is unchanged). */
function withVertices(vpis: readonly VPI[], at: readonly number[]): VPI[] {
  const out = vpis.map(p => ({ ...p }));
  for (const s of at) {
    const k = out.findIndex(p => p.s >= s - 0.5);
    if (k <= 0 || Math.abs(out[k].s - s) <= 0.5) continue;
    const a = out[k - 1], b = out[k];
    out.splice(k, 0, { s, z: a.z + (b.z - a.z) * (s - a.s) / (b.s - a.s), r: null });
  }
  return out;
}
/** Without the vertices that no longer turn the line (those put in at a free stretch's ends). */
function straightened(vpis: VPI[]): VPI[] {
  return vpis.filter((p, i) => i === 0 || i === vpis.length - 1
    || Math.abs((vpis[i + 1].z - p.z) / (vpis[i + 1].s - p.s) - (p.z - vpis[i - 1].z) / (p.s - vpis[i - 1].s)) > 1e-9);
}
