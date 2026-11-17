// What the stretch-local retry changes (src/core/crossings-kept.ts; docs/evaluate-performance.md): every case
// of scripts/exact.ts evaluated with every finish building the crossings of the whole route (the reference),
// then with a later finish building only those near what it changed, and once more with both builds in each
// later finish (the local one checked against the whole route's on the same inputs).
//
//   npx tsx scripts/local-retry-report.ts [--only d11,d3] [--random N] [--seed S] [--json out.json]
//
// Prints: the cases whose result differs (bill lines, validity, crossings), how the finishes were built
// (local / whole route and why), and each finish whose local build is not the whole route's. Exit 1 when a
// result or a local build differs (a gate: scripts/gates.sh full).
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { LOCAL_RETRY, type LocalBuildReport } from '../src/core/crossings-kept';
import { PRESETS } from '../src/core/data/scenario';
import type { Result } from '../src/core/evaluate';
import { snapshotPack } from './exact';

interface Detail { valid?: boolean; total?: number; crossings?: Record<string, string>; violations?: string[]; ms?: number }
interface PackReport {
  whole: ReturnType<typeof snapshotPack>; local: ReturnType<typeof snapshotPack>;
  details: Record<'whole' | 'local', Record<string, Detail>>;
  finishes: { case: string; report: LocalBuildReport }[];
}

const here = fileURLToPath(import.meta.url);
const arg = (k: string) => { const i = process.argv.indexOf(k); return i < 0 ? undefined : process.argv[i + 1]; };
const random = Number(arg('--random') ?? 12), seed = Number(arg('--seed') ?? 1);

function detail(result: unknown): Detail {
  const r = result as Partial<Result> & { cost?: { total: number } };
  return { valid: r.valid, total: r.cost?.total,
    ...(r.crossings ? { crossings: Object.fromEntries(r.crossings.map(c => [`${c.roadId}@${Math.round(c.s)}`, `${c.type}${c.square ? ' square' : ''}${c.moved ? ' moved' : ''} ${Math.round(c.cost)}${c.targetS === undefined ? '' : ` → ${Math.round(c.targetS)}`}${c.issues?.length ? ` (${c.issues.length} issues)` : ''}`])) } : {}),
    ...(r.violations ? { violations: r.violations.map(v => `${v.kind} km ${(v.s0 / 1000).toFixed(2)}: ${v.title}`) } : {}) };
}

function pack(id: string): PackReport {
  const details: PackReport['details'] = { whole: {}, local: {} }, finishes: PackReport['finishes'] = [];
  let now = '', t0 = 0;
  const watch = (into: Record<string, Detail>) => ({ begin: (name: string) => { now = name; t0 = performance.now(); },
    end: (name: string, result: unknown) => { into[name] = { ...detail(result), ...(name === now ? { ms: performance.now() - t0 } : {}) }; now = ''; } });
  LOCAL_RETRY.local = false;
  const whole = snapshotPack(id, random, seed, watch(details.whole));
  LOCAL_RETRY.local = true;
  const local = snapshotPack(id, random, seed, watch(details.local));
  LOCAL_RETRY.local = false; LOCAL_RETRY.check = report => { if (now) finishes.push({ case: now, report }); };
  snapshotPack(id, random, seed, watch({}));
  return { whole, local, details, finishes };
}

