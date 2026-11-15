// Railway noise source (CNOSSOS-EU, Directive 2002/49/EC Annex II §2.3, consolidated 2021; data/cnossos-rail.ts)
// and a line-source level for the game's receivers. Rolling noise (rail + wheel roughness, contact filter,
// track / vehicle / superstructure transfer) and traction per vehicle in 1/3-octave bands, A-weighted.
// Aerodynamic noise only above 200 km/h (not reached ≤ 160 km/h); no squeal (curves ≥ 500 m), no
// impact (continuously welded track), no bridge radiation (ballasted concrete decks). PROVISIONAL game
// simplifications: one equivalent line source at 0.5 m, placed like the game's road source 1.75 m from the
// axis towards the house (≈ the near track of a double line, 2.0 m); traction's 4 m source B is merged into
// it (≈ 1 % of a passenger car's A-weighted power at 160 km/h, ≈ 26 % of a locomotive's at 100 km/h: a wall
// shields that part somewhat too well); the dipole horizontal directivity (2.3.15) integrated along an
// infinite line (×0.505), propagation = spherical spreading along the line over hard ground (+3 dB
// reflection), no air absorption or ground credit (both would only lower the level). Walls and cut edges use the game's diffraction like roads.
import { A_WEIGHTING, CONTACT_FILTER, FREQUENCIES, RAIL_ROUGHNESS, SUPERSTRUCTURE_TRANSFER, TRACK_TRANSFER_MM, TRACTION,
  VEHICLE_TRANSFER_920, WAVELENGTHS, WHEEL_ROUGHNESS } from './data/cnossos-rail';
import { RAILWAY_EVIDENCE } from './data/railway';
import type { NoiseModel } from './road-noise';
import * as dm from './detmath';

export interface RailVehicle {
  axles: number; brake: keyof typeof WHEEL_ROUGHNESS; load: keyof typeof CONTACT_FILTER;
  traction?: keyof typeof TRACTION; superstructure?: boolean;
}
export interface RailTrainType { name: string; vehicles: readonly RailVehicle[] }

/** PROVISIONAL compositions. Passenger: 4-car electric multiple unit, disc brakes, every car with the
 * table's EMU traction (conservative). Freight: electric locomotive + 20 four-axle wagons with composite
 * (K/LL) blocks — TSI Noise (Reg. 1304/2014 as amended by 2019/774) bars cast-iron-braked wagons from
 * "quieter routes" from Dec 2024; a new mainline would be one. */
export const PASSENGER_EMU: RailTrainType = { name: 'electric multiple unit, 4 cars',
  vehicles: Array.from({ length: 4 }, () => ({ axles: 4, brake: 'disc' as const, load: 'load50kN' as const, traction: 'electricMultipleUnit' as const })) };
export const FREIGHT_TRAIN: RailTrainType = { name: 'electric locomotive + 20 wagons',
  vehicles: [{ axles: 4, brake: 'disc', load: 'load100kN', traction: 'electricLocomotive' },
    ...Array.from({ length: 20 }, () => ({ axles: 4, brake: 'composite' as const, load: 'load100kN' as const, superstructure: true }))] };

/** Linear interpolation in dB over log(wavelength) on a table listed longest first; clamped at the ends. */
function atWavelength(table: readonly number[], lambdas: readonly number[], mm: number): number {
  if (mm >= lambdas[0]) return table[0];
  const last = lambdas.length - 1;
  if (mm <= lambdas[last]) return table[last];
  let k = 0;
  while (lambdas[k + 1] > mm) k++;
  const t = dm.log(lambdas[k] / mm) / dm.log(lambdas[k] / lambdas[k + 1]);
  return table[k] + (table[k + 1] - table[k]) * t;
}
const energy = (db: number) => dm.pow(10, db / 10);

