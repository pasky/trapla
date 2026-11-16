import { describe, expect, it } from 'vitest';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluate, type Design } from '../src/core/evaluate';
import { evaluateProject, previewProjectRoute, type ProjectEvalContext } from '../src/core/project-evaluate';
import { legacyDesignForRoute, makeLegacyProjectContext, projectFromLegacyDesign, replaceRouteFromLegacy } from '../src/core/project-legacy';
import { createMotorwayProject, motorwayMission, rejoinStretch, setSpeedLimit150, speedLimit150 } from '../src/core/project-motorway';
import { MOTORWAY_150_PILOT, PILOT_TRAVEL_SPEED } from '../src/core/data/motorway';
import { projectBindingsCurrent, type ProjectLoadOptions } from '../src/project-persistence';
import { isScorableProject } from '../src/core/project-protocol';
import { assertProjectDesign } from '../src/core/project-validation';
import { resolveCrossings, type CrossingResult } from '../src/core/crossings';
import { noiseSource } from '../src/core/road-noise';
import { KIND } from '../src/core/structures';
import { syntheticTerrain } from '../src/core/terrain';

const motorway: Design = { category: 'D27.5', speed: 130, pis: [], profileMode: 'auto', vpis: [] };
function fixture(aadt = 30000) {
  const legacy = { terrain: syntheticTerrain(500, 120, 5, (x) => 100 + x * 0.01), scenario: D11_SCENARIO,
    a: { x: 100, y: 250 }, b: { x: 2300, y: 250 } };
  const context = makeLegacyProjectContext(legacy, { presetId: 'motorway', packId: 'd11', objectData: 'objects', transportData: null });
  const road = projectFromLegacyDesign({ category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }, context);
  const design = createMotorwayProject(road, motorway, { aadt, heavyShare: 0.2256 });
  const ctx: ProjectEvalContext = { legacy, environment: { objectData: 'objects', transportData: null,
    terrainData: 'terrain', pricingData: 'pricing', waterData: 'water', terrainClass: 'hilly' } };
  return { ctx, snapshot: { epoch: 'test', revision: 1, design }, legacy, context };
}

describe('paired motorway corridor', () => {
  it('is one corridor with two directional children sharing one spine evaluation and bill', () => {
    const { ctx, snapshot, legacy } = fixture();
    assertProjectDesign(snapshot.design);
    expect(snapshot.design.corridors).toHaveLength(1);
    expect(snapshot.design.routes.map(r => r.kind)).toEqual(['motorway', 'motorway']);
    // Directional demand halves; the corridor uses their sum, never a doubled AADT.
    expect(snapshot.design.routes.map(r => r.kind === 'motorway' && r.specification.operations.aadt)).toEqual([15000, 15000]);
    const project = evaluateProject(ctx, snapshot);
    const direct = evaluate({ ...legacy, scenario: { ...legacy.scenario, traffic: 30000, heavyShare: 0.2256 } }, motorway, { operatingSpeed: 130,
      endpointElevations: {}, goals: { time: true, capacity: true } });
    const [f, r] = snapshot.design.routes.map(x => project.routes[x.id]);
    expect(f.legacy).toBe(r.legacy);
    expect(project.cost.total).toBeCloseTo(direct.cost.total, 3);
    expect(project.cost.shared).toBe(project.cost.total);
    expect(project.cost.routes).toEqual({});
    expect(project.complete).toBe(true);
    expect(isScorableProject(project)).toBe(direct.valid);
    expect(project.issues.every(i => i.locations.every(l => l.routeId === f.routeId))).toBe(true);
    expect(previewProjectRoute(ctx, snapshot, r.routeId).legacy?.preview).toBe(true);
  });
  it('keeps its bests: the store is opened for the motorway mission, not the road one', () => {
    const { snapshot, context } = fixture();
    const options = (mission: ProjectLoadOptions['mission']) => ({ objectData: 'objects', transportData: null, mission }) as ProjectLoadOptions;
    expect(projectBindingsCurrent(snapshot.design, options(motorwayMission(context.mission)))).toBe(true);
    expect(projectBindingsCurrent(snapshot.design, options(context.mission))).toBe(false);
  });
  it('edits both directions through the common spine', () => {
    const { snapshot } = fixture();
    const [f, r] = snapshot.design.routes;
    const d = legacyDesignForRoute(snapshot.design, r.id);
    expect(d.category).toBe('D27.5');
    d.pis.push({ x: 1200, y: 400, r: null }); d.speed = 120;
    const next = replaceRouteFromLegacy(snapshot.design, r.id, d);
    expect(legacyDesignForRoute(next, f.id).pis).toEqual([{ x: 1200, y: 400, r: null }]);
    expect(next.routes.every(x => x.kind === 'motorway' && x.specification.designSpeed === 120)).toBe(true);
  });
  it('uses motorway radii, never the 90 km/h road rows', () => {
    const { legacy } = fixture();
    const tight = evaluate(legacy, { ...motorway, pis: [{ x: 1200, y: 600, r: 700 }] });
    expect(tight.violations.some(v => v.kind === 'radius' && v.rule?.includes('840'))).toBe(true);
    const ok = evaluate(legacy, { ...motorway, speed: 120, pis: [{ x: 1200, y: 600, r: 700 }] });
    expect(ok.violations.some(v => v.kind === 'radius')).toBe(false);
  });
});

