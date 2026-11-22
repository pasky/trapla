// Slip roads of a hand-built interchange (core/slip-roads.ts): where a slip road meets a carriageway, its
// speed-change lane, and a whole diamond the owner asked to build by hand (D3 0304 at km 4.49, road II/114 under
// the motorway's bridge: four slip roads, saved from the game; the exit and the entry on each side share a
// junction), valid and priced; one at D3 0303 km 3.06, where the motorway moves aside tracks a slip road crosses; and one
// on the four-lane class I road S 21.5 of the I/35 Turnov stage (km 0.98, road II/610 over it), on that road's own lanes.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dugRidge, gore, goreMarks, laneLengths, MERGE_GAP, MERGE_REACH, MERGE_SLOPE, MERGE_TOLERANCE, mergeBands, SLIP_ROAD, SLIP_SECTIONS, speedChangeLane } from '../src/core/slip-roads';
import { PAIRED_SECTIONS } from '../src/core/data/motorway';
import { railOverPrice } from '../src/core/rail-over';
import { squareBend } from '../src/ui/road-edit';
import { CATEGORIES } from '../src/core/data/categories';
import { ENDPOINT_JUNCTIONS } from '../src/core/data/urban';
import { ROUNDABOUT_RING } from '../src/core/tie-in';
import type { Result } from '../src/core/evaluate';
import type { ProjectDesign } from '../src/core/project';
import { evaluateProject } from '../src/core/project-evaluate';

/** a straight motorway line along +x, 2 km, stations every 10 m; `bridge`: stations on a bridge */
const line = (bridge: [number, number] = [0, -1]) => {
  const n = 201, ds = 10, s = Array.from({ length: n }, (_, i) => i * ds);
  return { n, ds, length: (n - 1) * ds, s, x: s.slice(), y: s.map(() => 0), tx: s.map(() => 1), ty: s.map(() => 0), grade: s.map(() => 300),
    kind: s.map(v => v >= bridge[0] && v <= bridge[1] ? 1 : 0) } as unknown as Result;
};

const D = SLIP_SECTIONS['D27.5'], D130 = { category: 'D27.5' as const, speed: 130 };
describe('a slip road meets one carriageway', () => {
  it('its gore lies on the side of its traffic, the lane before it (an exit) or after it (an entry)', () => {
    const l = line();
    // forward (+x) traffic keeps right: the gore is at y < 0; the other direction's at y > 0
    expect(gore(l, 1000, 1, 'D27.5')).toMatchObject({ x: 1000, z: 300, travel: { x: 1, y: 0 } });
    expect(gore(l, 1000, 1, 'D27.5').y).toBeCloseTo(-D.goreOffset);
    expect(gore(l, 1000, -1, 'D27.5').y).toBeCloseTo(D.goreOffset);
    const at = { s0: 0, s1: 100 };
    expect(speedChangeLane(l, 1000, 1, 'exit', 50, 'hilly', at, D130)).toMatchObject({ s0: 1000 - 234, s1: 1000, violations: [] });
    expect(speedChangeLane(l, 1000, 1, 'entry', 50, 'hilly', at, D130)).toMatchObject({ s0: 1000, s1: 1000 + 295 });
    expect(speedChangeLane(l, 1000, -1, 'exit', 50, 'hilly', at, D130)).toMatchObject({ s0: 1000, s1: 1000 + 234 });
    // paved 0.5 m wider along it, the taper at half
    const exit = speedChangeLane(l, 1000, 1, 'exit', 50, 'hilly', at, D130);
    expect(exit.area.ground).toBeCloseTo(D.widening * (234 - 100 / 2), 0);
    expect(exit.lines[0].every(p => p.y < 0)).toBe(true);
  });
  it('a lane past the motorway\'s end, or into a tunnel, is a problem; on a bridge it is priced as bridge', () => {
    const l = line([1100, 1200]);
    expect(speedChangeLane(l, 100, 1, 'exit', 50, 'hilly', { s0: 0, s1: 100 }, D130).violations.map(v => v.fix)).toEqual(['Move this end at least 140 m further along the motorway']);
    const over = speedChangeLane(l, 1000, 1, 'entry', 50, 'hilly', { s0: 0, s1: 100 }, D130);
    expect(over.area.bridge).toBeGreaterThan(40);
    const tunnel = line([1100, 1200]); for (let i = 110; i <= 120; i++) (tunnel.kind as unknown as number[])[i] = 2;
    expect(speedChangeLane(tunnel, 1000, 1, 'entry', 50, 'hilly', { s0: 0, s1: 100 }, D130).violations.map(v => v.title)).toEqual(['Its entry lane runs into a tunnel']);
  });
  it('a lane under a railway carried over our cutting makes its bridge that much longer, billed with the lane', () => {
    // (I/35 Turnov km 0.47: the bridge spans the cutting the lane widens; at 60° to our road, 1 / sin 60° longer per metre)
    const l = line(), sine = Math.sin(Math.PI / 3), price = railOverPrice(30, sine, 1);
    Object.assign(l, { railCrossings: [{ s: 900, i: 90, x: 900, y: 0, tx: 0.5, ty: sine, g: 310, above: -8, how: 'railway', auto: true, price, tracks: 1, sine, cost: price.cost }] });
    const plain = speedChangeLane(line(), 1000, 1, 'exit', 50, 'hilly', { s0: 0, s1: 100 }, D130), exit = speedChangeLane(l, 1000, 1, 'exit', 50, 'hilly', { s0: 0, s1: 100 }, D130);
    const extra = exit.widen.find(w => w.k === 90)!.extra, longer = railOverPrice(30 + extra, sine, 1);
    expect(extra).toBeCloseTo(D.widening, 9);
    expect(exit.rail).toEqual([{ s: 900, extra, span: longer.span - price.span, cost: longer.cost - price.cost }]);
    expect(exit.rail[0].span).toBeCloseTo(D.widening / sine, 9);
    expect(exit.cost).toBeCloseTo(plain.cost + longer.cost - price.cost, 6);
    // (a railway our road passes over, or not under its lane: nothing)
    Object.assign(l, { railCrossings: [{ ...(l as unknown as { railCrossings: object[] }).railCrossings[0], how: 'ours', cost: 0 }] });
    expect(speedChangeLane(l, 1000, 1, 'exit', 50, 'hilly', { s0: 0, s1: 100 }, D130).rail).toEqual([]);
  });
});

