// Built-up areas: crossings of existing roads, buildings, noise walls, per-station cost attribution.
import { describe, expect, it } from 'vitest';
import { autoProfile } from '../src/core/autoprofile';
import { BuildingIndex, noiseBuyoutCost, type BuildingInfo } from '../src/core/buildings';
import { cellLength, PART_KEYS, surchargeRate } from '../src/core/cost';
import { bridgeLayout, bridgeModel } from '../src/core/bridge';
import { CATEGORIES } from '../src/core/data/categories';
import { crossingPlanLength, resolveCrossings, type CrossingResult } from '../src/core/crossings';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { LAND, STRUCTURE_RULES } from '../src/core/data/prices';
import { underpassAssembly, underpassOpenCost } from '../src/core/data/remedies';
import { BUILDING_KIND, BUILDING_RULES, NOISE, ROAD_CLASSES, URBAN_LAND, URBAN_RATES } from '../src/core/data/urban';
import { evaluate, type Design } from '../src/core/evaluate';
import { noiseBand } from '../src/core/noise';
import { rangeSummary } from '../src/core/range';
import { mergeCrossings, RoadNet } from '../src/core/roadnet';
import { KIND } from '../src/core/structures';
import { BUILTUP_BIT, RIVER_CROSSING_BIT, syntheticTerrain } from '../src/core/terrain';
import { buildProfile, elevations, type VPI } from '../src/core/vertical';

describe('road network crossings', () => {
  const net = new RoadNet({
    cls: ['residential', 'primary', 'track'],
    ways: [
      [0, 200, -50, 200, 0, 200, 50], // vertex exactly on the route
      [1, 300, -50, 300, 50], [1, 315, -50, 315, 50], // dual carriageway
      [2, 480, -50, 520, 50], // diagonal track
      [0, 30, -50, 30, 50], // inside the end margin
      [0, 700, -20, 800, -20], // parallel, never crossed
    ],
  });
  const n = 101;
  const s = Float64Array.from({ length: n }, (_, i) => i * 10), y = new Float64Array(n);

  it('finds each intersection once, in station order', () => {
    const raw = net.intersections(n, s, s, y);
    expect(raw.map((c) => [Math.round(c.s), c.cls])).toEqual([[30, 'residential'], [200, 'residential'], [300, 'primary'], [315, 'primary'], [500, 'track']]);
  });

  it('does not depend on the direction in which a way was drawn', () => {
    // two ways of one road meeting on the route, both drawn towards it / both away from it
    const towards = new RoadNet({ cls: ['primary'], ways: [[0, 500, -50, 500, 0], [0, 500, 50, 500, 0]] });
    const away = new RoadNet({ cls: ['primary'], ways: [[0, 500, 0, 500, -50], [0, 500, 0, 500, 50]] });
    for (const net2 of [towards, away]) {
      const m = mergeCrossings(net2.intersections(n, s, s, y), 1000);
      expect(m.map((c) => Math.round(c.s))).toEqual([500]);
    }
    // the same on a skew route, where round-off puts the end point a hair outside the segment
    const sk = Float64Array.from([485, 495, 505, 515]);
    const sx = Float64Array.from(sk, (v) => 500 + (v - 500) * 0.42), sy = Float64Array.from(sk, (v) => 500 + (v - 500) * 0.84);
    for (const ways of [[[0, 510, 530, 500, 500], [0, 520, 510, 500, 500]], [[0, 500, 500, 510, 530], [0, 500, 500, 520, 510]]]) {
      const m = mergeCrossings(new RoadNet({ cls: ['primary'], ways }).intersections(4, sk, sx, sy), 1000, { endMargin: 0, mergeDistance: 30, sameWayMergeDistance: 150 });
      expect(m.length).toBe(1);
      expect(m[0].s).toBeCloseTo(500, 6);
    }
  });

  it('merges close crossings and drops those at the route ends', () => {
    const m = mergeCrossings(net.intersections(n, s, s, y), 1000);
    expect(m.map((c) => [Math.round(c.s), c.cls])).toEqual([[200, 'residential'], [300, 'primary'], [500, 'track']]);
  });
});