describe('motorway junction rule', () => {
  const crossing = (s: number, cls: string, h = 0): CrossingResult => ({ s, i: 0, x: 0, y: 0, cls, roadId: s, h, type: 'atGrade', cost: 0 });
  it('never builds a level junction or sends local traffic to the motorway ends', () => {
    const cs = [crossing(3000, 'primary'), crossing(4500, 'tertiary')];
    resolveCrossings(cs, 9000, [KIND.earth], [40], [0], [0], [], 'motorway');
    expect(cs.some(c => c.type === 'junction' || c.type === 'atGrade')).toBe(false);
    expect(cs.filter(c => c.type === 'reconnection').every(c => c.targetS !== 0 && c.targetS !== 9000)).toBe(true);
    const asked = [crossing(3000, 'primary')];
    const issues = resolveCrossings(asked, 9000, [KIND.earth], [40], [0], [0], [{ roadId: 3000, type: 'junction' }], 'motorway');
    expect(issues.map(i => i.crossing.code)).toEqual(['ours']);
    // nothing to lead a cut road to yet: a clear message and a road kept over us, never a crash
    const cut = [crossing(3000, 'tertiary')];
    const reach = resolveCrossings(cut, 9000, [KIND.earth], [40], [0], [0], [{ roadId: 3000, type: 'reconnection' }], 'motorway');
    expect(reach.map(i => i.crossing.code)).toEqual(['reach']);
    expect(cut[0].type).toBe('overbridge');
  });
});

describe('motorway noise source', () => {
  it('uses the manual motorway emission row, night shares and lane speeds', () => {
    const road = noiseSource(30000, 130, { heavyShare: 0.2256 });
    const mw = noiseSource(30000, 130, { heavyShare: 0.2256, profile: 'motorway' });
    // LNA 80.5 vs 81.1 and lane speeds below the 130 design speed: quieter per vehicle by day.
    expect(mw.dayDb).toBeLessThan(road.dayDb);
    expect(mw.nightDb - mw.dayDb).toBeGreaterThan(-6);
  });
});

