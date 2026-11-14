import { describe, expect, it } from 'vitest';
import { createNoiseModel, noiseDistance, noiseLevels, noiseSource, propagationLoss, vehicleEmission } from '../src/core/road-noise';

describe('Czech road-traffic source and propagation', () => {
  it('conserves category/time energy and gives +3.01 dB for doubled traffic', () => {
    const s = noiseSource(9000, 90), twice = noiseSource(18000, 90);
    expect(twice.dayDb - s.dayDb).toBeCloseTo(10 * Math.log10(2), 10);
    expect(twice.nightDb - s.nightDb).toBeCloseTo(10 * Math.log10(2), 10);
    const energy = (16 * 10 ** ((s.dayDb + 10.1) / 10) + 8 * 10 ** ((s.nightDb + 10.1) / 10));
    expect(energy).toBeCloseTo(7650 * vehicleEmission(90, false) + 1350 * vehicleEmission(80, true), 3);
    // Independent worked example in research/11, using the manual's equations, not a fitted contour.
    expect(s.dayDb).toBeCloseTo(66.38904, 4);
    expect(s.nightDb).toBeCloseTo(60.79260, 4);
  });

  it('selects either statutory period and accepts measured category-specific night splits', () => {
    const normal = createNoiseModel(9000, 90);
    expect(noiseLevels(30, 4.5, normal).controlling).toBe('night');
    const dayOnly = createNoiseModel(9000, 90, { lightNightShare: 0, heavyNightShare: 0 });
    expect(noiseLevels(30, 4.5, dayOnly).controlling).toBe('day');
    expect(noiseLevels(30, 4.5, dayOnly).nightDb).toBe(-Infinity);
    const silent = createNoiseModel(0, 90);
    expect(silent.contour).toBe(0);
    expect(noiseLevels(1, 1.5, silent).excessDb).toBe(-Infinity);
  });

  it('solves the level contour rather than scaling an assumed distance', () => {
    const model = createNoiseModel(9000, 90);
    expect(noiseLevels(model.contour, 1.5, model).nightDb).toBeCloseTo(50, 8);
    expect(noiseLevels(model.contour - 1, 1.5, model).excessDb).toBeGreaterThan(0);
    expect(noiseLevels(model.contour + 1, 1.5, model).excessDb).toBeLessThan(0);
    expect(noiseDistance(9000, 80)).toBeLessThan(model.contour);
    expect(noiseDistance(18000, 90)).toBeGreaterThan(model.contour);
    expect(createNoiseModel(9000, 90, { heavyShare: 0.25 }).contour).toBeGreaterThan(model.contour);
    // Upper floors lose ground absorption: the low contour must NOT be the spatial-query bound.
    expect(noiseLevels(model.contour + 20, 10.5, model).excessDb).toBeGreaterThan(0);
    expect(model.radius).toBeGreaterThan(model.contour + 20);
    // At low traffic a hard-ground crossing can exist without any low mixed-ground exposure.
    const quiet = createNoiseModel(375, 90);
    expect(quiet.radius).toBeGreaterThan(0);
    expect(noiseLevels(1.75, 1.5, quiet).excessDb).toBeLessThan(0);
    expect(quiet.contour).toBe(0);
  });

  it('tabulates the empirical mixed-ground model accurately across height and near-distance transitions', () => {
    const model = createNoiseModel(9000, 90);
    for (const h of [1.5, 2.23, 4.5, 4.99, 5, 5.01, 7.31, 9.99, 10, 25]) {
      for (const r of [1, 3.75, 7.9, 8, 8.1, 20.23, 47.3, 80, 99, 1000, 1100]) {
        expect(Math.abs(model.loss(r, h) - propagationLoss(r, h))).toBeLessThan(0.035);
      }
    }
    // Manual worked propagation values: Uo(100)=11.0384; Up(100,1.5)=18.5892 dB.
    expect(propagationLoss(100, 10)).toBeCloseTo(11.0384, 3);
    expect(propagationLoss(100, 1.5)).toBeCloseTo(18.5892, 3);
    expect(propagationLoss(200, 1.5)).toBeGreaterThan(propagationLoss(100, 1.5));
    expect(propagationLoss(100, 1.5)).toBeGreaterThan(propagationLoss(100, 10));
  });
});
