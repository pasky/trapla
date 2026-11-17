// Every bridge end of a pack's starts, saved designs and presets: a cone, or a closed end whose wall is at most
// CONE.closedMax high and billed (owner's playtest: a field track beside the Královec railway's fills closed ends with
// walls of 16–28 m, unbilled). The packs here are the quick ones (the Královec railway is a D11 preset); every pack:
// scripts/bridge-ends-audit.ts (a full gate, ≈ 1 min).
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bridgeEndProblems, packResults } from '../scripts/bridge-ends-audit';
import { KIND, wallGapsToBridge, type Run } from '../src/core/structures';

it('a fill between two bridges closed off by a wall is bridged where its deck costs less', () => {
  const run = (i0: number, i1: number, wall?: 0 | 1): Run => ({ kind: KIND.bridge, i0, i1, s0: i0 * 10 - 5, s1: i1 * 10 + 5, length: (i1 - i0 + 1) * 10,
    ...(wall === undefined ? {} : { closedEnds: [wall === 0, wall === 1], endWalls: [{ height: wall === 0 ? 8 : 0, cost: wall === 0 ? 3e6 : 0 }, { height: wall === 1 ? 8 : 0, cost: wall === 1 ? 3e6 : 0 }] }) });
  const runs = [run(0, 9, 1), run(14, 30)], open = () => true;
  // cells 10–13: 4 × 2 M of earth, 3 M of wall, 3 M of the other end's cone, 1 M of abutments one bridge saves = 15 M,
  // against 4 × 3 M of deck (4 × 4 M: kept)
  expect(wallGapsToBridge(runs, () => 3e6, () => 2e6, () => 3e6, open, 1e6, 1)).toEqual([[10, 13]]);
  expect(wallGapsToBridge(runs, () => 3e6, () => 2e6, () => 4e6, open, 1e6, 1)).toEqual([]);
  // no wall: the structure choice weighed it already; a cell that may not be bridged: kept
  expect(wallGapsToBridge([run(0, 9), run(14, 30)], () => 3e6, () => 2e6, () => 1, open, 1e6, 1)).toEqual([]);
  expect(wallGapsToBridge(runs, () => 3e6, () => 2e6, () => 1, k => k !== 12, 1e6, 1)).toEqual([]);
});

for (const id of ['d11', 'i16-nova-paka']) describe.skipIf(!existsSync(`public/scenarios/${id}/meta.json`))(`bridge ends: ${id}`, () => {
  it('each a cone, or a billed wall within the limit', () => {
    const problems: string[] = [];
    packResults(id, (name, r, category) => problems.push(...bridgeEndProblems(r, category).map(p => `${name}: ${p}`)));
    expect(problems).toEqual([]);
  }, 120_000);
});
