import { describe, expect, it } from 'vitest';
import { buildAlignment, type Element } from '../src/core/horizontal';
import { assertCurvePath, childStationAt, curvePointAt, offsetCurvePath, reverseCurvePath, spineStationAt, type CurvePath } from '../src/core/offset-path';
import { curveIntersections } from '../src/core/curve-intersections';
import { connectionMismatch, pairedCarriageways } from '../src/core/paired-carriageways';
import { formationQuantities, formationQuantityRuns, formationSection } from '../src/core/formation-quantities';
import { modeCapability } from '../src/core/mode-policy';

function curved(): CurvePath {
  return buildAlignment({ x: 0, y: 0 }, { x: 3000, y: 1800 }, [{ x: 1600, y: 0, r: 1000 }], 900, 0);
}
const section = { right: { min: -12, max: -2 }, left: { min: 2, max: 12 }, formation: { min: -13, max: 13 } };

// Existing geometry.test.ts tests PI/compound solving and stationing, not exact physical offsets.
describe('exact paired-carriageway plan geometry', () => {
  it('preserves normals, tangent joins and unequal/reversed station correspondence through bends', () => {
    const spine = curved(), pair = pairedCarriageways(spine, section, 900);
    expect(pair.issues).toEqual([]);
    expect(pair.planChecksComplete).toBe(true);
    expect(pair.left.axis.path.length).not.toBeCloseTo(pair.right.axis.path.length, 3);
    for (const child of [pair.left.axis, pair.right.axis]) {
      assertCurvePath(child.path);
      for (let i = 0; i <= 100; i++) {
        const s = spine.length * i / 100, cs = childStationAt(child, s);
        const p = curvePointAt(spine, s), q = curvePointAt(child.path, cs);
        expect(q.x).toBeCloseTo(p.x - p.ty * child.offset, 7);
        expect(q.y).toBeCloseTo(p.y + p.tx * child.offset, 7);
        expect(q.tx).toBeCloseTo(p.tx * child.direction, 8);
        expect(q.ty).toBeCloseTo(p.ty * child.direction, 8);
        expect(spineStationAt(child, cs)).toBeCloseTo(s, 7);
      }
      for (const span of child.correspondence) {
        expect(spineStationAt(child, span.childStart)).toBeCloseTo(span.spineStart, 7);
        expect(spineStationAt(child, span.childEnd)).toBeCloseTo(span.spineEnd, 7);
      }
    }
    // The two directional starts are at opposite ends, not connected to the spine centre.
    expect(pair.right.start.x).toBeCloseTo(0, 8);
    expect(pair.left.end.y).toBeCloseTo(7, 8);
    expect(pair.right.start.y).toBeCloseTo(-7, 8);
  });

  it('checks the inner carriageway radius, not just the shared spine radius', () => {
    const pair = pairedCarriageways(curved(), section, 1000);
    expect(pair.issues.filter(i => i.kind === 'radius')).toEqual([
      expect.objectContaining({ kind: 'radius', side: 'left', actual: 993, required: 1000 }),
    ]);
    expect(() => offsetCurvePath(curved(), 1000)).toThrow(/collapses/);
    expect(() => offsetCurvePath(curved(), 1001)).toThrow(/collapses/);
  });

  it('works on compound arcs and round-trips reversal without altering physical endpoints', () => {
    const elements: Element[] = [
      { kind: 'arc', s0: 0, len: 1000 * Math.PI / 4, cx: 0, cy: 1000, r: 1000, a0: -Math.PI / 2, dir: 1, pi: 0 },
    ];
    const p = curvePointAt({ elements, length: elements[0].len }, elements[0].len);
    elements.push({ kind: 'arc', s0: elements[0].len, len: 1200 * Math.PI / 4, cx: p.x - p.ty * 1200, cy: p.y + p.tx * 1200, r: 1200, a0: -Math.PI / 4, dir: 1, pi: 1 });
    const spine = { elements, length: elements.reduce((n, e) => n + e.len, 0) };
    const child = offsetCurvePath(spine, 7).path;
    assertCurvePath(child);
    const twice = reverseCurvePath(reverseCurvePath(child));
    for (const s of [0, 300, child.length]) expect(curvePointAt(twice, s)).toEqual(expect.objectContaining({
      x: expect.closeTo(curvePointAt(child, s).x, 7), y: expect.closeTo(curvePointAt(child, s).y, 7),
    }));
  });

  it('detects a returning strip entering the open start without crossing a longitudinal boundary', () => {
    const elements: Element[] = [];
    let x = 0, y = 0, heading = 0, s = 0;
    for (const length of [1000, 1000, 1000, 1005, 10]) {
      elements.push({ kind: 'line', s0: s, len: length, x0: x, y0: y, dx: Math.cos(heading), dy: Math.sin(heading) });
      x += length * Math.cos(heading); y += length * Math.sin(heading); s += length;
      if (length === 10) break;
      const cx = x + 100 * Math.sin(heading), cy = y - 100 * Math.cos(heading), a0 = heading + Math.PI / 2;
      elements.push({ kind: 'arc', s0: s, len: 100 * Math.PI / 2, cx, cy, r: 100, a0, dir: -1, pi: 0 });
      s += 100 * Math.PI / 2; heading -= Math.PI / 2;
      x = cx + 100 * Math.cos(heading + Math.PI / 2); y = cy + 100 * Math.sin(heading + Math.PI / 2);
    }
    const pair = pairedCarriageways({ elements, length: s }, section, 90);
    expect(pair.planChecksComplete).toBe(true);
    expect(pair.issues.some(i => i.kind === 'terminal-overlap')).toBe(true);
  });

  it('rejects corners, non-unit tangents and a median overlap rather than inventing an offset join', () => {
    const kink: CurvePath = { length: 20, elements: [
      { kind: 'line', s0: 0, len: 10, x0: 0, y0: 0, dx: 1, dy: 0 },
      { kind: 'line', s0: 10, len: 10, x0: 10, y0: 0, dx: 0, dy: 1 },
    ] };
    expect(() => offsetCurvePath(kink, 2)).toThrow(/continuous/);
    expect(() => offsetCurvePath({ length: 10, elements: [{ ...kink.elements[0], kind: 'line', dx: 2, dy: 0, x0: 0, y0: 0 }] }, 2)).toThrow(/tangent/);
    expect(() => pairedCarriageways(curved(), { ...section, left: { min: -3, max: 12 } }, 900)).toThrow(/cross-section/);
  });

  it('does not treat a spine endpoint or reversed tangent as a connected carriageway port', () => {
    const actual = { ...pairedCarriageways(curved(), section, 900).right.start, z: 100, grade: 0.01 };
    const tolerance = { position: 0.01, elevation: 0.01, tangentRadians: 0.001, grade: 0.001 };
    expect(connectionMismatch(actual, actual, tolerance).matches).toBe(true);
    expect(connectionMismatch(actual, { ...actual, y: 0 }, tolerance).matches).toBe(false);
    expect(connectionMismatch(actual, { ...actual, tx: -actual.tx, ty: -actual.ty }, tolerance).matches).toBe(false);
    expect(connectionMismatch(actual, { ...actual, z: 102 }, tolerance).matches).toBe(false);
  });
});

