// The structure choice weighs the buildings each option would demolish.
import { describe, expect, it } from 'vitest';
import { BuildingIndex } from '../src/core/buildings';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluate, type Design } from '../src/core/evaluate';
import { KIND } from '../src/core/structures';
import { syntheticTerrain } from '../src/core/terrain';

describe('buildings in the structure choice', () => {
  // flat ground at 400 m; By hand, the road runs 9 m up over km 0.45–0.75
  const ctx = { terrain: syntheticTerrain(500, 80, 5, () => 400), scenario: D11_SCENARIO, a: { x: 100, y: 200 }, b: { x: 1300, y: 200 } };
  const design: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual',
    vpis: [{ s: 0, z: 400, r: null }, { s: 300, z: 400, r: null }, { s: 450, z: 409, r: null }, { s: 750, z: 409, r: null }, { s: 900, z: 400, r: null }, { s: 1200, z: 400, r: null }] };
  const at = (r: ReturnType<typeof evaluate>, s: number) => r.kind[Math.round(s / r.ds)];

  it('bridges over a large building the embankment slopes would bury, but not over open fields', () => {
    const open = evaluate(ctx, design);
    expect(at(open, 600)).toBe(KIND.earth);
    // a 4-storey block 15 m beside the axis: under the 9 m embankment's slopes, clear of the deck
    const buildings = new BuildingIndex([[700, 215, 7]], [[3000, 4, 0, 700, 216, 30, 3, 0]]);
    const town = evaluate({ ...ctx, buildings }, design);
    expect(at(town, 600)).toBe(KIND.bridge);
    expect(town.demolished).toEqual([]);
    // what the embankment would have cost there, building and all
    const earth = evaluate({ ...ctx, buildings }, { ...design, structureOverrides: [{ s0: 0, s1: 1200, kind: KIND.earth }] });
    expect(earth.demolished.map(p => p.j)).toEqual([0]);
    expect(town.cost.total).toBeLessThan(earth.cost.total);
  });

  it('a cut-and-cover tunnel demolishes the buildings over its pit (a mined one passes under them)', () => {
    // 16 m below the ground over km 0.35–0.85, a tunnel painted over km 0.4–0.8
    const deep: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual',
      vpis: [{ s: 0, z: 400, r: null }, { s: 200, z: 400, r: null }, { s: 350, z: 384, r: null }, { s: 850, z: 384, r: null }, { s: 1000, z: 400, r: null }, { s: 1200, z: 400, r: null }] };
    const house = new BuildingIndex([[700, 208, 6]], [[400, 2, 0, 700, 208, 5, 5, 0]]);
    const tunnel = (method?: 'cut') => ({ ...deep, structureOverrides: [{ s0: 400, s1: 800, kind: KIND.tunnel as 2, ...(method ? { method } : {}) }] });
    const cut = evaluate({ ...ctx, buildings: house }, tunnel('cut'));
    expect(cut.demolished.map(p => [p.j, p.in])).toEqual([[0, 'cut']]);
    expect(cut.parts.buildings.reduce((a, b) => a + b, 0)).toBeCloseTo(house.cost[0], 0);
    const kept = evaluate({ ...ctx, buildings: house }, { ...tunnel('cut'), buildingOverrides: [{ j: 0, action: 'keep' }] });
    expect(kept.violations.map(v => v.title)).toContain('Road through a kept building');
    // mined (the default) except its portal blocks: the house in the middle stays
    expect(evaluate({ ...ctx, buildings: house }, tunnel()).demolished).toEqual([]);
  });

  it('under a high deck a house stays unless a pier stands on it; under a low deck, or a garage, it goes', () => {
    // 30 m up over km 0.35–0.85, a bridge painted over km 0.4–0.8 (BUILDING_RULES.underDeck*, research/62)
    const high: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual',
      vpis: [{ s: 0, z: 400, r: null }, { s: 150, z: 400, r: null }, { s: 350, z: 430, r: null }, { s: 850, z: 430, r: null }, { s: 1050, z: 400, r: null }, { s: 1200, z: 400, r: null }] };
    const paint = { structureOverrides: [{ s0: 400, s1: 800, kind: KIND.bridge as 1 }] };
    const bare = evaluate(ctx, { ...high, ...paint }), run = bare.runs.find(q => q.kind === KIND.bridge)!;
    const supports = [run.s0, ...(run.pierStations ?? Array.from({ length: Math.round(run.length / 30) - 1 }, (_, k) => run.s0 + (k + 1) * run.length / Math.round(run.length / 30))), run.s1];
    const mid = (supports[3] + supports[4]) / 2, pier = supports[5];
    // a house mid-span, a house where a pier stands, a garage mid-span (x = 100 + s on this straight road)
    const buildings = new BuildingIndex([[100 + mid, 200, 5], [100 + pier, 202, 5], [100 + (supports[6] + supports[7]) / 2, 200, 3]],
      [[60, 2, 0, 100 + mid, 200, 4, 4, 0], [60, 2, 0, 100 + pier, 202, 4, 4, 0], [20, 1, 4, 100 + (supports[6] + supports[7]) / 2, 200, 2.5, 2, 0]]);
    const r = evaluate({ ...ctx, buildings }, { ...high, ...paint });
    expect(r.demolished.map(p => [p.j, p.in, !!p.pier]).sort()).toEqual([[1, 'bridge', true], [2, 'bridge', false]]);
    // 9 m up, the deck is cast on falsework standing on the ground: the house goes as well
    const low: Design = { ...high, vpis: high.vpis.map(v => ({ ...v, z: v.z === 430 ? 409 : v.z })) };
    expect(evaluate({ ...ctx, buildings }, { ...low, ...paint }).demolished.map(p => p.j).sort()).toEqual([0, 1, 2]);
  });

  it('under an arch, the rib decides: a house near its springing goes, one under its crown stays', () => {
    // a valley 40 m deep (its middle at km 0.6) under a road 2 m above its rims, the bridge an arch (research/62)
    const valley = syntheticTerrain(500, 80, 5, (x) => { const t = (x - 700) / 150; return Math.abs(t) < 1 ? 120 + 40 * t * t : 160; });
    const flat: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual', vpis: [{ s: 0, z: 162, r: null }, { s: 1200, z: 162, r: null }],
      structureOverrides: [{ s0: 445, s1: 755, kind: KIND.bridge as 1, style: 'arch' }] };
    const bare = evaluate({ ...ctx, terrain: valley }, flat), arch = bare.runs.find(q => q.kind === KIND.bridge)!.arch!;
    expect(arch).toBeDefined();
    // 5 storeys (15 m) beside the springing, and under the middle (clear of the columns on the rib: they stand on it)
    const near = arch.s0 + 12, middle = (arch.s0 + arch.s1) / 2 + 7;
    const buildings = new BuildingIndex([[100 + near, 200, 4], [100 + middle, 200, 4]],
      [[50, 5, 0, 100 + near, 200, 3, 3, 0], [50, 5, 0, 100 + middle, 200, 3, 3, 0]]);
    const r = evaluate({ ...ctx, terrain: valley, buildings }, flat);
    expect(r.runs.find(q => q.kind === KIND.bridge)!.arch).toEqual(arch);
    expect(r.demolished.map(p => p.j)).toEqual([0]);
  });

  it('a chimney standing within a demolished hall goes with it, billed', () => {
    const flat: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual', vpis: [{ s: 0, z: 400, r: null }, { s: 1200, z: 400, r: null }] };
    // the hall reaches the road (its south wall 5 m from the axis); the chimney stands 55 m off, inside it
    const buildings = new BuildingIndex([[700, 240, 50], [700, 255, 3]],
      [[4800, 1, 3, 700, 240, 40, 35, 0], [9, 0, 4, 700, 255, 1.5, 1.5, 0]]);
    const r = evaluate({ ...ctx, buildings }, flat);
    expect(r.demolished.map(p => [p.j, p.host])).toEqual([[0, undefined], [1, 0]]);
    expect(r.parts.buildings.reduce((a, b) => a + b, 0)).toBeCloseTo(buildings.cost[0] + buildings.cost[1], 0);
    // a shed beside the hall, not within it, stays
    const beside = new BuildingIndex([[700, 240, 50], [760, 255, 3]], [[4800, 1, 3, 700, 240, 40, 35, 0], [9, 0, 4, 760, 255, 1.5, 1.5, 0]]);
    expect(evaluate({ ...ctx, buildings: beside }, flat).demolished.map(p => p.j)).toEqual([0]);
  });

  it('a building only the working strip beside our cut reaches stays behind a retaining wall where that is cheaper', () => {
    // a 2 m cut over km 0.3–0.9
    const cut: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual',
      vpis: [{ s: 0, z: 400, r: null }, { s: 200, z: 400, r: null }, { s: 300, z: 398, r: null }, { s: 900, z: 398, r: null }, { s: 1000, z: 400, r: null }, { s: 1200, z: 400, r: null }] };
    const open = evaluate(ctx, cut), i = Math.round(600 / open.ds), edge = 200 + open.dayL[i] + 1.5;
    // its near wall 1.5 m beyond the slope's top, within the 3 m working strip
    const at = (hl: number, hw: number, kind: number, area: number) => new BuildingIndex([[700, edge + hw, Math.hypot(hl, hw)]], [[area, 1, kind, 700, edge + hw, hl, hw, 0]]);
    const hall = at(20, 10, 3, 800), r = evaluate({ ...ctx, buildings: hall }, cut);
    expect(r.demolished).toEqual([]);
    expect(r.walledOff.map(b => [b.j, b.kept])).toEqual([[0, false]]);
    expect(r.walledOff[0].wall).toBeLessThan(hall.cost[0]);
    const walls = r.retainingWalls.filter(w => w.feature === 'building');
    expect(walls.length).toBeGreaterThan(0);
    // the slope ends at the wall, the working strip beside it keeps clear of the hall
    for (const w of walls) expect(w.offset + 3).toBeLessThan(edge - 200);
    // in a 4 m cut, a hall the slope itself reaches is demolished by Auto; kept by the player, a wall keeps the
    // works clear of it
    const deep: Design = { ...cut, vpis: cut.vpis.map(v => (v.z < 400 ? { ...v, z: 396 } : v)) };
    const top = 200 + evaluate(ctx, deep).dayL[i] - 1;
    const inSlope = new BuildingIndex([[700, top + 10, 22]], [[800, 1, 3, 700, top + 10, 20, 10, 0]]);
    expect(evaluate({ ...ctx, buildings: inSlope }, deep).demolished.map(p => [p.j, p.strip])).toEqual([[0, false]]);
    const keep = evaluate({ ...ctx, buildings: inSlope }, { ...deep, buildingOverrides: [{ j: 0, action: 'keep' }] });
    expect([keep.demolished, keep.kept.filter(k => k.hit), keep.walledOff.map(b => b.kept)]).toEqual([[], [], [true]]);
    // a shed is cheaper to demolish than to wall off
    const shed = at(1.5, 1.5, 4, 9);
    expect(evaluate({ ...ctx, buildings: shed }, cut).demolished.map(p => [p.j, p.strip])).toEqual([[0, true]]);
  });
});