describe('a speed-change lane is marked as TP 133 draws it (owner: a solid line where the exit lane begins)', () => {
  it('its dashed line runs along the whole lane, taper too, but the last (first) 30 m by the gore; its outer edge bends out', () => {
    const l = line(), at = { s0: 0, s1: 100 };
    const exit = speedChangeLane(l, 1000, 1, 'exit', 50, 'hilly', at, D130), entry = speedChangeLane(l, 1000, 1, 'entry', 50, 'hilly', at, D130);
    // (between the carriageway's stations, 10 m apart here)
    const xs = (p: { x: number }[]) => p.map(q => q.x);
    expect(Math.min(...xs(exit.lines[0]))).toBeCloseTo(1000 - 234);
    expect(Math.max(...xs(exit.lines[0]))).toBeCloseTo(1000 - SLIP_ROAD.marking.solid);
    expect(Math.min(...xs(entry.lines[0]))).toBeCloseTo(1000 + SLIP_ROAD.marking.solid);
    expect(Math.max(...xs(entry.lines[0]))).toBeCloseTo(1000 + 295);
    // the outer edge starts on the carriageway's edge line and is the lane's edge (3.75 m out) where it is full width
    expect(-exit.lines[1][0].y).toBeCloseTo(D.through + SLIP_ROAD.marking.width / 2);
    expect(-exit.lines[1].at(-1)!.y).toBeCloseTo(D.through + SLIP_ROAD.marking.width / 2 + 3.75);
  });
  it('its gore is hatched with chevrons between the two edge lines, out to where the pavements part', () => {
    // an exit leaving the forward carriageway along +x, diverging 1 m in 20 from its gore
    const l = line(), n = 31, ramp = { n, ds: 10, x: Array.from({ length: n }, (_, k) => 1000 + 10 * k), y: Array.from({ length: n }, (_, k) => -(D.goreOffset + k / 2)) } as unknown as Result;
    const marks = goreMarks(ramp, 'a', l, 1, 'D27.5');
    expect(marks.length).toBeGreaterThan(10);
    const inner = D.through + SLIP_ROAD.marking.width;
    for (const [a, apex, b] of marks) {
      // apex upstream, arms 45° forward, ending on the carriageway's edge line and on the slip road's
      expect(a.x).toBeGreaterThan(apex.x); expect(b.x).toBeGreaterThan(apex.x);
      expect(-a.y).toBeCloseTo(inner + SLIP_ROAD.hatch.width / 2);
      expect(-b.y).toBeGreaterThan(-apex.y);
      expect(a.x - apex.x).toBeCloseTo(-apex.y - inner, 0);
    }
    // (where the slip road's edge line is well past the carriageway's paved shoulder: no more hatching)
    const last = marks.at(-1)![2];
    expect(-last.y).toBeLessThan(D.paved + 3.125 - 2 + 0.5);
  });
});

