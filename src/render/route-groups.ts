import * as THREE from 'three';
import type { Staged } from './slices';

/** Scene ownership, not project state. Each route owns its meshes; shared materials belong to View. */
export class RouteGroups {
  private groups = new Map<string, THREE.Group>();
  constructor(private parent: THREE.Group, private shared: () => ReadonlySet<THREE.Material>,
    private retire: (material: THREE.Material) => void) {}

  get(id: string) { return this.groups.get(id); }
  values() { return this.groups.values(); }

  private release(objects: readonly THREE.Object3D[], shown: boolean) {
    const shared = this.shared(), geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    for (const object of objects) object.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) geometry.add(mesh.geometry);
      for (const m of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) if (!shared.has(m)) materials.add(m);
    });
    for (const g of geometry) g.dispose();
    for (const m of materials) if (shown) this.retire(m); else m.dispose();
  }

  /** Until commit the live group and all its children remain untouched. Dispose is idempotent. */
  stage(id: string, objects: readonly THREE.Object3D[]): Staged {
    let settled = false;
    return {
      commit: () => {
        if (settled) return;
        settled = true;
        let group = this.groups.get(id);
        if (!group) {
          group = new THREE.Group(); group.name = 'route'; group.userData.routeId = id;
          this.groups.set(id, group); this.parent.add(group);
        }
        this.release(group.children, true); group.clear();
        for (const object of objects) { object.userData.routeId = id; group.add(object); }
      },
      dispose: () => { if (!settled) { settled = true; this.release(objects, false); } },
    };
  }

  remove(id: string) {
    const group = this.groups.get(id);
    if (!group) return;
    this.release(group.children, true); this.parent.remove(group); this.groups.delete(id);
  }
  retain(ids: ReadonlySet<string>) { for (const id of this.groups.keys()) if (!ids.has(id)) this.remove(id); }
  dispose() { this.retain(new Set()); }
}
