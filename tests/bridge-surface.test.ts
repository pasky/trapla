import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Result } from '../src/core/evaluate';
import { KIND } from '../src/core/structures';
import { structureFootprints } from '../src/core/footprint';
import { renderView } from './fixtures/render-view';
import { bridgeDeckSpans, bridgeDeckSegments, bridgePierTop } from '../src/render/bridge-surface';

// Isolate mesh construction from the core support planner, which has its own tests.
vi.mock('../src/core/footprint', async importOriginal => ({
  ...await importOriginal<typeof import('../src/core/footprint')>(), structureFootprints: vi.fn(),
}));

describe('bridge span rendering', () => {
  it('splits route intervals at actual supports and reaches both adjacent soffits at piers', () => {
    const spans = bridgeDeckSpans(10,70,[25]);
    expect(bridgeDeckSegments(spans,20,40)).toEqual([
      { s0: 20, s1: 25, depth: 1.2 }, { s0: 25, s1: 40, depth: 2.25 },
    ]);
    expect(bridgePierTop(spans,23.8,26.2,(_a,b) => 20+b*.1)).toBeCloseTo(21.3);
    expect(bridgePierTop(bridgeDeckSpans(10,70,[55]),53.8,56.2,(_a,b) => 20+b*.1)).toBeCloseTo(24.42);
    expect(bridgeDeckSegments(spans,0,20)).toEqual([{ s0: 0, s1: 20, depth: 1.2 }]);
    expect(bridgeDeckSegments(spans,60,80)).toEqual([{ s0: 60, s1: 80, depth: 2.25 }]);
  });

  it('renders distinct span soffits, closes the depth step, and interpolates off-station pier tops', () => {
    const f = (v: number[]) => Float64Array.from(v);
    const r = { n: 5, ds: 20, s: f([0,20,40,60,80]), x: f([0,20,40,60,80]), y: new Float64Array(5),
      tx: f([1,1,1,1,1]), ty: new Float64Array(5), grade: f([20,22,24,26,28]),
      kind: Uint8Array.of(KIND.earth,KIND.bridge,KIND.bridge,KIND.bridge,KIND.earth),
      dayL: f([15,15,15,15,15]), dayR: f([15,15,15,15,15]), zDayL: new Float64Array(5), zDayR: new Float64Array(5),
      crossings: [], violations: [], demolished: [], boughtOut: [],
      runs: [{ kind: KIND.bridge, i0: 1, i1: 3, s0: 10, s1: 70, length: 60, pierStations: [25] }],
      geology: { ids: new Uint8Array(5), profiles: [{ normMix: true }] },
    } as unknown as Result;
    const mock = renderView();
    vi.mocked(structureFootprints).mockReturnValue([
      { structure: 'pier', s: 25, i: 1, x: 25, y: 0, tx: 1, ty: 0, along: 1.2, left: 2.75, right: 2.75 },
    ]);
    mock.view.setResult(r, 10);
    const g = (mock.groups.get('legacy')!.getObjectByName('ribbon') as THREE.Mesh<THREE.BufferGeometry>).geometry;
    const p = g.getAttribute('position'), triangles = g.index!.array;
    let shallow = 0, deep = 0, step = 0, endCaps = 0, pierTop = false;
    for (let i = 0; i < triangles.length; i += 3) {
      const ids = Array.from(triangles.slice(i,i+3));
      const soffit = (depth: number) => ids.every(j => Math.abs(p.getY(j)-(20+p.getX(j)*.1-depth))<1e-4);
      if (soffit(1.2)) { shallow++; expect(ids.every(j => p.getX(j)<=25)).toBe(true); }
      if (soffit(2.25)) { deep++; expect(ids.every(j => p.getX(j)>=25)).toBe(true); }
      if (ids.every(j => p.getX(j)===25 && Math.abs(p.getZ(j))===5) && ids.some(j => Math.abs(p.getY(j)-21.3)<1e-4)
        && ids.some(j => Math.abs(p.getY(j)-20.25)<1e-4)) step++;
      for (const x of [0,80]) if (ids.every(j => p.getX(j)===x && Math.abs(p.getZ(j))===5)
        && ids.some(j => Math.abs(p.getY(j)-(20+x*.1+.35))<1e-4)
        && ids.some(j => Math.abs(p.getY(j)-(20+x*.1-(x===0 ? 1.2 : 2.25)))<1e-4)) endCaps++;
    }
    for (let j = 0; j < p.count; j++) if (Math.abs(p.getX(j)-23.8)<1e-4 && Math.abs(p.getZ(j))===2.75) {
      expect(p.getY(j) === -2 || Math.abs(p.getY(j)-21.3)<1e-4).toBe(true);
      if (Math.abs(p.getY(j)-21.3)<1e-4) {
        expect(p.getY(j)).toBeGreaterThanOrEqual(20+23.8*.1-1.2); // no gap under the shallower span
        pierTop = true;
      }
    }
    expect(shallow).toBeGreaterThan(0); expect(deep).toBeGreaterThan(0); expect(step).toBe(2);
    expect(endCaps).toBe(4); expect(pierTop).toBe(true);
    mock.dispose();
  });
});
