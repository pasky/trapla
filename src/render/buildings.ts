// Buildings as flat-roofed boxes extruded from the OSM footprints, merged into one mesh per spatial
// chunk (a few dozen draw calls for ~26,500 buildings). Far chunks are hidden: there the footprints
// painted into the land-cover texture (same colour as the roofs) are all one can see anyway.

import * as THREE from 'three';
import { BUILDING_COLOR } from './landcover';
import type { BuildingData } from './vectorPack';

const WALL: [number, number, number] = [246, 240, 228];
const BIG_ROOF: [number, number, number] = [146, 134, 126];
/** chunks further than this from the camera (horizontally, metres) are not drawn */
const MAX_DIST = 7000;

export interface Ground {
  /** height of the ground the building stands on (the higher of the true and the rendered surface) */
  top(x: number, y: number): number;
  /** lowest of the true and the rendered terrain surface (walls must reach below both) */
  bottom(x: number, y: number): number;
}

export class Buildings {
  readonly group = new THREE.Group();
  private chunks: { mesh: THREE.Mesh; x: number; y: number; r: number; colors: Uint8Array; muted?: Uint8Array }[] = [];
  private muted = false;
  /** per building: chunk, first vertex, vertex count (for tinting) */
  private where: Int32Array;
  private tinted: number[] = [];
  /** 50 m grid of building bounding boxes (built on the first find) */
  private grid: Map<number, number[]> | null = null;

