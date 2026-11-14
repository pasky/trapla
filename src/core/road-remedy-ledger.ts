import type { CrossingPoint } from './crossings';
import type { FootprintConflict } from './footprint';
import type { RoadRealignmentPlan, RoadSourceInterval } from './road-realignment';
import { ACCESS, ROAD_CLASSES } from './data/urban';

// Sub-millimetre equality absorbs arithmetic reversal only; it never snaps network anchors.
const pointKey = (p: CrossingPoint) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)},${p.surface}`;
function canonicalPath(points: CrossingPoint[], costs: number[] = []) {
  const p = points.map(pointKey), forward = p.join(';'), reverse = [...p].reverse().join(';');
  return forward <= reverse ? { key: forward, costs } : { key: reverse, costs: [...costs].reverse() };
}
function paths(plan: RoadRealignmentPlan) {
  return [plan.geometry.road, ...(plan.geometry.links ?? [])].filter((p): p is CrossingPoint[] => !!p?.length);
}
function physicalKey(plan: RoadRealignmentPlan): string {
  return JSON.stringify([plan.geometry.width, plan.turnaroundRadius ?? 0, paths(plan).map(p => canonicalPath(p).key).sort(),
    (plan.geometry.turnarounds ?? []).map(pointKey).sort()]);
}
function canonicalCosts(plan: RoadRealignmentPlan): number[] {
  let i = 0;
  return paths(plan).map(p => {
    const costs = plan.pavementCosts.slice(i, i + p.length - 1); i += p.length - 1;
    return canonicalPath(p, costs);
  }).sort((a, b) => a.key.localeCompare(b.key)).flatMap(p => p.costs);
}
function mergeSources(intervals: RoadSourceInterval[]): RoadSourceInterval[] {
  const out: RoadSourceInterval[] = [];
  for (const interval of [...intervals].sort((a, b) => a.way - b.way || a.a - b.a)) {
    const previous = out.at(-1);
    if (previous?.way === interval.way && interval.a <= previous.b + 1e-5) previous.b = Math.max(previous.b, interval.b);
    else out.push({ ...interval });
  }
  return out;
}
/** All original-road groups must independently pass the geometry/topology checks. Only then
 * may their identical constructed connector share pavement, support faces and access allowances.
 * This ledger does not claim any source interval for an unaccepted companion. */
export class RoadRemedyLedger {
  static sameGeometry(a: RoadRealignmentPlan, b: RoadRealignmentPlan): boolean { return physicalKey(a) === physicalKey(b); }
  private built = new Map<string, { conflict: FootprintConflict; quote: number; pavement: number[]; apron: number; retaining: number;
    accesses: Set<string>; codes: Set<string>; retainingArea: number; turnaroundArea: number }>();
  accept(conflict: FootprintConflict, plan: RoadRealignmentPlan): FootprintConflict {
    if (plan.problems.length) throw new Error('Cannot reserve an unbuildable road remedy');
    const key = physicalKey(plan), quote = plan.cost - (plan.lumpCost ?? 0), previous = this.built.get(key), pavement = canonicalCosts(plan);
    if (!previous) {
      conflict.sourceIntervals = mergeSources(plan.sourceIntervals);
      conflict.originals = conflict.original ? [conflict.original] : [];
      this.built.set(key, { conflict, quote, pavement, apron: plan.apronCost, retaining: plan.retainingCost,
        accesses: new Set(plan.accessKeys), codes: new Set(plan.roadCode.split(' / ')), retainingArea: plan.retainingArea, turnaroundArea: plan.turnaroundArea });
      return conflict;
    }
    const target = previous.conflict;
    target.sourceIntervals = mergeSources([...(target.sourceIntervals ?? []), ...plan.sourceIntervals]);
    if (conflict.original) target.originals!.push(conflict.original);
    target.affectedLength = (target.affectedLength ?? 0) + (conflict.affectedLength ?? 0);
    target.s0 = Math.min(target.s0, conflict.s0); target.s1 = Math.max(target.s1, conflict.s1);
    for (const access of plan.accessKeys ?? []) previous.accesses.add(access);
    for (const code of plan.roadCode.split(' / ')) previous.codes.add(code);
    // Equal totals can hide opposite high/low source-class mixes. Use the higher SPK amount
    // at EACH matching physical segment, not merely max(total quote). No surcharge on ACCESS.
    for (let i = 0; i < pavement.length; i++) previous.pavement[i] = Math.max(previous.pavement[i], pavement[i]);
    previous.apron = Math.max(previous.apron, plan.apronCost); previous.retaining = Math.max(previous.retaining, plan.retainingCost);
    previous.retainingArea = Math.max(previous.retainingArea, plan.retainingArea); previous.turnaroundArea = Math.max(previous.turnaroundArea, plan.turnaroundArea);
    if (quote > previous.quote) { previous.quote = quote; target.cls = conflict.cls; }
    target.roadCode = [...previous.codes].sort().join(' / ');
    target.lumpCost = previous.accesses.size * ACCESS;
    target.cost = previous.pavement.reduce((a, b) => a + b, 0) + previous.apron + previous.retaining + target.lumpCost;
    target.detail = `${ROAD_CLASSES[target.cls!].label}: ${target.affectedLength.toFixed(1)} m affected on ${new Set(target.sourceIntervals.map(s => s.way)).size} independently accepted source roads; ${target.length.toFixed(1)} m shared connector × SPK ${target.roadCode}`
      + (previous.retainingArea ? `; ${previous.retainingArea.toFixed(1)} m² additional retaining faces` : '')
      + (previous.turnaroundArea ? `; ${previous.turnaroundArea.toFixed(1)} m² turning apron` : '')
      + `; ${previous.accesses.size} unique access allowance(s). Pavement/support work is booked once; real surviving connections are preserved.`;
    return target;
  }
}
