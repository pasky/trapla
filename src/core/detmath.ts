// Deterministic transcendental functions for everything that is billed.
//
// Math.sin/cos/tan/atan2/log10 are implementation-defined: Chromium's V8 (156) and Node's V8 (12.4)
// return different last bits for some arguments (research/27: 60/1837 sin, 77/1837 cos,
// 73/6445 log10 and 1/12 atan2 arguments of one Nová Paka evaluation), which moved a discrete
// remedy choice and the bill by 109,595 CZK between the browser and Node. These are plain-JS ports of
// fdlibm (Sun 5.3 / FreeBSD msun, as used by V8's base/ieee754) built only from IEEE +,-,*,/ and
// bit manipulation, so every engine computes identical bits — and they equal Node's current Math
// results, keeping every frozen bill unchanged. Math.sqrt/hypot/abs/min/max are exact or already
// engine-independent and stay native.

const f64 = new Float64Array(1), i32 = new Int32Array(f64.buffer); // little-endian: [low, high]
const high = (x: number) => { f64[0] = x; return i32[1]; };
const low = (x: number) => { f64[0] = x; return i32[0]; };
const withHigh = (x: number, hi: number) => { f64[0] = x; i32[1] = hi; return f64[0]; };
const withLow = (x: number, lo: number) => { f64[0] = x; i32[0] = lo; return f64[0]; };
const fromWords = (hi: number, lo: number) => { i32[1] = hi; i32[0] = lo; return f64[0]; };

// ---- argument reduction (|x| < 2^19·π/2; larger angles never occur in this engine) ----
const invpio2 = 6.36619772367581382433e-01, pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11,
  pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21, pio2_3 = 2.02226624871116645580e-21,
  pio2_3t = 8.47842766036889956997e-32;
const npio2_hw = [0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB,
  0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B,
  0x403C463A, 0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C,
  0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB];
const y = [0, 0];
/** n with x = n·π/2 + y[0] + y[1]; undefined beyond the medium range. */
function remPio2(x: number): number | undefined {
  const hx = high(x), ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) { y[0] = x; y[1] = 0; return 0; }
  if (ix < 0x4002d97c) { // |x| < 3π/4, n = ±1
    if (hx > 0) {
      let z = x - pio2_1;
      if (ix !== 0x3ff921fb) { y[0] = z - pio2_1t; y[1] = (z - y[0]) - pio2_1t; }
      else { z -= pio2_2; y[0] = z - pio2_2t; y[1] = (z - y[0]) - pio2_2t; }
      return 1;
    }
    let z = x + pio2_1;
    if (ix !== 0x3ff921fb) { y[0] = z + pio2_1t; y[1] = (z - y[0]) + pio2_1t; }
    else { z += pio2_2; y[0] = z + pio2_2t; y[1] = (z - y[0]) + pio2_2t; }
    return -1;
  }
  if (ix > 0x413921fb) return undefined;
  const t0 = Math.abs(x), n = Math.trunc(t0 * invpio2 + 0.5), fn = n;
  let r = t0 - fn * pio2_1, w = fn * pio2_1t;
  if (n < 32 && ix !== npio2_hw[n - 1]) y[0] = r - w;
  else {
    const j = ix >> 20;
    y[0] = r - w;
    let i = j - ((high(y[0]) >> 20) & 0x7ff);
    if (i > 16) {
      let t = r; w = fn * pio2_2; r = t - w; w = fn * pio2_2t - ((t - r) - w); y[0] = r - w;
      i = j - ((high(y[0]) >> 20) & 0x7ff);
      if (i > 49) { t = r; w = fn * pio2_3; r = t - w; w = fn * pio2_3t - ((t - r) - w); y[0] = r - w; }
    }
  }
  y[1] = (r - y[0]) - w;
  if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
  return n;
}

const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
function kSin(x: number, yy: number, iy: number): number {
  const ix = high(x) & 0x7fffffff;
  if (ix < 0x3e400000 && Math.trunc(x) === 0) return x;
  const z = x * x, v = z * x, r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return iy === 0 ? x + v * (S1 + z * r) : x - ((z * (0.5 * yy - v * r) - yy) - v * S1);
}
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
function kCos(x: number, yy: number): number {
  const ix = high(x) & 0x7fffffff;
  if (ix < 0x3e400000 && Math.trunc(x) === 0) return 1;
  const z = x * x, r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * yy));
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);
  return (1 - qx) - ((0.5 * z - qx) - (z * r - x * yy));
}
const T = [3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02, 2.18694882948595424599e-02,
  8.86323982359930005737e-03, 3.59207910759131235356e-03, 1.45620945432529025516e-03, 5.88041240820264096874e-04,
  2.46463134818469906812e-04, 7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
  2.59073051863633712884e-05];
