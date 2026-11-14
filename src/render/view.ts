// three.js terrain view: draped terrain chunks, route ribbon (cut/fill slopes, bridges, tunnels),
// centreline, tangent polygon, official D11, DOM markers and labels, heightfield picking.

import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Design, Result } from '../core/evaluate';
import { KIND } from '../core/structures';
import { OOB_BIT, type Terrain } from '../core/terrain';
import type { Pack } from '../scenario';
import { Buildings } from './buildings';
import { ContourLabels } from './contourLabels';
import { buildHeightLevels, buildHeightTexture } from './heightTexture';
import { LandCover } from './landcover';
import { makeEarthworkMaterial, makeTerrainMaterial, oobTexture, terrainUniforms } from './terrainMaterial';

export interface ViewEvents {
  onPickTerrain?: (x: number, y: number, clientX: number, clientY: number) => void;
  onPiDragStart?: (i: number) => void;
  onPiDrag?: (i: number, x: number, y: number) => void;
  onPiDragEnd?: (i: number) => void;
  onPiSelect?: (i: number | null) => void;
  onPiDelete?: (i: number) => void;
}

const COL = {
  earth: new THREE.Color(0xffb000), bridge: new THREE.Color(0x2f8fff), tunnel: new THREE.Color(0xa070ff),
  bad: new THREE.Color(0xff2a2a),
};

