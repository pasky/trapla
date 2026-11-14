// Compact Czech road-noise calculation: Manuál 2018, verze 2020, §§1.9–1.10 and §2.
// Infinite straight two-lane road, incident/free-field LAeq; NOT a full acoustic study.
// Equations, traffic assumptions and uneven-terrain extension: research/11-noise-calculation.md.
import { NOISE } from './data/urban';

export interface NoiseTraffic {
  /** Acoustic NA share of AADT (trucks, buses, combinations, allocated light goods), not just TNA. */
  heavyShare?: number;
  heavySpeed?: number;
  /** Fractions of each category's daily count in 22:00–06:00. Default: TP 219 non-E class I. */
  lightNightShare?: number;
  heavyNightShare?: number;
}

export interface NoiseOptions extends NoiseTraffic {
  /** Default calibrated hard class; mixed (40–60% porous) remains available for sensitivity. */
  ground?: 'mixed' | 'hard';
}

/** Per-vehicle contribution to F1 for a flow of one vehicle/hour (not sound power or pass-by Lmax).
 * Manual equations 36–39, table 21: class I, year 2020 (also prescribed for later forecast years). */
export function vehicleEmission(speed: number, heavy: boolean): number {
  const v = Math.max(1, speed);
  const f = heavy ? (v <= 60 ? 1.50e-2 / Math.sqrt(v) : 2.45e-4 * Math.sqrt(v))
    : (v <= 60 ? 3.59e-5 * v ** 0.8 : 2.70e-7 * v * v);
  return f * 10 ** ((heavy ? NOISE.heavyEmissionDb : NOISE.lightEmissionDb) / 10);
}

export function noiseSource(traffic: number, speed: number, options: NoiseTraffic = {}) {
  const p = Math.max(0, Math.min(1, options.heavyShare ?? NOISE.heavyShare));
  // TP 219 (2019), table 3-2, non-E class I, combined NA+NS row. PNA in percent.
  const ln = Math.max(0, Math.min(1, options.lightNightShare ?? (0.077 + 0.1 * p)));
  const hn = Math.max(0, Math.min(1, options.heavyNightShare ?? (0.064 + 0.6 * p)));
  const light = Math.max(0, traffic) * (1 - p) * vehicleEmission(speed, false);
  const heavy = Math.max(0, traffic) * p * vehicleEmission(options.heavySpeed ?? Math.min(speed, NOISE.heavySpeed), true);
  // F2 = 1 for modern class I roads with grades ≤6%; F3 = 1 for standard ACO11/SMA11.
  const dayDb = 10 * Math.log10((light * (1 - ln) + heavy * (1 - hn)) / 16) - 10.1;
  const nightDb = 10 * Math.log10((light * ln + heavy * hn) / 8) - 10.1;
  return { dayDb, nightDb, excessDb: Math.max(dayDb - NOISE.limitDayDb, nightDb - NOISE.limitNightDb),
    controlling: dayDb - NOISE.limitDayDb >= nightDb - NOISE.limitNightDb ? 'day' as const : 'night' as const };
}

/** Manual Uo, d=8…1000 m. Below 8 m use its line-source near-distance expression;
 * below 3.75 m clamp (outside method domain), beyond 1 km continue with geometric divergence. */
function hardGround(d: number): number {
  const r = Math.max(3.75, d);
  if (r < 8) return 10 * Math.log10(r / 8);
  const u = 50.2 - Math.sqrt(3357.23 - 911.8 * Math.log10(Math.min(1000, r)));
  return u + (r > 1000 ? 10 * Math.log10(r / 1000) : 0);
}

/** Manual §2 pp.63–64: hard Uo by default; mixed (40–60% porous) blends Up→Uo from 5 to 10 m.
 * For uneven sections d is slant range and h is effective ray height (absolute road-relative
 * receiver elevation, mirrored below grade). This bridge/cut extension is NOT prescribed by
 * the manual; it suppresses ground credit, but is not a proven upper bound on real-terrain levels. No extra
 * façade reflection, vegetation, terrain or meteorological credit. */