describe('bounded analytic collision checks', () => {
  const line = (x0: number, y0: number, dx: number, dy: number, len: number): CurvePath => ({ length: len, elements: [{ kind: 'line', s0: 0, len, x0, y0, dx, dy }] });
  it('detects line/circle and arc/arc crossings, coincident overlaps and disconnected self-crossings', () => {
    const arc: CurvePath = { length: 10 * Math.PI, elements: [{ kind: 'arc', s0: 0, len: 10 * Math.PI, cx: 0, cy: 0, r: 10, a0: 0, dir: 1, pi: 0 }] };
    expect(curveIntersections(arc, line(-20, 5, 1, 0, 40)).collisions).toHaveLength(2);
    const translated = { ...arc, elements: arc.elements.map(e => ({ ...e, cx: 5 })) };
    expect(curveIntersections(arc, translated).collisions).toHaveLength(1);
    expect(curveIntersections(line(0, 0, 1, 0, 10), line(2, 0, 1, 0, 3)).collisions).toHaveLength(2);
    expect(curveIntersections(arc, arc).collisions).toHaveLength(2);
    const crossing = { length: 30, elements: [
      ...line(-5, 0, 1, 0, 10).elements,
      ...line(20, 20, 1, 0, 10).elements.map(e => ({ ...e, s0: 10 })),
      ...line(0, -5, 0, 1, 10).elements.map(e => ({ ...e, s0: 20 })),
    ] };
    expect(curveIntersections(crossing).collisions).toHaveLength(1);
    // Consecutive does not imply a genuine shared end/start when checking imported geometry.
    const endpointToInterior = { length: 20, elements: [
      ...line(0, 0, 1, 0, 10).elements,
      ...line(10, -5, 0, 1, 10).elements.map(e => ({ ...e, s0: 10 })),
    ] };
    expect(curveIntersections(endpointToInterior).collisions).toHaveLength(1);
  });
  it('ignores only normal consecutive joins and fails closed at a runtime budget', () => {
    expect(curveIntersections(curved())).toEqual({ complete: true, collisions: [] });
    const many = { length: 50, elements: Array.from({ length: 5 }, (_, i) => ({ ...line(0, i, 1, 0, 10).elements[0], s0: i * 10 })) };
    expect(curveIntersections(many, undefined, 2).complete).toBe(false);
  });
});

