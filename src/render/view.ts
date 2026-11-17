// three.js terrain view: draped terrain chunks, route ribbon (cut/fill slopes, bridges, tunnels),
// tangent guide of the active bend, official line, DOM markers and labels, heightfield picking.

import * as THREE from 'three';
import { Declutter } from './declutter';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Design, Result } from '../core/evaluate';
import type { TransportGraphData, TransportRenderInterval } from '../core/project-transport';
import { KIND } from '../core/structures';
import { OOB_BIT, type Terrain } from '../core/terrain';
import type { Pack } from '../scenario';
import { Buildings } from './buildings';
import { ContourLabels } from './contourLabels';
import { buildHeightLevels, buildHeightTexture } from './heightTexture';
import { LandCover } from './landcover';
import type { CrossingSurface } from './crossing-surface';
import { routeMask, type RouteMaskInput } from './route-mask';
import { buildRouteSurfaces, routeSurfaceContext, routeSurfaceContextSliced, type RouteSurfaceContext } from './route-surfaces';
import { RouteGroups } from './route-groups';
import { routeIndicationHeight } from './route-indication';
import { finish, type Staged } from './slices';
import { COLLAR_OVERLAP, GROUND_COLLAR, collarPoint, daylightSections, slopeKnee, groundStations } from './earthwork-surface';
import { CARRIAGEWAY_SECTION, RAIL_SECTION, RAIL2_SECTION, EW_KIND, makeEarthworkMaterial, makeTerrainMaterial, oobTexture, PAIRED_SECTION, terrainUniforms } from './terrainMaterial';
import { D275_SECTION, MOTORWAY_MARKINGS } from '../core/data/motorway';
import { RAILWAY_EVIDENCE, TRACK_CENTRES_M } from '../core/data/railway';
import { structureFootprints } from '../core/footprint';
import { bridgeDeckSpans, bridgeDeckSegments, bridgePierTop } from './bridge-surface';
import { CATEGORIES } from '../core/data/categories';

export interface ViewEvents {
  /** a click on the map (not a drag) at ground point x, y */
  onPickTerrain?: (x: number, y: number, clientX: number, clientY: number) => void;
  /** a click beside the map (beyond its edge, or the sky) */
  onPickNothing?: () => void;
  /** a double-click on the ground */
  onDoublePick?: (x: number, y: number) => void;
  /** is the road under this screen point? (a press there drags a new bend instead of panning) */
  hitRoad?: (clientX: number, clientY: number) => boolean;
  /** the road was dragged from ground point x, y: insert a bend there, return its index (null: none;
   * 'wait': not yet, the press is held and asked again on the next move or `resumeRoadDrag()`) */
  onRoadDrag?: (x: number, y: number) => number | null | 'wait';
  onPiDragStart?: (i: number) => void;
  onPiDrag?: (i: number, x: number, y: number) => void;
  onPiDragEnd?: (i: number) => void;
  onPiSelect?: (i: number | null) => void;
  onPiDelete?: (i: number) => void;
  /** something else draggable under this screen point (a reroute link): a press there drags it
   * (after 5 px; a click still picks) instead of panning the map */
  grab?: (clientX: number, clientY: number) => MapGrab | null;
}
/** One drag of a draggable map object, in ground coordinates. */
export interface MapGrab { start(x: number, y: number): boolean; move(x: number, y: number): void; end(): void }

const COL = {
  earth: new THREE.Color(0xffb000), bridge: new THREE.Color(0x2f8fff), tunnel: new THREE.Color(0xa070ff),
  bad: new THREE.Color(0xff2a2a),
};

const SKY = 0xc9d6e2;
/** camera height above the rendered ground (m; the near plane is 5 m) and the ground probed around it */
const CAMERA_CLEARANCE = 25;
/** Place names are drawn only nearer than this many camera distances (none piled up on the horizon). */
const LABEL_HORIZON = 6;
const PLACE_RANK = ['city', 'town', 'village', 'suburb', 'hamlet'];
/** How far the selected bend's guide (its two straights) reaches out from the bend, m. */
const GUIDE_REACH = 600;
/** A flight (a click in the profile, a card's place) from a view lower than FLY_LOWEST above the horizon
 * ends looking down at FLY_PITCH, so that the place lands mid-screen rather than on the horizon. */
const FLY_LOWEST = (30 * Math.PI) / 180, FLY_PITCH = (40 * Math.PI) / 180;
const CAMERA_PROBE = 60;
const CAMERA_PROBES: [number, number][] = [[0, 0], ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((k): [number, number][] => {
  const a = (k * Math.PI) / 4;
  return [[Math.cos(a) * CAMERA_PROBE / 2, Math.sin(a) * CAMERA_PROBE / 2], [Math.cos(a) * CAMERA_PROBE, Math.sin(a) * CAMERA_PROBE]];
})];
const LEGACY_ROUTE = 'legacy';
/** what the route takes: a bought-out house (its colour in every view, the noise view's too) and a
 * demolished one's far-zoom marker */
export const BOUGHT_COLOR = 0xc43c9b, DEMOLISHED_COLOR = 0x3d434b;
export interface StagedRoute extends Staged { context: RouteSurfaceContext }
export type EndSign = 'interchange' | 'roundabout' | 'joins' | 'continues';
/** small symbols for an end's marker: an interchange (two roads crossing with loop ramps), a roundabout
 * with our arm, a road carrying on */
