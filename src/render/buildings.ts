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
  private chunks: { mesh: THREE.Mesh; x: number; y: number; r: number }[] = [];

  /** `cx`, `cy`: the view's origin shift (world x = x − cx, world z = −(y − cy)) */
  constructor(b: BuildingData, chunk: number, ground: Ground, cx: number, cy: number) {
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
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'buildings';
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.chunks.push({ mesh, x: (minX + maxX) / 2, y: (minY + maxY) / 2, r: Math.hypot(maxX - minX, maxY - minY) / 2 });
    }
  }

  /** show only the chunks near the camera (local x, y of the camera) */
  update(camX: number, camY: number) {
    for (const c of this.chunks) c.mesh.visible = Math.hypot(c.x - camX, c.y - camY) - c.r < MAX_DIST;
  }
}
