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
  it('never squeezes a rounding beside the end of the stretch it may move (owner: two height points 6 m apart)', () => {
    // a dip 30 m before the free stretch: lifting inside it turns the line at its end, next to the dip
    const line: VPI[] = [{ s: 0, z: 120 }, { s: 1970, z: 100.3 }, { s: 2300, z: 103.6 }, { s: 6000, z: 103.6 }].map(p => ({ ...p, r: null }));
    const norms = speedNorms(80), squeezed = (v: VPI[]) => ROAD_CHECKS.vertical(buildProfile(v, norms.minCrestRadius, norms.minSagRadius), norms, 0.06).filter(x => x.kind === 'vcOverlap');
    expect(squeezed(line)).toEqual([]);
    const lifted = liftAutoProfile(line, [{ s: 2300, z: 106.6 }], 80, 0.06, [], undefined, undefined, [2200, 2400], [2000, 4000]);
    if (lifted) expect(squeezed(lifted)).toEqual([]);
  });
});