describe('a slip road on a four-lane road (S 21.5) meets it at its own cross-section, speed and price', () => {
  it('its lane takes the paved shoulder\'s place; its lengths follow the road\'s design speed', () => {
    const l = line(), d = PAIRED_SECTIONS['S21.5'], through = d.median / 2 + d.innerPavedShoulder + d.innerLane + d.outerLane;
    // the gore on the speed-change lane's middle, beside the 3.50 + 3.25 m lanes
    expect(gore(l, 1000, 1, 'S21.5').y).toBeCloseTo(-(through + 0.25 + 1.75));
    const exit = speedChangeLane(l, 1000, 1, 'exit', 50, 'hilly', { s0: 0, s1: 100 }, { category: 'S21.5', speed: 110 });
    // where full width, the carriageway is paved out to the lane's own 0.25 m shoulder: its 1.5 m paved shoulder is gone
    const outer = Math.max(...exit.lines[2].map(p => -p.y + p.halfWidth!));
    expect(outer).toBeCloseTo(through + 0.25 + 3.5 + 0.25);
    expect(exit.widen.every(w => w.extra <= outer - (through + d.outerPavedShoulder) + 1e-9)).toBe(true);
    // billed per m² of the road's own SPK row (D 21.5), the taper at half
    const per = CATEGORIES['S21.5'];
    expect(exit.cost / exit.area.ground).toBeCloseTo(per.normPerKm.hilly / 1000 / per.crownWidth);
    expect(exit.area.ground).toBeCloseTo(SLIP_SECTIONS['S21.5'].widening * (exit.length - laneLengths(110).exit.taper / 2), 0);
    // slower roads need shorter lanes (ČSN 73 6102); a D 27.5 at 120–130 keeps the D35 design's 234 / 295 m
    const at = (v: number, k: 'exit' | 'entry') => laneLengths(v)[k].length[50];
    expect(at(90, 'exit')).toBeLessThan(at(100, 'exit')); expect(at(100, 'exit')).toBeLessThan(at(110, 'exit'));
    expect([at(90, 'entry'), at(100, 'entry'), at(110, 'entry')]).toEqual([230, 255, 295]);
    expect([at(130, 'exit'), at(120, 'exit'), at(130, 'entry')]).toEqual([234, 234, 295]);
    expect(exit.length).toBe(at(110, 'exit'));
    // at a bend slowed to 90 km/h, its row there
    const slowed = { category: 'S21.5' as const, speed: 110, stretches: [{ s0: 0, s1: 900, speed: 110 }, { s0: 900, s1: 2000, speed: 90 }] };
    expect(speedChangeLane(l, 1000, 1, 'exit', 50, 'hilly', { s0: 0, s1: 100 }, slowed).length).toBe(at(90, 'exit'));
  });
});

