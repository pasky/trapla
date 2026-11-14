// @ts-ignore -- the project has no @types/node; vitest runs these in Node
import { existsSync, readFileSync } from 'node:fs';
// @ts-ignore
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeHeights, LC, Terrain } from '../src/core/terrain';
import { buildHeightLevels } from '../src/render/heightTexture';
import { parseVectorPack, type VectorPack } from '../src/render/vectorPack';
import { clip, exposed, Lru, tilesIn, wrapPieces, type Rect } from '../src/render/photoTiles';

describe('height texture', () => {
  // an odd-sized grid with heights up to 1,200 m at 0.1 m steps, i.e. beyond half-float precision in one channel
  const nx = 70, ny = 90, scale = 0.1;
  const q = new Uint16Array(nx * ny);
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) q[r * nx + c] = Math.round(6000 + 5900 * Math.sin(c * 0.37) * Math.cos(r * 0.21) + ((c * 7 + r * 13) % 10));
  type Mips = { data: Uint16Array; width: number; height: number }[];
  const at = (mips: Mips, level: number, c: number, r: number) => {
    const m = mips[level];
    return THREE.DataUtils.fromHalfFloat(m.data[2 * (r * m.width + c)]) + THREE.DataUtils.fromHalfFloat(m.data[2 * (r * m.width + c) + 1]);
  };
  const { mipmaps: mips, w, h } = buildHeightLevels(q, nx, ny, scale, 8192);
  const height = (level: number, c: number, r: number) => at(mips, level, c, r);

  it('level 0 reproduces every sample (R + G), padding replicates the edge', () => {
    expect(w % 64).toBe(0);
    expect(h % 64).toBe(0);
    let worst = 0;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const want = q[Math.min(r, ny - 1) * nx + Math.min(c, nx - 1)] * scale;
      worst = Math.max(worst, Math.abs(height(0, c, r) - want));
    }
    expect(worst).toBeLessThan(0.003);
  });

  it('mip levels are 2×2 box averages down to 1×1', () => {
    expect(mips[mips.length - 1].width).toBe(1);
    expect(mips[mips.length - 1].height).toBe(1);
    for (let l = 1; l < 4; l++) {
      let worst = 0;
      for (let r = 0; r < mips[l].height; r++) for (let c = 0; c < mips[l].width; c++) {
        const want = 0.25 * (height(l - 1, 2 * c, 2 * r) + height(l - 1, 2 * c + 1, 2 * r) + height(l - 1, 2 * c, 2 * r + 1) + height(l - 1, 2 * c + 1, 2 * r + 1));
        worst = Math.max(worst, Math.abs(height(l, c, r) - want));
      }
      expect(worst).toBeLessThan(0.01);
    }
  });

  it('odd-sized coarse levels still average the whole extent (320 × 448 → 5 × 7 → 2 × 3 → 1)', () => {
    // a plane: every level must keep the mean and the plane's position, also through 5 → 2 and 7 → 3.
    // (A box over the level above is exact for 2:1; for odd sizes it is off by a few % of a texel, whereas
    // dropping the last row / column would shift a level by a large part of a texel.)
    const nw = 320, nh = 448, ramp = new Uint16Array(nw * nh);
    for (let r = 0; r < nh; r++) for (let c = 0; c < nw; c++) ramp[r * nw + c] = c * 10 + r * 4;
    const lv = buildHeightLevels(ramp, nw, nh, scale, 8192).mipmaps;
    expect(lv.map((m) => `${m.width}x${m.height}`).slice(-3)).toEqual(['5x7', '2x3', '1x1']);
    const mean = (0.5 * (nw - 1) * 10 + 0.5 * (nh - 1) * 4) * scale;
    for (let l = 0; l < lv.length; l++) {
      let sum = 0;
      for (let r = 0; r < lv[l].height; r++) for (let c = 0; c < lv[l].width; c++) {
        const v = at(lv, l, c, r);
        sum += v;
        // texel centre in source cells → the plane's value there
        const want = (((c + 0.5) * (nw / lv[l].width) - 0.5) * 10 + ((r + 0.5) * (nh / lv[l].height) - 0.5) * 4) * scale;
        const texelSpan = ((nw / lv[l].width) * 10 + (nh / lv[l].height) * 4) * scale;
        expect(Math.abs(v - want)).toBeLessThan(lv[l].width % 2 === 0 && lv[l].width >= 10 ? 0.02 : 0.05 * texelSpan);
      }
      expect(Math.abs(sum / (lv[l].width * lv[l].height) - mean)).toBeLessThan(0.02);
    }
  });

  it('halves the grid when it exceeds the texture size limit', () => {
    const lv = buildHeightLevels(q, nx, ny, scale, 64);
    expect(lv.stride).toBe(2);
    expect([lv.w, lv.h]).toEqual([64, 64]);
    const cell = (c: number, r: number) => 0.25 * scale * (q[2 * r * nx + 2 * c] + q[2 * r * nx + 2 * c + 1] + q[(2 * r + 1) * nx + 2 * c] + q[(2 * r + 1) * nx + 2 * c + 1]);
    // texel (c, r) = mean of cells (2c, 2c+1) × (2r, 2r+1); the padding repeats the last texel; level 1 on top
    expect(Math.abs(at(lv.mipmaps, 0, 3, 5) - cell(3, 5))).toBeLessThan(0.003);
    expect(Math.abs(at(lv.mipmaps, 0, 40, 50) - cell(34, 44))).toBeLessThan(0.003);
    expect(Math.abs(at(lv.mipmaps, 1, 4, 6) - 0.25 * (cell(8, 12) + cell(9, 12) + cell(8, 13) + cell(9, 13)))).toBeLessThan(0.005);
    expect(() => buildHeightLevels(q, nx, ny, scale, -1)).toThrow();
  });
});

