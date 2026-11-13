// Land cover, existing roads / railways / waterways and building footprints, rasterised on the GPU from
// the pack's vector data into anti-aliased textures:
//   - one base texture of the whole play area (drawn once), and
//   - LC_LEVELS "clip levels": square windows around the camera focus at 0.125 … 4 m per texel, each twice
//     as coarse as the previous, re-drawn (one per frame at most) only when the focus leaves the middle of
//     a window or the zoom changes by an octave.
// The terrain shader blends them, finest first, so the ground is about as sharp as the screen at any
// zoom while memory stays bounded. Textures hold premultiplied RGBA (alpha = how much the layer covers the
// hypsometric tint); layers are drawn without blending in painter's order, so overlapping OSM polygons
// do not darken, and edges are anti-aliased by 4× MSAA.

import * as THREE from 'three';
import { LC_LEVELS, type TerrainUniforms } from './terrainMaterial';
import type { BuildingData, LineLayer, VectorPack } from './vectorPack';

type RGB = [number, number, number];

interface Pass {
  layer: string;
  kind: 'poly' | 'line';
  color: RGB;
  alpha: number;
  /** lines: full width in metres and the minimum width in texels */
  width?: number;
  minPx?: number;
  /** lines: extra half-width (casing) in metres / texels */
  extra?: number;
  extraPx?: number;
  /** lines: dash period (m) and duty */
  dash?: [number, number];
  /** only drawn at resolutions finer than this many metres per texel (fades out over the octave below it) */
  maxRes?: number;
}

export const BUILDING_COLOR: RGB = [156, 92, 78];
const ROAD: RGB = [252, 247, 235], CASING: RGB = [128, 116, 104];
const casing = (layer: string, width: number, minPx: number): Pass =>
  ({ layer, kind: 'line', color: CASING, alpha: 0.85, width, minPx, extra: 0.45, extraPx: 0.55, maxRes: 2.5 });

/** draw order: later passes overwrite earlier ones */
const PASSES: Pass[] = [
  { layer: 'farmland', kind: 'poly', color: [222, 208, 150], alpha: 0.38 },
  { layer: 'grass', kind: 'poly', color: [150, 188, 108], alpha: 0.42 },
  { layer: 'urban', kind: 'poly', color: [205, 190, 185], alpha: 0.45 },
  { layer: 'forest', kind: 'poly', color: [58, 104, 58], alpha: 0.62 },
  { layer: 'water', kind: 'poly', color: [80, 140, 200], alpha: 0.92 },
  { layer: 'stream', kind: 'line', color: [84, 146, 204], alpha: 0.85, width: 2.2, minPx: 0.7 },
  { layer: 'river', kind: 'line', color: [80, 140, 200], alpha: 0.92, width: 11, minPx: 1.6 },
  { layer: 'track', kind: 'line', color: [160, 132, 98], alpha: 0.8, width: 2.6, minPx: 0.8, maxRes: 5 },
  { layer: 'service', kind: 'line', color: [236, 230, 218], alpha: 0.85, width: 3.4, minPx: 0.8, maxRes: 5 },
  { layer: 'rail_side', kind: 'line', color: [92, 84, 92], alpha: 0.85, width: 1.8, minPx: 0.8, maxRes: 5 },
  { layer: 'rail', kind: 'line', color: [84, 76, 86], alpha: 0.9, width: 3.0, minPx: 1.3 },
  { layer: 'rail', kind: 'line', color: [236, 232, 226], alpha: 0.9, width: 1.5, minPx: 0.6, dash: [14, 0.5], maxRes: 2.5 },
  casing('minor', 5.5, 0.9), casing('tertiary', 7, 1.3), casing('secondary', 8, 1.6), casing('primary', 9, 2.0), casing('motorway', 11, 2.6),
  { layer: 'minor', kind: 'line', color: ROAD, alpha: 0.92, width: 5.5, minPx: 0.9 },
  { layer: 'tertiary', kind: 'line', color: ROAD, alpha: 0.95, width: 7, minPx: 1.3 },
  { layer: 'secondary', kind: 'line', color: [252, 243, 196], alpha: 0.95, width: 8, minPx: 1.6 },
  { layer: 'primary', kind: 'line', color: [250, 226, 150], alpha: 0.95, width: 9, minPx: 2.0 },
  { layer: 'motorway', kind: 'line', color: [240, 176, 128], alpha: 0.95, width: 11, minPx: 2.6 },
  { layer: 'buildings', kind: 'poly', color: BUILDING_COLOR, alpha: 1 },
];
/** layers whose polylines get round caps and joins (wide enough for gaps to show) */
const CAPPED = new Set(['minor', 'tertiary', 'secondary', 'primary', 'motorway', 'service', 'rail', 'river']);

