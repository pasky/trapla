import type { Violation } from './checks';
import type { NoiseReceiver } from './noise';

/** Retained dwellings still over the limit (a Keep or a wall choice stopped the automatic buyout), grouped
 * by side and stretch. Each carries the computed sufficient wall (one stretch on top of what is built, at
 * every storey) or none. Never flood the HUD with hundreds of houses ahead of geometry violations. */
export function noiseControlViolations(receivers: readonly NoiseReceiver[], s: ArrayLike<number>,
  /** side roads joining ours (their junction opens the gap in a wall) */
  junctions: readonly { s: number; roadId?: number }[] = []): Violation[] {
  const pending = receivers.filter((r) => r.unresolved);
  if (!pending.length) return [];
  const groups: NoiseReceiver[][] = [];
  for (const side of ['L', 'R']) {
    const ordered = pending.filter((r) => r.unresolved!.side === side).sort((a, b) => s[a.unresolved!.i] - s[b.unresolved!.i]);
    let group: NoiseReceiver[] = [];
    for (const r of ordered) {
      const station = s[r.unresolved!.i];
      if (!group.length || station - s[group[group.length - 1].unresolved!.i] > 150
        || station - s[group[0].unresolved!.i] > 1000) { group = []; groups.push(group); }
      group.push(r);
    }
  }
  return groups.map((group): Violation => {
    const ids = group.map((r) => r.j), count = ids.length, side = group[0].unresolved!.side;
    let height = 0, excess = 0, from = Infinity, to = -Infinity, gap = false, canWall = true;
    for (const r of group) {
      const u = r.unresolved!;
      excess = Math.max(excess, u.excess); gap ||= !!u.gap;
      if (u.fix) { height = Math.max(height, u.fix.height); from = Math.min(from, u.fix.s0); to = Math.max(to, u.fix.s1); }
      else { canWall = false; from = Math.min(from, s[u.i]); to = Math.max(to, s[u.i]); }
    }
    const what = count === 1 ? 'House' : `${count} houses`;
    // the side road whose junction leaves the gap: its card offers crossing it without one
    let road: number | undefined, near = Infinity;
    if (gap && !canWall) for (const c of junctions) {
      const d = Math.max(0, from - c.s, c.s - to);
      if (c.roadId !== undefined && d < near) { near = d; road = c.roadId; }
    }
    const sideName = side === 'L' ? 'left' : 'right';
    return {
      kind: 'noise', basis: 'game', s0: from, s1: to, size: excess,
      title: `${what} ${count === 1 ? '' : 'up to '}${excess.toFixed(1)} dB too loud`,
      fix: canWall ? `${height} m wall ${sideName}, or buy out` : gap ? 'Buy out, or cross the side road without a junction' : 'Buy out, or move the road away',
      detail: `${gap && !canWall ? 'The noise comes through the gap in the wall where a side road joins; a wall cannot close it. ' : ''}Your wall or Keep choice stops the automatic buyout. Levels are at the loudest floor, walls and cuts included.`,
      rule: 'Government Order 272/2011: 60 dB by day, 50 dB at night at the façade (game estimate, not an acoustic study)',
      target: { buildings: ids, ...(canWall ? { wall: { sides: [side], height, s0: from, s1: to } } : {}), ...(road !== undefined && near < 300 ? { road } : {}) },
    };
  }).sort((a, b) => a.s0 - b.s0);
}