/** A-weighted sound power of one vehicle, linear (W re 1e-12), at speed v km/h (eqs. 2.3.7–2.3.10). */
export function vehiclePower(vehicle: RailVehicle, speed: number, rail: keyof typeof RAIL_ROUGHNESS = 'M'): number {
  const v = Math.max(50, speed) / 3.6, axles = 10 * dm.log10(vehicle.axles);
  const wheelLambdas = WAVELENGTHS.slice(3);
  let total = 0;
  FREQUENCIES.forEach((f, i) => {
    const mm = v / f * 1000;
    const roughness = 10 * dm.log10(energy(atWavelength(RAIL_ROUGHNESS[rail], WAVELENGTHS, mm))
      + energy(atWavelength(WHEEL_ROUGHNESS[vehicle.brake], wheelLambdas, mm))) + atWavelength(CONTACT_FILTER[vehicle.load], WAVELENGTHS, mm);
    let band = energy(roughness + TRACK_TRANSFER_MM[i] + axles) + energy(roughness + VEHICLE_TRANSFER_920[i] + axles);
    if (vehicle.superstructure) band += energy(roughness + SUPERSTRUCTURE_TRANSFER + axles);
    if (vehicle.traction) band += energy(TRACTION[vehicle.traction].A[i]) + energy(TRACTION[vehicle.traction].B[i]);
    total += band * energy(A_WEIGHTING[i]);
  });
  return total;
}

export interface RailTrafficGroup { train: RailTrainType; speed: number; day: number; night: number }
/** Integral of the dipole directivity 0.01 + 0.99·sin²φ along an infinite line, relative to omni. */
const LINE_DIPOLE = 0.01 + 0.99 / 2;
/** Hard ground: the specular reflection doubles the energy (+3 dB). */
const HARD_GROUND = 2;

/** Day (16 h) and night (8 h) sound power per metre (eqs. 2.3.1–2.3.2), linear: trains of each group
 * per period → vehicles per hour Q, LW' = LW,0 + 10·lg(Q / 1000 v). */
export function railLinePower(groups: readonly RailTrafficGroup[], rail: keyof typeof RAIL_ROUGHNESS = 'M') {
  let day = 0, night = 0;
  for (const g of groups) {
    const perTrain = g.train.vehicles.reduce((sum, v) => sum + vehiclePower(v, g.speed, rail), 0) / (1000 * g.speed);
    day += perTrain * g.day / 16; night += perTrain * g.night / 8;
  }
  return { day, night };
}

/** Receiver level at slant distance r from an infinite line of power W' per metre: W'/(4r) for spherical
 * spreading, × directivity × ground reflection. Returned as a NoiseModel: level = dayDb − loss(r). */
export function createRailNoiseModel(groups: readonly RailTrafficGroup[], limits = RAILWAY_EVIDENCE.newLineNoise): NoiseModel {
  const p = railLinePower(groups), k = LINE_DIPOLE * HARD_GROUND / 4;
  const dayDb = p.day > 0 ? 10 * dm.log10(p.day * k) : -Infinity, nightDb = p.night > 0 ? 10 * dm.log10(p.night * k) : -Infinity;
  const excessDb = Math.max(dayDb - limits.dayDb, nightDb - limits.nightDb);
  const loss = (slant: number) => 10 * dm.log10(Math.max(1, slant));
  const radius = Number.isFinite(excessDb) && excessDb > 0 ? dm.pow(10, excessDb / 10) : 0;
  return { dayDb, nightDb, excessDb, controlling: dayDb - limits.dayDb >= nightDb - limits.nightDb ? 'day' : 'night',
    radius, contour: radius, loss, limits: { ...limits } };
}

/** PROVISIONAL game prior for a new double-track mainline, NOT a forecast or a sourced Czech count
 * (none found, research/35): by day 2 passenger trains per hour each way and 1 freight per hour each
 * way; by night 1 passenger and 1 freight per hour each way. */
export const RAIL_TRAFFIC_PRIOR = { passengerDay: 64, passengerNight: 16, freightDay: 32, freightNight: 16 } as const;