// needs the generated pack (npm run data)
const PACK = 'public/scenarios/d11';
describe.skipIf(!['vector.bin.gz', 'meta.json', 'height.i16.gz', 'landcover.u8.gz'].every((f) => existsSync(`${PACK}/${f}`)))('vector render data vs the game grid', () => {
  let v: VectorPack, T: Terrain;
  beforeAll(() => {
    const unzip = (f: string): ArrayBuffer => {
      const b: Uint8Array = gunzipSync(readFileSync(`${PACK}/${f}`));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    };
    v = parseVectorPack(unzip('vector.bin.gz'));
    const meta = JSON.parse(readFileSync(`${PACK}/meta.json`, 'utf8'));
    T = new Terrain({
      nx: meta.nx, ny: meta.ny, cell: meta.cell, base: meta.heights.base, scale: meta.heights.scale,
      q: decodeHeights(new Int16Array(unzip(meta.heights.file)), meta.nx, meta.ny), lc: new Uint8Array(unzip(meta.landcover.file)),
    });
  });

  it('chunk tables and indices are consistent', () => {
    for (const p of v.polys) {
      for (const [v0, vn, i0, inn] of p.chunks) {
        expect(v0 + vn).toBeLessThanOrEqual(p.verts.length / 2);
        expect(i0 + inn).toBeLessThanOrEqual(p.idx.length);
        let max = 0;
        for (let k = i0; k < i0 + inn; k++) max = Math.max(max, p.idx[k]);
        expect(max).toBeLessThan(vn);
      }
    }
    const b = v.buildings!;
    expect(b.starts.length).toBe(b.count + 1);
    expect(b.starts[b.count]).toBe(b.verts.length / 2);
    expect(b.triStarts[b.count]).toBe(b.tris.length);
  });

  it('buildings and rivers sit on the same cells as in the land-cover raster the engine uses', () => {
    // same OSM source, two independent rasterisations: a shifted or flipped frame would break this
    const b = v.buildings!;
    let hit = 0, n = 0;
    for (let i = 0; i < b.count; i += 7) {
      const v0 = b.starts[i], m = b.starts[i + 1] - v0;
      if ((b.triStarts[i + 1] - b.triStarts[i]) / 3 < 2) continue;
      let x = 0, y = 0;
      for (let k = 0; k < m; k++) { x += b.verts[2 * (v0 + k)]; y += b.verts[2 * (v0 + k) + 1]; }
      x /= m; y /= m;
      if (x < 10 || y < 10 || x > T.width - 10 || y > T.height - 10) continue;
      n++;
      const lc = T.landcover(x, y);
      if (lc === LC.building || lc === LC.road) hit++;
    }
    expect(n).toBeGreaterThan(2000);
    expect(hit / n).toBeGreaterThan(0.9);
    const river = v.lines.find((l) => l.name === 'river')!;
    let rh = 0, rn = 0;
    for (let k = 0; k < river.verts.length / 2; k++) {
      const x = river.verts[2 * k], y = river.verts[2 * k + 1];
      if (x < 10 || y < 10 || x > T.width - 10 || y > T.height - 10) continue;
      rn++;
      if (T.crossing(x, y) === 1) rh++;
    }
    expect(rn).toBeGreaterThan(500);
    expect(rh / rn).toBeGreaterThan(0.9);
  });
});

