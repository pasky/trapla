// Terrain surface shader: everything is computed per pixel from the height texture and the land-cover
// clip levels — multi-directional relief shading, hypsometric tint, optional contour lines and slope
// tint, out-of-bounds hatching — so close-ups are as crisp as the overview.

import * as THREE from 'three';

/** hypsometric tint: elevation (m) → sRGB */
const TINT: [number, [number, number, number]][] = [
  [250, [122, 158, 104]], [350, [150, 180, 112]], [450, [190, 196, 132]], [550, [214, 202, 150]],
  [650, [204, 178, 134]], [800, [186, 160, 128]], [1000, [196, 186, 176]], [1300, [236, 234, 230]],
];
const TINT_MIN = 200, TINT_MAX = 1400;

function tintTexture(): THREE.DataTexture {
  const n = 256, d = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const e = TINT_MIN + ((i + 0.5) / n) * (TINT_MAX - TINT_MIN);
    let k = 0;
    while (k < TINT.length - 2 && e > TINT[k + 1][0]) k++;
    const t = Math.max(0, Math.min(1, (e - TINT[k][0]) / (TINT[k + 1][0] - TINT[k][0])));
    for (let c = 0; c < 3; c++) d[4 * i + c] = Math.round(TINT[k][1][c] + (TINT[k + 1][1][c] - TINT[k][1][c]) * t);
    d[4 * i + 3] = 255;
  }
  const tex = new THREE.DataTexture(d, n, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** out-of-bounds mask (no terrain data / outside the play area) at 1/4 resolution, row 0 = south */
export function oobTexture(lc: Uint8Array, nx: number, ny: number, oobBit: number): THREE.DataTexture {
  const f = 4, w = Math.ceil(nx / f), h = Math.ceil(ny / f);
  const d = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    let s = 0, n = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) {
      const rr = r * f + j, cc = c * f + i;
      if (rr < ny && cc < nx) { n++; if (lc[rr * nx + cc] & oobBit) s++; }
    }
    d[(h - 1 - r) * w + c] = Math.round((255 * s) / Math.max(1, n));
  }
  const tex = new THREE.DataTexture(d, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export const LC_LEVELS = 4;

export interface TerrainUniforms {
  [name: string]: THREE.IUniform;
  hTex: { value: THREE.Texture | null };
  /** padded height texture size (texels), cell size (m), base elevation (m) */
  hInfo: { value: THREE.Vector4 };
  /** play area size in metres */
  areaSize: { value: THREE.Vector2 };
  exag: { value: number };
  tintTex: { value: THREE.Texture };
  oobTex: { value: THREE.Texture | null };
  lcBase: { value: THREE.Texture | null };
  lcBaseOn: { value: number };
  lcTex0: { value: THREE.Texture | null };
  lcTex1: { value: THREE.Texture | null };
  lcTex2: { value: THREE.Texture | null };
  lcTex3: { value: THREE.Texture | null };
  /** per clip level: x0, y0 (local metres), 1/width, 1/height; coarsest first */
  lcBox: { value: THREE.Vector4[] };
  lcOn: { value: number[] };
  /** minor interval (m), major interval (m), opacity (0 = off), device pixel ratio */
  contour: { value: THREE.Vector4 };
  slopeTint: { value: number };
}

export function terrainUniforms(): TerrainUniforms {
  return {
    hTex: { value: null },
    hInfo: { value: new THREE.Vector4(1, 1, 5, 0) },
    areaSize: { value: new THREE.Vector2(1, 1) },
    exag: { value: 1 },
    tintTex: { value: tintTexture() },
    oobTex: { value: null },
    lcBase: { value: null },
    lcBaseOn: { value: 0 },
    lcTex0: { value: null }, lcTex1: { value: null }, lcTex2: { value: null }, lcTex3: { value: null },
    lcBox: { value: Array.from({ length: LC_LEVELS }, () => new THREE.Vector4(0, 0, 1, 1)) },
    lcOn: { value: new Array(LC_LEVELS).fill(0) },
    contour: { value: new THREE.Vector4(10, 50, 0, 1) },
    slopeTint: { value: 0 },
  };
}

const VERT = /* glsl */ `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
varying vec3 vWorld;
uniform sampler2D hTex;
uniform vec4 hInfo;
uniform vec2 areaSize;
uniform float exag;
uniform sampler2D tintTex;
uniform sampler2D oobTex;
uniform sampler2D lcBase;
uniform float lcBaseOn;
uniform sampler2D lcTex0;
uniform sampler2D lcTex1;
uniform sampler2D lcTex2;
uniform sampler2D lcTex3;
uniform vec4 lcBox[${LC_LEVELS}];
uniform float lcOn[${LC_LEVELS}];
uniform vec4 contour;
uniform float slopeTint;
// at-grade footprint of the designed road: terrain there is discarded so cuts are visible
uniform sampler2D maskTex;
uniform vec4 maskBox;
uniform float maskOn;
#include <common>
#include <fog_pars_fragment>

float heightRel(vec2 uv) { vec2 t = texture2D(hTex, uv).rg; return t.r + t.g; }

vec4 lcLevel(sampler2D tex, vec4 box, float on, vec2 loc, vec4 under) {
  vec2 u = (loc - box.xy) * box.zw;
  vec2 m = min(u, 1.0 - u);
  float w = clamp(min(m.x, m.y) * 25.0, 0.0, 1.0) * on;
  return mix(under, texture2D(tex, u), w);
}

// distance in pixels to the nearest contour of the given interval, and the line spacing in pixels
float contourLine(float h, float interval, float mPerPx, float width) {
  float d = abs(fract(h / interval + 0.5) - 0.5) * interval / mPerPx;
  float spacing = interval / mPerPx;
  return (1.0 - smoothstep(width * 0.5 - 0.5, width * 0.5 + 0.5, d)) * smoothstep(3.0, 7.0, spacing);
}

void main() {
  if (maskOn > 0.5) {
    vec2 muv = (vWorld.xz - maskBox.xy) / maskBox.zw;
    if (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0 && texture2D(maskTex, muv).r > 0.5) discard;
  }
  // local metres: x east, y north
  vec2 loc = vec2(vWorld.x + 0.5 * areaSize.x, 0.5 * areaSize.y - vWorld.z);
  // height texture: texel (c, r) centre is grid sample (c, r), row 0 = north edge
  float cell = hInfo.z;
  vec2 tc = vec2(loc.x, areaSize.y - loc.y) / cell;
  vec2 uv = tc / hInfo.xy;
  vec2 tdx = dFdx(tc), tdy = dFdy(tc);
  float ra = length(tdx), rb = length(tdy);
  // finite-difference step in texels: half a texel close up, the pixel footprint when minified
  float e = 0.5 * max(1.0, max(min(ra, rb), max(ra, rb) / 4.0));
  vec2 ex = vec2(e / hInfo.x, 0.0), ey = vec2(0.0, e / hInfo.y);
  float hRel = heightRel(uv);
  float elev = hInfo.w + hRel;
  // gradient in world axes: d/dx (east), d/dz (south)
  vec2 grad = vec2(heightRel(uv + ex) - heightRel(uv - ex), heightRel(uv + ey) - heightRel(uv - ey)) / (2.0 * e * cell);
  vec3 n = normalize(vec3(-exag * grad.x, 1.0, -exag * grad.y));

  // multi-directional hillshade (main light from the north-west)
  float shade = 0.55 * max(dot(n, vec3(-0.5, 0.70711, -0.5)), 0.0)
    + 0.20 * max(dot(n, vec3(-0.64279, 0.76604, 0.0)), 0.0)
    + 0.15 * max(dot(n, vec3(0.0, 0.76604, -0.64279)), 0.0)
    + 0.10 * max(dot(n, vec3(-0.35355, 0.86603, 0.35355)), 0.0);
  float light = 0.30 + 0.90 * shade / 0.95;

  // albedo: hypsometric tint under the land cover (premultiplied RGBA clip levels, finest wins)
  vec3 albedo = texture2D(tintTex, vec2((elev - ${TINT_MIN.toFixed(1)}) / ${(TINT_MAX - TINT_MIN).toFixed(1)}, 0.5)).rgb;
  vec4 lc = texture2D(lcBase, loc / areaSize) * lcBaseOn;
  lc = lcLevel(lcTex0, lcBox[0], lcOn[0], loc, lc);
  lc = lcLevel(lcTex1, lcBox[1], lcOn[1], loc, lc);
  lc = lcLevel(lcTex2, lcBox[2], lcOn[2], loc, lc);
  lc = lcLevel(lcTex3, lcBox[3], lcOn[3], loc, lc);
  albedo = albedo * (1.0 - lc.a) + lc.rgb;
  vec3 col = albedo * light;

  float oob = smoothstep(0.4, 0.6, texture2D(oobTex, loc / areaSize).r);
  float slope = length(grad);

  if (slopeTint > 0.0) {
    // ground slope classes: < 5 % clear, then yellow → orange → red → purple
    vec3 sc = mix(vec3(1.0, 0.92, 0.35), vec3(1.0, 0.6, 0.15), smoothstep(0.08, 0.14, slope));
    sc = mix(sc, vec3(0.9, 0.2, 0.15), smoothstep(0.17, 0.25, slope));
    sc = mix(sc, vec3(0.5, 0.15, 0.55), smoothstep(0.32, 0.45, slope));
    float sa = smoothstep(0.04, 0.07, slope) * 0.55 * slopeTint * (1.0 - oob);
    col = mix(col, sc * (0.55 + 0.45 * light), sa);
  }

  if (contour.z > 0.0) {
    // elevation change per screen pixel, from the analytic gradient and the pixel footprint
    float mPerPx = max(length(vec2(dot(grad, dFdx(vWorld.xz)), dot(grad, dFdy(vWorld.xz)))), 1e-6);
    float pr = contour.w;
    float minor = contourLine(elev, contour.x, mPerPx, 1.0 * pr) * 0.5;
    float major = contourLine(elev, contour.y, mPerPx, 1.7 * pr) * 0.9;
    float a = max(minor, major) * contour.z * (1.0 - oob) * smoothstep(0.0015, 0.005, slope);
    // dark lines on light ground, light lines on dark ground (forest, water)
    float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
    vec3 lineCol = mix(vec3(1.0, 0.97, 0.85), vec3(0.23, 0.13, 0.05), smoothstep(0.50, 0.58, lum));
    col = mix(col, lineCol, a);
  }

  if (oob > 0.0) {
    float g = dot(col, vec3(0.3333));
    vec3 oc = vec3(g * 0.55 + 0.157);
    float s = (loc.x + loc.y) / 120.0;
    float fw = fwidth(s);
    float hatch = (1.0 - smoothstep(0.08 - fw, 0.08 + fw, abs(fract(s) - 0.5))) * (1.0 - smoothstep(0.15, 0.4, fw));
    oc *= 1.0 - 0.25 * hatch;
    col = mix(col, oc, oob);
  }

  // colours above are display-referred sRGB; hand linear values to the fog / output chain
  col = pow(max(col, 0.0), vec3(2.2));
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

export function makeTerrainMaterial(uniforms: TerrainUniforms, maskUniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms, ...maskUniforms },
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
  });
}
