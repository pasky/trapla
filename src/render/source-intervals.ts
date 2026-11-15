import type { TransportGraphData, TransportRenderInterval } from '../core/project-transport';

export type LineInterval = readonly [number, number];
export type LineCuts = ReadonlyMap<number, readonly LineInterval[]>;

export function mergeLineIntervals(intervals: readonly LineInterval[]): LineInterval[] {
  const sorted = intervals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .map(([a, b]) => [a, b] as [number, number]).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && a <= previous[1]) previous[1] = Math.max(previous[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/** Sorted source- or render-chainage intervals. The artificial cut ends do not acquire round caps. */
export function remainingLineIntervals(a: number, b: number, cuts: readonly LineInterval[]): LineInterval[] {
  const keep: LineInterval[] = [];
  let from = a;
  for (const [lo, hi] of cuts) {
    if (hi <= from) continue;
    if (lo >= b) break;
    if (lo > from) keep.push([from, Math.min(lo, b)]);
    from = Math.max(from, hi);
    if (from >= b) break;
  }
  if (from < b) keep.push([from, b]);
  return keep;
}

/** Piecewise correspondence, including reverse-oriented render features. */
export function renderStation(interval: TransportRenderInterval, sourceS: number): number {
  const knots = interval.correspondence;
  for (let i = 1; i < knots.length; i++) if (sourceS <= knots[i].sourceS) {
    const a = knots[i - 1], b = knots[i];
    const t = Math.max(0, Math.min(1, (sourceS - a.sourceS) / (b.sourceS - a.sourceS)));
    return a.renderS + t * (b.renderS - a.renderS);
  }
  return knots[knots.length - 1].renderS;
}
const renderSpan = (interval: TransportRenderInterval, a = interval.s0, b = interval.s1): LineInterval => {
  const x = renderStation(interval, a), y = renderStation(interval, b);
  return [Math.min(x, y), Math.max(x, y)];
};

/** Only accepted source ownership removes old vector pavement. This is per feature, not a pixel
 * eraser: another road crossing the same pixels, or another owner of a shared feature, survives. */
export function sourceReplacementCuts(graph: TransportGraphData, accepted: readonly TransportRenderInterval[]): Map<string, Map<number, LineInterval[]>> {
  const claims = new Map<string, LineInterval[]>(), proposed = new Map<string, LineInterval[]>();
  const add = (map: Map<string, LineInterval[]>, key: string, span: LineInterval) => {
    const list = map.get(key); if (list) list.push(span); else map.set(key, [span]);
  };
  for (const interval of accepted) {
    add(claims, `${interval.featureId}\0${interval.sourceId}`, [interval.s0, interval.s1]);
    add(proposed, interval.featureId, renderSpan(interval));
  }
  for (const [key, spans] of claims) claims.set(key, mergeLineIntervals(spans));
  const retained = new Map<string, LineInterval[]>();
  for (const source of graph.sources) for (const interval of source.render) {
    if (!proposed.has(interval.featureId)) continue;
    const cuts = claims.get(`${interval.featureId}\0${source.id}`) ?? [];
    for (const [a, b] of remainingLineIntervals(interval.s0, interval.s1, cuts)) add(retained, interval.featureId, renderSpan(interval, a, b));
  }
  const features = new Map(graph.renderFeatures.map(f => [f.id, f])), layers = new Map<string, Map<number, LineInterval[]>>();
  for (const [id, spans] of proposed) {
    const feature = features.get(id);
    if (!feature) throw new Error('Replacement render feature is missing');
    const keep = mergeLineIntervals(retained.get(id) ?? []);
    const cuts = mergeLineIntervals(spans).flatMap(([a, b]) => remainingLineIntervals(a, b, keep));
    if (!cuts.length) continue;
    let layer = layers.get(feature.layer); if (!layer) layers.set(feature.layer, layer = new Map());
    layer.set(feature.polylineIndex, mergeLineIntervals([...(layer.get(feature.polylineIndex) ?? []), ...cuts]));
  }
  return layers;
}
