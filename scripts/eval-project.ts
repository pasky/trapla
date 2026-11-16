// Evaluate a saved project (window.trapla.getProject() JSON) in Node, as the browser's full worker does.
// Usage: npx tsx scripts/eval-project.ts <project.json> [--crossings]  — prints the total and every issue.
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { loadPack } from './loadpack';
import { scenarioParams } from '../src/core/data/scenario';
import { objectDataKey } from '../src/core/build-controls';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import type { ProjectDesign, ProjectResult } from '../src/core/project';

/** The browser's project context for a pack (transport graph loaded: source ways and railway paths). */
export function projectContext(design: Pick<ProjectDesign, 'packId' | 'scenarioId' | 'presetId' | 'routes'>) {
  const dir = `public/scenarios/${design.packId}`;
  const pack = loadPack(dir), meta = pack.meta;
  const scenario = scenarioParams(design.scenarioId, design.presetId);
  const objectData = objectDataKey(pack.overlays.buildings, pack.overlays.binfo, pack.overlays.net);
  const graph = existsSync(`${dir}/transport.json.gz`) ? JSON.parse(gunzipSync(readFileSync(`${dir}/transport.json.gz`)).toString()) : null;
  const transportData = existsSync(`${dir}/transport-meta.json`) ? JSON.parse(readFileSync(`${dir}/transport-meta.json`, 'utf8')).fingerprint : null;
  const main = design.routes[0];
  const a = main ? main.endpoints.a.position : { x: meta.A.xy[0], y: meta.A.xy[1] }, b = main ? main.endpoints.b.position : { x: meta.B.xy[0], y: meta.B.xy[1] };
  type Source = { id: string; kind?: string; legacyNetIndex?: number; xy: number[]; stations: number[] };
  const ctx: ProjectEvalContext = {
    legacy: { terrain: pack.terrain, scenario, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, buildings: pack.buildings, roads: pack.roads,
      ...(pack.junctions.length ? { junctions: pack.junctions } : {}) },
    environment: { objectData, transportData, pricingData: 'p', waterData: meta.watercourses?.sha256 ?? 'raster-water',
      terrainData: JSON.stringify([meta.id, meta.nx, meta.ny, meta.cell, meta.heights]), terrainClass: scenario.terrainClass },
    ...(graph ? {
      sourceWays: new Map((graph.sources as Source[]).flatMap(s => s.legacyNetIndex === undefined ? [] : [[s.id, s.legacyNetIndex] as [string, number]])),
      railPaths: new Map((graph.sources as Source[]).flatMap(s => s.kind === 'railway' ? [[s.id, { xy: s.xy, stations: s.stations }] as [string, { xy: number[]; stations: number[] }]] : [])),
    } : {}),
  };
  return { ctx, pack, graph, scenario };
}

export function describeResult(r: ProjectResult): string[] {
  const out = [`total ${r.cost.total === null ? 'NOT PRICED' : (r.cost.total / 1e9).toFixed(4) + ' bn'} · valid ${r.valid} · complete ${r.complete}`];
  for (const i of r.issues) out.push(`  [${i.check}] ${i.code}: ${i.violation?.title} · ${i.violation?.fix} @ ${i.locations.map(l => JSON.stringify(l).slice(0, 80)).join(' ')}`);
  for (const [id, rr] of Object.entries(r.routes)) {
    const l = rr.legacy;
    if (l) out.push(`  route ${id}: ${(l.cost.total / 1e6).toFixed(1)} M · ${l.violations.length} violations${l.violations.map(v => `\n     - ${v.title} · ${v.fix} @ ${Math.round(v.s0 ?? 0)}–${Math.round(v.s1 ?? 0)}`).join('')}`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const design = JSON.parse(readFileSync(process.argv[2], 'utf8')) as ProjectDesign;
  const { ctx } = projectContext(design);
  const t0 = performance.now();
  const r = evaluateProject(ctx, { epoch: 'cli', revision: 1, design });
  console.log(describeResult(r).join('\n'), `\n(${(performance.now() - t0).toFixed(0)} ms)`);
  if (process.argv.includes('--crossings')) for (const [id, rr] of Object.entries(r.routes)) for (const c of rr.legacy?.crossings ?? [])
    console.log(`${id.slice(0, 14)} s=${Math.round(c.s)} way=${c.roadId}${c.targetRoadId !== undefined ? '→' + c.targetRoadId : ''} ${c.cls} ${c.type} ${(c.cost / 1e6).toFixed(1)} M`);
}
