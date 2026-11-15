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
import { crossingBaseHeight, crossingSurfaces, endCollars, footprintSurfaces, groundSegment, turnaroundSurfaces, turnaroundMaskRing, type CrossingSurface } from './crossing-surface';
import { finish, type Staged } from './slices';
import { COLLAR_OVERLAP, GROUND_COLLAR, collarPoint, daylightPoint, daylightSections, groundBlend, type GroundCorridor } from './earthwork-surface';
import { EW_KIND, makeEarthworkMaterial, makeTerrainMaterial, oobTexture, terrainUniforms } from './terrainMaterial';
import { structureFootprints } from '../core/footprint';
import { bridgeDeckSpans, bridgeDeckSegments, bridgePierTop } from './bridge-surface';

export interface ViewEvents {
  onPickTerrain?: (x: number, y: number, clientX: number, clientY: number, forceBend: boolean) => void;
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

/** stations within a (non-goal) violation, drawn red */
function badStations(r: Result) {
  const bad = new Uint8Array(r.n);
  for (const v of r.violations) {
    if (v.goal) continue;
    for (let i = 0; i < r.n; i++) if (r.s[i] >= v.s0 - r.ds && r.s[i] <= v.s1 + r.ds) bad[i] = 1;
  }
  return bad;
}

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
  private crossingCutRT: THREE.WebGLRenderTarget | null = null;
  private originalMaskRT: THREE.WebGLRenderTarget | null = null;
  readonly crossingCut = { maskTex: { value: null as THREE.Texture | null }, maskBox: { value: new THREE.Vector4() }, maskOn: { value: 0 } };
  readonly originalMask = { maskTex: { value: null as THREE.Texture | null }, maskBox: { value: new THREE.Vector4() }, maskOn: { value: 0 } };
  crossingSurfaces: CrossingSurface[] = [];
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
  /** one material per shader program that would otherwise lose its last user (see release) */
  private keepers = new Map<string, THREE.Material>();
  /** called when the contour interval changes with the zoom (minor, major in metres) */
  onContourInterval: ((minor: number, major: number) => void) | null = null;
  ev: ViewEvents = {};
  /** called after every render, for overlays managed outside the view (curve handles) */
  onRender: (() => void) | null = null;

  constructor(private container: HTMLElement, private overlay: HTMLElement, private pack: Pack,
    private labels: { a: string; b: string; official: string } = { a: 'A', b: 'B', official: 'official line' }) {
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
    this.controls.zoomToCursor = true; // touch pinch; wheel and trackpad pinch go through zoomAt (installWheel)
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
    this.installWheel();
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

  /** camera distance to the orbit target (m) */
  get cameraDistance() { return this.camera.position.distanceTo(this.controls.target); }

  /** metres per screen pixel at the orbit target */
  get metresPerPixel() {
    const dist = this.camera.position.distanceTo(this.controls.target);
    return (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / (this.container.clientHeight || 1);
  }

  /** extruded buildings, if shown (noise view tints them) */
  get buildingMeshes() { return this.buildings; }

  private meshOf = new Map<number, number>();
  /** render mesh index of the engine's building j (−1: none), cached */
  buildingMesh(j: number): number {
    let k = this.meshOf.get(j);
    if (k === undefined) {
      const b = this.pack.overlays.buildings[j], f = this.pack.overlays.binfo?.[j];
      k = b ? this.buildings?.find(f ? f[3] : b[0], f ? f[4] : b[1]) ?? -1 : -1;
      if (k < 0 && f && b) k = this.buildings?.find(b[0], b[1]) ?? -1;
      this.meshOf.set(j, k);
    }
    return k;
  }

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
    // three.js forgot every program with the context: kept materials would only block new keepers
    this.keepers.clear();
    if (this.maskSource) this.buildMask(this.maskSource);
    this.dirty = true;
  }

  /** inside the at-grade footprint of the designed road, where the terrain is cut away */
  private inFootprint(x: number, y: number): boolean {
    const r = this.maskSource;
    if (!r) return false;
    for (let i = 0; i < r.n; i++) {
      if (r.kind[i] !== KIND.earth) continue;
      const d = Math.max(r.dayL[i], r.dayR[i]) + GROUND_COLLAR;
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
  groundHeight(x: number, y: number) { return this.terrain.heightAt(x, y); }
  private groundBlend = (_x: number, _y: number) => 1;
  replacementHeight(x: number, y: number) {
    const z = this.groundHeight(x,y);
    return z + (this.drape(x,y)-z)*this.groundBlend(x,y);
  }
  crossingGeology(x: number, y: number, z: number) {
    const profile = this.terrain.groundAt(x,y), depth = this.terrain.heightAt(x,y)-z;
    return profile.normMix ? [-3,-3] : [depth-profile.classIto, depth-profile.classIIto];
  }
  crossingEarthMaterial() { return makeEarthworkMaterial(this.terrainU, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); }
  crossingGroundMaterial() {
    const material = makeTerrainMaterial(this.terrainU, this.originalMask);
    material.side = THREE.DoubleSide;
    return material;
  }

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
    add('endpoint', `<b>A</b><span>${this.labels.a}</span>`, A.xy[0], A.xy[1]);
    add('endpoint', `<b>B</b><span>${this.labels.b}</span>`, B.xy[0], B.xy[1]);
    const legend = this.pack.meta.official.xy[Math.floor(this.pack.meta.official.xy.length * 0.33)];
    add('official-label', this.labels.official, legend[0] + 150, legend[1], 25000);
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
      m.el.title = `Bend ${i + 1}: drag to move it, click to select it (radius grips), right-click to delete`;
      m.el.classList.toggle('sel', selected === i);
    });
    this.selected = selected;
    this.dirty = true;
  }

