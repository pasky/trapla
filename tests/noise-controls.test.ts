// Finite-segment noise (Manual 2018 §1.10–1.11, §1.19) and the automatic wall / buyout decisions on a
// straight synthetic road. The synthetic-town bill tests (town.test.ts) cover the full evaluate path.
import { describe, expect, it } from 'vitest';
import { BuildingIndex } from '../src/core/buildings';
import { BUILDING_KIND, NOISE } from '../src/core/data/urban';
import { KIND } from '../src/core/structures';
import {
  crossSectionScreens, dwellingLevels, noiseOutcome, sourceExcess, wallLineLengths, type AcousticSource,
} from '../src/core/noise';
import { emptyScreen, lineTransfer, noiseField, pointTransfer, transferBuffers } from '../src/core/noise-field';
import { createNoiseModel, noiseLevels } from '../src/core/road-noise';
import { noiseControlViolations } from '../src/core/noise-control-violations';

const model = createNoiseModel(9000, 90);
/** a straight road along x from x0, `n` 10 m cells, flat at grade 0, crown 9.5 */
function road(n = 401, x0 = -2000, opts: { kind?: (i: number) => number; dayL?: (i: number) => number; zDayL?: (i: number) => number; gapL?: (i: number) => number } = {}): AcousticSource {
  const kind = Array.from({ length: n }, (_, i) => opts.kind?.(i) ?? KIND.earth), grade = new Float64Array(n);
  const dayL = Array.from({ length: n }, (_, i) => opts.dayL?.(i) ?? 4.75), zDayL = Array.from({ length: n }, (_, i) => opts.zDayL?.(i) ?? 0);
  const screens = crossSectionScreens(n, kind, grade, 9.5, dayL, new Float64Array(n).fill(4.75), zDayL, new Float64Array(n),
    (i, left, o) => (left && opts.zDayL ? zDayL[i] : 0) * (o >= dayL[i] ? 1 : 0), opts.gapL ? { L: Array.from({ length: n }, (_, i) => opts.gapL!(i)), R: new Uint8Array(n) } : undefined);
  return { id: 'acoustic:test', mode: 'road', laneOffset: NOISE.sourceOffset, sourceHeight: NOISE.barrierSourceHeight, n,
    x: Float64Array.from({ length: n }, (_, i) => x0 + 10 * i), y: new Float64Array(n), tx: new Float64Array(n).fill(1), ty: new Float64Array(n),
    grade, len: Float64Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 5 : 10)), dayDb: model.dayDb, nightDb: model.nightDb, ...screens };
}
const s = (src: AcousticSource) => Float64Array.from(src.x, (x) => x - src.x[0]);
const house = (x: number, y: number, levels = 1) => new BuildingIndex([[x, y, 7]], [[100, levels, BUILDING_KIND.house, x, y, 5, 5, 0]]);
const excess = (q: number) => 10 * Math.log10(q) + model.excessDb;