describe('junction spacing and geometric reconnections', () => {
  const crossing = (s: number, cls: string, h = 0): CrossingResult => ({ s, cls, h, i: 0, x: s, y: 0, type: 'atGrade', cost: 0 });
  const resolve = (cs: CrossingResult[], urban = 0) => {
    resolveCrossings(cs, 9000, [KIND.earth], [9.5], [urban]);
    return cs;
  };

  it('keeps higher-class junctions first, enforces endpoint spacing and accepts the exact boundary', () => {
    const input = () => [crossing(1499, 'primary'), crossing(1500, 'secondary'), crossing(2900, 'tertiary'),
      crossing(3000, 'primary'), crossing(4499, 'secondary'), crossing(6000, 'tertiary'), crossing(7500, 'primary'), crossing(7501, 'primary')];
    const cs = resolve(input());
    expect(cs.filter(c => c.type === 'junction').map(c => c.s)).toEqual([1500, 3000, 6000, 7500]);
    expect(resolve(input().reverse()).filter(c => c.type === 'junction').map(c => c.s).sort((a, b) => a - b))
      .toEqual([1500, 3000, 6000, 7500]);
    // Built-up does not silently relax the class-I spacing rule.
    expect(resolve(input(), 1).filter(c => c.type === 'junction').map(c => c.s)).toEqual([1500, 3000, 6000, 7500]);
  });

  it('prices both sides by actual gap and urban row, never making local streets direct junctions', () => {
    // (our road 1 m below the street: too deep for an underpass box even with the street lowered)
    const run = (gap: number, urban = 0) => resolve([crossing(3000, 'primary'), crossing(3000 + gap, 'residential', -1)], urban)[1];
    const a = run(50), b = run(100), town = run(100, 1);
    expect(a.type).toBe('reconnection'); expect(b.type).toBe('reconnection');
    expect(b.targetS).toBe(3000); expect(b.linkLength).toBe(200);
    expect(b.cost).toBeCloseTo(2 * a.cost, 6);
    expect(town.cost).toBeGreaterThan(b.cost);
    expect(town.roadCode).not.toBe(b.roadCode);
    const isolated = run(800);
    expect(isolated.type).toBe('overbridge');
    expect(isolated.linkLength).toBeUndefined(); // no capped link pretending to reach the junction
    expect(isolated.approachLength).toBeGreaterThan(0);
    expect(run(600).type).toBe('overbridge'); // within reach, but the bridge is cheaper
    // Grow a link tree outward from the junction, not in station order (no overlapping links).
    const mirrored = resolve([crossing(3300, 'primary'), crossing(3200, 'residential'), crossing(3100, 'residential')]);
    const forward = resolve([crossing(3000, 'primary'), crossing(3100, 'residential'), crossing(3200, 'residential')]);
    expect(mirrored.reduce((sum, c) => sum + c.cost, 0)).toBe(forward.reduce((sum, c) => sum + c.cost, 0));
  });

  it('consolidates nearby tracks onto one crossing that carries them over us; services use the local network', () => {
    // Every reroute leads to a crossing that carries traffic over or under us, never to another cut road.
    const cs = resolve([crossing(4000, 'track', -1), crossing(4050, 'track', -1), crossing(4100, 'track', -1)]);
    expect(cs.map(c => c.type)).toEqual(['overbridge', 'diversion', 'diversion']);
    expect(cs.map(c => c.targetS)).toEqual([undefined, 4000, 4000]);
    expect(cs[1].linkLength).toBe(100); expect(cs[2].linkLength).toBe(200);
    // Deep cuts do not force separate bridges for tracks/accesses beside an existing crossing.
    const deep = [crossing(4000, 'residential', -12), crossing(4100, 'track', -12), crossing(4050, 'service', -12)];
    resolveCrossings(deep, 9000, [KIND.earth], [51.5], [0]);
    expect(deep.map(c => c.type)).toEqual(['overbridge', 'diversion', 'reconnection']);
    expect(deep[1].targetS).toBe(4000);
    const services = resolve([crossing(3000, 'primary'), crossing(3050, 'service'), crossing(3100, 'service')]);
    expect(services.slice(1).map(c => c.type)).toEqual(['reconnection', 'reconnection']);
    expect(services.slice(1).map(c => c.targetS)).toEqual([3000, 3000]);
  });

  it('bills service access once without surcharging it or the all-in junction', () => {
    const terrain = syntheticTerrain(1400, 100, 5, () => 400);
    const ctx = { terrain, scenario: D11_SCENARIO, a: { x: 500, y: 250 }, b: { x: 6500, y: 250 } };
    const d: Design = { category: 'S9.5', speed: 90, pis: [], profileMode: 'manual',
      vpis: [{ s: 0, z: 400, r: null }, { s: 6000, z: 400, r: null }] };
    const run = (cls: string) => evaluate({ ...ctx, roads: new RoadNet({ cls: ['primary', cls],
      ways: [[0, 3500, 0, 3500, 500], [1, 3550, 0, 3550, 500]] }) }, d);
    const street = run('residential'), service = run('service'), plain = evaluate(ctx, d);
    expect(service.crossings[1].type).toBe('reconnection');
    // Different road widths change the real connector lengths. Only that measured construction
    // receives surcharge; the service access allowance itself remains an unsurcharged lump.
    const extraRoad = service.crossings[1].cost - 500_000 - street.crossings[1].cost;
    expect(service.cost.total - street.cost.total).toBeCloseTo(500_000 + extraRoad * (1 + surchargeRate(0)), 3);
    expect(service.cost.surcharge - street.cost.surcharge).toBeCloseTo(extraRoad * surchargeRate(0), 3);
    expect(service.cost.surcharge).toBeGreaterThan(plain.cost.surcharge); // SPK link does get surcharge
    expect(service.parts.surcharge[300]).toBe(plain.parts.surcharge[300]); // junction does not
  });

  it('preserves grade separation without consuming junction spacing or making motorway access', () => {
    const cs = [crossing(3000, 'primary'), { ...crossing(3100, 'primary'), i: 1 }, crossing(3200, 'motorway'), crossing(3250, 'residential')];
    resolveCrossings(cs, 9000, [KIND.earth, KIND.bridge], [9.5, 9.5], [0, 0]);
    expect(cs[0].type).toBe('junction'); expect(cs[1].type).toBe('bridge');
    expect(cs[2].type).toBe('atGrade'); expect(cs[2].cost).toBe(0);
    expect(cs[3].targetS).toBe(3100); // cannot connect to the nearer motorway
  });
});

