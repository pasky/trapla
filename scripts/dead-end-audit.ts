// Mapped dead ends at our works (owner, I/35 Turnov km 3.0: the last metres of a local road's dead end under our
// embankment held Auto's grade up). Runs every installed pack's straight start and saved designs and every preset as
// the game starts it (bridge-ends-audit.ts packResults) and lists, per result, each dead end beside our road that
// serves nothing our works leave standing (dead-ends.ts), what became of it (taken up to a turning area, removed
// with our earthworks, left clear, moved aside, walled off) and each that is still in the way; exit 1 if any is.
//   npx tsx scripts/dead-end-audit.ts [--only d11,i35-turnov] [--quiet]
import { existsSync } from 'node:fs';
import { CATEGORIES } from '../src/core/data/categories';
import { PRESETS } from '../src/core/data/scenario';
import { deadEndPieces, deadEndsNear } from '../src/core/dead-ends';
import type { Result } from '../src/core/evaluate';
import { loadPack } from './loadpack';
import { packResults } from './bridge-ends-audit';
import { servedOnly } from '../src/core/taken-up';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i < 0 ? undefined : process.argv[i + 1]; };
const only = arg('--only')?.split(','), quiet = process.argv.includes('--quiet');
const packs = [...new Set(PRESETS.map(p => p.id))].filter(id => existsSync(`public/scenarios/${id}/meta.json`) && (!only || only.includes(id)));
const km = (s: number) => (s / 1000).toFixed(2);
let bad = 0, taken = 0, removed = 0, cases = 0, metres = 0, billed = 0;
for (const id of packs) {
  const roads = loadPack(`public/scenarios/${id}`).roads;
  packResults(id, (name, r: Result, category, ground) => {
    if (!roads) return;
    cases++;
    const crown = category === 'existing' ? 7.5 : CATEGORIES[category].crownWidth;
    const gone = new Set([...r.demolished, ...r.boughtOut].map(d => d.j));
    const pieces = deadEndPieces(deadEndsNear(roads, undefined, { n: r.n, x: r.x, y: r.y }, crown / 2 + 100), () => true);
    const withHouses = deadEndPieces(deadEndsNear(roads, ground.buildings, { n: r.n, x: r.x, y: r.y }, crown / 2 + 100), j => gone.has(j));
    const lines: string[] = [];
    for (const f of r.footprintConflicts) {
      if (f.feature !== 'road' || f.roadId === undefined) continue;
      const list = pieces.get(f.roadId);
      if (!list) continue;
      const at = `${f.cls} way ${f.roadId} km ${km(f.s0)}–${km(f.s1)}`;
      // (a house left standing that the piece taken up was the only road to: the access rules' case)
      // (the piece is the way's end: one trim of all of it)
      const ivs = f.takenUp?.intervals ?? [], d0 = Math.min(...ivs.map(iv => iv.a)), d1 = Math.max(...ivs.map(iv => iv.b));
      const lost = ivs.length ? servedOnly(roads.wayPath(ivs[0].way, d0, d1), roads.edited([{ way: ivs[0].way, d0, d1, trim: true }], []), [], ground.buildings, gone) : [];
      if (lost.length) { bad++; lines.push(`  ${f.cls} way ${f.roadId} km ${km(f.s0)}: BAD the piece taken up was the only road to building(s) ${[...new Set(lost)].join(', ')}`); }
      if (f.buyout?.length) lines.push(`  ${at}: bought out, the only road to them taken up: building(s) ${f.buyout.join(', ')}`);
      if (f.takenUp && !f.closed) { taken++; metres += f.takenUp.length; billed += f.takenUp.cost; lines.push(`  ${at}: ${f.takenUp.length.toFixed(0)} m taken up to a turning area (${(f.takenUp.cost / 1e3).toFixed(0)} k CZK beyond our earthworks), ${f.length.toFixed(0)} m rebuilt up to it`); }
      else if (f.closed && !f.closed.detour) { removed++; lines.push(`  ${at}: its last ${f.closed.length.toFixed(0)} m taken up, it ends at our earthworks${f.takenUp ? ` (${(f.takenUp.cost / 1e3).toFixed(0)} k CZK beyond them)` : ''}`); }
      else if (f.action === 'blocked') {
        // (one in the way within its piece that serves nothing left standing: the rule did not end it)
        const mine = withHouses.get(f.roadId)?.some(([a, b]) => f.original?.some(p => roads.wayStation(f.roadId!, p.x, p.y) >= a - 1 && roads.wayStation(f.roadId!, p.x, p.y) <= b + 1));
        // (a bridge support on it: piers keep off every road, dead ends too; not handled)
        const support = /bridge pier|bridge end|tunnel entrance/.test(f.detail);
        if (mine && !support) bad++;
        lines.push(`  ${at}: ${mine && !support ? 'BAD ' : mine ? 'a bridge support on a dead end serving nothing, ' : ''}in the way (${(f.affectedLength ?? f.length).toFixed(0)} m): ${f.detail}`);
      } else if (f.action === 'retaining-wall') lines.push(`  ${at}: walled off`);
      else if (f.action === 'relocation') lines.push(`  ${at}: moved aside (${f.length.toFixed(0)} m)`);
    }
    if (!quiet || lines.length) console.log(`${name}: ${(r.cost.total / 1e9).toFixed(4)} bn ${r.valid ? 'VALID' : 'not valid'}${lines.length ? `\n${lines.join('\n')}` : ''}`);
  });
}
console.log(`${cases} results: ${taken} dead ends taken up to a turning area (${metres.toFixed(0)} m, ${(billed / 1e6).toFixed(2)} M CZK beyond our earthworks), ${removed} ending at our earthworks (no turning area: a track, a service road, or none left); ${bad ? `${bad} BAD (a dead end serving nothing still in the way)` : 'none serving nothing still in the way'}`);
process.exit(bad ? 1 : 0);