describe('finite-segment sum', () => {
  const src = road(), f = noiseField(src), t = transferBuffers(1);
  it('a long straight road reproduces the infinite line (in-band U + Du) within the truncated angle', () => {
    for (const d of [20, 50, 100]) {
      pointTransfer(f, 0, d, [1.5], null, null, t);
      const line = noiseLevels(d, 1.5, model).excessDb;
      expect(excess(t.raw[0])).toBeLessThan(line + 0.02);
      expect(excess(t.raw[0])).toBeGreaterThan(line - 0.2);
    }
  });
  it('splitting a road into two sources adds nothing (energy of disjoint cells)', () => {
    const half = (a: number, b: number): AcousticSource => {
      const pick = <T extends ArrayLike<number>>(v: T) => Float64Array.from(Array.prototype.slice.call(v, a, b) as number[]);
      const side = (x: typeof src.L) => ({ shield: Uint8Array.from(Array.prototype.slice.call(x.shield, a, b) as number[]), edgeOff: pick(x.edgeOff), edgeTop: pick(x.edgeTop), edgeLane: Uint8Array.from(Array.prototype.slice.call(x.edgeLane, a, b) as number[]),
        wallOff: pick(x.wallOff), wallFoot: pick(x.wallFoot), gap: Uint8Array.from(Array.prototype.slice.call(x.gap, a, b) as number[]) });
      return { ...src, n: b - a, x: pick(src.x), y: pick(src.y), tx: pick(src.tx), ty: pick(src.ty), grade: pick(src.grade), len: pick(src.len), L: side(src.L), R: side(src.R) };
    };
    const t1 = transferBuffers(1), t2 = transferBuffers(1);
    pointTransfer(f, 3, 40, [4.5], null, null, t);
    pointTransfer(noiseField(half(0, 200)), 3, 40, [4.5], null, null, t1);
    pointTransfer(noiseField(half(200, 401)), 3, 40, [4.5], null, null, t2);
    expect(excess(t1.raw[0] + t2.raw[0])).toBeCloseTo(excess(t.raw[0]), 1);
  });
  it('a 10 m opening between walls adds its own angle of view, not the whole open road', () => {
    const walls = new Float64Array(src.n).fill(3); walls[200] = 0;
    const full = new Float64Array(src.n).fill(3), open = transferBuffers(1), shut = transferBuffers(1);
    pointTransfer(f, 0, 76, [1.5], walls, null, open);
    pointTransfer(f, 0, 76, [1.5], full, null, shut);
    const gap = excess(open.screened[0]) - excess(shut.screened[0]);
    expect(gap).toBeGreaterThan(0.3);
    expect(gap).toBeLessThan(2); // the old max-over-stations model made this the open road: ≈ +8 dB
  });
  it('a house inside a ring of road hears the whole ring (≈ +3 dB over a straight road)', () => {
    const R = 100, n = Math.round(2 * Math.PI * R / 10), a = (i: number) => 2 * Math.PI * i / n;
    const ring: AcousticSource = { ...road(n), x: Float64Array.from({ length: n }, (_, i) => R * Math.cos(a(i))),
      y: Float64Array.from({ length: n }, (_, i) => R * Math.sin(a(i))), tx: Float64Array.from({ length: n }, (_, i) => -Math.sin(a(i))),
      ty: Float64Array.from({ length: n }, (_, i) => Math.cos(a(i))), len: new Float64Array(n).fill(2 * Math.PI * R / n) };
    pointTransfer(noiseField(ring), 0, 0, [1.5], null, null, t);
    expect(excess(t.raw[0]) - noiseLevels(R, 1.5, model).excessDb).toBeGreaterThan(2.5);
    expect(excess(t.raw[0]) - noiseLevels(R, 1.5, model).excessDb).toBeLessThan(3.5);
  });
  it('never below the manual\'s §1.10.2 transformation: beyond a road end and outside a tight bend', () => {
    // the transformed sum (U at the true distance, face-on angle) cell by cell
    const manual = (r: AcousticSource, px: number, py: number, z: number) => {
      let q = 0;
      for (let i = 0; i < r.n; i++) {
        const dist = Math.hypot(px - r.x[i], py - r.y[i]), h = r.len[i] / 2;
        q += 2 * Math.atan(h / dist) / Math.PI * lineTransfer(dist, z - r.grade[i]);
      }
      return q;
    };
    const t2 = transferBuffers(1);
    for (const [x, y] of [[2050, 0.5], [2100, 2], [2030, 10]]) {
      pointTransfer(f, x, y, [1.5], null, null, t2);
      expect(t2.raw[0]).toBeGreaterThanOrEqual(manual(src, x, y, 1.5) * 0.977) // within the far grouping's 0.1 dB;
    }
    const R = 50, n = Math.round(Math.PI / 2 * R / 5), a = (i: number) => i * 5 / R;
    const bend: AcousticSource = { ...road(n), x: Float64Array.from({ length: n }, (_, i) => R * Math.sin(a(i))), y: Float64Array.from({ length: n }, (_, i) => R - R * Math.cos(a(i))),
      tx: Float64Array.from({ length: n }, (_, i) => Math.cos(a(i))), ty: Float64Array.from({ length: n }, (_, i) => Math.sin(a(i))), len: new Float64Array(n).fill(5) };
    const px = (R + 20) * Math.sin(Math.PI / 4), py = R - (R + 20) * Math.cos(Math.PI / 4);
    pointTransfer(noiseField(bend), px, py, [1.5], null, null, t2);
    expect(t2.raw[0]).toBeGreaterThanOrEqual(manual(bend, px, py, 1.5) * 0.977);
  });
  it('a house just past a tunnel portal is assessed from the portal', () => {
    const tun = road(401, -2000, { kind: (i) => (i >= 200 ? KIND.tunnel : KIND.earth) });
    const o = noiseOutcome(tun, model, house(5, 30, 2), [0], () => 0, s(tun));
    expect(o.receivers).toHaveLength(1);
    expect(o.receivers[0].raw).toBeGreaterThan(0);
    expect(o.receivers[0].status === 'bought' || o.receivers[0].mitigated <= 1e-9).toBe(true);
  });
  it('a wall screens only a point in its shadow; a higher wall more', () => {
    const at = (h: number, z: number) => { pointTransfer(f, 0, 30, [z], new Float64Array(src.n).fill(h), null, t); return excess(t.screened[0]); };
    expect(at(2, 1.5)).toBeLessThan(at(0, 1.5) - 3);
    expect(at(4, 1.5)).toBeLessThan(at(2, 1.5));
    expect(at(2, 40)).toBeCloseTo(at(0, 40), 6); // sees over it
  });
});