  setResult(r: Result, crownWidth: number) { finish(this.buildResult(r, crownWidth)).commit(); }

  /**
   * The full result's route geometry, built in steps (each `yield` is a point where a cooperative
   * scheduler may hand the main thread back to input and rendering) without changing what is
   * shown. The result is staged: `commit()` swaps it in, `dispose()` throws it away. Abandoning the
   * generator (`return()`) disposes too. `crossingSurfaces` and the ground blend are staged on the
   * view while building (the crossing renderer builds from them; nothing displayed reads them until
   * the commit's buildMask); a dispose restores the previous ones.
   */
  *buildResult(r: Result, crownWidth: number): Generator<void, Staged> {
    const previous = { surfaces: this.crossingSurfaces, blend: this.groundBlend };
    const out: THREE.Object3D[] = [];
    let handedOver = false, settled = false;
    const dispose = () => {
      if (settled) return;
      settled = true;
      const keep = [this.collarMaterial(), this.ribbonMaterial()];
      for (const o of out) {
        (o as THREE.Mesh).geometry?.dispose();
        const mats = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        // never drawn: no program shared with a successor yet, dispose at once
        for (const mat of Array.isArray(mats) ? mats : mats ? [mats] : []) if (!keep.includes(mat)) mat.dispose();
      }
      this.crossingSurfaces = previous.surfaces; this.groundBlend = previous.blend;
    };
    try {
    const natural = (x: number, y: number) => this.terrain.heightAt(x, y);
    const surfaces: CrossingSurface[] = [], base = crossingBaseHeight(r, crownWidth, natural);
    for (const c of r.crossings) { surfaces.push(...crossingSurfaces([c], natural, base)); yield; }
    for (const c of r.footprintConflicts ?? []) { surfaces.push(...footprintSurfaces([c], natural)); yield; }
    this.crossingSurfaces = surfaces;
    yield;
    const corridors: GroundCorridor[] = [];
    for (const surface of this.crossingSurfaces) for (let i = 0; i+1 < surface.sections.length; i++) {
      if (!groundSegment(surface,i)) continue;
      const a = surface.sections[i], b = surface.sections[i+1];
      const width = Math.max(...[a,b].flatMap(s => s.toe.map(p => Math.hypot(p.x-s.p.x,p.y-s.p.y))));
      corridors.push({ a: a.p, b: b.p, width });
    }
    for (const head of turnaroundSurfaces(this.crossingSurfaces,natural)) corridors.push({ a: head.center, b: head.center, width: head.radius });
    this.groundBlend = groundBlend(corridors);
    yield;
    const n = r.n, w = crownWidth / 2;
    const bad = badStations(r);
    // ---- ribbon (crown + slopes) and bridge decks ----
    const pos: number[] = [], col: number[] = [], idx: number[] = [], elev: number[] = [], ink: number[] = [];
    const kinds: number[] = [], geo: number[] = [];
    const v = new THREE.Vector3();
    // `e` = true elevation for the contour lines (the surface itself may be lifted), `k` = contour strength,
    // `kind` = EW_KIND, `g` = [depth below the class II top, below the class III top, station] (slopes)
    const noGeo = [0, 0, 0];
    const push = (x: number, y: number, z: number, c: THREE.Color, e = z, k = 0, kind: number = EW_KIND.structure, g = noGeo) => {
      this.local(x, y, z, v); pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); elev.push(e); ink.push(k);
      kinds.push(kind); geo.push(g[0], g[1], g[2]);
      return pos.length / 3 - 1;
    };
    const asphalt = new THREE.Color(0x3b3b42), asphaltBad = new THREE.Color(0x8a2020);
    // slope colours are only nominal: the earthwork shader textures cut / fill slopes itself (EW_KIND)
    const fillC = new THREE.Color(0x8aa95a), cutC = new THREE.Color(0x9e7859), concrete = new THREE.Color(0xc4c2ba);
    const lift = 0.35, groundLift = .015;
    // contours on the cut / fill slopes join the terrain's at the daylight line; faint on the carriageway
    const slopeInk = 1, crownInk = 0.35;
    type SV = { dl: number; el: number; er: number; dr: number; cl: number; cr: number; wl?: number; wr?: number };
    const sv: SV[] = [];
    for (let i = 0; i < n; i++) {
      const x = r.x[i], y = r.y[i], nx = -r.ty[i], ny = r.tx[i], z = r.grade[i];
      const xl = x + nx * r.dayL[i], yl = y + ny * r.dayL[i], xr = x - nx * r.dayR[i], yr = y - ny * r.dayR[i];
      const fillL = r.zDayL[i] < z, fillR = r.zDayR[i] < z;
      const crown = bad[i] ? asphaltBad : asphalt;
      // depth below the station's estimated class II / III tops (linear across the slope, so it
      // interpolates); unmapped ground: a finite "above the tops" (soil, fading in over one station)
      const gp = r.geology.profiles[r.geology.ids[i]];
      const geoAt = (depth: number) => (gp.normMix ? [-3, -3, r.s[i]] : [depth - gp.classIto, depth - gp.classIIto, r.s[i]]);
      const kL = fillL ? EW_KIND.fill : EW_KIND.cut, kR = fillR ? EW_KIND.fill : EW_KIND.cut;
      const xel = x + nx * w, yel = y + ny * w, xer = x - nx * w, yer = y - ny * w;
      sv.push({
        dl: push(xl, yl, natural(xl, yl) + groundLift, fillL ? fillC : cutC, r.zDayL[i], slopeInk, kL, geoAt(0)),
        wl: Number.isFinite(r.wallSurfaceL?.[i]) ? push(xl, yl, r.wallSurfaceL[i]+groundLift, fillL ? fillC : cutC, r.wallSurfaceL[i], slopeInk, kL, geoAt(natural(xl,yl)-r.wallSurfaceL[i])) : undefined,
        el: push(xel, yel, z + lift, fillL ? fillC : cutC, z, slopeInk, kL, geoAt(this.terrain.heightAt(xel, yel) - z)),
        cl: push(xel, yel, z + lift, crown, z, crownInk, EW_KIND.crown),
        cr: push(xer, yer, z + lift, crown, z, crownInk, EW_KIND.crown),
        er: push(xer, yer, z + lift, fillR ? fillC : cutC, z, slopeInk, kR, geoAt(this.terrain.heightAt(xer, yer) - z)),
        dr: push(xr, yr, natural(xr, yr) + groundLift, fillR ? fillC : cutC, r.zDayR[i], slopeInk, kR, geoAt(0)),
        wr: Number.isFinite(r.wallSurfaceR?.[i]) ? push(xr, yr, r.wallSurfaceR[i]+groundLift, fillR ? fillC : cutC, r.wallSurfaceR[i], slopeInk, kR, geoAt(natural(xr,yr)-r.wallSurfaceR[i])) : undefined,
      });
    }
    const quad = (a: number, b: number, c: number, d: number) => { idx.push(a, b, c, b, d, c); };
    const groundPos: number[] = [], groundIdx: number[] = [];
    const coarse = (x: number, y: number) => this.replacementHeight(x, y);
    const flushGround = () => {
      if (!groundIdx.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(groundPos, 3));
      geometry.setIndex(groundIdx); geometry.computeBoundingSphere();
      const collar = new THREE.Mesh(geometry, this.collarMaterial());
      collar.name = 'daylight-ground'; out.push(collar);
      groundPos.length = 0; groundIdx.length = 0;
    };
    for (let i = 0; i < n - 1; i++) {
      if (i % 32 === 0) { flushGround(); yield; } // corridor-local frustum culling, not one route-wide mesh
      const k0 = r.kind[i], k1 = r.kind[i + 1];
      if (k0 === KIND.tunnel || k1 === KIND.tunnel) continue;
      const a = sv[i], b = sv[i + 1];
      quad(a.cl, b.cl, a.cr, b.cr);
      if (k0 === KIND.earth && k1 === KIND.earth) for (const side of [1, -1]) {
        const sections = daylightSections(r, i, side, w, natural);
        let prev: { day: number; edge: number; ground: number; wallGround?: number; wallSlope?: number } | undefined;
        for (let j = 0; j < sections.length; j++) {
          const s = sections[j], t = j / (sections.length - 1), toe = s.slopeDay ?? s.day;
          const fill = s.edge.z > s.day.z, kind = fill ? EW_KIND.fill : EW_KIND.cut, color = fill ? fillC : cutC;
          const gp = r.geology.profiles[r.geology.ids[i]];
          const geology = (depth: number) => gp.normMix ? [-3, -3, r.s[i]+t*(r.s[i+1]-r.s[i])] : [depth-gp.classIto, depth-gp.classIIto, r.s[i]+t*(r.s[i+1]-r.s[i])];
          const day = push(toe.x, toe.y, toe.z+groundLift, color, toe.z, slopeInk, kind, geology(s.day.z-toe.z));
          const edge = push(s.edge.x, s.edge.y, s.edge.z+lift, color, s.edge.z, slopeInk, kind, geology(natural(s.edge.x,s.edge.y)-s.edge.z));
          // Separate concrete vertices keep earth textures off the physically vertical face.
          // The collar still starts at natural ground, not at the retained slope elevation.
          const wallGround = s.slopeDay ? push(s.day.x,s.day.y,s.day.z+groundLift,concrete) : undefined;
          const wallSlope = s.slopeDay ? push(toe.x,toe.y,toe.z+groundLift,concrete) : undefined;
          const ground = groundPos.length / 3;
          for (let k = 0; k <= 8; k++) {
            const p = collarPoint(s, k/8, natural, coarse);
            this.local(p.x,p.y,p.z+groundLift,v); groundPos.push(v.x,v.y,v.z);
          }
          if (prev) {
            quad(prev.day, day, prev.edge, edge);
            if (prev.wallGround !== undefined && wallGround !== undefined) quad(prev.wallGround, wallGround, prev.wallSlope!, wallSlope!);
            for (let k = 0; k < 8; k++) groundIdx.push(prev.ground+k, ground+k, prev.ground+k+1, ground+k, ground+k+1, prev.ground+k+1);
          }
          prev = { day, edge, ground, wallGround, wallSlope };
        }
      }
    }
    flushGround();
    // Close the embankment cross-section at structure transitions. Without these faces the
    // terrain cut-out is visible as a sky-coloured hole beside the first/last bridge span.
    for (let i = 0; i < n; i++) {
      if (r.kind[i] !== KIND.earth || !((i > 0 && r.kind[i-1] !== KIND.earth) || (i+1 < n && r.kind[i+1] !== KIND.earth))) continue;
      const x = r.x[i], y = r.y[i], nx = -r.ty[i], ny = r.tx[i], z = r.grade[i];
      const zl = this.terrain.heightAt(x+nx*w, y+ny*w), zr = this.terrain.heightAt(x-nx*w, y-ny*w);
      if (z <= Math.max(zl, zr)) continue;
      const l = push(x+nx*w, y+ny*w, zl, fillC, zl, slopeInk, EW_KIND.fill), rr = push(x-nx*w, y-ny*w, zr, fillC, zr, slopeInk, EW_KIND.fill);
      quad(sv[i].el, l, sv[i].er, rr);
      const station = sv[i];
      idx.push(station.wl ?? station.dl, l, station.el, station.er, rr, station.wr ?? station.dr);
      // Retained toes need the lower part of the end cap too, otherwise the bridge
      // transition exposes a hole between the vertical wall and ground under the crown.
      if (station.wl !== undefined) idx.push(station.dl, l, station.wl);
      if (station.wr !== undefined) idx.push(station.wr, rr, station.dr);
    }
    // bridge deck edges and piers, tunnel portals
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
    const supports = structureFootprints({ ...r, crownWidth });
    for (const run of r.runs) {
      if (run.kind === KIND.bridge) {
        const piers = supports.filter(p => p.structure === 'pier' && p.s > run.s0 && p.s < run.s1);
        const spans = bridgeDeckSpans(run.s0,run.s1,piers.map(p => p.s));
        const at = (s: number) => {
          const i = Math.max(0,Math.min(n-2,Math.floor(s/r.ds))), t = Math.max(0,Math.min(1,(s-r.s[i])/(r.s[i+1]-r.s[i])));
          const value = (a: Float64Array) => a[i]+(a[i+1]-a[i])*t;
          // Interpolate the crown's chord edges exactly; normalising tangents would widen the split.
          return { x: value(r.x), y: value(r.y), z: value(r.grade), tx: value(r.tx), ty: value(r.ty) };
        };
        for (let i = Math.max(0, run.i0 - 1); i <= Math.min(n - 2, run.i1); i++) {
          for (const segment of bridgeDeckSegments(spans,r.s[i],r.s[i+1])) {
            const a = at(segment.s0), b = at(segment.s1), deck = segment.depth;
            for (const sgn of [1, -1]) {
              const nx0 = -a.ty*sgn*w, ny0 = a.tx*sgn*w, nx1 = -b.ty*sgn*w, ny1 = b.tx*sgn*w;
              const c = shade(concrete, sgn > 0 ? 0.95 : 0.75);
              const a0 = push(a.x+nx0,a.y+ny0,a.z+lift,c), a1 = push(a.x+nx0,a.y+ny0,a.z-deck,c);
              const b0 = push(b.x+nx1,b.y+ny1,b.z+lift,c), b1 = push(b.x+nx1,b.y+ny1,b.z-deck,c);
              quad(a0,b0,a1,b1);
            }
            const u = shade(concrete, 0.55);
            quad(push(a.x-a.ty*w,a.y+a.tx*w,a.z-deck,u), push(a.x+a.ty*w,a.y-a.tx*w,a.z-deck,u),
              push(b.x-b.ty*w,b.y+b.tx*w,b.z-deck,u), push(b.x+b.ty*w,b.y-b.tx*w,b.z-deck,u));
          }
        }
        // Close the soffit step between unequal spans, rather than leave an open deck at a pier.
        for (let j = 1; j < spans.length; j++) if (Math.abs(spans[j-1].depth-spans[j].depth) > 1e-6) {
          const p = at(spans[j].s0), c = shade(concrete,.65);
          quad(push(p.x-p.ty*w,p.y+p.tx*w,p.z-spans[j-1].depth,c), push(p.x+p.ty*w,p.y-p.tx*w,p.z-spans[j-1].depth,c),
            push(p.x-p.ty*w,p.y+p.tx*w,p.z-spans[j].depth,c), push(p.x+p.ty*w,p.y-p.tx*w,p.z-spans[j].depth,c));
        }
        // Close deep deck ends even where the embankment cap cannot hide the underside.
        for (const [s,depth] of [[r.s[Math.max(0,run.i0-1)],spans[0].depth],
          [r.s[Math.min(n-1,run.i1+1)],spans[spans.length-1].depth]]) {
          const p = at(s), c = shade(concrete,.75);
          quad(push(p.x-p.ty*w,p.y+p.tx*w,p.z+lift,c), push(p.x+p.ty*w,p.y-p.tx*w,p.z+lift,c),
            push(p.x-p.ty*w,p.y+p.tx*w,p.z-depth,c), push(p.x+p.ty*w,p.y-p.tx*w,p.z-depth,c));
        }
        // Same explicit layout as pricing and footprint checks. Never silently omit a
        // colliding pier: the blocked marker explains why the player must adjust the bridge.
        for (const p of piers) {
          const top = bridgePierTop(spans,p.s-p.along,p.s+p.along,(s0,s1) => {
            let highest = Math.max(at(s0).z,at(s1).z);
            for (let j = Math.max(0,Math.floor(s0/r.ds)+1); j < n && r.s[j] < s1; j++) highest = Math.max(highest,r.grade[j]);
            return highest;
          });
          boxAt(p.x, p.y, p.tx, p.ty, this.terrain.heightAt(p.x, p.y) - 2, top,
            p.along, p.left, shade(concrete, 0.85));
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
    g.setAttribute('ewKind', new THREE.Float32BufferAttribute(kinds, 1));
    g.setAttribute('ewGeo', new THREE.Float32BufferAttribute(geo, 3));
    g.setIndex(idx);
    const ribbon = new THREE.Mesh(g, this.ribbonMaterial());
    ribbon.name = 'ribbon';
    out.push(ribbon); // owned (disposed on abort) before the next yield
    g.computeBoundingSphere();
    g.computeVertexNormals();
    yield;

    out.push(...this.centreline(r, bad));

    // demolished buildings are gone from the map (their red squares mark the spots)
    const demolished = new Set(r.demolished.map((p) => this.buildingMesh(p.j)).filter((k) => k >= 0));
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
      out.push(pts);
    }
    handedOver = true;
    const commit = () => {
      if (settled) return;
      settled = true;
      const keep = new Set<THREE.Material>([this.collarMaterial(), this.ribbonMaterial()]);
      for (const c of [...this.routeGroup.children]) {
        this.routeGroup.remove(c);
        const m = c as THREE.Mesh;
        m.geometry?.dispose();
        const mats = m.material as THREE.Material | THREE.Material[] | undefined;
        for (const mat of Array.isArray(mats) ? mats : mats ? [mats] : []) if (!keep.has(mat)) this.retire(mat);
      }
      for (const o of out) this.routeGroup.add(o);
      this.buildMask(r);
      if (this.buildings) this.buildings.hide(demolished);
      this.dirty = true;
    };
    return { commit, dispose };
    } finally {
      // abandoned (or failed) before handing the staged result over: nothing was shown
      if (!handedOver) dispose();
    }
  }

  /** Replacement ground beside the slopes: one material for the life of the view (it was one
   * per 32 stations per result: a program lookup each, and churn for the retire queue). */
  private collarMaterial() {
    if (!this.collarMat) {
      this.collarMat = makeTerrainMaterial(this.terrainU, { maskTex: { value: null }, maskBox: { value: new THREE.Vector4() }, maskOn: { value: 0 } });
      this.collarMat.side = THREE.DoubleSide;
    }
    return this.collarMat;
  }
  private collarMat: THREE.ShaderMaterial | null = null;
  /** The earthwork ribbon's material, also kept for the life of the view. */
  private ribbonMaterial() {
    if (this.ribbonMat) return this.ribbonMat;
    const ribbonMaterial = this.ribbonMat = makeEarthworkMaterial(this.terrainU, {
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    // At-grade side roads cut through our side slopes, rather than being buried by them.
    const compile = ribbonMaterial.onBeforeCompile;
    ribbonMaterial.onBeforeCompile = (shader, renderer) => {
      compile.call(ribbonMaterial, shader, renderer);
      shader.uniforms.crossingTex = this.crossingCut.maskTex;
      shader.uniforms.crossingBox = this.crossingCut.maskBox;
      shader.uniforms.crossingOn = this.crossingCut.maskOn;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 crossingXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ncrossingXZ = position.xz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 crossingXZ; uniform sampler2D crossingTex; uniform vec4 crossingBox; uniform float crossingOn;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nvec2 crossingUV = (crossingXZ-crossingBox.xy)/crossingBox.zw;\nif (vInk > .9 && crossingOn > .5 && all(greaterThan(crossingUV, vec2(0.0))) && all(lessThan(crossingUV, vec2(1.0))) && texture2D(crossingTex, crossingUV).r > .5) discard;');
    };
    ribbonMaterial.customProgramCacheKey = () => 'earthwork-relief-crossing-cuts';
    return ribbonMaterial;
  }
  private ribbonMat: THREE.Material | null = null;

  /** Centreline (screen-space width so it reads at any zoom) and its see-through ghost. */
  private centreline(r: Result, bad: Uint8Array): THREE.Object3D[] {
    const cp: number[] = [], cc: number[] = [], v = new THREE.Vector3();
    for (let i = 0; i < r.n; i++) {
      const tun = r.kind[i] === KIND.tunnel;
      const z = tun ? this.drapeHeight(r.x[i], r.y[i]) + 2 : r.grade[i] + 1.5;
      this.local(r.x[i], r.y[i], z, v);
      cp.push(v.x, v.y, v.z);
      const c = bad[i] ? COL.bad : r.kind[i] === KIND.bridge ? COL.bridge : tun ? COL.tunnel : COL.earth;
      cc.push(c.r, c.g, c.b);
    }
    const line = this.makeLine(cp, cc, 3.5, { order: 4 });
    line.name = 'centre';
    const ghost = this.makeLine(cp, cc, 2, { opacity: 0.35, depthTest: false, order: 2 });
    ghost.name = 'ghost';
    return [line, ghost];
  }

  /**
   * Drag preview: only the centreline follows the moved route (a few ms). The earthwork ribbon,
   * terrain cut-out, collars and crossings stay at the last full result until the next one.
   */
  setPreview(r: Result) {
    for (const name of ['centre', 'ghost']) {
      const old = this.routeGroup.getObjectByName(name) as Line2 | undefined;
      if (!old) continue;
      this.routeGroup.remove(old); old.geometry.dispose(); this.retire(old.material);
    }
    for (const o of this.centreline(r, badStations(r))) this.routeGroup.add(o);
    this.dirty = true;
  }

  /** Cut out to the replacement ground collar, not into the exposed slope. */
  private buildMask(r: Result) {
    this.maskSource = r;
    this.contourLabels?.schedule(this.contourStep * 5); // labels keep off the carved footprint
    const n = r.n;
    const pos: number[] = [];
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    const P: [number, number][] = [], exact: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const nx = -r.ty[i], ny = r.tx[i];
      const L = r.dayL[i] + GROUND_COLLAR - COLLAR_OVERLAP, R = r.dayR[i] + GROUND_COLLAR - COLLAR_OVERLAP;
      for (const side of [1, -1]) {
        const p = daylightPoint(r, i, side);
        exact.push([p.x-this.cx, this.cy-p.y]);
      }
      const a: [number, number] = [r.x[i] + nx * L - this.cx, -(r.y[i] + ny * L - this.cy)];
      const b: [number, number] = [r.x[i] - nx * R - this.cx, -(r.y[i] - ny * R - this.cy)];
      P.push(a, b);
      for (const p of [a, b]) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
    }
    const original: number[] = [], cuts: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      if (r.kind[i] !== KIND.earth || r.kind[i + 1] !== KIND.earth) continue;
      for (const [points, out] of [[P, pos], [exact, original]] as const) {
        const a0 = points[2*i], b0 = points[2*i+1], a1 = points[2*i+2], b1 = points[2*i+3];
        for (const p of [a0,b0,a1,b0,b1,a1]) out.push(p[0],0,p[1]);
      }
    }
    const addQuad = (out: number[], a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => {
      for (const p of [a, b, c, b, d, c]) {
        const x = p.x - this.cx, z = this.cy - p.y;
        out.push(x, 0, z); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
    };
    for (const surface of this.crossingSurfaces) for (let i = 0; i + 1 < surface.sections.length; i++) {
      if (!groundSegment(surface, i)) continue;
      const a = surface.sections[i], b = surface.sections[i + 1];
      // Inset the terrain hole into its replacement collar to hide raster-mask antialiasing.
      const inset = (p: typeof a.p, q: typeof a.p) => {
        const t = Math.max(0, 1 - 2*COLLAR_OVERLAP/Math.hypot(q.x-p.x,q.y-p.y));
        return { x: p.x+(q.x-p.x)*t, y: p.y+(q.y-p.y)*t };
      };
      addQuad(pos, inset(a.p, a.outer[0]), inset(a.p, a.outer[1]), inset(b.p, b.outer[0]), inset(b.p, b.outer[1]));
      if (surface.crossing.type === 'junction') addQuad(cuts, a.toe[0], a.toe[1], b.toe[0], b.toe[1]);
    }
    for (const surface of this.crossingSurfaces) for (const [a, b, c, d] of endCollars(surface, (x, y) => this.terrain.heightAt(x, y))) {
      const inset = (p: typeof a, q: typeof a, metres: number) => {
        const t = Math.min(.45, metres/Math.hypot(q.x-p.x,q.y-p.y));
        return { ...p, x: p.x+(q.x-p.x)*t, y: p.y+(q.y-p.y)*t };
      };
      const l = inset(a,b,2*COLLAR_OVERLAP), rr = inset(b,a,2*COLLAR_OVERLAP);
      const endL = inset(c,d,2*COLLAR_OVERLAP), endR = inset(d,c,2*COLLAR_OVERLAP);
      addQuad(pos, l, rr, inset(endL,l,2*COLLAR_OVERLAP), inset(endR,rr,2*COLLAR_OVERLAP));
    }
    for (const head of turnaroundSurfaces(this.crossingSurfaces,(x,y) => this.terrain.heightAt(x,y))) {
      const ring = turnaroundMaskRing(head);
      for (let j = 0; j < ring.length; j++) for (const p of [head.center,ring[j],ring[(j+1)%ring.length]]) {
        const x = p.x-this.cx, z = this.cy-p.y;
        pos.push(x,0,z); minX = Math.min(minX,x); maxX = Math.max(maxX,x); minZ = Math.min(minZ,z); maxZ = Math.max(maxZ,z);
      }
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
    const draw = (target: THREE.WebGLRenderTarget, vertices: number[]) => {
      g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      this.renderer.setRenderTarget(target); this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(); this.renderer.render(this.maskScene, this.maskCam);
    };
    const target = (old: THREE.WebGLRenderTarget | null) => {
      if (old?.width === rt.width && old.height === rt.height) return old;
      old?.dispose(); return rt.clone();
    };
    this.originalMaskRT = target(this.originalMaskRT); this.crossingCutRT = target(this.crossingCutRT);
    draw(this.originalMaskRT, original); draw(this.crossingCutRT, cuts); draw(rt, pos);
    this.originalMask.maskTex.value = this.originalMaskRT.texture; this.originalMask.maskBox.value.copy(box); this.originalMask.maskOn.value = original.length ? 1 : 0;
    this.crossingCut.maskTex.value = this.crossingCutRT.texture; this.crossingCut.maskBox.value.copy(box); this.crossingCut.maskOn.value = cuts.length ? 1 : 0;
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(prevClear, prevAlpha);
    this.maskUniforms.maskTex.value = rt.texture;
    this.maskUniforms.maskOn.value = pos.length ? 1 : 0;
  }

  /** the yellow dot linked to the profile's hover; `label` names what is hovered there (e.g. a height point) */
  setHover(p: { x: number; y: number; z: number } | null, label = '') {
    this.hoverPos = p;
    if (label !== this.hoverLabel) { this.hoverLabel = label; this.hoverEl.innerHTML = label ? `<span>${label}</span>` : ''; }
    this.dirty = true;
  }
  private hoverLabel = '';

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
    this.flight++;
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

  private flight = 0;

  /** glide the orbit target to local (x, y), keeping the viewing direction; `dist` = new camera distance */
  flyTo(x: number, y: number, dist?: number, ms = 450) {
    const id = ++this.flight;
    const from = this.controls.target.clone();
    const to = this.local(x, y, this.terrain.heightAt(x, y) * this.exag);
    const off0 = this.camera.position.clone().sub(from);
    const off1 = dist ? off0.clone().setLength(Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, dist))) : off0.clone();
    const t0 = performance.now();
    const cancel = () => { this.flight++; };
    this.controls.addEventListener('start', cancel); // the player grabbed the map: stop gliding
    const step = () => {
      if (id !== this.flight) { this.controls.removeEventListener('start', cancel); return; }
      const k = Math.min(1, (performance.now() - t0) / ms), e = k * k * (3 - 2 * k);
      this.controls.target.lerpVectors(from, to, e);
      this.camera.position.copy(this.controls.target).add(off0.clone().lerp(off1, e));
      this.controls.update();
      this.dirty = true;
      if (k < 1) requestAnimationFrame(step); else this.controls.removeEventListener('start', cancel);
    };
    step();
  }

  /**
   * Zoom by `s` (new distance = old × s) about the point under the screen position: the cursor ray's
   * crossing with the orbit target's horizontal plane, which keeps its place on screen (towards the
   * horizon, or above it, a point at most 3 distances from the target, then the target itself). Both
   * camera and target are scaled about it, so the target keeps its height and the distance changes by
   * exactly `s` (within min/max distance) from any distance and any cursor position.
   */
  zoomAt(clientX: number, clientY: number, s: number) {
    this.flight++; // a glide in progress stops
    const cam = this.camera.position, t = this.controls.target;
    const dist = cam.distanceTo(t);
    s = Math.max(this.controls.minDistance / dist, Math.min(this.controls.maxDistance / dist, s));
    if (!(Math.abs(s - 1) > 1e-9)) return;
    this.camera.updateMatrixWorld();
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const p = t.clone(), o = ray.ray.origin, d = ray.ray.direction;
    if (d.y < -1e-4 && o.y > t.y) {
      p.copy(d).multiplyScalar((t.y - o.y) / d.y).add(o);
      // near the horizon the crossing runs away: keep the fixed point within a few distances of the target
      const off = p.distanceTo(t);
      if (off > 3 * dist) p.sub(t).multiplyScalar((3 * dist) / off).add(t);
    }
    cam.sub(p).multiplyScalar(s).add(p);
    t.sub(p).multiplyScalar(s).add(p);
    this.controls.update();
    this.dirty = true;
  }

  /**
   * Mouse wheel and trackpad pinch (a wheel event with ctrlKey and small pixel deltas: Chrome sends
   * 100·ln(finger scale)) zoom the map multiplicatively: exp(k·delta) per event, k = 1/100 for a pinch
   * (follows the fingers) and 1/450 for a wheel (≈ ×1.25 per 100 px notch). This replaces OrbitControls'
   * wheel zoom (0.95^(delta/100): a 5 % notch and ≈ 0.5 % pinch steps, slower still with the cursor high
   * on the screen). Wheels over overlay markers (bends, grips, labels) zoom too; a ctrl-wheel anywhere on
   * the page never zooms the page itself.
   */
  private installWheel() {
    const canvas = this.renderer.domElement;
    let ctrlHeld = false; // a real Ctrl key + mouse wheel is a wheel, not a pinch
    window.addEventListener('keydown', (e) => { if (e.key === 'Control') ctrlHeld = true; });
    window.addEventListener('keyup', (e) => { if (e.key === 'Control') ctrlHeld = false; });
    window.addEventListener('blur', () => { ctrlHeld = false; });
    const zoom = (e: WheelEvent) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      if (!this.controls.enabled) return; // a marker / grip drag in progress
      const px = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1);
      const k = e.ctrlKey && !ctrlHeld ? 1 / 100 : 1 / 450;
      this.zoomAt(e.clientX, e.clientY, Math.exp(Math.max(-0.7, Math.min(0.7, px * k))));
    };
    // on the canvas: in the capture phase, so OrbitControls' own wheel listener never sees it
    this.container.addEventListener('wheel', (e) => { if (e.target === canvas) zoom(e); }, { capture: true, passive: false });
    // on overlay markers: after their own handlers
    this.container.addEventListener('wheel', (e) => { if (e.target !== canvas) zoom(e); }, { passive: false });
    window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
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
   * Dispose a retired material, unless it is the last user of the shader program it was last drawn
   * with: then it is kept (one per program, so bounded by the few program variants) and that program
   * survives. Results
   * without, say, blocked-conflict markers or noise walls would otherwise delete those programs
   * and the next result with some would compile them again (≈ 10 ms on a GPU, ≈ 1 s in SwiftShader).
   */
  private release(m: THREE.Material) {
    const program = (this.renderer.properties.get(m) as { currentProgram?: { cacheKey: string; usedTimes: number } }).currentProgram;
    if (program && program.usedTimes <= 1 && !this.keepers.has(program.cacheKey)) { this.keepers.set(program.cacheKey, m); return; }
    m.dispose();
  }

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
    if (this.retired.length) { for (const m of this.retired) this.release(m); this.retired.length = 0; }
    const place = (el: HTMLElement, x: number, y: number, z: number, minDist?: number) => {
      const s = this.screenOf(x, y, z);
      const show = s.vis && (minDist === undefined || s.dist < minDist);
      el.style.display = show ? '' : 'none';
      if (show) el.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px)`;
    };
    for (const m of this.markers) place(m.el, m.x, m.y, m.z, m.minDist);
    // zoom class for the overlay's CSS (small symbols from afar)
    const mpp = this.metresPerPixel;
    const zoom = mpp > 12 ? 'far' : mpp > 3 ? 'mid' : 'near';
    if (this.overlay.dataset.zoom !== zoom) this.overlay.dataset.zoom = zoom;
    // bends: one too close to an already drawn one (or to A / B) shrinks to a dot, its number in the
    // tooltip; the selected bend is drawn first, so it always keeps its number
    const taken: { sx: number; sy: number }[] = [];
    for (const e of [this.pack.meta.A.xy, this.pack.meta.B.xy]) { const s = this.screenOf(e[0], e[1], this.terrain.heightAt(e[0], e[1])); if (s.vis) taken.push(s); }
    const order = this.piMarkers.map((_, i) => i);
    if (this.selected !== null && this.selected < order.length) { order.splice(this.selected, 1); order.unshift(this.selected); }
    for (const i of order) {
      const m = this.piMarkers[i];
      place(m.el, m.x, m.y, m.z);
      const s = this.screenOf(m.x, m.y, m.z);
      if (!s.vis) continue;
      const crowded = i !== this.selected && i !== this.dragging && taken.some((t) => Math.abs(t.sx - s.sx) < 21 && Math.abs(t.sy - s.sy) < 21);
      if (m.el.classList.contains('mini') !== crowded) m.el.classList.toggle('mini', crowded);
      if (!crowded) taken.push(s);
    }
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
        if (p) this.ev.onPickTerrain?.(p.x, p.y, e.clientX, e.clientY, e.shiftKey);
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
  /** the orbit target in local map coordinates (diagnostics) */
  get target() { const t = this.controls.target; return { x: t.x + this.cx, y: this.cy - t.z }; }
}
