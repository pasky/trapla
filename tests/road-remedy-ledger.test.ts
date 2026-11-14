import { describe, expect, it } from 'vitest';
import { RoadRemedyLedger } from '../src/core/road-remedy-ledger';
import type { RoadRealignmentPlan } from '../src/core/road-realignment';
import type { FootprintConflict } from '../src/core/footprint';
import { ACCESS } from '../src/core/data/urban';
function proposed(way: number, junction = 'shared', z = 100) {
  const road = [0, 5, 10].map(x => ({ x, y: 0, z, ground: 100, d: x * (way + 1), surface: 'terrain' as const }));
  const plan: RoadRealignmentPlan = { geometry: { width: 4, road, schematic: false }, original: road.map(p => ({ ...p, y: way + 1 })),
    length: 10, cost: 100 + ACCESS, lumpCost: ACCESS, accessKeys: [junction], roadCode: 'test', problems: [], pavementCosts: [40, 40], apronCost: 0,
    sourceIntervals: [{ way, a: 0, b: 10 }], retainingArea: 2, retainingCost: 20, turnaroundArea: 0 };
  const conflict: FootprintConflict = { id: `road:${way}`, feature: 'road', action: 'relocation', roadId: way, cls: 'service',
    i: way, s0: way * 10, s1: way * 10 + 10, x: 0, y: 0, affectedLength: 5, length: plan.length, cost: plan.cost,
    lumpCost: plan.lumpCost, geometry: plan.geometry, original: plan.original, detail: 'accepted' };
  return { plan, conflict };
}
describe('shared accepted road remedies', () => {
  it('books an identical connector and shared access once, retaining both exact removal intervals', () => {
    const ledger = new RoadRemedyLedger(), a = proposed(0), b = proposed(1);
    const built = ledger.accept(a.conflict, a.plan), shared = ledger.accept(b.conflict, b.plan);
    expect(shared).toBe(built);
    expect(shared.cost).toBe(a.plan.cost); // pavement AND additional retaining faces are not doubled
    expect(shared.lumpCost).toBe(ACCESS);
    expect(shared.originals).toHaveLength(2);
    expect(shared.sourceIntervals).toEqual([...a.plan.sourceIntervals, ...b.plan.sourceIntervals]);
    expect(shared.sourceIntervals!.every(s => s.b === 10)).toBe(true); // no claim to the continuation beyond the junction
    expect(shared.affectedLength).toBe(10);
  });
  it('does not reserve an unaccepted companion, and does not deduplicate a different grade', () => {
    const ledger = new RoadRemedyLedger(), a = proposed(0), b = proposed(1);
    const built = ledger.accept(a.conflict, a.plan);
    b.plan.problems.push('unhandled outside branch');
    expect(() => ledger.accept(b.conflict, b.plan)).toThrow(/unbuildable/);
    expect(built.sourceIntervals).toEqual(a.plan.sourceIntervals);
    const elevated = proposed(2, 'shared', 101);
    expect(ledger.accept(elevated.conflict, elevated.plan)).toBe(elevated.conflict);
  });
  it('takes the pointwise higher tariff when identical paths have opposite source-class mixes', () => {
    const ledger = new RoadRemedyLedger(), a = proposed(0), b = proposed(1);
    a.plan.pavementCosts = [70, 10]; b.plan.pavementCosts = [10, 70];
    ledger.accept(a.conflict, a.plan);
    const shared = ledger.accept(b.conflict, b.plan);
    expect(shared.cost).toBe(140 + a.plan.retainingCost + ACCESS);
  });
  it('shares construction but preserves distinct access allowances', () => {
    const ledger = new RoadRemedyLedger(), a = proposed(0, 'first'), b = proposed(1, 'second');
    ledger.accept(a.conflict, a.plan);
    const shared = ledger.accept(b.conflict, b.plan);
    expect(shared.cost).toBe(a.plan.cost + ACCESS);
    expect(shared.lumpCost).toBe(2 * ACCESS);
  });
});