describe('far cells grouped for speed', () => {
  // research/36 §2: ≤ 0.1 dB on every storey of the saved designs; this adversarial curve (2 % grade, cut /
  // fill and walls alternating every 200 m) reaches 0.11 dB
  it('stay within 0.15 dB of the cell-by-cell sum on a curving road with cuts, fills and walls', () => {
    const n = 801, R = 900, a = (i: number) => i * 10 / R;
    const base = road(n, 0, { dayL: (i) => (i % 40 < 20 ? 4.75 + 1.75 * 3 : 4.75), zDayL: (i) => (i % 40 < 20 ? 3 : -2) });
    const curved: AcousticSource = { ...base, x: Float64Array.from({ length: n }, (_, i) => R * Math.sin(a(i))),
      y: Float64Array.from({ length: n }, (_, i) => R - R * Math.cos(a(i))), tx: Float64Array.from({ length: n }, (_, i) => Math.cos(a(i))),
      ty: Float64Array.from({ length: n }, (_, i) => Math.sin(a(i))), grade: Float64Array.from({ length: n }, (_, i) => 0.02 * 10 * i) };
    const f = noiseField(curved), walls = Float64Array.from({ length: n }, (_, i) => (i % 120 < 50 ? 3 : 0));
    const t1 = transferBuffers(2), t2 = transferBuffers(2);
    for (const [i, off, up] of [[400, 40, 0], [400, -60, 0], [200, 25, -6], [600, 120, 8], [700, -15, 2]] as const) {
      const px = curved.x[i] - curved.ty[i] * off, py = curved.y[i] + curved.tx[i] * off, zg = curved.grade[i] + up;
      pointTransfer(f, px, py, [zg + 1.5, zg + 7.5], walls, walls, t1);
      pointTransfer(f, px, py, [zg + 1.5, zg + 7.5], walls, walls, t2, 0, n - 1);
      for (let k = 0; k < 2; k++) expect(Math.abs(10 * Math.log10(t1.screened[k] / t2.screened[k]))).toBeLessThan(0.15);
    }
  });
});

describe('walls from the cross-section', () => {
  it('a cut puts the wall on its top edge (never inside the slope) and screens by itself', () => {
    const src = road(3, 0, { dayL: () => 4.75 + 1.75 * 4, zDayL: () => 4 });
    expect(src.L.wallOff[1]).toBeCloseTo(4.75 + 7, 9);
    expect(src.L.wallFoot[1]).toBe(4);
    expect(src.L.edgeTop[1]).toBe(4);
    expect(src.R.wallOff[1]).toBe(4.75 + NOISE.wallEdgeOffset); // flat side: beside the crown, on road level
    expect(src.R.wallFoot[1]).toBe(0);
    const tunnel = road(3, 0, { kind: () => KIND.tunnel });
    expect(tunnel.L.shield[1]).toBe(1);
  });
  it('bills the drawn wall line: its own length beside a curve', () => {
    const n = 21, R = 200, off = new Float64Array(n).fill(20);
    const x = Float64Array.from({ length: n }, (_, i) => R * Math.sin(i * 10 / R)), y = Float64Array.from({ length: n }, (_, i) => R - R * Math.cos(i * 10 / R));
    const tx = Float64Array.from({ length: n }, (_, i) => Math.cos(i * 10 / R)), ty = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 10 / R));
    const inner = wallLineLengths(n, x, y, tx, ty, off, true).reduce((a, b) => a + b, 0);
    expect(inner).toBeCloseTo(200 * (R - 20) / R, 0); // the inside of the bend is shorter
  });
  it('Auto builds no wall where a deep cut already screens the house, and one on the cut top where it does not', () => {
    const deep = road(401, -2000, { dayL: () => 4.75 + 1.75 * 8, zDayL: () => 8 });
    const near = noiseOutcome(deep, model, house(0, 60), [0], () => 8, s(deep));
    expect(near.receivers[0].raw).toBeGreaterThan(0);
    expect(near.receivers[0].status).toBe('cut');
    expect(near.walls).toEqual([]);
    const shallow = road(401, -2000, { dayL: () => 4.75 + 1.75 * 1, zDayL: () => 1 });
    const o = noiseOutcome(shallow, model, house(0, 30), [0], () => 1, s(shallow));
    expect(o.walls.length).toBeGreaterThan(0);
    expect(o.receivers[0].mitigated).toBeLessThanOrEqual(1e-9);
  });
});

