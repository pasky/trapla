import { describe, expect, it } from 'vitest';
import { horizontalViolations } from '../src/core/checks';
import { horizontalRules } from '../src/core/data/norms';
import {
  autoRadius, buildAlignment, EDIT_TOLERANCE, pointAt, roadRules, station, transitionTangent,
  type Alignment, type Element, type PI, type Vec2,
} from '../src/core/horizontal';
import { buildProfile, elevations } from '../src/core/vertical';
import { maxRadiusThatFits } from '../src/ui/curve-fit';

const R90 = horizontalRules(90);
const deg = (d: number) => (d * Math.PI) / 180;
const auto = (p: Vec2): PI => ({ ...p, r: null });

/** walk `legs` metres at a time, turning left by `turns` degrees before each leg */
function path(start: Vec2, heading: number, steps: [turnDeg: number, leg: number][]): Vec2[] {
  const out: Vec2[] = [];
  let { x, y } = start, h = heading;
  for (const [t, L] of steps) {
    h += deg(t);
    x += L * Math.cos(h); y += L * Math.sin(h);
    out.push({ x, y });
  }
  return out;
}
/** A, bends and B from a list of steps (the last step leads to B) */
function route(steps: [number, number][], start: Vec2 = { x: 0, y: 0 }, heading = 0) {
  const pts = path(start, heading, steps);
  return { a: start, b: pts[pts.length - 1], pis: pts.slice(0, -1).map(auto) };
}
const ends = (al: Alignment, e: Element) => {
  const one = { ...al, elements: [e] };
  return [{ ...pointAt(one, e.s0) }, { ...pointAt(one, e.s0 + e.len) }];
};
/**
 * G1 along the whole alignment: consecutive elements share position and tangent, stations are
 * contiguous, and a fine walk never jumps or turns faster than the sharpest arc allows.
 */
function expectG1(al: Alignment, a: Vec2, b: Vec2) {
  let sum = 0;
  for (let i = 0; i < al.elements.length; i++) {
    const e = al.elements[i];
    expect(e.s0).toBeCloseTo(sum, 9);
    sum += e.len;
    if (i === 0) continue;
    const p = ends(al, al.elements[i - 1])[1], q = ends(al, e)[0];
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(1e-7);
    expect(Math.hypot(p.tx - q.tx, p.ty - q.ty)).toBeLessThan(1e-9);
  }
  expect(al.length).toBeCloseTo(sum, 9);
  const p0 = pointAt(al, 0);
  expect(Math.hypot(p0.x - a.x, p0.y - a.y)).toBeLessThan(1e-9);
  const p1 = pointAt(al, al.length);
  expect(Math.hypot(p1.x - b.x, p1.y - b.y)).toBeLessThan(1e-6);
  let rMin = Infinity;
  for (const e of al.elements) if (e.kind === 'arc') rMin = Math.min(rMin, e.r);
  const n = Math.ceil(al.length), ds = al.length / n;
  let prev = { ...pointAt(al, 0) }, walked = 0;
  for (let i = 1; i <= n; i++) {
    const p = { ...pointAt(al, i * ds) };
    const chord = Math.hypot(p.x - prev.x, p.y - prev.y);
    expect(chord).toBeLessThanOrEqual(ds + 1e-9);
    expect(chord).toBeGreaterThan(ds * (1 - (ds * ds) / (rMin * rMin)));
    expect(Math.hypot(p.tx - prev.tx, p.ty - prev.ty)).toBeLessThanOrEqual(ds / rMin + 1e-9);
    walked += chord;
    prev = p;
  }
  // the walked chord length converges to the analytic length from below
  expect(walked).toBeLessThanOrEqual(al.length + 1e-9);
  expect(walked).toBeGreaterThan(al.length * (1 - 1 / (20 * rMin * rMin)) - 1e-6);
}
const msgs = (al: Alignment) => horizontalViolations(al, 90).map((v) => v.msg);