describe('a slip road meets the motorway level and the road square', () => {
  it('beside the motorway it is held within a low slope\'s fall of its height, then let go', () => {
    // a slip road leaving a level motorway along +x (its line 13.5 m off) and diverging 1 m in 10
    const l = line(), xy: number[] = [];
    for (let k = 0; k <= 40; k++) xy.push(1000 + 10 * k, -(D.goreOffset + k));
    const bands = mergeBands(xy, 'a', l, 'D27.5'), edges = CATEGORIES['D27.5'].crownWidth / 2 + CATEGORIES['V7.25'].crownWidth / 2;
    expect(bands[0]).toMatchObject({ s: 0, min: 300 - MERGE_TOLERANCE, max: 300 + MERGE_TOLERANCE });
    for (const b of bands) {
      const gap = D.goreOffset + b.s / Math.hypot(10, 1) - edges;
      expect(b.max - 300).toBeCloseTo(MERGE_TOLERANCE + Math.max(0, gap - MERGE_GAP) / MERGE_SLOPE, 1);
    }
    expect(D.goreOffset + bands.at(-1)!.s / Math.hypot(10, 1) - edges).toBeLessThanOrEqual(MERGE_REACH + 1);
  });
  it('Build → Slip road bends it to meet a crossing road square, kept clear of the motorway where the road is askew', () => {
    const g = { x: 0, y: -13.5, travel: { x: 1, y: 0 } }, first = { x: 150, y: -21.5 };
    // a road crossing at right angles 450 m on: the last leg runs along the motorway, square to the road
    const square = squareBend({ x: 450, y: -130 }, { x: 0, y: 1 }, first, g)!;
    expect(square.y).toBeCloseTo(-130);
    expect(square.x).toBeLessThan(450 - 40);
    // askew, the road's normal leading back to the motorway: the bend stays at least halfway out to the end
    const askew = squareBend({ x: 450, y: -130 }, { x: 1, y: 2 }, first, g);
    if (askew) expect(-askew.y).toBeGreaterThanOrEqual((21.5 + 130) / 2 - 1e-9);
    // a road running towards the gore: no square approach
    expect(squareBend({ x: 450, y: -130 }, { x: -300, y: 108.5 }, first, g)).toBeNull();
  });
  it('a ridge too narrow to keep between two cuttings is dug out to one slope', () => {
    const m = { z: 300, zDay: 308, day: 13.75 + 14, w: 13.75 }, r = { z: 300, zDay: 308, day: 3.625 + 14, w: 3.625 };
    // 30 m apart: their tops 30 − 17.6 − 27.75 < 10 m apart
    expect(dugRidge(m, r, 30)).toMatchObject({ x0: 13.75, x1: 30 - 3.625, z: 300 });
    expect(dugRidge(m, r, 60)).toBeNull();
    expect(dugRidge({ ...m, zDay: 296 }, r, 30)).toBeNull();
  });
});