const pio4 = 7.85398163397448278999e-01, pio4lo = 3.06161699786838301793e-17;
function kTan(x: number, yy: number, iy: number): number {
  const hx = high(x), ix = hx & 0x7fffffff;
  if (ix < 0x3e300000 && Math.trunc(x) === 0) {
    if (((ix | low(x)) | (iy + 1)) === 0) return 1 / Math.abs(x);
    if (iy === 1) return x;
    const w = x + yy, z = withLow(w, 0), v = yy - (z - x), a = -1 / w, t = withLow(a, 0), s = 1 + t * z;
    return t + a * (s + t * v);
  }
  if (ix >= 0x3fe59428) {
    if (hx < 0) { x = -x; yy = -yy; }
    const z = pio4 - x, w = pio4lo - yy; x = z + w; yy = 0;
  }
  const z = x * x, w = z * z;
  let r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))));
  const v = z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12]))))), s = z * x;
  r = yy + z * (s * (r + v) + yy);
  r += T[0] * s;
  const ww = x + r;
  if (ix >= 0x3fe59428) return (1 - ((hx >> 30) & 2)) * (iy - 2 * (x - (ww * ww / (ww + iy) - r)));
  if (iy === 1) return ww;
  const zz = withLow(ww, 0), vv = r - (zz - x), a = -1 / ww, t = withLow(a, 0), ss = 1 + t * zz;
  return t + a * (ss + t * vv);
}

export function sin(x: number): number {
  const ix = high(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kSin(x, 0, 0);
  if (ix >= 0x7ff00000) return NaN;
  const n = remPio2(x);
  if (n === undefined) return Math.sin(x);
  switch (n & 3) {
    case 0: return kSin(y[0], y[1], 1);
    case 1: return kCos(y[0], y[1]);
    case 2: return -kSin(y[0], y[1], 1);
    default: return -kCos(y[0], y[1]);
  }
}
export function cos(x: number): number {
  const ix = high(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kCos(x, 0);
  if (ix >= 0x7ff00000) return NaN;
  const n = remPio2(x);
  if (n === undefined) return Math.cos(x);
  switch (n & 3) {
    case 0: return kCos(y[0], y[1]);
    case 1: return -kSin(y[0], y[1], 1);
    case 2: return -kCos(y[0], y[1]);
    default: return kSin(y[0], y[1], 1);
  }
}
export function tan(x: number): number {
  const ix = high(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kTan(x, 0, 1);
  if (ix >= 0x7ff00000) return NaN;
  const n = remPio2(x);
  if (n === undefined) return Math.tan(x);
  return kTan(y[0], y[1], 1 - ((n & 1) << 1));
}

const atanhi = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const atanlo = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const aT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
export function atan(x: number): number {
  const hx = high(x), ix = hx & 0x7fffffff;
  let id: number;
  if (ix >= 0x44100000) {
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && low(x) !== 0)) return x + x;
    return hx > 0 ? atanhi[3] + atanlo[3] : -atanhi[3] - atanlo[3];
  }
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e400000) return x;
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) { id = 0; x = (2 * x - 1) / (2 + x); } else { id = 1; x = (x - 1) / (x + 1); }
    } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1 + 1.5 * x); } else { id = 3; x = -1 / x; }
  }
  const z = x * x, w = z * z;
  const s1 = z * (aT[0] + w * (aT[2] + w * (aT[4] + w * (aT[6] + w * (aT[8] + w * aT[10])))));
  const s2 = w * (aT[1] + w * (aT[3] + w * (aT[5] + w * (aT[7] + w * aT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const r = atanhi[id] - ((x * (s1 + s2) - atanlo[id]) - x);
  return hx < 0 ? -r : r;
}
const pi_o_4 = 7.8539816339744827900e-01, pi_o_2 = 1.5707963267948965580e+00, PI = 3.1415926535897931160e+00,
  pi_lo = 1.2246467991473531772e-16;
export function atan2(yv: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(yv)) return NaN;
  const hx = high(x), lx = low(x), ix = hx & 0x7fffffff, hy = high(yv), ly = low(yv), iy = hy & 0x7fffffff;
  if (((hx - 0x3ff00000) | lx) === 0) return atan(yv);
  const m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
  if ((iy | ly) === 0) return m <= 1 ? yv : m === 2 ? PI : -PI;
  if ((ix | lx) === 0) return hy < 0 ? -pi_o_2 : pi_o_2;
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) return [pi_o_4, -pi_o_4, 3 * pi_o_4, -3 * pi_o_4][m];
    return [0, -0, PI, -PI][m];
  }
  if (iy === 0x7ff00000) return hy < 0 ? -pi_o_2 : pi_o_2;
  const k = (iy - ix) >> 20;
  let z: number;
  if (k > 60) { z = pi_o_2 + 0.5 * pi_lo; return m & 1 ? -z : z; }
  else if (hx < 0 && k < -60) z = 0;
  else z = atan(Math.abs(yv / x));
  switch (m) {
    case 0: return z;
    case 1: return -z;
    case 2: return PI - (z - pi_lo);
    default: return (z - pi_lo) - PI;
  }
}

