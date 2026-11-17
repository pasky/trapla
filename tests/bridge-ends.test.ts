// Every bridge end of a pack's starts, saved designs and presets: a cone, or a closed end whose wall is at most
// CONE.closedMax high and billed (owner's playtest: a field track beside the Královec railway's fills closed ends with
// walls of 16–28 m, unbilled). The packs here are the quick ones (the Královec railway is a D11 preset); every pack:
// scripts/bridge-ends-audit.ts (a full gate, ≈ 1 min).
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bridgeEndProblems, packResults } from '../scripts/bridge-ends-audit';

for (const id of ['d11', 'i16-nova-paka']) describe.skipIf(!existsSync(`public/scenarios/${id}/meta.json`))(`bridge ends: ${id}`, () => {
  it('each a cone, or a billed wall within the limit', () => {
    const problems: string[] = [];
    packResults(id, (name, r) => problems.push(...bridgeEndProblems(r).map(p => `${name}: ${p}`)));
    expect(problems).toEqual([]);
  }, 120_000);
});
