import { describe, expect, it } from 'vitest';
import { autoProfile } from '../src/core/autoprofile';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluate, type Design } from '../src/core/evaluate';
import { adoptFull, setPreviewWindows } from '../src/core/preview-window';
import { syntheticTerrain } from '../src/core/terrain';
import { buildProfile, elevations } from '../src/core/vertical';

// A 24 km route over rolling ground: long enough for a window to be a small part of it.
const terrain = syntheticTerrain(5000, 300, 5, (x, y) => 300 + 25 * Math.sin(x / 700) + 10 * Math.sin(x / 230 + y / 400));
const ctx = { terrain, scenario: { ...D11_SCENARIO, maxTravelMin: 60 }, a: { x: 200, y: 750 }, b: { x: 24_600, y: 750 } };
const base: Design = { category: 'S9.5', speed: 90, profileMode: 'auto', vpis: [],
  pis: [3000, 6000, 9000, 12000, 15000, 18000, 21000].map((x, k) => ({ x, y: k % 2 ? 900 : 600, r: null })) };
const moved = (dx: number): Design => ({ ...base, pis: base.pis.map((p, k) => k === 3 ? { ...p, x: p.x + dx, y: p.y + 15 } : p) });

describe('windowed drag preview', () => {
  it('re-solves only around the edit and keeps the full result elsewhere', () => {
    const full = evaluate(ctx, base);
    const d = moved(40);
    const preview = evaluate(ctx, d, { preview: true, materialValue: full.quantities.materialValue });
    const window = preview.timing['window.length'];
    expect(window).toBeGreaterThan(0);
    expect(window).toBeLessThan(0.6 * preview.length);
    // Same stations as a whole-route preview of the same design.
    setPreviewWindows(false);
    const plain = evaluate(ctx, d, { preview: true, materialValue: full.quantities.materialValue });
    setPreviewWindows(true);
    expect(preview.n).toBe(plain.n);
    expect(preview.length).toBe(plain.length);
    // Well before the moved plan (bend 4's neighbours start after km 8) the grade line is the full result's.
    const fullProfile = buildProfile(full.vpis, 15_000, 10_000), before = preview.s.filter(s => s < 5000);
    const z = elevations(fullProfile, before);
    // (the vertical-curve radii only matter near VPIs; compare on the stitched line's own profile)
    const zp = elevations(buildProfile(preview.vpis, 15_000, 10_000), before);
    for (let i = 0; i < before.length; i++) expect(zp[i]).toBeCloseTo(z[i], 6);
    expect(preview.preview).toBe(true);
    expect(preview.lineage).toBeUndefined();
    // Bill: window cells re-priced, the others carried over; within the preview's usual approximation.
    const fresh = evaluate(ctx, d);
    expect(Math.abs(preview.cost.total / fresh.cost.total - 1)).toBeLessThan(0.2);
  });

  it('falls back to the whole-route preview without a full result of the same kind', () => {
    const other: Design = { ...moved(25), speed: 80 };
    const preview = evaluate(ctx, other, { preview: true });
    expect(preview.timing['window.length']).toBeUndefined();
  });

  it('accepts a full result evaluated elsewhere (the full worker)', () => {
    const full = evaluate(ctx, base);
    const copy = structuredClone(full);
    const fresh = syntheticTerrain(5000, 300, 5, (x, y) => 300 + 25 * Math.sin(x / 700) + 10 * Math.sin(x / 230 + y / 400));
    const there = { ...ctx, terrain: fresh };
    expect(evaluate(there, moved(30), { preview: true }).timing['window.length']).toBeUndefined();
    adoptFull(fresh, copy);
    expect(evaluate(there, moved(30), { preview: true }).timing['window.length']).toBeGreaterThan(0);
  });
});

describe('auto-profile end grades', () => {
  it('continues a given grade at both ends within one vertical curve', () => {
    const n = 501, s = Float64Array.from({ length: n }, (_, i) => i * 10), g = Float64Array.from(s, v => 100 + 15 * Math.sin(v / 600));
    const opts = { maxGradient: 0.05, minCrest: 10_000, minSag: 5_000, costPerM: (h: number) => h * h * 100,
      endpointElevations: { a: 100, b: 100 }, endpointGrades: { a: 0.03, b: 0.03 } };
    const r = autoProfile(s, g, opts);
    const p = buildProfile(r.vpis, 10_000, 5_000), D = 5000 / Math.round(5000 / 250);
    expect(r.feasible).toBe(true);
    expect(Math.abs(p.grades[0] - 0.03)).toBeLessThanOrEqual(D / 10_000 + 2 / D);
    expect(Math.abs(p.grades[p.grades.length - 1] - 0.03)).toBeLessThanOrEqual(D / 5_000 + 2 / D);
  });
});
