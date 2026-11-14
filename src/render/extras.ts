// Route overlays driven by the cost model, kept apart from view.ts: the highlighted station range
// picked for the cost breakdown (state.RangeSelection) and the noise walls (Result.walls) with their
// far-zoom symbols and hover targets.
// Uses only the public surface of View: `world`, `local()`, `requestRender()` and `retire()`.

import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Result } from '../core/evaluate';
import { NOISE } from '../core/data/urban';
import type { WallStretch } from '../core/noise';
import { cellsInRange } from '../core/range';
import { KIND } from '../core/structures';
import type { StationRange } from '../state';
import type { View } from './view';

const HIGHLIGHT = 0xffe000, WALL = 0x18b0b0;
/** wall symbols from this many metres per pixel on (a 3 m wall is then under ~5 px), offset ≥ this many px */
const SYMBOL_FROM = 0.6, SYMBOL_PX = 7;

export class RouteExtras {
  private walls = new THREE.Group();
  private symbols = new THREE.Group();
  private symbolScale = -1;
  private wallHits: { w: WallStretch; pts: number[] }[] = [];
  private highlight = new THREE.Group();
  private r: Result | null = null;
  private crown = 9.5;
  private range: StationRange | null = null;

  constructor(private view: View) {
    this.walls.name = 'noise-walls';
    this.symbols.name = 'noise-wall-symbols';
    this.highlight.name = 'range-highlight';
    view.world.add(this.walls, this.symbols, this.highlight);
    const prev = view.onRender;
    view.onRender = () => { prev?.(); this.updateSymbols(); };
  }

  setResult(r: Result, crownWidth: number) { this.r = r; this.crown = crownWidth; this.buildWalls(); this.buildHighlight(); }

  /** highlight a station range on the map (null = none) */
  setRange(range: StationRange | null) { this.range = range; this.buildHighlight(); }