const POLY_VERT = /* glsl */ `
uniform vec4 box;
void main() { gl_Position = vec4((position.xy - box.xy) * box.zw * 2.0 - 1.0, 0.0, 1.0); }`;
const LINE_VERT = /* glsl */ `
attribute vec2 dir;
attribute float dist;
uniform vec4 box;
uniform float res;
uniform vec4 wpar;
varying float vDist;
void main() {
  float hw = max(wpar.x, wpar.y * res) + max(wpar.z, wpar.w * res);
  vDist = dist;
  gl_Position = vec4((position.xy + dir * hw - box.xy) * box.zw * 2.0 - 1.0, 0.0, 1.0);
}`;
const FRAG = /* glsl */ `
uniform vec4 color;
uniform vec2 dash;
varying float vDist;
void main() {
  if (dash.x > 0.0 && fract(vDist / dash.x) > dash.y) discard;
  gl_FragColor = color;
}`;
const POLY_FRAG = /* glsl */ `
uniform vec4 color;
void main() { gl_FragColor = color; }`;

type BBox = [number, number, number, number];
interface Geo { geo: THREE.BufferGeometry; bbox: BBox }

/** 2-component positions: give three.js a bounding sphere so it does not try to compute one (culling is ours) */
function flat(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
  return geo;
}

function polyGeos(verts: Float32Array, idx: Uint32Array, chunks: [number, number, number, number][]): Geo[] {
  const out: Geo[] = [];
  for (const [v0, vn, i0, inn] of chunks) {
    const pos = verts.subarray(2 * v0, 2 * (v0 + vn));
    const bbox: BBox = [Infinity, Infinity, -Infinity, -Infinity];
    for (let k = 0; k < pos.length; k += 2) {
      if (pos[k] < bbox[0]) bbox[0] = pos[k]; if (pos[k] > bbox[2]) bbox[2] = pos[k];
      if (pos[k + 1] < bbox[1]) bbox[1] = pos[k + 1]; if (pos[k + 1] > bbox[3]) bbox[3] = pos[k + 1];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 2));
    geo.setIndex(new THREE.BufferAttribute(idx.subarray(i0, i0 + inn), 1));
    out.push({ geo: flat(geo), bbox });
  }
  return out;
}

class ChunkAcc {
  pos: number[] = []; dir: number[] = []; dist: number[] = []; idx: number[] = [];
  bbox: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  vert(x: number, y: number, dx: number, dy: number, d: number): number {
    this.pos.push(x, y); this.dir.push(dx, dy); this.dist.push(d);
    const b = this.bbox;
    if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y;
    return this.dist.length - 1;
  }
}

