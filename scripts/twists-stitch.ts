// A whole route's design stitched from its sections' reference designs (scripts/twists/<section>/*.json): each section's
// bends, height pins and painted structures carried over into the whole pack (EPSG:5514 places, stations re-measured on
// the stitched line); the rest of the line stays the starter's. A starting point for `twists-check.ts --find --from`.
//
//   npx tsx scripts/twists-stitch.ts <whole preset> <section fixture.json>… [--manual] [--repair N] [--painted none|tunnels] [--freeze [--hybrid W]] --out f.json
import { readFileSync, writeFileSync } from 'node:fs';
import { check, evalDesign, mission, nearestS, type Fixture } from './twists-check';
import { legacyDesignForRoute, replaceRouteFromLegacy } from '../src/core/project-legacy';
import type { Design } from '../src/core/evaluate';
import { TWIST_ORDER } from '../src/core/twists';
import { paintOverride } from '../src/core/overrides';
import { KIND } from '../src/core/structures';

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
].map(p => ({ p, s: nearestS(L0, p.x, p.y) })).sort((a, b) => a.s - b.s)
  // (two sections' bends meeting at their boundary closer than 800 m would merge into one curve: the later one goes)
  .filter((q, k, a) => k === 0 || q.s - a[k - 1].s > Number(process.env.STITCH_GAP ?? 800) || !sections.some(sec => a[k - 1].s < sec.s0 && q.s >= sec.s0 - 1)).map(q => q.p);
// (STITCH_DROP=i,j: bends left out by index, where two sections' bends merge into one curve on the whole line)
for (const k of (process.env.STITCH_DROP ?? '').split(',').filter(Boolean).map(Number).sort((a, b) => b - a)) pis.splice(k, 1);
const stage1: Design = { ...structuredClone(base), pis, gradePins: [], structureOverrides: [] };
let design = replaceRouteFromLegacy(whole.starter, wr, stage1);
const L1 = evalDesign(whole, design).routes[wr]!.legacy!;
// the heights and the painted structures, their stations measured anew on the stitched line
const sOn = (q: typeof sections[number], s: number) => { const p = q.conv(at(q.L, s)); return nearestS(L1, p.x, p.y); };
const gradePins = sections.flatMap(q => (q.d.gradePins ?? []).map(p => ({ s: Math.round(sOn(q, p.s)), z: p.z }))).sort((a, b) => a.s - b.s);
// --painted none|tunnels: leave the sections' painted structures out (or all but their tunnels): Auto chooses again on the whole line
const painted = args.includes('--painted') ? args[args.indexOf('--painted') + 1] : 'all';
const structureOverrides = sections.flatMap(q => (q.d.structureOverrides ?? []).filter(so => painted === 'all' || (painted === 'tunnels' && so.kind === KIND.tunnel))
  .map(so => ({ ...so, s0: sOn(q, so.s0), s1: sOn(q, so.s1) })));
// --manual: the sections' own grade lines as the whole's heights by hand (where their pins do not solve on the whole line)
const vpis = sections.flatMap(q => q.L.vpis.map(v => ({ ...v, s: sOn(q, v.s) }))).sort((a, b) => a.s - b.s)
  .filter((v, i, a) => i === 0 || v.s - a[i - 1].s > 5);
