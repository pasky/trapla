/// <reference types="node" />
// Model-13 files remain archived unchanged. Current-model fixtures cover both recognized packs.
// Verify: [PACK=/path/to/d11] npx tsx scripts/eval-regression.ts
// A deliberate model change only: --capture=original|current --reviewed-model-change
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluate, type Design, type EvalContext } from '../src/core/evaluate';
import { PART_KEYS } from '../src/core/cost';
import { COST_MODEL_VERSION } from '../src/core/data/prices';
import { loadPack } from './loadpack';
import { evaluateProject } from '../src/core/project-evaluate';
import { makeLegacyProjectContext, projectFromLegacyDesign } from '../src/core/project-legacy';

const packPath = process.env.PACK ?? 'public/scenarios/d11';
const sets = {
  original: { fixture: 'tests/fixtures/evaluate-remedies-original.json', fingerprint: 'tests/fixtures/evaluate-pack.json' },
  current: { fixture: 'tests/fixtures/evaluate-remedies-current.json', fingerprint: 'tests/fixtures/evaluate-remedies-pack.json' },
};
type PackKey = keyof typeof sets;
export function packFingerprint(): Record<string, string> {
  const meta = JSON.parse(readFileSync(`${packPath}/meta.json`, 'utf8'));
  const files = ['meta.json', 'overlays.json', meta.heights.file, meta.landcover.file, meta.ground?.file, meta.watercourses?.file].filter(Boolean);
  return Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(`${packPath}/${file}`)).digest('hex')]));
}
export function regressionPackAvailable() { return existsSync(`${packPath}/meta.json`); }
export function regressionPackKey(): PackKey {
  if (!regressionPackAvailable()) return 'current';
  const actual = JSON.stringify(packFingerprint());
  for (const [key, paths] of Object.entries(sets)) if (existsSync(paths.fingerprint)
    && actual === JSON.stringify(JSON.parse(readFileSync(paths.fingerprint, 'utf8')))) return key as PackKey;
  throw new Error('Regression pack changed: compare old/new models on this identical pack and review a new baseline. Unknown, partial and corrupt installed packs do not skip.');
}
export function regressionContext(checkPack = true): EvalContext {
  if (checkPack) regressionPackKey();
  const { meta, terrain, scenario, buildings, roads } = loadPack(packPath);
  return { terrain, scenario, buildings, roads, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
}
function ordered(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) return Array.from(value as Float64Array);
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)]));
  return value;
}
export function bill(r: ReturnType<typeof evaluate>) {
  const geometry = { kind: r.kind, dayL: r.dayL, dayR: r.dayR, wallSurfaceL: r.wallSurfaceL, wallSurfaceR: r.wallSurfaceR, runs: r.runs,
    walls: r.retainingWalls.map(({ cost, perM2, ...wall }) => wall),
    crossings: r.crossings.map(({ type, s, roadId, geometry }) => ({ type, s, roadId, geometry })),
    footprint: r.footprintConflicts.map(({ action, i, s0, s1, roadId, cls, geometry, original, originals, sourceIntervals }) => ({ action, i, s0, s1, roadId, cls, geometry, original, originals, sourceIntervals })) };
  const geometryHash = createHash('sha256').update(JSON.stringify(ordered(geometry))).digest('hex');
  return { geometryHash, cost: r.cost, parts: Object.fromEntries(PART_KEYS.map(k => [k, r.parts[k].reduce((a, b) => a + b, 0)])),
    vpis: r.vpis, materialValue: r.quantities.materialValue, valid: r.valid,
    violations: r.violations.map(({ kind, s0, s1 }) => ({ kind, s0, s1 })) };
}
export interface CostFixture { name: string; design: Design; expected: ReturnType<typeof bill> }
export function regressionFixtures(): CostFixture[] {
  const data = JSON.parse(readFileSync(sets[regressionPackKey()].fixture, 'utf8'));
  if (data.modelVersion !== COST_MODEL_VERSION) throw new Error('Cost model changed: review bill/geometry deltas before creating its frozen fixtures.');
  return data.fixtures;
}
export function numericLeaves(value: object, prefix = ''): [string, number][] {
  return Object.entries(value).flatMap(([key, v]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof v === 'number' ? [[path, v] as [string, number]] : numericLeaves(v, path);
  });
}
if (process.argv[1]?.endsWith('/eval-regression.ts')) {
  if (process.argv.includes('--capture')) throw new Error('Use an explicit --capture=original|current --reviewed-model-change; never overwrite historical fixtures implicitly.');
  const capture = process.argv.find(a => a.startsWith('--capture='))?.split('=')[1] as PackKey | undefined;
  if (capture && (!Object.hasOwn(sets, capture) || !process.argv.includes('--reviewed-model-change')))
    throw new Error('Capture requires --capture=original|current --reviewed-model-change; never rebaseline an optimization.');
  const ctx = regressionContext(!capture);
  if (capture) {
    const fixtures: CostFixture[] = [];
    const add = (name: string, design: Design, mustBeValid = false) => {
      const r = evaluate(ctx, design);
      if (mustBeValid && !r.valid) throw new Error(`${name}: refusing to freeze an invalid published design`);
      fixtures.push({ name, design, expected: bill(r) }); return r;
    };
    if (capture === 'original') {
      // Preserve exactly the historical input controls, including their original manual grade.
      if (JSON.stringify(packFingerprint()) !== JSON.stringify(JSON.parse(readFileSync(sets.original.fingerprint, 'utf8'))))
        throw new Error('Original fixture inputs must use their untouched original pack fingerprint.');
      const old: CostFixture[] = JSON.parse(readFileSync('tests/fixtures/evaluate-costs.json', 'utf8'));
      for (const f of old) add(f.name, f.design);
    } else {
      add('straight', { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }, true);
      for (const name of ['best', 'demo', 'direct-80', 'direct-90', 'town-centre']) {
        const d: Design = JSON.parse(readFileSync(`scripts/${name}-design.json`, 'utf8')).design;
        const r = add(name, d, true);
        if (name === 'best') {
          const moved = structuredClone(d); moved.pis[3].x += 35; moved.pis[3].y -= 20;
          add('best-drag', moved);
          const i = Math.round(r.n / 2);
          add('best-pin', { ...d, gradePins: [{ s: r.s[i], z: r.grade[i] + 1 }] });
          add('best-structures', { ...d, structureOverrides: [{ s0: 900, s1: 1100, kind: 0 }, { s0: 6000, s1: 6100, kind: 1 }] });
          add('best-manual', { ...d, profileMode: 'manual', vpis: r.vpis.map((v, i) => ({ ...v, z: v.z + (i === 2 ? 2 : 0) })) });
        }
        if (name === 'town-centre') add('town-controls', { ...d, wallOverrides: [{ s0: 8000, s1: 8300, side: 'L', height: 4 }],
          buildingOverrides: [{ j: r.demolished[0]?.j ?? 0, action: 'keep' }],
          crossingOverrides: r.crossings.slice(0, 1).map(c => ({ roadId: c.roadId!, type: 'junction' })) });
      }
      writeFileSync(sets.current.fingerprint, JSON.stringify(packFingerprint(), null, 2) + '\n');
    }
    writeFileSync(sets[capture].fixture, JSON.stringify({ modelVersion: COST_MODEL_VERSION, dataset: capture, fixtures }, null, 2) + '\n');
    console.log(`Captured ${fixtures.length} model-${COST_MODEL_VERSION} bills for ${capture}; model-13 files untouched`);
  } else for (const f of regressionFixtures()) {
    const actual = bill(evaluate(ctx, f.design));
    for (const group of ['cost', 'parts'] as const) {
      const got = new Map(numericLeaves(actual[group]));
      for (const [key, value] of numericLeaves(f.expected[group])) if (!(Math.abs(got.get(key)! - value) < 0.005))
        throw new Error(`${f.name} ${group}.${key}: ${got.get(key)} != ${value}`);
    }
    for (const key of ['vpis', 'materialValue', 'valid', 'violations', 'geometryHash'] as const)
      if (JSON.stringify(actual[key]) !== JSON.stringify(f.expected[key])) throw new Error(`${f.name}: ${key} changed`);
    // The project facade must reproduce the legacy kernel bit for bit, not merely within tolerance.
    const project = makeLegacyProjectContext(ctx, { presetId: 'legacy-road', packId: 'd11', objectData: 'regression', transportData: null });
    const design = projectFromLegacyDesign(f.design, project);
    const published = evaluateProject({ legacy: ctx, environment: { objectData: 'regression', transportData: null, terrainData: 'pack',
      pricingData: 'pricing', waterData: 'water', terrainClass: 'hilly' } }, { epoch: 'regression', revision: 0, design });
    const viaProject = published.routes[design.routes[0].id]?.legacy;
    if (!viaProject || JSON.stringify(bill(viaProject)) !== JSON.stringify(actual) || published.cost.total !== actual.cost.total)
      throw new Error(`${f.name}: project facade differs from the legacy evaluation`);
    console.log(`PASS ${f.name}: ${actual.cost.total.toFixed(2)} CZK (project facade identical)`);
  }
}
