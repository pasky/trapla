// Separate stretches on the D3 motorway preset (Node): pick nothing, edit one direction between two bends,
// and compare the bill and problems with the paired starter. Usage: SCENARIO=d3 npx tsx scripts/stretch-check.ts
import { loadPack } from './loadpack';
import { scenarioParams } from '../src/core/data/scenario';
import { objectDataKey } from '../src/core/build-controls';
import { evaluateProject, previewProjectRoute, type ProjectEvalContext } from '../src/core/project-evaluate';
import { legacyDesignForRoute, makeLegacyProjectContext, projectFromLegacyDesign, replaceRouteFromLegacy } from '../src/core/project-legacy';
import { createMotorwayProject } from '../src/core/project-motorway';
import { NOISE } from '../src/core/data/urban';
import type { Design } from '../src/core/evaluate';

const pack = loadPack('public/scenarios/d3');
const scenario = scenarioParams('d3', 'd3-motorway');
const a = { x: pack.meta.A.xy[0], y: pack.meta.A.xy[1] }, b = { x: pack.meta.B.xy[0], y: pack.meta.B.xy[1] };
const legacy = { terrain: pack.terrain, scenario, a, b, buildings: pack.buildings, roads: pack.roads, junctions: pack.junctions };
const objectData = objectDataKey(pack.overlays.buildings, pack.overlays.binfo, pack.overlays.net);
const context = makeLegacyProjectContext(legacy, { presetId: 'd3-motorway', packId: 'd3', objectData, transportData: null });
const road = projectFromLegacyDesign({ category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }, context);
const design = createMotorwayProject(road, { category: 'D27.5', speed: 120, pis: [], profileMode: 'auto', vpis: [], ...scenario.initial } as Design,
  { aadt: scenario.traffic, heavyShare: scenario.heavyShare ?? NOISE.heavyShare });
const ctx: ProjectEvalContext = { legacy, environment: { objectData, transportData: null, terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: scenario.terrainClass } };
const t0 = performance.now();
const paired = evaluateProject(ctx, { epoch: 'x', revision: 1, design });
console.log(`paired: ${(paired.cost.total! / 1e6).toFixed(1)} M, valid ${paired.valid}, ${paired.issues.length} issues, ${(performance.now() - t0).toFixed(0)} ms`);
const [fwd, rev] = design.routes;
const dir = process.argv[2] === 'forward' ? fwd : rev;
// selecting a direction: the shown design is the spine's
const shown = legacyDesignForRoute(design, dir.id, { oneDirection: true });
const same = replaceRouteFromLegacy(design, dir.id, shown, { oneDirection: true });
const diffs: string[] = []; const walk = (x: unknown, y: unknown, p: string) => { if (JSON.stringify(x) === JSON.stringify(y)) return; if (x && y && typeof x === "object" && typeof y === "object") { for (const k of new Set([...Object.keys(x), ...Object.keys(y as object)])) walk((x as any)[k], (y as any)[k], p + "." + k); } else diffs.push(p + ": " + JSON.stringify(x)?.slice(0, 80) + " -> " + JSON.stringify(y)?.slice(0, 80)); }; walk(design, same, ""); console.log("select only, design unchanged:", diffs);
// drag between bends 3 and 4 (shown order) by 50 m sideways
const p = shown.pis[2], q = shown.pis[3], mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
const len = Math.hypot(q.x - p.x, q.y - p.y), nx = -(q.y - p.y) / len, ny = (q.x - p.x) / len;
const moved = Number(process.argv[3] ?? 50);
const edited = structuredClone(shown);
edited.pis.splice(3, 0, { x: mid.x + nx * moved, y: mid.y + ny * moved, r: null });
const next = replaceRouteFromLegacy(design, dir.id, edited, { oneDirection: true });
const corridor = next.corridors[0];
console.log('stretches:', JSON.stringify(corridor.mode === 'paired' ? corridor.stretches?.map(t => ({ k0: t.k0, k1: t.k1, a: Math.round(t.a), b: Math.round(t.b), f: !!t.forward, r: !!t.reverse })) : null));
const t1 = performance.now();
const sep = evaluateProject(ctx, { epoch: 'x', revision: 2, design: next });
console.log(`separate: ${(sep.cost.total! / 1e6).toFixed(1)} M (Δ ${((sep.cost.total! - paired.cost.total!) / 1e6).toFixed(1)} M), valid ${sep.valid}, ${sep.issues.length} issues, ${(performance.now() - t1).toFixed(0)} ms`);
for (const i of sep.issues) console.log('  ', i.violation?.title, '·', i.violation?.fix, i.locations.map(l => `${Math.round(l.s0 ?? 0)}–${Math.round(l.s1 ?? 0)}`).join(','));
const t2 = performance.now();
const pv = previewProjectRoute(ctx, { epoch: 'x', revision: 3, design: next }, dir.id);
console.log(`preview ${(performance.now() - t2).toFixed(0)} ms, ≈ ${(pv.legacy!.cost.total / 1e6).toFixed(1)} M`);
const again = evaluateProject(ctx, { epoch: 'x', revision: 2, design: next });
console.log('deterministic:', again.cost.total === sep.cost.total);
