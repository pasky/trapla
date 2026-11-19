// Slip roads of a hand-built interchange (core/slip-roads.ts): where a slip road meets a carriageway, its
// speed-change lane, and a whole diamond the owner asked to build by hand (D3 0304 at km 4.49, road II/114 under
// the motorway's bridge: four slip roads, saved from the game), valid and priced.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gore, SLIP_ROAD, speedChangeLane } from '../src/core/slip-roads';
import type { Result } from '../src/core/evaluate';
import type { ProjectDesign } from '../src/core/project';
import { evaluateProject } from '../src/core/project-evaluate';

/** a straight motorway line along +x, 2 km, stations every 10 m; `bridge`: stations on a bridge */
const line = (bridge: [number, number] = [0, -1]) => {
  const n = 201, ds = 10, s = Array.from({ length: n }, (_, i) => i * ds);
  return { n, ds, length: (n - 1) * ds, s, x: s.slice(), y: s.map(() => 0), tx: s.map(() => 1), ty: s.map(() => 0), grade: s.map(() => 300),
    kind: s.map(v => v >= bridge[0] && v <= bridge[1] ? 1 : 0) } as unknown as Result;
};

describe('a slip road meets one carriageway', () => {
  it('its gore lies on the side of its traffic, the lane before it (an exit) or after it (an entry)', () => {
    const l = line();
    // forward (+x) traffic keeps right: the gore is at y < 0; the other direction's at y > 0
    expect(gore(l, 1000, 1)).toMatchObject({ x: 1000, z: 300, travel: { x: 1, y: 0 } });
    expect(gore(l, 1000, 1).y).toBeCloseTo(-SLIP_ROAD.goreOffset);
    expect(gore(l, 1000, -1).y).toBeCloseTo(SLIP_ROAD.goreOffset);
    const at = { s0: 0, s1: 100 };
    expect(speedChangeLane(l, 1000, 1, 'exit', 50, 'hilly', at)).toMatchObject({ s0: 1000 - 234, s1: 1000, violations: [] });
    expect(speedChangeLane(l, 1000, 1, 'entry', 50, 'hilly', at)).toMatchObject({ s0: 1000, s1: 1000 + 295 });
    expect(speedChangeLane(l, 1000, -1, 'exit', 50, 'hilly', at)).toMatchObject({ s0: 1000, s1: 1000 + 234 });
    // paved 0.5 m wider along it, the taper at half
    const exit = speedChangeLane(l, 1000, 1, 'exit', 50, 'hilly', at);
    expect(exit.area.ground).toBeCloseTo(SLIP_ROAD.widening * (234 - 100 / 2), 0);
    expect(exit.lines[0].every(p => p.y < 0)).toBe(true);
  });
  it('a lane past the motorway\'s end, or into a tunnel, is a problem; on a bridge it is priced as bridge', () => {
    const l = line([1100, 1200]);
    expect(speedChangeLane(l, 100, 1, 'exit', 50, 'hilly', { s0: 0, s1: 100 }).violations.map(v => v.fix)).toEqual(['Move this end at least 140 m further along the motorway']);
    const over = speedChangeLane(l, 1000, 1, 'entry', 50, 'hilly', { s0: 0, s1: 100 });
    expect(over.area.bridge).toBeGreaterThan(40);
    const tunnel = line([1100, 1200]); for (let i = 110; i <= 120; i++) (tunnel.kind as unknown as number[])[i] = 2;
    expect(speedChangeLane(tunnel, 1000, 1, 'entry', 50, 'hilly', { s0: 0, s1: 100 }).violations.map(v => v.title)).toEqual(['Its entry lane runs into a tunnel']);
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
    // the interchange costs what its slip roads and lanes cost, less that allowance
    expect(r.cost.total! - alone.cost.total!).toBeGreaterThan(100e6);
    expect(r.cost.total! - alone.cost.total!).toBeLessThan(400e6);
  }, 120_000);
  it('a slip road with both ends on the motorway is a problem and earns no credit (review: it was credited twice)', () => {
    const d = structuredClone(design), first = d.routes.find(q => q.name === 'Slip road')!;
    const line = run({ ...d, routes: d.routes.slice(0, 2) }).routes['route:motorway-forward'].legacy!, k = Math.round(4160 / line.ds);
    const g = gore(line, line.s[k], 1);
    first.endpoints.b = { position: { x: g.x, y: g.y, z: g.z }, anchor: { kind: 'route', routeId: 'route:motorway-forward', s: g.s }, binding: 'resolved' };
    if (first.alignment.kind === 'pi') first.alignment.pis = [];
    const r = run(d);
    expect(r.routes[first.id].legacy!.violations.map(v => v.title)).toContain('It leaves and joins the motorway');
    expect(r.works.items.filter(w => w.owner.id === first.id && w.cost < 0)).toEqual([]);
    expect(r.cost.alone[first.id]).toBeGreaterThan(0);
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
