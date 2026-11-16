// A mapped railway rebuilt by dragging it, in Node (as main.ts's rebuildByDrag + onPiDragEnd): D3 motorway
// preset, the Posázavský pacifik stretch at km 4.6, its middle dragged sideways. Prints the rebuilt line's
// bends and problems. SCENARIO=d3 npx tsx scripts/rail-rebuild-check.ts [sourceId] [metres sideways]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { loadPack } from './loadpack';
import { scenarioParams } from '../src/core/data/scenario';
import { objectDataKey } from '../src/core/build-controls';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import { legacyDesignForRoute, makeLegacyProjectContext, projectFromLegacyDesign, replaceRouteFromLegacy } from '../src/core/project-legacy';
import { createMotorwayProject } from '../src/core/project-motorway';
import { ProjectTransportIndex } from '../src/core/project-network';
import { fitPlacedBend } from '../src/core/bend-fit';
import { nearestLeg } from '../src/core/horizontal';
import { NOISE } from '../src/core/data/urban';
import type { Design } from '../src/core/evaluate';
import type { ProjectDesign } from '../src/core/project';
import type { TransportGraphData } from '../src/core/project-transport';
import { derivedStretch } from '../src/ui/road-edit';
import { RAIL_LINE } from '../src/ui/mode-kinds';

const pack = loadPack('public/scenarios/d3');
const scenario = scenarioParams('d3', 'd3-motorway');
const a = { x: pack.meta.A.xy[0], y: pack.meta.A.xy[1] }, b = { x: pack.meta.B.xy[0], y: pack.meta.B.xy[1] };
const legacy = { terrain: pack.terrain, scenario, a, b, buildings: pack.buildings, roads: pack.roads, junctions: pack.junctions };
const objectData = objectDataKey(pack.overlays.buildings, pack.overlays.binfo, pack.overlays.net);
const graph: TransportGraphData = JSON.parse(gunzipSync(readFileSync('public/scenarios/d3/transport.json.gz')).toString());
const base = new ProjectTransportIndex(graph, 'transport', graph.vectorData, pack.terrain);
const context = makeLegacyProjectContext(legacy, { presetId: 'd3-motorway', packId: 'd3', objectData, transportData: 'transport' });
const road = projectFromLegacyDesign({ category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }, context);
const design: ProjectDesign = createMotorwayProject(road, { category: 'D27.5', speed: 120, pis: [], profileMode: 'auto', vpis: [], ...scenario.initial } as Design,
  { aadt: scenario.traffic, heavyShare: scenario.heavyShare ?? NOISE.heavyShare });
const railPaths = new Map(graph.sources.filter(s => s.kind === 'railway').map(s => [s.id, { xy: s.xy, stations: s.stations }]));
const ctx: ProjectEvalContext = { legacy, railPaths, environment: { objectData, transportData: 'transport', terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: scenario.terrainClass } };
const sourceId = process.argv[2] ?? 'osm:way:8135178', away = Number(process.argv[3] ?? 40);
const source = base.source(sourceId)!, mid = source.stations.at(-1)! / 2;
const interval = derivedStretch(base, sourceId, mid, [])!;
console.log('stretch', sourceId, Math.round(interval.s0), Math.round(interval.s1));
const command = RAIL_LINE.rebuild(base, interval, { routeId: 'route:rail', acousticSourceId: 'acoustic:rail' });
const project: ProjectDesign = { ...structuredClone(design), routes: [...design.routes, ...command.routes], connections: [...design.connections, ...command.connections] };
const show = (p: ProjectDesign, label: string) => {
  const r = evaluateProject(ctx, { epoch: 'x', revision: 1, design: p });
  const res = r.routes['route:rail']?.legacy;
  console.log(label, 'pis', JSON.stringify(legacyDesignForRoute(p, 'route:rail').pis.map(q => [Math.round(q.x), Math.round(q.y)])));
  console.log('  ', res ? `${Math.round(res.cost.total / 1e6)} M, ${res.length.toFixed(0)} m` : 'no result', (res?.violations ?? []).map(v => `${Math.round(v.s0)} ${v.title} | ${v.fix}`));
};
show(project, 'rebuilt');
// the drag: a bend at the stretch's middle moved sideways, then fitted on release
const d = legacyDesignForRoute(project, 'route:rail');
const pos = base.position(sourceId, (interval.s0 + interval.s1) / 2)!, ahead = base.position(sourceId, (interval.s0 + interval.s1) / 2 + 5)!;
const tl = Math.hypot(ahead.x - pos.x, ahead.y - pos.y), nx = -(ahead.y - pos.y) / tl, ny = (ahead.x - pos.x) / tl;
const A = project.routes.at(-1)!.endpoints.a.position, B = project.routes.at(-1)!.endpoints.b.position;
const at = { x: pos.x + nx * away, y: pos.y + ny * away }, k = nearestLeg(A, B, d.pis, at);
d.pis.splice(k, 0, { ...at, r: null });
const fitted = fitPlacedBend(A, B, d.pis, k, d.category, d.speed);
if (fitted) d.pis = fitted;
show(replaceRouteFromLegacy(project, 'route:rail', d), `dragged ${away} m (bend ${k + 1}${fitted ? ', fitted' : ''})`);
{
  const r = evaluateProject(ctx, { epoch: 'x', revision: 1, design: project }).routes['route:rail']?.legacy;
  if (r && process.env.DEBUG) {
    console.log('crossings', r.crossings.filter(c => c.s < 150 || c.s > r.length - 150).map(c => `${Math.round(c.s)} ${c.cls} ${c.outcome?.kind ?? ''}`));
    console.log('water', r.waterCrossings.filter(c => c.s < 150).map(c => Math.round(c.s)));
    console.log('runs', r.runs.map(u => `${u.kind}:${Math.round(u.s0)}-${Math.round(u.s1)}`).join(' '));
    console.log('grade', Array.from({ length: 8 }, (_, i) => { const k = Math.round(i * 10 / r.ds); return `${Math.round(r.s[k])}:${r.ground[k].toFixed(1)}/${r.grade[k].toFixed(1)}`; }).join(' '));
  }
}