describe('building footprints', () => {
  it('adds plot land only to noise acquisitions, with a minimum and footprint-based scaling', () => {
    const landRate = URBAN_LAND.buildingLandPerM2 * URBAN_LAND.multiplier;
    const b = new BuildingIndex([[0, 0, 8], [100, 0, 15]], [
      [100, 1, BUILDING_KIND.house, 0, 0, 5, 5, 0],
      [400, 1, BUILDING_KIND.house, 100, 0, 10, 10, 0],
    ]);
    expect(b.cost[1]).toBe(4 * b.cost[0]); // building-only floor value, no plot minimum
    expect(noiseBuyoutCost(b.cost[0], b.area[0]) - b.cost[0]).toBe(BUILDING_RULES.buyoutPlotMinimum * landRate);
    expect(noiseBuyoutCost(b.cost[1], b.area[1]) - b.cost[1]).toBe(400 * BUILDING_RULES.buyoutPlotMultiple * landRate);
  });

  it('uses the oriented rectangle, not the bounding circle', () => {
    // a 40 × 6 m hall at 45°, centred 20 m left of an eastbound road strip that is 5 m wide each side
    const info: BuildingInfo = [240, 0, BUILDING_KIND.industrial, 0, 20, 20, 3, 45];
    const b = new BuildingIndex([[0, 20, 20.3]], [info]);
    // the circle (r = 20.3) reaches the strip at x = 0, the rectangle does not: its nearest corner is
    // at (−12.0, 3.7)
    expect(b.hits(0, 0, 0, 1, 0, 5, 5)).toBe(false);
    expect(b.hits(0, -14, 0, 1, 0, 5, 3)).toBe(false);
    expect(b.hits(0, -14, 0, 1, 0, 5, 5)).toBe(true);
    expect(b.facadeDistance(0, 0, 0)).toBeCloseTo(20 / Math.SQRT2 - 3, 6);
    expect(b.facadeDistance(0, 0, 20)).toBe(0);
  });
});

