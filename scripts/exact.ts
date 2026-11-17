// Bit-exactness check for behaviour-preserving changes (refactors, performance work): every result the
// evaluators produce for a fixed set of inputs, hashed in full. The frozen D11 bills (eval-regression.ts)
// cover 11 designs of one pack; this covers every preset whose pack is installed (road, motorway and
// railway missions through the project evaluator), every saved design, drag previews and seeded random
// designs — and compares whole results, not only bills.
//
//   npx tsx scripts/exact.ts --out /tmp/before.json          on the commit you start from (e.g. main)
//   npx tsx scripts/exact.ts --compare /tmp/before.json      after the change: exit 1 on any difference
//   options: --random N (D11 random designs, default 12), --seed S, --only d11,d3-0302 (pack ids)
//   EXACT_TEXT=map.json (a deliberate change of wording): [["old text", "new text"], …] replaced in every string
//     before hashing, on both sides: snapshot the base and compare the change with the same map, and the
//     results are proved identical but for those words.
//
// A difference prints which case changed and the first differing bill lines. It does not replace the
// frozen fixtures: it has no memory beyond the file you give it.
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { evaluate, type Design, type Result } from '../src/core/evaluate';
import { PRESETS } from '../src/core/data/scenario';
import { evaluateProject, previewProjectRoute } from '../src/core/project-evaluate';
import { bill } from './eval-regression';
import { evalContext, loadPack, projectContext } from './loadpack';

type Case = { hash: string; bill?: ReturnType<typeof bill>; total?: number | null; valid?: boolean; issues?: string[] };
type Snapshot = Record<string, Case>;

/** Canonical JSON of anything the evaluators return: typed arrays as numbers (-0, NaN and ±Infinity kept
 * apart), Maps / Sets in insertion order, object keys sorted, functions and wall-clock timings dropped. */
const TEXT: [string, string][] = process.env.EXACT_TEXT ? JSON.parse(readFileSync(process.env.EXACT_TEXT, 'utf8')) : [];
function canonical(value: unknown, seen = new Set<object>()): unknown {
  if (typeof value === 'string') return TEXT.reduce((s, [was, now]) => s.split(was).join(now), value);
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0) ? value : `#${Object.is(value, -0) ? '-0' : value}`;
  if (value === null || typeof value !== 'object') return typeof value === 'function' || value === undefined ? undefined : value;
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>, v => canonical(v));
  if (seen.has(value)) return '#cycle';
  seen.add(value);
  let out: unknown;
  if (Array.isArray(value)) out = value.map(v => canonical(v, seen) ?? null);
  else if (value instanceof Map) out = { '#map': [...value].map(([k, v]) => [canonical(k, seen), canonical(v, seen)]) };
  else if (value instanceof Set) out = { '#set': [...value].map(v => canonical(v, seen)) };
  else out = Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'timing').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => [k, canonical(v, seen)]));
  seen.delete(value);
  return out;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const road = (r: Result): Case => ({ hash: hash(r), bill: bill(r) });

function snapshotPack(id: string, random: number, seed0: number): Snapshot {
  const out: Snapshot = {};
  const pack = loadPack(`public/scenarios/${id}`);
  const ctx = evalContext(pack);
  const A = ctx.a, B = ctx.b;
  // 1. the single-road evaluator on the pack's own ends: the straight start, every saved design, their
  //    drag previews, seeded random designs
  const designs: [string, Design][] = [['straight', { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }]];
  const saved = id === 'd11' ? readdirSync('scripts').filter(f => f.endsWith('-design.json')).sort().map(f => `scripts/${f}`)
    : existsSync(`scripts/scenarios/${id}`) ? readdirSync(`scripts/scenarios/${id}`).filter(f => f.endsWith('.json')).sort().map(f => `scripts/scenarios/${id}/${f}`) : [];
  for (const file of saved) {
    const design = JSON.parse(readFileSync(file, 'utf8')).design as Design | undefined;
    // (a preset's own ends, e.g. the Královec railway's stations, are evaluated as its mission below)
    if (design?.pis && !PRESETS.some(p => p.id === id && p.ports && file.endsWith(`/${p.presetId}.json`))) designs.push([file, design]);
  }
  let seed = seed0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let k = 0; k < (id === 'd11' ? random : 0); k++) {
    const count = 2 + Math.floor(rand() * 7), dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
    const pis = Array.from({ length: count }, (_, j) => {
      const t = (j + 0.5 + (rand() - 0.5) * 0.6) / count, off = (rand() - 0.5) * 3000;
      return { x: Math.round(A.x + dx * t - dy / len * off), y: Math.round(A.y + dy * t + dx / len * off), r: null };
    });
    designs.push([`random-${seed0}-${k}`, { category: rand() < 0.3 ? 'S7.5' : 'S9.5', speed: rand() < 0.5 ? 80 : 90, pis, profileMode: 'auto', vpis: [] }]);
  }
  for (const [name, design] of designs) {
    const full = evaluate(ctx, design);
    out[`${id} evaluate ${name}`] = road(full);
    out[`${id} preview ${name}`] = road(evaluate(ctx, design, { preview: true, materialValue: full.quantities.materialValue, structureValue: full.quantities.structureValue }));
  }
  // 2. every preset of this pack as the game starts it: the whole project (its routes, shared works,
  //    houses and issues), and a drag preview of each route after the full result
  for (const scenario of PRESETS.filter(p => p.id === id)) {
    const preset = scenario.presetId ?? scenario.id;
    const { ctx: project, initial } = projectContext(pack, scenario);
    const design = initial(), snapshot = { epoch: 'exact', revision: 1, design };
    const result = evaluateProject(project, snapshot);
    out[`${id} project ${preset}`] = { hash: hash(result), total: result.cost.total, valid: result.valid,
      issues: result.issues.map(i => `${i.blocking}: ${i.violation.title}`) };
    for (const route of design.routes) {
      const legacy = result.routes[route.id]?.legacy;
      if (legacy) out[`${id} project ${preset} ${route.id}`] = road(legacy);
      const preview = previewProjectRoute(project, snapshot, route.id, { materialValue: legacy?.quantities.materialValue, structureValue: legacy?.quantities.structureValue }, result);
      out[`${id} project-preview ${preset} ${route.id}`] = preview.legacy ? road(preview.legacy) : { hash: hash(preview) };
    }
  }
  return out;
}

