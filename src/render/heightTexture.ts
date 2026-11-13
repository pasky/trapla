// The 5 m height grid as a GPU texture, so the terrain shader can shade the relief and draw contours
// per pixel at any zoom.
//
// Format: RG16F with hand-built mipmaps. Half floats are linearly filterable in core WebGL2 (no
// extension needed) but have only 11 bits of mantissa, so the height is split into two channels:
// R = a multiple of 4 m (exact in a half float), G = the remainder in [0, 4) (≈ 2 mm steps).
// Filtering is linear, so filtered(R) + filtered(G) = filtered height.

import * as THREE from 'three';

export interface HeightTexture {
  tex: THREE.DataTexture;
  /** padded texture size in texels; texel (c, r) centre = grid sample (c, r), row 0 = north */
  w: number;
  h: number;
}

const PAD = 64; // texture size is a multiple of this, so the first 6 mip levels are exact 2×2 boxes
const SPLIT = 4; // metres

export function buildHeightTexture(q: Uint16Array, nx: number, ny: number, scale: number, maxSize: number): HeightTexture {
  const w = Math.ceil(nx / PAD) * PAD, h = Math.ceil(ny / PAD) * PAD;
  if (w > maxSize || h > maxSize) throw new Error(`height grid ${nx}×${ny} exceeds the GPU texture limit ${maxSize}`);
  const toHalf = THREE.DataUtils.toHalfFloat;
  const U = Math.max(1, Math.round(SPLIT / scale)); // quantised units per split step
  // level 0 straight from the quantised grid (edge texels replicated into the padding), via lookup tables
  const lutG = new Uint16Array(U);
  for (let i = 0; i < U; i++) lutG[i] = toHalf(i * scale);
  const lutR = new Uint16Array(Math.floor(65535 / U) + 1);
  for (let i = 0; i < lutR.length; i++) lutR[i] = toHalf(Math.min(65000, i * U * scale));
  const l0 = new Uint16Array(w * h * 2);
  for (let r = 0; r < h; r++) {
    const src = Math.min(r, ny - 1) * nx;
    let o = r * w * 2;
    for (let c = 0; c < w; c++) {
      const v = q[src + (c < nx ? c : nx - 1)];
      const k = (v / U) | 0;
      l0[o++] = lutR[k];
      l0[o++] = lutG[v - k * U];
    }
  }
  const mipmaps: { data: Uint16Array; width: number; height: number }[] = [{ data: l0, width: w, height: h }];
  // coarser levels: 2×2 box of the level above, kept as floats (in quantised units) while descending
  let pw = w, ph = h;
  let prev: Float32Array | null = null;
  while (pw > 1 || ph > 1) {
    const cw = Math.max(1, pw >> 1), ch = Math.max(1, ph >> 1);
    const cur = new Float32Array(cw * ch);
    const out = new Uint16Array(cw * ch * 2);
    for (let r = 0; r < ch; r++) {
      const r0 = Math.min(2 * r, ph - 1), r1 = Math.min(2 * r + 1, ph - 1);
      for (let c = 0; c < cw; c++) {
        const c0 = Math.min(2 * c, pw - 1), c1 = Math.min(2 * c + 1, pw - 1);
        let v: number;
        if (prev) v = 0.25 * (prev[r0 * pw + c0] + prev[r0 * pw + c1] + prev[r1 * pw + c0] + prev[r1 * pw + c1]);
        else {
          const a0 = Math.min(r0, ny - 1) * nx, a1 = Math.min(r1, ny - 1) * nx;
          const b0 = Math.min(c0, nx - 1), b1 = Math.min(c1, nx - 1);
          v = 0.25 * (q[a0 + b0] + q[a0 + b1] + q[a1 + b0] + q[a1 + b1]);
        }
        cur[r * cw + c] = v;
        const k = Math.floor(v / U);
        out[2 * (r * cw + c)] = lutR[k];
        out[2 * (r * cw + c) + 1] = toHalf((v - k * U) * scale);
      }
    }
    mipmaps.push({ data: out, width: cw, height: ch });
    prev = cur; pw = cw; ph = ch;
  }
  const tex = new THREE.DataTexture(l0, w, h, THREE.RGFormat, THREE.HalfFloatType);
  tex.mipmaps = mipmaps as unknown as THREE.DataTexture['mipmaps'];
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return { tex, w, h };
}
