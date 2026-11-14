// Display-only sections of the priced bridge spans. Supports are supplied by the shared
// footprint layout, so ordinary and obstacle-adjusted bridges use the same pier positions.
export interface BridgeDeckSpan { s0: number; s1: number; depth: number }
export function bridgeDeckSpans(s0: number, s1: number, piers: readonly number[]): BridgeDeckSpan[] {
  const stations = [s0, ...piers.filter(s => s > s0 && s < s1).sort((a,b) => a-b), s1];
  return stations.slice(1).flatMap((s,i) => s > stations[i]
    ? [{ s0: stations[i], s1: s, depth: Math.max(1.2,(s-stations[i])/20) }] : []);
}
function spanAt(spans: readonly BridgeDeckSpan[], s: number): number {
  let lo = 0, hi = spans.length-1;
  while (lo < hi) {
    const mid = (lo+hi) >>> 1;
    if (s >= spans[mid].s1) lo = mid+1; else hi = mid;
  }
  return lo;
}
/** A flat pier top must reach both unequal/sloping soffits. Its overlap inside the deeper
 * deck is hidden; stopping at that deeper soffit would leave the shallow span unsupported. */
export function bridgePierTop(spans: readonly BridgeDeckSpan[], s0: number, s1: number,
  highestGrade: (s0: number, s1: number) => number): number {
  return Math.max(...bridgeDeckSegments(spans,s0,s1).map(span => highestGrade(span.s0,span.s1)-span.depth));
}
/** Split a route interval at actual supports, retaining the existing half-station deck
 * extension into the abutment with the depth of its nearest span. */
export function bridgeDeckSegments(spans: readonly BridgeDeckSpan[], s0: number, s1: number): BridgeDeckSpan[] {
  if (!spans.length) return [];
  const out: BridgeDeckSpan[] = [];
  let i = spanAt(spans,s0), s = s0;
  while (s < s1) {
    const end = i === spans.length-1 ? s1 : Math.min(s1,spans[i].s1);
    out.push({ s0: s, s1: end, depth: spans[i].depth });
    s = end; i++;
  }
  return out;
}
