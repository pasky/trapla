// Compact Czech road-noise calculation: Manuál 2018, verze 2020, §§1.9–1.10 and §2.
// Infinite straight two-lane road, incident/free-field LAeq; NOT a full acoustic study.
// Equations, traffic assumptions and uneven-terrain extension: research/11-noise-calculation.md.
import { NOISE } from './data/urban';
import * as dm from './detmath';

export interface NoiseTraffic {
  /** Acoustic NA share of AADT (trucks, buses, combinations, allocated light goods), not just TNA. */
  heavyShare?: number;
  heavySpeed?: number;
  /** Fractions of each category's daily count in 22:00–06:00. Default: TP 219 non-E class I. */
  lightNightShare?: number;
  heavyNightShare?: number;
  /** Source profile: class I road (default, unchanged) or a four-lane motorway (MOTORWAY_NOISE). */
  profile?: 'class-I' | 'motorway';
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
    : (v <= 60 ? 3.59e-5 * dm.pow(v, 0.8) : 2.70e-7 * v * v);
  return f * dm.pow(10, (heavy ? NOISE.heavyEmissionDb : NOISE.lightEmissionDb) / 10);
}

/** Four-lane motorway source per Manuál 2018 v2020 (personally checked, /tmp extract of the MD PDF):
 * tab. 21 "Praha, dálnice I. a II. třídy" 2020 (later years use 2020): LOA 74.1, LNA 80.5 dB;
 * tab. 7 (TP 219 tab. 3-2) "Dálnice I. třídy" night coefficients Pnoc = NZ + NQ + kPNA·PNA [%];
 * tab. 9 lane split and tab. 15 free-flow lane speeds for four-lane motorways (130 km/h limit),
 * I24 = AADT in thousands clamped to 5…37. Trucks ("nákladní vozidla") and combinations
 * ("nákladní soupravy") keep their own lane shares and speeds. Lanes are summed into one emission
 * (each lane's F1 is additive); the carriageways' distinct positions are approximated by the
 * standard equivalent source (see NOISE.sourceOffset): for receivers beyond ≈ 20 m the line-source
 * energy of two carriageways at ±6 m differs from it by < 0.1 dB. */
export const MOTORWAY_NOISE = {
  lightEmissionDb: 74.1, heavyEmissionDb: 80.5,
  night: { light: { nz: 9.3, nq: -4.5, k: 0.2 }, heavy: { nz: 20.5, nq: -9.3, k: 0.4 } },
  /** PROVISIONAL split of acoustic heavy flow into combinations: TP 219 tab. 4-2 first-class motorway
   * mix (19 % medium/heavy goods and combinations incl. 13 % combinations, 1 % buses, 8 % light goods
   * of which 32 % count as NA, Manuál tab. 20 category I): 13 / 22.56. */
  combinationShareOfHeavy: 13 / 22.56,
  /** [inner-lane share a, b] → a·I24 + b percent; [inner speed a, b], [outer speed a, b] km/h. */
  lanes: {
    day: { light: { share: [0.673, 26.0], inner: [-0.595, 145], outer: [-0.689, 132] },
      truck: { share: [0.341, 7.2], inner: [-0.529, 131], outer: [-0.147, 96] },
      combination: { share: [0.109, 1.3], inner: [-0.023, 91], outer: [-0.058, 87] } },
    night: { light: { share: [0.226, 34.8], inner: [-0.449, 141], outer: [-0.506, 126] },
      truck: { share: [0.124, 9.7], inner: [-0.461, 121], outer: [-0.102, 84] },
      combination: { share: [0.086, 2.0], inner: [-0.040, 91], outer: [-0.045, 86] } },
  },
} as const;

/** Lane-weighted F1 per vehicle (motorway): Σ lanes share · f(v_lane). */
function motorwayLaneEmission(i24: number, period: 'day' | 'night', group: 'light' | 'truck' | 'combination'): number {
  const row = MOTORWAY_NOISE.lanes[period][group], inner = (row.share[0] * i24 + row.share[1]) / 100;
  const heavy = group !== 'light', v = (c: readonly number[]) => c[0] * i24 + c[1];
  const f = (speed: number) => heavy ? 2.45e-4 * Math.sqrt(speed) : 2.70e-7 * speed * speed;
  return (inner * f(v(row.inner)) + (1 - inner) * f(v(row.outer)))
    * dm.pow(10, (heavy ? MOTORWAY_NOISE.heavyEmissionDb : MOTORWAY_NOISE.lightEmissionDb) / 10);
}

