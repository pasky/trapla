import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Result } from '../src/core/evaluate';
import { KIND } from '../src/core/structures';
import { renderView } from './fixtures/render-view';
import { EW_KIND } from '../src/render/terrainMaterial';

/** Exercise mesh generation without a browser, WebGL context or terrain-sized arrays. */
function ribbon(fill: boolean) {
  const f = (v: number[]) => Float64Array.from(v), z = fill ? 10 : -10, toe = fill ? 5 : -5;
  const r = { n: 3, ds: 20, s: f([0,20,40]), x: f([0,20,40]), y: f([0,0,0]), tx: f([1,1,1]), ty: f([0,0,0]),
    grade: f([z,z,z]), kind: Uint8Array.of(KIND.earth,KIND.earth,KIND.bridge),
    dayL: f([15,15,15]), dayR: f([15,15,15]), zDayL: f([0,0,0]), zDayR: f([0,0,0]),
    wallSurfaceL: f([toe,toe,NaN]), wallSurfaceR: f([toe,toe,NaN]),
    crossings: [], violations: [], runs: [], demolished: [], boughtOut: [],
    geology: { ids: new Uint8Array(3), profiles: [{ normMix: true }] },
  } as unknown as Result;
  const mock = renderView();
  mock.view.setResult(r, 10);
  const mesh = mock.groups.get('legacy')!.getObjectByName('ribbon') as THREE.Mesh<THREE.BufferGeometry>;
  return { geometry: mesh.geometry, dispose: mock.dispose };
}

describe('retaining wall meshes', () => {
  it.each([true,false])('joins the %s fill slope to concrete vertical faces, not to natural ground', fill => {
    const { geometry: g, dispose } = ribbon(fill);
    const p = g.getAttribute('position'), kinds = g.getAttribute('ewKind'), ink = g.getAttribute('ink');
    const triangles = g.index!.array;
    let faces = 0, slopes = 0;
    for (let i = 0; i < triangles.length; i += 3) {
      const ids = Array.from(triangles.slice(i,i+3));
      // the retaining faces of the earthwork cell (not the concrete end cap or, in the cut, the
      // bridge's abutment set into the bank)
      if (ids.every(j => kinds.getX(j) === EW_KIND.structure && Math.abs(p.getZ(j)) === 15 && p.getX(j) <= 20)) {
        faces++;
        expect(new Set(ids.map(j => p.getZ(j))).size).toBe(1); // vertical, same plan offset
        expect(Math.abs(p.getZ(ids[0]))).toBe(15);
        const heights = ids.map(j => p.getY(j));
        expect(Math.max(...heights)-Math.min(...heights)).toBeCloseTo(5);
        expect(ids.every(j => ink.getX(j) === 0)).toBe(true);
      }
      if (ids.every(j => kinds.getX(j) === (fill ? EW_KIND.fill : EW_KIND.cut)) && new Set(ids.map(j => p.getX(j))).size > 1) {
        slopes++;
        for (const j of ids) if (Math.abs(p.getZ(j)) === 15) expect(p.getY(j)).toBeCloseTo((fill ? 5 : -5)+.015);
      }
    }
    expect(faces).toBeGreaterThan(0); expect(slopes).toBeGreaterThan(0);
    dispose();
  });

  it('closes the lower end cap where retained fill meets a bridge', () => {
    const { geometry: g, dispose } = ribbon(true), p = g.getAttribute('position'), triangles = g.index!.array;
    for (const side of [-1,1]) {
      const expected = [[20,.015,15*side],[20,0,5*side],[20,5.015,15*side]];
      let closed = false;
      for (let i = 0; i < triangles.length; i += 3) {
        const ids = Array.from(triangles.slice(i,i+3));
        if (expected.every(([x,y,z]) => ids.some(j => Math.abs(p.getX(j)-x)<1e-4 && Math.abs(p.getY(j)-y)<1e-4 && Math.abs(p.getZ(j)-z)<1e-4))) closed = true;
      }
      expect(closed).toBe(true);
    }
    dispose();
  });
});