describe('one physical formation and fail-closed mode dispatch', () => {
  it('includes the median once and reconciles every measured cell', () => {
    const row = { s: 0, curvature: 0, knots: [-13, -12, -2, 2, 12, 13].map(offset => ({ offset, groundZ: 100, formationZ: 102 })) };
    const q = formationQuantities([row, { ...row, s: 100 }, { ...row, s: 250 }]);
    expect(q.fillVolume).toBeCloseTo(26 * 2 * 250, 8);
    expect(q.cutVolume).toBe(0);
    expect(q.footprintArea).toBe(26 * 250);
    expect(q.cells.reduce((n, c) => n + c.fillVolume, 0)).toBe(q.fillVolume);
  });
  it('splits cut and fill at actual ground crossing and integrates the curved first moment', () => {
    const row = { s: 0, curvature: 0.01, knots: [{ offset: -10, groundZ: 100, formationZ: 99 }, { offset: 10, groundZ: 100, formationZ: 101 }] };
    const q = formationSection(row);
    expect(q.fillArea).toBeCloseTo(5, 9); expect(q.cutArea).toBeCloseTo(5, 9);
    expect(q.fillPerMetre).toBeCloseTo(5 - 1 / 3, 9);
    expect(q.cutPerMetre).toBeCloseTo(5 + 1 / 3, 9);
    expect(() => formationSection({ ...row, curvature: 0.1 })).toThrow(/collapsed/);
    expect(() => formationQuantities([row, row])).toThrow(/increase/);
  });
  it('keeps both sides of line/arc curvature breaks without smearing their volume', () => {
    const row = { s: 0, curvature: 0, knots: [0, 10].map(offset => ({ offset, groundZ: 0, formationZ: 1 })) };
    const straight = [row, { ...row, s: 100 }];
    const arc = [{ ...row, s: 100, curvature: 0.01 }, { ...row, s: 200, curvature: 0.01 }];
    expect(formationQuantityRuns([straight, arc]).fillVolume).toBeCloseTo(1950, 8);
    expect(() => formationQuantityRuns([straight, [{ ...arc[0], s: 99 }, arc[1]]])).toThrow(/gap or overlap/);
  });

  it('makes it impossible to dispatch railway/motorway through a legacy-road capability', () => {
    // M1: motorway and railway score only through their own kernels, never the road one.
    expect(modeCapability('motorway').kernel).toBe('paired-corridor');
    expect(modeCapability('railway').kernel).toBe('conventional-rail');
    expect(() => modeCapability('tram' as 'road')).toThrow(/Unknown/);
  });
});
