// Rebuild every mapped road within 120 m of our automatic reroutes (grabbed at a quarter, half and three
// quarters of it) and bend it ±30 / ±60 m at its middle: how many such edits leave the project unpriced, and why.
// The player's road must take over; our reroutes plan around it (project-evaluate.ts, QA final sweep P1 1).
// Usage: npx tsx scripts/reroute-takeover-audit.ts <project.json with the mission road> [--list]
//   (a saved project: window.trapla.getProject(); WAYS=osm:way:1,… OFFS=-60,60 narrow it, DUMP=f.json saves the last)
import { readFileSync, writeFileSync } from 'node:fs';
import { projectContext } from './eval-project';
import { evaluateProject } from '../src/core/project-evaluate';
import { ProjectTransportIndex } from '../src/core/project-network';
import { coveredStretches, derivedStretch, rebuildCommand } from '../src/ui/road-edit';
import { nearestLeg } from '../src/core/horizontal';
import type { ProjectDesign } from '../src/core/project';

const design = JSON.parse(readFileSync(process.argv[2], 'utf8')) as ProjectDesign;
design.routes = design.routes.slice(0, 1); design.connections = [];
const { ctx, graph, pack } = projectContext(design);
type Source = { id: string; kind: string; legacyNetIndex?: number; xy: number[]; stations: number[]; tags: Record<string, string> };
const index = new ProjectTransportIndex(graph, ctx.environment.transportData!, graph.vectorData, pack.terrain, pack.census);
const ours = evaluateProject(ctx, { epoch: 'e', revision: 1, design }).routes[design.routes[0].id].legacy!;
const links = ours.crossings.filter(c => (c.type === 'diversion' || c.type === 'reconnection') && !c.designed);
const near = (x: number, y: number) => links.some(c => (c.geometry?.links ?? []).some(l => l.some(p => Math.hypot(p.x - x, p.y - y) < 120)));
const only = process.env.WAYS?.split(',');
const candidates = (graph.sources as Source[]).filter(s => s.kind === 'road' && s.legacyNetIndex !== undefined && (!only || only.includes(s.id))
  && Array.from({ length: s.xy.length / 2 }, (_, k) => k).some(k => near(s.xy[2 * k], s.xy[2 * k + 1])));
const reasons = new Map<string, number>();
let n = 0, unpriced = 0;
for (const src of candidates) {
  const length = src.stations.at(-1)!;
  for (const f of [0.25, 0.5, 0.75]) {
    const interval = derivedStretch(index, src.id, f * length, coveredStretches(index, src.id, [{ ...ours, name: 'our road' }]));
    if (!interval || interval.s1 - interval.s0 < 60) continue;
    let command; try { command = rebuildCommand(index, interval, { routeId: 'route:r1', acousticSourceId: 'acoustic:r1' }); } catch { continue; }
    for (const off of (process.env.OFFS ?? '-60,-30,30,60').split(',').map(Number)) {
      const edited = structuredClone(design); edited.routes.push(...structuredClone(command.routes)); edited.connections.push(...structuredClone(command.connections));
      const q = edited.routes[1]; if (q.alignment.kind !== 'pi') continue;
      const s = (interval.s0 + interval.s1) / 2, g = index.position(src.id, s)!, g2 = index.position(src.id, s + 5)!, l = Math.hypot(g2.x - g.x, g2.y - g.y);
      q.alignment.pis.splice(nearestLeg(q.endpoints.a.position, q.endpoints.b.position, q.alignment.pis, g), 0, { x: g.x - (g2.y - g.y) / l * off, y: g.y + (g2.x - g.x) / l * off, r: null });
      const r = evaluateProject(ctx, { epoch: 'e', revision: 2, design: edited });
      n++;
      if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify(edited));
      const why = r.issues.filter(i => i.check === 'not-checked').map(i => i.code);
      if (r.cost.total === null) { unpriced++; for (const w of new Set(why)) reasons.set(w, (reasons.get(w) ?? 0) + 1); }
      if (process.argv.includes('--list')) console.log(`${src.id} ${src.tags.highway} [${Math.round(interval.s0)}–${Math.round(interval.s1)}] ${off > 0 ? '+' : ''}${off} m: ${r.cost.total === null ? `not priced (${why.join(', ')})` : `${(r.cost.total / 1e9).toFixed(3)} bn${r.valid ? '' : ' (not valid)'}`}`);
    }
  }
}
console.log(`${unpriced} of ${n} edits not priced${[...reasons].map(([k, v]) => ` · ${k} ${v}`).join('')}`);