const svg = (body: string) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${body}</svg>`;
const END_SIGNS: Record<EndSign, string> = {
  interchange: svg('<path d="M8 1v14M1 8h14" stroke="#1d232a" stroke-width="2.2"/><path d="M8 5a3 3 0 1 1 3 3M8 11a3 3 0 1 1-3-3" fill="none" stroke="#1d232a" stroke-width="1.4"/>'),
  roundabout: svg('<circle cx="10" cy="7" r="4" fill="none" stroke="#1d232a" stroke-width="2"/><path d="M1 13l5.5-3.5" stroke="#1d232a" stroke-width="2.2"/><path d="M6 12.5l1.5-2.5" stroke="#1d232a" stroke-width="1"/>'),
  joins: svg('<path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="#1d232a" stroke-width="2.2"/>'),
  continues: svg('<path d="M2 8h3M7 8h3" stroke="#1d232a" stroke-width="2.2"/><path d="M11 4l4 4-4 4" fill="none" stroke="#1d232a" stroke-width="2"/>'),
};
export interface RenderEndpoints {
  /** `sign`: what the end meets (an interchange, a roundabout, a road it joins): a symbol and a card */
  a: { x: number; y: number; z?: number; label?: string; sign?: EndSign };
  b: { x: number; y: number; z?: number; label?: string; sign?: EndSign };
  /** another road's ends (not the scenario's A / B): plain end markers without the A / B discs */
  plain?: boolean;
}

/**
 * The coloured structure line (road / bridge / tunnel / problem) is a map symbol for orientation: drawn
 * from this many metres per pixel on, where the road itself is only a few pixels wide. Closer, the
 * carriageway shows its real surface and markings, and the line would read as (yellow) paint on it; it
 * is then drawn only while the road is being changed (its body follows when the drag pauses). Tunnels,
 * invisible close up, keep a dashed trace on the ground.
 */
const STRUCTURE_LINE_FROM = 2.5;
/** Ground drawn over a tunnel behind its portal face's top, m: past the terrain mask's bleed (≈ 3 m,
 * route-mask.ts) with an overlap onto the drawn terrain; within PORTAL_LID_BLEND it rises from the face's
 * ground to the drawn terrain. */
const PORTAL_LID = 7.5, PORTAL_LID_BLEND = 3;

/** Carriageway cross-sections by index (`roadSections`; 0 = none: plain asphalt) and the index of a
 * crown width's category. All have the same centre-line dash (TP 133: 3 / 6 m outside motorways). */
const SECTIONS = [undefined, ...Object.values(CATEGORIES).map((c) => c.section).filter((s) => s)];
function sectionIndex(crownWidth: number) {
  const cat = Object.values(CATEGORIES).find((c) => c.crownWidth === crownWidth);
  if (cat?.paired) return PAIRED_SECTION;
  if (cat?.carriageway) return CARRIAGEWAY_SECTION;
  if (cat?.mode === 'railway') return cat.tracks === 2 ? RAIL2_SECTION : RAIL_SECTION;
  return Math.max(0, SECTIONS.indexOf(cat?.section));
}

/** stations within a (non-goal) violation, drawn red */
function badStations(r: Result) {
  const bad = new Uint8Array(r.n);
  for (const v of r.violations) {
    if (v.goal) continue;
    for (let i = 0; i < r.n; i++) if (r.s[i] >= v.s0 - r.ds && r.s[i] <= v.s1 + r.ds) bad[i] = 1;
  }
  return bad;
}

/** View.prepareRouteScene: what commitRouteScene would compute for these routes. */
export interface PreparedScene {
  inputs: readonly { result: Result; surfaces: readonly CrossingSurface[] }[];
  crossingSurfaces: CrossingSurface[];
  replacementHeight: (x: number, y: number) => number;
  mask: ReturnType<typeof routeMask>;
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
  private routeGroups = new RouteGroups(this.world,
    () => new Set<THREE.Material>([this.collarMaterial(), this.ribbonMaterial(), ...Object.values(this.markerMats)]), (material) => this.retire(material));
  private routeInputs = new Map<string, { result: Result; surfaces: readonly CrossingSurface[] }>();
  /** editing guide: the tangent lines through the active bend (dragged, hovered or selected) */
  private guide: THREE.Group | null = null;
  private guideFor: number | null = null;
  private designPts: { x: number; y: number }[] = [];
  private hoverPi: number | null = null;
  /** the shown line reads from B (a motorway's direction towards A): its bends are numbered from there */
  bendsReversed: () => boolean = () => false;
  /** a drag preview's centreline is newer than the road body */
  private stale = false;
  private officialPts: { x: number; y: number; z: number }[] = [];
  private officialLabel: HTMLElement | null = null;
  private officialLine: Line2 | null = null;
  private proposalLines = new Map<string, { key: string; line: Line2 }>();
  get proposalCount() { return this.proposalLines.size; }
  private markers: { el: HTMLElement; x: number; y: number; z: number; minDist?: number }[] = [];
  private labelRoom = new Declutter();
  private piMarkers: { el: HTMLElement; x: number; y: number; z: number }[] = [];
  private endpointMarkers: { el: HTMLElement; x: number; y: number; z: number }[] = [];
  private endpoints: RenderEndpoints;
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
  /** Settled footprints (exact daylight polygons) that replacement ground must not cover. Their own
   * collars and crossing ground share the footprint's edge: discard only fully covered texels, else the
   * ≈ 2.5 m mask raster bleeds over the edge and opens a sky-coloured seam beside the slope's toe. */
  readonly originalMask = { maskTex: { value: null as THREE.Texture | null }, maskBox: { value: new THREE.Vector4() }, maskOn: { value: 0 }, maskCut: { value: 0.999 } };
  crossingSurfaces: CrossingSurface[] = [];
  private maskScene = new THREE.Scene();
  private maskCam = new THREE.Camera();
  private maskUniforms = {
    maskTex: { value: null as THREE.Texture | null },
    maskBox: { value: new THREE.Vector4(0, 0, 1, 1) },
    maskOn: { value: 0 },
  };
  // terrain surface: shaded per pixel from the height texture, land cover from GPU-rasterised vectors
  private terrainU = (() => {
    const u = terrainUniforms();
    SECTIONS.forEach((s, k) => { if (s) u.roadSections.value[k].set(s.lane, s.lane + s.hardShoulder, s.edgeLine, s.centreLine); });
    const dash = SECTIONS[1];
    if (dash) u.roadDash.value.set(dash.dash, dash.gap);
    u.roadPaired.value.set(D275_SECTION.median / 2, D275_SECTION.innerPavedShoulder, D275_SECTION.laneWidth, D275_SECTION.outerPavedShoulder);
    u.roadCarriageway.value = CATEGORIES['D27.5-1'].crownWidth / 2;
    u.roadRail.value.set(1, TRACK_CENTRES_M, RAILWAY_EVIDENCE.ballastTopHalfWidthM, (RAILWAY_EVIDENCE.standardGaugeMm + 72) / 2000);
    u.roadPairedLines.value.set(MOTORWAY_MARKINGS.edgeLine, MOTORWAY_MARKINGS.laneLine, MOTORWAY_MARKINGS.dash, MOTORWAY_MARKINGS.gap);
    return u;
  })();
  private landcover: LandCover | null = null;
  private buildings: Buildings | null = null;
  private contours = false;
  private contourStep = 0;
  private contourLabels: ContourLabels | null = null;
  private maxTex = 0;
  /** Settled inputs only, also used to restore the GPU-only masks after a lost context. */
  private maskSources: readonly RouteMaskInput[] = [];
  private maskMat: THREE.ShaderMaterial | null = null;
  private retired: THREE.Material[] = [];
  /** one material per shader program that would otherwise lose its last user (see release) */
  private keepers = new Map<string, THREE.Material>();
  /** called when the contour interval changes with the zoom (minor, major in metres) */
  onContourInterval: ((minor: number, major: number) => void) | null = null;
  ev: ViewEvents = {};
  /** called after every render, for overlays managed outside the view (curve handles) */
  onRender: (() => void) | null = null;
  private renderListeners = new Set<() => void>();
  addRenderListener(listener: () => void) { this.renderListeners.add(listener); return () => { this.renderListeners.delete(listener); }; }

  constructor(private container: HTMLElement, private overlay: HTMLElement, private pack: Pack,
    private labels: { a: string; b: string; official: string } = { a: 'A', b: 'B', official: 'official line' }) {
    this.terrain = pack.terrain;
    this.endpoints = {
      a: { x: pack.meta.A.xy[0], y: pack.meta.A.xy[1], label: labels.a },
      b: { x: pack.meta.B.xy[0], y: pack.meta.B.xy[1], label: labels.b },
    };
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
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8470, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-1, 1.6, -0.8);
    this.scene.add(sun);
    this.controls = new MapControls(this.camera, this.renderer.domElement);
    // (at most ≈ 76° from straight down: a view skimming the horizon zooms and pans the far distance)
    this.controls.maxPolarAngle = Math.PI * 0.42;
    this.controls.minDistance = 80;
    this.controls.maxDistance = 60000;
    this.controls.zoomToCursor = true; // touch pinch; wheel and trackpad pinch go through zoomAt (installWheel)
    this.controls.addEventListener('change', () => { this.dirty = true; this.keepTargetOnMap(); });
    // after a pan or a turn the orbit target goes back onto the ground under the screen centre
    this.controls.addEventListener('end', () => this.anchorTarget());
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
      if (this.keepCameraAboveGround()) this.dirty = true;
      if (this.dirty) { this.dirty = false; this.render(); }
    };
    loop();
  }

  // ---- coordinates ---------------------------------------------------------------------------
  /** local (x east, y north, z elevation) → position inside `world` (scaled by exaggeration) */
  local(x: number, y: number, z: number, v = new THREE.Vector3()) { return v.set(x - this.cx, z, -(y - this.cy)); }

  private screenOf(x: number, y: number, z: number): { sx: number; sy: number; vis: boolean; dist: number; depth: number } {
    const v = this.local(x, y, z * this.exag);
    const dist = v.distanceTo(this.camera.position), matrix = this.camera.matrixWorldInverse.elements;
    const depth = -(matrix[2] * v.x + matrix[6] * v.y + matrix[10] * v.z + matrix[14]);
    v.project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { sx: (v.x * 0.5 + 0.5) * w, sy: (-v.y * 0.5 + 0.5) * h, vis: v.z < 1 && v.z > -1, dist, depth };
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
    const t = this.groundAlong(ray.ray.origin, ray.ray.direction);
    if (t === null) return null;
    const o = ray.ray.origin, d = ray.ray.direction, T = this.terrain;
    const x = o.x + d.x * t + this.cx, y = -(o.z + d.z * t) + this.cy;
    if (x < 0 || y < 0 || x > T.width || y > T.height) return null;
    return { x, y };
  }

  /** Distance along a ray (world coordinates, `d` unit) to where it meets the drawn ground, or null. */
  private groundAlong(o: THREE.Vector3, d: THREE.Vector3, tMax = 150000): number | null {
    const T = this.terrain;
    const above = (t: number) => {
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
      const x = px + this.cx, y = -pz + this.cy;
      return py - T.heightAt(x, y) * this.exag;
    };
    let t = 0, prev = 0;
    if (above(0) < 0) return null;
    while (t < tMax) {
      const step = Math.max(4, t * 0.003);
      prev = t; t += step;
      if (above(t) < 0) {
        let lo = prev, hi = t;
        for (let k = 0; k < 30; k++) { const m = 0.5 * (lo + hi); if (above(m) < 0) hi = m; else lo = m; }
        return hi;
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
      const lc = this.landcover = new LandCover(this.renderer, this.pack.vectors, T.width, T.height, u, null);
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
    this.drawMask(this.maskSources);
    this.dirty = true;
  }

  /** inside the at-grade footprint of the designed road, where the terrain is cut away */
  private inFootprint(x: number, y: number): boolean {
    for (const { result: r } of this.maskSources) for (let i = 0; i < r.n; i++) {
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
  /** the photo's known-network overlay needs the lazily loaded transport graph */
  onNeedTransport?: () => void;
  /** a held road drag (`onRoadDrag` said 'wait') asks again now, at the pointer's last position */
  resumeRoadDrag: () => void = () => {};
  setPhoto(on: boolean) {
    if (on) this.onNeedTransport?.();
    this.landcover?.setPhoto(on);
    this.terrainU.shadeAmt.value = on && this.landcover?.hasPhotoSource ? 0.45 : 1;
    this.dirty = true;
  }
  get hasPhoto() { return !!this.landcover?.hasPhotoSource; }
  get photoWithNetwork() { return !!this.landcover?.photoWithNetwork; }
  /** the transport graph arrived (loaded lazily after startup): the photo's known-network overlay can use it */
  setTransport(graph: TransportGraphData | null) { this.landcover?.setNetwork(graph); }
  /** Stage the map's cleared plots (demolished) and rings (bought out) for engine building indices. */
  *buildPlots(demolished: readonly number[], bought: readonly number[]): Generator<void, Staged> {
    const render = (js: readonly number[]) => new Set(js.map(j => this.buildingMesh(j)).filter(k => k >= 0));
    if (this.landcover) return yield* this.landcover.buildPlots(render(demolished), render(bought));
    return { commit() {}, dispose() {} };
  }
  *buildSourceReplacements(graph: TransportGraphData, accepted: readonly TransportRenderInterval[]): Generator<void, Staged> {
    if (this.landcover) return yield* this.landcover.buildSourceReplacements(graph, accepted);
    return { commit() {}, dispose() {} };
  }
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

  /**
   * The camera never goes below the ground: tilting, panning towards a hill or zooming into a slope
   * would otherwise put it under the terrain and show the map from beneath. Raises the camera (the
   * orbit target stays) to CAMERA_CLEARANCE above the highest rendered ground within CAMERA_PROBE m.
   */
  private keepCameraAboveGround(): boolean {
    const p = this.camera.position, T = this.terrain;
    const x = Math.min(T.width, Math.max(0, p.x + this.cx)), y = Math.min(T.height, Math.max(0, this.cy - p.z));
    let g = -Infinity;
    for (const [dx, dy] of CAMERA_PROBES) {
      const sx = Math.min(T.width, Math.max(0, x + dx)), sy = Math.min(T.height, Math.max(0, y + dy));
      g = Math.max(g, this.drapeHeight(sx, sy));
    }
    const min = g * this.exag + CAMERA_CLEARANCE;
    if (!(p.y < min)) return false;
    p.y = min;
    return true;
  }
  /** height that clears both the true and the rendered terrain (for draped overlays) */
  drape(x: number, y: number) { return this.drapeHeight(x, y); }
  groundHeight(x: number, y: number) { return this.terrain.heightAt(x, y); }
  replacementHeight = (x: number, y: number) => this.drape(x, y);
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
    // The mapped line's vertices can be hundreds of metres apart: draped only there, a straight piece
    // would run through the hills in between (and vanish under them). Draped every ≤ 25 m.
    const raw = this.pack.meta.official.xy as [number, number][], xy: [number, number][] = [];
    for (let i = 0; i < raw.length; i++) {
      if (i > 0) {
        const [x0, y0] = raw[i - 1], [x1, y1] = raw[i], m = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 25);
        for (let k = 1; k < m; k++) xy.push([x0 + (x1 - x0) * k / m, y0 + (y1 - y0) * k / m]);
      }
      xy.push(raw[i]);
    }
    let along = Infinity;
    for (let i = 0; i < xy.length; i++) {
      const [x, y] = xy[i];
      if (x < 0 || y < 0 || x > this.terrain.width || y > this.terrain.height) continue;
      const z = this.drapeHeight(x, y) + 3, v = this.local(x, y, z);
      pts.push(v.x, v.y, v.z);
      // label anchors every ~150 m
      const last = this.officialPts[this.officialPts.length - 1];
      along = last ? along + Math.hypot(x - last.x, y - last.y) : Infinity;
      if (along > 150) { this.officialPts.push({ x, y, z }); along = 0; }
    }
    if (pts.length >= 6) {
      // a reference, not a road: dark pencil dashes (unlike any road colour or marking, and not the
      // black-and-white of a railway), a constant 10 px on screen (render() scales them with the zoom)
      // a faint continuous halo keeps it legible over dark forest
      const halo = this.makeLine(pts, null, 4.5, { color: 0xffffff, opacity: 0.35 });
      const l = this.makeLine(pts, null, 2, { color: 0x2b3440, opacity: 0.85, dashed: true, dashSize: 10, gapSize: 7 });
      halo.name = 'official-halo'; l.name = 'official';
      this.world.add(halo, l);
      this.officialLine = l;
    }
  }

  /** the official line's label rides along it: at its point nearest the middle of the view */
  /** Where the map's own buttons, bars and legends sit over it (view coordinates): labels keep clear of them.
   * Re-read at most twice a second (they move only when the window or a bar changes). */
  private uiBoxes: number[] = [];
  private uiRead = -Infinity;
  private uiRoom(): number[] {
    const now = performance.now();
    if (now - this.uiRead < 500) return this.uiBoxes;
    this.uiRead = now;
    const c = this.container.getBoundingClientRect(), out: number[] = [];
    const ui = [...this.container.children, ...document.querySelectorAll('.scenario-picker-return')]
      .filter((e): e is HTMLElement => e instanceof HTMLElement && e !== this.overlay && e !== this.renderer.domElement && e.offsetParent !== null);
    for (const e of ui) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push(r.left - c.left, r.top - c.top, r.right - c.left, r.bottom - c.top);
    }
    return this.uiBoxes = out;
  }

  private placeOfficialLabel(): { sx: number; sy: number } | null {
    const el = this.officialLabel;
    if (!el) return null;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    // the point nearest the middle of the view where it prints over nothing already placed (A, B)
    const spots: { sx: number; sy: number; d: number }[] = [];
    for (const p of this.officialPts) {
      const s = this.screenOf(p.x, p.y, p.z);
      if (!s.vis || s.sx < 40 || s.sy < 40 || s.sx > w - 160 || s.sy > h - 60) continue;
      spots.push({ sx: s.sx, sy: s.sy, d: Math.hypot(s.sx - w / 2, s.sy - h / 2) });
    }
    spots.sort((a, b) => a.d - b.d);
    const best = spots.find(s => this.labelRoom.fit(el, s.sx, s.sy)) ?? null;
    el.style.display = best ? '' : 'none';
    if (best) el.style.transform = `translate(${best.sx.toFixed(1)}px, ${best.sy.toFixed(1)}px)`;
    return best;
  }

  private buildLabels() {
    const add = (cls: string, html: string, x: number, y: number, minDist?: number) => {
      const el = document.createElement('div');
      el.className = cls;
      el.innerHTML = html;
      this.overlay.appendChild(el);
      this.markers.push({ el, x, y, z: this.terrain.heightAt(x, y), minDist });
    };
    // (in placing order: towns first, then villages, suburbs and hamlets)
    const places = [...this.pack.overlays.places].sort((a, b) => PLACE_RANK.indexOf(a.kind) - PLACE_RANK.indexOf(b.kind));
    for (const p of places) {
      if (p.kind === 'town' || p.kind === 'city') add('place town', p.name, p.x, p.y);
      else if (p.kind === 'village') add('place village', p.name, p.x, p.y, 30000);
      else if (p.kind === 'suburb') add('place suburb', p.name, p.x, p.y, 12000);
      else if (p.kind === 'hamlet') add('place hamlet', p.name, p.x, p.y, 7000);
    }
    for (const letter of ['A', 'B']) {
      const el = document.createElement('div'); el.className = 'endpoint';
      const badge = document.createElement('b'); badge.textContent = letter;
      // an end at an interchange (or joining a road): a symbol by its name; the marker opens its card
      const sign = document.createElement('i'); sign.className = 'interchange-sign';
      el.append(badge, sign, document.createElement('span')); this.overlay.appendChild(el);
      el.addEventListener('pointerdown', (e) => { if (el.classList.contains('info')) e.stopPropagation(); });
      el.addEventListener('click', () => { if (el.classList.contains('info')) this.onEndClick?.(letter === 'A' ? 'a' : 'b'); });
      this.endpointMarkers.push({ el, x: 0, y: 0, z: 0 });
    }
    this.setEndpoints(this.endpoints);
    if ((this.pack.meta.official?.xy ?? []).length >= 2) {
      const el = this.officialLabel = document.createElement('div');
      el.className = 'official-label';
      el.innerHTML = `<span>${this.labels.official}</span>`;
      this.overlay.appendChild(el);
    }
  }

  /** a click on an end that has a card (see RenderEndpoints.interchange) */
  onEndClick?: (end: 'a' | 'b') => void;

  // ---- route ---------------------------------------------------------------------------------
  setEndpoints(endpoints: RenderEndpoints) {
    this.endpoints = endpoints;
    for (const [i, point] of [endpoints.a, endpoints.b].entries()) {
      const marker = this.endpointMarkers[i];
      if (!marker) continue;
      marker.x = point.x; marker.y = point.y; marker.z = point.z ?? this.terrain.heightAt(point.x, point.y);
      marker.el.querySelector('span')!.textContent = point.label ?? '';
      marker.el.classList.toggle('plain', !!endpoints.plain);
      marker.el.classList.toggle('info', !!point.sign && !endpoints.plain);
      const sign = marker.el.querySelector('.interchange-sign')!;
      if (point.sign && sign.getAttribute('data-sign') !== point.sign) { sign.innerHTML = END_SIGNS[point.sign]; sign.setAttribute('data-sign', point.sign); }
      this.labelRoom.forget(marker.el);
    }
    this.dirty = true;
  }

  /** Unaccepted route proposals on reference geometry: a distinct dashed line above the ground, no road
   * body or earthworks (none were engineered). The old road under it stays drawn until accepted. */
  setProposals(proposals: readonly { id: string; key: string; active: boolean; points: readonly { x: number; y: number }[] }[]) {
    const keep = new Set(proposals.map(p => p.id));
    const drop = (id: string) => {
      const old = this.proposalLines.get(id); if (!old) return;
      this.world.remove(old.line); old.line.geometry.dispose(); this.retire(old.line.material); this.proposalLines.delete(id);
    };
    for (const id of [...this.proposalLines.keys()]) if (!keep.has(id)) drop(id);
    for (const p of proposals) {
      const key = `${p.key}:${p.active}`;
      if (this.proposalLines.get(p.id)?.key === key) continue;
      drop(p.id);
      const arr: number[] = [];
      for (const q of p.points) { const v = this.local(q.x, q.y, this.drapeHeight(q.x, q.y) + 2.5); arr.push(v.x, v.y, v.z); }
      if (arr.length < 6) continue;
      const line = this.makeLine(arr, null, p.active ? 5 : 3.5, { color: 0xff9f1c, opacity: 0.95, depthTest: false, dashed: true, dashSize: 10, gapSize: 6, order: 3 });
      line.name = 'proposal';
      this.world.add(line); this.proposalLines.set(p.id, { key, line });
    }
    this.dirty = true;
  }

  private sourceSelectionLine: Line2 | null = null;
  /** the base-road stretch chosen with the Change road handles (display only) */
  setSourceSelection(points: readonly { x: number; y: number }[] | null) {
    if (this.sourceSelectionLine) {
      this.world.remove(this.sourceSelectionLine); this.sourceSelectionLine.geometry.dispose(); this.retire(this.sourceSelectionLine.material);
      this.sourceSelectionLine = null;
    }
    const arr: number[] = [];
    for (const q of points ?? []) { const v = this.local(q.x, q.y, this.drapeHeight(q.x, q.y) + 2.5); arr.push(v.x, v.y, v.z); }
    if (arr.length >= 6) {
      this.sourceSelectionLine = this.makeLine(arr, null, 6, { color: 0xff9f1c, opacity: 0.8, depthTest: false, order: 3 });
      this.sourceSelectionLine.name = 'source-selection'; this.world.add(this.sourceSelectionLine);
    }
    this.dirty = true;
  }

  clearDesign(endpoints = this.endpoints) {
    this.setEndpoints(endpoints);
    this.designPts = []; this.hoverPi = null; this.buildGuide();
    for (const marker of this.piMarkers) marker.el.remove(); this.piMarkers = [];
    this.selected = null; this.dirty = true;
  }

  /** Undo during a bend drag: the marker stops following the pointer (the design is restored by the store). */
  cancelDrag() { if (this.dragging !== null) { this.dragging = null; this.dirty = true; } }
  setDesign(d: Design, selected: number | null, endpoints = this.endpoints) {
    this.setEndpoints(endpoints);
    this.designPts = [endpoints.a, ...d.pis, endpoints.b].map((p) => ({ x: p.x, y: p.y }));
    this.selected = selected;
    this.buildGuide();
    // PI markers
    while (this.piMarkers.length > d.pis.length) this.piMarkers.pop()!.el.remove();
    while (this.piMarkers.length < d.pis.length) {
      const el = document.createElement('div');
      el.className = 'pi';
      const idx = this.piMarkers.length;
      el.dataset.i = String(idx);
      el.addEventListener('pointerenter', () => { this.hoverPi = idx; this.dirty = true; });
      el.addEventListener('pointerleave', () => { if (this.hoverPi === idx) { this.hoverPi = null; this.dirty = true; } });
      this.overlay.appendChild(el);
      this.piMarkers.push({ el, x: 0, y: 0, z: 0 });
    }
    d.pis.forEach((p, i) => {
      const m = this.piMarkers[i];
      m.x = p.x; m.y = p.y; m.z = this.terrain.heightAt(p.x, p.y);
      const no = this.bendsReversed() ? d.pis.length - i : i + 1;
      m.el.textContent = String(no);
      m.el.title = `Bend ${no}`;
      m.el.classList.toggle('sel', selected === i);
    });
    if (this.hoverPi !== null && this.hoverPi >= d.pis.length) this.hoverPi = null;
    this.dirty = true;
  }

  /** the bend whose tangent lines are shown: dragged, else hovered, else selected */
  private get activeBend() {
    const i = this.dragging ?? this.hoverPi ?? this.selected;
    return i !== null && i + 2 < this.designPts.length ? i : null;
  }

  /**
   * Editing guide: the two tangent lines through the active bend (to the neighbouring bends or A / B),
   * where the curve between them is fitted. Hidden when no bend is being worked on.
   */
  private buildGuide() {
    if (this.guide) {
      this.world.remove(this.guide);
      for (const c of this.guide.children as Line2[]) { c.geometry.dispose(); this.retire(c.material); }
      this.guide = null;
    }
    const i = this.guideFor = this.activeBend;
    if (i === null) return;
    // The two straights meeting at the bend, a short way out from it (not all the way to the next
    // bends: along the whole road a dashed guide read as the dashed official line). Solid, light.
    const [p0, pi, p1] = this.designPts.slice(i, i + 3), arr: number[] = [];
    const leg = (q: { x: number; y: number }) => {
      const L = Math.hypot(q.x - pi.x, q.y - pi.y), reach = Math.min(L / 2, GUIDE_REACH);
      return { x: pi.x + (q.x - pi.x) * reach / (L || 1), y: pi.y + (q.y - pi.y) * reach / (L || 1) };
    };
    const ends = [leg(p0), pi, leg(p1)];
    for (let j = 0; j < 2; j++) {
      const a = ends[j], b = ends[j + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 30));
      for (let k = j > 0 ? 1 : 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * (k / n), y = a.y + (b.y - a.y) * (k / n);
        const v = this.local(x, y, this.drapeHeight(x, y) + 4);
        arr.push(v.x, v.y, v.z);
      }
    }
    const g = this.guide = new THREE.Group();
    g.name = 'bend-guide';
    g.add(this.makeLine(arr, null, 3.5, { color: 0x1d232a, opacity: 0.35, depthTest: false, order: 3 }),
      this.makeLine(arr, null, 1.5, { color: 0xffffff, opacity: 0.9, depthTest: false, order: 3 }));
    this.world.add(g);
  }

  setResult(r: Result, crownWidth: number) { finish(this.buildResult(r, crownWidth)).commit(); }

  /**
   * The full result's route geometry, built in steps (each `yield` is a point where a cooperative
   * scheduler may hand the main thread back to input and rendering) without changing what is
   * shown. The result is staged: `commit()` swaps it in, `dispose()` throws it away. Abandoning the
   * generator (`return()`) disposes too. The returned context belongs to this generation; crossing
   * builders consume it explicitly rather than reading mutable staging state from View.
   */
  *buildResult(r: Result, crownWidth: number, routeId = LEGACY_ROUTE,
    sharedContext?: RouteSurfaceContext, batch = false, buildingMarkers = true, mirrored = false): Generator<void, StagedRoute> {
    const out: THREE.Object3D[] = [];
    const owned = this.routeGroups.stage(routeId, out);
    let handedOver = false, settled = false;
    const dispose = () => {
      if (settled) return;
      settled = true; owned.dispose();
    };
    try {
    const natural = (x: number, y: number) => this.terrain.heightAt(x, y);
    const surfaces = sharedContext?.surfaces ?? (yield* buildRouteSurfaces(r, crownWidth, natural));
    const context = sharedContext ?? routeSurfaceContext(surfaces, surfaces, natural, (x, y) => this.drape(x, y));
    yield;
    const n = r.n, w = crownWidth / 2;
    const bad = badStations(r), section = sectionIndex(crownWidth);
    // one direction of a separate motorway stretch run against its travel (the reverse direction, A→B):
    // its median side is on the right
    const side = mirrored && section === CARRIAGEWAY_SECTION ? -1 : 1;
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
      const wi = w + (r.widen?.[i] ?? 0); // a hairpin's widened lanes
      const xel = x + nx * wi, yel = y + ny * wi, xer = x - nx * wi, yer = y - ny * wi;
      sv.push({
        dl: push(xl, yl, natural(xl, yl) + groundLift, fillL ? fillC : cutC, r.zDayL[i], slopeInk, kL, geoAt(0)),
        wl: Number.isFinite(r.wallSurfaceL?.[i]) ? push(xl, yl, r.wallSurfaceL[i]+groundLift, fillL ? fillC : cutC, r.wallSurfaceL[i], slopeInk, kL, geoAt(natural(xl,yl)-r.wallSurfaceL[i])) : undefined,
        el: push(xel, yel, z + lift, fillL ? fillC : cutC, z, slopeInk, kL, geoAt(this.terrain.heightAt(xel, yel) - z)),
        // the carriageway: lanes, markings and verges come from the shader (offset, bridge, station)
        cl: push(xel, yel, z + lift, crown, z, crownInk, EW_KIND.road, [side * wi, 2 * section + (r.kind[i] === KIND.bridge ? 1 : 0), r.s[i]]),
        cr: push(xer, yer, z + lift, crown, z, crownInk, EW_KIND.road, [-side * wi, 2 * section + (r.kind[i] === KIND.bridge ? 1 : 0), r.s[i]]),
        er: push(xer, yer, z + lift, fillR ? fillC : cutC, z, slopeInk, kR, geoAt(this.terrain.heightAt(xer, yer) - z)),
        dr: push(xr, yr, natural(xr, yr) + groundLift, fillR ? fillC : cutC, r.zDayR[i], slopeInk, kR, geoAt(0)),
        wr: Number.isFinite(r.wallSurfaceR?.[i]) ? push(xr, yr, r.wallSurfaceR[i]+groundLift, fillR ? fillC : cutC, r.wallSurfaceR[i], slopeInk, kR, geoAt(natural(xr,yr)-r.wallSurfaceR[i])) : undefined,
      });
    }
    const quad = (a: number, b: number, c: number, d: number) => { idx.push(a, b, c, b, d, c); };
    const groundPos: number[] = [], groundIdx: number[] = [];
    const coarse = context.replacementHeight;
    const flushGround = () => {
      if (!groundIdx.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(groundPos, 3));
      geometry.setIndex(groundIdx); geometry.computeBoundingSphere();
      const collar = new THREE.Mesh(geometry, this.collarMaterial());
      collar.name = 'daylight-ground'; out.push(collar);
      groundPos.length = 0; groundIdx.length = 0;
    };
    // earthworks, and a bridge end's abutment set into a bank (groundStations): its sides are concrete
    // wing walls out to the engine's daylight points
    const ground = groundStations(r, natural);
    for (let i = 0; i < n - 1; i++) {
      if (i % 32 === 0) { flushGround(); yield; } // corridor-local frustum culling, not one route-wide mesh
      const k0 = r.kind[i], k1 = r.kind[i + 1];
      if (k0 === KIND.tunnel || k1 === KIND.tunnel) continue;
      const a = sv[i], b = sv[i + 1];
      quad(a.cl, b.cl, a.cr, b.cr);
      const abutment = k0 !== KIND.earth || k1 !== KIND.earth;
      if (ground[i] && ground[i + 1]) for (const side of [1, -1]) {
        const sections = daylightSections(r, i, side, w, natural, ground);
        // the slope's bend (a fill's toe band, a cut's rock face), drawn where the engine bends it
        const k0 = abutment ? null : slopeKnee(r, i, side, w), k1 = abutment ? null : slopeKnee(r, i + 1, side, w);
        let prev: { day: number; edge: number; knee?: number; ground: number; wallGround?: number; wallSlope?: number } | undefined;
        for (let j = 0; j < sections.length; j++) {
          const s = sections[j], t = j / (sections.length - 1), toe = s.slopeDay ?? s.day;
          const fill = s.edge.z > s.day.z, kind = abutment ? EW_KIND.structure : fill ? EW_KIND.fill : EW_KIND.cut;
          const color = abutment ? concrete : fill ? fillC : cutC;
          const gp = r.geology.profiles[r.geology.ids[i]];
          const geology = (depth: number) => gp.normMix ? [-3, -3, r.s[i]+t*(r.s[i+1]-r.s[i])] : [depth-gp.classIto, depth-gp.classIIto, r.s[i]+t*(r.s[i+1]-r.s[i])];
          const day = push(toe.x, toe.y, toe.z+groundLift, color, toe.z, slopeInk, kind, geology(s.day.z-toe.z));
          const edge = push(s.edge.x, s.edge.y, s.edge.z+lift, color, s.edge.z, slopeInk, kind, geology(natural(s.edge.x,s.edge.y)-s.edge.z));
          let knee: number | undefined;
          if (k0 || k1) { // (also beside a wall's last station: the unretained end keeps its bend, so the next stretch meets it)
            const u = (k0?.u ?? 0.5) * (1 - t) + (k1?.u ?? 0.5) * t, dz = (k0?.dz ?? 0) * (1 - t) + (k1?.dz ?? 0) * t;
            const kx = s.edge.x + u * (toe.x - s.edge.x), ky = s.edge.y + u * (toe.y - s.edge.y), kz = s.edge.z + u * (toe.z - s.edge.z) + dz;
            knee = push(kx, ky, kz + groundLift, color, kz, slopeInk, kind, geology(natural(kx, ky) - kz));
          }
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
            if (prev.knee !== undefined && knee !== undefined) { quad(prev.day, day, prev.knee, knee); quad(prev.knee, knee, prev.edge, edge); }
            else quad(prev.day, day, prev.edge, edge);
            if (prev.wallGround !== undefined && wallGround !== undefined) quad(prev.wallGround, wallGround, prev.wallSlope!, wallSlope!);
            for (let k = 0; k < 8; k++) groundIdx.push(prev.ground+k, ground+k, prev.ground+k+1, ground+k, ground+k+1, prev.ground+k+1);
          }
          prev = { day, edge, knee, ground, wallGround, wallSlope };
        }
      }
    }
    flushGround();
    // Close the ground works' cross-section at structure transitions: the abutment's front wall under
    // the crown and its wing walls out to the toes, in concrete. Without these faces the terrain
    // cut-out is visible as a sky-coloured hole beside the first/last bridge span.
    const again = (k: number) => { // vertex k once more, as concrete
      pos.push(pos[3*k], pos[3*k+1], pos[3*k+2]); col.push(concrete.r, concrete.g, concrete.b); elev.push(elev[k]); ink.push(0);
      kinds.push(EW_KIND.structure); geo.push(...noGeo);
      return pos.length / 3 - 1;
    };
    yield; // a long route's whole-route passes below are sliced too
    for (let i = 0; i < n; i++) {
      if (i % 512 === 511) yield;
      if (!ground[i] || !((i > 0 && !ground[i-1]) || (i+1 < n && !ground[i+1]))) continue;
      const x = r.x[i], y = r.y[i], nx = -r.ty[i], ny = r.tx[i], z = r.grade[i];
      const zl = this.terrain.heightAt(x+nx*w, y+ny*w), zr = this.terrain.heightAt(x-nx*w, y-ny*w);
      if (z <= Math.max(zl, zr)) continue;
      const l = push(x+nx*w, y+ny*w, zl, concrete, zl), rr = push(x-nx*w, y-ny*w, zr, concrete, zr);
      const station = sv[i], el = again(station.el), er = again(station.er);
      const dl = again(station.dl), dr = again(station.dr);
      const wl = station.wl === undefined ? undefined : again(station.wl), wr = station.wr === undefined ? undefined : again(station.wr);
      quad(el, l, er, rr);
      idx.push(wl ?? dl, l, el, er, rr, wr ?? dr);
      // Retained toes need the lower part of the end cap too, otherwise the bridge
      // transition exposes a hole between the vertical wall and ground under the crown.
      if (wl !== undefined) idx.push(dl, l, wl);
      if (wr !== undefined) idx.push(wr, rr, dr);
    }
    // The portal face: the hill above and beside the portals, from the approach cut's cross-section up to
    // natural ground (a secured face). Without it the cut-off edge of the terrain shows the sky.
    const face = concrete.clone().multiplyScalar(0.8);
    for (const run of r.runs) if (run.kind === KIND.tunnel) for (const i of [run.i0 - 1, run.i1 + 1]) {
      if (i < 0 || i >= n || !ground[i]) continue;
      const x = r.x[i], y = r.y[i], nx = -r.ty[i], ny = r.tx[i], z = r.grade[i], L = r.dayL[i], R = r.dayR[i];
      const bottom = (o: number) => o > w ? z + (r.zDayL[i] - z) * (o - w) / Math.max(1e-6, L - w)
        : o < -w ? z + (r.zDayR[i] - z) * (-o - w) / Math.max(1e-6, R - w) : z;
      const steps = Math.max(2, Math.ceil((L + R) / 2.5));
      let prev: [number, number] | null = null;
      for (let k = 0; k <= steps; k++) {
        const o = L - (L + R) * k / steps, px = x + nx * o, py = y + ny * o, top = natural(px, py) + groundLift;
        const at: [number, number] = [push(px, py, Math.min(bottom(o), top), face), push(px, py, top, face)];
        if (prev) quad(prev[0], at[0], prev[1], at[1]);
        prev = at;
      }
      // Ground over the tunnel behind the face's top edge, out past the side collars: the terrain mask's bleed
      // (≈ a texel) leaves a strip of it cut away, and the drawn terrain (coarser than the face's ground)
      // stands above or below the face's top. From the face's ground it rises to the drawn terrain within
      // PORTAL_LID_BLEND and overlaps it beyond, as the side collars do; without it sky slivers line the top.
      const into = i < run.i0 ? 1 : -1, wide = Math.max(2, Math.ceil((L + R + 2 * GROUND_COLLAR) / 2.5));
      const rows = Math.ceil(PORTAL_LID / 2.5), base = groundPos.length / 3;
      for (let k = 0; k <= wide; k++) {
        const o = L + GROUND_COLLAR - (L + R + 2 * GROUND_COLLAR) * k / wide;
        // beside the cut, the side collar's own blend towards the drawn terrain (collarPoint)
        const out = o > L ? o - L : o < -R ? -R - o : 0, side = Math.max(0, Math.min(1, (out - 10) / (GROUND_COLLAR - COLLAR_OVERLAP - 2.5 - 10)));
        for (let j = 0; j <= rows; j++) {
          const d = PORTAL_LID * j / rows, px = x + nx * o + r.tx[i] * into * d, py = y + ny * o + r.ty[i] * into * d;
          const g = natural(px, py), blend = Math.max(side, Math.min(1, d / PORTAL_LID_BLEND));
          this.local(px, py, g + (blend ? (Math.max(g, coarse(px, py)) - g) * blend : 0) + groundLift, v); groundPos.push(v.x, v.y, v.z);
        }
      }
      for (let k = 0; k < wide; k++) for (let j = 0; j < rows; j++) {
        const a = base + k * (rows + 1) + j, b = a + rows + 1;
        groundIdx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    flushGround();
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
    // A paired motorway is carried on twin decks and runs through twin tubes: the median is open.
    const gap = section === PAIRED_SECTION || section === CARRIAGEWAY_SECTION ? D275_SECTION.median / 2 : 0;
    // one direction of a split motorway: its half of the median (on its left) is open on a bridge
    const strips: [number, number][] = section === CARRIAGEWAY_SECTION ? [side > 0 ? [-w, w - gap] : [-w + gap, w]] : gap ? [[gap, w], [-w, -gap]] : [[-w, w]];
    const across = (p: { x: number; y: number; tx: number; ty: number }, o: number) => [p.x - p.ty * o, p.y + p.tx * o] as const;
    for (const run of r.runs) {
      yield;
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
            for (const o of strips.flat()) {
              const c = shade(concrete, o > 0 ? 0.95 : 0.75), [ax, ay] = across(a, o), [bx, by] = across(b, o);
              quad(push(ax,ay,a.z+lift,c), push(bx,by,b.z+lift,c), push(ax,ay,a.z-deck,c), push(bx,by,b.z-deck,c));
            }
            const u = shade(concrete, 0.55);
            for (const [lo, hi] of strips) {
              const [a0x, a0y] = across(a, hi), [a1x, a1y] = across(a, lo), [b0x, b0y] = across(b, hi), [b1x, b1y] = across(b, lo);
              quad(push(a0x,a0y,a.z-deck,u), push(a1x,a1y,a.z-deck,u), push(b0x,b0y,b.z-deck,u), push(b1x,b1y,b.z-deck,u));
            }
          }
        }
        // Close the soffit step between unequal spans, rather than leave an open deck at a pier.
        for (let j = 1; j < spans.length; j++) if (Math.abs(spans[j-1].depth-spans[j].depth) > 1e-6) {
          const p = at(spans[j].s0), c = shade(concrete,.65);
          for (const [lo, hi] of strips) {
            const [hx, hy] = across(p, hi), [lx, ly] = across(p, lo);
            quad(push(hx,hy,p.z-spans[j-1].depth,c), push(lx,ly,p.z-spans[j-1].depth,c), push(hx,hy,p.z-spans[j].depth,c), push(lx,ly,p.z-spans[j].depth,c));
          }
        }
        // Close deep deck ends even where the embankment cap cannot hide the underside.
        for (const [s,depth] of [[r.s[Math.max(0,run.i0-1)],spans[0].depth],
          [r.s[Math.min(n-1,run.i1+1)],spans[spans.length-1].depth]]) {
          const p = at(s), c = shade(concrete,.75);
          for (const [lo, hi] of strips) {
            const [hx, hy] = across(p, hi), [lx, ly] = across(p, lo);
            quad(push(hx,hy,p.z+lift,c), push(lx,ly,p.z+lift,c), push(hx,hy,p.z-depth,c), push(lx,ly,p.z-depth,c));
          }
        }
        // Same explicit layout as pricing and footprint checks. Never silently omit a
        // colliding pier: the blocked marker explains why the player must adjust the bridge.
        for (const p of piers) {
          const top = bridgePierTop(spans,p.s-p.along,p.s+p.along,(s0,s1) => {
            let highest = Math.max(at(s0).z,at(s1).z);
            for (let j = Math.max(0,Math.floor(s0/r.ds)+1); j < n && r.s[j] < s1; j++) highest = Math.max(highest,r.grade[j]);
            return highest;
          });
          // twin decks stand on their own piers (same share of each deck's width as a single deck's)
          for (const [lo, hi] of gap || section === CARRIAGEWAY_SECTION ? strips : [[-p.left, p.left]]) {
            const [cx, cy] = across(p, (lo + hi) / 2);
            boxAt(cx, cy, p.tx, p.ty, this.terrain.heightAt(cx, cy) - 2, top, p.along, gap || section === CARRIAGEWAY_SECTION ? (hi - lo) / 2 * 0.55 : p.left, shade(concrete, 0.85));
          }
        }
      } else if (run.kind === KIND.tunnel) {
        for (const i of [Math.max(0, run.i0 - 1), Math.min(n - 1, run.i1 + 1)]) for (const [lo, hi] of strips) {
          // one portal per tube, centred on its carriageway
          const half = (hi - lo) / 2, [cx, cy] = across({ x: r.x[i], y: r.y[i], tx: r.tx[i], ty: r.ty[i] }, (lo + hi) / 2);
          boxAt(cx, cy, r.tx[i], r.ty[i], r.grade[i] - 0.5, r.grade[i] + 8, 1.5, half + 1.5, new THREE.Color(0x55555c));
          boxAt(cx, cy, r.tx[i], r.ty[i], r.grade[i], r.grade[i] + 6.5, 1.8, half - 0.5, new THREE.Color(0x111114));
        }
      }
    }
    yield;
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
    yield;
    g.computeVertexNormals();
    yield;

    out.push(...this.centreline(r, bad));

    // ---- far away, where a footprint is under a pixel: demolitions (dark squares) / buyouts (magenta
    // diamonds), outlined so they read on any roof, on the ground at the building. Nearer, the map shows the
    // cleared plot and the bought house its colour (buildPlots, commitRouteScene).
    for (const [buildings, buyout] of [[buildingMarkers ? r.demolished : [], false], [buildingMarkers ? r.boughtOut : [], true]] as const) {
      if (!buildings.length) continue;
      const bp: number[] = [], radius: number[] = [];
      for (const { j } of buildings) {
        const b = this.pack.overlays.buildings[j];
        this.local(b[0], b[1], this.drapeHeight(b[0], b[1]), v);
        bp.push(v.x, v.y, v.z); radius.push(b[2]);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      pg.setAttribute('radius', new THREE.Float32BufferAttribute(radius, 1));
      const pts = new THREE.Points(pg, this.markerMaterial(buyout));
      pts.name = buyout ? 'noise-buyouts' : 'footprint-demolitions';
      pts.renderOrder = 5;
      pts.onBeforeRender = (renderer) => { (pts.material as THREE.ShaderMaterial).uniforms.vh.value = renderer.getDrawingBufferSize(this.bufferSize).y; };
      out.push(pts);
    }
    handedOver = true;
    const commit = () => {
      if (settled) return;
      settled = true;
      owned.commit();
      this.routeInputs.set(routeId, { result: r, surfaces });
      this.stale = false;
      if (!batch) this.commitRouteScene(new Set(this.routeInputs.keys()));
      this.dirty = true;
    };
    return { commit, dispose, context };
    } finally {
      // abandoned (or failed) before handing the staged result over: nothing was shown
      if (!handedOver) dispose();
    }
  }

  private bufferSize = new THREE.Vector2();
  private markerMats: Partial<Record<'square' | 'diamond', THREE.ShaderMaterial>> = {};
  /** far-zoom building markers: shown only where the footprint is a few pixels across (too small to read) */
  private markerMaterial(diamond: boolean): THREE.ShaderMaterial {
    const k = diamond ? 'diamond' : 'square';
    return this.markerMats[k] ??= new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(diamond ? BOUGHT_COLOR : DEMOLISHED_COLOR) }, size: { value: diamond ? 11 : 9 }, vh: { value: 1 } },
      vertexShader: `attribute float radius; uniform float size; uniform float vh;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float px = radius * projectionMatrix[1][1] * 0.5 * vh / max(-mv.z, 1e-3);
          gl_PointSize = px > 3.0 ? 0.0 : size;
        }`,
      fragmentShader: `uniform vec3 color; uniform float size;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = ${diamond ? 'abs(p.x) + abs(p.y)' : 'max(abs(p.x), abs(p.y))'};
          if (d > 0.5) discard;
          gl_FragColor = vec4(d > 0.5 - 1.6 / size ? vec3(1.0) : color, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
  }

  /** Replacement ground beside the slopes: one material for the life of the view (it was one
   * per 32 stations per result: a program lookup each, and churn for the retire queue). */
  private collarMaterial() {
    if (!this.collarMat) {
      // A replacement collar is ground, not pavement: it must not bury another route's cut or
      // fill when their collars overlap. The shared mask contains every settled road footprint.
      this.collarMat = makeTerrainMaterial(this.terrainU, this.originalMask);
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
      const z = routeIndicationHeight(r, i, (x, y) => this.drapeHeight(x, y));
      this.local(r.x[i], r.y[i], z, v);
      cp.push(v.x, v.y, v.z);
      const c = bad[i] ? COL.bad : r.kind[i] === KIND.bridge ? COL.bridge : tun ? COL.tunnel : COL.earth;
      cc.push(c.r, c.g, c.b);
    }
    const line = this.makeLine(cp, cc, 3.5, { order: 4 });
    line.name = 'centre';
    const ghost = this.makeLine(cp, cc, 2, { opacity: 0.35, depthTest: false, order: 2 });
    ghost.name = 'ghost';
    const out: THREE.Object3D[] = [line, ghost];
    // tunnels on the ground above them, for close up (where the structure line is not drawn)
    for (const run of r.runs) {
      if (run.kind !== KIND.tunnel) continue;
      const tp = cp.slice(3 * Math.max(0, run.i0 - 1), 3 * (Math.min(r.n - 1, run.i1 + 1) + 1));
      if (tp.length < 6) continue;
      const trace = this.makeLine(tp, null, 2, { color: COL.tunnel.getHex(), opacity: 0.85, dashed: true, dashSize: 10, gapSize: 8, order: 4 });
      trace.name = 'tunnel-trace';
      out.push(trace);
    }
    return out;
  }

  /**
   * Drag preview: only the centreline follows the moved route (a few ms). The earthwork ribbon,
   * terrain cut-out, collars and crossings stay at the last full result until the next one.
   */
  routeGeometryStats() {
    return [...this.routeGroups.values()].map(group => ({
      routeId: group.userData.routeId as string,
      ribbonTriangles: ((group.getObjectByName('ribbon') as THREE.Mesh | undefined)?.geometry.index?.count ?? 0) / 3,
      collars: group.children.filter(child => child.name === 'daylight-ground').length,
    }));
  }

  setPreview(r: Result, routeId = LEGACY_ROUTE) {
    const group = this.routeGroups.get(routeId);
    if (!group) return;
    for (const old of [...group.children] as Line2[]) {
      if (old.name !== 'centre' && old.name !== 'ghost' && old.name !== 'tunnel-trace') continue;
      group.remove(old); old.geometry.dispose(); this.retire(old.material);
    }
    for (const o of this.centreline(r, badStations(r))) { o.userData.routeId = routeId; group.add(o); }
    this.stale = true;
    this.dirty = true;
  }

  /** The route-length part of commitRouteScene for the routes that will be shown, computed ahead in
   * slices (a long route's mask and blend would otherwise be one long task at the swap). */
  *prepareRouteScene(inputs: readonly { result: Result; surfaces: readonly CrossingSurface[] }[]): Generator<void, PreparedScene> {
    const crossingSurfaces = inputs.flatMap(input => [...input.surfaces]);
    const context = yield* routeSurfaceContextSliced(crossingSurfaces, crossingSurfaces, (x, y) => this.groundHeight(x, y), (x, y) => this.drape(x, y));
    yield;
    const mask = routeMask(inputs, this.cx, this.cy, (x, y) => this.terrain.heightAt(x, y));
    yield;
    return { inputs, crossingSurfaces, replacementHeight: context.replacementHeight, mask };
  }

  /** Complete a staged scene swap once, after all route and crossing groups commit synchronously. */
  commitRouteScene(ids: ReadonlySet<string>, globalDemolished?: readonly number[], globalBought?: readonly number[], prepared?: PreparedScene) {
    this.routeGroups.retain(ids);
    for (const id of this.routeInputs.keys()) if (!ids.has(id)) this.routeInputs.delete(id);
    this.maskSources = [...this.routeInputs.values()];
    // Prepared for exactly these routes (any order): use it; otherwise compute now.
    const ready = prepared && prepared.inputs.length === this.maskSources.length
      && this.maskSources.every(m => prepared.inputs.some(p => p.result === m.result && p.surfaces === m.surfaces)) ? prepared : undefined;
    this.crossingSurfaces = ready?.crossingSurfaces ?? this.maskSources.flatMap(input => [...input.surfaces]);
    this.replacementHeight = ready?.replacementHeight ?? routeSurfaceContext(this.crossingSurfaces, this.crossingSurfaces,
      (x, y) => this.groundHeight(x, y), (x, y) => this.drape(x, y)).replacementHeight;
    this.contourLabels?.schedule(this.contourStep * 5);
    this.drawMask(this.maskSources, ready?.mask);
    const demolished = new Set<number>();
    const indices = globalDemolished ?? [...this.routeInputs.values()].flatMap(({ result }) => result.demolished.map(b => b.j));
    for (const j of indices) { const mesh = this.buildingMesh(j); if (mesh >= 0) demolished.add(mesh); }
    this.buildings?.hide(demolished);
    // bought-out houses stand until they are cleared: their own colour in every view
    const bought = new Map<number, number>();
    for (const j of globalBought ?? [...this.routeInputs.values()].flatMap(({ result }) => result.boughtOut.map(b => b.j))) {
      const mesh = this.buildingMesh(j); if (mesh >= 0) bought.set(mesh, BOUGHT_COLOR);
    }
    this.buildings?.setMarked(bought);
    this.dirty = true;
  }

  private drawMask(inputs: readonly RouteMaskInput[], prepared?: ReturnType<typeof routeMask>) {
    const { terrain: pos, original, cuts, box: bounds } = prepared ?? routeMask(inputs, this.cx, this.cy, (x, y) => this.terrain.heightAt(x, y));
    if (!bounds) {
      this.maskUniforms.maskOn.value = this.originalMask.maskOn.value = this.crossingCut.maskOn.value = 0;
      return;
    }
    const { minX, minZ, maxX, maxZ } = bounds;
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
  /** Free part of the view for framing (px inside the container): what the toolbar, legend and
   * attribution leave, and boxes to keep clear of (the intro card). Set by the app. */
  frameSafe: (() => { left: number; top: number; right: number; bottom: number; avoid: readonly { left: number; top: number; right: number; bottom: number }[] }) | null = null;

  /** The start view: A and B both on screen, clear of the panels, as close as that allows, looking from the
   * usual direction (from the south, north up); a long route the usual view cannot take in (the whole D3 runs
   * north–south) is looked at across, A on the left. */
  resetCamera() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w && h && Math.abs(this.camera.aspect - w / h) > 1e-6) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    const A = this.pack.meta.A.xy as [number, number], B = this.pack.meta.B.xy as [number, number];
    const zA = this.terrain.heightAt(A[0], A[1]), zB = this.terrain.heightAt(B[0], B[1]);
    const a = this.local(A[0], A[1], zA * this.exag), b = this.local(B[0], B[1], zB * this.exag);
    const target = a.clone().add(b).multiplyScalar(0.5);
    const safe = this.frameSafe?.() ?? { left: 0, top: 0, right: w, bottom: h, avoid: [] };
    const margin = 36;
    // the usual direction: camera south-south-east of the target, ≈ 51° up; across: from the right of A → B
    const usual = new THREE.Vector3(2500, 17500, 14000).normalize();
    const ax = b.x - a.x, az = b.z - a.z, al = Math.hypot(ax, az) || 1, flat = Math.hypot(usual.x, usual.z);
    const across = new THREE.Vector3(-az / al * flat, usual.y, ax / al * flat);
    // each end's name is written to the right of its disc: keep room for it
    const room = (end: RenderEndpoints['a']) => 42 + 7.5 * (end.label?.length ?? 0);
    const rooms = [room(this.endpoints.a), room(this.endpoints.b)];
    /** Screen positions of A and B looking along `dir` from `d` at `center`, or null if one is behind. */
    const place = (dir: THREE.Vector3, d: number, center: THREE.Vector3) => {
      this.camera.position.copy(center).addScaledVector(dir, d);
      this.camera.lookAt(center); this.camera.updateMatrixWorld();
      const out: { sx: number; sy: number }[] = [];
      for (const p of [a, b]) {
        const v = p.clone().project(this.camera);
        if (!(v.z > -1 && v.z < 1)) return null;
        out.push({ sx: (v.x * 0.5 + 0.5) * w, sy: (-v.y * 0.5 + 0.5) * h });
      }
      return out;
    };
    const clear = (pts: { sx: number; sy: number }[]) => pts.every(({ sx, sy }, k) =>
      sx >= safe.left + margin && sx <= safe.right - margin - rooms[k] && sy >= safe.top + margin && sy <= safe.bottom - margin
      && safe.avoid.every(r => sx < r.left - margin || sx > r.right + margin || sy < r.top - margin || sy > r.bottom + margin));
    /** The view centre at distance d that frames both ends: the midpoint, or panned so that the ends
     * clear a box (the intro card) by moving them right or down; null if none does. */
    const fits = (dir: THREE.Vector3, d: number): THREE.Vector3 | null => {
      const pts = place(dir, d, target);
      if (!pts) return null;
      if (clear(pts)) return target;
      // metres per pixel at the target, along the camera's right and (ground-projected) up directions
      const mpp = (2 * d * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      for (const r of safe.avoid) for (const [dx, dy] of [[r.right + margin + 1, 0], [0, r.bottom + margin + 1]] as const) {
        const shiftX = Math.max(0, ...pts.map(p => dx ? dx - p.sx : 0)), shiftY = Math.max(0, ...pts.map(p => dy ? dy - p.sy : 0));
        if (!shiftX && !shiftY) continue;
        // moving the view centre left / up moves the ends right / down on screen
        const center = target.clone().addScaledVector(right, -shiftX * mpp).addScaledVector(up, shiftY * mpp);
        const moved = place(dir, d, center);
        if (moved && clear(moved)) return center;
      }
      return null;
    };
    let d = 22600, dir = usual, center = target;
    for (const candidate of [usual, across]) {
      if (!w || !h) break;
      // the closest distance that frames the ends (scanning outwards: a pan can make a closer view fit)
      let found: { d: number; c: THREE.Vector3 } | null = null;
      for (let dd = 600; dd <= this.controls.maxDistance && !found; dd *= 1.06) { const c = fits(candidate, dd); if (c) found = { d: dd, c }; }
      if (!found) continue;
      d = found.d; dir = candidate; center = found.c; break;
    }
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, Math.max(this.controls.minDistance, d));
    this.controls.update();
    this.dirty = true;
  }

  /**
   * The orbit target back on the ground under the screen centre; the camera stays where it is, so the
   * view does not move. A target left in the air or under a hill (a pan keeps it at one height) stopped
   * the wheel short of the ground, made pans run kilometres and swung the subject away on a turn.
   */
  private anchorTarget() {
    const cam = this.camera.position, t = this.controls.target;
    const d = t.clone().sub(cam), dist = d.length();
    if (!(dist > 0)) return;
    d.divideScalar(dist);
    const hit = this.groundAlong(cam, d, Math.max(4 * dist, 20000));
    if (hit !== null && hit >= this.controls.minDistance) t.copy(cam).addScaledVector(d, hit);
    this.keepTargetOnMap();
    this.controls.update();
    this.dirty = true;
  }
  /** The orbit target stays over the map: a pan past its edge stops there (the view moves with it). */
  private keepTargetOnMap() {
    const t = this.controls.target, T = this.terrain;
    const x = t.x + this.cx, y = this.cy - t.z, cx = Math.min(T.width, Math.max(0, x)), cy = Math.min(T.height, Math.max(0, y));
    if (cx === x && cy === y) return;
    const shift = new THREE.Vector3(cx - x, 0, -(cy - y));
    t.add(shift); this.camera.position.add(shift);
  }

  /** The view looks out low over the horizon (a flight there lifts it). */
  get lowView() {
    const off = this.camera.position.clone().sub(this.controls.target);
    return off.y < off.length() * Math.sin(FLY_LOWEST);
  }

  /** The whole of these points in view, north up, from well above (the map's "Whole route"). */
  frame(points: readonly { x: number; y: number }[]) {
    if (!points.length) { this.resetCamera(); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1, fov = (this.camera.fov * Math.PI) / 180;
    // the larger of the extents, as seen on screen (with a margin), at 55° above the horizon
    const span = Math.max((y1 - y0) / Math.sin((55 * Math.PI) / 180), (x1 - x0) * h / w) * 1.25 + 400;
    this.lookAt((x0 + x1) / 2, (y0 + y1) / 2, Math.min(this.controls.maxDistance, span / (2 * Math.tan(fov / 2))), 0, 55);
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
    // from a view low over the horizon the place flown to would sit on the horizon: look down on it
    const length = off1.length(), flat = Math.hypot(off1.x, off1.z);
    if (length > 0 && off1.y < length * Math.sin(FLY_LOWEST)) {
      const along = flat > 1e-6 ? length * Math.cos(FLY_PITCH) / flat : 0;
      off1.set(flat > 1e-6 ? off1.x * along : 0, length * Math.sin(FLY_PITCH), flat > 1e-6 ? off1.z * along : length * Math.cos(FLY_PITCH));
    }
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
    // the ground under the cursor keeps its place on screen
    const ground = this.groundAlong(o, d, Math.max(4 * dist, 20000));
    if (ground !== null) p.copy(o).addScaledVector(d, ground);
    else if (d.y < -1e-4 && o.y > t.y) p.copy(d).multiplyScalar((t.y - o.y) / d.y).add(o);
    // near the horizon the point runs away: keep the fixed point within a few distances of the target
    const off = p.distanceTo(t);
    if (off > 3 * dist) p.sub(t).multiplyScalar((3 * dist) / off).add(t);
    cam.sub(p).multiplyScalar(s).add(p);
    t.sub(p).multiplyScalar(s).add(p);
    this.anchorTarget();
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
    // the structure line: see STRUCTURE_LINE_FROM
    const mpp = this.metresPerPixel, far = mpp > STRUCTURE_LINE_FROM, editing = this.stale || this.dragging !== null;
    for (const group of this.routeGroups.values()) for (const o of group.children) {
      if (o.name === 'centre') {
        o.visible = far || editing;
        ((o as Line2).material as LineMaterial).linewidth = far ? (mpp < 8 ? 2.5 : 3.5) : 2;
      } else if (o.name === 'ghost') o.visible = far;
      else if (o.name === 'tunnel-trace') o.visible = !far;
    }
    if (this.activeBend !== this.guideFor) this.buildGuide();
    if (this.officialLine) (this.officialLine.material as LineMaterial).dashScale = 1 / mpp;
    this.updateSurface();
    this.renderer.render(this.scene, this.camera);
    if (this.retired.length) { for (const m of this.retired) this.release(m); this.retired.length = 0; }
    const place = (el: HTMLElement, x: number, y: number, z: number, minDist?: number) => {
      const s = this.screenOf(x, y, z);
      const show = s.vis && (minDist === undefined || s.dist < minDist);
      el.style.display = show ? '' : 'none';
      if (show) el.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px)`;
    };
    // A, B and the official line's label keep their room; place names follow by rank, one that would
    // overlap a name already placed is left out, and so is one far beyond what the view looks at
    // (low over the horizon, names piled up along it)
    this.labelRoom.reset();
    const ui = this.uiRoom();
    for (let k = 0; k < ui.length; k += 4) this.labelRoom.reserve(ui[k], ui[k + 1], ui[k + 2], ui[k + 3]);
    for (const m of this.endpointMarkers) {
      place(m.el, m.x, m.y, m.z);
      const s = this.screenOf(m.x, m.y, m.z);
      if (s.vis) this.labelRoom.fit(m.el, s.sx, s.sy, true);
    }
    this.placeOfficialLabel();
    const horizon = LABEL_HORIZON * this.cameraDistance;
    for (const m of this.markers) {
      const s = this.screenOf(m.x, m.y, m.z);
      const show = s.vis && (m.minDist === undefined || s.dist < m.minDist) && s.dist < horizon && this.labelRoom.fit(m.el, s.sx, s.sy);
      m.el.style.display = show ? '' : 'none';
      if (show) m.el.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px)`;
    }
    // zoom class for the overlay's CSS (small symbols from afar)
    const zoom = mpp > 12 ? 'far' : mpp > 3 ? 'mid' : 'near';
    if (this.overlay.dataset.zoom !== zoom) this.overlay.dataset.zoom = zoom;
    // bends: one too close to an already drawn one (or to A / B) shrinks to a dot, its number in the
    // tooltip; the selected bend is drawn first, so it always keeps its number
    const taken: { sx: number; sy: number }[] = [];
    for (const m of this.endpointMarkers) { const s = this.screenOf(m.x, m.y, m.z); if (s.vis) taken.push(s); }
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
    for (const listener of this.renderListeners) listener();
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
        if (p) this.ev.onPickTerrain?.(p.x, p.y, e.clientX, e.clientY); else this.ev.onPickNothing?.();
      }
      down = null;
    });
    canvas.addEventListener('dblclick', (e) => {
      const p = this.pick(e.clientX, e.clientY);
      if (p) this.ev.onDoublePick?.(p.x, p.y);
    });
    // a press on the road: a drag bends it (a new bend follows the mouse), a click selects; the map
    // controls never see it (capture phase on the container, before the canvas' own listeners)
    // a press on another draggable object (a reroute link): the same gesture, its own handler
    this.container.addEventListener('pointerdown', (e) => {
      if (e.target !== canvas || e.button !== 0 || this.ev.hitRoad?.(e.clientX, e.clientY)) return;
      const grab = this.ev.grab?.(e.clientX, e.clientY);
      if (!grab) return;
      e.stopPropagation();
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
      canvas.setPointerCapture(id);
      const g0 = this.pick(x0, y0);
      let started = false;
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        if (!started) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5 || !g0) return;
          if (!grab.start(g0.x, g0.y)) { stop(); return; }
          started = true; this.controls.enabled = false;
        }
        const p = this.pick(ev.clientX, ev.clientY);
        if (p) grab.move(p.x, p.y);
      };
      const stop = () => {
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', cancel);
        canvas.removeEventListener('lostpointercapture', cancel);
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
        this.controls.enabled = true;
      };
      const cancel = (ev: PointerEvent) => { if (ev.pointerId !== id) return; stop(); if (started) grab.end(); };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        stop();
        if (started) { grab.end(); return; }
        const p = this.pick(ev.clientX, ev.clientY);
        if (p) this.ev.onPickTerrain?.(p.x, p.y, ev.clientX, ev.clientY); else this.ev.onPickNothing?.();
      };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', cancel);
      canvas.addEventListener('lostpointercapture', cancel);
    }, { capture: true });
    this.container.addEventListener('pointerdown', (e) => {
      if (e.target !== canvas || e.button !== 0 || !this.ev.hitRoad?.(e.clientX, e.clientY)) return;
      e.stopPropagation();
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
      canvas.setPointerCapture(id);
      const g0 = this.pick(x0, y0);
      let i: number | null = null, waiting = false, at = { x: x0, y: y0 };
      const move = (ev: { pointerId: number; clientX: number; clientY: number }) => {
        if (ev.pointerId !== id) return;
        at = { x: ev.clientX, y: ev.clientY };
        if (i === null) {
          if ((!waiting && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) || !g0) return;
          const k = this.ev.onRoadDrag?.(g0.x, g0.y) ?? null;
          if (k === 'wait') { waiting = true; return; }
          waiting = false; i = k;
          if (i === null) { stop(); return; }
          this.dragging = i;
          this.ev.onPiDragStart?.(i);
        }
        const p = this.pick(ev.clientX, ev.clientY);
        if (!p || this.dragging !== i) return; // (taken back with Undo: the rest of the gesture moves nothing)
        const m = this.piMarkers[i];
        if (m) { m.x = p.x; m.y = p.y; m.z = this.terrain.heightAt(p.x, p.y); }
        this.dirty = true;
        this.ev.onPiDrag?.(i, p.x, p.y);
      };
      this.resumeRoadDrag = () => { if (waiting) move({ pointerId: id, clientX: at.x, clientY: at.y }); };
      const stop = () => {
        this.resumeRoadDrag = () => {};
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', cancel);
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      };
      // a cancelled drag (pointer lost) keeps the bend where it got to, as one undo step
      const cancel = () => { stop(); if (i !== null) { this.dragging = null; this.ev.onPiDragEnd?.(i); } };
      const up = (ev: PointerEvent) => {
        stop();
        if (i !== null) { this.dragging = null; this.ev.onPiDragEnd?.(i); return; }
        // released while still held: a click on the ground point it pressed, where that is on the screen
        // now (a camera flight may have moved on meanwhile)
        if (waiting && g0) {
          const q = this.project(g0.x, g0.y, this.drape(g0.x, g0.y)), box = this.container.getBoundingClientRect();
          if (q.vis) this.ev.onPickTerrain?.(g0.x, g0.y, box.left + q.sx, box.top + q.sy); else this.ev.onPickNothing?.();
          return;
        }
        const p = this.pick(ev.clientX, ev.clientY);
        if (p) this.ev.onPickTerrain?.(p.x, p.y, ev.clientX, ev.clientY); else this.ev.onPickNothing?.();
      };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', cancel);
    }, { capture: true });
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
  /** where the camera is and looks (for automation): its height above the ground under it, the target's
   * height above the ground under it, and how far above the horizon it looks down, degrees */
  get pose() {
    const c = this.camera.position, t = this.controls.target, off = c.clone().sub(t);
    const ground = (v: THREE.Vector3) => this.terrain.heightAt(Math.min(this.terrain.width, Math.max(0, v.x + this.cx)), Math.min(this.terrain.height, Math.max(0, this.cy - v.z))) * this.exag;
    return { x: c.x + this.cx, y: this.cy - c.z, aboveGround: c.y - ground(c), targetAboveGround: t.y - ground(t),
      pitch: (Math.asin(Math.max(-1, Math.min(1, off.y / (off.length() || 1)))) * 180) / Math.PI, distance: off.length() };
  }
}