const PACK = 'public/scenarios/d3-0304';
describe.skipIf(!['meta.json', 'transport.json.gz', 'overlays.json', 'height.i16.gz'].every(f => existsSync(`${PACK}/${f}`)))('a diamond built by hand', async () => {
  const { projectContext } = await import('../scripts/eval-project');
  const design = JSON.parse(readFileSync('tests/fixtures/interchange/d3-0304-diamond.json', 'utf8')) as ProjectDesign;
  const run = (d: ProjectDesign) => evaluateProject(projectContext(d).ctx, { epoch: 'e', revision: 1, design: d });
  it('is valid and priced: four slip roads with their lanes, the motorway\'s own bill unchanged', () => {
    const r = run(design), slips = design.routes.filter(q => q.name.startsWith('Slip road'));
    expect(slips).toHaveLength(4);
    expect(r.issues.map(i => i.violation.title)).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.cost.total).not.toBeNull();
    const alone = run({ ...design, routes: design.routes.filter(q => !slips.includes(q)) });
    expect(r.routes['route:motorway-forward'].legacy!.cost.total).toBe(alone.routes['route:motorway-forward'].legacy!.cost.total);
    // each slip road: one lane on the motorway (two exits, two entries), the allowance once for the interchange
    const lanes = r.works.items.filter(w => w.id.includes(':lane:'));
    expect(lanes.map(w => w.label!.split(' ')[0]).sort()).toEqual(['Entry', 'Entry', 'Exit', 'Exit']);
    const allowance = r.works.items.filter(w => w.label?.startsWith('Already in the motorway')).reduce((t, w) => t + w.cost, 0);
    expect(allowance).toBeCloseTo(-SLIP_ROAD.allowance.perInterchange, -3);
    // on each side the exit and the entry meet road II/114 at one crossroads, built and billed once
    const shared = r.works.items.filter(w => w.label?.startsWith('Shares its junction with'));
    expect(shared.map(w => w.cost)).toEqual([-ENDPOINT_JUNCTIONS['tie-in'].cost, -ENDPOINT_JUNCTIONS['tie-in'].cost]);
    // the interchange costs what its slip roads and lanes cost, less that allowance
    expect(r.cost.total! - alone.cost.total!).toBeGreaterThan(100e6);
    expect(r.cost.total! - alone.cost.total!).toBeLessThan(400e6);
  }, 120_000);
  it('a shared junction has one form: a T and a roundabout there are a problem, two roundabouts one ring (review)', () => {
    const d = structuredClone(design), exit = d.routes.find(q => q.name === 'Slip road')!, entry = d.routes.find(q => q.name === 'Slip road 2')!;
    if (exit.alignment.kind !== 'pi' || entry.alignment.kind !== 'pi') throw new Error('bends expected');
    entry.alignment.controls.junctionForms = { a: 'roundabout' };
    expect(run(d).routes[entry.id].legacy!.violations.map(v => v.title)).toContain('Shares its junction with Slip road, but not its form');
    exit.alignment.controls.junctionForms = { b: 'roundabout' };
    const r = run(d), rings = r.works.items.filter(w => w.label?.startsWith('Roundabout\'s ring') && [exit.id, entry.id].includes(w.owner.id));
    expect(r.issues.map(i => i.violation.title)).toEqual([]);
    expect(rings.map(w => w.owner.id)).toEqual([exit.id]);
  }, 120_000);
  it('a slip road with both ends on the motorway is a problem and earns no credit (review: it was credited twice)', () => {
    const d = structuredClone(design), first = d.routes.find(q => q.name === 'Slip road')!;
    const line = run({ ...d, routes: d.routes.slice(0, 2) }).routes['route:motorway-forward'].legacy!, k = Math.round(4160 / line.ds);
    const g = gore(line, line.s[k], 1, 'D27.5');
    first.endpoints.b = { position: { x: g.x, y: g.y, z: g.z }, anchor: { kind: 'route', routeId: 'route:motorway-forward', s: g.s }, binding: 'resolved' };
    if (first.alignment.kind === 'pi') first.alignment.pis = [];
    const r = run(d);
    expect(r.routes[first.id].legacy!.violations.map(v => v.title)).toContain('It leaves and joins the motorway');
    expect(r.works.items.filter(w => w.owner.id === first.id && w.cost < 0)).toEqual([]);
    expect(r.cost.alone[first.id]).toBeGreaterThan(0);
  }, 120_000);
});

describe.skipIf(!['meta.json', 'transport.json.gz', 'overlays.json', 'height.i16.gz'].every(f => existsSync(`public/scenarios/d3-0303/${f}`)))('a diamond where the motorway moves tracks aside', async () => {
  const { projectContext } = await import('../scripts/eval-project');
  const design = JSON.parse(readFileSync('tests/fixtures/interchange/d3-0303-diamond.json', 'utf8')) as ProjectDesign;
  it('D3 0303 km 3.06, road II/105: valid and priced; a slip road crossing tracks the motorway moves aside is built against them as moved', () => {
    const r = evaluateProject(projectContext(design).ctx, { epoch: 'e', revision: 1, design });
    expect(r.issues.map(i => i.violation.title)).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.cost.total).not.toBeNull();
    // (the motorway moves aside tracks the north-east slip road crosses: it does not cross their old line)
    const motorway = r.routes['route:motorway-forward'].legacy!, moved = new Set(motorway.footprintConflicts.filter(f => f.action === 'relocation' && f.feature === 'road').map(f => f.roadId));
    const slip = r.routes[design.routes.find(q => q.name === 'Slip road 3')!.id].legacy!;
    expect(slip.crossings.filter(c => moved.has(c.roadId) && Math.hypot(c.x - 3603, c.y - 7754) < 30)).toEqual([]);
  }, 120_000);
});

describe('a slip road is drawn with its own markings', () => {
  it('its cross-section has a shader slot of its own, not the railway or motorway ones', async () => {
    const { CATEGORIES } = await import('../src/core/data/categories');
    const { ROAD_SECTIONS, RAIL_SECTION, RAIL2_SECTION, CARRIAGEWAY_SECTION, PAIRED_SECTION } = await import('../src/render/terrainMaterial');
    const sections = Object.values(CATEGORIES).filter(c => c.section).length;
    expect(sections).toBeLessThan(Math.min(RAIL_SECTION, RAIL2_SECTION, CARRIAGEWAY_SECTION, PAIRED_SECTION));
    expect(ROAD_SECTIONS).toBe(PAIRED_SECTION + 1);
  });
});