const two54 = 1.80143985094819840000e+16, ivln10 = 4.34294481903251816668e-01,
  log10_2hi = 3.01029995663611771306e-01, log10_2lo = 3.69423907715893078616e-13,
  ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10;
const Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01,
  Lg4 = 2.222219843214978396e-01, Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01, Lg7 = 1.479819860511658591e-01;
export function log(x: number): number {
  let hx = high(x), k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | low(x)) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54; x *= two54; hx = high(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  return logNormal(x, k);
}
/** fdlibm __ieee754_log after the special cases; `k` carries a subnormal pre-scaling. */
function logNormal(x: number, k: number): number {
  let hx = high(x);
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHigh(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = x - 1;
  if ((0x000fffff & (2 + hx)) < 3) {
    if (f === 0) return k === 0 ? 0 : k * ln2_hi + k * ln2_lo;
    const R = f * f * (0.5 - 0.33333333333333333 * f);
    return k === 0 ? f - R : k * ln2_hi - ((R - k * ln2_lo) - f);
  }
  const s = f / (2 + f), dk = k, z = s * s, w = z * z;
  i = hx - 0x6147a;
  const j = 0x6b851 - hx;
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6)), t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  i |= j;
  const R = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    return k === 0 ? f - (hfsq - s * (hfsq + R)) : dk * ln2_hi - ((hfsq - (s * (hfsq + R) + dk * ln2_lo)) - f);
  }
  return k === 0 ? f - s * (f - R) : dk * ln2_hi - ((s * (f - R) - dk * ln2_lo) - f);
}
export function log10(x: number): number {
  let hx = high(x), k = 0;
  const lx = low(x);
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54; x *= two54; hx = high(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  const i = (k & 0x80000000) >>> 31;
  hx = (hx & 0x000fffff) | ((0x3ff - i) << 20);
  const yk = k + i;
  x = withHigh(x, hx);
  const z = yk * log10_2lo + ivln10 * logNormal(x, 0);
  return z + yk * log10_2hi;
}

const halF = [0.5, -0.5], ln2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01],
  ln2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10], invln2 = 1.44269504088896338700e+00,
  o_threshold = 7.09782712893383973096e+02, u_threshold = -7.45133219101941108420e+02, twom1000 = 9.33263618503218878990e-302,
  P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
  P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
export function exp(x: number): number {
  if (x === 1) return 2.718281828459045; // V8 returns the correctly rounded e here
  let hx = high(x);
  const xsb = (hx >>> 31) & 1;
  hx &= 0x7fffffff;
  let hi = 0, lo = 0, k = 0;
  if (hx >= 0x40862e42) {
    if (hx >= 0x7ff00000) return ((hx & 0xfffff) | low(x)) !== 0 ? x + x : xsb === 0 ? x : 0;
    if (x > o_threshold) return Infinity;
    if (x < u_threshold) return 0;
  }
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) { hi = x - ln2HI[xsb]; lo = ln2LO[xsb]; k = 1 - xsb - xsb; }
    else { k = Math.trunc(invln2 * x + halF[xsb]); hi = x - k * ln2HI[0]; lo = k * ln2LO[0]; }
    x = hi - lo;
  } else if (hx < 0x3e300000) return 1 + x;
  const t = x * x, c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const yv = 1 - ((lo - (x * c) / (2 - c)) - hi);
  if (k >= -1021) return withHigh(yv, high(yv) + (k << 20));
  return withHigh(yv, high(yv) + ((k + 1000) << 20)) * twom1000;
}