describe('evaluate on a synthetic town', () => {
  // plane at 400 m with a 12 m deep valley at x = 2000 and a 12 m high ridge at x = 4000 (both N–S)
  const bump = (x: number, x0: number) => 12 * Math.max(0, Math.min(1, (200 - Math.abs(x - x0)) / 100));
  const terrain = syntheticTerrain(1400, 400, 5, (x) => 400 - bump(x, 2000) + bump(x, 4000));
  // built-up strip x ∈ [2400, 2800]
  for (let r = 0; r < terrain.ny; r++) for (let c = 480; c < 560; c++) terrain.lc[r * terrain.nx + c] |= BUILTUP_BIT;
  const roads = new RoadNet({
    cls: ['residential', 'track', 'primary'],
    ways: [
      [0, 2000, 500, 2000, 1500], // street in the valley floor → under our bridge (chosen; Auto: underpass)
      [0, 4000, 500, 4000, 1500], // street on the ridge → overbridge across the cut
      [0, 3000, 500, 3000, 1500], // street on the plain → reconnection
      [1, 3200, 500, 3200, 1500], // track → diversion
      [2, 5000, 500, 5000, 1500], [2, 5015, 500, 5015, 1500], // dual carriageway → one junction
    ],
  });
  const sq = (x: number, y: number, half: number, kind: number): BuildingInfo => [4 * half * half, 1, kind, x, y, half, half, 0];
  const info = [
    sq(1000, 1000, 5, BUILDING_KIND.house), // on the centreline → demolished
    sq(1000, 1040, 5, BUILDING_KIND.house), // 40 m to the left → noise wall
    sq(4000, 1045, 5, BUILDING_KIND.house), // beside the 12 m cut → screened by it
    sq(2000, 1000, 3, BUILDING_KIND.minor), // under the bridge deck → demolished
    sq(2000, 1012, 3, BUILDING_KIND.minor), // beside the deck, where an embankment would have buried it
    [100, 4, BUILDING_KIND.apartments, 1000, 1016, 5, 5, 0] as BuildingInfo, // outside working strip, upper floor sees over every wall
    [100, 4, BUILDING_KIND.apartments, 1000, 1070, 5, 5, 0] as BuildingInfo, // distant upper floor is shadowed
    [100, 4, BUILDING_KIND.apartments, 2000, 1040, 5, 5, 0] as BuildingInfo, // top floor below elevated road: wall feasible
  ];
  const buildings = new BuildingIndex(info.map((f) => [f[3], f[4], f[5] * Math.SQRT2]), info);
  const ctx = { terrain, scenario: D11_SCENARIO, a: { x: 500, y: 1000 }, b: { x: 6500, y: 1000 }, buildings, roads };
  const design: Design = {
    category: 'S9.5', speed: 90, pis: [], profileMode: 'manual',
    vpis: [{ s: 0, z: 400, r: null }, { s: 6000, z: 400, r: null }],
    // Auto now keeps the valley street at its level in an underpass (below); these deck,
    // demolition and noise cases keep the chosen bridge.
    crossingOverrides: [{ roadId: 0, type: 'bridge' }],
  };
  const r = evaluate(ctx, design);

  it('keeps a valley street at its level in a priced underpass through a high fill (Auto)', () => {
    const auto = evaluate(ctx, { ...design, crossingOverrides: [] });
    const c = auto.crossings.find(c => c.roadId === 0)!;
    expect(c.type).toBe('underpass');
    expect(auto.kind[c.i]).toBe(KIND.earth);
    const g = c.geometry!, box = g.underpass!;
    // Toe to toe along the (perpendicular) street: the built footprint width at that station; the box
    // between the portals where our slope comes down to its roof, wing walls from there to the toes.
    const toes = crossingPlanLength(g.road!.slice(box.start, box.end + 1));
    expect(Math.abs(toes - (auto.dayL[c.i] + auto.dayR[c.i]))).toBeLessThan(1);
    expect(c.underpassLength).toBeCloseTo(box.portals![1] - box.portals![0], 6);
    expect(c.underpassLength).toBeLessThan(toes - 10);
    const assembly = underpassAssembly('local', ROAD_CLASSES.residential.roadPerKm[0] / 1000);
    const open = box.wings!.reduce((sum, wing) => sum + underpassOpenCost(wing, ROAD_CLASSES.residential.roadPerKm[0] / 1000), 0);
    expect(c.cost).toBeCloseTo(c.underpassLength! * assembly.perM + 2 * assembly.head + open, 3);
    expect(c.h).toBeGreaterThanOrEqual(assembly.minHeight);
    // The street survives through the box: neither removed nor reported under the fill.
    expect(g.removed).toBeUndefined();
    expect(auto.footprintConflicts.some(f => f.roadId === 0)).toBe(false);
    // No new violation; the chosen bridge stays available (and keeps the minor building beside it).
    expect(auto.violations.map(v => v.title)).toEqual(r.violations.map(v => v.title));
    expect(r.crossings.find(x => x.roadId === 0)!.type).toBe('bridge');
  });

  it('resolves each crossing by the height of the grade above the crossed road', () => {
    expect(r.crossings.map((c) => [Math.round(c.s), c.cls, c.type])).toEqual([
      [1500, 'residential', 'bridge'], [2500, 'residential', 'underpass'], [2700, 'track', 'underpass'],
      [3500, 'residential', 'overbridge'], [4500, 'primary', 'junction'],
    ]);
    // the valley street forces a short bridge into what would otherwise be an embankment
    expect(r.kind[150]).toBe(KIND.bridge);
    expect(r.runs.length).toBe(1);
    expect(r.runs[0].length).toBeGreaterThanOrEqual(30);
    expect(r.runs[0].length).toBeLessThan(100);
    // the overbridge spans the cut from edge to edge: crown + two 1:1.75 slopes 12 m high
    const span = r.dayL[r.crossings[3].i] + r.dayR[r.crossings[3].i];
    const over = r.crossings[3];
    expect(over.span!).toBeGreaterThan(span); // whole crossed ribbon and abutment setbacks, not only its centre
    const g = over.geometry!, deck = g.deck!;
    expect(over.span).toBeCloseTo(crossingPlanLength(g.road!.slice(deck.start, deck.end + 1)), 6);
    expect(over.cost).toBeCloseTo(bridgeModel(ROAD_CLASSES.residential).total(over.span!, 0, { span: over.span!, pierDensity: 0 }) + over.approachLength! * over.roadPerKm! / 1000, 3);
    // Our road runs on the plain at the street's level: the street and the track beside it are lowered
    // into cuts under boxes (cheaper than raising them over us), drained by pumps on flat ground.
    for (const c of [r.crossings[1], r.crossings[2]]) {
      const box = underpassAssembly(ROAD_CLASSES[c.cls].underpass!, 0);
      expect(c.lowered).toBeCloseTo(box.minHeight - c.h, 1);
      expect(c.approachLength).toBeGreaterThan(2 * c.lowered! / ROAD_CLASSES[c.cls].rampGradient - 1e-6);
      expect(c.drainage).toBe('pump');
    }
    const separated = evaluate(ctx, { ...design, crossingOverrides: [{ roadId: 3, type: 'overbridge' }] });
    expect(r.crossings[2].cost).toBeLessThan(separated.crossings.find(c => c.roadId === 3)!.cost);
    // Retained slope faces and auxiliary relocations are separately measured works in this bucket.
    const footprintWorks = r.footprintConflicts.filter(c => c.action !== 'culvert').reduce((sum, c) => sum + c.cost - (c.landCost ?? 0), 0);
    expect(r.cost.crossings).toBeCloseTo(r.crossings.reduce((sum, c) => sum + c.cost, 0) + footprintWorks, 0);
  });

  it('demolishes what is in the footprint or under a bridge deck, and nothing else', () => {
    expect(r.demolished.map((b) => b.j)).toEqual([0, 3]);
    expect(r.cost.landDetail.buildings).toBeCloseTo(buildings.cost[0] + buildings.cost[3], 3);
    expect(r.demolished[0].i).toBe(50);
  });

  it('bills infeasible dwellings separately, once each and never as footprint demolitions', () => {
    expect(r.boughtOut.map((b) => b.j)).toEqual([5]);
    expect(r.quantities.noiseBuyouts).toBe(1);
    expect(r.cost.landDetail.noiseBuyouts).toBeCloseTo(noiseBuyoutCost(buildings.cost[5], buildings.area[5]), 3);
    expect(r.cost.landDetail.noiseBuyouts - buildings.cost[5]).toBeGreaterThan(0);
    expect(r.demolished.some(b => b.j === 6)).toBe(false); // distant block retained, protected by wall
    expect(r.parts.noiseBuyouts.reduce((a, b) => a + b, 0)).toBeCloseTo(r.cost.landDetail.noiseBuyouts, 3);
  });

  it('walls off dwellings within the screening distance unless a cut screens them', () => {
    expect(r.walls.length).toBe(2);
    const w = r.walls[0], house = r.noise.receivers.find((p) => p.j === 1)!;
    expect(w.side).toBe('L');
    // Finite segments: the wall reaches as far along the road as the house needs, centred on it, and is
    // at least twice the house's distance from the wall long (Manual 2018 §1.11 h).
    expect(w.i0 <= house.i && w.i1 >= house.i).toBe(true);
    expect(w.s1 - w.s0).toBeGreaterThanOrEqual(2 * (house.d - r.noise.source!.L.wallOff[house.i]));
    expect(w.s1 - w.s0).toBeLessThan(400);
    // billed as drawn: on this straight road the wall line is as long as the stretch
    expect(r.quantities.wallLength).toBeCloseTo(r.walls.reduce((v, w) => v + w.s1 - w.s0, 0), 6);
    // The block beside the bridge is also protectable: its top receiver is below the deck. It still
    // needs an actual wall; the terrain under a bridge is not a shield.
    expect(r.walls.some(w => w.i0 <= 150 && w.i1 >= 150)).toBe(true);
    expect(r.boughtOut.some(b => b.j === 7)).toBe(false);
    expect(r.quantities.wallArea).toBeCloseTo(r.walls.reduce((v, w) => v + (w.s1 - w.s0) * w.height, 0), 6);
    expect(r.cost.noiseWalls).toBeCloseTo(r.quantities.wallArea * NOISE.wallPerM2, 3);
  });

  it('noise view: each dwelling\'s status and mitigated level agree with the bill; the band includes walls and cuts', () => {
    const st = new Map(r.noise.receivers.map((p) => [p.j, p]));
    expect([1, 2, 5, 6, 7].map((j) => st.get(j)?.status)).toEqual(['wall', 'cut', 'bought', 'wall', 'wall']);
    expect([0, 3, 4].some((j) => st.has(j))).toBe(false); // demolished / not a dwelling
    for (const p of r.noise.receivers) {
      if (p.status === 'bought') expect(p.mitigated).toBeGreaterThan(0);
      else expect(p.mitigated).toBeLessThanOrEqual(1e-9);
      if (p.status === 'wall') {
        expect(p.raw).toBeGreaterThan(0);
        expect(p.wall).toBeGreaterThanOrEqual(p.need);
        expect(r.walls.some((w) => w.side === p.side && p.i >= w.i0 && p.i <= w.i1 && w.height === p.wall)).toBe(true);
      }
    }
    // ground-floor excess at an axis distance, interpolated along a sampled station's profile
    const fp = noiseBand(r, (x, y) => terrain.heightAt(x, y), 9.5)!;
    const at = (i: number, side: 0 | 1, dist: number) => {
      const k = fp.stations.indexOf(i), K = fp.offsets.length, base = (2 * k + side) * K, a = fp.start[2 * k + side];
      for (let o = 1; o < K; o++) if (a + fp.offsets[o] >= dist) {
        const t = (dist - a - fp.offsets[o - 1]) / (fp.offsets[o] - fp.offsets[o - 1]);
        return fp.excess[base + o - 1] * (1 - t) + fp.excess[base + o] * t;
      }
      return NaN;
    };
    const flat = (d: number) => at(300, 0, d);
    expect(flat(40)).toBeGreaterThan(0);
    expect(at(300, 1, 40)).toBeCloseTo(flat(40), 1); // nearly symmetric on the plain, no wall near
    expect(r.walls[0].i0 <= 51 && r.walls[0].i1 >= 51).toBe(true);
    expect(at(51, 0, 40)).toBeLessThan(flat(40) - 3); // behind the wall
    expect(at(51, 1, 40)).toBeGreaterThan(at(51, 0, 40) + 3);
    expect(at(351, 0, 60)).toBeLessThan(flat(60) - 3); // beside the 12 m cut
  });

  it('built-up cells get the urban norm row, surcharge and land price', () => {
    const perM = (i: number, k: 'roadBase' | 'land' | 'surcharge') => r.parts[k][i] / r.ds;
    expect(r.cell.urban[210]).toBe(1);
    expect(r.cell.urban[100]).toBe(0);
    // same flat cross-section in both places
    expect(perM(210, 'roadBase') - perM(100, 'roadBase')).toBeCloseTo((67_852_000 - 56_912_000) / 1000, 3);
    expect(perM(210, 'land') / perM(100, 'land')).toBeCloseTo((URBAN_LAND.buildingLandPerM2 * URBAN_LAND.multiplier) / LAND.perM2, 6);
    expect(perM(210, 'surcharge') / perM(210, 'roadBase')).toBeGreaterThan(URBAN_RATES.otherObjectsSurcharge - 1e-9);
    expect(r.quantities.urbanLength).toBeCloseTo(400, -1);
  });

  it('per-station arrays sum to the bill, component by component, and ranges add up', () => {
    const sum = (k: (typeof PART_KEYS)[number]) => r.parts[k].reduce((a, v) => a + v, 0);
    const c = r.cost;
    expect(sum('roadBase')).toBeCloseTo(c.roadBase, 3);
    expect(sum('bridges')).toBeCloseTo(c.bridges, 3);
    expect(sum('crossings')).toBeCloseTo(c.crossings, 3);
    expect(sum('noiseWalls')).toBeCloseTo(c.noiseWalls, 3);
    expect(sum('surcharge')).toBeCloseTo(c.surcharge, 3);
    expect(sum('land') + sum('forest') + sum('buildings') + sum('noiseBuyouts')).toBeCloseTo(c.land, 3);
    for (const k of ['excavation', 'fillPlacing', 'haul', 'surplusHaul', 'unsuitable', 'borrow', 'topsoil'] as const) {
      expect(sum(k)).toBeCloseTo(c.earthDetail[k], 3);
    }
    let all = 0;
    for (const k of PART_KEYS) all += sum(k);
    expect(all).toBeCloseTo(c.total, 2);
    expect(c.total).toBeGreaterThan(0);
    // the bill agrees with the independently computed quantities
    expect(c.earthDetail.borrow).toBeCloseTo(r.quantities.deficit * 636, 0);
    const model = bridgeModel(CATEGORIES[design.category]);
    let bridgeCost = 0;
    for (const run of r.runs) if (run.kind === KIND.bridge) {
      bridgeCost += model.abutments;
      for (let i = run.i0; i <= run.i1; i++) bridgeCost += cellLength(i, r.n, r.ds) * model.perM(r.grade[i] - r.ground[i], bridgeLayout(run.length));
    }
    expect(c.bridges).toBeCloseTo(bridgeCost, 0);
    // two halves of the route
    const whole = rangeSummary(r), a = rangeSummary(r, 0, 2995), b = rangeSummary(r, 3000, r.length);
    expect(whole.cost.total).toBeCloseTo(c.total, 3);
    expect(a.cost.total + b.cost.total).toBeCloseTo(c.total, 2);
    expect(a.length + b.length).toBeCloseTo(r.length, 6);
    expect(a.quantities.cut + b.quantities.cut).toBeCloseTo(r.quantities.cut, 3);
    expect(whole.quantities.wallArea).toBeCloseTo(r.quantities.wallArea, 6);
    expect(a.quantities.wallArea + b.quantities.wallArea).toBeCloseTo(r.quantities.wallArea, 6);
    expect(a.quantities.noiseBuyouts + b.quantities.noiseBuyouts).toBe(r.quantities.noiseBuyouts);
    // Split through a wall (not just the empty middle of the route): clipped areas and bills agree.
    const left = rangeSummary(r, 0, 495), right = rangeSummary(r, 500, r.length);
    expect(left.quantities.wallArea).toBeGreaterThan(0);
    expect(right.quantities.wallArea).toBeGreaterThan(0);
    expect(left.quantities.wallArea + right.quantities.wallArea).toBeCloseTo(r.quantities.wallArea, 6);
    expect(left.cost.noiseWalls).toBeCloseTo(left.quantities.wallArea * NOISE.wallPerM2, 3);
    expect(right.cost.noiseWalls).toBeCloseTo(right.quantities.wallArea * NOISE.wallPerM2, 3);
    expect(a.quantities.crossings).toBe(3);
    expect(b.quantities.buildings).toBe(0);
  });
});