// --boundary W: within W m of where two sections meet, the starter's own heights (the crossings just past a section's end
// were never in its design)
const boundary = (vs: typeof vpis) => {
  if (!args.includes('--boundary')) return vs;
  const w = Number(args[args.indexOf('--boundary') + 1]), cuts = sections.slice(1).map(q => sOn(q, 0));
  const inWin = (s: number) => cuts.some(c => Math.abs(s - c) <= w);
  const fromStarter = L0.vpis.map(v => ({ ...v, s: nearestS(L1, ...(Object.values(at(L0, v.s)) as [number, number])) })).filter(v => inWin(v.s));
  return [...vs.filter(v => !inWin(v.s)), ...fromStarter].sort((a, b) => a.s - b.s);
};
vpis.splice(0, vpis.length, ...boundary(vpis));
design = replaceRouteFromLegacy(whole.starter, wr, args.includes('--manual') ? { ...stage1, profileMode: 'manual', vpis, structureOverrides } : { ...stage1, gradePins, structureOverrides });
let r = evalDesign(whole, design);
// --freeze: the heights the whole line got (its pins as the sections set them, met or not) taken by hand, as By hand takes them
if (args.includes('--freeze')) {
  const d = legacyDesignForRoute(design, wr);
  let frozen = boundary(r.routes[wr]!.legacy!.vpis.map(v => ({ ...v })));
  // --hybrid W: each section's own heights (where its news are met), the whole line's within W m of where sections meet
  if (args.includes('--hybrid')) {
    const w = Number(args[args.indexOf('--hybrid') + 1]), cuts = sections.slice(1).map(q => sOn(q, 0)), inWin = (s: number) => cuts.some(c => Math.abs(s - c) <= w);
    frozen = [...vpis.filter(v => !inWin(v.s)), ...frozen.filter(v => inWin(v.s))].sort((a, b) => a.s - b.s);
  }
  design = replaceRouteFromLegacy(whole.starter, wr, { ...d, profileMode: 'manual', vpis: frozen, gradePins: [] });
  r = evalDesign(whole, design);
}
// --repair N: the fixes the issues spell out, applied N rounds (a pin moved to where the road passes, or unpinned, one of two bends that merge dropped, a height point raised or lowered by what they say, a bridge
// where they say, our road lowered under a bridge whose ramps would be too long)
for (let round = 0; round < Number(args[args.indexOf('--repair') + 1] ?? 0) && args.includes('--repair') && !r.valid; round++) {
  const d = legacyDesignForRoute(design, wr), L = r.routes[wr]!.legacy!;
  const near = (s: number) => d.vpis.slice(1, -1).reduce((b, v, k) => Math.abs(v.s - s) < Math.abs(d.vpis[b].s - s) ? k + 1 : b, 1);
  for (const i of r.issues) {
    const why = i.violation?.fix ?? '', loc = i.locations?.[0] as { s0?: number; s1?: number; pi?: number } | undefined;
    let m: RegExpMatchArray | null;
    if (d.profileMode === 'auto' && /^Move bends \d+ and \d+ about/.test(why) && loc?.pi !== undefined) d.pis = d.pis.filter((_, k) => k !== loc.pi! + Number(process.env.STITCH_PI_OFFSET ?? 0));
    else if (d.profileMode === 'auto' && (m = why.match(/Set it to ([\d.]+) m, or unpin/)) && loc?.s0 !== undefined)
      // (the road already passes there: the pin where it is)
      d.gradePins = (d.gradePins ?? []).map(p => Math.abs(p.s - loc.s0!) > 1 ? p : { ...p, z: Number(m![1]) });
    else if (d.profileMode === 'auto' && /or unpin/.test(why) && loc?.s0 !== undefined) d.gradePins = (d.gradePins ?? []).filter(p => Math.abs(p.s - loc.s0!) > 1);
    else if (d.profileMode === 'manual' && (m = why.match(/(Raise|Lower) your height pin at km ([\d.]+) by ([\d.]+) m/))) {
      const k = near(Number(m[2]) * 1000); d.vpis[k] = { ...d.vpis[k], z: d.vpis[k].z + (m[1] === 'Raise' ? 1 : -1) * (Number(m[3]) + 0.05) };
    } else if (d.profileMode === 'manual' && (m = why.match(/Move your height pin at km ([\d.]+) at least/))) d.vpis.splice(near(Number(m[1]) * 1000), 1);
    else if (d.profileMode === 'manual' && (m = why.match(/Raise the bridge at km ([\d.]+) by at least ([\d.]+) m/))) {
      const at = Number(m[1]) * 1000, k = near(at), j = Math.max(0, Math.min(L.n - 1, Math.round(at / L.ds))), z = L.grade[j] + Number(m[2]) + 0.5;
      if (Math.abs(d.vpis[k].s - at) < 150) d.vpis[k] = { ...d.vpis[k], z: d.vpis[k].z + Number(m[2]) + 0.5 };
      else d.vpis = [...d.vpis, { s: at, z, r: null }].sort((a, b) => a.s - b.s);
    } else if ((m = why.match(/on a bridge from km ([\d.]+) to km ([\d.]+)/))) d.structureOverrides = paintOverride(d.structureOverrides ?? [], Number(m[1]) * 1000 - 10, Number(m[2]) * 1000 + 10, KIND.bridge);
    else if (d.profileMode === 'manual' && /Lower our motorway here/.test(why) && loc?.s0 !== undefined) {
      const k = near(loc.s0), j = Math.max(0, Math.min(L.n - 1, Math.round(loc.s0 / L.ds)));
      d.vpis[k] = { ...d.vpis[k], z: Math.min(d.vpis[k].z, L.ground[j]) - 2 };
    }
  }
  design = replaceRouteFromLegacy(whole.starter, wr, d);
  r = evalDesign(whole, design);
  console.log(`  repair ${round + 1}: ${r.issues.length} issues, ${((r.cost.total ?? NaN) / 1e6).toFixed(0)} M`);
}
console.log(`${r.valid ? 'VALID' : 'NOT VALID'} ${((r.cost.total ?? NaN) / 1e6).toFixed(0)} M (starter ${(whole.setup.mission.startBill / 1e6).toFixed(0)} M) ${r.issues.map(i => i.violation?.title ?? i.code).slice(0, 4).join('; ')}`);
for (const c of check(whole, design, r, TWIST_ORDER)) console.log(`  ${c.met ? '✓' : '✗'} ${c.id}: ${c.status}${c.issues.slice(0, 6).map(i => `\n      ${i.text}`).join('')}`);
writeFileSync(out, JSON.stringify({ preset: args[0], purpose: `Stitched from ${files.join(', ')} (scripts/twists-stitch.ts)`, meets: [], design } satisfies Fixture, null, 1));