const pio2_hi = 1.57079632679489655800e+00, pio2_lo = 6.12323399573676603587e-17, pio4_hi = 7.85398163397448278999e-01,
  pS0 = 1.66666666666666657415e-01, pS1 = -3.25565818622400915405e-01, pS2 = 2.01212532134862925881e-01,
  pS3 = -4.00555345006794114027e-02, pS4 = 7.91534994289814532176e-04, pS5 = 3.47933107596021167570e-05,
  qS1 = -2.40339491173441421878e+00, qS2 = 2.02094576023350569471e+00, qS3 = -6.88283971605453293030e-01,
  qS4 = 7.70381505559019352791e-02;
const pS = (t: number) => t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))));
const qS = (t: number) => 1 + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)));
export function asin(x: number): number {
  const hx = high(x), ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) return ((ix - 0x3ff00000) | low(x)) === 0 ? x * pio2_hi + x * pio2_lo : NaN;
  if (ix < 0x3fe00000) {
    if (ix < 0x3e400000) return x;
    const t = x * x;
    return x + x * (pS(t) / qS(t));
  }
  const w = 1 - Math.abs(x), t = w * 0.5, p = pS(t), q = qS(t), s = Math.sqrt(t);
  let r: number;
  if (ix >= 0x3fef3333) r = pio2_hi - (2 * (s + s * (p / q)) - pio2_lo);
  else {
    const ww = withLow(s, 0), c = (t - ww * ww) / (s + ww), pp = 2 * s * (p / q) - (pio2_lo - 2 * c), qq = pio4_hi - 2 * ww;
    r = pio4_hi - (pp - qq);
  }
  return hx > 0 ? r : -r;
}
export function acos(x: number): number {
  const hx = high(x), ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | low(x)) === 0) return hx > 0 ? 0 : PI + 2 * pio2_lo;
    return NaN;
  }
  if (ix < 0x3fe00000) {
    if (ix <= 0x3c600000) return pio2_hi + pio2_lo;
    const z = x * x, r = pS(z) / qS(z);
    return pio2_hi - (x - (pio2_lo - x * r));
  }
  if (hx < 0) {
    const z = (1 + x) * 0.5, s = Math.sqrt(z), w = (pS(z) / qS(z)) * s - pio2_lo;
    return PI - 2 * (s + w);
  }
  const z = (1 - x) * 0.5, s = Math.sqrt(z), df = withLow(s, 0), c = (z - df * df) / (s + df), w = (pS(z) / qS(z)) * s + c;
  return 2 * (df + w);
}

const bp = [1, 1.5], dp_h = [0, 5.84962487220764160156e-01], dp_l = [0, 1.35003920212974897128e-08], two53 = 9007199254740992,
  L1 = 5.99999999999994648725e-01, L2 = 4.28571428578550184252e-01, L3 = 3.33333329818377432918e-01,
  L4 = 2.72728123808534006489e-01, L5 = 2.30660745775561754067e-01, L6 = 2.06975017800338417784e-01,
  lg2 = 6.93147180559945286227e-01, lg2_h = 6.93147182464599609375e-01, lg2_l = -1.90465429995776804525e-09,
  ovt = 8.0085662595372944372e-17, cp = 9.61796693925975554329e-01, cp_h = 9.61796700954437255859e-01,
  cp_l = -7.02846165095275826516e-09, ivln2 = 1.44269504088896338700e+00, ivln2_h = 1.44269502162933349609e+00,
  ivln2_l = 1.92596299112661746887e-08;
