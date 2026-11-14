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
  // 4 of the 16 cells per texel are enough for a smooth edge after linear filtering
  const at = (r: number, c: number) => (lc[Math.min(r, ny - 1) * nx + Math.min(c, nx - 1)] & oobBit ? 64 : 0);
  for (let r = 0; r < h; r++) {
    const o = (h - 1 - r) * w, r0 = r * f;
    for (let c = 0; c < w; c++) {
      const c0 = c * f;
      d[o + c] = Math.min(255, at(r0, c0 + 1) + at(r0 + 1, c0 + 3) + at(r0 + 2, c0) + at(r0 + 3, c0 + 2));
    }
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
  /**
   * per clip level: x0, y0 (local metres), 1/width, 1/height of its window; coarsest first. The level
   * textures are toroidal (local position p is stored at texel (p / texel size) mod texture size, so a
   * moving window only redraws what it uncovers): they are sampled at p · (1/width) with repeat wrapping.
   */
  lcBox: { value: THREE.Vector4[] };
  lcOn: { value: number[] };
  /** 1 = the levels hold the orthophoto (opaque where loaded, transparent where not: the coarser level shows) */
  lcPhoto: { value: number };
  /** minor interval (m), major interval (m), opacity (0 = off), device pixel ratio */
  contour: { value: THREE.Vector4 };
  slopeTint: { value: number };
  /** strength of the relief shading (1 = full; lower over the orthophoto, which has its own light) */
  shadeAmt: { value: number };
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
    lcPhoto: { value: 0 },
    contour: { value: new THREE.Vector4(10, 50, 0, 1) },
    slopeTint: { value: 0 },
    shadeAmt: { value: 1 },
  };
}

/**
 * Contour lines shared by the terrain and the earthworks (cut and fill slopes), so both draw the same
 * lines from true elevation and they join at the daylight line. `contourInk` returns the line colour
 * (display-referred sRGB) and its coverage for a pixel at elevation `h` (m) where the elevation changes by
 * `mPerPx` metres per screen pixel, over ground of colour `albedo` (sRGB).
 */
const CONTOUR_GLSL = /* glsl */ `
uniform vec4 contour;
// coverage of the nearest contour of the given interval (width in pixels), faded out where lines crowd
float contourLine(float h, float interval, float mPerPx, float width) {
  float d = abs(fract(h / interval + 0.5) - 0.5) * interval / mPerPx;
  float spacing = interval / mPerPx;
  return (1.0 - smoothstep(width * 0.5 - 0.5, width * 0.5 + 0.5, d)) * smoothstep(4.0, 9.0, spacing);
}
vec4 contourInk(float h, float mPerPx, vec3 albedo) {
  float pr = contour.w;
  float minor = contourLine(h, contour.x, mPerPx, 1.0 * pr) * 0.42;
  float major = contourLine(h, contour.y, mPerPx, 1.7 * pr) * 0.9;
  // dark lines on light ground, light lines on dark ground (forest, water)
  float dark = smoothstep(0.50, 0.58, dot(albedo, vec3(0.299, 0.587, 0.114)));
  vec3 lineCol = mix(vec3(0.97, 0.96, 0.84), vec3(0.23, 0.13, 0.05), dark);
  return vec4(lineCol, max(minor, major) * contour.z * mix(0.8, 1.0, dark));
}`;

/**
 * Relief lighting shared by the terrain and the earthworks: multi-directional hillshade (main light from the
 * north-west) of a world-space normal `n` of the exaggerated surface, as a multiplier of the display-referred
 * albedo; `amt` = strength (the terrain's `shadeAmt`).
 */
const RELIEF_GLSL = /* glsl */ `
float reliefLight(vec3 n, float amt) {
  float shade = 0.55 * max(dot(n, vec3(-0.5, 0.70711, -0.5)), 0.0)
    + 0.20 * max(dot(n, vec3(-0.64279, 0.76604, 0.0)), 0.0)
    + 0.15 * max(dot(n, vec3(0.0, 0.76604, -0.64279)), 0.0)
    + 0.10 * max(dot(n, vec3(-0.35355, 0.86603, 0.35355)), 0.0);
  return mix(1.0, 0.30 + 0.90 * shade / 0.95, amt);
}`;

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
uniform float lcPhoto;
uniform float slopeTint;
uniform float shadeAmt;
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
  vec4 t = texture2D(tex, loc * box.zw);
  // map: each level holds all layers and replaces the coarser one; photo: premultiplied "over"
  return lcPhoto > 0.5 ? t * w + under * (1.0 - w * t.a) : mix(under, t, w);
}

