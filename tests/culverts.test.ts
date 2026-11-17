// Stream culverts as drawn (render/culvert-geometry.ts, render/culverts.ts): the billed barrel placed on the drawn
// slopes, its ends where the stream leaves our embankment, and ends that stand in the ground.
import { describe, expect, it } from 'vitest';
import { evaluate, type Design } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { LC, Terrain, syntheticTerrain } from '../src/core/terrain';
import { culvertPlans } from '../src/render/culvert-geometry';
import { culvertMeshData } from '../src/render/culverts';

/** a valley across a straight east–west road at y = 250, a stream down it crossing the road at 1250 at an angle */
function scene(depth: number, slant: number) {
  const source = syntheticTerrain(500, 100, 5, x => 400 - depth * Math.min(1, Math.max(0, Math.min(x - 250, 2250 - x)) / 300));
  const q = new Uint16Array(500 * 100);
  for (let r = 0; r < 100; r++) for (let c = 0; c < 500; c++) q[r * 500 + c] = Math.round(source.sample(c, r) * 100);
  const points = [[1250 - slant, 0], [1250, 250], [1250 + slant, 500]];
  const terrain = new Terrain({ nx: 500, ny: 100, cell: 5, base: 0, scale: 0.01, q, lc: new Uint8Array(q.length).fill(LC.none),
    watercourses: { version: 1, method: 'synthetic', reaches: [{ id: 7, kind: 'stream', width: null, points,
      catchmentKm2: points.map(() => 0.3), truncated: points.map(() => false) }] } });
  const design: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual', vpis: [{ s: 0, z: 400, r: null }, { s: 2000, z: 400, r: null }] };
  const r = evaluate({ terrain, scenario: D11_SCENARIO, a: { x: 250, y: 250 }, b: { x: 2250, y: 250 } }, design);
  return { r, terrain, natural: (x: number, y: number) => terrain.heightAt(x, y) };
}

describe('stream culverts as drawn', () => {
  it.each([[5, 0, 'pipe'], [6, 150, 'box'], [14, 100, 'vault']] as const)('%s m of fill, the stream %s m off square: the billed %s from toe to toe along the stream', (depth, slant, shape) => {
    const { r, terrain, natural } = scene(depth, slant);
    const billed = r.waterCrossings.filter(c => c.size);
    expect(billed).toHaveLength(1);
    const c = billed[0], plans = culvertPlans(r, terrain.watercourses, natural);
    expect(plans).toHaveLength(1);
    const p = plans[0];
    expect(p.shape).toBe(shape);
    expect(p.id).toBe(7);
    const i = Math.round(c.s / r.ds);
    for (const e of p.ends) {
      // on the toe (the straight road's daylight offset there), on the stream, at the ground
      expect(Math.abs(Math.abs(e.y - 250) - (e.y > 250 ? r.dayL[i] : r.dayR[i]))).toBeLessThan(0.1);
      const t = (e.y - 0) / 500, sx = 1250 - slant + 2 * slant * t;
      expect(Math.abs(e.x - sx) * 500 / Math.hypot(500, 2 * slant)).toBeLessThan(0.05);
      expect(e.z).toBeCloseTo(natural(e.x, e.y), 6);
      // cut along our road (as skewed culverts are built)
      expect(Math.abs(e.skew)).toBeCloseTo(Math.min(1, 2 * slant / 500), 2);
    }
    const [a, b] = p.ends;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(c.length, 0);
  });

  it('each end stands in the ground: the footing below it, nothing above the headwall, wing tips down at the ground', () => {
    const { r, terrain, natural } = scene(6, 150);
    const plans = culvertPlans(r, terrain.watercourses, natural);
    const { position } = culvertMeshData(plans, natural, (x, y, z) => ({ x, y, z }));
    for (const e of plans[0].ends) {
      // what is built beyond the toe at this end
      const out: number[][] = [];
      for (let k = 0; k < position.length; k += 3) {
        const x = position[k], y = position[k + 1], z = position[k + 2];
        if ((x - e.x) * e.ox + (y - e.y) * e.oy > 0.5 && Math.hypot(x - e.x, y - e.y) < 15) out.push([x, y, z]);
      }
      expect(out.length).toBeGreaterThan(20);
      expect(Math.min(...out.map(([x, y, z]) => z - natural(x, y)))).toBeLessThan(-0.4);
      // the wing tips (the furthest out): at most 0.3 m above the ground there
      const far = Math.max(...out.map(([x, y]) => (x - e.x) * e.ox + (y - e.y) * e.oy));
      for (const [x, y, z] of out) if ((x - e.x) * e.ox + (y - e.y) * e.oy > far - 0.05) expect(z - natural(x, y)).toBeLessThan(0.3 + 1e-6);
    }
  });
});