export function propagationLoss(slant: number, height: number, ground: 'mixed' | 'hard' = NOISE.ground): number {
  const r = Math.max(3.75, slant), h = Math.max(1.5, height);
  const hard = hardGround(r);
  if (h >= 10 || ground === 'hard') return hard;
  const d = Math.max(8, Math.min(1000, r));
  const soft = 8.78 * Math.log10((d * d + (h + 3) ** 2) / (17 * h + 51))
    + (r < 8 ? 10 * Math.log10(r / 8) : r > 1000 ? 10 * Math.log10(r / 1000) : 0);
  // Never invent amplification from the small near-field mismatch between the empirical fits.
  return hard + Math.max(0, soft - hard) * Math.min(1, (10 - h) / 5);
}

export interface NoiseModel extends ReturnType<typeof noiseSource> {
  /** Conservative all-height search bound, slant metres from near-lane source. */
  radius: number;
  /** Selected-ground contour, axis-to-receiver metres, at NOISE.receiverHeight above grade. */
  contour: number;
  /** Interpolated loss table (0.5 m range × 0.5 m height); built once per evaluation. */
  loss: (slant: number, height: number) => number;
}

function effectiveHeight(height: number): number {
  return Math.abs(height - NOISE.sourceHeight) + NOISE.sourceHeight;
}

export function noiseLevels(distance: number, height: number, model: NoiseModel) {
  const slant = Math.hypot(distance - NOISE.sourceOffset, height - NOISE.sourceHeight);
  const loss = model.loss(slant, effectiveHeight(height));
  return { dayDb: model.dayDb - loss, nightDb: model.nightDb - loss,
    excessDb: model.excessDb - loss, controlling: model.controlling };
}

/** Geometry hot path needs only the controlling excess, not a per-pair result object. */
export function noiseExcess(slant: number, height: number, model: NoiseModel): number {
  return model.excessDb - model.loss(slant, effectiveHeight(height));
}

export function createNoiseModel(traffic: number, speed: number, options: NoiseOptions = {}): NoiseModel {
  const source = noiseSource(traffic, speed, options);
  const ground = options.ground ?? NOISE.ground;
  let low = 0, high = 1000;
  while (hardGround(high) < source.excessDb) high *= 2;
  for (let k = 0; k < 40; k++) {
    const mid = (low + high) / 2;
    if (hardGround(mid) < source.excessDb) low = mid; else high = mid;
  }
  const radius = source.excessDb <= hardGround(0) ? 0 : high;
  // Bound allocation independently of traffic. Out-of-table diagnostic calls use the exact formula.
  const step = 0.5, columns = Math.ceil(Math.min(radius + 1, 1000) / step) + 1, rows = 18;
  const table = new Float64Array(columns * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    table[j * columns + i] = propagationLoss(i * step, 1.5 + j * step, ground);
  }
  const loss = (slant: number, height: number): number => {
    const x = Math.max(0, slant / step), y = Math.max(0, Math.min(rows - 1, (height - 1.5) / step));
    const i = Math.floor(x), j = Math.min(rows - 2, Math.floor(y));
    // Do not interpolate across the 3.75 m clamp or the empirical fits' small jump at 8 m.
    if (slant < 8.5 || i >= columns - 1) return propagationLoss(slant, height, ground);
    const a = j * columns + i, b = a + columns, t = x - i, u = y - j;
    return (table[a] * (1 - t) + table[a + 1] * t) * (1 - u)
      + (table[b] * (1 - t) + table[b + 1] * t) * u;
  };
  const model: NoiseModel = { ...source, radius, contour: 0, loss };
  // A hard-ground contour can exist even when the low mixed-ground receiver is never exposed.
  if (radius === 0 || noiseLevels(NOISE.sourceOffset, NOISE.receiverHeight, model).excessDb <= 0) return model;
  low = NOISE.sourceOffset; high = radius + NOISE.sourceOffset;
  for (let k = 0; k < 40; k++) {
    const mid = (low + high) / 2;
    if (noiseLevels(mid, NOISE.receiverHeight, model).excessDb > 0) low = mid; else high = mid;
  }
  model.contour = high;
  return model;
}

/** Unmitigated contour for the calibrated ground class at the low receiver, axis-to-receiver m. */
export function noiseDistance(traffic: number, speed: number): number {
  return createNoiseModel(traffic, speed).contour;
}