describe('split motorway', () => {
  it('splits into two editable directions that price like the pair, and joins back exactly', async () => {
    const { splitCorridor, rejoinCorridor, splitLedger } = await import('../src/core/project-motorway');
    const { ctx, snapshot } = fixture();
    snapshot.design = replaceRouteFromLegacy(snapshot.design, snapshot.design.routes[0].id,
      { ...legacyDesignForRoute(snapshot.design, snapshot.design.routes[0].id), pis: [{ x: 1200, y: 420, r: null }] });
    const paired = evaluateProject(ctx, snapshot);
    const spine = paired.routes[snapshot.design.routes[0].id].legacy!;
    const split = splitCorridor(snapshot.design, 'corridor:motorway', spine);
    assertProjectDesign(split);
    const [f, r] = split.routes;
    // each direction edits its own bends; the shared line is kept for joining again
    expect(legacyDesignForRoute(split, f.id).category).toBe('D27.5-1');
    expect(legacyDesignForRoute(split, f.id).pis).not.toEqual(legacyDesignForRoute(split, r.id).pis);
    const result = evaluateProject(ctx, { ...snapshot, revision: 2, design: split });
    expect(result.complete).toBe(true);
    expect(result.cost.unpriced).toEqual([]);
    expect(result.issues.filter(i => /directions/.test(i.violation.title))).toEqual([]);
    // shared formation, its surcharge and its earthworks priced once: an unedited split on open ground
    // costs what the pair costs (no structures here; noise is a bound only near houses)
    expect(Math.abs(result.cost.total! / paired.cost.total! - 1)).toBeLessThan(0.01);
    expect(result.cost.total!).toBeLessThan(result.cost.alone[f.id] + result.cost.alone[r.id]);
    expect(rejoinCorridor(split, 'corridor:motorway')).toEqual(snapshot.design);
    // far apart (the other direction 1 km to the right) is neither joined nor overlapping
    const fr = result.routes[f.id].legacy!, rr = result.routes[r.id].legacy!;
    const far = { ...rr, x: Float64Array.from(rr.x), y: Float64Array.from(rr.y, v => v - 1000) };
    const apart = splitLedger(fr, far, (x, y) => ctx.legacy.terrain.heightAt(x, y));
    expect(apart.violations).toEqual([]); expect(apart.joinedLength).toBe(0);
    // moving one direction 3 m higher alongside the other: its slope stands on the other carriageway
    // (between its tie-ins, which stay at the ports: interior points 3 m up)
    const raised = structuredClone(split), v = (raised.routes[0].alignment as { vertical: { vpis: { s: number; z: number; r: null }[] } }).vertical;
    const [a, b] = [v.vpis[0], v.vpis[v.vpis.length - 1]], zAt = (s: number) => a.z + (b.z - a.z) * (s - a.s) / (b.s - a.s);
    v.vpis = [a, ...[0.3, 0.7].map(t => ({ s: a.s + t * (b.s - a.s), z: zAt(a.s + t * (b.s - a.s)) + 3, r: null })), b];
    const clash = evaluateProject(ctx, { ...snapshot, revision: 3, design: raised });
    expect(clash.issues.some(i => i.violation.title === 'Slopes of the two directions clash')).toBe(true);
    expect(clash.valid).toBe(false);
  });
});

describe('one direction on its own (separate stretches)', () => {
  const bent = () => {
    const { ctx, snapshot } = fixture();
    const [f, r] = snapshot.design.routes;
    snapshot.design = replaceRouteFromLegacy(snapshot.design, f.id,
      { ...legacyDesignForRoute(snapshot.design, f.id), pis: [{ x: 800, y: 290, r: null }, { x: 1600, y: 210, r: null }] });
    return { ctx, snapshot, f, r };
  };
  it('choosing a direction changes nothing; its first edit runs it apart only between joins around the change', () => {
    const { ctx, snapshot, f, r } = bent();
    const shown = legacyDesignForRoute(snapshot.design, r.id, { oneDirection: true });
    expect(shown.pis).toEqual(legacyDesignForRoute(snapshot.design, f.id).pis);
    expect(replaceRouteFromLegacy(snapshot.design, r.id, shown, { oneDirection: true })).toEqual(snapshot.design);
    const paired = evaluateProject(ctx, snapshot);
    // the direction towards A (left of A→B) bends 40 m further left between the two bends
    const edited = replaceRouteFromLegacy(snapshot.design, r.id, { ...shown, pis: [shown.pis[0], { x: 1200, y: 290, r: null }, shown.pis[1]] }, { oneDirection: true });
    assertProjectDesign(edited);
    const corridor = edited.corridors[0];
    if (corridor.mode !== 'paired') throw new Error('still one corridor');
    expect(corridor.stretches).toHaveLength(1);
    const t = corridor.stretches![0];
    expect(t.reverse?.pis).toHaveLength(3); expect(t.forward).toBeUndefined();
    const result = evaluateProject(ctx, { ...snapshot, revision: 2, design: edited });
    const fs = result.routes[f.id].legacy!, spine = paired.routes[f.id].legacy!;
    expect(t.a).toBeGreaterThan(100); expect(t.b).toBeLessThan(spine.length - 100);
    expect(result.complete).toBe(true);
    expect(result.issues).toEqual([]);
    // outside the stretch the shared body's bill is the paired one, cell for cell
    const drawn = result.routes[f.id].drawn!;
    expect(drawn.filter(p => p.section === 'paired').length).toBeGreaterThan(0);
    expect(drawn.filter(p => p.section === 'carriageway').map(p => p.direction).sort()).toEqual(['forward', 'reverse']);
    const i0 = Math.floor(t.a / spine.ds) - 20;
    for (let i = 0; i < i0; i++) expect(fs.parts.roadBase[i]).toBe(spine.parts.roadBase[i]);
    expect(Array.from(fs.grade.subarray(0, i0))).toEqual(Array.from(spine.grade.subarray(0, i0)));
    // the bend costs what its own stretch costs, no more: the rest is unchanged
    expect(result.cost.total! - paired.cost.total!).toBeGreaterThan(0);
    expect(result.cost.total! - paired.cost.total!).toBeLessThan(0.1 * paired.cost.total!);
    // joining that stretch again is the paired design, at the paired price
    const joined = rejoinStretch(edited, corridor.id, t.id);
    expect(joined).toEqual(snapshot.design);
    expect(evaluateProject(ctx, { ...snapshot, revision: 3, design: joined }).cost.total).toBe(paired.cost.total);
  });
  it('takes edits at the route ends and says when a pin asks one direction to leave the shared height', () => {
    const { ctx, snapshot, r } = bent();
    const shown = legacyDesignForRoute(snapshot.design, r.id, { oneDirection: true });
    // the last bend gone in one direction: its line runs on its own to B
    const tail = replaceRouteFromLegacy(snapshot.design, r.id, { ...shown, pis: [shown.pis[0]] }, { oneDirection: true });
    const ended = evaluateProject(ctx, { ...snapshot, revision: 2, design: tail });
    expect(ended.complete).toBe(true);
    expect(Number.isFinite(ended.cost.total!)).toBe(true);
    // a 10 m pin right after the join, where both still run side by side
    const t = (tail.corridors[0] as { stretches: { a: number }[] }).stretches[0];
    const pinned = replaceRouteFromLegacy(tail, r.id, { ...legacyDesignForRoute(tail, r.id, { oneDirection: true }), gradePins: [{ s: t.a + 60, z: 130 }] }, { oneDirection: true });
    const result = evaluateProject(ctx, { ...snapshot, revision: 3, design: pinned });
    expect(result.issues.map(i => i.violation.title)).toContain('Height pin where both directions keep one height');
  });
  it('a change of both directions keeps stretches away from it and drops those it touches', () => {
    const { snapshot, r } = bent();
    const shown = legacyDesignForRoute(snapshot.design, r.id, { oneDirection: true });
    const edited = replaceRouteFromLegacy(snapshot.design, r.id, { ...shown, pis: [shown.pis[0], { x: 1200, y: 290, r: null }, shown.pis[1]] }, { oneDirection: true });
    const both = legacyDesignForRoute(edited, r.id);
    const radius = replaceRouteFromLegacy(edited, r.id, { ...both, pis: [both.pis[0], { ...both.pis[1], r: 2000 }] });
    expect((radius.corridors[0] as { stretches?: unknown[] }).stretches).toBeUndefined();
    const pinned = replaceRouteFromLegacy(edited, r.id, { ...both, gradePins: [{ s: 100, z: 101 }] });
    expect((pinned.corridors[0] as { stretches?: unknown[] }).stretches).toHaveLength(1);
  });
});

