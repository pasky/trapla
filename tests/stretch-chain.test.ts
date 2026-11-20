// A rebuilt stretch over several mapped ways (core/stretch-chain.ts): D11's road III/3012 is mapped as ways split at its
// junctions and at a 7 m bridge over a brook. Its stretch is pulled on from one way through a junction and over the
// bridge (what ui/stretch-ends.ts does with a handle), engineered and billed as one rebuilt road.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { ProjectDesign } from '../src/core/project';
import { assertProjectDesign } from '../src/core/project-validation';

const D11 = 'public/scenarios/d11';
const III = 'osm:way:236292102', NEXT = 'osm:way:236292104', BRIDGE = 'osm:way:141372695', AFTER = 'osm:way:141372692', BEFORE = 'osm:way:28729805';

describe.skipIf(!existsSync(`${D11}/transport.json.gz`))('a rebuilt stretch over several ways', async () => {
  const setup = async () => {
    const { loadPack } = await import('../scripts/loadpack');
    const { objectDataKey } = await import('../src/core/build-controls');
    const { ProjectTransportIndex } = await import('../src/core/project-network');
    const { startDesign } = await import('../src/state');
    const { D11_SCENARIO } = await import('../src/core/data/scenario');
    const { makeLegacyProjectContext, projectFromLegacyDesign } = await import('../src/core/project-legacy');
    const pack = loadPack(D11), scenario = D11_SCENARIO;
    const graph = JSON.parse(gunzipSync(readFileSync(`${D11}/transport.json.gz`)).toString());
    const fingerprint = JSON.parse(readFileSync(`${D11}/transport-meta.json`, 'utf8')).fingerprint;
    const objectData = objectDataKey(pack.overlays.buildings, pack.overlays.binfo, pack.overlays.net);
    const A = { x: pack.meta.A.xy[0], y: pack.meta.A.xy[1] }, B = { x: pack.meta.B.xy[0], y: pack.meta.B.xy[1] };
    const lc = makeLegacyProjectContext({ terrain: pack.terrain, scenario, a: A, b: B }, { presetId: 'd11', packId: pack.meta.id, objectData, transportData: fingerprint });
    const design = projectFromLegacyDesign({ ...startDesign(), ...structuredClone(scenario.initial ?? {}), pis: [] }, lc);
    const index = new ProjectTransportIndex(graph, fingerprint, graph.vectorData, pack.terrain, pack.census);
    const ctx = { legacy: { terrain: pack.terrain, scenario, a: A, b: B, buildings: pack.buildings, roads: pack.roads },
      environment: { objectData, transportData: fingerprint, terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' as const },
      sourceWays: new Map(graph.sources.flatMap((s: { id: string; legacyNetIndex?: number }) => s.legacyNetIndex === undefined ? [] : [[s.id, s.legacyNetIndex]])) as Map<string, number> };
    return { index, ctx, design, pack };
  };
  it('follows the road through its junctions and over its bridge, rebuilds it as one road and bills the old bridge it leaves', async () => {
    const { index, ctx, design, pack } = await setup();
    const { walkOn, ChainLine, chainParts, towardsA, isChain, jointId, oldPieces } = await import('../src/core/stretch-chain');
    const { rebuildCommand, moveStretchEnds } = await import('../src/ui/road-edit');
    const { evaluateProject } = await import('../src/core/project-evaluate');
    const { BRIDGE_DEMOLITION_PER_M2 } = await import('../src/core/project-replacement');
    const { ROAD_CLASSES } = await import('../src/core/data/urban');
    const { nearestLeg } = await import('../src/core/horizontal');
    const one = { transportData: index.transportData, sourceId: III, s0: 228.22363998839083, s1: 701.7636570937792 };
    const command = rebuildCommand(index, one, { routeId: 'route:r1', acousticSourceId: 'acoustic:r1' });
    const d1: ProjectDesign = structuredClone(design); d1.routes.push(...command.routes); d1.connections.push(...command.connections);
    // the old road onward from each end: past the street's junction at 802 m, over the bridge; back onto the way before
    const limits = { claimed: [], covered: () => [], joins: [], seen: new Set([III]), reach: 600 };
    const on = walkOn(index, III, one.s1, 1, limits), back = walkOn(index, III, one.s0, -1, limits);
    expect(on.parts.slice(0, 4).map(p => p.interval.sourceId)).toEqual([III, NEXT, BRIDGE, AFTER]);
    expect(back.parts.slice(0, 2).map(p => [p.interval.sourceId, p.reversed])).toEqual([[III, true], [BEFORE, true]]);
    expect(on.stop.reason).toBe('reach');
    const line = new ChainLine(index, [...towardsA(back.parts), ...chainParts(index, [one]), ...on.parts]);
    const ta = line.t(III, one.s0)!, tb = line.t(III, one.s1)!;
    const next = line.intervals(ta - 300, tb + 300);
    expect(next.map(i => i.sourceId)).toEqual([BEFORE, III, NEXT, BRIDGE, AFTER]);
    expect(isChain(index, next)).toBe(true);
    const d2 = moveStretchEnds(index, d1, 'route:r1', next);
    assertProjectDesign(d2);
    const r2 = d2.routes[1];
    expect(r2.source!.intervals).toEqual(next);
    // its ends on the first and last ways; where the ways met, joints of its own; the street at 802 m a side road
    expect(r2.endpoints.a.anchor).toMatchObject({ kind: 'source', location: { sourceId: BEFORE } });
    expect(r2.endpoints.b.anchor).toMatchObject({ kind: 'source', location: { sourceId: AFTER } });
    expect(next.slice(1).map((_, k) => d2.connections.some(c => c.id === jointId('route:r1', k)))).toEqual([true, true, true, true]);
    expect(d2.connections.some(c => c.id.startsWith('connection:route:r1:branch:') && c.ports.some(p => p.kind === 'source' && p.location.sourceId === 'osm:way:353585091'))).toBe(true);
    const pieces = oldPieces(pack.roads!, r2, d2.connections, ctx.sourceWays)!;
    expect(pieces.map(p => p.structure ?? 'ground')).toEqual(['ground', 'ground', 'ground', 'bridge', 'ground']);
    // engineered as one road: every old way gone from the map, kept as it is where the line stays on it, the bridge too
    const kept = evaluateProject(ctx, { epoch: 'e', revision: 2, design: d2 });
    expect(next.every(i => kept.acceptedReplacements.some(a => a.sourceId === i.sourceId && a.s0 === i.s0 && a.s1 === i.s1))).toBe(true);
    const works = (r: typeof kept) => r.works.items.filter(w => w.owner.id === 'route:r1').map(w => ({ label: w.label ?? '', cost: w.cost }));
    expect(works(kept).some(w => /^Old bridge taken down/.test(w.label))).toBe(false);
    expect(kept.routes['route:r1'].legacy!.violations).toEqual([]);
    // its line moved off the old bridge: the bridge is taken down and billed by its deck
    const moved = structuredClone(d2), q = moved.routes[1];
    if (q.alignment.kind !== 'pi') throw new Error('converted');
    const deck = index.source(BRIDGE)!, mid = { x: (deck.xy[0] + deck.xy[2]) / 2, y: (deck.xy[1] + deck.xy[3]) / 2 };
    const dx = deck.xy[2] - deck.xy[0], dy = deck.xy[3] - deck.xy[1], l = Math.hypot(dx, dy);
    const at = q.alignment.pis.findIndex(p => Math.hypot(p.x - mid.x, p.y - mid.y) < 30);
    const off = { x: mid.x - dy / l * 45, y: mid.y + dx / l * 45, r: null };
    const k = nearestLeg(q.endpoints.a.position, q.endpoints.b.position, q.alignment.pis, off);
    q.alignment.pis = at >= 0 ? q.alignment.pis.map((p, j) => j === at ? off : p) : [...q.alignment.pis.slice(0, k), off, ...q.alignment.pis.slice(k)];
    const left = evaluateProject(ctx, { epoch: 'e', revision: 3, design: moved });
    const down = works(left).find(w => /^Old bridge taken down: 7 m$/.test(w.label));
    expect(Math.abs(down!.cost / (deck.stations[1] * ROAD_CLASSES.tertiary.width * BRIDGE_DEMOLITION_PER_M2) - 1)).toBeLessThan(0.1);
  }, 240_000);
});
