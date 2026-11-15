import { describe, expect, it } from 'vitest';
import { followSource, freeSpan } from '../src/ui/source-editor';

// A hairpin: out 1000 m east along y=0, back west along y=40. Both legs pass within 40 m of each other.
const xy: number[] = [], stations: number[] = [];
for (let i = 0; i <= 10; i++) { xy.push(i * 100, 0); stations.push(i * 100); }
for (let i = 0; i <= 10; i++) { xy.push(1000 - i * 100, 40); stations.push(1040 + i * 100); }
const hairpin = { xy, stations };

describe('base-road Change road handles', () => {
  it('follow the road continuously instead of jumping to the other leg of a hairpin', () => {
    // pointer just above the outbound leg near x=300, but closer to the return leg (y=40) than to y=0
    expect(followSource(hairpin, { lo: 0, hi: 2040 }, 300, 25, 250)).toBeCloseTo(300, 5);
    // a long pointer move still follows the leg the handle is on, across several search windows
    expect(followSource(hairpin, { lo: 0, hi: 2040 }, 950, 10, 100)).toBeCloseTo(950, 5);
    // the return leg is reachable by dragging along the road around the bend
    expect(followSource(hairpin, { lo: 0, hi: 2040 }, 700, 40, 1100)).toBeCloseTo(1340, 5);
  });

  it('never extend into a stretch another project road already claims', () => {
    const claim = { transportData: 't', sourceId: 'way', s0: 500, s1: 800 };
    expect(freeSpan([claim], 't', 'way', 200, 2040)).toEqual({ lo: 0, hi: 500 });
    expect(freeSpan([claim], 't', 'way', 900, 2040)).toEqual({ lo: 800, hi: 2040 });
    expect(freeSpan([claim], 't', 'way', 600, 2040)).toBeNull();
    expect(freeSpan([claim], 't', 'other', 600, 2040)).toEqual({ lo: 0, hi: 2040 });
    expect(followSource(hairpin, { lo: 0, hi: 500 }, 700, 0, 450)).toBe(500);
  });
});