function motorwaySource(traffic: number, p: number) {
  const t = Math.max(0, traffic), i24 = Math.max(5, Math.min(37, t / 1000)), pct = p * 100, m = MOTORWAY_NOISE;
  const ln = Math.max(0, Math.min(1, (m.night.light.nz + m.night.light.nq + m.night.light.k * pct) / 100));
  const hn = Math.max(0, Math.min(1, (m.night.heavy.nz + m.night.heavy.nq + m.night.heavy.k * pct) / 100));
  const c = m.combinationShareOfHeavy;
  const heavy = (period: 'day' | 'night') => (1 - c) * motorwayLaneEmission(i24, period, 'truck') + c * motorwayLaneEmission(i24, period, 'combination');
  const dayDb = 10 * dm.log10((t * (1 - p) * (1 - ln) * motorwayLaneEmission(i24, 'day', 'light') + t * p * (1 - hn) * heavy('day')) / 16) - 10.1;
  const nightDb = 10 * dm.log10((t * (1 - p) * ln * motorwayLaneEmission(i24, 'night', 'light') + t * p * hn * heavy('night')) / 8) - 10.1;
  return { dayDb, nightDb, excessDb: Math.max(dayDb - NOISE.limitDayDb, nightDb - NOISE.limitNightDb),
    controlling: dayDb - NOISE.limitDayDb >= nightDb - NOISE.limitNightDb ? 'day' as const : 'night' as const };
}

export function noiseSource(traffic: number, speed: number, options: NoiseTraffic = {}) {
  const p = Math.max(0, Math.min(1, options.heavyShare ?? NOISE.heavyShare));
  // Motorway lane speeds come from the manual's free-flow tables, not the design speed.
  if (options.profile === 'motorway') return motorwaySource(traffic, p);
  // TP 219 (2019), table 3-2, non-E class I, combined NA+NS row. PNA in percent.
  const ln = Math.max(0, Math.min(1, options.lightNightShare ?? (0.077 + 0.1 * p)));
  const hn = Math.max(0, Math.min(1, options.heavyNightShare ?? (0.064 + 0.6 * p)));
  const light = Math.max(0, traffic) * (1 - p) * vehicleEmission(speed, false);
  const heavy = Math.max(0, traffic) * p * vehicleEmission(options.heavySpeed ?? Math.min(speed, NOISE.heavySpeed), true);
  // F2 = 1 for modern class I roads with grades ≤6%; F3 = 1 for standard ACO11/SMA11.
  const dayDb = 10 * dm.log10((light * (1 - ln) + heavy * (1 - hn)) / 16) - 10.1;
  const nightDb = 10 * dm.log10((light * ln + heavy * hn) / 8) - 10.1;
  return { dayDb, nightDb, excessDb: Math.max(dayDb - NOISE.limitDayDb, nightDb - NOISE.limitNightDb),
    controlling: dayDb - NOISE.limitDayDb >= nightDb - NOISE.limitNightDb ? 'day' as const : 'night' as const };
}

/** Manual Uo, d=8…1000 m. Below 8 m use its line-source near-distance expression;
 * below 3.75 m clamp (outside method domain), beyond 1 km continue with geometric divergence. */
export function hardGroundLoss(d: number): number { return hardGround(d); }
function hardGround(d: number): number {
  const r = Math.max(3.75, d);
  if (r < 8) return 10 * dm.log10(r / 8);
  const u = 50.2 - Math.sqrt(3357.23 - 911.8 * dm.log10(Math.min(1000, r)));
  return u + (r > 1000 ? 10 * dm.log10(r / 1000) : 0);
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
  const soft = 8.78 * dm.log10((d * d + (h + 3) ** 2) / (17 * h + 51))
    + (r < 8 ? 10 * dm.log10(r / 8) : r > 1000 ? 10 * dm.log10(r / 1000) : 0);
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
  /** Receiver limits the excess refers to; absent = road limits (NOISE). Railway: new-line 60 / 55 dB. */
  limits?: { dayDb: number; nightDb: number };
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
