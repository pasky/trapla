// Guard: player-facing text stays in plain words (src/core/terms.ts). Generates every violation kind
// and every crossing / footprint outcome, and fails on internal terms or a missing title / fix / basis.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAlignment, type PI } from '../src/core/horizontal';
import { horizontalRules, speedNorms } from '../src/core/data/norms';
import { categoryViolation, crossingViolation, horizontalViolations, oobViolation, profileViolation, slopeViolation, timeViolation,
  verticalViolations, VIOLATION_KINDS, type Violation } from '../src/core/checks';
import { buildProfile } from '../src/core/vertical';
import { CROSSING_CHOICE_TEXT, crossingOutcome, footprintOutcome, jargonIn } from '../src/core/terms';
import { CROSSING_CHOICES, type CrossingResult } from '../src/core/crossings';
import { ROAD_CLASSES } from '../src/core/data/urban';
import { evaluate, type Design, type Result } from '../src/core/evaluate';
import { COST_GROUPS } from '../src/ui/costgroups';
import { ROW_HELP } from '../src/ui/hud';
import { footprintConflictText, footprintConflictTitle } from '../src/ui/footprint';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { syntheticTerrain } from '../src/core/terrain';
import { startDesign } from '../src/state';
import { regressionContext, regressionPackAvailable } from '../scripts/eval-regression';

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