describe('cut-edge receivers', () => {
  it('does not switch off upper-floor exposure at a 4 m cut, but can protect low receivers', () => {
    for (const depth of [3.99, 4]) {
      const terrain = syntheticTerrain(500, 100, 5, x => 400 + depth * Math.max(0, Math.min(1, (300 - Math.abs(x - 1200)) / 100)));
      const info: BuildingInfo[] = [
        [100, 6, BUILDING_KIND.apartments, 1200, 282, 5, 5, 0],
        [100, 1, BUILDING_KIND.house, 1200, 300, 5, 5, 0],
      ];
      const buildings = new BuildingIndex(info.map(f => [f[3], f[4], 8]), info);
      const r = evaluate({ terrain, buildings, scenario: D11_SCENARIO, a: { x: 200, y: 250 }, b: { x: 2200, y: 250 } }, {
        category: 'S9.5', speed: 90, pis: [], profileMode: 'manual',
        vpis: [{ s: 0, z: 400, r: null }, { s: 2000, z: 400, r: null }],
      });
      expect(r.demolished).toEqual([]);
      expect(r.boughtOut.map(b => b.j)).toEqual([0]);
      expect(r.cell.wall[100]).toBe(0); // earth edge suffices for the retained low house
    }
  });
});

describe('structures and the play-area boundary', () => {
  it('a bridge is not out of bounds because the embankment it replaces would have been', () => {
    // 150 m wide strip of terrain with a 50 m deep valley across it; the route runs down the middle
    const ter = syntheticTerrain(400, 30, 5, (x) => 400 - 50 * Math.max(0, Math.min(1, (300 - Math.abs(x - 1000)) / 100)));
    const r2 = evaluate({ terrain: ter, scenario: D11_SCENARIO, a: { x: 100, y: 75 }, b: { x: 1900, y: 75 } }, {
      category: 'S9.5', speed: 90, pis: [], profileMode: 'manual', vpis: [{ s: 0, z: 400, r: null }, { s: 1800, z: 400, r: null }],
    });
    // 50 m of fill would spread 4.75 + 78.75 m to each side — beyond the terrain — so it must be a bridge
    expect(r2.kind[90]).toBe(KIND.bridge);
    expect(r2.dayL[90]).toBeGreaterThan(75);
    expect(r2.violations.filter((v) => v.kind === 'oob')).toEqual([]);
  });
});

