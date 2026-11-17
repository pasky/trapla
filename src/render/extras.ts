// Route overlays driven by the cost model, kept apart from view.ts: the highlighted station range
// picked for the cost breakdown (main.ts select()) and the noise walls (Result.walls) with their
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
import { culvertPlans, type CulvertPlan } from './culvert-geometry';
import { culvertMeshData } from './culverts';

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
  /** stream culverts (culverts.ts), and where they stand for picking */
  private culverts = new THREE.Group();
  private culvertPlans: CulvertPlan[] = [];
  /** each culvert's mesh by what it is built from (an edit elsewhere keeps it), one material for all */
  private culvertMeshes = new Map<string, THREE.Mesh>();
  private culvertMaterial: THREE.Material | null = null;
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
    this.culverts.name = 'culverts';
    view.world.add(this.walls, this.symbols, this.highlight, this.manual, this.culverts);
    this.removeFrame = view.addRenderListener(() => this.updateSymbols());
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    for (const group of [this.walls, this.symbols, this.highlight, this.manual, this.culverts]) group.visible = visible;
    if (visible) this.symbolScale = -1;
    this.view.requestRender();
  }
  reset() {
    this.r = null; this.range = null; this.wallHits = []; this.culvertPlans = [];
    for (const group of [this.walls, this.symbols, this.highlight, this.manual]) this.clear(group);
    for (const mesh of this.culvertMeshes.values()) { this.culverts.remove(mesh); mesh.geometry.dispose(); }
    this.culvertMeshes.clear();
    this.view.retire(this.culvertMaterial ?? undefined); this.culvertMaterial = null;
  }
  dispose() {
    this.reset(); this.removeFrame();
    this.view.world.remove(this.walls, this.symbols, this.highlight, this.manual, this.culverts); this.view.requestRender();
  }

  setResult(r: Result, crownWidth: number, overrides: readonly StructureOverride[] = [], wallOverrides: readonly WallOverride[] = []) {
    const culverts = this.r?.waterCrossings !== r.waterCrossings;
    this.r = r; this.crown = crownWidth; this.buildWalls(); this.buildManual(overrides, wallOverrides); this.buildHighlight();
    if (culverts) this.buildCulverts();
  }

  /** the stream culverts of the settled result (culverts.ts); unchanged ones keep their meshes */
  private buildCulverts() {
    const r = this.r;
    this.culvertPlans = r ? culvertPlans(r, this.view.watercourses, (x, y) => this.view.groundHeight(x, y)) : [];
    const next = new Map<string, THREE.Mesh>(), v = new THREE.Vector3();
    for (const plan of this.culvertPlans) {
      const key = JSON.stringify(plan, (_, x) => (typeof x === 'number' ? Math.round(x * 1000) : x));
      let mesh = this.culvertMeshes.get(key) ?? next.get(key);
      if (!mesh) {
        const data = culvertMeshData([plan], (x, y) => this.view.groundHeight(x, y), (x, y, z) => this.view.local(x, y, z, v));
        const g = new THREE.BufferGeometry();
        for (const [name, size] of [['position', 3], ['color', 3], ['elev', 1], ['ink', 1], ['ewKind', 1], ['ewGeo', 3]] as const)
          g.setAttribute(name, new THREE.Float32BufferAttribute(data[name], size));
        g.computeVertexNormals(); g.computeBoundingSphere();
        // the earthwork material: the earth over the ends textured and lit as our slopes are, the concrete as structures
        mesh = new THREE.Mesh(g, this.culvertMaterial ??= this.culvertMat());
        mesh.name = 'culvert-structures';
        this.culverts.add(mesh);
      }
      next.set(key, mesh);
    }
    for (const [key, mesh] of this.culvertMeshes) if (!next.has(key)) { this.culverts.remove(mesh); mesh.geometry.dispose(); }
    this.culvertMeshes = next;
    this.view.requestRender();
  }

  /** The earthwork material with a constant depth offset only: a slope-scaled one (as crossing roads have) lifts
   * the barrel's walls, seen edge-on from above, through the slope over them. */
  private culvertMat() {
    const m = this.view.crossingEarthMaterial();
    m.polygonOffsetFactor = 0; m.polygonOffsetUnits = -2;
    return m;
  }

  /** the culvert whose end (headwall, wings, apron) is drawn under a screen point, if close enough to see it */
  culvertAt(clientX: number, clientY: number, tol = 8): CulvertPlan | null {
    if (!this.visible || this.view.metresPerPixel > 1.5) return null;
    const rect = this.view.renderer.domElement.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    let best: CulvertPlan | null = null, bestD = Infinity;
    for (const p of this.culvertPlans) for (const e of p.ends) {
      // the end's middle, out over its apron, and its reach on screen (its half-width)
      const mid = this.view.project(e.x + e.ox, e.y + e.oy, e.z + p.height / 2), side = this.view.project(e.x - e.oy * (p.width / 2 + 1.5), e.y + e.ox * (p.width / 2 + 1.5), e.z + p.height / 2);
      if (!mid.vis) continue;
      const d = Math.hypot(mid.sx - mx, mid.sy - my), reach = Math.max(tol, Math.hypot(side.sx - mid.sx, side.sy - mid.sy));
      if (d <= reach && d < bestD) { bestD = d; best = p; }
    }
    return best;
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
      const path = this.wallPath({ ...o, s0, s1, i0, i1 }, 'wall', o.height + .15);
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

  /** Points along a wall stretch beside the axis: local x, y, z triplets. `off`: 'wall' = on the wall's own
   * line (crown / deck edge, or the top edge of a cut: Result.noise.source) plus `extra` metres, or a fixed
   * offset; z = grade + `dz`, plus the wall's foot when on its line. Includes the cell boundaries so even a
   * single-cell wall has a visible, full-length face. */
  private wallPath(w: Pick<WallStretch, 'side' | 's0' | 's1' | 'i0' | 'i1'>, off: 'wall' | number, dz: number, at?: readonly number[], extra = 0): number[] {
    const r = this.r!, sgn = w.side === 'L' ? 1 : -1, out: number[] = [];
    const stations = at ?? this.wallStations(w), side = this.wallSide(w.side);
    for (const s of stations) {
      const i = Math.min(r.n - 2, Math.max(0, Math.floor(s / r.ds))), t = Math.max(0, Math.min(1, (s - r.s[i]) / r.ds));
      const lerp = (a: ArrayLike<number>) => a[i] + t * (a[i + 1] - a[i]);
      const tx = lerp(r.tx), ty = lerp(r.ty), norm = Math.hypot(tx, ty) || 1;
      const o = (off === 'wall' ? (side ? lerp(side.wallOff) : this.crown / 2 + NOISE.wallEdgeOffset) : off) + extra;
      const foot = off === 'wall' && side ? lerp(side.wallFoot) : 0;
      out.push(lerp(r.x) - ty / norm * o * sgn, lerp(r.y) + tx / norm * o * sgn, lerp(r.grade) + foot + dz);
    }
    return out;
  }

  private wallSide(side: 'L' | 'R') {
    const src = this.r?.noise?.source;
    return src ? (side === 'L' ? src.L : src.R) : null;
  }

  /** stations of a wall's outline: its ends and the cell boundaries between */
  private wallStations(w: Pick<WallStretch, 's0' | 's1' | 'i0' | 'i1'>): number[] {
    const r = this.r!;
    return [w.s0, ...Array.from({ length: w.i1 - w.i0 + 1 }, (_, k) => r.s[w.i0 + k]), w.s1]
      .filter((s, i, a) => i === 0 || s !== a[i - 1]);
  }

  /** The panel's visible foot: on a cut's top edge it stands on that ground (its plinth a little into it);
   * beside an embankment's crown it reaches down onto the side slope instead of leaving a road-level panel
   * suspended above a descending embankment. `z` = the billed foot (grade + wallFoot). */
  private wallFoot(w: WallStretch, s: number, z: number): number {
    const r = this.r!, i = Math.min(r.n - 1, Math.max(0, Math.round(s / r.ds))), side = this.wallSide(w.side);
    if (r.kind[i] !== KIND.earth) return z;
    if (side && side.wallFoot[i] > 0) return z - 0.3;
    const day = w.side === 'L' ? r.dayL[i] : r.dayR[i], zDay = w.side === 'L' ? r.zDayL[i] : r.zDayR[i];
    const off = side ? side.wallOff[i] : this.crown / 2 + NOISE.wallEdgeOffset;
    const t = Math.max(0, Math.min(1, (off - this.crown / 2) / Math.max(.1, day - this.crown / 2)));
    return Math.min(z, z + (zDay - r.grade[i]) * t);
  }

  /** noise walls: lit panels along the crown edge from the slope to the billed top, steel posts */
  private buildWalls() {
    this.clear(this.walls);
    this.symbolScale = -1;
    const r = this.r;
    if (!r) return;
    const v = new THREE.Vector3();
    // panels: `wallUV` = metres along the wall, metres above its foot (plinth, absorber courses)
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const posts: THREE.Matrix4[] = [];
    for (const w of r.walls) {
      const stations = this.wallStations(w), base = this.wallPath(w, 'wall', 0, stations), feet: number[] = [];
      for (let j = 0; j < stations.length; j++) {
        const x = base[3 * j], y = base[3 * j + 1], z = base[3 * j + 2], foot = this.wallFoot(w, stations[j], z);
        feet.push(foot);
        this.view.local(x, y, foot, v); pos.push(v.x, v.y, v.z); uv.push(stations[j], 0);
        this.view.local(x, y, z + w.height, v); pos.push(v.x, v.y, v.z); uv.push(stations[j], z + w.height - foot);
        if (j > 0) { const k = pos.length / 3 - 4; idx.push(k, k + 2, k + 1, k + 2, k + 3, k + 1); }
      }
      // on a bridge the wall stands on the deck's edge beam: draw the beam out from the crown to the
      // wall (top and outer face), else the wall would hang in the air beside the deck
      const crownEdge = this.wallPath(w, this.crown / 2, 0, stations);
      for (let j = 0; j + 1 < stations.length; j++) {
        const onBridge = (s: number) => r.kind[Math.min(r.n - 1, Math.round(s / r.ds))] === KIND.bridge;
        if (!onBridge(stations[j]) || !onBridge(stations[j + 1])) continue;
        const out = this.wallPath(w, 'wall', 0, [stations[j], stations[j + 1]], POST_W), k = pos.length / 3;
        for (const [p, a] of [[crownEdge, 3 * j], [crownEdge, 3 * j + 3], [out, 0], [out, 3]] as const) {
          this.view.local(p[a], p[a + 1], p[a + 2] + 0.35, v); pos.push(v.x, v.y, v.z); uv.push(0, 0);
        }
        for (const a of [0, 3]) { this.view.local(out[a], out[a + 1], out[a + 2] - 0.6, v); pos.push(v.x, v.y, v.z); uv.push(0, 0); }
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3, k + 2, k + 4, k + 3, k + 3, k + 4, k + 5);
      }
      // posts on the 4 m module, from the panel's foot to just above its top (stations are along the
      // axis; the wall is beside it, so the module is right within a few per cent)
      const n = Math.max(1, Math.round((w.s1 - w.s0) / POST_MODULE)), at: number[] = [];
      for (let k = 0; k <= n; k++) at.push(w.s0 + (w.s1 - w.s0) * k / n);
      const pp = this.wallPath(w, 'wall', 0, at);
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
    const far = mpp > SYMBOL_FROM;
    // at the overview (≥ 6 m per pixel) thin lines close to the road: walls are a detail there, the
    // route itself must stay the most visible thing
    const overview = mpp > 6, px = overview ? 4 : SYMBOL_PX;
    const symOff = px * 2 ** (scale / 4), v = new THREE.Vector3();
    for (const w of r.walls) {
      // hover target: the symbol from afar (no closer than the wall line), the wall top close up
      const side = this.wallSide(w.side);
      let line = this.crown / 2 + NOISE.wallEdgeOffset;
      if (side) for (let i = w.i0; i <= w.i1; i++) line = Math.max(line, side.wallOff[i]);
      const pts = far ? this.wallPath(w, Math.max(line, symOff), w.height) : this.wallPath(w, 'wall', w.height);
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
