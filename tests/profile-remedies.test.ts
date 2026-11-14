import { describe, expect, it } from 'vitest';
import { liftAutoProfile } from '../src/core/profile-remedies';
import { buildProfile, elevations, type VPI } from '../src/core/vertical';
import { speedNorms } from '../src/core/data/norms';
import { ROAD_CHECKS } from '../src/core/checks';

describe('local automatic bridge clearance refinement', () => {
  const vpis: VPI[] = [0, 500, 1000, 1500, 2000].map(s => ({ s, z: 100, r: null }));
  it('raises the useful neighbourhood while preserving endpoints and every vertical norm', () => {
    const before = structuredClone(vpis), requirements = [{ s: 950, z: 103 }, { s: 1050, z: 103.5 }];
    const result = liftAutoProfile(vpis, requirements, 80, 0.06)!;
    expect(result).toBeDefined(); expect(vpis).toEqual(before);
    expect(result[0]).toEqual(vpis[0]); expect(result.at(-1)).toEqual(vpis.at(-1));
    const norms = speedNorms(80), profile = buildProfile(result, norms.minCrestRadius, norms.minSagRadius);
    expect(ROAD_CHECKS.vertical(profile, norms, 0.06)).toEqual([]);
    const z = elevations(profile, requirements.map(p => p.s));
    expect(requirements.every((p, i) => z[i] >= p.z)).toBe(true);
  });
  it('does not silently move a fixed grade pin or violate the gradient at a fixed endpoint', () => {
    expect(liftAutoProfile(vpis, [{ s: 1000, z: 104 }], 80, 0.06, [{ s: 1000, z: 100 }])).toBeUndefined();
    expect(liftAutoProfile(vpis, [{ s: 50, z: 110 }], 80, 0.06)).toBeUndefined();
  });
});
