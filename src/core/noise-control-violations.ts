import type { Violation } from './checks';
import { noiseBarrier, wallAttenuation, type ExposureScratch, type NoiseReceiver } from './noise';
import { NOISE } from './data/urban';

/** Compute a sufficient height over ALL exposed pairs of each retained dwelling, then group nearby
 * failures by side/stretch. Never promise that a 4 m wall fixes an upper floor; never flood the HUD
 * with hundreds of houses ahead of gradient/geometry violations. */
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
  type Entry = (typeof pending extends Map<number, infer V> ? V : never);
  const groups: Entry[][] = [];
  for (const side of ['L', 'R']) {
    const ordered = [...pending.values()].filter((v) => v.r.unresolved!.side === side)
      .sort((a, b) => s[a.r.unresolved!.i] - s[b.r.unresolved!.i]);
    let group: Entry[] = [];
    for (const v of ordered) {
      const station = s[v.r.unresolved!.i];
      if (!group.length || station - s[group[group.length - 1].r.unresolved!.i] > 150
        || station - s[group[0].r.unresolved!.i] > 1000) { group = []; groups.push(group); }
      group.push(v);
    }
  }
  return groups.map((group): Violation => {
    const ids = group.map((v) => v.r.j), count = ids.length;
    let height = 0, excess = 0, from = Infinity, to = -Infinity;
    const sides = new Set<string>();
    for (const v of group) {
      height = Math.max(height, v.height); excess = Math.max(excess, v.r.unresolved!.excess);
      from = Math.min(from, v.s0); to = Math.max(to, v.s1);
      for (const side of v.sides) sides.add(side);
    }
    from = Math.max(0, from - NOISE.margin); to = Math.min(s[s.length - 1], to + NOISE.margin);
    const what = count === 1 ? `dwelling #${ids[0]}` : `${count} dwellings`;
    return {
      kind: 'noise', basis: 'game', s0: from, s1: to, size: excess,
      title: `Retained ${what} exceed${count === 1 ? 's' : ''} the noise limit by up to ${excess.toFixed(1)} dB`,
      fix: Number.isFinite(height) && height > 0
        ? `Add ${height} m walls on the ${[...sides].join(' and ')} from km ${(from / 1000).toFixed(2)} to ${(to / 1000).toFixed(2)}, or buy out ${what}`
        : `Buy out ${what}, or change the road to reduce the worst exposure by ${excess.toFixed(1)} dB`,
      detail: `Buildings: ${ids.map((j) => `#${j}`).join(', ')}. Keep or an explicit wall decision forbids automatic acquisition. Excess is evaluated with actual walls and cut edges at the top occupied floor. A buyout requires your explicit choice.`,
      rule: 'Provisional noise feasibility model: new-road façade limits 60 dB day / 50 dB night; not an acoustic assessment.',
    };
  }).sort((a, b) => a.s0 - b.s0);
}
