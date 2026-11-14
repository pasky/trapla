// The 5 m height grid as a GPU texture, so the terrain shader can shade the relief and draw contours
// per pixel at any zoom.
//
// Format: RG16F with hand-built mipmaps. Half floats are linearly filterable in core WebGL2 (no
// extension needed) but have only 11 bits of mantissa, so the height is split into two channels:
// R = a multiple of 4 m (exact in a half float), G = the remainder in [0, 4) (≈ 2 mm steps).
// Filtering is linear, so filtered(R) + filtered(G) = filtered height.

import * as THREE from 'three';

export interface HeightLevels {
  mipmaps: { data: Uint16Array; width: number; height: number }[];
  /** padded texture size in texels */
  w: number;
  h: number;
  /** grid cells per texel (1 unless the grid had to be halved to fit the GPU's texture size limit) */
  stride: number;
}

export interface HeightTexture {
  tex: THREE.DataTexture;
  /** padded size in texels; texel (c, r) centre = ((c + 0.5) · stride, (r + 0.5) · stride) grid cells, row 0 = north */
  w: number;
  h: number;
  stride: number;
}

const PAD = 64; // texture size is a multiple of this, so the first 6 mip levels are exact 2×2 boxes
const SPLIT = 4; // metres

/** per destination texel: the source texels it covers and their weights (area-weighted box, any size ratio) */
function boxTaps(src: number, dst: number): { i0: Int32Array; w: Float32Array; n: number } {
  const f = src / dst, n = Math.ceil(f) + 1;
  const i0 = new Int32Array(dst), w = new Float32Array(dst * n);
  for (let d = 0; d < dst; d++) {
    const a = d * f, b = (d + 1) * f;
    i0[d] = Math.floor(a);
    for (let k = 0; k < n; k++) {
      const s = i0[d] + k;
      w[d * n + k] = Math.max(0, Math.min(b, s + 1) - Math.max(a, s)) / f;
    }
  }
  return { i0, w, n };
}

/** the texel data of all mip levels (pure; also used to restore the texture after a lost WebGL context) */
export function buildHeightLevels(q: Uint16Array, nx: number, ny: number, scale: number, maxSize: number): HeightLevels {
  // GPUs limited to 4096 px textures get every second sample (2×2 means) of a grid larger than that
  if (!(maxSize >= PAD)) throw new Error(`texture size limit ${maxSize} is too small for the height texture`);
  let stride = 1;
  while (Math.ceil(nx / stride / PAD) * PAD > maxSize || Math.ceil(ny / stride / PAD) * PAD > maxSize) stride *= 2;
  let src: ArrayLike<number> = q, sx = nx, sy = ny;
  if (stride > 1) {
    sx = Math.ceil(nx / stride); sy = Math.ceil(ny / stride);
    const dec = new Float32Array(sx * sy);
    for (let r = 0; r < sy; r++) for (let c = 0; c < sx; c++) {
      let sum = 0, n = 0;
      for (let j = 0; j < stride; j++) for (let i = 0; i < stride; i++) {
        const rr = r * stride + j, cc = c * stride + i;
        if (rr < ny && cc < nx) { sum += q[rr * nx + cc]; n++; }
      }
      dec[r * sx + c] = sum / n;
    }
    src = dec;
  }
  const w = Math.ceil(sx / PAD) * PAD, h = Math.ceil(sy / PAD) * PAD;
  const toHalf = THREE.DataUtils.toHalfFloat;
  const U = Math.max(1, Math.round(SPLIT / scale)); // quantised units per split step
  const lutR = new Uint16Array(Math.floor(65535 / U) + 2);
  for (let i = 0; i < lutR.length; i++) lutR[i] = toHalf(Math.min(65000, i * U * scale));
  // level 0 (edge texels replicated into the padding); integer samples go through a lookup table
  const lutG = new Uint16Array(U);
  for (let i = 0; i < U; i++) lutG[i] = toHalf(i * scale);
  const l0 = new Uint16Array(w * h * 2);
  const integer = stride === 1;
  for (let r = 0; r < h; r++) {
    const row = Math.min(r, sy - 1) * sx;
    let o = r * w * 2;
    for (let c = 0; c < w; c++) {
      const v = src[row + (c < sx ? c : sx - 1)];
      const k = (v / U) | 0;
      l0[o++] = lutR[k];
      l0[o++] = integer ? lutG[v - k * U] : toHalf((v - k * U) * scale);
    }
  }
  const mipmaps: HeightLevels['mipmaps'] = [{ data: l0, width: w, height: h }];
  // coarser levels: area-weighted box of the level above, kept as floats (quantised units) while descending
  let pw = w, ph = h;
  let prev: Float32Array | null = null;
  while (pw > 1 || ph > 1) {
    const cw = Math.max(1, pw >> 1), ch = Math.max(1, ph >> 1);
    const cur = new Float32Array(cw * ch);
    const out = new Uint16Array(cw * ch * 2);
    const exact = pw === 2 * cw && ph === 2 * ch;
    const tx = exact ? null : boxTaps(pw, cw), ty = exact ? null : boxTaps(ph, ch);
    // level 1 reads the source grid, with the padding replicated
    const lim = prev ? pw - 1 : sx - 1;
    const rowOf = (r: number) => (prev ? Math.min(r, ph - 1) * pw : Math.min(r, sy - 1) * sx);
    const from: ArrayLike<number> = prev ?? src;
    for (let r = 0; r < ch; r++) {
      let o = 2 * r * cw;
      for (let c = 0; c < cw; c++) {
        let v = 0;
        if (exact) {
          const a0 = rowOf(2 * r), a1 = rowOf(2 * r + 1);
          const c0 = 2 * c < lim ? 2 * c : lim, c1 = 2 * c + 1 < lim ? 2 * c + 1 : lim;
          v = 0.25 * (from[a0 + c0] + from[a0 + c1] + from[a1 + c0] + from[a1 + c1]);
        } else {
          // odd sizes (levels below 64 texels): each texel averages the source area it covers
          for (let j = 0; j < ty!.n; j++) {
            const wy = ty!.w[r * ty!.n + j];
            if (wy === 0) continue;
            const a = rowOf(ty!.i0[r] + j);
            for (let i = 0; i < tx!.n; i++) {
              const wx = tx!.w[c * tx!.n + i];
              if (wx !== 0) v += wx * wy * from[a + Math.min(tx!.i0[c] + i, lim)];
            }
          }
        }
        cur[r * cw + c] = v;
        const k = (v / U) | 0;
        out[o++] = lutR[k];
        out[o++] = toHalf((v - k * U) * scale);
      }
    }
    mipmaps.push({ data: out, width: cw, height: ch });
    prev = cur; pw = cw; ph = ch;
  }
  return { mipmaps, w, h, stride };
}

export function buildHeightTexture(q: Uint16Array, nx: number, ny: number, scale: number, maxSize: number): HeightTexture {
  const { mipmaps, w, h, stride } = buildHeightLevels(q, nx, ny, scale, maxSize);
  const tex = new THREE.DataTexture(mipmaps[0].data, w, h, THREE.RGFormat, THREE.HalfFloatType);
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
  return { tex, w, h, stride };
}
