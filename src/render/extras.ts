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
import type { StructureOverride } from '../core/overrides';
import type { WallOverride } from '../core/build-controls';
import type { StationRange } from '../state';
import type { View } from './view';

const HIGHLIGHT = 0xffe000, WALL = 0x18b0b0;
/**
 * The 3D noise wall (its symbol from afar stays teal): steel H posts at a 4 m module carrying absorptive
 * wood-cement panels on a concrete plinth, as in the M-S system (prefa-nb.cz/protihlukove-steny-m-s:
 * HEA / HEB posts, 4000 mm module, plinth panels up to 1.5 m, wood-cement absorber of 500 x 250 mm blocks).
 * Illustrative only (the bill prices m² of wall): post width (HEB 160) and a 0.5 m plinth. The wall's
 * line and top are exactly the billed ones.
 */
const POST_MODULE = 4, POST_W = 0.16, PLINTH = 0.5;
/** wall symbols from this many metres per pixel on (a 3 m wall is then under ~5 px), offset ≥ this many px */
const SYMBOL_FROM = 1, SYMBOL_PX = 5;

export class RouteExtras {
  private walls = new THREE.Group();
  private symbols = new THREE.Group();
  private symbolScale = -1;
  private wallHits: { w: WallStretch; pts: number[] }[] = [];
  private highlight = new THREE.Group();
  private manual = new THREE.Group();
  private r: Result | null = null;
  private crown = 9.5;
  private range: StationRange | null = null;
  private visible = true;
  private removeFrame: () => void;

  constructor(private view: View) {
    this.walls.name = 'noise-walls';
    this.symbols.name = 'noise-wall-symbols';
    this.highlight.name = 'range-highlight';
    this.manual.name = 'manual-structures';
    view.world.add(this.walls, this.symbols, this.highlight, this.manual);
    this.removeFrame = view.addRenderListener(() => this.updateSymbols());
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    for (const group of [this.walls, this.symbols, this.highlight, this.manual]) group.visible = visible;
    if (visible) this.symbolScale = -1;
    this.view.requestRender();
  }
  reset() {
    this.r = null; this.range = null; this.wallHits = [];
    for (const group of [this.walls, this.symbols, this.highlight, this.manual]) this.clear(group);
  }
  dispose() {
    this.reset(); this.removeFrame();
    this.view.world.remove(this.walls, this.symbols, this.highlight, this.manual); this.view.requestRender();
  }

  setResult(r: Result, crownWidth: number, overrides: readonly StructureOverride[] = [], wallOverrides: readonly WallOverride[] = []) {
    this.r = r; this.crown = crownWidth; this.buildWalls(); this.buildManual(overrides, wallOverrides); this.buildHighlight();
  }