  /** `cx`, `cy`: the view's origin shift (world x = x − cx, world z = −(y − cy)) */
  constructor(private b: BuildingData, chunk: number, ground: Ground, cx: number, cy: number) {
    this.where = new Int32Array(3 * b.count).fill(-1);
    const groups = new Map<number, number[]>();
    for (let i = 0; i < b.count; i++) {
      const v = b.starts[i];
      const key = Math.floor(b.verts[2 * v + 1] / chunk) * 4096 + Math.floor(b.verts[2 * v] / chunk);
      let g = groups.get(key);
      if (!g) groups.set(key, g = []);
      g.push(i);
    }
    // a little self-light keeps the shaded walls from going muddy
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x38332c });
    // (a house taken down for our works, `setMarked`'s `gone`: not drawn, its vertices put out of view)
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float gone;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nif (gone > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
    };
    const col = new THREE.Color();
    const lin = (c: [number, number, number], f: number): [number, number, number] => {
      col.setRGB(Math.min(1, (c[0] / 255) * f), Math.min(1, (c[1] / 255) * f), Math.min(1, (c[2] / 255) * f), THREE.SRGBColorSpace);
      return [Math.round(col.r * 255), Math.round(col.g * 255), Math.round(col.b * 255)];
    };
    for (const g of groups.values()) {
      let nv = 0, ni = 0;
      for (const i of g) {
        const n = b.starts[i + 1] - b.starts[i];
        nv += 3 * n; ni += b.triStarts[i + 1] - b.triStarts[i] + 6 * n;
      }
      const pos = new Float32Array(nv * 3), colr = new Uint8Array(nv * 3), idx = new Uint32Array(ni);
      let pv = 0, pi = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const i of g) {
        const v0 = b.starts[i], n = b.starts[i + 1] - v0;
        let zSum = 0, zMin = Infinity, zMax = -Infinity, area = 0;
        for (let k = 0; k < n; k++) {
          const x = b.verts[2 * (v0 + k)], y = b.verts[2 * (v0 + k) + 1];
          const xn = b.verts[2 * (v0 + (k + 1) % n)], yn = b.verts[2 * (v0 + (k + 1) % n) + 1];
          area += x * yn - xn * y;
          const zt = ground.top(x, y);
          zSum += zt;
          if (zt > zMax) zMax = zt;
          zMin = Math.min(zMin, ground.bottom(x, y));
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        area = Math.abs(area) / 2;
        // on steep ground the roof must still clear the uphill corner
        const zTop = Math.max(zSum / n + b.heights[i] * b.heightScale, zMax + 2), zBase = zMin - 1;
        // restrained variety: brightness varies per building; large flat roofs are grey
        const hash = ((i * 2654435761) >>> 0) / 4294967296;
        const roof = lin(area > 700 ? BIG_ROOF : BUILDING_COLOR, 0.9 + 0.2 * hash);
        const wall = lin(WALL, 0.94 + 0.1 * hash);
        const base = pv;
        this.where[3 * i] = this.chunks.length; this.where[3 * i + 1] = pv; this.where[3 * i + 2] = 3 * n;
        for (let ring = 0; ring < 3; ring++) {
          const c = ring === 0 ? roof : wall, z = ring === 2 ? zBase : zTop;
          for (let k = 0; k < n; k++) {
            pos[3 * pv] = b.verts[2 * (v0 + k)] - cx; pos[3 * pv + 1] = z; pos[3 * pv + 2] = -(b.verts[2 * (v0 + k) + 1] - cy);
            colr[3 * pv] = c[0]; colr[3 * pv + 1] = c[1]; colr[3 * pv + 2] = c[2];
            pv++;
          }
        }
        // roof: counter-clockwise in (east, north) = front-facing from above
        for (let t = b.triStarts[i]; t < b.triStarts[i + 1]; t += 3) {
          const a = b.tris[t], bb = b.tris[t + 1], c = b.tris[t + 2];
          const ax = b.verts[2 * (v0 + a)], ay = b.verts[2 * (v0 + a) + 1];
          const ccw = (b.verts[2 * (v0 + bb)] - ax) * (b.verts[2 * (v0 + c) + 1] - ay) - (b.verts[2 * (v0 + c)] - ax) * (b.verts[2 * (v0 + bb) + 1] - ay) > 0;
          idx[pi++] = base + a; idx[pi++] = base + (ccw ? bb : c); idx[pi++] = base + (ccw ? c : bb);
        }
        // walls: the ring is counter-clockwise, so the outside is to the right of each edge
        for (let k = 0; k < n; k++) {
          const k1 = (k + 1) % n;
          const t0 = base + n + k, t1 = base + n + k1, b0 = base + 2 * n + k, b1 = base + 2 * n + k1;
          idx[pi++] = b0; idx[pi++] = b1; idx[pi++] = t1;
          idx[pi++] = b0; idx[pi++] = t1; idx[pi++] = t0;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colr, 3, true));
      geo.setAttribute('gone', new THREE.BufferAttribute(new Uint8Array(nv), 1, true));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'buildings';
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.chunks.push({ mesh, x: (minX + maxX) / 2, y: (minY + maxY) / 2, r: Math.hypot(maxX - minX, maxY - minY) / 2, colors: colr.slice() });
    }
  }

  /** The building whose footprint contains local (x, y), else the one whose footprint is nearest within
   * `tol` metres; −1 if none. (Matches the engine's overlay buildings to these render meshes.) */
  find(x: number, y: number, tol = 3): number {
    const b = this.b, G = 50;
    if (!this.grid) {
      const grid = this.grid = new Map<number, number[]>();
      for (let i = 0; i < b.count; i++) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let v = b.starts[i]; v < b.starts[i + 1]; v++) {
          x0 = Math.min(x0, b.verts[2 * v]); x1 = Math.max(x1, b.verts[2 * v]);
          y0 = Math.min(y0, b.verts[2 * v + 1]); y1 = Math.max(y1, b.verts[2 * v + 1]);
        }
        for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++) for (let gy = Math.floor(y0 / G); gy <= Math.floor(y1 / G); gy++) {
          const k = gx * 65536 + gy;
          let a = grid.get(k);
          if (!a) grid.set(k, a = []);
          a.push(i);
        }
      }
    }
    let best = -1, bestD = tol, insideBest = -1, insideArea = Infinity;
    const seen = new Set<number>();
    for (let gx = Math.floor((x - tol) / G); gx <= Math.floor((x + tol) / G); gx++) for (let gy = Math.floor((y - tol) / G); gy <= Math.floor((y + tol) / G); gy++) {
      for (const i of this.grid.get(gx * 65536 + gy) ?? []) {
        if (seen.has(i)) continue;
        seen.add(i);
        // inside test (even-odd) and distance to the ring
        let inside = false, d = Infinity, area = 0;
        const v0 = b.starts[i], n = b.starts[i + 1] - v0;
        for (let k = 0, l = n - 1; k < n; l = k++) {
          const ax = b.verts[2 * (v0 + k)], ay = b.verts[2 * (v0 + k) + 1], bx = b.verts[2 * (v0 + l)], by = b.verts[2 * (v0 + l) + 1];
          if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
          const ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
          d = Math.min(d, Math.hypot(x - ax - ex * t, y - ay - ey * t));
          area += ax * by - bx * ay;
        }
        // a chimney inside a hall: the innermost outline is the one meant
        if (inside && Math.abs(area) < insideArea) { insideArea = Math.abs(area); insideBest = i; }
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return insideBest >= 0 ? insideBest : best;
  }

  /** standing colours (bought-out houses): over every tint, in every view */
  private marked = new Map<number, number>();
  private lastTint: { colors: Map<number, number>; mute: boolean } = { colors: new Map(), mute: false };
  private gone = new Set<number>();
  /** Colour these buildings in every view (render index → 0xRRGGBB), over a view's own tint; those `gone` (taken down
   * where our works are drawn) are not drawn. */
  setMarked(colors: Map<number, number>, gone: ReadonlySet<number> = new Set()) {
    const flag = (i: number, on: number) => {
      const c = this.where[3 * i];
      if (c < 0) return;
      const attr = this.chunks[c].mesh.geometry.getAttribute('gone') as THREE.BufferAttribute;
      (attr.array as Uint8Array).fill(on, this.where[3 * i + 1], this.where[3 * i + 1] + this.where[3 * i + 2]);
      attr.needsUpdate = true;
    };
    for (const i of this.gone) if (!gone.has(i)) flag(i, 0);
    for (const i of gone) if (!this.gone.has(i)) flag(i, 255);
    this.gone = new Set(gone);
    this.marked = colors;
    this.tint(this.lastTint.colors, this.lastTint.mute);
  }

  /** Paint buildings in a flat colour (index from `find` → 0xRRGGBB, sRGB). `mute`: the rest turn a
   * light grey (so that the red roofs do not read as a status); otherwise they keep their own colours. */
  tint(given: Map<number, number>, mute = false) {
    this.lastTint = { colors: given, mute };
    // what the project takes (bought out) stays shown over any view's own colours
    const colors = this.marked.size ? new Map([...given, ...this.marked]) : given;
    const dirty = new Set<number>();
    const base = (chunk: Buildings['chunks'][number]) => {
      if (!mute) return chunk.colors;
      if (!chunk.muted) {
        const m = chunk.muted = new Uint8Array(chunk.colors.length);
        for (let k = 0; k < m.length; k += 3) {
          const l = 0.3 * chunk.colors[k] + 0.55 * chunk.colors[k + 1] + 0.15 * chunk.colors[k + 2];
          m[k] = m[k + 1] = m[k + 2] = Math.round(120 + 0.5 * l);
        }
      }
      return chunk.muted;
    };
    if (mute !== this.muted) {
      this.muted = mute;
      this.chunks.forEach((chunk, c) => { ((chunk.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).array as Uint8Array).set(base(chunk)); dirty.add(c); });
    } else {
      for (const i of this.tinted) {
        const c = this.where[3 * i], v = this.where[3 * i + 1], n = this.where[3 * i + 2];
        const chunk = this.chunks[c], attr = chunk.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        (attr.array as Uint8Array).set(base(chunk).subarray(3 * v, 3 * (v + n)), 3 * v);
        dirty.add(c);
      }
    }
    this.tinted = [];
    const col = new THREE.Color();
    for (const [i, hex] of colors) {
      const c = this.where[3 * i];
      if (c < 0) continue;
      const v = this.where[3 * i + 1], n = this.where[3 * i + 2];
      const arr = (this.chunks[c].mesh.geometry.getAttribute('color') as THREE.BufferAttribute).array as Uint8Array;
      col.setHex(hex, THREE.SRGBColorSpace);
      for (let k = 0; k < n; k++) {
        // roof (first ring) a little lighter than the walls
        const f = k < n / 3 ? 1 : 0.8;
        arr[3 * (v + k)] = Math.round(Math.min(1, col.r * f) * 255);
        arr[3 * (v + k) + 1] = Math.round(Math.min(1, col.g * f) * 255);
        arr[3 * (v + k) + 2] = Math.round(Math.min(1, col.b * f) * 255);
      }
      this.tinted.push(i);
      dirty.add(c);
    }
    for (const c of dirty) (this.chunks[c].mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** building i's footprint's corners and its middle (map x, y) */
  outline(i: number): { x: number; y: number }[] {
    const b = this.b, v0 = b.starts[i], n = b.starts[i + 1] - v0, out: { x: number; y: number }[] = [];
    let x = 0, y = 0;
    for (let k = 0; k < n; k++) { out.push({ x: b.verts[2 * (v0 + k)], y: b.verts[2 * (v0 + k) + 1] }); x += out[k].x; y += out[k].y; }
    if (n > 0) out.push({ x: x / n, y: y / n });
    return out;
  }

  /** render building i is not drawn (taken down: setMarked's `gone`) */
  isGone(i: number) { return this.gone.has(i); }

  /** render building i has a standing colour (setMarked: bought out) */
  isMarked(i: number) { return this.marked.has(i); }

  /** show only the chunks near the camera (local x, y of the camera) */
  update(camX: number, camY: number) {
    for (const c of this.chunks) c.mesh.visible = Math.hypot(c.x - camX, c.y - camY) - c.r < MAX_DIST;
  }
}