if (process.env.LOCAL_REPORT_PACK) {
  writeFileSync(process.env.LOCAL_REPORT_OUT!, JSON.stringify(pack(process.env.LOCAL_REPORT_PACK)));
} else if (process.argv[1] === here) {
  const only = arg('--only')?.split(',');
  const packs = [...new Set(PRESETS.map(p => p.id))].filter(id => existsSync(`public/scenarios/${id}/meta.json`) && (!only || only.includes(id)));
  const dir = mkdtempSync(`${tmpdir()}/trapla-local-`);
  const one = (id: string) => new Promise<PackReport>((resolve, reject) => {
    const file = `${dir}/${id}.json`;
    const child = spawn(process.execPath, ['--max-old-space-size=4096', '--import', 'tsx', here, '--random', String(random), '--seed', String(seed)],
      { env: { ...process.env, LOCAL_REPORT_PACK: id, LOCAL_REPORT_OUT: file }, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('close', code => code === 0 ? resolve(JSON.parse(readFileSync(file, 'utf8'))) : reject(new Error(`${id}: exit ${code}`)));
  });
  const parts: PackReport[] = [], queue = [...packs];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => { for (let id = queue.shift(); id; id = queue.shift()) parts.push(await one(id)); }));
  const whole = Object.assign({}, ...parts.map(p => p.whole)) as PackReport['whole'], local = Object.assign({}, ...parts.map(p => p.local)) as PackReport['local'];
  const details = { whole: Object.assign({}, ...parts.map(p => p.details.whole)) as Record<string, Detail>, local: Object.assign({}, ...parts.map(p => p.details.local)) as Record<string, Detail> };
  const finishes = parts.flatMap(p => p.finishes);
  if (arg('--json')) writeFileSync(arg('--json')!, JSON.stringify({ whole, local, details, finishes }, null, 1));
  const names = Object.keys(whole).sort();
  // 1. results
  let differences = 0;
  const leaves = (v: unknown, path = ''): [string, string][] => v !== null && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, w]) => leaves(w, path ? `${path}.${k}` : k)) : [[path, JSON.stringify(v)]];
  for (const name of names) {
    const a = whole[name], b = local[name];
    if (b && a.hash === b.hash) continue;
    differences++;
    if (!b) { console.log(`DIFF ${name}: not produced`); continue; }
    const was = new Map(leaves({ ...a, hash: undefined })), lines: string[] = [];
    for (const [k, v] of leaves({ ...b, hash: undefined })) if (was.get(k) !== v) lines.push(`${k}: ${was.get(k)} → ${v}`);
    const p = details.whole[name], q = details.local[name];
    if (p && q) {
      if (p.valid !== q.valid) lines.push(`VALID: ${p.valid} → ${q.valid}`);
      for (const k of new Set([...Object.keys(p.crossings ?? {}), ...Object.keys(q.crossings ?? {})])) if (p.crossings?.[k] !== q.crossings?.[k]) lines.push(`crossing ${k}: ${p.crossings?.[k] ?? '—'} → ${q.crossings?.[k] ?? '—'}`);
      const gone = (p.violations ?? []).filter(v => !q.violations?.includes(v)), come = (q.violations ?? []).filter(v => !p.violations?.includes(v));
      for (const v of gone) lines.push(`no longer: ${v}`);
      for (const v of come) lines.push(`new: ${v}`);
    }
    console.log(`DIFF ${name}${lines.length ? `\n    ${lines.slice(0, 30).join('\n    ')}${lines.length > 30 ? `\n    … ${lines.length - 30} more` : ''}` : ' (same bill, crossings and problems; another field of the result differs)'}`);
  }
  console.log(differences ? `${differences} of ${names.length} results differ` : `identical: ${names.length} results of ${packs.length} packs`);
  // 2. how the finishes were built
  const paths: Record<string, number> = {};
  let built = 0, all = 0, msLocal = 0, msWhole = 0;
  for (const { report: r } of finishes) {
    paths[r.path] = (paths[r.path] ?? 0) + 1;
    if (r.path === 'local') { built += r.subset; all += r.crossings; msLocal += r.ms?.local ?? 0; msWhole += r.ms?.whole ?? 0; }
  }
  console.log(`finishes: ${finishes.length} (${Object.entries(paths).map(([k, v]) => `${k} ${v}`).join(', ')}); local ones built ${built} of ${all} crossings (${(100 * built / Math.max(1, all)).toFixed(0)} %), ${msLocal.toFixed(0)} ms against ${msWhole.toFixed(0)} ms for the whole route`);
  // 3. local builds that are not the whole route's
  const off = finishes.filter(f => f.report.differs?.length || f.report.issuesDiffer);
  for (const { case: name, report: r } of off) {
    console.log(`CHECK ${name}: ${r.core} / ${r.subset} / ${r.crossings} crossings built again / with context / in all, ${r.changed} stations changed${r.issuesDiffer ? '; issue list differs' : ''}`);
    for (const x of r.differs ?? []) console.log(`    ${x.key} km ${(x.s / 1000).toFixed(2)}, ${Math.round(x.d)} m from a change${x.core ? ' (built again)' : ''}: whole route ${x.whole}; local ${x.local}`);
  }
  console.log(`${off.length} of ${finishes.filter(f => f.report.path === 'local').length} local builds differ from the whole route's`);
  process.exit(differences || off.length ? 1 : 0);
}
