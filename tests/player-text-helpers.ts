// Shared by the player-text guards (player-text.test.ts and its real-pack shards player-text-pack-*.test.ts):
// what is checked of a violation / a result, and the real-pack designs that between them produce every kind
// of violation. Not a test file itself.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { regressionContext, regressionPackAvailable } from '../scripts/eval-regression';
import type { Violation, ViolationKind } from '../src/core/checks';
import type { CrossingChoice } from '../src/core/crossings';
import { evaluate, type Design, type Result } from '../src/core/evaluate';
import { crossingOutcome, jargonIn } from '../src/core/terms';
import { footprintConflictText, footprintConflictTitle } from '../src/ui/footprint';

/** A collector: `problems` fills with internal terms and missing parts, `seen` with the violation kinds met. */
export function textGuard() {
  const problems: string[] = [];
  const check = (where: string, text: string | undefined, sources = true) => {
    if (!text) return;
    for (const why of jargonIn(text, sources)) problems.push(`${where}: ${why} in "${text}"`);
  };
  const seen = new Set<string>();
  function checkViolation(v: Violation, where: string) {
    seen.add(v.kind);
    for (const key of ['title', 'fix', 'basis', 'rule'] as const) if (!v[key]?.trim()) problems.push(`${where}: ${v.kind} violation without ${key}: ${v.title}`);
    check(`${where} ${v.kind} title`, v.title); check(`${where} ${v.kind} fix`, v.fix); check(`${where} ${v.kind} detail`, v.detail);
    check(`${where} ${v.kind} rule`, v.rule, false);
  }
  function checkResult(r: Result, where: string) {
    for (const v of r.violations) checkViolation(v, where);
    for (const c of r.crossings) {
      const o = crossingOutcome(c);
      check(`${where} crossing tag`, o.tag); check(`${where} crossing label`, o.label); check(`${where} crossing explanation`, o.explain);
    }
    for (const c of r.footprintConflicts) {
      check(`${where} footprint text`, footprintConflictText(c));
      check(`${where} footprint tooltip`, footprintConflictTitle(c), false);
    }
  }
  return { problems, seen, check, checkViolation, checkResult };
}

const design = (file: string): Design => JSON.parse(readFileSync(file, 'utf8')).design;

/** The real-pack designs (D11) in shards of a few seconds each, one test file per shard so that they run side
 * by side (one test of all of them took 16 s and set the whole suite's wall time). `what`: the test's name;
 * `kinds`: the violation kinds this shard answers for (it fails without one of them; player-text.test.ts
 * checks that these and the synthetic cases between them cover every kind); `designs`: made on demand
 * (`base`: the best design's result, evaluated once in a shard that asks for it). */
/** the crossing choices each shard forces on every crossed road (between them: every choice there is) */
export const FORCED_CHOICES: readonly (readonly CrossingChoice[])[] = [['overbridge'], ['junction', 'reconnection'], ['bridge', 'underpass'], []];
export const PACK_SHARDS: { what: string; kinds: readonly ViolationKind[]; designs: (base: () => Result) => [string, Design][] }[] = [
  { what: 'the straight start, the saved designs, its bridge over us forced on every crossed road', kinds: [], designs: (base) => [
    ['straight', { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }],
    ...['best', 'demo', 'direct-80', 'direct-90', 'town-centre'].map(n => [n, design(`scripts/${n}-design.json`)] as [string, Design]),
    ['service overbridge', design('tests/fixtures/service-overbridge-design.json')],
    ...forced(base, FORCED_CHOICES[0]),
  ] },
  // Every crossing choice forced on every crossed road (crossing violations and geometry failures).
  { what: 'a junction, then a reroute, forced on every crossed road', kinds: ['crossing', 'footprint'], designs: (base) => forced(base, FORCED_CHOICES[1]) },
  { what: 'our bridge, then an underpass, forced on every crossed road; structures, a kept house, no walls, pins by hand', kinds: ['structure', 'building', 'noise'], designs: (base) => {
    const best = design('scripts/best-design.json');
    return [
      ...forced(base, FORCED_CHOICES[2]),
      // A short bridge and tunnel painted by hand, a kept building in the way, no noise walls at all.
      ['structures', { ...best, structureOverrides: [{ s0: 3000, s1: 3040, kind: 1 }, { s0: 5000, s1: 5060, kind: 2 }] }],
      ['kept building', { ...best, buildingOverrides: base().demolished.slice(0, 2).map(p => ({ j: p.j, action: 'keep' as const })) }],
      ['no walls', { ...best, wallOverrides: [{ s0: 0, s1: base().length, side: 'L', height: 0 }, { s0: 0, s1: base().length, side: 'R', height: 0 }] }],
      ['pins', { ...best, gradePins: [{ s: 6000, z: 900 }, { s: 6100, z: 100 }] }],
    ];
  } },
  // Wild bends: footprint conflicts, piers on roads, motorway contact near B.
  { what: 'wild bends', kinds: [], designs: () => [
    ['wild', { category: 'S9.5', speed: 90, profileMode: 'auto', vpis: [], pis: [
      { x: 7600, y: 7000, r: null }, { x: 9800, y: 11000, r: null }, { x: 11200, y: 15500, r: null }, { x: 12300, y: 20500, r: null }] }],
    ['wild 2', { category: 'S7.5', speed: 80, profileMode: 'manual', vpis: [], pis: [{ x: 5000, y: 6000, r: 300 }, { x: 10500, y: 12000, r: null }] }],
  ] },
];
function forced(base: () => Result, types: readonly CrossingChoice[]): [string, Design][] {
  const best = design('scripts/best-design.json'), roads = [...new Set(base().crossings.map(c => c.roadId!))];
  return types.map(type => [`all ${type}`, { ...best, crossingOverrides: roads.map(roadId => ({ roadId, type })) }]);
}

/** The test file of one shard: its designs evaluated on the real pack (skipped without it), every text of their
 * results checked, the kinds it answers for all met. */
export function packShardSuite(shard: number) {
  const { what, kinds, designs } = PACK_SHARDS[shard];
  describe('player-facing text on the real pack', () => {
    it.skipIf(!regressionPackAvailable())(`no internal terms, no missing title / fix / basis: ${what}`, () => {
      const ctx = regressionContext(false), guard = textGuard();
      let best: Result | undefined;
      const base = () => best ??= evaluate(ctx, design('scripts/best-design.json'));
      for (const [name, d] of designs(base)) guard.checkResult(evaluate(ctx, d), name);
      for (const kind of kinds) expect(guard.seen, `no generated ${kind} violation`).toContain(kind);
      expect(guard.problems).toEqual([]);
    }, 120_000);
  });
}
