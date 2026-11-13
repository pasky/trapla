// The full recompute path: design → alignment → stations → profile → sections → structures →
// earthworks → cost → checks. Pure (no DOM); runs in a Web Worker in the app.

import { autoProfile } from './autoprofile';
import type { BuildingIndex } from './buildings';
import { ROAD_CHECKS, type Violation } from './checks';
import { basePerKm, DECISION, rollup, tunnelPerKm, type CostBreakdown } from './cost';
import { CATEGORIES, type CategoryId } from './data/categories';
import { speedNorms } from './data/norms';
import { LAND, NORM_EARTHWORK_ALLOWANCE, PRICES, STRUCTURE_RULES } from './data/prices';
import { CATEGORY_RANK, minCategoryForTraffic, type ScenarioParams } from './data/scenario';
import { massHaul, volumes } from './earthworks';
import { buildAlignment, station, type PI, type Vec2 } from './horizontal';
import { computeSections, DEFAULT_SLOPES } from './sections';
import { chooseStructures, KIND, type Run } from './structures';
import { LC, type Terrain } from './terrain';
import { buildProfile, elevations, type VPI } from './vertical';

export interface Design {
  category: CategoryId;
  speed: number;
  pis: PI[];
  profileMode: 'auto' | 'manual';
  /** full VPI list incl. endpoints; used in manual mode, refreshed from auto-profile otherwise */
  vpis: VPI[];
  /** the naive start profile (terrain-hugging): the first horizontal edit switches to auto */
  naive?: boolean;
}

export interface EvalContext {
  terrain: Terrain;
  scenario: ScenarioParams;
  a: Vec2;
  b: Vec2;
  buildings?: BuildingIndex;
}

export interface Result {
  length: number;
  ds: number;
  n: number;
  s: Float64Array; x: Float64Array; y: Float64Array; tx: Float64Array; ty: Float64Array;
  ground: Float64Array;
  grade: Float64Array;
  kind: Uint8Array;
  cut: Float64Array; fill: Float64Array;
  dayL: Float64Array; dayR: Float64Array; zDayL: Float64Array; zDayR: Float64Array;
  oob: Uint8Array;
  runs: Run[];
  vpis: VPI[];
  vcurves: { s: number; z: number; len: number; r: number; type: string }[];
  grades: number[];
  curves: { index: number; x: number; y: number; r: number; rEff: number; delta: number; auto: boolean; sStart: number; sEnd: number; t: number }[];
  violations: Violation[];
  geomViolations: number;
  cost: CostBreakdown;
  quantities: {
    cut: number; fill: number; reused: number; surplus: number; deficit: number; avgHaul: number;
    footprint: number; forestArea: number; buildingsHit: number; hitBuildings: number[];
    bridgeLength: number; tunnelLength: number; bridges: number; tunnels: number; massHaul: Float64Array;
  };
  travelMin: number;
  minCategory: CategoryId;
  valid: boolean;
  profileFeasible: boolean;
  timing: Record<string, number>;
}

const STEP = 10;
/** minimum distance between VPIs (and from the ends), m */
export const MIN_VPI_GAP = 20;