describe('motorway crossings', () => {
  // flat plain, a motorway across the route at x = 1200
  const ter = syntheticTerrain(500, 100, 5, () => 400);
  const roads = new RoadNet({ cls: ['motorway'], ways: [[0, 1200, 0, 1200, 500]] });
  const mctx = { terrain: ter, scenario: D11_SCENARIO, a: { x: 200, y: 250 }, b: { x: 2200, y: 250 }, roads };
  const manual = (z: number): Design => ({
    category: 'S9.5', speed: 90, pis: [], profileMode: 'manual',
    vpis: [{ s: 0, z: 400, r: null }, { s: 1000, z, r: null }, { s: 2000, z: 400, r: null }],
  });
  const crossingViolations = (r: ReturnType<typeof evaluate>) => r.violations.filter((v) => v.kind === 'crossing');

  it('cannot be crossed at grade: neither a lump sum nor a valid design', () => {
    const r = evaluate(mctx, manual(400));
    expect(r.crossings.map((c) => [c.type, c.cost])).toEqual([['atGrade', 0]]);
    expect(crossingViolations(r).length).toBe(1);
    expect(r.valid).toBe(false);
  });

  it('checks crossings inside the ordinary-road billing margin, exempting only the actual endpoint', () => {
    for (const cls of ['motorway', 'trunk']) for (const x of [300, 2100]) {
      const roads = new RoadNet({ cls: [cls], ways: [[0, x, 0, x, 500]] });
      const ctx = { ...mctx, roads };
      const r = evaluate(ctx, manual(400));
      expect(r.crossings).toHaveLength(1); // motorway structures cannot disappear into the tie-in bill
      expect(crossingViolations(r)).toHaveLength(1);
      expect(r.valid).toBe(false);
      expect(evaluate(ctx, { ...manual(400), profileMode: 'auto' }).valid).toBe(false); // too close to climb 7.5 m
    }
    const roads = new RoadNet({ cls: ['motorway'], ways: [[0, 200, 0, 200, 500], [0, 2200, 0, 2200, 500]] });
    expect(crossingViolations(evaluate({ ...mctx, roads }, manual(400)))).toEqual([]);
    // Joining B's carriageway never exempts the other carriageway 20 m before it.
    const dual = new RoadNet({ cls: ['motorway'], ways: [[0, 2180, 0, 2180, 500], [0, 2200, 0, 2200, 500]] });
    expect(crossingViolations(evaluate({ ...mctx, roads: dual }, manual(400)))).toHaveLength(1);
  });

  it('bills a motorway overbridge inside the ordinary-road tie-in margin', () => {
    const terrain = syntheticTerrain(500, 100, 5,
      x => 400 + 8 * Math.max(0, Math.min(1, (100 - Math.abs(x - 300)) / 50)));
    const roads = new RoadNet({ cls: ['motorway'], ways: [[0, 300, 0, 300, 500]] });
    const r = evaluate({ ...mctx, terrain, roads }, manual(400));
    expect(r.valid).toBe(true);
    expect(r.crossings).toHaveLength(1);
    expect(r.crossings[0].type).toBe('overbridge');
    expect(r.crossings[0].cost).toBeGreaterThan(0);
    expect(r.cost.crossings).toBeCloseTo(r.crossings[0].cost, 3);
    expect(r.parts.crossings.reduce((sum, cost) => sum + cost, 0)).toBeCloseTo(r.cost.crossings, 3);
  });

  it('checks and auto-clears both carriageways even when only one is billed', () => {
    const terrain = syntheticTerrain(500, 100, 5, x => 400 + 4 * Math.max(0, 1 - Math.abs(x - 1220) / 10));
    for (const cls of ['motorway', 'trunk']) {
      const roads = new RoadNet({ cls: [cls], ways: [[0, 1200, 0, 1200, 500], [0, 1220, 0, 1220, 500]] });
      const ctx = { ...mctx, terrain, roads };
      const r = evaluate(ctx, manual(410));
      expect(r.crossings).toHaveLength(1);
      expect(r.crossings[0].h).toBeGreaterThan(STRUCTURE_RULES.railClearance);
      expect(crossingViolations(r).map(v => Math.round(v.s0))).toEqual([1020]);
      expect(r.valid).toBe(false);
      const auto = evaluate(ctx, { ...manual(400), profileMode: 'auto' });
      expect(auto.valid).toBe(true);
      for (const s of [1000, 1020]) {
        const z = elevations(buildProfile(auto.vpis, 6000, 3400), [s])[0];
        expect(z - terrain.heightAt(s + 200, 250)).toBeGreaterThanOrEqual(STRUCTURE_RULES.railClearance - 1e-6);
      }
    }
  });

  it('checks motorways at their own profile station even when a river is crossed later', () => {
    const terrain = syntheticTerrain(500, 100, 5, () => 400);
    for (let row = 0; row < terrain.ny; row++) terrain.lc[row * terrain.nx + 360] |= RIVER_CROSSING_BIT;
    const r = evaluate({ ...mctx, terrain }, { ...manual(400), vpis: [
      { s: 0, z: 400, r: null }, { s: 1000, z: 400, r: null },
      { s: 1500, z: 420, r: null }, { s: 2000, z: 400, r: null },
    ] });
    // The river at s = 1600 is cleared; extrapolating its descending segment back to the motorway
    // would falsely give 440 m there. Its actual grade is only about 401 m.
    expect(crossingViolations(r).map(v => Math.round(v.s0))).toEqual([1000]);
    expect(r.valid).toBe(false);
  });

  it('may pass under an overbridge in a deep enough cut', () => {
    const r = evaluate(mctx, manual(392));
    expect(r.crossings[0].type).toBe('overbridge');
    expect(r.crossings[0].cost).toBeGreaterThan(0);
    expect(crossingViolations(r)).toEqual([]);
  });

  it('the auto-profile clears it with a bridge like a railway', () => {
    const r = evaluate(mctx, { ...manual(400), profileMode: 'auto' });
    expect(r.crossings[0].type).toBe('bridge');
    expect(r.crossings[0].h).toBeGreaterThanOrEqual(STRUCTURE_RULES.railClearance - 1e-6);
    expect(r.valid).toBe(true);
  });
});