describe.skipIf(!['meta.json', 'transport.json.gz', 'overlays.json', 'height.i16.gz'].every(f => existsSync(`public/scenarios/i35-turnov/${f}`)))('a diamond on a four-lane road', async () => {
  const { projectContext } = await import('../scripts/eval-project');
  const design = JSON.parse(readFileSync('tests/fixtures/interchange/i35-turnov-diamond.json', 'utf8')) as ProjectDesign;
  const run = (d: ProjectDesign) => evaluateProject(projectContext(d).ctx, { epoch: 'e', revision: 1, design: d });
  // (since cost model 65 the house at the south-west crossroads, one corner 0.2 m inside its sight field to the left, is
  // bought out, as its problem's fix says: buildingOverrides)
  it('I/35 Turnov km 0.98, road II/610 (built in the game): valid and priced on the S 21.5\'s own lanes, its bill unchanged', () => {
    const r = run(design), slips = design.routes.filter(q => q.name.startsWith('Slip road'));
    expect(slips).toHaveLength(4);
    expect(r.issues.map(i => i.violation.title)).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.cost.total).not.toBeNull();
    const alone = run({ ...design, routes: design.routes.filter(q => !slips.includes(q)) });
    expect(r.routes['route:motorway-forward'].legacy!.cost.total).toBe(alone.routes['route:motorway-forward'].legacy!.cost.total);
    // its lanes at 110 km/h, 2.5 m wider than its paved shoulder; the D 21.5 row's earth-built slip roads credited once
    const lanes = r.works.items.filter(w => w.id.includes(':lane:')).map(w => w.label!);
    // (the west gores' lanes run under the railway at km 0.47, carried over our cutting on its new bridge: that bridge
    // spans the cutting the lanes widen, billed with them, as long as the cutting is then wide)
    expect(lanes.sort()).toEqual(['Entry lane on the four-lane road, 295 m (its hard shoulder, paved 2.5 m wider)',
      'Entry lane on the four-lane road, 295 m (its hard shoulder, paved 2.5 m wider; the railway\'s bridge over it 3 m longer)',
      'Exit lane on the four-lane road, 198 m (its hard shoulder, paved 2.5 m wider)',
      'Exit lane on the four-lane road, 198 m (its hard shoulder, paved 2.5 m wider; the railway\'s bridge over it 1 m longer)']);
    const rail = r.routes['route:motorway-forward'].legacy!.railCrossings!.find(c => c.how === 'railway')!, line = r.routes['route:motorway-forward'].legacy!;
    // (what it spans is our cutting's width between its walls: where render/crossings.ts stands the deck's ends)
    expect(rail.price!.span * Math.max(0.3, Math.abs(rail.sine))).toBeCloseTo(line.dayL[rail.i] + line.dayR[rail.i], 6);
    const allowance = r.works.items.filter(w => w.label?.startsWith('Already in the four-lane road\'s price')).reduce((t, w) => t + w.cost, 0);
    // (a 5.7 km stage: its price includes 5.7 / 7 of one interchange)
    const km = r.routes['route:motorway-forward'].legacy!.length / 1000;
    expect(allowance).toBeCloseTo(-Math.min(1, km * SLIP_ROAD.allowance.perKm) * SLIP_ROAD.allowance.perInterchange, -3);
    expect(r.cost.total! - alone.cost.total!).toBeGreaterThan(100e6);
  }, 120_000);
  it('two arms of one crossroads dig its sight field once: each cell billed and drawn by one of them (review: billed twice)', () => {
    // (the south-east crossroads' dig is Slip road 4's: a second arm built on its very line digs the same field)
    const d = structuredClone(design), four = d.routes.find(q => q.name === 'Slip road 4')!;
    const twin = { ...structuredClone(four), id: 'route:twin', name: 'Slip road 5' };
    d.routes.push(twin);
    const r = run(d), digs = r.works.items.filter(w => w.dug && [four.id, twin.id].includes(w.owner.id));
    // (each digs it on its own: the twin in the fixture's place)
    expect(run({ ...design, routes: design.routes.map(q => q.id === four.id ? twin : q) }).works.items.some(w => w.dug && w.owner.id === twin.id)).toBe(true);
    expect(digs.map(w => w.owner.id)).toEqual([four.id]);
    const cells = digs.flatMap(w => w.dug!.cells.map(c => `${c.x},${c.y}`));
    expect(new Set(cells).size).toBe(cells.length);
  }, 120_000);
});