const here = fileURLToPath(import.meta.url);
const arg = (k: string) => { const i = process.argv.indexOf(k); return i < 0 ? undefined : process.argv[i + 1]; };
const random = Number(arg('--random') ?? 12), seed = Number(arg('--seed') ?? 1);

if (process.env.EXACT_PACK) {
  writeFileSync(process.env.EXACT_OUT!, JSON.stringify(snapshotPack(process.env.EXACT_PACK, random, seed)));
} else if (process.argv[1] === here) {
  const out = arg('--out'), compare = arg('--compare');
  if (!out === !compare) { console.error('usage: exact.ts --out file.json | --compare file.json [--random N] [--seed S] [--only id,id]'); process.exit(2); }
  const only = arg('--only')?.split(',');
  const packs = [...new Set(PRESETS.map(p => p.id))].filter(id => existsSync(`public/scenarios/${id}/meta.json`) && (!only || only.includes(id)));
  const missing = [...new Set(PRESETS.map(p => p.id))].filter(id => !existsSync(`public/scenarios/${id}/meta.json`));
  if (missing.length) console.log(`(packs not installed, skipped: ${missing.join(', ')})`);
  // one process per pack, four at a time (the whole D3 alone holds ≈ 0.5 GB; each is capped at 3 GB)
  const dir = mkdtempSync(`${tmpdir()}/trapla-exact-`);
  const one = (id: string) => new Promise<Snapshot>((resolve, reject) => {
    const file = `${dir}/${id}.json`;
    const child = spawn(process.execPath, ['--max-old-space-size=3072', '--import', 'tsx', here, '--random', String(random), '--seed', String(seed)],
      { env: { ...process.env, EXACT_PACK: id, EXACT_OUT: file }, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('close', code => code === 0 ? resolve(JSON.parse(readFileSync(file, 'utf8'))) : reject(new Error(`${id}: exit ${code}`)));
  });
  const parts: Snapshot[] = [], queue = [...packs];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => { for (let id = queue.shift(); id; id = queue.shift()) parts.push(await one(id)); }));
  const snapshot: Snapshot = Object.assign({}, ...parts);
  const names = Object.keys(snapshot).sort();
  if (out) {
    writeFileSync(out, JSON.stringify({ random, seed, packs, cases: Object.fromEntries(names.map(n => [n, snapshot[n]])) }, null, 1));
    console.log(`${names.length} results of ${packs.length} packs written to ${out}`);
  } else {
    const before = JSON.parse(readFileSync(compare!, 'utf8')) as { random: number; seed: number; packs: string[]; cases: Snapshot };
    if (before.random !== random || before.seed !== seed) { console.error(`The snapshot was taken with --random ${before.random} --seed ${before.seed}: use the same.`); process.exit(2); }
    let differences = 0;
    const leaves = (v: unknown, path = ''): [string, string][] => v !== null && typeof v === 'object'
      ? Object.entries(v).flatMap(([k, w]) => leaves(w, path ? `${path}.${k}` : k)) : [[path, JSON.stringify(v)]];
    for (const name of [...new Set([...names, ...Object.keys(before.cases)])].sort()) {
      if (!packs.includes(name.split(' ')[0])) continue; // --only: the other packs are not compared
      const a = before.cases[name], b = snapshot[name];
      if (a && b && a.hash === b.hash) continue;
      differences++;
      if (!a || !b) { console.log(`DIFF ${name}: ${a ? 'no longer produced' : 'new case'}`); continue; }
      const was = new Map(leaves({ ...a, hash: undefined })), lines: string[] = [];
      for (const [k, v] of leaves({ ...b, hash: undefined })) if (was.get(k) !== v) lines.push(`${k}: ${was.get(k)} → ${v}`);
      console.log(`DIFF ${name}${lines.length ? `\n    ${lines.slice(0, 8).join('\n    ')}${lines.length > 8 ? `\n    … ${lines.length - 8} more` : ''}` : ' (same bill, another field of the result differs)'}`);
    }
    const skipped = before.packs.filter(p => !packs.includes(p));
    console.log(differences ? `${differences} of ${names.length} results differ` : `identical: ${names.length} results of ${packs.length} packs${skipped.length ? ` (not compared: ${skipped.join(', ')})` : ''}`);
    process.exit(differences ? 1 : 0);
  }
}
