// Terrain surface shader: everything is computed per pixel from the height texture and the land-cover
import { CATEGORIES, type PairedCategoryId } from '../core/data/categories';
import { PAIRED_SECTIONS } from '../core/data/motorway';
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
/** size of the `roadSections` table */
// (slots 1–6: the single-carriageway sections in category order, then the railway, one-direction and paired slots: disjoint)
export const ROAD_SECTIONS = 13;

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
  /** cross-sections of the designed roads (m): lane, lane + hard shoulder, edge-line width, centre-line
   * width; a road's vertices index them (`ewGeo.y`); lane 0 = no markings */
  roadSections: { value: THREE.Vector4[] };
  /** centre-line dash and gap (m) */
  roadDash: { value: THREE.Vector2 };
  /** the two paired cross-sections (PAIRED_VARIANTS: D 27.5, S 21.5): median half-width, inner paved shoulder,
   * inner lane width, outer paved shoulder (m); lines (both): edge width, lane-line width, dash, gap (m) */
  roadPaired: { value: THREE.Vector4[] };
  /** each paired section's outer lane width, m (S 21.5: 3.50 beside a 3.25 inner lane) */
  roadPairedOuter: { value: number[] };
  roadPairedLines: { value: THREE.Vector4 };
  /** half-width of one direction's own formation (split motorway), m, per paired section */
  roadCarriageway: { value: number[] };
  /** railway: (on), track-centre distance, ballast top half-width, half the rail spacing (m) */
  roadRail: { value: THREE.Vector4 };
}
/** The paired cross-sections the shader draws, each with its own slots (two may be on the map together: a motorway
 * built in a four-lane road's mission). */
export const PAIRED_VARIANTS: readonly PairedCategoryId[] = ['D27.5', 'S21.5'];
/** `roadSections` slots of a paired corridor (two carriageways and a median), per variant: 12 D 27.5, 10 S 21.5. */
export const pairedSlot = (c: PairedCategoryId) => ROAD_SECTIONS - 1 - 2 * PAIRED_VARIANTS.indexOf(c);
/** …and of one direction of it split: the same paint, the median on its left (travel inside): 11, 9. */
export const carriagewaySlot = (c: PairedCategoryId) => pairedSlot(c) - 1;
/** Slots of a railway formation (single / double track): ballast beds, sleepers and rails (`roadRail`). */
export const RAIL_SECTION = 8, RAIL2_SECTION = 7;
/** the D 27.5 motorway's slots */
export const PAIRED_SECTION = pairedSlot('D27.5'), CARRIAGEWAY_SECTION = carriagewaySlot('D27.5');
/** a slot of a paired corridor or of one of its directions */
export const isPairedSlot = (k: number) => k >= ROAD_SECTIONS - 2 * PAIRED_VARIANTS.length;
export const isCarriagewaySlot = (k: number) => isPairedSlot(k) && (ROAD_SECTIONS - 1 - k) % 2 === 1;