${CONTOUR_GLSL}
${RELIEF_GLSL}

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

  float light = reliefLight(n, shadeAmt);

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
  // hatch coordinate and its screen-space width (derivatives are taken outside of branches)
  float s = (loc.x + loc.y) / 120.0;
  float fw = fwidth(s);
  float slope = length(grad);

  if (slopeTint > 0.0) {
    // ground slope classes: clear below ~8 %, yellow to 15 %, orange to 25 %, red to 40 %, purple above
    vec3 sc = mix(vec3(1.0, 0.9, 0.3), vec3(1.0, 0.58, 0.12), smoothstep(0.13, 0.17, slope));
    sc = mix(sc, vec3(0.88, 0.18, 0.12), smoothstep(0.22, 0.28, slope));
    sc = mix(sc, vec3(0.48, 0.14, 0.55), smoothstep(0.36, 0.44, slope));
    float sa = smoothstep(0.07, 0.09, slope) * 0.5 * slopeTint * (1.0 - oob);
    col = mix(col, sc * (0.55 + 0.45 * light), sa);
  }

  if (contour.z > 0.0) {
    // elevation change per screen pixel, from the analytic gradient and the pixel footprint
    float mPerPx = max(length(vec2(dot(grad, dFdx(vWorld.xz)), dot(grad, dFdy(vWorld.xz)))), 1e-6);
    vec4 ink = contourInk(elev, mPerPx, albedo);
    col = mix(col, ink.rgb, ink.a * (1.0 - oob) * smoothstep(0.0015, 0.005, slope));
  }

  if (oob > 0.0) {
    float g = dot(col, vec3(0.3333));
    vec3 oc = vec3(g * 0.55 + 0.157);
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

/** `ewKind` vertex attribute of the route ribbon: how the earthwork material draws a surface */
export const EW_KIND = { structure: 0, crown: 1, cut: 2, fill: 3 } as const;

/**
 * Earthwork surfaces: world-space procedural texture of cut and fill slopes (no texture assets). Value
 * noise in object-space metres (x east, y elevation, z south — independent of the relief exaggeration),
 * each octave faded to its mean once a pixel covers a good part of its wavelength, so it neither shimmers
 * nor changes with the zoom. Cuts: brown soil with mottles and erosion rills down the fall line, turning
 * ochre-grey in weathered rock (class II) and grey with horizontal strata in class III, by the depth below
 * the original ground. Fills: topsoiled and seeded embankments, mottled green-yellow grass.
 */
const EARTH_GLSL = /* glsl */ `
varying vec3 vObj;
varying vec3 vNrm;
varying float vKind;
varying vec3 vGeo;
float ewHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)) * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float ewNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec2 o = vec2(1.0, 0.0);
  return mix(mix(mix(ewHash(i), ewHash(i + o.xyy), f.x), mix(ewHash(i + o.yxy), ewHash(i + o.xxy), f.x), f.y),
             mix(mix(ewHash(i + o.yyx), ewHash(i + o.xyx), f.x), mix(ewHash(i + o.yxx), ewHash(i + o.xxx), f.x), f.y), f.z);
}
// zero-mean noise of the given wavelength (m) at a pixel footprint of fw metres
float ewOctave(vec3 p, float lambda, float fw) {
  float a = 1.0 - smoothstep(0.15, 0.45, fw / lambda);
  return a > 0.0 ? (ewNoise(p / lambda) - 0.5) * a : 0.0;
}
// display-referred albedo of a slope; n = surface normal (unexaggerated), fillW = 0 cut … 1 fill,
// geo = depth below the original ground (m), depth of the class II and class III tops (m)
vec3 earthAlbedo(vec3 p, vec3 n, float fillW, vec3 geo, float fw) {
  float big = ewOctave(p, 7.0, fw), mid = ewOctave(p + 31.7, 1.7, fw), fine = ewOctave(p + 57.3, 0.45, fw);
  vec3 cut = vec3(0.0), fill = vec3(0.0);
  if (fillW < 0.999) {
    float wII = smoothstep(geo.y - 0.5, geo.y + 0.5, geo.x), wIII = smoothstep(geo.z - 0.5, geo.z + 1.0, geo.x);
    // rills: fine across the slope (along the contour direction t), long down the fall line
    vec2 t = n.xz / max(length(n.xz), 1e-3);
    float rill = (ewNoise(vec3(dot(p.xz, vec2(-t.y, t.x)) / 0.8, p.y / 6.0, 13.1)) - 0.5) * (1.0 - smoothstep(0.15, 0.45, fw / 0.8));
    // strata: bands of near-constant elevation, wavy over a few metres
    float strata = ewOctave(vec3(p.x / 40.0, p.y + 3.0 * big, p.z / 40.0), 1.3, fw);
    vec3 base = mix(mix(vec3(0.62, 0.47, 0.35), vec3(0.60, 0.50, 0.40), wII), vec3(0.57, 0.51, 0.44), wIII);
    cut = base * (1.0 + 0.16 * big + 0.12 * mid + 0.14 * fine + (0.22 - 0.10 * wIII) * rill + 0.40 * wIII * strata);
  }
  if (fillW > 0.001) {
    // fresh grass with drier, yellower patches and clumps
    vec3 grass = mix(vec3(0.47, 0.66, 0.30), vec3(0.62, 0.70, 0.35), smoothstep(-0.35, 0.35, 0.8 * big + mid));
    fill = grass * (1.0 + 0.10 * mid + 0.18 * fine);
  }
  return mix(cut, fill, fillW);
}`;

/**
 * Material of the route ribbon. Cut and fill slopes and the carriageway are lit like the terrain relief
 * (same hillshade and strength, normals of the exaggerated surface) and the slopes get a procedural
 * texture; structures (bridge sides, piers, portals: `ewKind` 0) are vertex-coloured Lambert. The
 * terrain's contour lines are drawn on top. Per vertex: `ewKind` (EW_KIND; interpolates between cut and
 * fill), `ewGeo` (depth below the original ground and the class II / III tops, m), `elev` = true elevation
 * (m; the drawn surface is lifted a little above the terrain, and scaled by the relief exaggeration), `ink`
 * = contour strength (1 on cut / fill slopes, less on the carriageway, 0 on structures). The uniforms are
 * the terrain's, shared so the contour interval, exaggeration and shading strength follow it.
 */
export function makeEarthworkMaterial(u: TerrainUniforms, params: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ ...params, vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.contour = u.contour;
    shader.uniforms.exag = u.exag;
    shader.uniforms.shadeAmt = u.shadeAmt;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        attribute float elev;
        attribute float ink;
        attribute float ewKind;
        attribute vec3 ewGeo;
        varying float vElev;
        varying float vInk;
        varying vec3 vObj;
        varying vec3 vNrm;
        varying float vKind;
        varying vec3 vGeo;`)
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        vElev = elev; vInk = ink; vObj = position; vNrm = normal; vKind = ewKind; vGeo = ewGeo;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float exag;\nuniform float shadeAmt;\nvarying float vElev;\nvarying float vInk;\n${CONTOUR_GLSL}\n${RELIEF_GLSL}\n${EARTH_GLSL}`)
      .replace('#include <opaque_fragment>', /* glsl */ `
        // derivatives outside the branches (the varyings vary per fragment)
        float ewPx = max(length(vec2(dFdx(vElev), dFdy(vElev))), 1e-6);
        float ewFw = length(fwidth(vObj));
        // display-referred sRGB, like the terrain (which mixes its colours and lines there)
        vec3 ewAlb = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
        if (vKind > 0.5) {
          vec3 ewN = normalize(vNrm);
          ewN *= sign(ewN.y + 1e-6); // double-sided: the upward face
          if (vKind > 1.5) ewAlb = earthAlbedo(vObj, ewN, clamp(vKind - 2.0, 0.0, 1.0), vGeo, ewFw);
          // the world is scaled by the exaggeration in y: normals by its inverse
          float ewLight = reliefLight(normalize(vec3(ewN.x, ewN.y / exag, ewN.z)), shadeAmt);
          outgoingLight = pow(ewAlb * ewLight, vec3(2.2));
        }
        if (contour.z > 0.0) {
          vec4 ewInk = contourInk(vElev, ewPx, ewAlb);
          vec3 ewCol = mix(pow(max(outgoingLight, 0.0), vec3(1.0 / 2.2)), ewInk.rgb, ewInk.a * vInk);
          outgoingLight = pow(ewCol, vec3(2.2));
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'earthwork-relief';
  return m;
}

export function makeTerrainMaterial(uniforms: TerrainUniforms, maskUniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms, ...maskUniforms },
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
  });
}