describe('horizontal alignment', () => {
  it('right-angle bend: tangent length, arc length, external distance', () => {
    const R = 400;
    const al = buildAlignment({ x: 0, y: 0 }, { x: 1000, y: 1000 }, [{ x: 0, y: 1000, r: R }], 100, 50);
    const c = al.curves[0];
    expect(c.delta).toBeCloseTo(Math.PI / 2, 9);
    expect(c.t).toBeCloseTo(R, 6);
    expect(c.arcLen).toBeCloseTo((Math.PI / 2) * R, 6);
    expect(al.length).toBeCloseTo(2000 - 2 * R + (Math.PI / 2) * R, 6);
    // arc midpoint is E = R(sec(Δ/2) − 1) from the PI
    const mid = pointAt(al, (c.sStart + c.sEnd) / 2);
    expect(Math.hypot(mid.x - 0, mid.y - 1000)).toBeCloseTo(R * (1 / Math.cos(Math.PI / 4) - 1), 6);
    // turning right (north then east)
    expect(c.dir).toBe(-1);
    const end = pointAt(al, al.length);
    expect(end.x).toBeCloseTo(1000, 6);
    expect(end.y).toBeCloseTo(1000, 6);
    expect(end.tx).toBeCloseTo(1, 9);
  });

  it('stationing is continuous with unit-speed parameterisation', () => {
    const al = buildAlignment({ x: 0, y: 0 }, { x: 3000, y: 0 },
      [{ x: 800, y: 600, r: 500 }, { x: 2000, y: -300, r: 700 }], 100, 90);
    const st = station(al, 10);
    for (let i = 1; i < st.n; i++) {
      const chord = Math.hypot(st.x[i] - st.x[i - 1], st.y[i] - st.y[i - 1]);
      expect(chord).toBeLessThanOrEqual(st.ds + 1e-6);
      expect(chord).toBeGreaterThan(st.ds * 0.999);
    }
  });

  it('overlapping arcs are reduced so the geometry stays continuous, and the legs report the overlap', () => {
    const al = buildAlignment({ x: 0, y: 0 }, { x: 600, y: 0 },
      [{ x: 200, y: 200, r: 2000 }, { x: 400, y: 0, r: 2000 }], 100, 90);
    expect(al.legs[1].used).toBeGreaterThan(al.legs[1].length);
    const st = station(al, 5);
    for (let i = 1; i < st.n; i++) {
      expect(Math.hypot(st.x[i] - st.x[i - 1], st.y[i] - st.y[i - 1])).toBeLessThanOrEqual(st.ds + 1e-6);
    }
    expect(st.x[st.n - 1]).toBeCloseTo(600, 6);
  });

  it('transition tangent reduces to R·tan(Δ/2) without a transition and grows by ≈ L/2 with one', () => {
    expect(transitionTangent(500, 0.6, 0)).toBeCloseTo(500 * Math.tan(0.3), 9);
    expect(transitionTangent(500, 0.6, 90) - 500 * Math.tan(0.3)).toBeGreaterThan(44);
    expect(transitionTangent(500, 0.6, 90) - 500 * Math.tan(0.3)).toBeLessThan(47);
  });
});

describe('horizontal rules (ČSN 73 6101)', () => {
  it('automatic radius: the minimum, two transitions (R·Δ ≥ lt), or the transition-free radius', () => {
    expect(R90.plainRadius).toBeCloseTo(1350, 9); // lt²/(24·0.25 m)
    expect(horizontalRules(80).plainRadius).toBeCloseTo(1066.67, 2);
    expect(horizontalRules(70).plainRadius).toBeCloseTo(816.67, 2);
    expect(autoRadius(deg(40), R90)).toBe(355);
    expect(autoRadius(deg(10), R90)).toBe(520); // 90 m / 0.1745 = 516 → 520
    expect(autoRadius(deg(2), R90)).toBe(1350); // 90 / 0.0349 = 2,578 m is not needed: no transitions from 1,350 m
  });

  it('the old blanket rule is gone: two gentle same-direction bends 120 m apart are one valid curve', () => {
    const { a, b, pis } = route([[0, 800], [6, 120], [6, 800]]);
    const al = buildAlignment(a, b, pis, R90);
    expect(msgs(al)).toEqual([]);
    expect(al.units).toHaveLength(1);
    expect(al.joints[1].kind).toBe('compound');
    // arcs meet on the shared leg: T1 + T2 = leg, radii equal by symmetry
    expect(al.curves[0].t + al.curves[1].t).toBeCloseTo(120, 6);
    expect(al.curves[0].rEff).toBeCloseTo(60 / Math.tan(deg(3)), 2);
    expect(al.curves[1].rEff).toBeCloseTo(al.curves[0].rEff, 2);
    expectG1(al, a, b);
  });

  it('an arc of at least the transition-free radius needs no room for transitions', () => {
    // Δ = 8°, R = 1,400 m: T = 97.9 m; the bend is 100 m from A
    const { a, b } = route([[0, 100], [8, 900]]);
    const p = path(a, 0, [[0, 100]])[0];
    expect(msgs(buildAlignment(a, b, [{ ...p, r: 1400 }], R90))).toEqual([]);
    // at 1,300 m (T = 90.9 m) a 90 m transition is required and does not fit
    const m = msgs(buildAlignment(a, b, [{ ...p, r: 1300 }], R90));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/^bend 1 is too close to A: its curve takes 91 m of that leg and its transition 45 m more, but the leg is only 100 m/);
  });

  it('opposite arcs: transitions may touch; arcs without transitions need a 2·vn straight', () => {
    // two 30° bends at R = 355 m: T = 95.1 m each, transitions ≈ 45.2 m each → 280.7 m
    const s = (leg: number) => { const r = route([[0, 600], [30, leg], [-30, 600]]); return buildAlignment(r.a, r.b, r.pis, R90); };
    expect(msgs(s(282))).toEqual([]);
    expect(s(282).joints[1].kind).toBe('reverse');
    const m = msgs(s(270));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/^bends 1 and 2 turn opposite ways 270 m apart: the curves take 95 \+ 95 m of that leg and their two transitions 90 m, 281 m in all — move them ≥ 11 m further apart/);
    // two 1.5° bends at R = 1,350 m: T = 17.7 m each; the arcs (35 m) are too short to carry a transition → 180 m straight
    const g = (leg: number) => { const r = route([[0, 600], [1.5, leg], [-1.5, 600]]); return buildAlignment(r.a, r.b, r.pis, R90); };
    expect(g(216).joints[1]).toMatchObject({ plainFrom: true, plainTo: true, needFrom: 90, needTo: 90 });
    expect(msgs(g(216))).toEqual([]);
    // closer than that, the automatic radius switches to the variant with transitions (R·Δ = 90 m: 45 + 45 m each)
    expect(msgs(g(182))).toEqual([]);
    expect(g(182).curves[0].r).toBe(3440);
    // closer still there is no S-curve; bends this slight are within the editor tolerance and one is left out
    expect(msgs(g(170))).toEqual([]);
    expect(g(170).curves.filter((c) => c.ignored)).toHaveLength(1);
    // with the player's own radii nothing is left out or changed: the rule is reported
    const r = route([[0, 600], [1.5, 200], [-1.5, 600]]);
    const m2 = msgs(buildAlignment(r.a, r.b, r.pis.map((p) => ({ ...p, r: 1350 })), R90));
    expect(m2).toEqual(['bends 1 and 2 turn opposite ways 200 m apart: the curves take 18 + 18 m of that leg and arcs without transitions (radius ≥ 1,350 m) need a 180 m straight between them, 215 m in all — move them ≥ 16 m further apart, reduce a radius, or delete one of them']);
  });

  it('a too small or too short manual curve says what to do', () => {
    const { a, b } = route([[0, 900], [20, 900]]);
    const p = path(a, 0, [[0, 900]])[0];
    expect(msgs(buildAlignment(a, b, [{ ...p, r: 300 }], R90))[0])
      .toBe('bend 1: radius 300 m is below the 355 m minimum for 90 km/h — set it to ≥ 355 m or back to auto (or lower the design speed)');
    const g = route([[0, 900], [4, 900]]);
    expect(msgs(buildAlignment(g.a, g.b, [{ ...g.pis[0], r: 900 }], R90))[0])
      .toBe('bend 1: at radius 900 m its arc is only 63 m long, too short for its two 90 m transitions — raise the radius to ≥ 1,290 m or set it back to auto');
  });
});