  private line(pos: number[], color: number, width: number, opacity: number, order: number): Line2 {
    const g = new LineGeometry();
    g.setPositions(pos);
    const m = new LineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, depthTest: false, depthWrite: false });
    const l = new Line2(g, m);
    l.renderOrder = order;
    l.frustumCulled = false;
    return l;
  }

  private clear(group: THREE.Group) {
    for (const c of [...group.children]) {
      group.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      this.view.retire(m.material as THREE.Material | undefined); // disposed after the next frame, see View.retire
    }
  }

  /** Points along a wall stretch at `off` metres from the axis, `dz` above grade: local x, y, z triplets.
   * Includes the cell boundaries so even a single-cell wall has a visible, full-length face. */
  private wallPath(w: WallStretch, off: number, dz: number): number[] {
    const r = this.r!, sgn = w.side === 'L' ? 1 : -1, out: number[] = [];
    const stations = [w.s0, ...Array.from({ length: w.i1 - w.i0 + 1 }, (_, k) => r.s[w.i0 + k]), w.s1]
      .filter((s, i, a) => i === 0 || s !== a[i - 1]);
    for (const s of stations) {
      const i = Math.min(r.n - 2, Math.max(0, Math.floor(s / r.ds))), t = (s - r.s[i]) / r.ds;
      const at = (a: Float64Array) => a[i] + t * (a[i + 1] - a[i]);
      const tx = at(r.tx), ty = at(r.ty), norm = Math.hypot(tx, ty) || 1;
      out.push(at(r.x) - ty / norm * off * sgn, at(r.y) + tx / norm * off * sgn, at(r.grade) + dz);
    }
    return out;
  }

  /** noise walls: a thin wall along the crown edge plus a line along its top */
  private buildWalls() {
    this.clear(this.walls);
    this.symbolScale = -1;
    const r = this.r;
    if (!r) return;
    const v = new THREE.Vector3();
    const off = this.crown / 2 + NOISE.wallEdgeOffset;
    const pos: number[] = [], idx: number[] = [];
    for (const w of r.walls) {
      const base = this.wallPath(w, off, 0), top: number[] = [];
      for (let j = 0; j < base.length / 3; j++) {
        const [x, y, z] = base.slice(3 * j, 3 * j + 3);
        this.view.local(x, y, z, v); pos.push(v.x, v.y, v.z);
        this.view.local(x, y, z + w.height, v); pos.push(v.x, v.y, v.z);
        top.push(v.x, v.y, v.z);
        if (j > 0) { const k = pos.length / 3 - 4; idx.push(k, k + 2, k + 1, k + 2, k + 3, k + 1); }
      }
      if (top.length >= 6) this.walls.add(this.line(top, WALL, 2, 0.9, 5));
    }
    if (idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: WALL, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
      mesh.renderOrder = 4;
      this.walls.add(mesh);
    }
    this.updateSymbols();
    this.view.requestRender();
  }

  /**
   * From afar a 3–5 m wall is under a pixel: draw each stretch as a teal line with a dark casing, pushed
   * out to ≥ SYMBOL_PX pixels from the axis (left / right stay apart and clear of the centreline).
   * Rebuilt when the zoom changes by a quarter octave; hidden close up, where the wall itself reads.
   */
  private updateSymbols() {
    const r = this.r, mpp = this.view.metresPerPixel;
    const scale = Math.round(Math.log2(Math.max(1e-3, mpp)) * 4);
    if (scale === this.symbolScale) return;
    this.symbolScale = scale;
    this.clear(this.symbols);
    this.wallHits = [];
    if (!r) return;
    const off = this.crown / 2 + NOISE.wallEdgeOffset, far = mpp > SYMBOL_FROM;
    const symOff = Math.max(off, SYMBOL_PX * 2 ** (scale / 4)), v = new THREE.Vector3();
    for (const w of r.walls) {
      // hover target: the symbol from afar, the wall top close up
      const pts = far ? this.wallPath(w, symOff, w.height) : this.wallPath(w, off, w.height);
      this.wallHits.push({ w, pts });
      if (!far || pts.length < 6) continue;
      const world: number[] = [];
      for (let j = 0; j < pts.length; j += 3) { this.view.local(pts[j], pts[j + 1], pts[j + 2], v); world.push(v.x, v.y, v.z); }
      // both opaque: renderOrder then keeps the teal core over its casing
      this.symbols.add(this.line(world, 0x0e4a4a, 6.5, 1, 5), this.line(world, WALL, 3.5, 1, 6));
    }
    this.view.requestRender();
  }

  /** the wall stretch drawn under a screen point (within `tol` px), for the hover label */
  wallAt(clientX: number, clientY: number, tol = 7): WallStretch | null {
    const rect = this.view.renderer.domElement.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    let best: WallStretch | null = null, bestD = tol;
    for (const { w, pts } of this.wallHits) {
      let prev: { sx: number; sy: number; vis: boolean } | null = null;
      for (let j = 0; j < pts.length; j += 3) {
        const p = this.view.project(pts[j], pts[j + 1], pts[j + 2]);
        if (prev && prev.vis && p.vis) {
          const ex = p.sx - prev.sx, ey = p.sy - prev.sy;
          const t = Math.max(0, Math.min(1, ((mx - prev.sx) * ex + (my - prev.sy) * ey) / (ex * ex + ey * ey || 1)));
          const d = Math.hypot(mx - prev.sx - ex * t, my - prev.sy - ey * t);
          if (d < bestD) { bestD = d; best = w; }
        }
        prev = p;
      }
    }
    return best;
  }

  /** selected range: a wide translucent band over the route */
  private buildHighlight() {
    this.clear(this.highlight);
    const r = this.r;
    if (r && this.range && this.range.s0 < r.length) {
      const v = new THREE.Vector3();
      // tunnels are drawn on the surface, like the centreline
      const zOf = (i: number) => (r.kind[i] === KIND.tunnel ? Math.max(r.ground[i], r.grade[i]) : r.grade[i]);
      const [i0, i1] = cellsInRange(r, this.range.s0, Math.min(this.range.s1, r.length));
      const hp: number[] = [];
      for (let i = Math.max(0, i0 - (i0 === i1 ? 1 : 0)); i <= Math.min(r.n - 1, i1 + (i0 === i1 ? 1 : 0)); i++) {
        this.view.local(r.x[i], r.y[i], zOf(i) + 2.5, v);
        hp.push(v.x, v.y, v.z);
      }
      if (hp.length >= 6) {
        this.highlight.add(this.line(hp, 0x000000, 15, 0.35, 6));
        this.highlight.add(this.line(hp, HIGHLIGHT, 11, 0.8, 7));
      }
    }
    this.view.requestRender();
  }
}
