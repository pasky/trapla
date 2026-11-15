import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { FootprintConflict } from '../src/core/footprint';
import type { CrossingPoint } from '../src/core/crossings';
import type { View } from '../src/render/view';
import { footprintSurfaces, groundSegment, type CrossingSurface } from '../src/render/crossing-surface';
import { CrossingRenderer } from '../src/render/crossings';
import { groundBlend } from '../src/render/earthwork-surface';
import { routeSurfaceContext } from '../src/render/route-surfaces';
import { finish } from '../src/render/slices';
import type { Result } from '../src/core/evaluate';

// CrossingRenderer keeps a surface's meshes while its key is unchanged. The key must cover the
// shared ground blend: a neighbour's embankment corridor reaches its toe width + 12.5 m.
const natural = () => 100;
const road = (y: number, z: number): CrossingPoint[] => [0, 20, 40].map(x => ({ x, y, z, ground: 100, surface: z > 100 ? 'ramp' as const : 'terrain' as const }));
const relocation = (id: number, y: number, z: number): FootprintConflict => ({
  id: `road:${id}`, feature: 'road', action: 'relocation', i: 1, s0: 0, s1: 40, x: 20, y, length: 40, cost: 1,
  detail: '', cls: 'tertiary', roadId: id, geometry: { road: road(y, z), width: 6, schematic: false },
});

function mockView() {
  const view = {
    world: new THREE.Group(), crossingSurfaces: [] as CrossingSurface[], blend: (_x: number, _y: number) => 1,
    local: (x: number, y: number, z: number, v = new THREE.Vector3()) => v.set(x, z, -y),
    groundHeight: natural, drape: () => 105, requestRender: vi.fn(), retire: (m: THREE.Material) => m.dispose(),
    crossingEarthMaterial: () => new THREE.MeshBasicMaterial(), crossingGroundMaterial: () => new THREE.MeshBasicMaterial(),
    replacementHeight(x: number, y: number) { return 100 + 5 * view.blend(x, y); },
    /** what View.buildResult stages: the surfaces and the blend of their ground corridors */
    show(conflicts: FootprintConflict[]) {
      view.crossingSurfaces = footprintSurfaces(conflicts, natural);
      const corridors = view.crossingSurfaces.flatMap(s => s.sections.slice(1).flatMap((b, k) => {
        const a = s.sections[k];
        return groundSegment(s, k) ? [{ a: a.p, b: b.p, width: Math.max(...[a, b].flatMap(q => q.toe.map(t => Math.hypot(t.x - q.p.x, t.y - q.p.y)))) }] : [];
      }));
      view.blend = groundBlend(corridors);
    },
  };
  return view;
}
const terrainOf = (world: THREE.Object3D, y0: number, y1: number) => {
  const out: number[] = [];
  world.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.name !== 'crossing-terrain') return;
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (-p.getZ(i) >= y0 && -p.getZ(i) <= y1) out.push(p.getX(i), p.getY(i), p.getZ(i));
  });
  return out.sort((a, b) => a - b);
};

describe('crossing mesh reuse', () => {
  it('keys actual nearby main-road footprints, not result identities or distant edits', () => {
    const view = mockView(), renderer = new CrossingRenderer(view as unknown as View);
    view.show([relocation(1, 0, 100)]);
    const main = { n: 3, x: Float64Array.of(0, 20, 40), y: Float64Array.of(-40, -40, -40),
      tx: Float64Array.of(1, 1, 1), ty: new Float64Array(3), grade: Float64Array.of(100, 100, 100),
      kind: new Uint8Array(3), dayL: Float64Array.of(10, 10, 10), dayR: Float64Array.of(10, 10, 10) } as Result;
    const far = structuredClone(main); far.y.fill(1000);
    const build = (roads: Result[]) => finish(renderer.build({ crossings: [], grade: Float64Array.of(100), ground: Float64Array.of(100) },
      routeSurfaceContext(view.crossingSurfaces, view.crossingSurfaces, natural, () => 105, roads))).commit();
    const meshes = () => { const out = new Set<THREE.Object3D>(); view.world.traverse(o => { if ((o as THREE.Mesh).isMesh) out.add(o); }); return out; };
    build([main, far]); const initial = meshes(); expect(initial.size).toBeGreaterThan(0);
    const sameGeometry = structuredClone(main); far.dayL.fill(30);
    build([sameGeometry, far]); expect(meshes()).toEqual(initial);
    sameGeometry.dayL.fill(20);
    build([sameGeometry, far]); expect(meshes()).not.toEqual(initial);
    renderer.dispose();
  });

  it('reuses unchanged surfaces, and rebuilds one whose collars a changed neighbouring embankment reaches', () => {
    const view = mockView(), renderer = new CrossingRenderer(view as unknown as View);
    const flat = relocation(1, 0, 100);
    // 40 m embankment 90 m away: its toe ≈ 63 m out, so its blend corridor reaches the flat road's outer collar
    view.show([flat, relocation(2, 90, 140)]);
    renderer.setResult({ crossings: [], grade: Float64Array.of(100), ground: Float64Array.of(100), footprintConflicts: [] });
    const meshes = new Set<THREE.Object3D>();
    view.world.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.add(o); });
    // an identical result keeps every mesh object
    view.show([flat, relocation(2, 90, 140)]);
    renderer.setResult({ crossings: [], grade: Float64Array.of(100), ground: Float64Array.of(100), footprintConflicts: [] });
    view.world.traverse(o => { if ((o as THREE.Mesh).isMesh) expect(meshes.has(o)).toBe(true); });
    // lowering the neighbour changes the flat road's collar heights: no stale reuse
    view.show([flat, relocation(2, 90, 101)]);
    renderer.setResult({ crossings: [], grade: Float64Array.of(100), ground: Float64Array.of(100), footprintConflicts: [] });
    const fresh = mockView(), freshRenderer = new CrossingRenderer(fresh as unknown as View);
    fresh.show([flat, relocation(2, 90, 101)]);
    freshRenderer.setResult({ crossings: [], grade: Float64Array.of(100), ground: Float64Array.of(100), footprintConflicts: [] });
    const reused = terrainOf(view.world, -30, 30), rebuilt = terrainOf(fresh.world, -30, 30);
    expect(rebuilt.length).toBeGreaterThan(0);
    expect(reused).toEqual(rebuilt);
    // and the embankment did reach it: the high neighbour's collars differ from the low one's
    const high = mockView(), highRenderer = new CrossingRenderer(high as unknown as View);
    high.show([flat, relocation(2, 90, 140)]);
    highRenderer.setResult({ crossings: [], grade: Float64Array.of(100), ground: Float64Array.of(100), footprintConflicts: [] });
    expect(terrainOf(high.world, -30, 30)).not.toEqual(rebuilt);
  });
});
