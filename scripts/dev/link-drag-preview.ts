// Node probe of a reroute drag's previews (drag-perf --mode link): the longest reroute link of the mission road
// gets a bend point at its middle that moves on a loop, each step a project preview against the last full result
// (handed over slim, as the full worker does to the preview worker). Prints per-preview ms and the median phases.
// BASES=file: the full results are evaluated once and kept there; a later run reads them and evaluates only the
// previews, as the preview worker does (none of the full evaluation's caches warm, no last project result).
//   SCENARIO=d3-full npx tsx scripts/dev/link-drag-preview.ts scripts/scenarios/d3-full/default.json
//   SCENARIO=i35-full PRESET=i35-full-road npx tsx scripts/dev/link-drag-preview.ts scripts/scenarios/i35-full/i35-full-road.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { deserialize, serialize } from 'node:v8';
import type { CrossingOverride } from '../../src/core/crossings';
import type { Design, Result } from '../../src/core/evaluate';
import { scenarioParams } from '../../src/core/data/scenario';
import { evaluateProject, previewProjectRoute } from '../../src/core/project-evaluate';
import { legacyDesignForRoute, replaceRouteFromLegacy } from '../../src/core/project-legacy';
import { adoptFull, previewBase } from '../../src/core/preview-window';
import { insertViaPoint, simplifyLink } from '../../src/ui/link-shape';
import { loadPack, projectContext } from '../loadpack';

const pack = loadPack();
const scenario = scenarioParams(pack.meta.id, process.env.PRESET);
const { ctx, initial } = projectContext(pack, scenario);
const saved: Design = JSON.parse(readFileSync(process.argv[2], 'utf8')).design;
let project = initial();
const routeId = project.routes.find(r => r.role === 'mission')?.id ?? project.routes[0].id;
project = replaceRouteFromLegacy(project, routeId, saved);
let revision = 1;
type Saved = { bases: Result[]; c: Result['crossings'][number]; mv: number; sv: number; length: number };
const shaped = (c: Saved['c'], via: [{ x: number; y: number }[], { x: number; y: number }[]] | null) => {
  // the drag's start (link-edit.ts grab + design-edits.ts setVia), and drag-perf's beforeMeasure: the shape dropped again
  const d = legacyDesignForRoute(project, routeId), list = d.crossingOverrides ??= [];
  const o: CrossingOverride = list.find(x => x.roadId === c.roadId) ?? { roadId: c.roadId!, type: 'reconnection' };
  if (!list.includes(o)) list.push(o);
  o.type = 'reconnection';
  if (via) { o.via = via; if (o.to === undefined) o.to = c.targetRoadId ?? (c.targetS === 0 ? -1 : -2); } else { delete o.via; delete o.to; }
  return replaceRouteFromLegacy(project, routeId, d);
};
const file = process.env.BASES;
let saved0: Saved;
if (file && existsSync(file)) saved0 = deserialize(readFileSync(file)) as Saved;
else {
  const full = (design: typeof project) => {
    const t0 = performance.now(), r = evaluateProject(ctx, { epoch: 'probe', revision: revision++, design });
    console.log(`full ${(performance.now() - t0).toFixed(0)} ms`);
    return r;
  };
  const first = full(project), mission = first.routes[routeId].legacy as Result;
  const c = mission.crossings.filter(c => (c.type === 'reconnection' || c.type === 'diversion') && c.geometry?.links?.some(l => l.length > 6))
    .sort((a, b) => (b.linkLength ?? 0) - (a.linkLength ?? 0))[0];
  // FIRST=1: the reroute's first drag (its full result before Auto's own, no choice of the player's yet)
  const last = process.env.FIRST ? null : full(project = shaped(c, null));
  const bases = Object.values((last ?? first).routes).flatMap(r => r.legacy ? [previewBase(r.legacy)] : []);
  saved0 = { bases, c, length: mission.length, mv: (last ?? first).routes[routeId].legacy!.quantities.materialValue, sv: (last ?? first).routes[routeId].legacy!.quantities.structureValue };
  if (file) writeFileSync(file, serialize(saved0));
}
const { c } = saved0;
project = shaped(c, null);
for (const b of saved0.bases) adoptFull(ctx.legacy.terrain, b);
const side = c.geometry!.links!.findIndex(l => l.length > 6) as 0 | 1, path = c.geometry!.links![side];
const mid = path[Math.floor(path.length / 2)];
console.log(`crossing road ${c.roadId} at km ${(c.s / 1000).toFixed(2)}, ${c.type}, link ${c.linkLength?.toFixed(0)} m, route ${routeId}, ${(saved0.length / 1000).toFixed(1)} km`);
const start = insertViaPoint(path, simplifyLink(path), mid);
const N = Number(process.env.STEPS ?? 30), ms: number[] = [], phases: Record<string, number[]> = {};
for (let step = 0; step < N; step++) {
  const u = step / N, via = start.via.map(p => ({ ...p }));
  via[start.index] = { x: mid.x + 60 * Math.sin(u * 2 * Math.PI), y: mid.y + 36 * (1 - Math.cos(u * 2 * Math.PI)) };
  const sides: [{ x: number; y: number }[], { x: number; y: number }[]] = [[], []]; sides[side] = via;
  const design = shaped(c, sides), snapshot = { epoch: 'probe', revision: revision++, design };
  const t0 = performance.now();
  const p = previewProjectRoute(ctx, snapshot, routeId, { materialValue: saved0.mv, structureValue: saved0.sv }, null);
  ms.push(performance.now() - t0);
  for (const [k, v] of Object.entries(p.legacy?.timing ?? {})) (phases[k] ??= []).push(v as number);
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
console.log(`preview median ${med(ms).toFixed(1)} max ${Math.max(...ms).toFixed(1)} ms | ${ms.map(v => v.toFixed(0)).join(' ')}`);
console.log(Object.entries(phases).filter(([, v]) => med(v) >= 0.5).map(([k, v]) => `${k} ${med(v).toFixed(1)}`).join(' '));