describe('player-facing text', () => {
  it('outcome labels, card choices and bill lines use plain words', () => {
    for (const type of ['bridge', 'tunnel', 'overbridge', 'junction', 'reconnection', 'diversion', 'underpass', 'atGrade'] as CrossingResult['type'][])
      for (const cls of Object.keys(ROAD_CLASSES)) {
        const o = crossingOutcome({ type, cls, span: 25, approachLength: 120, linkLength: 300, targetS: 1200, underpassLength: 40 });
        for (const text of [o.tag, o.label, o.explain]) { expect(text.trim()).not.toBe(''); check(`outcome ${type}/${cls}`, text); }
      }
    expect(crossingOutcome({ type: 'diversion', cls: 'track', linkLength: 412, targetS: 2310 }).label)
      .toBe('Rerouted to the nearest crossing at km 2.31 (+412 m of new track)');
    for (const action of ['relocation', 'retaining-wall', 'culvert', 'channel-relocation', 'blocked'] as const)
      for (const feature of ['road', 'railway', 'water', 'stream'] as const) {
        const o = footprintOutcome({ feature, action, cls: 'service', length: 50, affectedLength: 20 });
        for (const text of [o.tag, o.label, o.explain]) check(`footprint ${action}/${feature}`, text);
      }
    check('closure', footprintOutcome({ feature: 'road', action: 'relocation', cls: 'service', length: 0, closed: { length: 60, detour: 140 } }).label);
    expect(CROSSING_CHOICE_TEXT.map(([v]) => v).filter(Boolean).sort()).toEqual([...CROSSING_CHOICES].sort());
    for (const [, label, title] of CROSSING_CHOICE_TEXT) { check('choice label', label); check('choice tooltip', title); }
    for (const g of COST_GROUPS) check('bill line', g.label);
    const terrain = syntheticTerrain(500, 80, 5, () => 400);
    const r = evaluate({ terrain, scenario: D11_SCENARIO, a: { x: 100, y: 200 }, b: { x: 2100, y: 200 } }, startDesign());
    for (const [key, help] of Object.entries(ROW_HELP)) check(`bill tooltip ${key}`, help(r.cost, D11_SCENARIO), false);
    expect(problems).toEqual([]);
  });

  it('every violation kind has a title, a fix, a basis and no internal terms', () => {
    // Horizontal: fuzzed bends with hand-set radii on the 90 km/h rules.
    let seed = 7;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let k = 0; k < 400; k++) {
      const pis: PI[] = [];
      let x = 0;
      for (let j = 0; j < 2 + Math.floor(rand() * 4); j++) {
        x += 60 + rand() * 900;
        pis.push({ x, y: (rand() - 0.5) * 900, r: rand() < 0.6 ? Math.round(100 + rand() * 2500) : null });
      }
      const al = buildAlignment({ x: -500, y: 0 }, { x: x + 800, y: 0 }, pis, horizontalRules(90));
      for (const v of horizontalViolations(al, 90, { a: { x: -500, y: 0 }, b: { x: x + 800, y: 0 }, pis })) checkViolation(v, 'horizontal');
    }
    // Vertical: steep grades, tiny and overlapping roundings.
    const norms = speedNorms(90);
    for (let k = 0; k < 200; k++) {
      const vpis: { s: number; z: number; r: number | null }[] = [{ s: 0, z: 400, r: null }];
      for (let s = 0; s < 3000;) { s += 40 + rand() * 600; vpis.push({ s, z: 400 + (rand() - 0.5) * 120, r: rand() < 0.5 ? Math.round(200 + rand() * 4000) : null }); }
      vpis.push({ s: 3600, z: 400, r: null as number | null });
      for (const v of verticalViolations(buildProfile(vpis, norms.minCrestRadius, norms.minSagRadius), norms, 0.06)) checkViolation(v, 'vertical');
    }
    for (const v of [slopeViolation(100, 200, 12, 0, 60), slopeViolation(100, 200, 0, 12, 60), crossingViolation(500, 'railway', 3, 7.5),
      crossingViolation(500, 'motorway', -2, 7.5, 6), oobViolation(0, 50, 50), profileViolation(1000, 0.06),
      categoryViolation(1000, 'S7.5', 20000, 'S9.5'), timeViolation(20000, 80, 15.4, 14.5)]) checkViolation(v, 'checks');
    if (regressionPackAvailable()) {
      const ctx = regressionContext(false);
      const design = (file: string): Design => JSON.parse(readFileSync(file, 'utf8')).design;
      const best = design('scripts/best-design.json');
      const base = evaluate(ctx, best);
      const roads = [...new Set(base.crossings.map(c => c.roadId!))];
      const designs: [string, Design][] = [
        ['straight', { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }],
        ...['best', 'demo', 'direct-80', 'direct-90', 'town-centre'].map(n => [n, design(`scripts/${n}-design.json`)] as [string, Design]),
        ['service overbridge', design('tests/fixtures/service-overbridge-design.json')],
        // Every crossing choice forced on every crossed road (crossing violations and geometry failures).
        ...CROSSING_CHOICES.map(type => [`all ${type}`, { ...best, crossingOverrides: roads.map(roadId => ({ roadId, type })) }] as [string, Design]),
        // A short bridge and tunnel painted by hand, a kept building in the way, no noise walls at all.
        ['structures', { ...best, structureOverrides: [{ s0: 3000, s1: 3040, kind: 1 }, { s0: 5000, s1: 5060, kind: 2 }] }],
        ['kept building', { ...best, buildingOverrides: base.demolished.slice(0, 2).map(p => ({ j: p.j, action: 'keep' as const })) }],
        ['no walls', { ...best, wallOverrides: [{ s0: 0, s1: base.length, side: 'L', height: 0 }, { s0: 0, s1: base.length, side: 'R', height: 0 }] }],
        ['pins', { ...best, gradePins: [{ s: 6000, z: 900 }, { s: 6100, z: 100 }] }],
        // Wild bends: footprint conflicts, piers on roads, motorway contact near B.
        ['wild', { category: 'S9.5', speed: 90, profileMode: 'auto', vpis: [], pis: [
          { x: 7600, y: 7000, r: null }, { x: 9800, y: 11000, r: null }, { x: 11200, y: 15500, r: null }, { x: 12300, y: 20500, r: null }] }],
        ['wild 2', { category: 'S7.5', speed: 80, profileMode: 'manual', vpis: [], pis: [{ x: 5000, y: 6000, r: 300 }, { x: 10500, y: 12000, r: null }] }],
      ];
      for (const [name, d] of designs) checkResult(evaluate(ctx, d), name);
      for (const kind of VIOLATION_KINDS) expect(seen, `no generated ${kind} violation`).toContain(kind);
    }
    expect(problems).toEqual([]);
  }, 120_000);
});
