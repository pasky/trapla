// Following a mapped road with a handle (rebuilt-stretch ends, ui/stretch-ends.ts).
import type { SourceInterval } from '../core/project';
import type { TransportSource } from '../core/project-transport';

/** The unclaimed stretch of a source around station s (null: s itself is claimed by a project road). */
export function freeSpan(claimed: readonly SourceInterval[], transportData: string, sourceId: string, s: number, length: number) {
  let lo = 0, hi = length;
  for (const c of claimed) if (c.sourceId === sourceId && c.transportData === transportData) {
    if (c.s1 <= s) lo = Math.max(lo, c.s1); else if (c.s0 >= s) hi = Math.min(hi, c.s0); else return null;
  }
  return { lo, hi };
}

/** Nearest point of a source within `span`, searched continuously from the handle's station `from`: on a
 * hairpin or loop the handle follows the road instead of jumping to another leg that passes nearby. */
export function followSource(source: Pick<TransportSource, 'xy' | 'stations'>, span: { lo: number; hi: number }, x: number, y: number, from: number) {
  const window = 400;
  let s = from;
  for (let round = 0; round < 8; round++) {
    const lo = Math.max(span.lo, s - window), hi = Math.min(span.hi, s + window);
    let best = Infinity, next = s;
    for (let i = 1; i < source.stations.length; i++) {
      if (source.stations[i] < lo || source.stations[i - 1] > hi) continue;
      const ax = source.xy[2 * i - 2], ay = source.xy[2 * i - 1], dx = source.xy[2 * i] - ax, dy = source.xy[2 * i + 1] - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const at = Math.max(lo, Math.min(hi, source.stations[i - 1] + t * (source.stations[i] - source.stations[i - 1])));
      const distance = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
      if (distance < best) { best = distance; next = at; }
    }
    const edge = next <= lo + 1e-6 && lo > span.lo || next >= hi - 1e-6 && hi < span.hi;
    s = next; if (!edge) break; // reached the window edge: keep following the road
  }
  return s;
}