export function evaluate(ctx: EvalContext, d: Design): Result {
  const t0 = performance.now();
  const timing: Record<string, number> = {};
  const lap = (k: string) => { timing[k] = performance.now() - t0; };
  const { terrain, scenario } = ctx;
  const cat = CATEGORIES[d.category];
  const norms = speedNorms(d.speed);
  const al = buildAlignment(ctx.a, ctx.b, d.pis, norms.minRadius, norms.minTransition);
  const st = station(al, STEP);
  const n = st.n, ds = st.ds;
  const ground = new Float64Array(n);
  const oob = new Uint8Array(n);
  const w = cat.crownWidth / 2;
  for (let i = 0; i < n; i++) {
    ground[i] = terrain.heightAt(st.x[i], st.y[i]);
    const nx = -st.ty[i], ny = st.tx[i];
    oob[i] = terrain.isOob(st.x[i], st.y[i]) || terrain.isOob(st.x[i] + nx * w, st.y[i] + ny * w)
      || terrain.isOob(st.x[i] - nx * w, st.y[i] - ny * w) ? 1 : 0;
  }
  // river / water-area / railway crossings: sample between stations too so diagonal crossings of a
  // 5 m raster line are not missed; each crossing is assigned to the nearest station
  const clearance = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    for (const f of [0, 0.25, 0.5, 0.75]) {
      if (f > 0 && i + 1 >= n) break;
      const x = st.x[i] + (i + 1 < n ? (st.x[i + 1] - st.x[i]) * f : 0);
      const y = st.y[i] + (i + 1 < n ? (st.y[i + 1] - st.y[i]) * f : 0);
      const c = terrain.crossing(x, y);
      if (!c) continue;
      const j = f > 0.5 ? i + 1 : i;
      const need = c === 2 ? STRUCTURE_RULES.railClearance : STRUCTURE_RULES.riverClearance;
      if (!(clearance[j] >= need)) clearance[j] = need;
    }
  }
  lap('stations');

  // --- per-metre costs (construction parts incl. the other-objects surcharge) ---
  const sur = 1 + PRICES.otherObjectsSurcharge;
  const basePerM = (basePerKm(d.category, scenario.terrainClass) / 1000) * sur;
  const bridgePerM = (cat.bridgePerKm / 1000) * sur + cat.crownWidth * LAND.perM2;
  const tunnelPerM = (cat.tunnelTubes * tunnelPerKm(0) / 1000) * sur;
  const cutP = DECISION.cutPerM3 * sur, fillP = DECISION.fillPerM3 * sur;
  const { fillSlope, cutSlope } = DEFAULT_SLOPES;
  const b = cat.crownWidth;
  const costPerM = (h: number) => {
    let earth: number;
    if (h >= 0) earth = basePerM + (b * h + fillSlope * h * h) * fillP + (b + 2 * fillSlope * h) * DECISION.landPerM2;
    else { const c = -h; earth = basePerM + (b * c + cutSlope * c * c) * cutP + (b + 2 * cutSlope * c) * DECISION.landPerM2; }
    let best = earth;
    if (h >= STRUCTURE_RULES.bridgeMinHeight) best = Math.min(best, bridgePerM);
    if (-h >= STRUCTURE_RULES.tunnelMinDepth) best = Math.min(best, tunnelPerM);
    return best;
  };

  // --- vertical alignment ---
  let vpis: VPI[];
  let profileFeasible = true;
  const zA = ground[0], zB = ground[n - 1];
  if (d.profileMode === 'auto' || d.vpis.length < 2) {
    const ap = autoProfile(st.s, ground, {
      maxGradient: scenario.maxGradient, minCrest: norms.minCrestRadius, minSag: norms.minSagRadius, costPerM,
      minH: clearance,
    });
    vpis = ap.vpis;
    profileFeasible = ap.feasible;
  } else {
    // manual: keep interior VPIs inside the route, pin the ends to the tie-in elevations
    const L = al.length;
    const sorted = d.vpis.slice(1, -1).filter((v) => v.s >= MIN_VPI_GAP && v.s <= L - MIN_VPI_GAP).sort((p, q) => p.s - q.s);
    const inner: VPI[] = [];
    for (const v of sorted) if (!inner.length || v.s - inner[inner.length - 1].s >= MIN_VPI_GAP) inner.push({ ...v });
    vpis = [{ s: 0, z: zA, r: null }, ...inner, { s: L, z: zB, r: null }];
  }
  lap('profile');
  const prof = buildProfile(vpis, norms.minCrestRadius, norms.minSagRadius);
  const grade = elevations(prof, st.s);

  // --- cross-sections ---
  const sec = computeSections(terrain, n, st.x, st.y, st.tx, st.ty, grade, { crownWidth: b, fillSlope, cutSlope });
  lap('sections');

  // --- structures ---
  const h = new Float64Array(n);
  const earthPerM = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    h[i] = grade[i] - ground[i];
    earthPerM[i] = basePerM + sec.cut[i] * cutP + sec.fill[i] * fillP + (sec.dayL[i] + sec.dayR[i]) * DECISION.landPerM2;
  }
  // river / water / railway crossings must be bridged (streams get culverts, included in the norm);
  // a crossing below the required clearance is a violation (and gets no fake buried bridge)
  const forced = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (clearance[i] > 0 && h[i] > 0) forced[i] = 1;
  const { kind, runs } = chooseStructures({ ds, h, earthPerM, bridgePerM, tunnelPerM, forced });

  // --- earthworks ---
  const usable = 1 - NORM_EARTHWORK_ALLOWANCE.unsuitableShare;
  const vol = volumes(ds, sec.cut, sec.fill, kind, usable);
  const mh = massHaul(ds, vol.mass, vol.cut * usable, vol.fill);
  let footprint = 0, forestArea = 0;
  const hit = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (kind[i] !== KIND.earth) continue;
    const wgt = i === 0 || i === n - 1 ? 0.5 : 1;
    const fw = sec.dayL[i] + sec.dayR[i];
    footprint += fw * ds * wgt;
    const nx = -st.ty[i], ny = st.tx[i];
    let forest = 0, cnt = 0;
    for (let o = -sec.dayR[i]; o <= sec.dayL[i] + 1e-6; o += 5) {
      cnt++;
      if (terrain.landcover(st.x[i] + nx * o, st.y[i] + ny * o) === LC.forest) forest++;
    }
    forestArea += (cnt ? forest / cnt : 0) * fw * ds * wgt;
    if (ctx.buildings) {
      const items = ctx.buildings.items;
      const x = st.x[i], y = st.y[i];
      // building = circle (centroid, max vertex distance) against this station's footprint strip
      ctx.buildings.near(x, y, Math.max(sec.dayL[i], sec.dayR[i]) + ds + 60, (j) => {
        const bx = items[j][0] - x, by = items[j][1] - y, br = items[j][2];
        const along = bx * st.tx[i] + by * st.ty[i];
        const across = bx * nx + by * ny;
        if (Math.abs(along) <= ds / 2 + br && across <= sec.dayL[i] + br && across >= -sec.dayR[i] - br) hit.add(j);
      });
    }
  }
  lap('earthworks');

  const bridges = runs.filter((r) => r.kind === KIND.bridge).map((r) => r.length);
  const tunnels = runs.filter((r) => r.kind === KIND.tunnel).map((r) => r.length);
  const bridgeLength = bridges.reduce((a, v) => a + v, 0);
  const tunnelLength = tunnels.reduce((a, v) => a + v, 0);
  const cost = rollup({
    category: d.category, terrainClass: scenario.terrainClass,
    atGradeLength: Math.max(0, al.length - bridgeLength - tunnelLength),
    earth: {
      cut: vol.cut, fill: vol.fill, unsuitable: vol.cut * (1 - usable), haulMoment: mh.moment, reused: mh.reused,
      surplus: mh.surplus, deficit: mh.deficit, footprint,
    },
    bridges, tunnels, bridgeLand: bridgeLength * b, forestArea, buildingsHit: hit.size,
  });

  // --- checks ---
  const violations: Violation[] = [
    ...ROAD_CHECKS.horizontal(al, norms),
    ...ROAD_CHECKS.vertical(prof, norms, scenario.maxGradient),
  ];
  // the whole at-grade footprint must be on terrain data, and every slope must reach the ground
  for (let i = 0; i < n; i++) {
    if (kind[i] !== KIND.earth) continue;
    const nx = -st.ty[i], ny = st.tx[i];
    if (terrain.isOob(st.x[i] + nx * sec.dayL[i], st.y[i] + ny * sec.dayL[i])
      || terrain.isOob(st.x[i] - nx * sec.dayR[i], st.y[i] - ny * sec.dayR[i])) oob[i] = 1;
  }
  const ranges = (flag: (i: number) => boolean, fn: (i0: number, i1: number) => void) => {
    for (let i = 0; i < n; i++) {
      if (!flag(i)) continue;
      let j = i;
      while (j + 1 < n && flag(j + 1)) j++;
      fn(i, j);
      i = j;
    }
  };
  ranges((i) => kind[i] === KIND.earth && sec.open[i] === 1, (i0, i1) => violations.push({
    kind: 'section', s0: st.s[i0], s1: st.s[i1],
    msg: 'side slope does not reach the ground within 150 m — change the grade line here',
  }));
  ranges((i) => kind[i] !== KIND.tunnel && h[i] < clearance[i] - 1e-6, (i0, i1) => violations.push({
    kind: 'crossing', s0: st.s[i0], s1: st.s[i1],
    msg: `river/railway crossing needs the grade ≥ ${Math.max(...Array.from(clearance.subarray(i0, i1 + 1)).filter((v) => v > 0))} m above it (now ${h[i0].toFixed(1)} m)`,
  }));
  for (let i = 0; i < n; i++) {
    if (!oob[i]) continue;
    let j = i;
    while (j + 1 < n && oob[j + 1]) j++;
    violations.push({ kind: 'oob', s0: st.s[i], s1: st.s[j], msg: `outside the play area / no terrain data (${((st.s[j] - st.s[i]) + ds).toFixed(0)} m)` });
    i = j;
  }
  if (!profileFeasible && d.profileMode === 'auto') {
    violations.push({ kind: 'profile', s0: 0, s1: al.length, msg: `auto-profile found no grade line within ${(scenario.maxGradient * 100).toFixed(0)} % and the vertical-curve minima — reroute or edit the profile` });
  }
  const geomViolations = violations.length;
  const travelMin = al.length / (d.speed / 3.6) / 60;
  const minCategory = minCategoryForTraffic(scenario.traffic);
  if (CATEGORY_RANK[d.category] < CATEGORY_RANK[minCategory]) {
    violations.push({ kind: 'category', goal: true, s0: 0, s1: al.length, msg: `${cat.label} cannot carry ${scenario.traffic.toLocaleString('en-US')} veh/day — needs ${CATEGORIES[minCategory].label}` });
  }
  if (travelMin > scenario.maxTravelMin + 1e-9) {
    violations.push({ kind: 'time', goal: true, s0: 0, s1: al.length, msg: `travel time ${travelMin.toFixed(2)} min > target ${scenario.maxTravelMin.toFixed(1)} min` });
  }
  lap('total');

  return {
    length: al.length, ds, n, s: st.s, x: st.x, y: st.y, tx: st.tx, ty: st.ty, ground, grade, kind,
    cut: sec.cut, fill: sec.fill, dayL: sec.dayL, dayR: sec.dayR, zDayL: sec.zDayL, zDayR: sec.zDayR, oob, runs,
    vpis, vcurves: prof.curves.map((c) => ({ s: c.s, z: c.z, len: c.lenEff, r: c.r, type: c.type })), grades: prof.grades,
    curves: al.curves.map((c) => ({ index: c.index, x: c.x, y: c.y, r: c.r, rEff: c.rEff, delta: c.delta, auto: c.auto, sStart: c.sStart, sEnd: c.sEnd, t: c.t })),
    violations, geomViolations, cost,
    quantities: {
      cut: vol.cut, fill: vol.fill, reused: mh.reused, surplus: mh.surplus, deficit: mh.deficit, avgHaul: mh.avgHaul,
      footprint, forestArea, buildingsHit: hit.size, hitBuildings: [...hit],
      bridgeLength, tunnelLength, bridges: bridges.length, tunnels: tunnels.length, massHaul: vol.mass,
    },
    travelMin, minCategory, valid: violations.length === 0, profileFeasible, timing,
  };
}