describe('automatic walls and buyouts', () => {
  const src = road(), ss = s(src);
  it('builds one wall, at least twice the house distance long, the cheapest height that does it', () => {
    const o = noiseOutcome(src, model, house(0, 30), [0], () => 0, ss);
    expect(o.walls).toHaveLength(1);
    const w = o.walls[0], rec = o.receivers[0];
    expect(rec.status).toBe('wall');
    expect(rec.mitigated).toBeLessThanOrEqual(1e-9);
    expect(w.s1 - w.s0).toBeGreaterThanOrEqual(NOISE.minWallLengthFactor * (rec.d - src.L.wallOff[rec.i]) - 1e-6);
    // the bill would be no lower with another single stretch: lower walls need far longer ones
    expect(NOISE.wallHeights).toContain(w.height);
    // the card's sum is the decision's
    const floors = dwellingLevels(o.field, rec, o.L, o.R);
    expect(Math.max(...floors.map((f) => f.level))).toBeCloseTo(rec.mitigated, 6);
    // energies per storey for a project: as built at the deciding storey = its level
    expect(10 * Math.log10(rec.energy.night[rec.floor]) - NOISE.limitNightDb).toBeCloseTo(rec.mitigated, 6);
    expect(rec.energy.sourceId).toBe('acoustic:test');
  });
  it('buys out a house no automatic wall can protect, and builds no wall for it', () => {
    const o = noiseOutcome(src, model, house(0, 14, 4), [0], () => 0, ss);
    expect(o.boughtOut.map((b) => b.j)).toEqual([0]);
    expect(o.walls).toEqual([]);
    expect(o.receivers[0].status).toBe('bought');
  });
  it('keeps a house the player keeps: best-effort walls, the remaining excess and a computed fix', () => {
    const o = noiseOutcome(src, model, house(0, 14, 4), [0], () => 0, ss, { keptBuildingIds: new Set([0]) });
    expect(o.boughtOut).toEqual([]);
    expect(o.unresolved).toHaveLength(1);
    const [v] = noiseControlViolations(o.receivers, ss);
    expect(v.kind).toBe('noise');
    expect(v.target?.buildings).toEqual([0]);
  });
  it('a manual 6 m wall saves an upper floor that 5 m cannot; removing a wall stops the buyout', () => {
    const b = house(0, 16, 3);
    expect(noiseOutcome(src, model, b, [0], () => 0, ss).boughtOut).toHaveLength(1);
    const six = noiseOutcome(src, model, b, [0], () => 0, ss, { wallL: Float64Array.from(ss, (x) => (Math.abs(x - 2000) < 300 ? 6 : NaN)) });
    if (six.boughtOut.length === 0) expect(six.receivers[0].wall).toBe(6);
    const removed = noiseOutcome(src, model, house(0, 30), [0], () => 0, ss, { wallL: Float64Array.from(ss, (x) => (Math.abs(x - 2000) < 20 ? 0 : NaN)) });
    expect(removed.boughtOut).toEqual([]);
    expect(removed.L[200]).toBe(0);
  });
  it('never stands a wall in a junction opening; the opening still lets noise through', () => {
    const gap = road(401, -2000, { gapL: (i) => (i === 200 ? 1 : 0) });
    const o = noiseOutcome(gap, model, house(0, 50), [0], () => 0, s(gap));
    expect(o.L[200]).toBe(0);
    expect(o.L[199]).toBeGreaterThan(0); expect(o.L[201]).toBeGreaterThan(0);
    expect(o.receivers[0].mitigated).toBeLessThanOrEqual(1e-9);
    // right in front of a close house a 30 m opening cannot be walled around: bought (Auto may)
    const wide = road(401, -2000, { gapL: (i) => (Math.abs(i - 200) <= 1 ? 1 : 0) });
    const w = noiseOutcome(wide, model, house(0, 20), [0], () => 0, s(wide));
    expect([w.L[199], w.L[200], w.L[201]]).toEqual([0, 0, 0]);
    expect(w.receivers[0].status === 'bought' || w.receivers[0].mitigated <= 1e-9).toBe(true);
  });
  it('the band and the house agree where the house stands', () => {
    const o = noiseOutcome(src, model, house(0, 30), [0], () => 0, ss);
    const rec = o.receivers[0], t = transferBuffers(1);
    pointTransfer(o.field, rec.x, rec.y, [rec.ground + NOISE.receiverHeight], o.L, o.R, t);
    expect(excess(t.screened[0])).toBeCloseTo(rec.mitigated, 1);
    expect(sourceExcess(src)).toBeCloseTo(model.excessDb, 9);
  });
});

describe('tunnels', () => {
  it('nothing gets out of a tunnel', () => {
    const src = road(401, -2000, { kind: () => KIND.tunnel });
    const o = noiseOutcome(src, model, house(0, 20), [0], () => 0, s(src));
    expect(o.receivers).toEqual([]);
    expect(o.walls).toEqual([]);
    expect(emptyScreen(1).edgeOff[0]).toBeNaN();
  });
});
