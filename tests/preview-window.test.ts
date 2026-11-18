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

  it('a drag on the road between two bends (a bend added) is a window on the full result before it', () => {
    const full = evaluate(ctx, base);
    const d: Design = { ...base, pis: [...base.pis.slice(0, 4), { x: 13_500, y: 820, r: null }, ...base.pis.slice(4)] };
    const preview = evaluate(ctx, d, { preview: true, materialValue: full.quantities.materialValue });
    expect(preview.timing['window.length']).toBeGreaterThan(0);
    expect(preview.timing['window.length']).toBeLessThan(0.6 * preview.length);
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
      endpointElevations: { a: 100, b: 100 }, startGrade: 0.03, endGrade: 0.03 };
    const r = autoProfile(s, g, opts);
    const p = buildProfile(r.vpis, 10_000, 5_000), D = 5000 / Math.round(5000 / 250);
    expect(r.feasible).toBe(true);
    expect(Math.abs(p.grades[0] - 0.03)).toBeLessThanOrEqual(D / 10_000 + 2 / D);
    expect(Math.abs(p.grades[p.grades.length - 1] - 0.03)).toBeLessThanOrEqual(D / 5_000 + 2 / D);
  });
});

describe('windowed preview keeps the design’s own controls (review repros)', () => {
  const flat = syntheticTerrain(2500, 160, 10, () => 300);
  const fctx = { terrain: flat, scenario: { ...D11_SCENARIO, maxTravelMin: 60 }, a: { x: 200, y: 750 }, b: { x: 24_600, y: 750 } };
  it('By hand: the preview’s height points are the design’s, its line the whole-route preview’s', () => {
    const manual: Design = { category: 'S9.5', speed: 90, profileMode: 'manual', pis: [],
      vpis: [{ s: 0, z: 300, r: null }, { s: 12_000, z: 300, r: null }, { s: 24_400, z: 300, r: null }] };
    evaluate(fctx, manual);
    const edited = { ...manual, vpis: manual.vpis.map((p, i) => i === 1 ? { ...p, z: 320 } : p) };
    const preview = evaluate(fctx, edited, { preview: true });
    setPreviewWindows(false); const plain = evaluate(fctx, edited, { preview: true }); setPreviewWindows(true);
    expect(preview.vpis.map(v => v.s)).toEqual(plain.vpis.map(v => v.s));
    for (const i of [300, 600, 1200, 1800]) expect(preview.grade[i]).toBeCloseTo(plain.grade[i], 6);
  });
  it('a painted structure keeps its chainage in the window', () => {
    const painted: Design = { category: 'S9.5', speed: 90, profileMode: 'auto', vpis: [],
      pis: [3000, 6000, 9000, 12000, 15000, 18000, 21000].map((x, k) => ({ x, y: k % 2 ? 900 : 600, r: null })),
      structureOverrides: [{ s0: 11_800, s1: 12_200, kind: 1 }] };
    evaluate(fctx, painted);
    const pinned = { ...painted, gradePins: [{ s: 12_000, z: 310 }] };
    const preview = evaluate(fctx, pinned, { preview: true });
    expect(preview.timing['window.length']).toBeGreaterThan(0);
    setPreviewWindows(false); const plain = evaluate(fctx, pinned, { preview: true }); setPreviewWindows(true);
    const bridgeAt = (r: typeof plain) => r.runs.filter(run => run.kind === 1).map(run => [Math.round(run.s0 / 50), Math.round(run.s1 / 50)]);
    expect(bridgeAt(preview)).toEqual(bridgeAt(plain));
  });
  it('a plan problem is reported once, where it is', () => {
    const tight: Design = { category: 'S9.5', speed: 90, profileMode: 'auto', vpis: [],
      pis: [3000, 6000, 9000, 12000, 15000, 18000, 21000].map((x, k) => ({ x, y: k % 2 ? 900 : 600, r: k === 0 ? 50 : null })) };
    const full = evaluate(fctx, tight);
    const preview = evaluate(fctx, { ...tight, gradePins: [{ s: 12_000, z: 310 }] }, { preview: true });
    expect(preview.timing['window.length']).toBeGreaterThan(0);
    const radius = (r: typeof full) => r.violations.filter(v => v.kind === 'radius').map(v => Math.round(v.s0));
    expect(radius(preview)).toEqual(radius(full));
  });
});
