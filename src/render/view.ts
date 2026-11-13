// three.js terrain view: draped terrain chunks, route ribbon (cut/fill slopes, bridges, tunnels),
// centreline, tangent polygon, official D11, DOM markers and labels, heightfield picking.

import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Design, Result } from '../core/evaluate';
import { KIND } from '../core/structures';
import type { Terrain } from '../core/terrain';
import type { Pack } from '../scenario';

export interface ViewEvents {
  onPickTerrain?: (x: number, y: number) => void;
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
  ev: ViewEvents = {};

  constructor(private container: HTMLElement, private overlay: HTMLElement, private pack: Pack) {
    this.terrain = pack.terrain;
    this.cx = this.terrain.width / 2;
    this.cy = this.terrain.height / 2;
    this.meshStep = Number(new URLSearchParams(location.search).get('mesh') ?? 4);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xc9d6e2);
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(45, 1, 5, 200000);
    this.scene.add(this.world);
    this.scene.fog = new THREE.Fog(0xc9d6e2, 30000, 90000);
    this.world.add(this.routeGroup);
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
    const loader = new THREE.TextureLoader();
    for (const tile of this.pack.meta.texture.tiles) {
      const cols: number[] = [], rows: number[] = [];
      for (let c = tile.col0; c < tile.col0 + tile.w; c += step) cols.push(c);
      cols.push(Math.min(T.nx - 1, tile.col0 + tile.w));
      for (let r = tile.row0; r < tile.row0 + tile.h; r += step) rows.push(r);
      rows.push(Math.min(T.ny - 1, tile.row0 + tile.h));
      const nc = cols.length, nr = rows.length;
      const pos = new Float32Array(nc * nr * 3), uv = new Float32Array(nc * nr * 2);
      for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) {
        const c = cols[i], r = rows[j];
        const x = (c + 0.5) * T.cell, y = T.height - (r + 0.5) * T.cell;
        const k = j * nc + i;
        pos[3 * k] = x - this.cx; pos[3 * k + 1] = T.sample(c, r); pos[3 * k + 2] = -(y - this.cy);
        uv[2 * k] = (c + 0.5 - tile.col0) / tile.w;
        uv[2 * k + 1] = 1 - (r + 0.5 - tile.row0) / tile.h;
      }
      const idx = new Uint32Array((nc - 1) * (nr - 1) * 6);
      let p = 0;
      for (let j = 0; j < nr - 1; j++) for (let i = 0; i < nc - 1; i++) {
        const a = j * nc + i, b = a + 1, c = a + nc, d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      const tex = loader.load(`${this.pack.base}/${tile.file}`, () => { this.dirty = true; });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex }));
      m.name = 'terrain';
      this.world.add(m);
    }
  }

  /** height of the rendered (decimated) terrain surface — used to keep the ribbon visible */
  private meshHeight(x: number, y: number): number {
    const T = this.terrain, s = this.meshStep;
    const fc = (x / T.cell - 0.5) / s, fr = ((T.height - y) / T.cell - 0.5) / s;
    const c0 = Math.floor(fc), r0 = Math.floor(fr), tx = fc - c0, ty = fr - r0;
    const h = (c: number, r: number) => T.sample(Math.min(c * s, T.nx - 1), Math.min(r * s, T.ny - 1));
    const a = h(c0, r0), b = h(c0 + 1, r0), c = h(c0, r0 + 1), d = h(c0 + 1, r0 + 1);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  private drapeHeight(x: number, y: number) { return Math.max(this.terrain.heightAt(x, y), this.meshHeight(x, y)); }

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
    if (this.polyLine) { this.world.remove(this.polyLine); this.polyLine.geometry.dispose(); }
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
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    }
    const n = r.n, w = crownWidth / 2;
    const bad = new Uint8Array(n);
    for (const v of r.violations) {
      if (v.goal) continue;
      for (let i = 0; i < n; i++) if (r.s[i] >= v.s0 - r.ds && r.s[i] <= v.s1 + r.ds) bad[i] = 1;
    }
    // ---- ribbon (crown + slopes) and bridge decks ----
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const v = new THREE.Vector3();
    const push = (x: number, y: number, z: number, c: THREE.Color) => {
      this.local(x, y, z, v); pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); return pos.length / 3 - 1;
    };
    const asphalt = new THREE.Color(0x3b3b42), asphaltBad = new THREE.Color(0x8a2020);
    const fillC = new THREE.Color(0x9fb36a), cutC = new THREE.Color(0xd2a15c), concrete = new THREE.Color(0xc4c2ba);
    const lift = 0.35;
    type SV = { dl: number; el: number; er: number; dr: number; cl: number; cr: number };
    const sv: SV[] = [];
    for (let i = 0; i < n; i++) {
      const x = r.x[i], y = r.y[i], nx = -r.ty[i], ny = r.tx[i], z = r.grade[i];
      const xl = x + nx * r.dayL[i], yl = y + ny * r.dayL[i], xr = x - nx * r.dayR[i], yr = y - ny * r.dayR[i];
      const fillL = r.zDayL[i] < z, fillR = r.zDayR[i] < z;
      const crown = bad[i] ? asphaltBad : asphalt;
      sv.push({
        dl: push(xl, yl, Math.max(r.zDayL[i], this.meshHeight(xl, yl)) + lift, fillL ? fillC : cutC),
        el: push(x + nx * w, y + ny * w, z + lift, fillL ? fillC : cutC),
        cl: push(x + nx * w, y + ny * w, z + lift, crown),
        cr: push(x - nx * w, y - ny * w, z + lift, crown),
        er: push(x - nx * w, y - ny * w, z + lift, fillR ? fillC : cutC),
        dr: push(xr, yr, Math.max(r.zDayR[i], this.meshHeight(xr, yr)) + lift, fillR ? fillC : cutC),
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
    g.setIndex(idx);
    g.computeBoundingSphere();
    const ribbon = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
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
    this.routeGroup.add(line);
    const ghost = this.makeLine(cp, cc, 2, { opacity: 0.35, depthTest: false, order: 2 });
    this.routeGroup.add(ghost);

    // ---- demolished buildings ----
    if (r.quantities.hitBuildings.length) {
      const bp: number[] = [];
      for (const j of r.quantities.hitBuildings) {
        const b = this.pack.overlays.buildings[j];
        this.local(b[0], b[1], this.drapeHeight(b[0], b[1]) + 6, v);
        bp.push(v.x, v.y, v.z);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xff00c8, size: 8, sizeAttenuation: false, depthTest: false }));
      pts.renderOrder = 5;
      this.routeGroup.add(pts);
    }
    this.dirty = true;
  }

  setHover(p: { x: number; y: number; z: number } | null) { this.hoverPos = p; this.dirty = true; }

  setExaggeration(e: number) {
    this.exag = e;
    this.world.scale.y = e;
    for (const m of this.markers) m.z = this.terrain.heightAt(m.x, m.y);
    this.dirty = true;
  }

  // ---- camera --------------------------------------------------------------------------------
  resetCamera() {
    const A = this.pack.meta.A.xy, B = this.pack.meta.B.xy;
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
    const t = this.local(mx, my, 500);
    this.controls.target.copy(t);
    this.camera.position.set(t.x + 2500, t.y + 17000, t.z + 13000);
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

  private render() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.world.traverse((o) => { if ((o as Line2).isLine2) ((o as Line2).material as LineMaterial).resolution.set(w, h); });
    this.renderer.render(this.scene, this.camera);
    const place = (el: HTMLElement, x: number, y: number, z: number, minDist?: number) => {
      const s = this.screenOf(x, y, z);
      const show = s.vis && (minDist === undefined || s.dist < minDist);
      el.style.display = show ? '' : 'none';
      if (show) el.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px)`;
    };
    for (const m of this.markers) place(m.el, m.x, m.y, m.z, m.minDist);
    for (const m of this.piMarkers) place(m.el, m.x, m.y, m.z);
    if (this.hoverPos) place(this.hoverEl, this.hoverPos.x, this.hoverPos.y, this.hoverPos.z);
    else this.hoverEl.style.display = 'none';
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
        if (p) this.ev.onPickTerrain?.(p.x, p.y);
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