describe('the 150 km/h speed-limit pilot (research/41)', () => {
  it('is a posted limit on a motorway designed for 130: faster cars, louder cars, the signs priced, the same geometry', () => {
    const { ctx, snapshot } = fixture();
    const corridor = snapshot.design.corridors[0].id;
    const on = setSpeedLimit150(snapshot.design, corridor, true);
    expect(on.routes.every(speedLimit150)).toBe(true);
    const [p0, p1] = [snapshot.design, on].map((design, k) => evaluateProject(ctx, { epoch: 'e', revision: k + 1, design }));
    const [r0, r1] = [p0, p1].map(p => p.routes[snapshot.design.routes[0].id].legacy!);
    expect(r1.vpis).toEqual(r0.vpis); // geometry norms stay those of 130
    expect(r1.length).toBe(r0.length);
    expect(r1.travelMin).toBeCloseTo(r0.length / (PILOT_TRAVEL_SPEED / 3.6) / 60, 9);
    expect(r1.cost.total - r0.cost.total).toBeCloseTo(r0.length * MOTORWAY_150_PILOT.signsPerM, -4);
    const loud = (rise: number) => noiseSource(30000, 130, { heavyShare: 0.2256, profile: 'motorway', lightSpeedRise: rise }).dayDb;
    expect(loud(20) - loud(0)).toBeGreaterThan(0.5); // cars at +20 km/h: about +1 dB by day
    expect(loud(20) - loud(0)).toBeLessThan(2);
    // a new design speed ends it; it cannot run on a motorway designed for 120
    const slower = replaceRouteFromLegacy(on, on.routes[0].id, { ...legacyDesignForRoute(on, on.routes[0].id), speed: 120 });
    expect(slower.routes.some(speedLimit150)).toBe(false);
    expect(() => setSpeedLimit150(slower, corridor, true)).toThrow();
  });
});
