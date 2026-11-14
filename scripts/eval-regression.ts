/// <reference types="node" />
// Freeze BEFORE an optimization; verify afterwards (re-capture/re-baselining requires review).
// npx tsx scripts/eval-regression.ts --capture | npx tsx scripts/eval-regression.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluate, type Design, type EvalContext } from '../src/core/evaluate';
import { PART_KEYS } from '../src/core/cost';
import { loadPack } from './loadpack';

export const fixturePath = 'tests/fixtures/evaluate-costs.json';
const packPath = 'public/scenarios/d11', fingerprintPath = 'tests/fixtures/evaluate-pack.json';
export function packFingerprint(): Record<string, string> {
  const meta = JSON.parse(readFileSync(`${packPath}/meta.json`, 'utf8'));
  const files = ['meta.json', 'overlays.json', meta.heights.file, meta.landcover.file, meta.ground?.file, meta.watercourses?.file].filter(Boolean);
  return Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(`${packPath}/${file}`)).digest('hex')]));
}
export function regressionPackAvailable() {
  // An absent optional pack skips integration tests; a partial/corrupt pack must fail loudly.
  return existsSync(`${packPath}/meta.json`);
}
export function regressionContext(checkPack = true): EvalContext {
  if (checkPack && JSON.stringify(packFingerprint()) !== JSON.stringify(JSON.parse(readFileSync(fingerprintPath, 'utf8')))) {
    throw new Error('Regression scenario pack changed: compare against the original pack or capture a new reviewed baseline before optimizing.');
  }
  const { meta, terrain, scenario, buildings, roads } = loadPack(packPath);
  return { terrain, scenario, buildings, roads, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
}
export function bill(r: ReturnType<typeof evaluate>) {
  return { cost: r.cost, parts: Object.fromEntries(PART_KEYS.map(k => [k, r.parts[k].reduce((a, b) => a + b, 0)])),
    vpis: r.vpis, materialValue: r.quantities.materialValue };
}
export interface CostFixture { name: string; design: Design; expected: ReturnType<typeof bill> }
export function numericLeaves(value: object, prefix = ''): [string, number][] {
  return Object.entries(value).flatMap(([key, v]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof v === 'number' ? [[path, v] as [string, number]] : numericLeaves(v, path);
  });
}
if (process.argv[1]?.endsWith('/eval-regression.ts')) {
  const ctx = regressionContext(!process.argv.includes('--capture'));
  if (process.argv.includes('--capture')) {
    const fixtures: CostFixture[] = [];
    const add = (name: string, design: Design) => {
      const r = evaluate(ctx, design);
      fixtures.push({ name, design, expected: bill(r) });
      return r;
    };
    for (const name of ['best', 'demo', 'direct-80', 'direct-90', 'town-centre']) {
      const d: Design = JSON.parse(readFileSync(`scripts/${name}-design.json`, 'utf8')).design;
      const r = add(name, d);
      if (name === 'best') {
        const moved = structuredClone(d); moved.pis[3].x += 35; moved.pis[3].y -= 20;
        add('best-drag', moved);
        const i = Math.round(r.n / 2);
        add('best-pin', { ...d, gradePins: [{ s: r.s[i], z: r.grade[i] + 1 }] });
        add('best-structures', { ...d, structureOverrides: [{ s0: 900, s1: 1100, kind: 0 }, { s0: 6000, s1: 6100, kind: 1 }] });
        add('best-manual', { ...d, profileMode: 'manual', vpis: r.vpis.map((v, i) => ({ ...v, z: v.z + (i === 2 ? 2 : 0) })) });
      }
      if (name === 'town-centre') {
        add('town-controls', { ...d, wallOverrides: [{ s0: 8000, s1: 8300, side: 'L', height: 4 }],
          buildingOverrides: [{ j: r.demolished[0]?.j ?? 0, action: 'keep' }],
          crossingOverrides: r.crossings.slice(0, 1).map(c => ({ roadId: c.roadId!, type: 'junction' })) });
      }
    }
    writeFileSync(fixturePath, JSON.stringify(fixtures, null, 2) + '\n');
    writeFileSync(fingerprintPath, JSON.stringify(packFingerprint(), null, 2) + '\n');
    console.log(`Captured ${fixtures.length} pre-optimization bills`);
  } else {
    const fixtures: CostFixture[] = JSON.parse(readFileSync(fixturePath, 'utf8'));
    for (const f of fixtures) {
      const actual = bill(evaluate(ctx, f.design));
      for (const group of ['cost', 'parts'] as const) {
        const got = new Map(numericLeaves(actual[group]));
        for (const [key, value] of numericLeaves(f.expected[group])) {
          if (!(Math.abs(got.get(key)! - value) < 0.005)) throw new Error(`${f.name} ${group}.${key}: ${got.get(key)} != ${value}`);
        }
      }
      if (JSON.stringify(actual.vpis) !== JSON.stringify(f.expected.vpis)) throw new Error(`${f.name}: grade changed`);
      if (actual.materialValue !== f.expected.materialValue) throw new Error(`${f.name}: material value changed`);
      console.log(`PASS ${f.name}: ${actual.cost.total.toFixed(2)} CZK`);
    }
  }
}