describe('compound curves', () => {
  /** tangent polygon of a circle of radius r0 around (0, r0), touched at the given central angles (deg) */
  const tangentPolygon = (r0: number, touch: number[], lead = 700) => {
    const on = (t: number): Vec2 => ({ x: r0 * Math.sin(deg(t)), y: r0 - r0 * Math.cos(deg(t)) });
    const pis: PI[] = [];
    for (let i = 0; i + 1 < touch.length; i++) {
      // intersection of the tangents at touch[i] and touch[i+1]
      const half = deg(touch[i + 1] - touch[i]) / 2, p = on(touch[i]), h = deg(touch[i]);
      pis.push(auto({ x: p.x + r0 * Math.tan(half) * Math.cos(h), y: p.y + r0 * Math.tan(half) * Math.sin(h) }));
    }
    const first = on(touch[0]), last = on(touch[touch.length - 1]), hl = deg(touch[touch.length - 1]);
    return { a: { x: first.x - lead, y: first.y }, b: { x: last.x + lead * Math.cos(hl), y: last.y + lead * Math.sin(hl) }, pis };
  };

  it('bends on the tangent polygon of a circle reproduce that circle, also with uneven legs', () => {
    for (const touch of [[0, 10, 20, 30, 40], [0, 7, 19, 26, 41, 50]]) {
      const { a, b, pis } = tangentPolygon(800, touch);
      const al = buildAlignment(a, b, pis, R90);
      expect(msgs(al)).toEqual([]);
      expect(al.units).toHaveLength(1);
      expect(al.units[0].maxOffset).toBeLessThan(1e-6);
      // (the solver is a least-squares fit: exact to well under a millimetre, not to the last bit)
      for (const c of al.curves) expect(c.rEff).toBeCloseTo(800, 2);
      for (const j of al.joints) if (j.kind === 'compound') expect(j.tFrom + j.tTo).toBeCloseTo(j.length, 4);
      // every point of the curve is 800 m from the centre, and the length is that of the circle's arc
      const u = al.units[0];
      for (let s = u.sStart; s <= u.sEnd; s += 7) { const p = pointAt(al, s); expect(Math.hypot(p.x, p.y - 800)).toBeCloseTo(800, 3); }
      const turn = deg(touch[touch.length - 1] - touch[0]);
      expect(u.arcLen).toBeCloseTo(800 * turn, 3);
      expect(al.length).toBeCloseTo(2 * 700 + 800 * turn, 3);
      expectG1(al, a, b);
    }
  });

  it('the acceptance case: 3–6 points roughly along a gentle arc, 100–200 m apart, between two bends', () => {
    let seed = 20261113;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let t = 0; t < 300; t++) {
      const n = 3 + Math.floor(rnd() * 4), r0 = 500 + rnd() * 1500;
      // points near a circle of radius r0 (± 3 m), 100–200 m apart
      const pts: Vec2[] = [];
      let ang = 0;
      for (let i = 0; i < n; i++) {
        const r = r0 + (rnd() - 0.5) * 6;
        pts.push({ x: r * Math.sin(ang), y: r0 - r * Math.cos(ang) });
        ang += (100 + rnd() * 100) / r0;
      }
      // the two existing bends 500 m before / after, turning either way by 12–40°
      const hIn = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) - Math.hypot(pts[1].y - pts[0].y, pts[1].x - pts[0].x) / (2 * r0);
      const hOut = Math.atan2(pts[n - 1].y - pts[n - 2].y, pts[n - 1].x - pts[n - 2].x)
        + Math.hypot(pts[n - 1].y - pts[n - 2].y, pts[n - 1].x - pts[n - 2].x) / (2 * r0);
      const t1 = (rnd() < 0.5 ? -1 : 1) * (0.2 + rnd() * 0.5), t2 = (rnd() < 0.5 ? -1 : 1) * (0.2 + rnd() * 0.5);
      const prev = { x: pts[0].x - 500 * Math.cos(hIn), y: pts[0].y - 500 * Math.sin(hIn) };
      const next = { x: pts[n - 1].x + 500 * Math.cos(hOut), y: pts[n - 1].y + 500 * Math.sin(hOut) };
      const a = { x: prev.x - 900 * Math.cos(hIn - t1), y: prev.y - 900 * Math.sin(hIn - t1) };
      const b = { x: next.x + 900 * Math.cos(hOut + t2), y: next.y + 900 * Math.sin(hOut + t2) };
      const al = buildAlignment(a, b, [prev, ...pts, next].map(auto), R90);
      expect(msgs(al), `case ${t}`).toEqual([]);
      for (const u of al.units) expect(u.maxOffset).toBeLessThanOrEqual(EDIT_TOLERANCE);
      for (const c of al.curves) if (c.unit >= 0) expect(c.rEff).toBeGreaterThanOrEqual(355 - 1e-6);
      if (t % 10 === 0) expectG1(al, a, b);
    }
  });

  it('uneven legs: tangency to the inner legs is relaxed just enough for the radius rules', () => {
    // equal 6° turns on legs of 150, 120, 180, 110 m: arcs meeting exactly on the legs would need radii 5 : 1
    const { a, b, pis } = route([[0, 700], [6, 150], [6, 120], [6, 180], [6, 110], [6, 700]]);
    const al = buildAlignment(a, b, pis, R90);
    expect(msgs(al)).toEqual([]);
    expect(al.units).toHaveLength(1);
    const u = al.units[0];
    expect(u.smoothing).toBeGreaterThan(0);
    expect(u.maxOffset).toBeGreaterThan(0.1);
    expect(u.maxOffset).toBeLessThanOrEqual(EDIT_TOLERANCE);
    const r = al.curves.map((c) => c.rEff);
    for (let i = 1; i < r.length; i++) expect(Math.max(r[i], r[i - 1]) / Math.min(r[i], r[i - 1])).toBeLessThanOrEqual(2 + 1e-9);
    expect(Math.min(...r)).toBeGreaterThanOrEqual(355);
    // junction offsets reported per leg are the real distances of the arc ends from the polygon legs
    al.joints.forEach((j) => {
      if (j.kind !== 'compound') return;
      const end = pointAt(al, al.curves[j.from].sEnd), p = pis[j.from], q = pis[j.to];
      const L = Math.hypot(q.x - p.x, q.y - p.y);
      const dist = ((end.x - p.x) * (q.y - p.y) - (end.y - p.y) * (q.x - p.x)) / L; // + to the right of the leg
      expect(-dist).toBeCloseTo(j.offset, 6); // left turns: + offset = towards the centre = left
    });
    expectG1(al, a, b);
    // arc lengths add up exactly: Σ R·Δ, and so does the route length
    let arcs = 0;
    al.curves.forEach((c) => { arcs += c.rEff * c.delta; expect(c.arcLen).toBeCloseTo(c.rEff * c.delta, 9); });
    expect(u.arcLen).toBeCloseTo(arcs, 9);
    const lines = al.elements.filter((e) => e.kind === 'line');
    expect(lines).toHaveLength(2);
    expect(al.length).toBeCloseTo(lines[0].len + lines[1].len + arcs, 9);
  });

  it('a gentle chain running into a sharp bend steps its radii within the ratio rule', () => {
    const { a, b, pis } = route([[0, 700], [5, 110], [6, 120], [5, 150], [39, 900]]);
    const al = buildAlignment(a, b, pis, R90);
    expect(msgs(al)).toEqual([]);
    expect(al.units).toHaveLength(1);
    const r = al.curves.map((c) => c.rEff);
    expect(r[3]).toBeLessThan(r[0] / 2);
    expect(r[3]).toBeGreaterThanOrEqual(355);
    for (let i = 1; i < r.length; i++) expect(Math.max(r[i], r[i - 1]) / Math.min(r[i], r[i - 1])).toBeLessThanOrEqual(2 + 1e-9);
    expectG1(al, a, b);
  });

  it('mixed directions: an S of two compound curves, with and without room between them', () => {
    const s = (mid: number) => route([[0, 700], [7, 140], [7, 150], [7, mid], [-8, 130], [-8, 160], [-8, 700]]);
    const ok = s(330), al = buildAlignment(ok.a, ok.b, ok.pis, R90);
    expect(msgs(al)).toEqual([]);
    expect(al.units.map((u) => [u.first, u.last])).toEqual([[0, 2], [3, 5]]);
    expect(al.joints[3].kind).toBe('reverse');
    expectG1(al, ok.a, ok.b);
    // a little short: both curves pull their tangents in, still without a violation
    const tight = s(230), al2 = buildAlignment(tight.a, tight.b, tight.pis, R90);
    expect(msgs(al2)).toEqual([]);
    expect(al2.joints[3].tFrom + al2.joints[3].needFrom + al2.joints[3].tTo + al2.joints[3].needTo).toBeLessThanOrEqual(230 + 1e-6);
    expectG1(al2, tight.a, tight.b);
    // far too short: reported on the leg between them, geometry still G1
    const bad = s(110), al3 = buildAlignment(bad.a, bad.b, bad.pis, R90);
    const m = msgs(al3);
    expect(m.some((x) => /^bends 3 and 4 turn opposite ways 110 m apart/.test(x))).toBe(true);
    expectG1(al3, bad.a, bad.b);
  });

  it('too tight a pair: joined, and the violation says so', () => {
    // two 85° turns 500 m apart: one 170° curve of radius 250 / tan 42.5° = 273 m
    const { a, b, pis } = route([[0, 1500], [85, 500], [85, 1500]]);
    const al = buildAlignment(a, b, pis, R90);
    expect(msgs(al)).toEqual(['bends 1 and 2 turn the same way 500 m apart: they are joined as one curve, but its radius 273 m < minimum 355 m — move them apart or reduce the turn']);
    expectG1(al, a, b);
  });

  it('ratio rule: manual radii that differ by more than 2× are reported with the radius to set', () => {
    const { a, b, pis } = route([[0, 900], [10, 140], [10, 900]]);
    pis[0].r = 500; pis[1].r = 1200;
    const al = buildAlignment(a, b, pis, R90);
    const v = horizontalViolations(al, 90);
    expect(v.map((x) => x.msg)).toEqual(['bends 1 and 2 are joined as one curve, but their radii 500 m and 1,200 m differ by more than 2× — reduce the radius of bend 2 (to ≤ 1,000 m, or far enough that the two no longer touch) or set it back to auto']);
    expect(v[0]).toMatchObject({ kind: 'compound', pis: [0, 1] });
    expect(v[0].s1).toBeGreaterThan(v[0].s0);
    expectG1(al, a, b); // the player's radii are kept; the curve leaves the shared leg instead
    expect(al.curves.map((c) => c.rEff)).toEqual([500, 1200]);
    // one manual radius: the automatic neighbour follows within the ratio
    pis[1].r = null;
    const al2 = buildAlignment(a, b, pis, R90);
    expect(msgs(al2)).toEqual([]);
    expect(al2.curves[0].rEff).toBe(500);
    expect(al2.curves[1].rEff).toBeLessThanOrEqual(1000 + 1e-6);
  });

  it('a bend that only wiggles against the curve around it is left out, a real S is not', () => {
    // 5 points along a 2,000 m arc; the middle one pushed 6 m inwards so that it turns the other way
    const { a, b, pis } = route([[0, 700], [4, 150], [4, 150], [4, 150], [4, 150], [4, 700]]);
    const mid = pis[2], towards = { x: -Math.sin(deg(8)), y: Math.cos(deg(8)) }; // left of the heading there
    const moved = pis.map((p, i) => (i === 2 ? { ...p, x: mid.x + 6 * towards.x, y: mid.y + 6 * towards.y } : p));
    const al = buildAlignment(a, b, moved, R90);
    expect(al.curves[2].ignored).toBe(true);
    expect(al.curves[2].offset).toBeGreaterThan(0);
    expect(al.curves[2].offset).toBeLessThanOrEqual(EDIT_TOLERANCE);
    expect(al.curves).toHaveLength(5);
    expect(msgs(al)).toEqual([]);
    expectG1(al, a, b);
    // the offset is the point's distance from the line between its neighbours (here the road runs about there too)
    const p = pointAt(al, al.curves[2].sStart);
    expect(Math.hypot(p.x - moved[2].x, p.y - moved[2].y)).toBeLessThan(al.curves[2].offset + 0.5);
    // 30 m is no wiggle: it stays an S-curve that does not fit, and is reported
    const big = pis.map((p, i) => (i === 2 ? { ...p, x: mid.x + 30 * towards.x, y: mid.y + 30 * towards.y } : p));
    const al2 = buildAlignment(a, b, big, R90);
    expect(al2.curves[2].ignored).toBe(false);
    expect(msgs(al2).some((x) => x.includes('turn opposite ways'))).toBe(true);
    expectG1(al2, a, b);
    // a manual radius is the player's explicit wish: never left out
    const man = moved.map((p, i) => (i === 2 ? { ...p, r: 1500 } : p));
    expect(buildAlignment(a, b, man, R90).curves[2].ignored).toBe(false);
  });

  it('collinear and duplicate points are transparent', () => {
    const base = route([[0, 700], [6, 120], [6, 800]]);
    const ref = buildAlignment(base.a, base.b, base.pis, R90);
    const [p1, p2] = base.pis;
    const mid = auto({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
    const onFirstLeg = auto({ x: 300, y: 0 });
    const al = buildAlignment(base.a, base.b, [onFirstLeg, p1, { ...p1 }, mid, p2], R90);
    expect(al.length).toBeCloseTo(ref.length, 9);
    expect(al.curves).toHaveLength(5);
    expect(al.legs).toHaveLength(6);
    expect(al.elements).toHaveLength(ref.elements.length);
    expect(al.curves.map((c) => c.unit)).toEqual([-1, 0, -1, -1, 0]);
    expect(al.curves[0].sStart).toBeCloseTo(300, 9);
    // the mid point sits on the leg where the two arcs meet
    expect(al.curves[3].sStart).toBeCloseTo(al.curves[1].sEnd, 9);
    expect(msgs(al)).toEqual([]);
    expectG1(al, base.a, base.b);
    // degenerate inputs do not throw, and a route of no length still knows where it is
    const zero = buildAlignment({ x: 300, y: 300 }, { x: 300, y: 300 }, [], R90);
    expect(zero.length).toBe(0);
    expect(pointAt(zero, 0)).toMatchObject({ x: 300, y: 300 });
    expect(station(zero, 10).x[0]).toBe(300);
    expect(buildAlignment({ x: 0, y: 0 }, { x: 100, y: 0 }, [auto({ x: 0, y: 0 }), auto({ x: 100, y: 0 })], R90).length).toBeCloseTo(100, 9);
    // absurd radii are taken as "very large" / "automatic", never as NaN
    for (const r of [1e308, Infinity, NaN, -5, 0]) {
      const odd = buildAlignment({ x: 0, y: 0 }, { x: 1000, y: 2000 }, [{ x: 1000, y: 0, r }, { x: 0, y: 1000, r }], R90);
      expect(Number.isFinite(odd.length)).toBe(true);
      for (const c of odd.curves) expect(Number.isFinite(c.rEff) && Number.isFinite(c.sStart)).toBe(true);
      const end = pointAt(odd, odd.length);
      expect(Math.hypot(end.x - 1000, end.y - 2000)).toBeLessThan(1e-6);
    }
  });

  it('points left out of a route that is in violation anyway keep their stations in order', () => {
    const pis: PI[] = [{ x: -168, y: 696, r: null }, { x: -482, y: 555, r: null }, { x: -481, y: 557, r: null }, { x: -485, y: 557, r: 3924 }, { x: -485, y: 556, r: null }];
    const al = buildAlignment({ x: 300, y: 300 }, { x: -474, y: 541 }, pis, R90);
    expect(al.curves).toHaveLength(5);
    for (let i = 1; i < 5; i++) expect(al.curves[i].sStart).toBeGreaterThanOrEqual(al.curves[i - 1].sEnd);
    // joints name the two bends they are between, not a range through the points left out
    for (const m of msgs(al)) expect(m).not.toMatch(/bends \d+–\d+ turn/);
  });

  it('transition-free arcs may meet whatever their ratio, with or without being joined', () => {
    const t = (r: number) => r * Math.tan(deg(20));
    const build = (r1: number, r2: number, leg: number) => {
      const { a, b, pis } = route([[0, 3000], [40, leg], [40, 6000]]);
      pis[0].r = r1; pis[1].r = r2;
      return { a, b, al: buildAlignment(a, b, pis, R90) };
    };
    // R = 1,400 and 4,000 m whose tangent points coincide: no straight between the arcs, not joined by the solver
    const touching = build(1400, 4000, t(1400) + t(4000));
    expect(touching.al.elements.map((e) => e.kind)).toEqual(['line', 'arc', 'arc', 'line']);
    expect(touching.al.units).toHaveLength(2);
    expect(msgs(touching.al)).toEqual([]);
    // 2 m closer they overlap and are joined — just as fine (both ≥ 1,350 m)
    const joined = build(1400, 4000, t(1400) + t(4000) - 2);
    expect(joined.al.units).toHaveLength(1);
    expect(msgs(joined.al)).toEqual([]);
    expectG1(joined.al, joined.a, joined.b);
    // below the transition-free radius the ratio rule applies
    const mixed = build(1300, 4000, t(1300) + t(4000) - 2);
    expect(mixed.al.units).toHaveLength(1);
    expect(msgs(mixed.al).some((m) => m.includes('differ by more than 2×'))).toBe(true);
  });

  it('given radii that already close the curve are accepted (a 180° turn leaves the solver nothing to adjust)', () => {
    const a = { x: 0, y: 0 }, b = { x: 0, y: 1000 };
    const al = buildAlignment(a, b, [{ x: 1000, y: 0, r: 500 }, { x: 1000, y: 1000, r: 500 }], R90);
    expect(msgs(al)).toEqual([]);
    expect(al.units).toHaveLength(1);
    expect(al.units[0].arcLen).toBeCloseTo(Math.PI * 500, 6);
    expectG1(al, a, b);
    // radii that do not close it are a violation that names the cause
    const off = buildAlignment(a, b, [{ x: 1000, y: 0, r: 500 }, { x: 1000, y: 1000, r: 520 }], R90);
    expect(msgs(off)[0]).toMatch(/^bends 1 and 2 turn the same way 1,000 m apart: .* with the radius set on bend 1 and bend 2 they cannot be joined into one curve either/);
    expectG1(off, a, b);
  });

  it('a long run of fixed radii that cannot be joined is still solved quickly', () => {
    const pis: PI[] = [{ x: 800, y: 0, r: 500 }];
    let x = 800, y = 0, h = 0;
    for (let i = 1; i < 80; i++) { h += 0.1; x += 20 * Math.cos(h); y += 20 * Math.sin(h); pis.push({ x, y, r: 500 }); }
    const b = { x: x + 800 * Math.cos(h + 0.1), y: y + 800 * Math.sin(h + 0.1) };
    const t0 = performance.now();
    const al = buildAlignment({ x: 0, y: 0 }, b, pis, R90);
    expect(performance.now() - t0).toBeLessThan(500); // was 2.5 s when every shorter prefix was tried in turn
    expect(msgs(al).length).toBeGreaterThan(0);
    const end = pointAt(al, al.length);
    expect(Math.hypot(end.x - b.x, end.y - b.y)).toBeLessThan(1e-6);
  });

  it('near U-turns next to a compound curve: flagged, geometry continuous in position', () => {
    const { a, b, pis } = route([[0, 700], [8, 130], [8, 140], [175, 400], [10, 600]]);
    const al = buildAlignment(a, b, pis, R90);
    expect(al.curves[2].tooSharp).toBe(true);
    expect(msgs(al).some((x) => x.startsWith('bend 3: a turn of 175° is a near U-turn'))).toBe(true);
    const st = station(al, 5);
    for (let i = 1; i < st.n; i++) expect(Math.hypot(st.x[i] - st.x[i - 1], st.y[i] - st.y[i - 1])).toBeLessThanOrEqual(st.ds + 1e-6);
    const end = pointAt(al, al.length);
    expect(Math.hypot(end.x - b.x, end.y - b.y)).toBeLessThan(1e-6);
    // a 340° spiral of bends is one compound curve (no tangent of the total turn is ever taken)
    const sp = route([[0, 900], [68, 520], [68, 520], [68, 520], [68, 520], [68, 900]]);
    const spiral = buildAlignment(sp.a, sp.b, sp.pis, R90);
    expect(spiral.units).toHaveLength(1);
    for (const c of spiral.curves) expect(c.rEff).toBeCloseTo(260 / Math.tan(deg(34)), 2);
    expect(msgs(spiral)).toEqual([]);
    expectG1(spiral, sp.a, sp.b);
  });

  it('a compound curve squeezed against a route end stays G1 and is reported', () => {
    // 60 m from A is enough: the curve gives way (its first tangent is pulled in) and stays valid
    const near = route([[0, 60], [12, 130], [12, 140], [12, 700]]);
    const al = buildAlignment(near.a, near.b, near.pis, R90);
    expect(msgs(al)).toEqual([]);
    expect(al.joints[0].tTo + al.joints[0].needTo).toBeLessThanOrEqual(60 + 1e-6);
    expectG1(al, near.a, near.b);
    // 30 m with sharper turns is not: the curve is squeezed into the leg and the violations say why
    const { a, b, pis } = route([[0, 30], [25, 130], [25, 140], [25, 700]]);
    const al2 = buildAlignment(a, b, pis, R90);
    const m = msgs(al2);
    expect(m.some((x) => x.startsWith('bend 1 is too close to A'))).toBe(true);
    expect(m.some((x) => x.startsWith('bends 1–3 turn the same way 130–140 m apart: they are joined as one curve, but its radius'))).toBe(true);
    expect(al2.elements[0]).toMatchObject({ kind: 'arc' }); // starts right at A
    expectG1(al2, a, b);
  });

  it('stations and pointAt stay consistent for the vertical / earthwork code', () => {
    const { a, b, pis } = route([[0, 700], [6, 150], [6, 120], [6, 180], [-20, 600], [30, 500]]);
    const al = buildAlignment(a, b, pis, R90);
    const st = station(al, 10);
    expect(st.s[st.n - 1]).toBeCloseTo(al.length, 9);
    for (let i = 1; i < st.n; i++) {
      const chord = Math.hypot(st.x[i] - st.x[i - 1], st.y[i] - st.y[i - 1]);
      expect(chord).toBeLessThanOrEqual(st.ds + 1e-9);
      expect(chord).toBeGreaterThan(st.ds * 0.9995);
      expect(Math.hypot(st.tx[i], st.ty[i])).toBeCloseTo(1, 12);
    }
    // curve stations are ordered and bracket their own arcs
    let last = 0;
    for (const c of al.curves) {
      expect(c.sStart).toBeGreaterThanOrEqual(last - 1e-9);
      expect(c.sEnd).toBeGreaterThanOrEqual(c.sStart);
      last = c.sEnd;
      const midp = pointAt(al, (c.sStart + c.sEnd) / 2);
      expect(Math.abs(midp.curvature)).toBeCloseTo(1 / c.rEff, 12);
      expect(Math.sign(midp.curvature)).toBe(c.dir);
    }
    expect(last).toBeLessThanOrEqual(al.length);
    // the legacy (minRadius, lt) call gives the same road rules
    const legacy = buildAlignment(a, b, pis, 355, 90);
    expect(legacy.rules).toEqual(roadRules(355, 90));
    expect(legacy.length).toBeCloseTo(al.length, 9);
  });
});

