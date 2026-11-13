// Route overlays driven by the cost model, kept apart from view.ts: the highlighted station range
// picked for the cost breakdown (state.RangeSelection) and the noise walls (Result.walls).
// Uses only the public surface of View: `world`, `local()` and `requestRender()`.

import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { NOISE } from '../core/data/urban';
import type { Result } from '../core/evaluate';
import { cellsInRange } from '../core/range';
import { KIND } from '../core/structures';
import type { StationRange } from '../state';
import type { View } from './view';

const HIGHLIGHT = 0xffe000, WALL = 0x18b0b0;

export class RouteExtras {
  private group = new THREE.Group();
  private r: Result | null = null;
  private crown = 9.5;
  private range: StationRange | null = null;

  constructor(private view: View) {
    this.group.name = 'route-extras';
    view.world.add(this.group);
  }

  setResult(r: Result, crownWidth: number) { this.r = r; this.crown = crownWidth; this.rebuild(); }

  /** highlight a station range on the map (null = none) */
  setRange(range: StationRange | null) { this.range = range; this.rebuild(); }

  private line(pos: number[], color: number, width: number, opacity: number, order: number): Line2 {
    const g = new LineGeometry();
    g.setPositions(pos);
    const m = new LineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, depthTest: false, depthWrite: false });
    const l = new Line2(g, m);
    l.renderOrder = order;
    l.frustumCulled = false;
    return l;
  }

  private rebuild() {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    }
    const r = this.r;
    if (!r) return;
    const v = new THREE.Vector3();
    // tunnels are drawn on the surface, like the centreline
    const zOf = (i: number) => (r.kind[i] === KIND.tunnel ? Math.max(r.ground[i], r.grade[i]) : r.grade[i]);

    // ---- noise walls: a thin wall along the crown edge plus a line that reads from afar ----
    const off = this.crown / 2 + 0.6;
    const pos: number[] = [], idx: number[] = [];
    for (const w of r.walls) {
      const sgn = w.side === 'L' ? 1 : -1;
      const top: number[] = [];
      for (let i = w.i0; i <= w.i1; i++) {
        const x = r.x[i] - r.ty[i] * off * sgn, y = r.y[i] + r.tx[i] * off * sgn;
        this.view.local(x, y, r.grade[i] + 0.3, v); pos.push(v.x, v.y, v.z);
        this.view.local(x, y, r.grade[i] + NOISE.wallHeight, v); pos.push(v.x, v.y, v.z);
        top.push(v.x, v.y, v.z);
        if (i > w.i0) { const k = pos.length / 3 - 4; idx.push(k, k + 2, k + 1, k + 2, k + 3, k + 1); }
      }
      if (top.length >= 6) this.group.add(this.line(top, WALL, 2, 0.9, 5));
    }
    if (idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: WALL, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
      mesh.renderOrder = 4;
      this.group.add(mesh);
    }

    // ---- selected range: a wide translucent band over the route ----
    if (this.range && this.range.s0 < r.length) {
      const [i0, i1] = cellsInRange(r, this.range.s0, Math.min(this.range.s1, r.length));
      const hp: number[] = [];
      for (let i = Math.max(0, i0 - (i0 === i1 ? 1 : 0)); i <= Math.min(r.n - 1, i1 + (i0 === i1 ? 1 : 0)); i++) {
        this.view.local(r.x[i], r.y[i], zOf(i) + 2.5, v);
        hp.push(v.x, v.y, v.z);
      }
      if (hp.length >= 6) {
        this.group.add(this.line(hp, 0x000000, 15, 0.35, 6));
        this.group.add(this.line(hp, HIGHLIGHT, 11, 0.8, 7));
      }
    }
    this.view.requestRender();
  }
}