describe('toroidal clip levels and the photo tile cache', () => {
  const S = 64;
  // texel coverage counts of a list of rectangles
  const cover = (rects: Rect[]) => {
    const m = new Map<string, number>();
    for (const [x, y, w, h] of rects) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m.set(`${i},${j}`, (m.get(`${i},${j}`) ?? 0) + 1);
    return m;
  };
  it('a moved window redraws exactly the texels it uncovers, each once', () => {
    for (const [dx, dy] of [[8, 0], [0, -8], [24, 40], [-40, 16], [-8, -56], [64, 0], [-100, 7]]) {
      const old: [number, number] = [96, -32], now: [number, number] = [96 + dx, -32 + dy];
      const got = cover(exposed(old, now, S));
      const inOld = (i: number, j: number) => i >= old[0] && i < old[0] + S && j >= old[1] && j < old[1] + S;
      let want = 0;
      for (let j = now[1]; j < now[1] + S; j++) for (let i = now[0]; i < now[0] + S; i++) {
        if (inOld(i, j)) { expect(got.has(`${i},${j}`)).toBe(false); continue; }
        want++;
        expect(got.get(`${i},${j}`)).toBe(1);
      }
      expect(got.size).toBe(want);
    }
  });
  it('wrapped pieces cover a rectangle once and land at its texels modulo the size', () => {
    for (const r of [[-70, 5, 64, 64], [60, 120, 10, 30], [0, 0, 64, 64], [-1, -1, 2, 2]] as Rect[]) {
      const pieces = wrapPieces(r, S);
      expect(pieces.length).toBeLessThanOrEqual(4);
      const got = cover(pieces.map((p) => [p[0], p[1], p[2], p[3]] as Rect));
      expect(got.size).toBe(r[2] * r[3]);
      expect([...got.values()].every((n) => n === 1)).toBe(true);
      for (const [x, y, w, h, tx, ty] of pieces) {
        expect(tx).toBe(((x % S) + S) % S); expect(ty).toBe(((y % S) + S) % S);
        expect(tx + w).toBeLessThanOrEqual(S); expect(ty + h).toBeLessThanOrEqual(S);
      }
    }
  });
  it('tiles of a fixed grid: the same requests whatever the window origin', () => {
    expect(tilesIn([-32, 0, 64, 32], 32)).toEqual([[-1, 0], [0, 0]]);
    expect(tilesIn([-31, 0, 64, 33], 32)).toEqual([[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]);
    expect(tilesIn([1, 1, 30, 30], 32)).toEqual([[0, 0]]);
    expect(clip([0, 0, 10, 10], [10, 0, 5, 5])).toBeNull();
    expect(clip([0, 0, 10, 10], [5, -5, 10, 10])).toEqual([5, 0, 5, 5]);
  });
  it('the cache is bounded by cost and evicts the least recently used', () => {
    const gone: string[] = [];
    const c = new Lru<number>(10, (_, k) => gone.push(k));
    c.set('a', 1, 4); c.set('b', 2, 4);
    c.get('a'); // b is now the oldest
    c.set('c', 3, 4);
    expect(gone).toEqual(['b']);
    expect(c.has('a') && c.has('c') && c.total === 8).toBe(true);
    c.set('big', 4, 20); // alone over the cap: kept, everything else goes
    expect(c.size).toBe(1);
    expect(c.get('big')).toBe(4);
  });
});
