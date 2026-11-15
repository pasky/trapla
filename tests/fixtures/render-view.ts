import * as THREE from 'three';
import { vi } from 'vitest';
import { View } from '../../src/render/view';
import { RouteGroups } from '../../src/render/route-groups';
import type { RouteMaskInput } from '../../src/render/route-mask';

/** Real View mesh builders and scene ownership, but no DOM, WebGL context or large terrain arrays. */
export function renderView() {
  const world = new THREE.Group(), collar = new THREE.MeshBasicMaterial(), ribbon = new THREE.MeshBasicMaterial();
  const shared = new Set<THREE.Material>([collar, ribbon]);
  const groups = new RouteGroups(world, () => shared, m => m.dispose());
  const drawMask = vi.fn<(inputs: readonly RouteMaskInput[]) => void>();
  const view = Object.assign(Object.create(View.prototype) as object, {
    world, routeGroups: groups, routeInputs: new Map(), maskSources: [], crossingSurfaces: [],
    terrain: { heightAt: () => 0, groundAt: () => ({ normMix: true }) },
    local: (x: number, y: number, z: number, v = new THREE.Vector3()) => v.set(x, z, -y),
    drapeHeight: () => 0, drape: () => 0, drawMask,
    collarMaterial: () => collar, ribbonMaterial: () => ribbon,
    crossingEarthMaterial: () => new THREE.MeshBasicMaterial(), crossingGroundMaterial: () => new THREE.MeshBasicMaterial(),
    makeLine: (points: number[]) => new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',
      new THREE.Float32BufferAttribute(points, 3)), new THREE.MeshBasicMaterial()),
    retire: (m: THREE.Material) => m.dispose(),
  }) as unknown as View;
  return { view, world, groups, drawMask, dispose: () => { groups.dispose(); collar.dispose(); ribbon.dispose(); } };
}
