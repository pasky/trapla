// What the engine bills per km of a non-motorway road, split by component and by kind of stretch
// (research/46 §4 compares these with real Czech contracts). Usage:
//   SCENARIO=<id> npx tsx scripts/road-cost-audit.ts design.json [--as S7.5,S9.5,S11.5]
// Prints, per design and cross-section: the whole route in M CZK/km by component, then the same for
// "plain" cells only (at grade, rural, no crossing, no building, no culvert), i.e. what one ordinary km costs.
import { readFileSync } from 'node:fs';
import { PART_KEYS, type PartKey } from '../src/core/cost';
import type { CategoryId } from '../src/core/data/categories';
import { evaluate, type Design, type EvalContext } from '../src/core/evaluate';
import { KIND } from '../src/core/structures';
import { loadPack } from './loadpack';

const { meta, scenario, terrain, buildings, roads, junctions } = loadPack();
const ctx: EvalContext = { terrain, scenario, buildings, roads, junctions,
  a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
const asIdx = process.argv.indexOf('--as');
const files = process.argv.slice(2).filter((a, k) => !a.startsWith('--') && k + 2 !== asIdx + 1);
const cats = asIdx > 0 ? process.argv[asIdx + 1].split(',') as CategoryId[] : [];
const f1 = (v: number) => v.toFixed(1);

for (const file of files) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const base: Design = raw.design ?? raw;
  for (const cat of cats.length ? cats : [base.category]) {
    const d: Design = { ...base, category: cat, profileMode: 'auto' };
    const r = evaluate(ctx, d);
    const km = r.length / 1000, n = r.n, ds = r.length / (n - 1);
    const len = (i: number) => (i === 0 || i === n - 1 ? ds / 2 : ds);
    const sum = (k: PartKey, pick?: (i: number) => boolean) => { let v = 0; for (let i = 0; i < n; i++) if (!pick || pick(i)) v += r.parts[k][i]; return v; };
    const total = PART_KEYS.reduce((a, k) => a + sum(k), 0);
    let bridgeM = 0, tunnelM = 0, urbanM = 0;
    for (let i = 0; i < n; i++) { if (r.kind[i] === KIND.bridge) bridgeM += len(i); if (r.kind[i] === KIND.tunnel) tunnelM += len(i); urbanM += len(i) * r.cell.urban[i]; }
    console.log(`\n== ${file} as ${cat} ${d.speed} km/h: ${f1(km)} km, ${(total / 1e6).toFixed(0)} M CZK = ${f1(total / 1e6 / km)} M/km, ${r.valid ? 'VALID' : 'NOT VALID'}; bridges ${bridgeM.toFixed(0)} m (${f1(100 * bridgeM / r.length)} %), tunnels ${tunnelM.toFixed(0)} m, built-up ${f1(urbanM / 1000)} km; cut ${(r.quantities.cut / km / 1000).toFixed(0)}k / fill ${(r.quantities.fill / km / 1000).toFixed(0)}k m³ per km`);
    console.log('  whole route, M/km: ' + PART_KEYS.map((k) => [k, sum(k) / 1e6 / km] as const).filter(([, v]) => Math.abs(v) >= 0.05).map(([k, v]) => `${k} ${f1(v)}`).join(' | '));
    // plain cells: at grade, rural, nothing else billed there
    const plain = (i: number) => r.kind[i] === KIND.earth && r.cell.urban[i] === 0 && r.parts.crossings[i] === 0 && r.parts.buildings[i] === 0
      && r.parts.culverts[i] === 0 && r.parts.noiseBuyouts[i] === 0;
    let pm = 0; for (let i = 0; i < n; i++) if (plain(i)) pm += len(i);
    const pkm = pm / 1000;
    const ptotal = PART_KEYS.reduce((a, k) => a + sum(k, plain), 0);
    console.log(`  plain cells ${f1(pkm)} km = ${(100 * pm / r.length).toFixed(0)} %: ${f1(ptotal / 1e6 / pkm)} M/km: ` + PART_KEYS.map((k) => [k, sum(k, plain) / 1e6 / pkm] as const)
      .filter(([, v]) => Math.abs(v) >= 0.05).map(([k, v]) => `${k} ${f1(v)}`).join(' | '));
    // share of the bill by group
    const g = (ks: PartKey[]) => ks.reduce((a, k) => a + sum(k), 0) / total * 100;
    console.log(`  shares %: base ${g(['roadBase']).toFixed(0)}, earth ${g(['excavation', 'fillPlacing', 'haul', 'surplusHaul', 'unsuitable', 'borrow', 'topsoil', 'geotechnical']).toFixed(0)}, culverts ${g(['culverts']).toFixed(0)}, bridges ${g(['bridges']).toFixed(0)}, tunnels ${g(['tunnels']).toFixed(0)}, crossings ${g(['crossings']).toFixed(0)}, walls ${g(['noiseWalls']).toFixed(0)}, surcharge ${g(['surcharge']).toFixed(0)}, land+forest ${g(['land', 'forest']).toFixed(0)}, buildings+buyouts ${g(['buildings', 'noiseBuyouts']).toFixed(0)}`);
  }
}
