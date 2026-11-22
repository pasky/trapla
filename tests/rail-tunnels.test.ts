// A mapped railway tunnel under our road (structures.json `rail`, src/core/rail-tunnels.ts): underground it is no
// railway at the ground; our road keeps over its vault or under its floor.
import { describe, expect, it } from 'vitest';
import { evaluate, type Design } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { RAIL_ON_LEVEL, RAIL_TUNNEL_TOO_NEAR } from '../src/core/checks';
import { LC, RAIL_CROSSING_BIT, Terrain } from '../src/core/terrain';
import { KIND } from '../src/core/structures';

// a hill 40 m high (round, 250 m across its foot) at (1000, 300); a railway north–south through it at x 1000, in a
// tunnel from y 60 to 540 (its rails at the ground beyond: 100 m); our road east–west over the hill at y 300
const nx = 400, ny = 120;
function grids() {
  const q = new Uint16Array(nx * ny), lc = new Uint8Array(nx * ny).fill(LC.forest);
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const x = (c + 0.5) * 5, y = ny * 5 - (r + 0.5) * 5;
    q[r * nx + c] = Math.round((100 + 40 * Math.max(0, 1 - Math.hypot(x - 1000, y - 300) / 250)) * 100);
    // (the railway's class one cell wide, its crossing bit two, as pipeline/build_pack.py draws them)
    if (c === 199 || c === 200) lc[r * nx + c] = (c === 200 ? LC.rail : LC.forest) | RAIL_CROSSING_BIT;
  }
  return { q, lc };
}
const terrain = (tunnels: boolean) => new Terrain({ nx, ny, cell: 5, base: 0, scale: 0.01, ...grids(),
  ...(tunnels ? { railTunnels: { ways: [[1000, 60, 1000, 540]], kind: ['tunnel'] } } : {}) });
const ctx = (t: Terrain, y = 300) => ({ terrain: t, scenario: D11_SCENARIO, a: { x: 250, y }, b: { x: 1750, y } });

describe('a railway tunnel under our road', () => {
  it('leaves the railway raster where it runs underground, not near its portals', () => {
    const t = terrain(true);
    expect(t.crossing(1000, 300)).toBe(0);
    // (what the railway was drawn over)
    expect(t.landcover(1000, 300)).toBe(LC.forest);
    // (the ground 8.6 m over the rails 207 m from the hill's top: nearer the portals still the railway)
    expect(t.crossing(1000, 300 - 240)).toBe(2);
    expect(t.crossing(1000, 300 - 150)).toBe(0);
    expect(t.crossing(1000, 20)).toBe(2);
    // (idempotent: the workers are handed the cleared cells and clear them again)
    const again = new Terrain({ nx, ny, cell: 5, base: 0, scale: 0.01, q: grids().q, lc: t.lc.slice(), railTunnels: t.railTunnels!.data });
    expect(Array.from(again.lc)).toEqual(Array.from(t.lc));
  });
  it('a road over it is no railway crossing; one cut into its vault is a problem', () => {
    const auto: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'auto', vpis: [] };
    const old = evaluate(ctx(terrain(false)), auto);
    expect(old.railCrossings?.length).toBe(1);
    const r = evaluate(ctx(terrain(true)), auto);
    expect(r.railCrossings ?? []).toEqual([]);
    expect(r.violations.filter(v => v.title === RAIL_TUNNEL_TOO_NEAR)).toEqual([]);
    expect(r.cost.total).toBeLessThan(old.cost.total);
    // a grade held 4 m over the rails at the hill's top: in the vault
    const low: Design = { ...auto, profileMode: 'manual', vpis: [{ s: 0, z: 100, r: null }, { s: 750, z: 104, r: null }, { s: 1500, z: 100, r: null }] };
    const v = evaluate(ctx(terrain(true)), low).violations.filter(x => x.title === RAIL_TUNNEL_TOO_NEAR);
    expect(v).toHaveLength(1);
    expect(v[0].s0).toBeCloseTo(750, 0);
    // (the crest's curve a little under the 104 m held)
    expect(v[0].fix).toMatch(/^Raise the road here by 4\.\d m \(or lower it by 14\.\d m to pass under it in a tunnel\)$/);
    // deep enough under it (the ground 112 m, the grade 88 m): in a tunnel; the player's cutting there goes through it
    const under: Design = { ...auto, profileMode: 'manual', vpis: [{ s: 0, z: 100, r: null }, { s: 750, z: 88, r: null }, { s: 1500, z: 100, r: null }] };
    const mined = evaluate(ctx(terrain(true), 125), under);
    expect(mined.kind[Math.round(750 / mined.ds)]).toBe(KIND.tunnel);
    expect(mined.violations.filter(x => x.title === RAIL_TUNNEL_TOO_NEAR)).toEqual([]);
    const open = evaluate(ctx(terrain(true), 125), { ...under, structureOverrides: [{ s0: 600, s1: 900, kind: KIND.earth }] });
    expect(open.violations.filter(x => x.title === RAIL_TUNNEL_TOO_NEAR).map(x => x.fix)).toEqual([expect.stringMatching(/^Make the road a mined tunnel here/)]);
    // just past where the ground is 8.6 m over the rails (the crossing's cell out of the raster, the next one in it)
    const nearPortal = evaluate(ctx(terrain(true), 110), { ...auto, profileMode: 'manual', vpis: [{ s: 0, z: 100, r: null }, { s: 750, z: 93, r: null }, { s: 1500, z: 100, r: null }] });
    expect(nearPortal.violations.some(x => x.title === RAIL_TUNNEL_TOO_NEAR || x.title === RAIL_ON_LEVEL)).toBe(true);
  });
});