describe('structure choice', () => {
  it('prices a bridge at the rates of its own deck strip, not of the embankment it replaces', () => {
    // 23 m deep valley; built-up land on both sides of a 20 m wide open strip along the route: the
    // embankment (≈ 100 m wide) would take mostly building land, the 9.5 m deck none
    const ter = syntheticTerrain(600, 80, 5, (x) => 400 - 23 * Math.max(0, Math.min(1, (400 - Math.abs(x - 1500)) / 100)));
    for (let r = 0; r < ter.ny; r++) {
      const y = ter.height - (r + 0.5) * ter.cell;
      if (Math.abs(y - 200) > 10) for (let c = 0; c < ter.nx; c++) ter.lc[r * ter.nx + c] |= BUILTUP_BIT;
    }
    const r2 = evaluate({ terrain: ter, scenario: D11_SCENARIO, a: { x: 100, y: 200 }, b: { x: 2900, y: 200 } }, {
      category: 'S9.5', speed: 90, pis: [], profileMode: 'manual', vpis: [{ s: 0, z: 400, r: null }, { s: 2800, z: 400, r: null }],
    });
    // on the valley side, 10 m of fill: an embankment whose slopes reach into the building land
    expect(r2.kind[104]).toBe(KIND.earth);
    expect(r2.cell.urban[104]).toBeGreaterThan(0.4);
    expect(r2.kind[140]).toBe(KIND.bridge);
    expect(r2.cell.urban[140]).toBe(0);
    expect(r2.parts.land[140]).toBeCloseTo(r2.ds * 9.5 * LAND.perM2, 6);
  });
});

