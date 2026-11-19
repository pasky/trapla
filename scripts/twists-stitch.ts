// A whole route's design stitched from its sections' reference designs (scripts/twists/<section>/*.json): each section's
// bends, height pins and painted structures carried over into the whole pack (EPSG:5514 places, stations re-measured on
// the stitched line); the rest of the line stays the starter's. A starting point for `twists-check.ts --find --from`.
//
//   npx tsx scripts/twists-stitch.ts <whole preset> <section fixture.json>… --out f.json
import { readFileSync, writeFileSync } from 'node:fs';
import { check, evalDesign, mission, nearestS, type Fixture } from './twists-check';
import { legacyDesignForRoute, replaceRouteFromLegacy } from '../src/core/project-legacy';
import type { Design } from '../src/core/evaluate';
import { TWIST_ORDER } from '../src/core/twists';

const args = process.argv.slice(2), out = args[args.indexOf('--out') + 1];
const whole = mission(args[0]), o = whole.pack.meta.origin as [number, number];
const files = args.slice(1).filter(a => a.endsWith('.json') && a !== out);
const routeOf = (d: Fixture['design']) => d.routes.find(r => r.role === 'mission')!.id;
const wr = routeOf(whole.starter);
const L0 = evalDesign(whole, whole.starter).routes[wr]!.legacy!;
const base = legacyDesignForRoute(whole.starter, wr);
type Pt = { x: number; y: number };
const at = (L: { n: number; x: Float64Array; y: Float64Array; ds: number }, s: number): Pt => {
  const i = Math.max(0, Math.min(L.n - 2, Math.floor(s / L.ds))), t = Math.max(0, Math.min(1, s / L.ds - i));
  return { x: L.x[i] + (L.x[i + 1] - L.x[i]) * t, y: L.y[i] + (L.y[i + 1] - L.y[i]) * t };
};
const sections = files.map(f => {
  const fx = JSON.parse(readFileSync(f, 'utf8')) as Fixture, m = mission(fx.preset), so = m.pack.meta.origin as [number, number];
  const r = routeOf(fx.design), d = legacyDesignForRoute(fx.design, r), L = evalDesign(m, fx.design).routes[r]!.legacy!;
  const conv = (p: Pt): Pt => ({ x: p.x + so[0] - o[0], y: p.y + so[1] - o[1] });
  const a = conv({ x: L.x[0], y: L.y[0] }), b = conv({ x: L.x[L.n - 1], y: L.y[L.n - 1] });
  const s0 = nearestS(L0, a.x, a.y), s1 = nearestS(L0, b.x, b.y);
  console.log(`${fx.preset} (${f}): whole km ${(s0 / 1000).toFixed(2)}–${(s1 / 1000).toFixed(2)}, ${d.pis.length} bends, ${d.gradePins?.length ?? 0} pins, ${d.structureOverrides?.length ?? 0} painted`);
  return { fx, d, L, conv, s0, s1 };
});
// the bends: the starter's outside every section, each section's inside it
const pis = [
  ...base.pis.filter(p => { const s = nearestS(L0, p.x, p.y); return !sections.some(q => s >= q.s0 - 1 && s <= q.s1 + 1); }),
  ...sections.flatMap(q => q.d.pis.map(p => ({ ...p, ...q.conv(p) }))),
].map(p => ({ p, s: nearestS(L0, p.x, p.y) })).sort((a, b) => a.s - b.s).map(q => q.p);
const stage1: Design = { ...structuredClone(base), pis, gradePins: [], structureOverrides: [] };
let design = replaceRouteFromLegacy(whole.starter, wr, stage1);
const L1 = evalDesign(whole, design).routes[wr]!.legacy!;
// the heights and the painted structures, their stations measured anew on the stitched line
const sOn = (q: typeof sections[number], s: number) => { const p = q.conv(at(q.L, s)); return nearestS(L1, p.x, p.y); };
const gradePins = sections.flatMap(q => (q.d.gradePins ?? []).map(p => ({ s: Math.round(sOn(q, p.s)), z: p.z }))).sort((a, b) => a.s - b.s);
const structureOverrides = sections.flatMap(q => (q.d.structureOverrides ?? []).map(so => ({ ...so, s0: sOn(q, so.s0), s1: sOn(q, so.s1) })));
design = replaceRouteFromLegacy(whole.starter, wr, { ...stage1, gradePins, structureOverrides });
const r = evalDesign(whole, design);
console.log(`${r.valid ? 'VALID' : 'NOT VALID'} ${((r.cost.total ?? NaN) / 1e6).toFixed(0)} M (starter ${(whole.setup.mission.startBill / 1e6).toFixed(0)} M) ${r.issues.map(i => i.violation?.title ?? i.code).slice(0, 4).join('; ')}`);
for (const c of check(whole, design, r, TWIST_ORDER)) console.log(`  ${c.met ? '✓' : '✗'} ${c.id}: ${c.status}${c.issues.slice(0, 6).map(i => `\n      ${i.text}`).join('')}`);
writeFileSync(out, JSON.stringify({ preset: args[0], purpose: `Stitched from ${files.join(', ')} (scripts/twists-stitch.ts)`, meets: [], design } satisfies Fixture, null, 1));