const SKY = 0xc9d6e2;

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: MapControls;
  readonly world = new THREE.Group();
  private readonly terrain: Terrain;
  private readonly cx: number;
  private readonly cy: number;
  private exag = 1;
  private dirty = true;
  private routeGroup = new THREE.Group();
  private polyLine: Line2 | null = null;
  private markers: { el: HTMLElement; x: number; y: number; z: number; minDist?: number }[] = [];
  private piMarkers: { el: HTMLElement; x: number; y: number; z: number }[] = [];
  private hoverEl: HTMLElement;
  private hoverPos: { x: number; y: number; z: number } | null = null;
  private selected: number | null = null;
  private meshStep: number;
  private dragging: number | null = null;
  // footprint mask: terrain fragments inside the at-grade footprint are discarded so cuts show
  private maskRT: THREE.WebGLRenderTarget | null = null;
  private maskScene = new THREE.Scene();
  private maskCam = new THREE.Camera();
  private maskUniforms = {
    maskTex: { value: null as THREE.Texture | null },
    maskBox: { value: new THREE.Vector4(0, 0, 1, 1) },
    maskOn: { value: 0 },
  };
  // terrain surface: shaded per pixel from the height texture, land cover from GPU-rasterised vectors
  private terrainU = terrainUniforms();
  private landcover: LandCover | null = null;
  private buildings: Buildings | null = null;
  private contours = false;
  private contourStep = 0;
  private contourLabels: ContourLabels | null = null;
  private maxTex = 0;
  /** the result the footprint mask was last drawn from (to redraw it after a lost WebGL context) */
  private maskSource: Result | null = null;
  private maskMat: THREE.ShaderMaterial | null = null;
  private retired: THREE.Material[] = [];
  /** called when the contour interval changes with the zoom (minor, major in metres) */
  onContourInterval: ((minor: number, major: number) => void) | null = null;
  ev: ViewEvents = {};
  /** called after every render, for overlays managed outside the view (curve handles) */
  onRender: (() => void) | null = null;

  constructor(private container: HTMLElement, private overlay: HTMLElement, private pack: Pack) {
    this.terrain = pack.terrain;
    this.cx = this.terrain.width / 2;
    this.cy = this.terrain.height / 2;
    this.meshStep = Number(new URLSearchParams(location.search).get('mesh') ?? 4);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(SKY);
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(45, 1, 5, 200000);
    this.scene.add(this.world);
    this.scene.fog = new THREE.Fog(SKY, 30000, 90000);
    this.world.add(this.routeGroup);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8470, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-1, 1.6, -0.8);
    this.scene.add(sun);
    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 80;
    this.controls.maxDistance = 60000;
    this.controls.zoomToCursor = true;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.hoverEl = document.createElement('div');
    this.hoverEl.className = 'hover-dot';
    this.hoverEl.style.display = 'none';
    overlay.appendChild(this.hoverEl);
    this.buildTerrain();
    this.buildOfficial();
    this.buildLabels();
    this.contourLabels = new ContourLabels(overlay, this.renderer.domElement, this.terrain, (x, y) => this.pick(x, y),
      (x, y, z) => this.screenOf(x, y, z), (x, y) => (this.inFootprint(x, y) ? null : this.meshHeight(x, y)), () => { this.dirty = true; });
    this.controls.addEventListener('change', () => this.contourLabels?.schedule(this.contourStep * 5));
    this.resetCamera();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.installPointer();
    const loop = () => {
      requestAnimationFrame(loop);
      if (this.controls.enabled) this.controls.update();
      if (this.dirty) { this.dirty = false; this.render(); }
    };
    loop();
  }

  // ---- coordinates ---------------------------------------------------------------------------
  /** local (x east, y north, z elevation) → position inside `world` (scaled by exaggeration) */
  local(x: number, y: number, z: number, v = new THREE.Vector3()) { return v.set(x - this.cx, z, -(y - this.cy)); }

  private screenOf(x: number, y: number, z: number): { sx: number; sy: number; vis: boolean; dist: number } {
    const v = this.local(x, y, z * this.exag);
    const dist = v.distanceTo(this.camera.position);
    v.project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { sx: (v.x * 0.5 + 0.5) * w, sy: (-v.y * 0.5 + 0.5) * h, vis: v.z < 1 && v.z > -1, dist };
  }

  /** screen position (px inside the view) of a local point; `vis` = in front of the camera */
  project(x: number, y: number, z: number) { return this.screenOf(x, y, z); }

  /** camera ray under a screen point in local coordinates (x east, y north, z elevation; `d` not unit) */
  rayAt(clientX: number, clientY: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    return { o: { x: o.x + this.cx, y: this.cy - o.z, z: o.y / this.exag }, d: { x: d.x, y: -d.z, z: d.y / this.exag } };
  }

  /** metres per screen pixel at the orbit target */
  get metresPerPixel() {
    const dist = this.camera.position.distanceTo(this.controls.target);
    return (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / (this.container.clientHeight || 1);
  }

  /** extruded buildings, if shown (noise view tints them) */
  get buildingMeshes() { return this.buildings; }

  /** ray-march the heightfield under a screen point; returns local (x,y) or null */
  pick(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const T = this.terrain;
    const above = (t: number) => {
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
      const x = px + this.cx, y = -pz + this.cy;
      return py - T.heightAt(x, y) * this.exag;
    };
    let t = 0, prev = 0, f0 = above(0);
    if (f0 < 0) return null;
    const tMax = 150000;
    while (t < tMax) {
      const step = Math.max(4, t * 0.003);
      prev = t; t += step;
      if (above(t) < 0) {
        let lo = prev, hi = t;
        for (let k = 0; k < 30; k++) { const m = 0.5 * (lo + hi); if (above(m) < 0) hi = m; else lo = m; }
        const x = o.x + d.x * hi + this.cx, y = -(o.z + d.z * hi) + this.cy;
        if (x < 0 || y < 0 || x > T.width || y > T.height) return null;
        return { x, y };
      }
    }
    return null;
  }

  // ---- terrain -------------------------------------------------------------------------------
  private buildTerrain() {
    const T = this.terrain, step = this.meshStep;
    // per-pixel inputs of the terrain shader
    const u = this.terrainU;
    // (?maxtex=4096 emulates a GPU with a small texture limit: the height texture then uses every 2nd sample)
    const limit = Number(new URLSearchParams(location.search).get('maxtex'));
    this.maxTex = Math.min(this.renderer.capabilities.maxTextureSize, limit >= 64 ? limit : Infinity);
    const ht = buildHeightTexture(this.pack.q, T.nx, T.ny, this.pack.meta.heights.scale, this.maxTex);
    // the texel data lives on the GPU from the first frame on; drop the CPU copies (~85 MB).
    // restoreSurface() rebuilds them if the WebGL context is lost.
    ht.tex.onUpdate = () => { for (const m of ht.tex.mipmaps as unknown as { data: unknown }[]) m.data = null; (ht.tex.image as { data: unknown }).data = null; };
    u.hTex.value = ht.tex;
    u.hInfo.value.set(ht.w, ht.h, T.cell * ht.stride, this.pack.meta.heights.base);
    this.renderer.domElement.addEventListener('webglcontextrestored', () => this.restoreSurface());
    u.areaSize.value.set(T.width, T.height);
    u.oobTex.value = oobTexture(T.lc, T.nx, T.ny, OOB_BIT);
    u.contour.value.w = this.renderer.getPixelRatio();
    const mat = makeTerrainMaterial(u, this.maskUniforms);
    if (this.pack.vectors) {
      const lc = this.landcover = new LandCover(this.renderer, this.pack.vectors, T.width, T.height, u);
      lc.onChange = () => { this.dirty = true; };
      const ortho = this.pack.meta.orthophoto, [ox, oy] = this.pack.meta.origin;
      if (ortho) {
        lc.setPhotoSource((x0, y0, w, h, pw, ph) => `${ortho.export}?bbox=${ox + x0},${oy + y0},${ox + x0 + w},${oy + y0 + h}`
          + `&bboxSR=${ortho.sr}&imageSR=${ortho.sr}&size=${pw},${ph}&format=jpg&f=image`);
      }
    }
    // mesh chunks (for frustum culling); positions only, the shader derives everything from world x/z
    const chunk = Math.ceil(512 / step) * step;
    const indexCache = new Map<string, THREE.BufferAttribute>();
    for (let row0 = 0; row0 < T.ny - 1; row0 += chunk) for (let col0 = 0; col0 < T.nx - 1; col0 += chunk) {
      const cols: number[] = [], rows: number[] = [];
      for (let c = col0; c < Math.min(T.nx - 1, col0 + chunk); c += step) cols.push(c);
      cols.push(Math.min(T.nx - 1, col0 + chunk));
      for (let r = row0; r < Math.min(T.ny - 1, row0 + chunk); r += step) rows.push(r);
      rows.push(Math.min(T.ny - 1, row0 + chunk));
      const nc = cols.length, nr = rows.length;
      const pos = new Float32Array(nc * nr * 3);
      for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) {
        const c = cols[i], r = rows[j];
        const x = (c + 0.5) * T.cell, y = T.height - (r + 0.5) * T.cell;
        const k = j * nc + i;
        pos[3 * k] = x - this.cx; pos[3 * k + 1] = T.sample(c, r); pos[3 * k + 2] = -(y - this.cy);
      }
      let index = indexCache.get(`${nc}x${nr}`);
      if (!index) {
        const idx = new Uint32Array((nc - 1) * (nr - 1) * 6);
        let p = 0;
        for (let j = 0; j < nr - 1; j++) for (let i = 0; i < nc - 1; i++) {
          const a = j * nc + i, b = a + 1, c = a + nc, d = c + 1;
          idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d;
        }
        indexCache.set(`${nc}x${nr}`, index = new THREE.BufferAttribute(idx, 1));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(index);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.name = 'terrain';
      m.matrixAutoUpdate = false;
      this.world.add(m);
    }
    const b = this.pack.vectors?.buildings;
    if (b && new URLSearchParams(location.search).get('buildings') !== '0') {
      this.buildings = new Buildings(b, this.pack.vectors!.chunk, {
        top: (x, y) => this.drapeHeight(x, y),
        bottom: (x, y) => Math.min(T.heightAt(x, y), this.meshHeight(x, y)),
      }, this.cx, this.cy);
      this.world.add(this.buildings.group);
    }
  }

  /**
   * After a lost WebGL context three.js re-uploads what it still has on the CPU; the height texels were
   * dropped after the first upload and the land-cover levels and the footprint mask exist only on the GPU.
   */
  private restoreSurface() {
    this.renderer.setClearColor(SKY); // three.js starts over with a black background
    const T = this.terrain, tex = this.terrainU.hTex.value as THREE.DataTexture;
    const lv = buildHeightLevels(this.pack.q, T.nx, T.ny, this.pack.meta.heights.scale, this.maxTex);
    tex.mipmaps = lv.mipmaps as unknown as THREE.DataTexture['mipmaps'];
    (tex.image as { data: unknown }).data = lv.mipmaps[0].data;
    tex.needsUpdate = true;
    this.landcover?.invalidate();
    if (this.maskSource) this.buildMask(this.maskSource);
    this.dirty = true;
  }

  /** inside the at-grade footprint of the designed road, where the terrain is cut away */
  private inFootprint(x: number, y: number): boolean {
    const r = this.maskSource;
    if (!r) return false;
    for (let i = 0; i < r.n; i++) {
      if (r.kind[i] !== KIND.earth) continue;
      const d = Math.max(r.dayL[i], r.dayR[i]) + 5;
      if (Math.abs(x - r.x[i]) < d && Math.abs(y - r.y[i]) < d && Math.hypot(x - r.x[i], y - r.y[i]) < d) return true;
    }
    return false;
  }

  // ---- view options --------------------------------------------------------------------------
  /** contour lines drawn in the terrain shader; the interval follows the zoom */
  setContours(on: boolean) { this.contours = on; this.contourStep = 0; this.dirty = true; }
  /** tint the ground by slope class (yellow from 8 %, orange 15 %, red 25 %, purple 40 %) */
  setSlopeTint(on: boolean) { this.terrainU.slopeTint.value = on ? 1 : 0; this.dirty = true; }
  /** drape the orthophoto (streamed per view from the scenario's image service) instead of the map layers */
  setPhoto(on: boolean) {
    this.landcover?.setPhoto(on);
    this.terrainU.shadeAmt.value = on && this.landcover?.hasPhotoSource ? 0.45 : 1;
    this.dirty = true;
  }
  get hasPhoto() { return !!this.landcover?.hasPhotoSource; }
  /** true while land-cover textures for the current camera are still being drawn or fetched */
  get busy() { return this.lcPending || !!this.landcover?.loadingPhotos; }
  private lcPending = false;

  /** per-frame upkeep of the terrain surface: land-cover clip levels, contour interval, building LOD */
  private updateSurface() {
    const t = this.controls.target, cam = this.camera;
    const dist = cam.position.distanceTo(t);
    const bufH = this.renderer.domElement.height || 1;
    const mPerPx = (2 * dist * Math.tan((cam.fov * Math.PI) / 360)) / bufH;
    this.lcPending = this.landcover ? this.landcover.update(t.x + this.cx, this.cy - t.z, mPerPx) : false;
    if (this.lcPending) this.dirty = true;
    this.buildings?.update(cam.position.x + this.cx, this.cy - cam.position.z);
    // contour interval by zoom: 5/25 m close, 10/50 m mid, 20/100 m far
    const c = this.terrainU.contour.value;
    const minor = dist < 2200 ? 5 : dist < 6500 ? 10 : 20;
    c.set(minor, minor * 5, this.contours ? 1 : 0, this.renderer.getPixelRatio());
    const step = this.contours ? minor : 0;
    if (step !== this.contourStep) {
      this.contourStep = step;
      if (step) this.onContourInterval?.(minor, minor * 5);
      this.contourLabels?.schedule(step * 5);
    }
  }

  /**
   * Height of the rendered (decimated) terrain surface — used to keep the ribbon visible. Uses the
   * same triangulation as the chunks (diagonal b–c). Exact where meshStep divides the tile size
   * (the default 4 does); tile edges clamp to the last row/column like the chunks do.
   */
  private meshHeight(x: number, y: number): number {
    const T = this.terrain, s = this.meshStep;
    const fc = (x / T.cell - 0.5) / s, fr = ((T.height - y) / T.cell - 0.5) / s;
    const c0 = Math.floor(fc), r0 = Math.floor(fr), tx = fc - c0, ty = fr - r0;
    const h = (c: number, r: number) => T.sample(Math.min(c * s, T.nx - 1), Math.min(r * s, T.ny - 1));
    const a = h(c0, r0), b = h(c0 + 1, r0), c = h(c0, r0 + 1), d = h(c0 + 1, r0 + 1);
    return tx + ty <= 1 ? a + (b - a) * tx + (c - a) * ty : d + (c - d) * (1 - tx) + (b - d) * (1 - ty);
  }

  private drapeHeight(x: number, y: number) { return Math.max(this.terrain.heightAt(x, y), this.meshHeight(x, y)); }
  /** height that clears both the true and the rendered terrain (for draped overlays) */
  drape(x: number, y: number) { return this.drapeHeight(x, y); }

  private makeLine(points: number[], colors: number[] | null, width: number, opts: Partial<{ color: number; opacity: number; depthTest: boolean; dashed: boolean; dashSize: number; gapSize: number; order: number }> = {}) {
    const g = new LineGeometry();
    g.setPositions(points);
    if (colors) g.setColors(colors);
    const m = new LineMaterial({
      color: opts.color ?? 0xffffff, linewidth: width, vertexColors: !!colors, transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1, depthTest: opts.depthTest ?? true, dashed: !!opts.dashed,
      dashSize: opts.dashSize ?? 30, gapSize: opts.gapSize ?? 20, worldUnits: false,
    });
    m.resolution.set(this.container.clientWidth, this.container.clientHeight);
    const l = new Line2(g, m);
    if (opts.dashed) l.computeLineDistances();
    l.renderOrder = opts.order ?? 1;
    return l;
  }

  private buildOfficial() {
    const pts: number[] = [];
    const xy = this.pack.meta.official.xy;
    for (let i = 0; i < xy.length; i++) {
      const [x, y] = xy[i];
      if (x < 0 || y < 0 || x > this.terrain.width || y > this.terrain.height) continue;
      const v = this.local(x, y, this.drapeHeight(x, y) + 3);
      pts.push(v.x, v.y, v.z);
    }
    if (pts.length >= 6) {
      const l = this.makeLine(pts, null, 2.5, { color: 0xffffff, opacity: 0.55, dashed: true, dashSize: 60, gapSize: 40 });
      l.name = 'official';
      this.world.add(l);
    }
  }

  private buildLabels() {
    const add = (cls: string, html: string, x: number, y: number, minDist?: number) => {
      const el = document.createElement('div');
      el.className = cls;
      el.innerHTML = html;
      this.overlay.appendChild(el);
      this.markers.push({ el, x, y, z: this.terrain.heightAt(x, y), minDist });
    };
    for (const p of this.pack.overlays.places) {
      if (p.kind === 'town' || p.kind === 'city') add('place town', p.name, p.x, p.y);
      else if (p.kind === 'village') add('place village', p.name, p.x, p.y, 30000);
      else if (p.kind === 'suburb') add('place suburb', p.name, p.x, p.y, 12000);
      else if (p.kind === 'hamlet') add('place hamlet', p.name, p.x, p.y, 7000);
    }
    const { A, B } = this.pack.meta;
    add('endpoint', '<b>A</b><span>Trutnov</span>', A.xy[0], A.xy[1]);
    add('endpoint', '<b>B</b><span>PL border</span>', B.xy[0], B.xy[1]);
    const legend = this.pack.meta.official.xy[Math.floor(this.pack.meta.official.xy.length * 0.33)];
    add('official-label', 'official D11', legend[0] + 150, legend[1], 25000);
  }

  // ---- route ---------------------------------------------------------------------------------
  setDesign(d: Design, selected: number | null) {
    const A = this.pack.meta.A.xy, B = this.pack.meta.B.xy;
    const pts = [{ x: A[0], y: A[1] }, ...d.pis, { x: B[0], y: B[1] }];
    // tangent polygon draped on terrain
    const arr: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      const n = Math.max(1, Math.ceil(L / 60));
      for (let k = 0; k <= n; k++) {
        if (k === 0 && i > 0) continue;
        const x = pts[i].x + (pts[i + 1].x - pts[i].x) * (k / n), y = pts[i].y + (pts[i + 1].y - pts[i].y) * (k / n);
        const v = this.local(x, y, this.drapeHeight(x, y) + 4);
        arr.push(v.x, v.y, v.z);
      }
    }
    if (this.polyLine) { this.world.remove(this.polyLine); this.polyLine.geometry.dispose(); this.retire(this.polyLine.material); }
    this.polyLine = this.makeLine(arr, null, 1.5, { color: 0xffffff, opacity: 0.8, depthTest: false, dashed: true, dashSize: 8, gapSize: 6, order: 3 });
    this.world.add(this.polyLine);
    // PI markers
    while (this.piMarkers.length > d.pis.length) this.piMarkers.pop()!.el.remove();
    while (this.piMarkers.length < d.pis.length) {
      const el = document.createElement('div');
      el.className = 'pi';
      const idx = this.piMarkers.length;
      el.dataset.i = String(idx);
      this.overlay.appendChild(el);
      this.piMarkers.push({ el, x: 0, y: 0, z: 0 });
    }
    d.pis.forEach((p, i) => {
      const m = this.piMarkers[i];
      m.x = p.x; m.y = p.y; m.z = this.terrain.heightAt(p.x, p.y);
      m.el.textContent = String(i + 1);
      m.el.classList.toggle('sel', selected === i);
    });
    this.selected = selected;
    this.dirty = true;
  }

  setResult(r: Result, crownWidth: number) {
    for (const c of [...this.routeGroup.children]) {
      this.routeGroup.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      this.retire(m.material as THREE.Material | THREE.Material[] | undefined);
    }
    const n = r.n, w = crownWidth / 2;
    const bad = new Uint8Array(n);
    for (const v of r.violations) {
      if (v.goal) continue;
      for (let i = 0; i < n; i++) if (r.s[i] >= v.s0 - r.ds && r.s[i] <= v.s1 + r.ds) bad[i] = 1;
    }
    // ---- ribbon (crown + slopes) and bridge decks ----
    const pos: number[] = [], col: number[] = [], idx: number[] = [], elev: number[] = [], ink: number[] = [];
    const v = new THREE.Vector3();
    // `e` = true elevation for the contour lines (the surface itself may be lifted), `k` = contour strength
    const push = (x: number, y: number, z: number, c: THREE.Color, e = z, k = 0) => {
      this.local(x, y, z, v); pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); elev.push(e); ink.push(k);
      return pos.length / 3 - 1;
    };
    const asphalt = new THREE.Color(0x3b3b42), asphaltBad = new THREE.Color(0x8a2020);
    const fillC = new THREE.Color(0xe3d27e), cutC = new THREE.Color(0xbf6a32), concrete = new THREE.Color(0xc4c2ba);
    const lift = 0.35;
    // contours on the cut / fill slopes join the terrain's at the daylight line; faint on the carriageway
    const slopeInk = 1, crownInk = 0.35;
    type SV = { dl: number; el: number; er: number; dr: number; cl: number; cr: number };
    const sv: SV[] = [];
    for (let i = 0; i < n; i++) {
      const x = r.x[i], y = r.y[i], nx = -r.ty[i], ny = r.tx[i], z = r.grade[i];
      const xl = x + nx * r.dayL[i], yl = y + ny * r.dayL[i], xr = x - nx * r.dayR[i], yr = y - ny * r.dayR[i];
      const fillL = r.zDayL[i] < z, fillR = r.zDayR[i] < z;
      const crown = bad[i] ? asphaltBad : asphalt;
      sv.push({
        dl: push(xl, yl, Math.max(r.zDayL[i], this.meshHeight(xl, yl)) + lift, fillL ? fillC : cutC, r.zDayL[i], slopeInk),
        el: push(x + nx * w, y + ny * w, z + lift, fillL ? fillC : cutC, z, slopeInk),
        cl: push(x + nx * w, y + ny * w, z + lift, crown, z, crownInk),
        cr: push(x - nx * w, y - ny * w, z + lift, crown, z, crownInk),
        er: push(x - nx * w, y - ny * w, z + lift, fillR ? fillC : cutC, z, slopeInk),
        dr: push(xr, yr, Math.max(r.zDayR[i], this.meshHeight(xr, yr)) + lift, fillR ? fillC : cutC, r.zDayR[i], slopeInk),
      });
    }
    const quad = (a: number, b: number, c: number, d: number) => { idx.push(a, b, c, b, d, c); };
    for (let i = 0; i < n - 1; i++) {
      const k0 = r.kind[i], k1 = r.kind[i + 1];
      if (k0 === KIND.tunnel || k1 === KIND.tunnel) continue;
      const a = sv[i], b = sv[i + 1];
      quad(a.cl, b.cl, a.cr, b.cr);
      if (k0 === KIND.earth && k1 === KIND.earth) {
        quad(a.dl, b.dl, a.el, b.el);
        quad(a.er, b.er, a.dr, b.dr);
      }
    }
    // bridge deck edges and piers, tunnel portals
    const deck = 2.2;
    const boxAt = (x: number, y: number, tx: number, ty: number, zb: number, zt: number, along: number, across: number, c: THREE.Color) => {
      const nx = -ty, ny = tx;
      const corners: number[] = [];
      for (const [sa, sc] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        corners.push(push(x + tx * along * sa + nx * across * sc, y + ty * along * sa + ny * across * sc, zb, c));
        corners.push(push(x + tx * along * sa + nx * across * sc, y + ty * along * sa + ny * across * sc, zt, c));
      }
      for (let f = 0; f < 4; f++) {
        const a0 = corners[2 * f], a1 = corners[2 * f + 1], b0 = corners[(2 * f + 2) % 8], b1 = corners[(2 * f + 3) % 8];
        idx.push(a0, b0, a1, b0, b1, a1);
      }
    };
    const shade = (c: THREE.Color, f: number) => c.clone().multiplyScalar(f);
    for (const run of r.runs) {
      if (run.kind === KIND.bridge) {
        for (let i = Math.max(0, run.i0 - 1); i <= Math.min(n - 2, run.i1); i++) {
          const x0 = r.x[i], y0 = r.y[i], x1 = r.x[i + 1], y1 = r.y[i + 1];
          for (const sgn of [1, -1]) {
            const nx0 = -r.ty[i] * sgn * w, ny0 = r.tx[i] * sgn * w, nx1 = -r.ty[i + 1] * sgn * w, ny1 = r.tx[i + 1] * sgn * w;
            const c = shade(concrete, sgn > 0 ? 0.95 : 0.75);
            const a0 = push(x0 + nx0, y0 + ny0, r.grade[i] + lift, c), a1 = push(x0 + nx0, y0 + ny0, r.grade[i] - deck, c);
            const b0 = push(x1 + nx1, y1 + ny1, r.grade[i + 1] + lift, c), b1 = push(x1 + nx1, y1 + ny1, r.grade[i + 1] - deck, c);
            idx.push(a0, b0, a1, b0, b1, a1);
          }
          // underside
          const u = shade(concrete, 0.55);
          const p0 = push(r.x[i] - r.ty[i] * w, r.y[i] + r.tx[i] * w, r.grade[i] - deck, u);
          const p1 = push(r.x[i] + r.ty[i] * w, r.y[i] - r.tx[i] * w, r.grade[i] - deck, u);
          const p2 = push(r.x[i + 1] - r.ty[i + 1] * w, r.y[i + 1] + r.tx[i + 1] * w, r.grade[i + 1] - deck, u);
          const p3 = push(r.x[i + 1] + r.ty[i + 1] * w, r.y[i + 1] - r.tx[i + 1] * w, r.grade[i + 1] - deck, u);
          idx.push(p0, p1, p2, p1, p3, p2);
        }
        const span = 40;
        const nP = Math.max(1, Math.round(run.length / span));
        for (let k = 1; k < nP; k++) {
          const i = Math.round(run.i0 + ((run.i1 - run.i0) * k) / nP);
          boxAt(r.x[i], r.y[i], r.tx[i], r.ty[i], r.ground[i] - 2, r.grade[i] - deck, 1.2, w * 0.55, shade(concrete, 0.85));
        }
      } else if (run.kind === KIND.tunnel) {
        for (const i of [Math.max(0, run.i0 - 1), Math.min(n - 1, run.i1 + 1)]) {
          boxAt(r.x[i], r.y[i], r.tx[i], r.ty[i], r.grade[i] - 0.5, r.grade[i] + 8, 1.5, w + 1.5, new THREE.Color(0x55555c));
          boxAt(r.x[i], r.y[i], r.tx[i], r.ty[i], r.grade[i], r.grade[i] + 6.5, 1.8, w - 0.5, new THREE.Color(0x111114));
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('elev', new THREE.Float32BufferAttribute(elev, 1));
    g.setAttribute('ink', new THREE.Float32BufferAttribute(ink, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.computeVertexNormals();
    this.buildMask(r);
    const ribbon = new THREE.Mesh(g, makeEarthworkMaterial(this.terrainU.contour, {
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }));
    ribbon.name = 'ribbon';
    this.routeGroup.add(ribbon);

    // ---- centreline (screen-space width so it reads at any zoom) ----
    const cp: number[] = [], cc: number[] = [];
    for (let i = 0; i < n; i++) {
      const tun = r.kind[i] === KIND.tunnel;
      const z = tun ? this.drapeHeight(r.x[i], r.y[i]) + 2 : r.grade[i] + 1.5;
      this.local(r.x[i], r.y[i], z, v);
      cp.push(v.x, v.y, v.z);
      const c = bad[i] ? COL.bad : r.kind[i] === KIND.bridge ? COL.bridge : tun ? COL.tunnel : COL.earth;
      cc.push(c.r, c.g, c.b);
    }
    const line = this.makeLine(cp, cc, 3.5, { order: 4 });
    line.name = 'centre';
    this.routeGroup.add(line);
    const ghost = this.makeLine(cp, cc, 2, { opacity: 0.35, depthTest: false, order: 2 });
    ghost.name = 'ghost';
    this.routeGroup.add(ghost);

    // ---- footprint demolitions (red squares) / noise buyouts (magenta diamonds) ----
    for (const [buildings, buyout] of [[r.demolished, false], [r.boughtOut, true]] as const) {
      if (!buildings.length) continue;
      const bp: number[] = [];
      for (const { j } of buildings) {
        const b = this.pack.overlays.buildings[j];
        this.local(b[0], b[1], this.drapeHeight(b[0], b[1]) + 6, v);
        bp.push(v.x, v.y, v.z);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      const material = new THREE.PointsMaterial({ color: buyout ? 0xc43c9b : 0xd7301f, size: buyout ? 11 : 8, sizeAttenuation: false, depthTest: false, depthWrite: false });
      if (buyout) {
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>',
            '#include <clipping_planes_fragment>\nif (abs(gl_PointCoord.x - 0.5) + abs(gl_PointCoord.y - 0.5) > 0.5) discard;');
        };
        material.customProgramCacheKey = () => 'noise-buyout-diamond';
      }
      const pts = new THREE.Points(pg, material);
      pts.name = buyout ? 'noise-buyouts' : 'footprint-demolitions';
      pts.renderOrder = 5;
      this.routeGroup.add(pts);
    }
    this.dirty = true;
  }

  /** render the at-grade footprint (slightly inset) top-down into the terrain discard mask */
  private buildMask(r: Result) {
    this.maskSource = r;
    this.contourLabels?.schedule(this.contourStep * 5); // labels keep off the carved footprint
    const n = r.n;
    const pos: number[] = [];
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    const P: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const nx = -r.ty[i], ny = r.tx[i];
      const il = Math.min(2.5, 0.3 * r.dayL[i]), ir = Math.min(2.5, 0.3 * r.dayR[i]);
      const L = r.dayL[i] - il, R = r.dayR[i] - ir;
      const a: [number, number] = [r.x[i] + nx * L - this.cx, -(r.y[i] + ny * L - this.cy)];
      const b: [number, number] = [r.x[i] - nx * R - this.cx, -(r.y[i] - ny * R - this.cy)];
      P.push(a, b);
      for (const p of [a, b]) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
    }
    for (let i = 0; i < n - 1; i++) {
      if (r.kind[i] !== KIND.earth || r.kind[i + 1] !== KIND.earth) continue;
      const a0 = P[2 * i], b0 = P[2 * i + 1], a1 = P[2 * i + 2], b1 = P[2 * i + 3];
      pos.push(a0[0], 0, a0[1], b0[0], 0, b0[1], a1[0], 0, a1[1], b0[0], 0, b0[1], b1[0], 0, b1[1], a1[0], 0, a1[1]);
    }
    minX -= 20; minZ -= 20; maxX += 20; maxZ += 20;
    const maxTex = Math.min(8192, this.renderer.capabilities.maxTextureSize);
    const w = Math.min(maxTex, Math.ceil((maxX - minX) / 2.5 / 256) * 256);
    const h = Math.min(maxTex, Math.ceil((maxZ - minZ) / 2.5 / 256) * 256);
    if (!this.maskRT || this.maskRT.width < w || this.maskRT.height < h) {
      this.maskRT?.dispose();
      this.maskRT = new THREE.WebGLRenderTarget(Math.max(w, this.maskRT?.width ?? 0), Math.max(h, this.maskRT?.height ?? 0), {
        format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: false,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
      });
    }
    const rt = this.maskRT;
    const box = this.maskUniforms.maskBox.value.set(minX, minZ, maxX - minX, maxZ - minZ);
    for (const c of [...this.maskScene.children]) { this.maskScene.remove(c); (c as THREE.Mesh).geometry.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // one material for the life of the view (a new one per edit would recompile its shader every time)
    const mat = this.maskMat ??= new THREE.ShaderMaterial({
      uniforms: { box: { value: box } },
      vertexShader: 'uniform vec4 box; void main() { vec2 p = (position.xz - box.xy) / box.zw; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }',
      fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
      side: THREE.DoubleSide, depthTest: false, depthWrite: false,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    this.maskScene.add(mesh);
    const prevTarget = this.renderer.getRenderTarget();
    const prevClear = this.renderer.getClearColor(new THREE.Color()), prevAlpha = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.maskScene, this.maskCam);
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(prevClear, prevAlpha);
    this.maskUniforms.maskTex.value = rt.texture;
    this.maskUniforms.maskOn.value = pos.length ? 1 : 0;
  }

  setHover(p: { x: number; y: number; z: number } | null) { this.hoverPos = p; this.dirty = true; }

  setExaggeration(e: number) {
    this.exag = e;
    this.world.scale.y = e;
    this.terrainU.exag.value = e;
    this.contourLabels?.schedule(this.contourStep * 5);
    for (const m of this.markers) m.z = this.terrain.heightAt(m.x, m.y);
    this.dirty = true;
  }

  // ---- camera --------------------------------------------------------------------------------
  resetCamera() {
    const A = this.pack.meta.A.xy, B = this.pack.meta.B.xy;
    const mx = A[0] + (B[0] - A[0]) * 0.45, my = A[1] + (B[1] - A[1]) * 0.45;
    const t = this.local(mx, my, 500);
    this.controls.target.copy(t);
    this.camera.position.set(t.x + 2500, t.y + 17500, t.z + 14000);
    this.controls.update();
    this.dirty = true;
  }

  /** look at local (x,y) from `dist` metres, from the given compass bearing (deg, camera → target) */
  lookAt(x: number, y: number, dist = 2500, bearing = 0, elevationDeg = 40) {
    const z = this.terrain.heightAt(x, y) * this.exag;
    const t = this.local(x, y, 0);
    t.y = z;
    const br = (bearing * Math.PI) / 180, el = (elevationDeg * Math.PI) / 180;
    // camera placed opposite to the viewing bearing
    const dx = -Math.sin(br) * Math.cos(el) * dist, dy = -Math.cos(br) * Math.cos(el) * dist;
    this.controls.target.copy(t);
    this.camera.position.set(t.x + dx, t.y + Math.sin(el) * dist, t.z - dy);
    this.controls.update();
    this.dirty = true;
  }

  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  requestRender() { this.dirty = true; }

  /**
   * Dispose a replaced material after the next frame. three.js deletes a shader program together with
   * the last material using it, so disposing the old route materials before their replacements have
   * been drawn would recompile the same programs on every edit (≈ 15 ms each time).
   */
  retire(m: THREE.Material | THREE.Material[] | undefined | null) {
    if (Array.isArray(m)) this.retired.push(...m); else if (m) this.retired.push(m);
  }

  private render() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.world.traverse((o) => { if ((o as Line2).isLine2) ((o as Line2).material as LineMaterial).resolution.set(w, h); });
    // the screen-space centreline is for orientation; close up it would hide the ribbon
    const dist = this.camera.position.distanceTo(this.controls.target);
    const centre = this.routeGroup.getObjectByName('centre') as Line2 | undefined;
    const ghost = this.routeGroup.getObjectByName('ghost') as Line2 | undefined;
    if (centre) (centre.material as LineMaterial).linewidth = dist < 1200 ? 1 : dist < 4000 ? 2.5 : 3.5;
    if (ghost) ghost.visible = dist > 1200;
    this.updateSurface();
    this.renderer.render(this.scene, this.camera);
    if (this.retired.length) { for (const m of this.retired) m.dispose(); this.retired.length = 0; }
    const place = (el: HTMLElement, x: number, y: number, z: number, minDist?: number) => {
      const s = this.screenOf(x, y, z);
      const show = s.vis && (minDist === undefined || s.dist < minDist);
      el.style.display = show ? '' : 'none';
      if (show) el.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px)`;
    };
    for (const m of this.markers) place(m.el, m.x, m.y, m.z, m.minDist);
    for (const m of this.piMarkers) place(m.el, m.x, m.y, m.z);
    this.contourLabels?.place();
    if (this.hoverPos) place(this.hoverEl, this.hoverPos.x, this.hoverPos.y, this.hoverPos.z);
    else this.hoverEl.style.display = 'none';
    this.onRender?.();
  }

  // ---- pointer -------------------------------------------------------------------------------
  private installPointer() {
    const canvas = this.renderer.domElement;
    let down: { x: number; y: number; btn: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, btn: e.button }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (down.btn === 0 && moved < 5) {
        const p = this.pick(e.clientX, e.clientY);
        if (p) this.ev.onPickTerrain?.(p.x, p.y, e.clientX, e.clientY);
      }
      down = null;
    });
    this.overlay.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest('.pi') as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const i = Number(el.dataset.i);
      if (e.button === 2) { this.ev.onPiDelete?.(i); return; }
      this.ev.onPiSelect?.(i);
      this.dragging = i;
      this.controls.enabled = false;
      el.setPointerCapture(e.pointerId);
      let started = false;
      const move = (ev: PointerEvent) => {
        const p = this.pick(ev.clientX, ev.clientY);
        if (!p || this.dragging === null) return;
        if (!started) { started = true; this.ev.onPiDragStart?.(i); }
        const m = this.piMarkers[i];
        m.x = p.x; m.y = p.y; m.z = this.terrain.heightAt(p.x, p.y);
        this.dirty = true;
        this.ev.onPiDrag?.(i, p.x, p.y);
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        this.controls.enabled = true;
        this.dragging = null;
        if (started) this.ev.onPiDragEnd?.(i);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
    this.overlay.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get selectedPi() { return this.selected; }
}
