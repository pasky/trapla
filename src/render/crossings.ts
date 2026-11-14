// Crossing objects are priced/resolved in core. This overlay only displays its worker-safe geometry.
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { CrossingPoint } from '../core/crossings';
import type { Result } from '../core/evaluate';
import type { View } from './view';

export class CrossingRenderer {
  private roads = new THREE.Group();
  private symbols = new THREE.Group();
  private r: Pick<Result, 'crossings' | 'grade' | 'ground'> | null = null;
  private scale = NaN;
  private disposed = false;
  private previousRender: View['onRender'];
  private renderHook: () => void;

  constructor(private view: View) {
    this.roads.name = 'crossing-roads'; this.symbols.name = 'crossing-symbols';
    view.world.add(this.roads, this.symbols);
    this.previousRender = view.onRender;
    this.renderHook = () => { this.previousRender?.(); if (!this.disposed) this.updateSymbols(); };
    view.onRender = this.renderHook;
  }

  setResult(r: Pick<Result, 'crossings' | 'grade' | 'ground'>) {
    this.r = r; this.clear(this.roads); this.scale = NaN;
    for (const c of r.crossings) {
      const g = c.geometry;
      if (!g) continue;
      // Depth-tested decks: a crossed road does not disappear at a bridge and is genuinely below
      // or above the new road, rather than a screen-space line painted over every structure.
      if (g.road) this.ribbon(g.road, g.width, c.type === 'overbridge' ? 0x7a858e : 0xa8a297, c.type === 'overbridge');
      for (const link of g.links ?? []) this.ribbon(link, g.width, c.issues?.length ? 0xc75a42 : 0xc49a57, false);
    }
    this.updateSymbols(); this.view.requestRender();
  }

  private clear(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      const obj = child as THREE.Mesh;
      obj.geometry?.dispose();
      this.view.retire(obj.material as THREE.Material | undefined);
    }
  }

  private ribbon(path: CrossingPoint[], width: number, color: number, deck: boolean) {
    if (path.length < 2) return;
    const pos: number[] = [], faces: number[] = [], v = new THREE.Vector3();
    for (let i = 0; i < path.length; i++) {
      const p = path[i], a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      for (const side of [-1, 1]) {
        const x = p.x - dy / len * width / 2 * side, y = p.y + dx / len * width / 2 * side;
        this.view.local(x, y, Math.max(p.z, this.view.drape(x, y)) + 0.25, v);
        pos.push(v.x, v.y, v.z);
      }
      if (i) { const k = 2 * i; faces.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geometry.setIndex(faces);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    this.roads.add(mesh);
    if (deck) {
      // Dark side faces give the elevated crossed-road deck thickness without inventing piers.
      const sidePos: number[] = [], sideFaces: number[] = [];
      for (let i = 0; i < path.length; i++) for (const side of [0, 1]) {
        const k = (2 * i + side) * 3;
        sidePos.push(pos[k], pos[k + 1], pos[k + 2]);
        // View.local uses Y as height, while game Z is elevation; derive its vertical step explicitly.
        const p = path[i], top = new THREE.Vector3(), bottom = new THREE.Vector3();
        this.view.local(p.x, p.y, p.z + 0.25, top); this.view.local(p.x, p.y, p.z - 0.55, bottom);
        sidePos.push(pos[k] + bottom.x - top.x, pos[k + 1] + bottom.y - top.y, pos[k + 2] + bottom.z - top.z);
        if (i) { const j = (2 * i + side) * 2; sideFaces.push(j - 4, j - 3, j, j - 3, j + 1, j); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3)); g.setIndex(sideFaces);
      this.roads.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x46515c, side: THREE.DoubleSide })));
    }
  }

  private updateSymbols() {
    const scale = Math.round(Math.log2(Math.max(0.01, this.view.metresPerPixel)) * 4);
    if (scale === this.scale) return;
    this.scale = scale; this.clear(this.symbols);
    if (!this.r) return;
    const radius = Math.max(7, 6 * 2 ** (scale / 4)), v = new THREE.Vector3();
    for (const c of this.r.crossings) {
      // Thin road ribbons disappear beside the route/wall symbols at overview scales. Keep the
      // schematic diversion legible as a cased dashed line, distinct from solid teal noise walls.
      for (const path of c.geometry?.links ?? []) {
        const pos: number[] = [];
        for (const p of path) { this.view.local(p.x, p.y, p.z + 1, v); pos.push(v.x, v.y, v.z); }
        for (const [color, width] of [[0x62431c, 5], [c.issues?.length ? 0xe34432 : 0xf5c15b, 3]]) {
          const geometry = new LineGeometry(); geometry.setPositions(pos);
          const material = new LineMaterial({ color, linewidth: width, depthTest: false, depthWrite: false });
          material.dashed = true; material.dashSize = 10; material.gapSize = 5;
          const line = new Line2(geometry, material); line.computeLineDistances();
          line.renderOrder = width === 5 ? 6 : 7; line.frustumCulled = false; this.symbols.add(line);
        }
      }
      if (c.type !== 'junction' && !c.issues?.length) continue;
      const pos: number[] = [], z = Math.max(this.r.grade[c.i], this.r.ground[c.i]) + 2;
      for (let k = 0; k <= 32; k++) {
        const angle = 2 * Math.PI * k / 32;
        this.view.local(c.x + Math.cos(angle) * radius, c.y + Math.sin(angle) * radius, z, v);
        pos.push(v.x, v.y, v.z);
      }
      const geometry = new LineGeometry(); geometry.setPositions(pos);
      const line = new Line2(geometry, new LineMaterial({ color: c.issues?.length ? 0xe34432 : 0xf4be42,
        linewidth: c.requestedType ? 4 : 3, depthTest: false, depthWrite: false }));
      line.renderOrder = 7; line.frustumCulled = false;
      this.symbols.add(line);
    }
  }

  dispose() {
    this.disposed = true;
    this.clear(this.roads); this.clear(this.symbols);
    this.view.world.remove(this.roads, this.symbols);
    if (this.view.onRender === this.renderHook) this.view.onRender = this.previousRender;
    this.r = null; this.view.requestRender();
  }
}
