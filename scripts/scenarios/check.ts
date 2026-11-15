// Scenario-specific acceptance; never applies these fixtures to the top-level D11 glob.
// SCENARIO=d3 node --max-old-space-size=2048 --import tsx scripts/scenarios/check.ts [--seed] [--straight]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadPack } from '../loadpack';
import { evaluate, type Design, type EvalContext } from '../../src/core/evaluate';
import { PART_KEYS } from '../../src/core/cost';
import { startDesign } from '../../src/state';

const { meta, scenario, terrain, buildings, roads } = loadPack();
if (meta.id === 'd11') throw new Error('Choose a new scenario explicitly with SCENARIO.');
const dir = `public/scenarios/${meta.id}`;
const ready = JSON.parse(readFileSync(`${dir}/ready.json`, 'utf8'));
if (ready.id !== meta.id || !ready.ready) throw new Error('Pack build is incomplete.');
const ctx: EvalContext = { terrain, scenario, buildings, roads,
  a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
const fixtureDir = `scripts/scenarios/${meta.id}`;
if (process.argv.includes('--seed')) {
  mkdirSync(fixtureDir, { recursive: true });
  const initial: Design = { ...startDesign(), ...scenario.initial };
  writeFileSync(`${fixtureDir}/default.json`, JSON.stringify({ scenario: meta.id, purpose: 'Fresh road exercise', design: initial }, null, 2));
  const off = meta.official.xy as [number, number][];
  if (off.length < 2) throw new Error('No mapped reference: do not invent an official fixture.');
  const reference: Design = { ...initial, pis: [] };
  let distance = 0;
  for (let i = 1; i < off.length - 1; i++) {
    distance += Math.hypot(off[i][0] - off[i - 1][0], off[i][1] - off[i - 1][1]);
    if (distance >= 1500) { reference.pis.push({ x: off[i][0], y: off[i][1], r: null }); distance = 0; }
  }
  writeFileSync(`${fixtureDir}/reference.json`, JSON.stringify({ scenario: meta.id,
    purpose: 'Road exercise near the mapped reference, not the official motorway design or surveyed profile', design: reference }, null, 2));
}
let failed = false;
for (const name of ['default', 'reference', ...(process.argv.includes('--straight') ? ['straight'] : [])]) {
  const fixture = name === 'straight'
    ? { scenario: meta.id, design: { ...startDesign(), ...scenario.initial, pis: [] } }
    : JSON.parse(readFileSync(`${fixtureDir}/${name}.json`, 'utf8'));
  if (fixture.scenario !== meta.id) throw new Error('Fixture belongs to another scenario.');
  const d: Design = fixture.design;
  let r = evaluate(ctx, d);
  for (let i = 0; i < 4; i++) r = evaluate(ctx, d);
  const samples = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now(); r = evaluate(ctx, d); samples.push(performance.now() - start);
  }
  const sum = PART_KEYS.reduce((total, key) => total + r.parts[key].reduce((a, b) => a + b, 0), 0);
  const valid = r.violations.length === 0 && Math.abs(sum - r.cost.total) < .01;
  // Raw straight diagnostics remain visible/reproducible; only the offered starter/reference
  // fixtures are acceptance claims. Never change norms or suppress violations to pass them.
  if (name !== 'straight') failed ||= !valid;
  console.log(JSON.stringify({ scenario: meta.id, name, valid, lengthM: r.length, travelMin: r.travelMin,
    cost: r.cost.total, partsError: sum - r.cost.total,
    medianMs: samples.sort((a, b) => a - b)[5], maxMs: samples[9],
    violations: r.violations.map(v => ({ title: v.title, fix: v.fix, basis: v.basis })) }, null, 2));
}
console.log(JSON.stringify({ nx: meta.nx, ny: meta.ny, cell: meta.cell,
  heightBytes: meta.nx * meta.ny * 4,
  groundFingerprint: meta.ground?.fingerprint, waterFingerprint: meta.watercourses?.sha256,
  manifestSha256: createHash('sha256').update(readFileSync(`${dir}/manifest.json`)).digest('hex'),
  processMemory: process.memoryUsage() }, null, 2));
if (failed) process.exitCode = 1;