describe('auto-profile mass-balance search', () => {
  it('finds the material value at which the grade line balances', () => {
    const s = Float64Array.from({ length: 401 }, (_, i) => i * 10);
    const g = Float64Array.from(s, (v) => 300 + 0.02 * v + 3 * Math.sin(v / 300));
    // the cheapest grade sits (300 − v) / 50 m above the ground; the balance is measured on the
    // returned grade line: minus its mean height above the ground (per metre of route)
    const balanceOf = (vpis: VPI[]) => {
      const z = elevations(buildProfile(vpis, 6000, 3400), s);
      let sum = 0;
      for (let i = 0; i < s.length; i++) sum += z[i] - g[i];
      return (-1e5 * sum) / s.length;
    };
    const balance = { costFor: (v: number) => (h: number) => 1e4 * (h - (300 - v) / 50) ** 2, balanceOf, start: 200, lo: -150, hi: 600, tolerance: 2e4 };
    const opt = { maxGradient: 0.06, minCrest: 6000, minSag: 3400, costPerM: balance.costFor(200) };
    const fixed = autoProfile(s, g, opt), r = autoProfile(s, g, { ...opt, balance });
    expect(r.feasible).toBe(true);
    // at the start value the line sits ≈ 2 m above the ground; the search brings it down to it
    expect(Math.abs(balanceOf(fixed.vpis))).toBeGreaterThan(1.5e5);
    expect(Math.abs(balanceOf(r.vpis))).toBeLessThan(4e4);
    expect(Math.abs(r.materialValue! - 300)).toBeLessThan(30);
  });
});
