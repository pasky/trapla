// Every crossing of a design × every crossing choice the player can make on its card (underpass, its bridge over
// us, cut and reroute): what the choice changes. A player's choice is met locally or says why it cannot be
// (research/60, 61); it must not move our road for kilometres.
//   npx tsx scripts/choice-audit.ts [d3-motorway] [d11-best] …   (default: both)
// Prints one line per choice (the bill change, the new problems). Exit 1 where an underpass or a bridge over us
// changes our grade more than REACH from the crossing, raises our road's own works (the bill without crossings and surcharge) by more than DEAR (an audit threshold:
// a choice met locally costs tens of millions; main before research/61 had +1.45 bn for one box), or leaves a
// clash with our bridge or tunnel.
// "Cut and reroute" is reported, not judged (cutting a way may rightly cost a neighbour its crossing).
import { readFileSync } from 'node:fs';
import { loadPack, evalContext } from './loadpack';
import { PRESETS, scenarioParams } from '../src/core/data/scenario';
import { evaluate, type Design, type Result } from '../src/core/evaluate';
import { startDesign } from '../src/core/project-mission';

const REACH = 3000, DEAR = 250e6;
const CASES: Record<string, { pack: string; preset?: string; design?: string }> = {
  'd3-motorway': { pack: 'd3', preset: 'd3-motorway' },
  'd11-best': { pack: 'd11', design: 'scripts/best-design.json' },
  d11: { pack: 'd11' },
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['d3-motorway', 'd11-best'];
let bad = 0;
for (const name of names) {
  const spec = CASES[name];
  if (!spec) { console.error(`unknown case ${name}: ${Object.keys(CASES).join(', ')}`); process.exit(2); }
  const scenario = spec.preset ? PRESETS.find(p => (p.presetId ?? p.id) === spec.preset)! : scenarioParams(spec.pack);
  const ctx = evalContext(loadPack(`public/scenarios/${spec.pack}`), scenario);
  const base: Design = spec.design ? JSON.parse(readFileSync(spec.design, 'utf8')).design : { ...startDesign(), ...structuredClone(scenario.initial ?? {}) } as Design;
  const auto = evaluate(ctx, base);
  const problems = (r: Result) => r.violations.filter(v => v.kind !== 'noise').map(v => `${v.title} @${Math.round(v.s0)}`);
  // our road's own works (what a regrade moves): the bill without the crossings and the surcharge on everything
  const ours = (r: Result) => r.cost.total - r.cost.crossings - r.cost.surcharge;
  const before = new Set(problems(auto)), seen = new Set<number>();
  console.log(`${name}: ${(auto.cost.total / 1e9).toFixed(4)} bn`);
  for (const c of auto.crossings) {
    if (c.roadId === undefined || seen.has(c.roadId) || c.type === 'bridge' || c.type === 'tunnel') continue;
    seen.add(c.roadId);
    for (const type of ['underpass', 'overbridge', 'reconnection'] as const) {
      if (type === c.type || (type === 'reconnection' && c.type === 'diversion')) continue;
      const r = evaluate(ctx, { ...structuredClone(base), crossingOverrides: [...base.crossingOverrides ?? [], { roadId: c.roadId, type }] });
      const fresh = problems(r).filter(p => !before.has(p)), mine = r.crossings.find(x => x.roadId === c.roadId);
      let far = 0;
      for (let i = 0; i < Math.min(r.n, auto.n); i++) if (Math.abs(r.s[i] - c.s) > REACH && Math.abs(r.grade[i] - auto.grade[i]) > 0.1) far = Math.max(far, Math.abs(r.s[i] - c.s));
      const judged = type !== 'reconnection', fail = judged && (far > 0 || ours(r) - ours(auto) > DEAR || fresh.some(p => /clashes with our bridge or tunnel/.test(p)));
      if (fail) bad++;
      console.log(`  ${fail ? 'BAD ' : '    '} km ${(c.s / 1000).toFixed(2)} way ${c.roadId} ${c.cls} ${c.type} → ${type}: ${mine?.type} ${((mine?.cost ?? 0) / 1e6).toFixed(1)} M,`,
        `total ${((r.cost.total - auto.cost.total) / 1e6).toFixed(1)} M${far ? `, grade moved ${(far / 1000).toFixed(1)} km away` : ''}${fresh.length ? `; ${fresh.join(' · ')}` : ''}`);
    }
  }
}
console.log(bad ? `${bad} BAD` : 'no box or bridge over us moves our road far, costs over 250 M or clashes');
process.exit(bad ? 1 : 0);
