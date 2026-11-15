import { expect, it } from 'vitest';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluate, type Design } from '../src/core/evaluate';
import { projectFromLegacyDesign, type LegacyProjectContext } from '../src/core/project-legacy';
import { evaluateProjectRoad } from '../src/core/project-road';
import { syntheticTerrain } from '../src/core/terrain';

const terrain = syntheticTerrain(260, 120, 5, () => 100);
const ctx = { terrain, scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 } };
const design: Design = { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] };
const context: LegacyProjectContext = { scenarioId: 'd11', presetId: 'legacy-road', packId: 'd11', objectData: 'objects', transportData: null,
  operations: { aadt: D11_SCENARIO.traffic, heavyShare: D11_SCENARIO.heavyShare ?? 0.15, speed: 90 },
  endpoints: { a: { position: { ...ctx.a, z: 100 }, anchor: { kind: 'mission', portId: 'a' }, binding: 'resolved' },
    b: { position: { ...ctx.b, z: 100 }, anchor: { kind: 'mission', portId: 'b' }, binding: 'resolved' } },
  mission: { id: 'legacy', revision: 0, ports: [{ id: 'a', name: 'Start', position: { ...ctx.a, z: 100 } },
    { id: 'b', name: 'End', position: { ...ctx.b, z: 100 } }], connections: [{ from: 'a', to: 'b', direction: 'both', kinds: ['road'],
    maxTravelMin: D11_SCENARIO.maxTravelMin, demand: { kind: 'road', aadt: D11_SCENARIO.traffic } }] } };

it('preserves the legacy kernel bill, grade and geometry through the project adapter', () => {
  const p = projectFromLegacyDesign(design, context);
  const legacy = evaluate(ctx, design), adapted = evaluateProjectRoad(ctx, p, p.routes[0].id, 'objects');
  expect(adapted.status).toBe('evaluated');
  if (adapted.status !== 'evaluated') throw new Error('adapter');
  const { timing: _a, ...a } = legacy, { timing: _b, ...b } = adapted.result;
  expect(b).toEqual(a);
});

it('constrains Auto and manual endpoints to actual transport heights without changing excavation ground', () => {
  for (const profileMode of ['auto', 'manual'] as const) {
    const r = evaluate(ctx, { ...design, profileMode, vpis: [{ s: 0, z: 0, r: null }, { s: 1000, z: 0, r: null }] },
      { endpointElevations: { a: 103, b: 105 } });
    expect(r.grade[0]).toBe(103); expect(r.grade[r.n - 1]).toBe(105);
    expect(r.ground[0]).toBe(100); expect(r.ground[r.n - 1]).toBe(100);
    expect(r.fill[0]).toBeGreaterThan(0); expect(r.fill[r.n - 1]).toBeGreaterThan(0);
    expect(terrain.heightAt(ctx.a.x, ctx.a.y)).toBe(100);
  }
});

it('separates auxiliary operations from mission goals and refuses mode/policy fallthrough', () => {
  const p = projectFromLegacyDesign(design, context), r = p.routes[0];
  r.role = 'auxiliary';
  if (r.kind !== 'road') throw new Error('fixture');
  r.specification.crossSection = 'S7.5'; r.specification.legalClass = 'II';
  r.specification.operations.aadt = 50000;
  const auxiliary = evaluateProjectRoad(ctx, p, r.id, 'objects');
  expect(auxiliary.status).toBe('evaluated');
  if (auxiliary.status === 'evaluated') expect(auxiliary.result.violations.some(v => v.goal)).toBe(false);
  r.role = 'mission';
  const mission = evaluateProjectRoad(ctx, p, r.id, 'objects');
  if (mission.status !== 'evaluated') throw new Error('mission');
  expect(mission.result.violations.some(v => v.kind === 'category')).toBe(true);
  r.specification.policy = 'track';
  expect(evaluateProjectRoad(ctx, p, r.id, 'objects')).toEqual({ status: 'incomplete', reason: 'unsupported-policy' });
  (r as unknown as { kind: string }).kind = 'railway';
  expect(evaluateProjectRoad(ctx, p, r.id, 'objects')).toEqual({ status: 'incomplete', reason: 'unsupported-mode' });
});