/** expand polylines into quads (mitred) plus optional round caps / joins; offsets are applied in the shader */
function lineGeos(layer: LineLayer, chunk: number, caps: boolean): Geo[] {
  const accs = new Map<number, ChunkAcc>();
  const acc = (x: number, y: number) => {
    const key = Math.floor(y / chunk) * 4096 + Math.floor(x / chunk);
    let a = accs.get(key);
    if (!a) accs.set(key, a = new ChunkAcc());
    return a;
  };
  const disc = (x: number, y: number, d: number) => {
    const a = acc(x, y), c = a.vert(x, y, 0, 0, d), N = 10;
    const rim: number[] = [];
    for (let k = 0; k < N; k++) rim.push(a.vert(x, y, Math.cos((2 * Math.PI * k) / N), Math.sin((2 * Math.PI * k) / N), d));
    for (let k = 0; k < N; k++) a.idx.push(c, rim[k], rim[(k + 1) % N]);
  };
  const V = layer.verts, S = layer.starts;
  for (let p = 0; p + 1 < S.length; p++) {
    const i0 = S[p], n = S[p + 1] - i0;
    if (n < 2) continue;
    // per-vertex mitre vector (left normal, lengthened at bends) and distance along the line
    const mx = new Float64Array(n), my = new Float64Array(n), dd = new Float64Array(n);
    let pnx = 0, pny = 0;
    for (let j = 0; j < n; j++) {
      const x = V[2 * (i0 + j)], y = V[2 * (i0 + j) + 1];
      let nx = pnx, ny = pny;
      if (j < n - 1) {
        const ex = V[2 * (i0 + j + 1)] - x, ey = V[2 * (i0 + j + 1) + 1] - y, L = Math.hypot(ex, ey) || 1;
        nx = -ey / L; ny = ex / L;
        dd[j + 1] = dd[j] + L;
      }
      if (j === 0 || j === n - 1) { mx[j] = nx; my[j] = ny; if (caps) disc(x, y, dd[j]); }
      else {
        let sx = pnx + nx, sy = pny + ny;
        const sl = Math.hypot(sx, sy);
        if (sl < 1e-6) { sx = nx; sy = ny; } else { sx /= sl; sy /= sl; }
        const cos = sx * nx + sy * ny; // cos of half the turn angle
        const k = 1 / Math.max(0.6, cos);
        mx[j] = sx * k; my[j] = sy * k;
        if (caps && cos < 0.92) disc(x, y, dd[j]);
      }
      pnx = nx; pny = ny;
    }
    for (let j = 0; j < n - 1; j++) {
      const x0 = V[2 * (i0 + j)], y0 = V[2 * (i0 + j) + 1], x1 = V[2 * (i0 + j + 1)], y1 = V[2 * (i0 + j + 1) + 1];
      const a = acc(0.5 * (x0 + x1), 0.5 * (y0 + y1));
      const v0 = a.vert(x0, y0, mx[j], my[j], dd[j]), v1 = a.vert(x0, y0, -mx[j], -my[j], dd[j]);
      const v2 = a.vert(x1, y1, mx[j + 1], my[j + 1], dd[j + 1]), v3 = a.vert(x1, y1, -mx[j + 1], -my[j + 1], dd[j + 1]);
      a.idx.push(v0, v1, v2, v1, v3, v2);
    }
  }
  const out: Geo[] = [];
  for (const a of accs.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a.pos), 2));
    geo.setAttribute('dir', new THREE.BufferAttribute(new Float32Array(a.dir), 2));
    geo.setAttribute('dist', new THREE.BufferAttribute(new Float32Array(a.dist), 1));
    geo.setIndex(a.dist.length > 65535 ? new THREE.BufferAttribute(new Uint32Array(a.idx), 1) : new THREE.BufferAttribute(new Uint16Array(a.idx), 1));
    out.push({ geo: flat(geo), bbox: a.bbox });
  }
  return out;
}

