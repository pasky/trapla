import { expect, it } from 'vitest';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluate, type Design } from '../src/core/evaluate';
import { syntheticTerrain } from '../src/core/terrain';
import { provisionalProfile } from '../src/ui/provisional';

const terrain = syntheticTerrain(700, 200, 5, (x, y) => 400 + 25 * Math.sin(x / 400) + 8 * Math.cos(y / 150));
const ctx = { terrain, scenario: D11_SCENARIO, a: { x: 100, y: 500 }, b: { x: 3300, y: 500 } };
const height = (x: number, y: number) => terrain.heightAt(x, y);

it('shows the moved route with the previous heights while the worker catches up', () => {
  const d: Design = { category: 'S9.5', speed: 90, pis: [{ x: 1700, y: 650, r: null }], profileMode: 'auto', vpis: [] };
  const r = evaluate(ctx, d);
  // Unchanged design: exactly the evaluated stations, ground and (final, repaired) grade.
  const same = provisionalProfile(ctx.a, ctx.b, d, r, height);
  expect(Array.from(same.s)).toEqual(Array.from(r.s));
  expect(Array.from(same.ground)).toEqual(Array.from(r.ground));
  expect(Array.from(same.grade)).toEqual(Array.from(r.grade));
  // Dragged bend: the new route's own stations and ground; heights stretched to its length.
  const moved: Design = { ...d, pis: [{ x: 1760, y: 720, r: null }] };
  const p = provisionalProfile(ctx.a, ctx.b, moved, r, height), next = evaluate(ctx, moved);
  expect(p.length).toBe(next.length);
  expect(Array.from(p.ground)).toEqual(Array.from(next.ground));
  expect(p.grade[0]).toBe(next.ground[0]); expect(p.grade.at(-1)).toBe(next.ground.at(-1));
  // By hand: the player's own grade line is already exact.
  const manual: Design = { ...moved, profileMode: 'manual', vpis: r.vpis };
  expect(Array.from(provisionalProfile(ctx.a, ctx.b, manual, r, height).grade)).toEqual(Array.from(evaluate(ctx, manual).grade));
});