  /** Dotted surface overlay distinguishes manual earth/bridge/tunnel ranges, even if invalid. */
  private buildManual(overrides: readonly StructureOverride[], wallOverrides: readonly WallOverride[]) {
    this.clear(this.manual);
    const r = this.r;
    if (!r) return;
    const v = new THREE.Vector3();
    for (const o of overrides) {
      const a = Math.max(0, o.s0), b = Math.min(r.length, o.s1);
      if (b <= a) continue;
      const pos: number[] = [];
      const stations = [a];
      for (let i = Math.floor(a / r.ds) + 1; i < r.n && r.s[i] < b; i++) stations.push(r.s[i]);
      stations.push(b);
      for (const s of stations) {
        const i = Math.min(r.n - 2, Math.floor(s / r.ds)), t = (s - r.s[i]) / r.ds;
        const at = (z: Float64Array) => z[i] + t * (z[i + 1] - z[i]);
        this.view.local(at(r.x), at(r.y), (o.kind === KIND.tunnel ? at(r.ground) : at(r.grade)) + .15, v);
        pos.push(v.x, v.y, v.z);
      }
      const line = this.line(pos, [0x976025, 0x2f6fcf, 0x7a4fc0][o.kind], 6, 1, 6);
      line.material.dashed = true; line.material.dashSize = 12; line.material.gapSize = 12;
      line.computeLineDistances();
      this.manual.add(line);
    }
    for (const o of wallOverrides) {
      const s0 = Math.max(0, o.s0), s1 = Math.min(r.length, o.s1);
      if (s1 <= s0) continue;
      const [i0, i1] = cellsInRange(r, s0, s1);
      const path = this.wallPath({ ...o, s0, s1, i0, i1 }, this.crown / 2 + NOISE.wallEdgeOffset, o.height + .15);
      const pos: number[] = [];
      for (let k = 0; k < path.length; k += 3) { this.view.local(path[k], path[k + 1], path[k + 2], v); pos.push(v.x, v.y, v.z); }
      const line = this.line(pos, o.height ? 0x046767 : 0xd6338a, 3, 1, 7);
      line.material.dashed = true; line.material.dashSize = 6; line.material.gapSize = 8;
      line.computeLineDistances(); this.manual.add(line);
    }
    this.view.requestRender();
  }

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
      if ((c as THREE.InstancedMesh).isInstancedMesh) (c as THREE.InstancedMesh).dispose();
      this.view.retire(m.material as THREE.Material | undefined); // disposed after the next frame, see View.retire
    }
  }

  /** Points along a wall stretch at `off` metres from the axis, `dz` above grade: local x, y, z triplets.
   * Includes the cell boundaries so even a single-cell wall has a visible, full-length face. */
  private wallPath(w: WallStretch, off: number, dz: number, at?: readonly number[]): number[] {
    const r = this.r!, sgn = w.side === 'L' ? 1 : -1, out: number[] = [];
    const stations = at ?? this.wallStations(w);
    for (const s of stations) {
      const i = Math.min(r.n - 2, Math.max(0, Math.floor(s / r.ds))), t = (s - r.s[i]) / r.ds;
      const at = (a: Float64Array) => a[i] + t * (a[i + 1] - a[i]);
      const tx = at(r.tx), ty = at(r.ty), norm = Math.hypot(tx, ty) || 1;
      out.push(at(r.x) - ty / norm * off * sgn, at(r.y) + tx / norm * off * sgn, at(r.grade) + dz);
    }
    return out;
  }

  /** stations of a wall's outline: its ends and the cell boundaries between */
  private wallStations(w: WallStretch): number[] {
    const r = this.r!;
    return [w.s0, ...Array.from({ length: w.i1 - w.i0 + 1 }, (_, k) => r.s[w.i0 + k]), w.s1]
      .filter((s, i, a) => i === 0 || s !== a[i - 1]);
  }

  /** The wall sits outside the crown: its base reaches down onto the actual side slope instead of
   * leaving a grade-height panel suspended above a descending embankment. */
  private wallFoot(w: WallStretch, s: number, z: number): number {
    const r = this.r!, i = Math.min(r.n - 1, Math.max(0, Math.round(s / r.ds)));
    const day = w.side === 'L' ? r.dayL[i] : r.dayR[i], zDay = w.side === 'L' ? r.zDayL[i] : r.zDayR[i];
    const t = Math.max(0, Math.min(1, NOISE.wallEdgeOffset / Math.max(.1, day - this.crown / 2)));
    return r.kind[i] === KIND.earth ? Math.min(z, z + (zDay - r.grade[i]) * t) : z;
  }

  /** noise walls: lit panels along the crown edge from the slope to the billed top, steel posts */
  private buildWalls() {
    this.clear(this.walls);
    this.symbolScale = -1;
    const r = this.r;
    if (!r) return;
    const v = new THREE.Vector3();
    const off = this.crown / 2 + NOISE.wallEdgeOffset;
    // panels: `wallUV` = metres along the wall, metres above its foot (plinth, absorber courses)
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const posts: THREE.Matrix4[] = [];
    for (const w of r.walls) {
      const stations = this.wallStations(w), base = this.wallPath(w, off, 0, stations), feet: number[] = [];
      for (let j = 0; j < stations.length; j++) {
        const x = base[3 * j], y = base[3 * j + 1], z = base[3 * j + 2], foot = this.wallFoot(w, stations[j], z);
        feet.push(foot);
        this.view.local(x, y, foot, v); pos.push(v.x, v.y, v.z); uv.push(stations[j], 0);
        this.view.local(x, y, z + w.height, v); pos.push(v.x, v.y, v.z); uv.push(stations[j], z + w.height - foot);
        if (j > 0) { const k = pos.length / 3 - 4; idx.push(k, k + 2, k + 1, k + 2, k + 3, k + 1); }
      }
      // posts on the 4 m module, from the panel's foot to just above its top (stations are along the
      // axis; the wall is beside it, so the module is right within a few per cent)
      const n = Math.max(1, Math.round((w.s1 - w.s0) / POST_MODULE)), at: number[] = [];
      for (let k = 0; k <= n; k++) at.push(w.s0 + (w.s1 - w.s0) * k / n);
      const pp = this.wallPath(w, off, 0, at);
      for (let k = 0, j = 0; k <= n; k++) {
        while (j < stations.length - 2 && stations[j + 1] < at[k]) j++;
        const t = Math.max(0, Math.min(1, (at[k] - stations[j]) / Math.max(1e-6, stations[j + 1] - stations[j])));
        const foot = stations.length > 1 ? feet[j] + (feet[j + 1] - feet[j]) * t : feet[0];
        const top = pp[3 * k + 2] + w.height + 0.05;
        this.view.local(pp[3 * k], pp[3 * k + 1], (foot + top) / 2, v);
        posts.push(new THREE.Matrix4().compose(v, new THREE.Quaternion(), new THREE.Vector3(POST_W, top - foot, POST_W)));
      }
    }
    if (idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('wallUV', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, this.panelMaterial());
      mesh.name = 'noise-wall-panels';
      this.walls.add(mesh);
      const box = new THREE.BoxGeometry(1, 1, 1);
      const inst = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0x5b6066 }), posts.length);
      posts.forEach((p, k) => inst.setMatrixAt(k, p));
      inst.computeBoundingSphere();
      inst.name = 'noise-wall-posts';
      this.walls.add(inst);
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
    if (!this.visible) return;
    const r = this.r, mpp = this.view.metresPerPixel;
    const scale = Math.round(Math.log2(Math.max(1e-3, mpp)) * 4);
    if (scale === this.symbolScale) return;
    this.symbolScale = scale;
    this.clear(this.symbols);
    this.wallHits = [];
    if (!r) return;
    const off = this.crown / 2 + NOISE.wallEdgeOffset, far = mpp > SYMBOL_FROM;
    // at the overview (≥ 6 m per pixel) thin lines close to the road: walls are a detail there, the
    // route itself must stay the most visible thing
    const overview = mpp > 6, px = overview ? 4 : SYMBOL_PX;
    const symOff = Math.max(off, px * 2 ** (scale / 4)), v = new THREE.Vector3();
    for (const w of r.walls) {
      // hover target: the symbol from afar, the wall top close up
      const pts = far ? this.wallPath(w, symOff, w.height) : this.wallPath(w, off, w.height);
      this.wallHits.push({ w, pts });
      if (!far || pts.length < 6) continue;
      const world: number[] = [];
      for (let j = 0; j < pts.length; j += 3) { this.view.local(pts[j], pts[j + 1], pts[j + 2], v); world.push(v.x, v.y, v.z); }
      // both opaque: renderOrder then keeps the teal core over its casing
      if (overview) this.symbols.add(this.line(world, WALL, 2, 1, 6));
      else this.symbols.add(this.line(world, 0x0e4a4a, 4.5, 1, 5), this.line(world, WALL, 2.5, 1, 6));
    }
    this.view.requestRender();
  }

  /** wood-cement absorber courses on a concrete plinth, lit by the scene (both faces) */
  private panelMaterial() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 wallUV;\nvarying vec2 vWallUV;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallUV = wallUV;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWallUV;')
        .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
          {
            // absorber blocks 0.5 m x 0.25 m in staggered courses: thin joints, box-filtered over the
            // pixel and gone once a pixel covers a course; bays between posts differ a little in tone
            vec2 f = max(fwidth(vWallUV), vec2(1e-4));
            float course = floor(vWallUV.y / 0.25);
            vec2 cell = vec2(vWallUV.x / 0.5 + 0.5 * mod(course, 2.0), vWallUV.y / 0.25);
            vec2 d = (0.5 - abs(fract(cell) - 0.5)) * vec2(0.5, 0.25); // metres to the nearest joint
            vec2 j = clamp((0.0075 - d) / f + 0.5, 0.0, 1.0) * (1.0 - smoothstep(0.04, 0.12, f));
            float joint = max(j.x, j.y);
            float tone = 0.92 + 0.16 * fract(sin(dot(floor(vWallUV / vec2(${POST_MODULE.toFixed(1)}, 1e4)), vec2(12.9898, 78.233))) * 43758.5453);
            vec3 panel = vec3(0.24, 0.21, 0.17) * tone * (1.0 - 0.45 * joint);
            vec3 plinth = vec3(0.42, 0.41, 0.38);
            diffuseColor.rgb = mix(panel, plinth, 1.0 - smoothstep(${PLINTH.toFixed(2)} - 0.02, ${PLINTH.toFixed(2)} + 0.02, vWallUV.y));
          }`);
    };
    mat.customProgramCacheKey = () => 'noise-wall-panels';
    return mat;
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