describe('largest radius that fits', () => {
  it('is limited by the neighbouring curves and their transitions', () => {
    const { a, b, pis } = route([[0, 600], [30, 800], [-25, 700]]);
    const r = maxRadiusThatFits(a, b, pis, 0, 90)!;
    // bend 2 keeps its automatic 355 m: T = 78.7 m + 45.2 m transition on the shared 800 m leg
    const fits = (rr: number) => msgs(buildAlignment(a, b, [{ ...pis[0], r: rr }, pis[1]], R90)).length === 0;
    expect(fits(r)).toBe(true);
    expect(fits(r + 10)).toBe(false);
    expect(r).toBeGreaterThan(2000);
  });

  it('looks beyond the first radius that does not fit: the transition-free range can fit again', () => {
    // an 8° bend 100 m from A: with transitions up to ≈ 785 m, then again from 1,350 m (no transitions) to 1,430 m
    const { a, b, pis } = route([[0, 100], [8, 900]]);
    const ok = (r: number) => msgs(buildAlignment(a, b, [{ ...pis[0], r }], R90)).length === 0;
    expect([645, 800, 1300, 1350, 1430, 1440].map(ok)).toEqual([true, false, false, true, true, false]);
    expect(maxRadiusThatFits(a, b, pis, 0, 90)).toBe(1430);
  });

  it('is null when even the automatic radius is in violation', () => {
    const { a, b, pis } = route([[0, 40], [30, 900]]);
    expect(maxRadiusThatFits(a, b, pis, 0, 90)).toBeNull();
  });
});