/** x ** y (fdlibm __ieee754_pow). */
export function pow(x: number, yv: number): number {
  const hx = high(x), lx = low(x) >>> 0, hy = high(yv), ly = low(yv) >>> 0;
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  if ((iy | ly) === 0) return 1;
  if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lx !== 0) || iy > 0x7ff00000 || (iy === 0x7ff00000 && ly !== 0)) return NaN;
  let yisint = 0, k: number, j: number;
  if (hx < 0) {
    if (iy >= 0x43400000) yisint = 2;
    else if (iy >= 0x3ff00000) {
      k = (iy >> 20) - 0x3ff;
      if (k > 20) { j = ly >>> (52 - k); if (((j << (52 - k)) >>> 0) === ly) yisint = 2 - (j & 1); }
      else if (ly === 0) { j = iy >> (20 - k); if ((j << (20 - k)) === iy) yisint = 2 - (j & 1); }
    }
  }
  if (ly === 0) {
    if (iy === 0x7ff00000) {
      if (((ix - 0x3ff00000) | lx) === 0) return NaN; // JS: (±1) ** ±Infinity is NaN
      if (ix >= 0x3ff00000) return hy >= 0 ? yv : 0;
      return hy < 0 ? -yv : 0;
    }
    if (iy === 0x3ff00000) return hy < 0 ? 1 / x : x;
    if (hy === 0x40000000) return x * x;
    if (hy === 0x3fe00000 && hx >= 0) return Math.sqrt(x);
  }
  let ax = Math.abs(x);
  if (lx === 0 && (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000)) {
    let z = ax;
    if (hy < 0) z = 1 / z;
    if (hx < 0) {
      if (((ix - 0x3ff00000) | yisint) === 0) z = NaN;
      else if (yisint === 1) z = -z;
    }
    return z;
  }
  let n = (hx >> 31) + 1;
  if ((n | yisint) === 0) return NaN;
  let s = 1;
  if ((n | (yisint - 1)) === 0) s = -1;
  let t1: number, t2: number;
  if (iy > 0x41e00000) {
    if (iy > 0x43f00000) {
      if (ix <= 0x3fefffff) return hy < 0 ? Infinity : 0;
      if (ix >= 0x3ff00000) return hy > 0 ? Infinity : 0;
    }
    if (ix < 0x3fefffff) return hy < 0 ? s * Infinity : s * 0;
    if (ix > 0x3ff00000) return hy > 0 ? s * Infinity : s * 0;
    const t = ax - 1, w = (t * t) * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
    const u = ivln2_h * t, v = t * ivln2_l - w * ivln2;
    t1 = withLow(u + v, 0);
    t2 = v - (t1 - u);
  } else {
    n = 0;
    if (ix < 0x00100000) { ax *= two53; n -= 53; ix = high(ax); }
    n += (ix >> 20) - 0x3ff;
    j = ix & 0x000fffff;
    ix = j | 0x3ff00000;
    if (j <= 0x3988e) k = 0;
    else if (j < 0xbb67a) k = 1;
    else { k = 0; n += 1; ix -= 0x00100000; }
    ax = withHigh(ax, ix);
    let u = ax - bp[k], v = 1 / (ax + bp[k]);
    const ss = u * v, s_h = withLow(ss, 0);
    let t_h = fromWords(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0);
    let t_l = ax - (t_h - bp[k]);
    const s_l = v * ((u - s_h * t_h) - s_h * t_l);
    let s2 = ss * ss;
    let r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r += s_l * (s_h + ss);
    s2 = s_h * s_h;
    t_h = withLow(3 + s2 + r, 0);
    t_l = r - ((t_h - 3) - s2);
    u = s_h * t_h;
    v = s_l * t_h + t_l * ss;
    const p_h = withLow(u + v, 0), p_l = v - (p_h - u);
    const z_h = cp_h * p_h, z_l = cp_l * p_h + p_l * cp + dp_l[k];
    const t = n;
    t1 = withLow(((z_h + z_l) + dp_h[k]) + t, 0);
    t2 = z_l - (((t1 - t) - dp_h[k]) - z_h);
  }
  const y1 = withLow(yv, 0);
  const p_l = (yv - y1) * t1 + yv * t2;
  let p_h = y1 * t1;
  let z = p_l + p_h;
  j = high(z);
  let i = low(z);
  if (j >= 0x40900000) {
    if (((j - 0x40900000) | i) !== 0) return s * Infinity;
    if (p_l + ovt > z - p_h) return s * Infinity;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {
    if (((j - 0xc090cc00) | i) !== 0) return s * 0;
    if (p_l <= z - p_h) return s * 0;
  }
  i = j & 0x7fffffff;
  k = (i >> 20) - 0x3ff;
  n = 0;
  if (i > 0x3fe00000) {
    n = j + (0x00100000 >> (k + 1));
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    const t = fromWords(n & ~(0x000fffff >> k), 0);
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    p_h -= t;
  }
  const t = withLow(p_l + p_h, 0);
  const u = t * lg2_h, v = (p_l - (t - p_h)) * lg2 + t * lg2_l;
  z = u + v;
  const w = v - (z - u), tt = z * z, tt1 = z - tt * (P1 + tt * (P2 + tt * (P3 + tt * (P4 + tt * P5))));
  const r = (z * tt1) / (tt1 - 2) - (w + z * w);
  z = 1 - (r - z);
  j = high(z) + (n << 20);
  if ((j >> 20) <= 0) z = z * fromWords((0x3ff + n + 1000) << 20, 0) * twom1000; // subnormal result
  else z = withHigh(z, j);
  return s * z;
}
