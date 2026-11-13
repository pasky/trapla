// @ts-ignore -- the project has no @types/node; vitest runs these in Node
import { existsSync, readFileSync } from 'node:fs';
// @ts-ignore
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { decodeHeights, LC, Terrain } from '../src/core/terrain';
import { buildHeightTexture } from '../src/render/heightTexture';
import { parseVectorPack } from '../src/render/vectorPack';

describe('height texture', () => {
  // an odd-sized grid with heights up to 1,200 m at 0.1 m steps, i.e. beyond half-float precision in one channel
  const nx = 70, ny = 90, scale = 0.1;
  const q = new Uint16Array(nx * ny);
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) q[r * nx + c] = Math.round(6000 + 5900 * Math.sin(c * 0.37) * Math.cos(r * 0.21) + ((c * 7 + r * 13) % 10));
  const { tex, w, h } = buildHeightTexture(q, nx, ny, scale, 8192);
  const mips = tex.mipmaps as unknown as { data: Uint16Array; width: number; height: number }[];
  const height = (level: number, c: number, r: number) => {
    const m = mips[level];
    return THREE.DataUtils.fromHalfFloat(m.data[2 * (r * m.width + c)]) + THREE.DataUtils.fromHalfFloat(m.data[2 * (r * m.width + c) + 1]);
  };

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
});

// needs the generated pack (npm run data)
const PACK = 'public/scenarios/d11';
describe.skipIf(!existsSync(`${PACK}/vector.bin.gz`))('vector render data vs the game grid', () => {
  const unzip = (f: string): ArrayBuffer => {
    const b: Uint8Array = gunzipSync(readFileSync(`${PACK}/${f}`));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  const v = parseVectorPack(unzip('vector.bin.gz'));
  const meta = JSON.parse(readFileSync(`${PACK}/meta.json`, 'utf8'));
  const T = new Terrain({
    nx: meta.nx, ny: meta.ny, cell: meta.cell, base: meta.heights.base, scale: meta.heights.scale,
    q: decodeHeights(new Int16Array(unzip(meta.heights.file)), meta.nx, meta.ny), lc: new Uint8Array(unzip(meta.landcover.file)),
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