describe('vertical alignment', () => {
  it('symmetric crest: middle ordinate L·Δg/8 and tangency at both ends', () => {
    const R = 5000;
    const p = buildProfile([{ s: 0, z: 100, r: null }, { s: 500, z: 110, r: R }, { s: 1000, z: 100, r: null }], 6000, 3400);
    const c = p.curves[0];
    expect(c.type).toBe('crest');
    expect(c.len).toBeCloseTo(R * 0.04, 9);
    const L = c.len;
    const z = [500 - L / 2, 500, 500 + L / 2, 500 - L / 2 - 1, 500 + L / 2 + 1].map((s) => elevations(p, [s])[0]);
    expect(z[1]).toBeCloseTo(110 - (L * 0.04) / 8, 9);
    expect(z[0]).toBeCloseTo(110 - 0.02 * L / 2, 9);
    expect(z[2]).toBeCloseTo(110 - 0.02 * L / 2, 9);
    expect(z[0] - z[3]).toBeCloseTo(0.02, 6);
    expect(z[2] - z[4]).toBeCloseTo(0.02, 6);
  });

  it('default radius is the norm minimum for the curve type', () => {
    const p = buildProfile([{ s: 0, z: 0, r: null }, { s: 500, z: -10, r: null }, { s: 1000, z: 0, r: null }], 6000, 3400);
    expect(p.curves[0].type).toBe('sag');
    expect(p.curves[0].r).toBe(3400);
  });
});