function buildingGeos(b: BuildingData, chunk: number): Geo[] {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < b.count; i++) {
    const v = b.starts[i];
    const key = Math.floor(b.verts[2 * v + 1] / chunk) * 4096 + Math.floor(b.verts[2 * v] / chunk);
    let g = groups.get(key);
    if (!g) groups.set(key, g = []);
    g.push(i);
  }
  const out: Geo[] = [];
  for (const g of groups.values()) {
    let nv = 0, nt = 0;
    for (const i of g) { nv += b.starts[i + 1] - b.starts[i]; nt += b.triStarts[i + 1] - b.triStarts[i]; }
    const pos = new Float32Array(nv * 2), idx = new Uint32Array(nt);
    const bbox: BBox = [Infinity, Infinity, -Infinity, -Infinity];
    let pv = 0, pt = 0;
    for (const i of g) {
      const v0 = b.starts[i], n = b.starts[i + 1] - v0;
      for (let t = b.triStarts[i]; t < b.triStarts[i + 1]; t++) idx[pt++] = pv + b.tris[t];
      for (let k = 0; k < n; k++) {
        const x = b.verts[2 * (v0 + k)], y = b.verts[2 * (v0 + k) + 1];
        pos[2 * pv] = x; pos[2 * pv + 1] = y; pv++;
        if (x < bbox[0]) bbox[0] = x; if (x > bbox[2]) bbox[2] = x; if (y < bbox[1]) bbox[1] = y; if (y > bbox[3]) bbox[3] = y;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    out.push({ geo: flat(geo), bbox });
  }
  return out;
}

interface Slot { rt: THREE.WebGLRenderTarget; k: number; cx: number; cy: number; size: number }

const R0 = 0.125; // metres per texel of the finest clip level
const K_MAX = 5; // coarsest clip level: R0 · 2^5 = 4 m per texel (the base texture takes over beyond)

export class LandCover {
  private scene = new THREE.Scene();
  private cam = new THREE.Camera();
  private box = { value: new THREE.Vector4() };
  private res = { value: 1 };
  private passes: { pass: Pass; mat: THREE.ShaderMaterial; meshes: THREE.Mesh[] }[] = [];
  private scratch: THREE.WebGLRenderTarget;
  private size: number;
  private base: THREE.WebGLRenderTarget;
  private baseDone = false;
  private slots: Slot[] = [];
  private blitScene = new THREE.Scene();
  private blitMat: THREE.ShaderMaterial;
  private k0 = Infinity;
  /** number of level textures drawn so far (diagnostics) */
  renders = 0;

  constructor(private renderer: THREE.WebGLRenderer, vectors: VectorPack, private width: number, private height: number,
    private uniforms: TerrainUniforms) {
    const maxTex = renderer.capabilities.maxTextureSize;
    this.size = Math.min(2048, maxTex);
    const geos = new Map<string, Geo[]>();
    for (const l of vectors.polys) geos.set(l.name, polyGeos(l.verts, l.idx, l.chunks));
    for (const l of vectors.lines) geos.set(l.name, lineGeos(l, vectors.chunk, CAPPED.has(l.name)));
    if (vectors.buildings) geos.set('buildings', buildingGeos(vectors.buildings, vectors.chunk));
    PASSES.forEach((pass, order) => {
      const gl = geos.get(pass.layer);
      if (!gl) return;
      const line = pass.kind === 'line';
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          box: this.box, res: this.res, color: { value: new THREE.Vector4() },
          wpar: { value: new THREE.Vector4((pass.width ?? 0) / 2, (pass.minPx ?? 0) / 2, pass.extra ?? 0, pass.extraPx ?? 0) },
          dash: { value: new THREE.Vector2(pass.dash?.[0] ?? 0, pass.dash?.[1] ?? 1) },
        },
        vertexShader: line ? LINE_VERT : POLY_VERT, fragmentShader: line ? FRAG : POLY_FRAG,
        blending: THREE.NoBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      });
      const meshes = gl.map((g) => {
        const m = new THREE.Mesh(g.geo, mat);
        m.frustumCulled = false;
        m.matrixAutoUpdate = false;
        m.renderOrder = order;
        m.userData.bbox = g.bbox;
        this.scene.add(m);
        return m;
      });
      this.passes.push({ pass, mat, meshes });
    });
    const samples = Math.min(4, renderer.capabilities.maxSamples);
    this.scratch = new THREE.WebGLRenderTarget(this.size, this.size, {
      samples, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    const levelRT = (w: number, h: number) => {
      const rt = new THREE.WebGLRenderTarget(w, h, {
        depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      });
      rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return rt;
    };
    // base: the whole play area at ≈ 8.5 m per texel, drawn in scratch-sized tiles
    const bw = this.size, bh = Math.min(maxTex, Math.round((this.size * height) / width / 256) * 256);
    this.base = levelRT(bw, bh);
    for (let i = 0; i < LC_LEVELS; i++) this.slots.push({ rt: levelRT(this.size, this.size), k: -1, cx: 0, cy: 0, size: 0 });
    this.blitMat = new THREE.ShaderMaterial({
      uniforms: { src: { value: this.scratch.texture }, uvScale: { value: new THREE.Vector2(1, 1) } },
      vertexShader: 'uniform vec2 uvScale; varying vec2 vUv; void main() { vUv = (position.xy * 0.5 + 0.5) * uvScale; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D src; varying vec2 vUv; void main() { gl_FragColor = texture2D(src, vUv); }',
      blending: THREE.NoBlending, depthTest: false, depthWrite: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const blit = new THREE.Mesh(flat(tri), this.blitMat);
    blit.frustumCulled = false;
    this.blitScene.add(blit);
    uniforms.lcBase.value = this.base.texture;
  }

  /** draw the vector layers for the window (x0, y0, w, h) in local metres into the scratch target */
  private draw(x0: number, y0: number, w: number, h: number) {
    const res = w / this.size;
    this.box.value.set(x0, y0, 1 / w, 1 / h);
    this.res.value = res;
    const pad = 40 + 8 * res; // widest line half-width incl. minimum texel widths
    for (const { pass, mat, meshes } of this.passes) {
      // fades out over the octave below maxRes
      const fade = pass.maxRes === undefined ? 1 : Math.max(0, Math.min(1, 2 - (2 * res) / pass.maxRes));
      const a = pass.alpha * fade;
      mat.uniforms.color.value.set((pass.color[0] / 255) * a, (pass.color[1] / 255) * a, (pass.color[2] / 255) * a, a);
      for (const m of meshes) {
        const b = m.userData.bbox as BBox;
        m.visible = fade > 0 && b[2] + pad >= x0 && b[0] - pad <= x0 + w && b[3] + pad >= y0 && b[1] - pad <= y0 + h;
      }
    }
    this.renderer.setRenderTarget(this.scratch);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.cam);
  }

  /** copy (the lower-left uvScale part of) the resolved scratch target into a level texture */
  private blit(rt: THREE.WebGLRenderTarget, vx: number, vy: number, vw: number, vh: number, clear: boolean) {
    this.blitMat.uniforms.uvScale.value.set(vw / this.size, vh / this.size);
    rt.viewport.set(vx, vy, vw, vh);
    this.renderer.setRenderTarget(rt);
    this.renderer.autoClear = clear;
    this.renderer.render(this.blitScene, this.cam);
    this.renders++;
  }

  private withState(f: () => void) {
    const r = this.renderer;
    const target = r.getRenderTarget(), auto = r.autoClear, alpha = r.getClearAlpha(), color = r.getClearColor(new THREE.Color());
    f();
    r.setRenderTarget(target);
    r.autoClear = auto;
    r.setClearColor(color, alpha);
  }

  private drawBase() {
    const bw = this.base.width, bh = this.base.height, S = this.size;
    const rx = this.width / bw, ry = this.height / bh;
    this.withState(() => {
      for (let ty = 0; ty < bh; ty += S) {
        const th = Math.min(S, bh - ty);
        this.draw(0, ty * ry, S * rx, S * ry);
        this.blit(this.base, 0, ty, bw, th, false);
      }
    });
    this.base.viewport.set(0, 0, bw, bh);
    this.uniforms.lcBaseOn.value = 1;
    this.baseDone = true;
  }

  /**
   * Keep the clip levels around the focus (local metres) for the given ground size of a screen pixel.
   * Draws at most one level per call; returns true while more are pending (call again next frame).
   */
  update(fx: number, fy: number, mPerPx: number): boolean {
    if (!this.baseDone) { this.drawBase(); return true; }
    const want = Math.log2(Math.max(1e-3, mPerPx) / R0);
    // hysteresis so a zoom hovering around a boundary does not thrash
    if (!isFinite(this.k0) || Math.abs(want - this.k0) > 0.65) this.k0 = Math.max(0, Math.round(want));
    let pending = 0, drawn = false;
    for (let k = this.k0; k < this.k0 + LC_LEVELS && k <= K_MAX; k++) {
      const r = R0 * 2 ** k, win = this.size * r;
      let slot = this.slots.find((s) => s.k === k);
      if (slot && Math.abs(fx - slot.cx) < 0.22 * win && Math.abs(fy - slot.cy) < 0.22 * win) continue;
      if (drawn) { pending++; continue; }
      // recentre this level, or take over the slot that is furthest from the wanted range
      if (!slot) {
        slot = this.slots.find((s) => s.k < 0)
          ?? this.slots.filter((s) => s.k < this.k0 || s.k >= this.k0 + LC_LEVELS || s.k > K_MAX).sort((a, b) => Math.abs(b.k - this.k0) - Math.abs(a.k - this.k0))[0];
        if (!slot) continue;
      }
      const snap = 32 * r;
      const cx = Math.round(fx / snap) * snap, cy = Math.round(fy / snap) * snap;
      const s = slot;
      this.withState(() => {
        this.draw(cx - win / 2, cy - win / 2, win, win);
        this.blit(s.rt, 0, 0, this.size, this.size, true);
      });
      slot.k = k; slot.cx = cx; slot.cy = cy; slot.size = win;
      drawn = true;
    }
    if (drawn) this.publish();
    return pending > 0;
  }

  /** hand the valid levels to the terrain shader, coarsest first */
  private publish() {
    const u = this.uniforms;
    const order = this.slots.filter((s) => s.k >= 0).sort((a, b) => b.k - a.k);
    const tex = [u.lcTex0, u.lcTex1, u.lcTex2, u.lcTex3];
    for (let i = 0; i < LC_LEVELS; i++) {
      const s = order[i];
      tex[i].value = s ? s.rt.texture : null;
      u.lcOn.value[i] = s ? 1 : 0;
      if (s) u.lcBox.value[i].set(s.cx - s.size / 2, s.cy - s.size / 2, 1 / s.size, 1 / s.size);
    }
  }
}