describe.skipIf(!['meta.json', 'transport.json.gz', 'overlays.json', 'height.i16.gz'].every(f => existsSync(`public/scenarios/i35-turnov/${f}`)))('slip roads where our road leads a road it cuts elsewhere', async () => {
  const { projectContext } = await import('../scripts/eval-project');
  const { crossingChange } = await import('../src/core/road-realignment');
  const design = JSON.parse(readFileSync('tests/fixtures/interchange/i35-nudvojovicka-diamond.json', 'utf8')) as ProjectDesign;
  const { ctx, pack } = projectContext(design);
  const run = (d: ProjectDesign) => evaluateProject(ctx, { epoch: 'e', revision: 1, design: d });
  it('I/35 km 1.67, Nudvojovická (built in the game): valid and priced; its exit crosses the local road our road cuts on our road\'s new link of it', () => {
    const r = run(design);
    // (it was "two roads change the same old road": the exit crossed the local road's old line where our road takes it out)
    expect(r.issues.map(i => i.violation.title)).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.cost.total).not.toBeNull();
    const roads = pack.roads!, ours = r.routes['route:motorway-forward'].legacy!, led = ours.crossings.find(c => c.type === 'reconnection' && Math.abs(c.s - 1811) < 30)!;
    const gone = crossingChange(led, roads)!.removed;
    const slips = design.routes.filter(q => q.name.startsWith('Slip road')).map(q => r.routes[q.id].legacy!.crossings);
    // no slip road crosses a stretch our road takes out …
    for (const c of slips.flat()) if (c.roadId !== undefined && c.roadId < roads.wayCount) {
      const d = roads.wayStation(c.roadId, c.x, c.y);
      expect(gone.some(i => i.way === c.roadId && d > i.a + 1 && d < i.b - 1)).toBe(false);
    }
    // … the north-east exit (Slip road 3) crosses that local road on one of our road's new links of it
    const seg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x, dy = b.y - a.y, u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy);
    };
    const onLink = slips[2].filter(c => c.cls === led.cls).map(c => (led.geometry!.links ?? []).some(l => l.slice(1).some((q, k) => seg(c, l[k], q) < 3)));
    expect(onLink).toEqual([true]);
  }, 120_000);
  it('at a roundabout end no noise wall of a slip road reaches into its ring: drawn, billed and heard alike (owner: the wall ran into it)', () => {
    const r = run(design), R = ROUNDABOUT_RING.outerDiameter / 2;
    let walled = 0;
    for (const q of design.routes.filter(q => q.name.startsWith('Slip road'))) {
      const l = r.routes[q.id].legacy!, rings = r.works.items.filter(w => w.ring && w.owner.id === q.id);
      const ends = (['a', 'b'] as const).filter(e => q.endpoints[e].anchor.kind === 'source' && (q.alignment.kind === 'pi' && q.alignment.controls.junctionForms?.[e] === 'roundabout'));
      if (!ends.length) continue;
      expect(rings.length + r.works.items.filter(w => w.owner.id === q.id && w.label?.startsWith('Shares its junction')).length).toBeGreaterThan(0);
      for (const e of ends) {
        const from = (s: number) => e === 'a' ? s : l.length - s;
        // (drawn: its stretches; billed: the cells' wall area, where the noise model stood them)
        for (const w of l.walls) expect(Math.min(from(w.s0), from(w.s1))).toBeGreaterThanOrEqual(R - 1e-6);
        for (let i = 0; i < l.n; i++) if (from(l.s[i]) + l.ds / 2 <= R) expect(l.cell.wallArea[i]).toBe(0);
        // (the wall the houses beside it need still stands, from the ring's edge on)
        walled += l.walls.filter(w => Math.min(from(w.s0), from(w.s1)) < R + 2 * l.ds).length;
      }
    }
    expect(walled).toBeGreaterThan(0);
  }, 120_000);
});