/** The shader's paired cross-sections from the corridor categories' lanes. */
export function setPairedSections(u: TerrainUniforms): void {
  PAIRED_VARIANTS.forEach((category, v) => {
    const d = PAIRED_SECTIONS[category];
    u.roadPaired.value[v].set(d.median / 2, d.innerPavedShoulder, d.innerLane, d.outerPavedShoulder);
    u.roadPairedOuter.value[v] = d.outerLane;
    u.roadCarriageway.value[v] = CATEGORIES[CATEGORIES[category].carriagewayOf!].crownWidth / 2;
  });
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
    roadSections: { value: Array.from({ length: ROAD_SECTIONS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    roadDash: { value: new THREE.Vector2(3, 6) },
    roadPaired: { value: PAIRED_VARIANTS.map(() => new THREE.Vector4(0, 0, 0, 0)) },
    roadPairedLines: { value: new THREE.Vector4(0, 0, 1, 1) },
    roadPairedOuter: { value: PAIRED_VARIANTS.map(() => 0) },
    roadCarriageway: { value: PAIRED_VARIANTS.map(() => 0) },
    roadRail: { value: new THREE.Vector4(0, 0, 0, 0) },
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
// discard where the filtered mask exceeds this: 0.5 = its edge (the terrain under a footprint); a
// replacement collar uses ≈ 1 (only where every surrounding texel is inside) so the rasterised edge
// never eats the collar's own first metre along the daylight line it shares with the slope
uniform float maskCut;
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
    if (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0 && texture2D(maskTex, muv).r > maskCut) discard;
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
export const EW_KIND = { structure: 0, crown: 1, cut: 2, fill: 3, road: 4 } as const;

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
// geo = depth below the class II top, below the class III top (m; negative above it), station (m);
// fs = pixel footprint in station metres
vec3 earthAlbedo(vec3 p, float fillW, vec3 geo, float fw, float fs) {
  float big = ewOctave(p, 7.0, fw), mid = ewOctave(p + 31.7, 1.7, fw), fine = ewOctave(p + 57.3, 0.45, fw);
  vec3 cut = vec3(0.0), fill = vec3(0.0);
  if (fillW < 0.999) {
    float wII = smoothstep(-0.5, 0.5, geo.x), wIII = smoothstep(-0.5, 1.0, geo.y);
    // rills: fine along the road (station), long down the slope (elevation)
    float rill = (ewNoise(vec3(geo.z / 0.8, p.y / 6.0, 13.1)) - 0.5) * (1.0 - smoothstep(0.15, 0.45, fs / 0.8));
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
 * The designed road's carriageway (`ewKind` EW_KIND.road): asphalt with the white Czech markings of its
 * cross-section (`roadSections`, `roadDash`; data/categories.ts), hard shoulders and the gravel verge
 * (bridges: the concrete edge beam). Per vertex `ewGeo` = (offset from the axis, m, left positive;
 * 2 · section index + 1 on a bridge / + 0 on earthworks; station, m). Lines are box-filtered over the pixel footprint, so
 * from afar they fade into the asphalt's average instead of shimmering.
 */
const ROAD_GLSL = /* glsl */ `
uniform vec4 roadSections[${ROAD_SECTIONS}];
uniform vec2 roadDash;
uniform vec4 roadPaired[2];
uniform vec4 roadPairedLines;
uniform float roadPairedOuter[2];
uniform float roadCarriageway[2];
uniform vec4 roadRail;
// offset from the motorway's centre line: paired sections are symmetric about it, a split direction's
// axis lies roadCarriageway to the right of it (geo.x left-positive, the median on the left)
// which paired cross-section a slot draws (0 D 27.5, 1 S 21.5; -1 none), and whether it is the corridor (not one direction)
int rdPaired(int k) { return k >= ${ROAD_SECTIONS - 2} ? 0 : k >= ${ROAD_SECTIONS - 4} ? 1 : -1; }
bool rdWhole(int k) { return k == ${ROAD_SECTIONS - 1} || k == ${ROAD_SECTIONS - 3}; }
vec4 rdPairedRow(int v) { return v == 0 ? roadPaired[0] : roadPaired[1]; }
float rdSpine(int k, float gx) { return rdWhole(k) ? abs(gx) : (rdPaired(k) == 0 ? roadCarriageway[0] : roadCarriageway[1]) - gx; }
// coverage of [lo, hi] by a pixel of width fw centred at x
float rdCover(float x, float lo, float hi, float fw) {
  float w = max(fw, 1e-4);
  return clamp((min(hi, x + 0.5 * w) - max(lo, x - 0.5 * w)) / w, 0.0, 1.0);
}
// coverage of the dashes [k·period, k·period + dash] along the station
float rdDashes(float s, float dash, float period, float fs) {
  if (fs >= period) return dash / period;
  float u = mod(s, period);
  return min(1.0, rdCover(u, 0.0, dash, fs) + rdCover(u, period, period + dash, fs) + rdCover(u, -period, dash - period, fs));
}
// twin decks: the paired section's median is open on a bridge
bool roadGap(vec3 geo) {
  int k = int(floor(geo.y * 0.5 + 0.01));
  int v = rdPaired(k);
  return v >= 0 && rdPairedRow(v).z > 0.0 && geo.y - 2.0 * float(k) > 0.5 && rdSpine(k, geo.x) < rdPairedRow(v).x;
}
vec3 roadAlbedo(vec3 p, vec3 geo, float fw, float fx, float fs, float bad) {
  // geo.y interpolates only between a section's 2k and 2k + 1 (earthworks / bridge)
  int k = int(floor(geo.y * 0.5 + 0.01));
  vec4 roadSection = vec4(0.0);
  for (int j = 0; j < ${ROAD_SECTIONS}; j++) if (j == k) roadSection = roadSections[j];
  float bridge = geo.y - 2.0 * float(k);
  float x = abs(geo.x), lane = roadSection.x, paved = roadSection.y;
  float fine = ewOctave(p + 11.1, 0.45, fw), mid = ewOctave(p + 3.7, 2.3, fw), big = ewOctave(p, 9.0, fw);
  vec3 col = vec3(0.33, 0.33, 0.34) * (1.0 + 0.10 * big + 0.07 * mid + 0.09 * fine);
  int pv = rdPaired(k);
  if ((k == ${RAIL_SECTION} || k == ${RAIL2_SECTION}) && roadRail.x > 0.0) {
    // railway: gravel walkway shoulders, ballast bed per track, concrete sleepers every 0.6 m, two rails
    float c = k == ${RAIL2_SECTION} ? 0.5 * roadRail.y : 0.0, u = abs(abs(geo.x) - c);
    vec3 walk = mix(vec3(0.50, 0.46, 0.40), vec3(0.44, 0.47, 0.36), smoothstep(-0.2, 0.3, big + mid)) * (1.0 + 0.15 * fine);
    vec3 ballast = vec3(0.47, 0.45, 0.43) * (1.0 + 0.25 * fine + 0.08 * mid);
    col = mix(walk, ballast, rdCover(u, -1.0, roadRail.z, fx));
    float sleeper = rdCover(u, -1.0, 1.3, fx) * rdDashes(geo.z, 0.3, 0.6, fs);
    col = mix(col, vec3(0.62, 0.61, 0.58), sleeper * 0.9);
    float rail = rdCover(abs(u - roadRail.w), 0.0, 0.035, fx);
    col = mix(col, vec3(0.30, 0.29, 0.28), rdCover(abs(u - roadRail.w), 0.0, 0.08, fx));
    col = mix(col, vec3(0.80, 0.80, 0.82), rail * 0.8);
    if (bridge > 0.5) col = mix(col, vec3(0.70, 0.69, 0.66) * (1.0 + 0.05 * mid), rdCover(abs(geo.x), c + roadRail.z + 0.6, 1e3, fx));
  } else if (pv >= 0 && rdPairedRow(pv).z > 0.0) {
    // two carriageways about the spine: median (grass, concrete barrier), inner shoulder, two lanes, hard shoulder, verge
    x = rdSpine(k, geo.x);
    vec4 P = rdPairedRow(pv);
    float outer = pv == 0 ? roadPairedOuter[0] : roadPairedOuter[1];
    float m = P.x, l0 = m + P.y, l1 = l0 + P.z + outer, paved = l1 + P.w;
    float u = x - l0 - P.z; // offset from the line between the two lanes
    float track = 1.0 - smoothstep(0.15, 0.45, abs(abs(u) - 0.5 * (u < 0.0 ? P.z : outer)) - 0.9);
    col *= 1.0 - 0.06 * track * (1.0 - smoothstep(0.3, 0.8, fx));
    vec3 grass = mix(vec3(0.40, 0.55, 0.28), vec3(0.52, 0.60, 0.33), smoothstep(-0.3, 0.3, big + mid)) * (1.0 + 0.15 * fine);
    vec3 concrete = vec3(0.72, 0.71, 0.68) * (1.0 + 0.05 * mid);
    vec3 gravel = mix(vec3(0.56, 0.53, 0.47), vec3(0.48, 0.55, 0.36), smoothstep(-0.2, 0.3, big + mid)) * (1.0 + 0.2 * fine);
    col = mix(col, mix(grass, concrete, rdCover(x, -0.3, 0.3, fx)), rdCover(x, -1.0, m, fx) * (1.0 - step(0.5, bridge)));
    col = mix(col, mix(gravel, concrete, step(0.5, bridge)), rdCover(x, paved, 1e3, fx));
    float edge = max(rdCover(x, l0 - roadPairedLines.x, l0, fx), rdCover(x, l1, l1 + roadPairedLines.x, fx));
    float laneLine = rdCover(u, -0.5 * roadPairedLines.y, 0.5 * roadPairedLines.y, fx) * rdDashes(geo.z, roadPairedLines.z, roadPairedLines.z + roadPairedLines.w, fs);
    col = mix(col, vec3(0.88, 0.88, 0.85), max(edge, laneLine) * 0.95);
  } else if (lane > 0.0) {
    // wheel paths: polished, a little darker, ~0.9 m either side of each lane centre
    float track = 1.0 - smoothstep(0.15, 0.45, abs(abs(x - 0.5 * lane) - 0.9));
    col *= 1.0 - 0.06 * track * (1.0 - smoothstep(0.3, 0.8, fx));
    // gravel verge beside the hard shoulder; on a bridge the concrete edge beam
    float verge = rdCover(x, paved, 1e3, fx);
    vec3 gravel = mix(vec3(0.56, 0.53, 0.47), vec3(0.48, 0.55, 0.36), smoothstep(-0.2, 0.3, big + mid)) * (1.0 + 0.2 * fine);
    col = mix(col, mix(gravel, vec3(0.70, 0.69, 0.66) * (1.0 + 0.05 * mid), step(0.5, bridge)), verge);
    // white paint: edge lines on the inner edge of the guide strip, dashed centre line
    float edge = rdCover(x, lane, lane + roadSection.z, fx);
    float centre = rdCover(geo.x, -0.5 * roadSection.w, 0.5 * roadSection.w, fx) * rdDashes(geo.z, roadDash.x, roadDash.x + roadDash.y, fs);
    col = mix(col, vec3(0.88, 0.88, 0.85), max(edge, centre) * 0.95);
  }
  // a problem stretch: the surface tinted red (the line that marks it from afar is not drawn close up)
  return mix(col, vec3(0.62, 0.20, 0.17) * (1.0 + 0.1 * mid), 0.55 * bad);
}`;

/**
 * Material of the route ribbon. Cut and fill slopes and the carriageway are lit like the terrain relief
 * (same hillshade and strength, normals of the exaggerated surface) and the slopes get a procedural
 * texture; structures (bridge sides, piers, portals: `ewKind` 0) are vertex-coloured Lambert. The
 * terrain's contour lines are drawn on top. Per vertex: `ewKind` (EW_KIND; interpolates between cut and
 * fill), `ewGeo` (depth below the estimated class II and class III tops, m, and the station), `elev` = true elevation
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
    shader.uniforms.roadSections = u.roadSections;
    shader.uniforms.roadDash = u.roadDash;
    shader.uniforms.roadPaired = u.roadPaired;
    shader.uniforms.roadPairedLines = u.roadPairedLines;
    shader.uniforms.roadPairedOuter = u.roadPairedOuter;
    shader.uniforms.roadCarriageway = u.roadCarriageway;
    shader.uniforms.roadRail = u.roadRail;
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
      .replace('#include <common>', `#include <common>\nuniform float exag;\nuniform float shadeAmt;\nvarying float vElev;\nvarying float vInk;\n${CONTOUR_GLSL}\n${RELIEF_GLSL}\n${EARTH_GLSL}\n${ROAD_GLSL}`)
      .replace('#include <opaque_fragment>', /* glsl */ `
        // derivatives outside the branches (the varyings vary per fragment)
        float ewPx = max(length(vec2(dFdx(vElev), dFdy(vElev))), 1e-6);
        float ewFw = length(fwidth(vObj)), ewFs = fwidth(vGeo.z), ewFx = fwidth(vGeo.x);
        // display-referred sRGB, like the terrain (which mixes its colours and lines there)
        vec3 ewAlb = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
        if (vKind > 0.5) {
          vec3 ewN = normalize(vNrm);
          ewN *= sign(ewN.y + 1e-6); // double-sided: the upward face
          if (vKind > 3.5 && roadGap(vGeo)) discard;
          if (vKind > 3.5) ewAlb = roadAlbedo(vObj, vGeo, ewFw, ewFx, ewFs, clamp((diffuseColor.r - diffuseColor.g) * 4.0, 0.0, 1.0));
          else if (vKind > 1.5) ewAlb = earthAlbedo(vObj, clamp(vKind - 2.0, 0.0, 1.0), vGeo, ewFw, ewFs);
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
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), maskCut: { value: 0.5 }, ...uniforms, ...maskUniforms },
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
  });
}
