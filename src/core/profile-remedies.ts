// Cheap local Auto refinement after an obstacle-free bridge layout reveals its actual depth.
// This is not another DP search: raise a smooth neighbourhood, propagate grade bounds, and accept
// only a complete norm/pin-compliant profile. Manual grades are never passed to this helper.
import { ROAD_CHECKS } from './checks';
import { speedNorms } from './data/norms';
import type { CategoryId } from './data/categories';
import { buildProfile, elevations, type VPI } from './vertical';

export function liftAutoProfile(vpis: readonly VPI[], requirements: readonly { s: number; z: number }[],
  speed: number, maxGradient: number, pins: readonly { s: number; z: number }[] = [], diagnostic?: (message: string) => void,
  category?: CategoryId): VPI[] | undefined {
  if (!requirements.length || vpis.length < 3) return;
  const targets = [...requirements].sort((a, b) => a.s - b.s), norms = speedNorms(speed, category);
  const locked = vpis.map((p, i) => i === 0 || i === vpis.length - 1 || pins.some(pin => Math.abs(pin.s - p.s) < 0.1));
  for (const radius of [600, 1200, 2400]) {
    const candidate = vpis.map(p => ({ ...p }));
    let impossible = false;
    for (let iteration = 0; iteration < 6; iteration++) {
      const profile = buildProfile(candidate, norms.minCrestRadius, norms.minSagRadius), z = elevations(profile, targets.map(p => p.s));
      const deficits = targets.map((p, i) => Math.max(0, p.z + 0.15 - z[i]));
      if (deficits.every(d => d <= 0.01)) {
        const pinZ = elevations(profile, [...pins].sort((a, b) => a.s - b.s).map(p => p.s));
        const issues = ROAD_CHECKS.vertical(profile, norms, maxGradient);
        if (issues.length === 0 && [...pins].sort((a, b) => a.s - b.s).every((p, i) => Math.abs(pinZ[i] - p.z) <= 0.05)) return candidate;
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
        const need = candidate[j].z - maxGradient * Math.abs(candidate[i].s - candidate[j].s);
        if (candidate[i].z >= need - 1e-8) continue;
        if (locked[i]) { diagnostic?.(`radius ${radius}: grade bound reaches fixed km ${(candidate[i].s / 1000).toFixed(3)} (+${(need - candidate[i].z).toFixed(2)} m)`); impossible = true; break; }
        candidate[i].z = need;
      }
      if (impossible) break;
    }
  }
}
