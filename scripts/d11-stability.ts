// D11 straight start: small edits must stay local and comparable (playtest-qa-2 re-tests 4 and 6).
//   npx tsx scripts/d11-stability.ts            (D11 pack; exit 1 if a check fails)
// Repros: a 15 m grade pin at km 9 (up and down); a bend put in at km 9 (3°) and km 3 (5°), either side, as a
// small drag on the straight does. A pin leaves the plan alone: beyond FAR (5 km) of it the grade and the
// problems must not change. A new bend turns the whole line about A and B (the plan itself moves far away),
// so for those the far grade is not comparable; each problem is listed with how far the plan moved there,
// and a problem where the plan moved less than 1 m counts as non-local.
import { loadPack } from './loadpack';
import { evaluate, type Design, type EvalContext, type Result } from '../src/core/evaluate';

const { meta, scenario, terrain, buildings, roads, junctions } = loadPack();
const ctx: EvalContext = { terrain, scenario, buildings, roads, junctions, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
const FAR = 5000;
const base: Design = { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [], structureOverrides: [] };
const r0 = evaluate(ctx, base);
const bn = (x: number) => (x / 1e9).toFixed(2);
const at = (r: Result, arr: ArrayLike<number>, s: number) => {
  const f = Math.max(0, Math.min(r.n - 1, s / r.ds)), i = Math.min(r.n - 2, Math.floor(f));
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
};
/** distance from (x, y) to the base centreline */
const offBase = (x: number, y: number) => { let d = Infinity; for (let i = 0; i < r0.n; i += 2) d = Math.min(d, Math.hypot(r0.x[i] - x, r0.y[i] - y)); return d; };
const key = (v: Result['violations'][number]) => `${(v.s0 / 1000).toFixed(1)} ${v.title}`;
console.log(`straight start: ${bn(r0.cost.total)} bn ${r0.valid ? 'VALID' : 'NOT VALID'}, ${(r0.length / 1000).toFixed(2)} km`);
let failed = 0;

for (const [km, dz] of [[9, 15], [9, -15]] as const) {
  const z = at(r0, r0.grade, km * 1000) + dz;
  const r = evaluate(ctx, { ...base, gradePins: [{ s: km * 1000, z }] });
  let far = 0, sFar = NaN;
  for (let i = 0; i < r.n; i++) if (Math.abs(r.s[i] - km * 1000) > FAR) { const d = Math.abs(r.grade[i] - r0.grade[i]); if (d > far) { far = d; sFar = r.s[i]; } }
  const was = new Set(r0.violations.map(key));
  const newFar = r.violations.filter(v => Math.abs((v.s0 + v.s1) / 2 - km * 1000) > FAR && !was.has(key(v)));
  const ok = far <= 0.5 && !newFar.length;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} pin ${dz > 0 ? '+' : ''}${dz} m at km ${km}: ${bn(r.cost.total)} bn (${bn(r.cost.total - r0.cost.total)}) ${r.valid ? 'VALID' : 'NOT VALID'}; `
    + `far grade change ${far.toFixed(2)} m${far > 0.01 ? ` at km ${(sFar / 1000).toFixed(1)}` : ''}; new far problems: ${newFar.map(key).join('; ') || 'none'}`);
}

for (const [km, deg] of [[9, 3], [3, 5]] as const) for (const side of [1, -1]) {
  // the offset at km that turns the straight by `deg` there
  const s = km * 1000, L = r0.length, i = Math.round(s / r0.ds);
  let lo = 0, hi = 2000;
  for (let k = 0; k < 50; k++) { const h = (lo + hi) / 2; if (Math.atan(h / s) + Math.atan(h / (L - s)) < deg * Math.PI / 180) lo = h; else hi = h; }
  const h = lo * side;
  const d: Design = { ...base, pis: [{ x: Math.round((r0.x[i] - r0.ty[i] * h) * 10) / 10, y: Math.round((r0.y[i] + r0.tx[i] * h) * 10) / 10, r: null }] };
  const r = evaluate(ctx, d);
  const was = new Set(r0.violations.map(key));
  const added = r.violations.filter(v => !was.has(key(v))).map(v => {
    const j = Math.min(r.n - 1, Math.round((v.s0 + v.s1) / 2 / r.ds));
    return { v, moved: offBase(r.x[j], r.y[j]) };
  });
  const nonLocal = added.filter(a => a.moved < 1);
  if (nonLocal.length) failed++;
  console.log(`${nonLocal.length ? 'FAIL' : 'PASS'} bend ${deg}° at km ${km} (${Math.abs(h).toFixed(0)} m ${side > 0 ? 'left' : 'right'}): ${bn(r.cost.total)} bn (${bn(r.cost.total - r0.cost.total)}) `
    + `${r.valid ? 'VALID' : 'NOT VALID'}; new problems: ${added.map(a => `${key(a.v)} (plan moved ${a.moved.toFixed(0)} m there)`).join('; ') || 'none'}`);
}
process.exit(failed ? 1 : 0);
