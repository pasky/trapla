import { describe, expect, it } from 'vitest';
import { equilibriumCantMm, provisionalConventionalCantPolicy, provisionalLinearCantRampMetres,
  railCantEnvelope, railEquivalentExposure, railwayNoiseLimits, railwaySourceCompatibility } from '../src/core/railway-policy';
import { trackAssemblyQuantities, uncantedBallastSection } from '../src/core/rail-trackbed';
import type { RailwaySpec } from '../src/core/project';
import type { TransportSource } from '../src/core/project-transport';

// No existing test exercises railway operating physics: road/rail tests cover crossing protections only.
describe('railway-specific operating envelopes', () => {
  it('can reject a passenger-speed cant that overloads slower freight instead of using only maximum speed', () => {
    const policy = provisionalConventionalCantPolicy(600, 120, 12);
    const passenger = { speed: 120, day: 50, night: 4 }, freight = { speed: 40, day: 12, night: 20 };
    expect(railCantEnvelope(600, [passenger], policy).feasible).toBe(false); // no ordinary cant can meet this radius
    const fastOnly = railCantEnvelope(1000, [passenger], policy);
    expect(fastOnly.feasible).toBe(true);
    const mixed = railCantEnvelope(1000, [passenger, freight], policy);
    expect(mixed.maximumMm).toBeLessThan(fastOnly.maximumMm);
    expect(railCantEnvelope(800, [passenger, freight], policy).feasible).toBe(false);
    // A nonexistent train class does not constrain the selected cant.
    expect(railCantEnvelope(1000, [passenger, { ...freight, day: 0, night: 0 }], policy)).toEqual(fastOnly);
    expect(() => railCantEnvelope(1000, [{ ...passenger, day: 0, night: 0 }], policy)).toThrow(/empty/);
  });

  it('responds physically to speed/radius, load and small-radius cant limits', () => {
    expect(equilibriumCantMm(120, 1000)).toBeCloseTo(4 * equilibriumCantMm(60, 1000), 9);
    expect(equilibriumCantMm(120, 2000)).toBeCloseTo(equilibriumCantMm(120, 1000) / 2, 9);
    expect(provisionalConventionalCantPolicy(1000, 120, 30).maxCantMm).toBeLessThan(provisionalConventionalCantPolicy(1000, 120, 10).maxCantMm);
    expect(provisionalConventionalCantPolicy(200, 80, 10).maxCantMm).toBeLessThan(provisionalConventionalCantPolicy(300, 80, 10).maxCantMm);
    expect(provisionalConventionalCantPolicy(Infinity, 120, 10).maxCantMm).toBe(0);
    expect(() => provisionalConventionalCantPolicy(1000, 200, 10)).toThrow(/160/);
    expect(provisionalLinearCantRampMetres(-100, 120)).toBe(provisionalLinearCantRampMetres(100, 120));
    expect(provisionalLinearCantRampMetres(100, 120)).toBe(2 * provisionalLinearCantRampMetres(100, 60));
  });

  it('integrates externally supplied train SEL, not road emissions, and leaves relocation law unresolved', () => {
    const one = railEquivalentExposure([{ dayTrains: 1, nightTrains: 1, selDb: 100 }]);
    expect(one.nightDb! - one.dayDb!).toBeCloseTo(10 * Math.log10(2), 9);
    const two = railEquivalentExposure([{ dayTrains: 2, nightTrains: 2, selDb: 100 }]);
    expect(two.dayEnergy).toBe(2 * one.dayEnergy);
    expect(railEquivalentExposure([{ dayTrains: 1, nightTrains: 0, selDb: 100 }]).nightDb).toBeNull();
    expect(() => railEquivalentExposure([])).toThrow(/required/);
    expect(railwayNoiseLimits('relocation-unresolved')).toBeNull();
    expect(railwayNoiseLimits('new-line')).not.toBeNull();
  });
});

