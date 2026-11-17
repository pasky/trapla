// The player's "Straighten it" / "Keep its line" on every skewed box or bridge over us (crossing card): each
// either does what was asked or says why it cannot ("cannot be straightened here", the way kept on its own
// line), and the rest of the design stays as Auto had it. Flips Auto's choice on each skewed crossing of the
// given starters / saved designs and classifies the outcome:
//   done     — built as asked, no new problem
//   said     — not buildable as asked: exactly the one "cannot be straightened" problem, nothing else new
//   BAD      — any other new problem (e.g. "clashes with our bridge or tunnel"), or the grade moved > 0.1 m
//              more than REACH from the crossing
//   npx tsx scripts/straighten-audit.ts [d3-motorway] [d11] …   (default: d3-motorway d11)
// Exit 1 on any BAD. ≈ 1–2 s per flip.
import { readFileSync } from 'node:fs';
import { loadPack, evalContext } from './loadpack';
import { PRESETS, scenarioParams } from '../src/core/data/scenario';
import { evaluate, type Design, type Result } from '../src/core/evaluate';
import { SQUARE_BELOW } from '../src/core/crossing-geometry';
import { startDesign } from '../src/core/project-mission';

const REACH = 3000;
/** what each case evaluates: a preset's starting line (motorways: its spine as one road) or a saved design */
const CASES: Record<string, { pack: string; preset?: string; design?: string }> = {
  'd3-motorway': { pack: 'd3', preset: 'd3-motorway' },
  d11: { pack: 'd11' },
  'd11-best': { pack: 'd11', design: 'scripts/best-design.json' },
  'd11-town-centre': { pack: 'd11', design: 'scripts/town-centre-design.json' },
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['d3-motorway', 'd11'];
let bad = 0;
for (const name of names) {
  const spec = CASES[name];
  if (!spec) { console.error(`unknown case ${name}: ${Object.keys(CASES).join(', ')}`); process.exit(2); }
  const pack = loadPack(`public/scenarios/${spec.pack}`);
  const scenario = spec.preset ? PRESETS.find(p => (p.presetId ?? p.id) === spec.preset)! : scenarioParams(spec.pack);
  const ctx = evalContext(pack, scenario);
  const base: Design = spec.design ? JSON.parse(readFileSync(spec.design, 'utf8')).design
    : { ...startDesign(), ...structuredClone(scenario.initial ?? {}) } as Design;
  const auto = evaluate(ctx, base);
  const problems = (r: Result) => r.violations.filter(v => v.kind !== 'noise').map(v => `${v.title} @${Math.round(v.s0)}`);
  const before = new Set(problems(auto));
  const skewed = auto.crossings.filter(c => (c.type === 'underpass' || c.type === 'overbridge') && c.roadId !== undefined
    && !c.geometry?.sameSide && (c.geometry?.skew ?? 90) < SQUARE_BELOW);
  console.log(`${name}: ${(auto.cost.total / 1e9).toFixed(4)} bn, ${skewed.length} skewed crossings`);
  for (const c of skewed) {
    const square = c.squared === undefined;
    const d: Design = { ...structuredClone(base), crossingOverrides: [...base.crossingOverrides ?? [], { roadId: c.roadId!, type: c.type as 'underpass' | 'overbridge', square }] };
    const r = evaluate(ctx, d);
    const mine = r.crossings.find(x => x.roadId === c.roadId && Math.abs(x.s - c.s) < 50);
    const fresh = problems(r).filter(p => !before.has(p));
    const said = fresh.filter(p => / cannot be straightened here @/.test(p));
    let far = 0;
    for (let i = 0; i < Math.min(r.n, auto.n); i++) if (Math.abs(r.s[i] - c.s) > REACH && Math.abs(r.grade[i] - auto.grade[i]) > 0.1) far = Math.max(far, Math.abs(r.s[i] - c.s));
    const asked = square ? mine?.squared !== undefined : mine?.squared === undefined;
    const verdict = far || fresh.length > said.length || (!asked && !said.length) || (asked && said.length) ? 'BAD' : asked ? 'done' : 'said';
    if (verdict === 'BAD') bad++;
    console.log(`  ${verdict.padEnd(4)} km ${(c.s / 1000).toFixed(2)} way ${c.roadId} ${c.cls} ${c.type} ${Math.round(c.geometry!.skew!)}° → ${square ? 'straighten' : 'keep line'}:`,
      `${mine?.type} ${mine?.squared !== undefined ? 'straightened' : 'own line'} ${((mine?.cost ?? 0) / 1e6).toFixed(1)} M (was ${(c.cost / 1e6).toFixed(1)} M),`,
      `total ${((r.cost.total - auto.cost.total) / 1e6).toFixed(1)} M${said.length ? ` (${r.violations.find(v => / cannot be straightened here/.test(v.title))?.detail})` : ""}${far ? `, grade moved ${(far / 1000).toFixed(1)} km away` : ''}${fresh.length ? `; new: ${fresh.join(' · ')}` : ''}`);
  }
}
console.log(bad ? `${bad} BAD` : 'all done or said');
process.exit(bad ? 1 : 0);
