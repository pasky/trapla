import type { Violation } from './checks';
import { noiseBarrier, wallAttenuation, type ExposureScratch, type NoiseReceiver } from './noise';
import { NOISE } from './data/urban';

/** One blocking issue per retained dwelling. Compute a sufficient menu height over ALL exposed
 * pairs, not just the worst current station; never promise that a 4 m wall fixes an upper floor. */
export function noiseControlViolations(receivers: readonly NoiseReceiver[], scratch: ExposureScratch,
  s: ArrayLike<number>, crownWidth: number): Violation[] {
  const pending = new Map(receivers.filter((r) => r.unresolved).map((r) => [r.j,
    { r, height: 0, s0: Infinity, s1: -Infinity, sides: new Set<string>() }]));
  if (!pending.size) return [];
  const barrier = noiseBarrier(crownWidth);
  for (const p of scratch.pairs) {
    const v = pending.get(p.j);
    if (!v || p.need === 0) continue;
    const height = Number.isFinite(p.need) ? p.need : wallAttenuation(p.d, p.height, 6, barrier) >= p.excess - 1e-6 ? 6 : Infinity;
    v.height = Math.max(v.height, height);
    v.s0 = Math.min(v.s0, s[p.i]); v.s1 = Math.max(v.s1, s[p.i]); v.sides.add(p.left ? 'left' : 'right');
  }
  return [...pending.values()].map(({ r, height, s0, s1, sides }) => {
    const u = r.unresolved!;
    const from = Math.max(0, s0 - NOISE.margin), to = Math.min(s[s.length - 1], s1 + NOISE.margin);
    return {
      kind: 'noise', basis: 'game', s0: s[u.i], s1: s[u.i], size: u.excess,
      title: `Retained dwelling #${r.j} exceeds the noise limit by ${u.excess.toFixed(1)} dB`,
      fix: Number.isFinite(height) && height > 0
        ? `Add ${height} m walls on the ${[...sides].join(' and ')} from km ${(from / 1000).toFixed(2)} to ${(to / 1000).toFixed(2)}, or buy out dwelling #${r.j}`
        : `Buy out dwelling #${r.j}, or move/lower the road to reduce exposure by ${u.excess.toFixed(1)} dB`,
      detail: 'Keep or an explicit wall decision forbids automatic acquisition. The remaining excess is evaluated with the actual built walls and cut edges at the top occupied floor. A buyout requires your explicit choice.',
      rule: 'Provisional noise feasibility model: new-road façade limits 60 dB day / 50 dB night; not an acoustic assessment.',
    };
  });
}