describe('physical track assembly and source preservation', () => {
  it('places ballast toes on the actual sloping formation with enough depth under both rails', () => {
    // Synthetic top profile/path requirement, not assumed universal SŽ S4 values.
    const input = { sleeperDepthM: 0.2, railBearingOffsetM: 0.75, formationCrossfall: 0.04, extraDepthM: 0,
      minimumMaintenancePathM: 0.4, topProfile: [{ offset: -1.7, z: 0 }, { offset: 0, z: -0.05 }, { offset: 1.7, z: 0 }] };
    const section = uncantedBallastSection(input);
    const [a, b] = section.formation;
    const ground = (u: number) => a.z + (b.z - a.z) * (u - a.offset) / (b.offset - a.offset);
    for (const toe of [section.polygon[0], section.polygon[section.polygon.length - 1]]) expect(toe.z).toBeCloseTo(ground(toe.offset), 9);
    for (const u of [-input.railBearingOffsetM, input.railBearingOffsetM]) expect(-input.sleeperDepthM - ground(u)).toBeGreaterThanOrEqual(0.35 - 1e-10);
    expect(section.polygon[0].offset).not.toBe(-section.polygon[section.polygon.length - 1].offset);
    expect(section.fitsFormation).toBe(true);
    expect(uncantedBallastSection({ ...input, minimumMaintenancePathM: 0.8 }).fitsFormation).toBe(false);
    expect(uncantedBallastSection({ ...input, sleeperDepthM: 1 }).fitsFormation).toBe(false);
    const envelope = uncantedBallastSection({ ...input, topProfile: [{ offset: -1.7, z: 0 }, { offset: 1.7, z: 0 }] });
    expect(envelope.grossAreaM2 - section.grossAreaM2).toBeCloseTo(3.4 * 0.05 / 2, 9);
  });

  it('keeps rail, sleeper and ballast quantities unchanged when editor ownership is split', () => {
    // Explicit synthetic component dimensions exercise quantity maths; these are not adopted data values.
    const ballast = uncantedBallastSection({ sleeperDepthM: 0.2, railBearingOffsetM: 0.75, formationCrossfall: 0, extraDepthM: 0,
      minimumMaintenancePathM: 0.4, topProfile: [{ offset: -1.7, z: 0 }, { offset: 1.7, z: 0 }] });
    const input = { ballastAreaM2: ballast.grossAreaM2, sleeperPitchM: 0.6, sleeperEmbeddedM3: 0.1, sleeperAlongTrackM: 0.25, railKgPerM: 60, sleeperPhaseM: 0.2 };
    const whole = trackAssemblyQuantities(0, 1000, input);
    const a = trackAssemblyQuantities(0, 431.6, input), b = trackAssemblyQuantities(431.6, 1000, input);
    for (const key of Object.keys(whole) as (keyof typeof whole)[]) expect(a[key] + b[key]).toBeCloseTo(whole[key], 8);
    expect(whole.railMetres).toBe(2 * whole.trackMetres);
    expect(whole.ballastM3).toBeLessThan(ballast.grossAreaM2 * whole.trackMetres);
    const breaks = [0, 0.2, 0.201, 1000];
    const pieces = breaks.slice(1).map((s, i) => trackAssemblyQuantities(breaks[i], s, input));
    expect(pieces.every(p => p.ballastM3 >= 0)).toBe(true);
    for (const key of Object.keys(whole) as (keyof typeof whole)[]) expect(pieces.reduce((sum, p) => sum + p[key], 0)).toBeCloseTo(whole[key], 8);
  });

  it('assigns an exact sleeper boundary to the following half-open interval despite decimal roundoff', () => {
    const input = { ballastAreaM2: 2, sleeperPitchM: 0.6, sleeperEmbeddedM3: 0.1, sleeperAlongTrackM: 0.25, railKgPerM: 60, sleeperPhaseM: 0.2 };
    expect(trackAssemblyQuantities(0, 0.8, input).sleepers).toBe(1);
    expect(trackAssemblyQuantities(0.8, 0.81, input).sleepers).toBe(1);
    expect(trackAssemblyQuantities(0, input.sleeperPhaseM + input.sleeperPitchM, input).sleepers).toBe(1);
    // A physically displaced boundary outside the roundoff window must not get snapped.
    expect(trackAssemblyQuantities(0, 0.8 - 1e-10, input).sleepers).toBe(1);
    expect(trackAssemblyQuantities(0, 0.8 + 1e-10, input).sleepers).toBe(2);
  });

  it('never silently removes electrification, neighbours or ambiguity on an imported line', () => {
    const source: TransportSource = { id: 'track-a', osmWayId: '123', kind: 'railway', nodes: ['a', 'b'], xy: [0, 0, 100, 0], stations: [0, 100],
      layer: 0, bridge: false, tunnel: false, elevation: 'terrain', render: [], parallelSourceIds: ['track-b'],
      tags: { railway: 'rail', gauge: '1435', tracks: '1', electrified: 'contact_line', voltage: '25000', frequency: '50' } };
    const spec: RailwaySpec = { kind: 'railway', policy: 'test', designSpeed: 120, gaugeMm: 1435, tracks: 1, electrification: 'AC25kV',
      operations: { passengerDay: 50, passengerNight: 4, freightDay: 12, freightNight: 20, passengerSpeed: 120, freightSpeed: 80 } };
    expect(railwaySourceCompatibility(source, spec)).toEqual({ compatible: true, unresolved: [], incompatible: [], preservedNeighbourIds: ['track-b'] });
    expect(railwaySourceCompatibility(source, { ...spec, electrification: 'none' }).compatible).toBe(false);
    expect(railwaySourceCompatibility({ ...source, tags: { railway: 'rail' } }, spec).unresolved).toEqual(['gauge', 'electrification', 'track-count']);
    expect(railwaySourceCompatibility({ ...source, tags: { ...source.tags, tracks: '2' } }, spec).incompatible).toContain('track-count-change');
    expect(source.parallelSourceIds).toEqual(['track-b']);
  });
});
