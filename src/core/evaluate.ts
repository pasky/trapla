// The full recompute path: design → alignment → stations → profile → sections → structures →
// earthworks → buildings, crossings, noise → cost per station cell → checks. Pure (no DOM); runs in
// a Web Worker in the app.

import { autoProfile } from './autoprofile';
import type { BuildingIndex } from './buildings';
import { ROAD_CHECKS, type Violation } from './checks';
import {
  basePerKm, basePerKmUrban, cellLength, costParts, decisionPrices, landPerM2, sumParts, surchargeRate, tunnelPerKm,
  type CostBreakdown, type CostParts,
} from './cost';
import { CATEGORIES, type CategoryId } from './data/categories';
import { horizontalRules, speedNorms } from './data/norms';
import { LAND, MATERIAL_VALUE, NORM_EARTHWORK_ALLOWANCE, PRICES, STRUCTURE_RULES } from './data/prices';
import { CATEGORY_RANK, minCategoryForTraffic, type ScenarioParams } from './data/scenario';
import { BUILDING_RULES, CROSSING_RULES, NOISE, ROAD_CLASSES } from './data/urban';
import { massHaul, volumes } from './earthworks';
import { buildAlignment, station, type PI, type Vec2 } from './horizontal';
import { dwellingExposure, noiseDistance, wallFlags, wallStretches, type WallStretch } from './noise';
import { mergeCrossings, type RoadNet } from './roadnet';
import { computeSections, DEFAULT_SLOPES, flatCutBands } from './sections';
import { chooseStructures, KIND, type Run } from './structures';
import { BUILTUP_BIT, CLASS_BITS, LC, OOB_BIT, type Terrain } from './terrain';
import { buildProfile, elevations, type VPI } from './vertical';

export interface Design {
  category: CategoryId;
  speed: number;
  pis: PI[];
  profileMode: 'auto' | 'manual';
  /** full VPI list incl. endpoints; used in manual mode, refreshed from auto-profile otherwise */
  vpis: VPI[];
}

export interface EvalContext {
  terrain: Terrain;
  scenario: ScenarioParams;
  a: Vec2;
  b: Vec2;
  buildings?: BuildingIndex;
  /** existing road network (crossings) */
  roads?: RoadNet;
}

/** a crossing of an existing road and how it is resolved */
export interface CrossingResult {
  /** station, m, and its station index */
  s: number;
  i: number;
  x: number;
  y: number;
  /** key into ROAD_CLASSES */
  cls: string;
  /** grade minus the crossed road's ground, m */
  h: number;
  /**
   * 'bridge': the road passes under a bridge of the new road (paid as bridge); 'tunnel': the new road
   * is in a tunnel below it (free); 'overbridge': carried across the cut; 'atGrade': junction,
   * reconnection or diversion lump sum
   */
  type: 'bridge' | 'tunnel' | 'overbridge' | 'atGrade';
  /** CZK attributed to the crossing itself (0 for 'bridge' / 'tunnel'), excl. surcharge */
  cost: number;
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
  /** per bend; `unit` is shared by the arcs of one (compound) curve, −1 for a bend without an arc (left out, collinear, U-turn) */
  curves: { index: number; x: number; y: number; r: number; rEff: number; delta: number; auto: boolean; sStart: number; sEnd: number; t: number; unit: number }[];
  violations: Violation[];
  geomViolations: number;
  cost: CostBreakdown;
  /** CZK per station cell and component; each array sums to the matching line of `cost` */
  parts: CostParts;
  /** per station cell: land-take width (m), built-up and forest share of it (0…1), noise walls
   * (bit 0 = left of travel, bit 1 = right) */
  cell: { width: Float64Array; urban: Float32Array; forest: Float32Array; wall: Uint8Array };
  crossings: CrossingResult[];
  walls: WallStretch[];
  /** demolished buildings: index into the pack's building list, station cell it is billed to, CZK */
  demolished: { j: number; i: number; cost: number }[];
  quantities: {
    cut: number; fill: number; reused: number; surplus: number; deficit: number; avgHaul: number;
    /** cut volume by PROVISIONAL depth class I / II / III, m³ */
    cutByClass: [number, number, number];
    footprint: number; forestArea: number; buildingsHit: number; hitBuildings: number[];
    bridgeLength: number; tunnelLength: number; bridges: number; tunnels: number; massHaul: Float64Array;
    /** at-grade + bridge length inside built-up areas, m */
    urbanLength: number;
    wallLength: number;
    /** crossings of existing roads that cost something here (overbridges, junctions, reconnections) */
    crossingsPaid: number;
    /** screening distance used by the noise rule, m */
    noiseDistance: number;
    /** value of a m³ of fill material the auto-profile / structure choice settled on, CZK/m³ */
    materialValue: number;
  };
  travelMin: number;
  minCategory: CategoryId;
  valid: boolean;
  profileFeasible: boolean;
  timing: Record<string, number>;
}

const STEP = 10;
/** the auto-profile's mass-balance search measures candidates on every n-th station's cross-section */
const BALANCE_STRIDE = 2;

/** manual grade line: ends pinned to the tie-ins, interior VPIs sorted, ≥ MIN_VPI_GAP apart and from the ends */
export function normalizeVpis(v: VPI[], L: number, zA: number, zB: number): VPI[] {
  const sorted = v.slice(1, -1).filter((p) => p.s >= MIN_VPI_GAP && p.s <= L - MIN_VPI_GAP).sort((p, q) => p.s - q.s);
  const inner: VPI[] = [];
  for (const p of sorted) if (!inner.length || p.s - inner[inner.length - 1].s >= MIN_VPI_GAP) inner.push({ ...p });
  return [{ s: 0, z: zA, r: null }, ...inner, { s: L, z: zB, r: null }];
}
/** minimum distance between VPIs (and from the ends), m */
export const MIN_VPI_GAP = 20;

export function evaluate(ctx: EvalContext, d: Design): Result {
  const t0 = performance.now();
  const timing: Record<string, number> = {};
  const lap = (k: string) => { timing[k] = performance.now() - t0; };
  const { terrain, scenario } = ctx;
  const cat = CATEGORIES[d.category];
  const norms = speedNorms(d.speed);
  const al = buildAlignment(ctx.a, ctx.b, d.pis, horizontalRules(d.speed));
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
  // `clearance[i]` = minimum grade-minus-ground at station i that puts the grade `need` metres above
  // the crossing's own ground; the crossing samples themselves are kept for the final check
  const clearance = new Float64Array(n).fill(NaN);
  const mustBridge: { s: number; g: number; need: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (const f of [0, 0.25, 0.5, 0.75]) {
      if (f > 0 && i + 1 >= n) break;
      const x = st.x[i] + (i + 1 < n ? (st.x[i + 1] - st.x[i]) * f : 0);
      const y = st.y[i] + (i + 1 < n ? (st.y[i + 1] - st.y[i]) * f : 0);
      const c = terrain.crossing(x, y);
      if (!c) continue;
      const need = c === 2 ? STRUCTURE_RULES.railClearance : STRUCTURE_RULES.riverClearance;
      const gc = terrain.heightAt(x, y);
      mustBridge.push({ s: st.s[i] + f * ds, g: gc, need });
      for (const j of f === 0 ? [i] : [i, i + 1]) {
        const req = need + gc - ground[j];
        if (!(clearance[j] >= req)) clearance[j] = req;
      }
    }
  }

  // existing roads crossed by the route (geometry only; resolved once the grade is known)
  const roadX = ctx.roads ? mergeCrossings(ctx.roads.intersections(n, st.s, st.x, st.y), al.length) : [];
  lap('stations');

  // --- per-metre costs for the auto-profile: rural rates on flat ground, incl. the surcharge ---
  const sur = 1 + PRICES.otherObjectsSurcharge;
  const baseRural = basePerKm(d.category, scenario.terrainClass) / 1000;
  const baseUrban = basePerKmUrban(d.category, scenario.terrainClass) / 1000;
  const tunnelPerM = (cat.tunnelTubes * tunnelPerKm(0) / 1000) * sur;
  const bridgeRural = (cat.bridgePerKm / 1000) * sur + cat.crownWidth * LAND.perM2;
  const { fillSlope, cutSlope } = DEFAULT_SLOPES;
  const b = cat.crownWidth;
  const topsoilPerM2 = PRICES.topsoilDepth * PRICES.topsoil;
  /** cost per metre against grade-minus-ground h for a given value of a m³ of fill material */
  const costFor = (materialValue: number) => {
    const dp = decisionPrices(materialValue);
    return (h: number) => {
      let earth: number;
      if (h >= 0) {
        const wd = b + 2 * fillSlope * h;
        earth = (baseRural + (b * h + fillSlope * h * h) * dp.fillPerM3 + wd * topsoilPerM2) * sur + wd * LAND.perM2;
      } else {
        const c = -h, wd = b + 2 * cutSlope * c;
        const [a1, a2, a3] = flatCutBands(c, b, cutSlope);
        earth = (baseRural + a1 * dp.cutPerM3.I + a2 * dp.cutPerM3.II + a3 * dp.cutPerM3.III + wd * topsoilPerM2) * sur + wd * LAND.perM2;
      }
      let best = earth;
      if (h >= STRUCTURE_RULES.bridgeMinHeight) best = Math.min(best, bridgeRural);
      if (-h >= STRUCTURE_RULES.tunnelMinDepth) best = Math.min(best, tunnelPerM);
      return best;
    };
  };
  const usable = 1 - NORM_EARTHWORK_ALLOWANCE.unsuitableShare;
  const tpl = { crownWidth: b, fillSlope, cutSlope };
  // Mass balance of a candidate grade line: the same steps as the bill below (cross-sections,
  // structure choice incl. forced crossings, volumes), on every BALANCE_STRIDE-th station (and B) and
  // with the built-up share taken at the centreline only.
  const subI: number[] = [];
  for (let i = 0; i < n; i += BALANCE_STRIDE) subI.push(i);
  if (subI[subI.length - 1] !== n - 1) subI.push(n - 1);
  const sub = subI.length, subDs = ds * BALANCE_STRIDE;
  const subS = new Float64Array(sub), subX = new Float64Array(sub), subY = new Float64Array(sub);
  const subTx = new Float64Array(sub), subTy = new Float64Array(sub), subW = new Float64Array(sub);
  const subMust = new Uint8Array(sub), subUrban = new Uint8Array(sub);
  for (let k = 0; k < sub; k++) {
    const i = subI[k];
    subS[k] = st.s[i]; subX[k] = st.x[i]; subY[k] = st.y[i]; subTx[k] = st.tx[i]; subTy[k] = st.ty[i];
    subUrban[k] = terrain.cover(st.x[i], st.y[i]) & BUILTUP_BIT ? 1 : 0;
    // length represented by the sample (trapezoid rule)
    subW[k] = (st.s[subI[Math.min(sub - 1, k + 1)]] - st.s[subI[Math.max(0, k - 1)]]) / 2;
    for (let j = i; j < (k + 1 < sub ? subI[k + 1] : n); j++) if (clearance[j] > -Infinity) subMust[k] = 1;
  }
  const roadS = roadX.map((c) => c.s);
  const roadG = roadX.map((c) => terrain.heightAt(c.x, c.y));
  const balanceOf = (v: VPI[], materialValue: number) => {
    const p = buildProfile(v, norms.minCrestRadius, norms.minSagRadius);
    const z = elevations(p, subS);
    const sc = computeSections(terrain, sub, subX, subY, subTx, subTy, z, tpl);
    const dp = decisionPrices(materialValue);
    const hh = new Float64Array(sub), earth = new Float64Array(sub), bridge = new Float64Array(sub), tunnel = new Float64Array(sub);
    const must = new Uint8Array(sub);
    for (let k = 0; k < sub; k++) {
      hh[k] = z[k] - ground[subI[k]];
      const u = subUrban[k], su = 1 + surchargeRate(u), land = landPerM2(u), wd = sc.dayL[k] + sc.dayR[k];
      earth[k] = (baseRural + (baseUrban - baseRural) * u + sc.cutI[k] * dp.cutPerM3.I + sc.cutII[k] * dp.cutPerM3.II
        + sc.cutIII[k] * dp.cutPerM3.III + sc.fill[k] * dp.fillPerM3 + wd * topsoilPerM2) * su + wd * land;
      bridge[k] = (cat.bridgePerKm / 1000) * su + b * land;
      tunnel[k] = (cat.tunnelTubes * tunnelPerKm(0, u) / 1000) * su;
      if (subMust[k] && hh[k] > 0) must[k] = 1;
    }
    if (roadS.length) {
      const rz = elevations(p, roadS);
      roadX.forEach((c, j) => {
        const k = Math.min(sub - 1, Math.round(c.s / subDs));
        if (ROAD_CLASSES[c.cls].separable && rz[j] - roadG[j] >= CROSSING_RULES.overHeight && hh[k] > 0) must[k] = 1;
      });
    }
    const { kind } = chooseStructures({ ds: subDs, h: hh, earthPerM: earth, bridgePerM: bridge, tunnelPerM: tunnel, forced: must });
    let bal = 0;
    for (let k = 0; k < sub; k++) if (kind[k] === KIND.earth) bal += (usable * sc.cut[k] - sc.fill[k]) * subW[k];
    return bal;
  };

  // --- vertical alignment ---
  let vpis: VPI[];
  let profileFeasible = true;
  let materialValue = MATERIAL_VALUE.start;
  const zA = ground[0], zB = ground[n - 1];
  if (d.profileMode === 'auto' || d.vpis.length < 2) {
    const apOpt = {
      maxGradient: scenario.maxGradient, minCrest: norms.minCrestRadius, minSag: norms.minSagRadius,
      costPerM: costFor(MATERIAL_VALUE.start), minH: clearance,
      balance: {
        costFor, balanceOf, start: MATERIAL_VALUE.start, lo: MATERIAL_VALUE.lo, hi: MATERIAL_VALUE.hi,
        tolerance: MATERIAL_VALUE.tolerancePerM * al.length,
      },
    };
    let ap = autoProfile(st.s, ground, apOpt);
    // vertical curves can shave the clearance the polyline search provided: retry asking for more
    for (let attempt = 0; attempt < 2 && mustBridge.length; attempt++) {
      const prof0 = buildProfile(ap.vpis, norms.minCrestRadius, norms.minSagRadius);
      const z0 = elevations(prof0, mustBridge.map((c) => c.s));
      let short = 0;
      mustBridge.forEach((c, k) => { short = Math.max(short, c.g + c.need - z0[k]); });
      if (short <= 1e-6) break;
      const minH = Float64Array.from(clearance, (v) => (v > -Infinity ? v + short + 0.5 : NaN));
      // same material value: only the clearance changes
      const mv = ap.materialValue ?? MATERIAL_VALUE.start;
      ap = autoProfile(st.s, ground, { ...apOpt, minH, balance: { ...apOpt.balance, start: mv, lo: mv, hi: mv } });
    }
    vpis = ap.vpis;
    materialValue = ap.materialValue ?? MATERIAL_VALUE.start;
    profileFeasible = ap.feasible;
  } else {
    // manual: keep interior VPIs inside the route, pin the ends to the tie-in elevations
    const L = al.length;
    vpis = normalizeVpis(d.vpis, L, zA, zB);
  }
  lap('profile');
  const prof = buildProfile(vpis, norms.minCrestRadius, norms.minSagRadius);
  const grade = elevations(prof, st.s);

  // --- cross-sections ---
  const sec = computeSections(terrain, n, st.x, st.y, st.tx, st.ty, grade, tpl);
  const dec = decisionPrices(materialValue);
  const cutP = dec.cutPerM3, fillP = dec.fillPerM3;
  lap('sections');

  // --- land cover under each station, for each way of building it: the slope-to-slope footprint of
  // the earthwork, the deck strip of a bridge, the centreline of a tunnel ---
  const cover = { urban: 0, forest: 0, oob: 0 };
  const sampleCover = (i: number, left: number, right: number) => {
    const nx = -st.ty[i], ny = st.tx[i];
    let u = 0, f = 0, cnt = 0, out = 0;
    for (let o = -right; o <= left + 1e-6; o += 2.5) {
      const v = terrain.cover(st.x[i] + nx * o, st.y[i] + ny * o);
      cnt++;
      if (v & BUILTUP_BIT) u++;
      if ((v & CLASS_BITS) === LC.forest) f++;
      if (v & OOB_BIT) out = 1;
    }
    cover.urban = cnt ? u / cnt : 0; cover.forest = cnt ? f / cnt : 0; cover.oob = out;
  };
  const urbanEarth = new Float32Array(n), forestEarth = new Float32Array(n), urbanDeck = new Float32Array(n);
  const urbanCentre = new Uint8Array(n), oobEarth = new Uint8Array(n), oobDeck = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    sampleCover(i, sec.dayL[i], sec.dayR[i]);
    urbanEarth[i] = cover.urban; forestEarth[i] = cover.forest; oobEarth[i] = cover.oob;
    sampleCover(i, w, w);
    urbanDeck[i] = cover.urban; oobDeck[i] = cover.oob;
    urbanCentre[i] = terrain.cover(st.x[i], st.y[i]) & BUILTUP_BIT ? 1 : 0;
  }

  // --- structures: the earthwork option against a bridge / tunnel, each at the rates of its own
  // footprint (as the bill will charge it) ---
  const h = new Float64Array(n);
  const earthPerM = new Float64Array(n), bridgePerM = new Float64Array(n), tunnelPerMAt = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    h[i] = grade[i] - ground[i];
    const ue = urbanEarth[i], ud = urbanDeck[i], ut = urbanCentre[i], wd = sec.dayL[i] + sec.dayR[i];
    earthPerM[i] = (baseRural + (baseUrban - baseRural) * ue + sec.cutI[i] * cutP.I + sec.cutII[i] * cutP.II
      + sec.cutIII[i] * cutP.III + sec.fill[i] * fillP + wd * topsoilPerM2) * (1 + surchargeRate(ue))
      + wd * (landPerM2(ue) + forestEarth[i] * LAND.forestExtraPerM2);
    bridgePerM[i] = (cat.bridgePerKm / 1000) * (1 + surchargeRate(ud)) + b * landPerM2(ud);
    tunnelPerMAt[i] = (cat.tunnelTubes * tunnelPerKm(0, ut) / 1000) * (1 + surchargeRate(ut));
  }
  // river / water / railway crossings must be bridged (streams get culverts, included in the norm);
  // a crossing below the required clearance is a violation (and gets no fake buried bridge)
  const forced = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (clearance[i] > -Infinity && h[i] > 0) forced[i] = 1;
  // an existing road clearly below the grade passes under a (short) bridge instead of being buried
  const roadZ = roadS.length ? elevations(prof, roadS) : new Float64Array(0);
  const crossings: CrossingResult[] = roadX.map((c, k) => ({
    s: c.s, i: Math.min(n - 1, Math.round(c.s / ds)), x: c.x, y: c.y, cls: c.cls,
    h: roadZ[k] - roadG[k], type: 'atGrade', cost: 0,
  }));
  for (const c of crossings) {
    if (ROAD_CLASSES[c.cls].separable && c.h >= CROSSING_RULES.overHeight && h[c.i] > 0) forced[c.i] = 1;
  }
  const { kind, runs } = chooseStructures({ ds, h, earthPerM, bridgePerM, tunnelPerM: tunnelPerMAt, forced });
  // what is actually built decides the land take, the rates and whether the terrain data suffice
  const width = new Float64Array(n), urban = new Float32Array(n), forest = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (kind[i] === KIND.earth) {
      width[i] = sec.dayL[i] + sec.dayR[i]; urban[i] = urbanEarth[i]; forest[i] = forestEarth[i];
      if (oobEarth[i]) oob[i] = 1;
    } else if (kind[i] === KIND.bridge) {
      width[i] = b; urban[i] = urbanDeck[i];
      if (oobDeck[i]) oob[i] = 1;
    } else urban[i] = urbanCentre[i];
  }
  lap('structures');

  // --- earthworks ---
  const vol = volumes(ds, sec.cut, sec.fill, kind, usable);
  const mh = massHaul(ds, vol.mass, vol.cut * usable, vol.fill);
  let footprint = 0, forestArea = 0, urbanLength = 0;
  const cutByClass: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const len = cellLength(i, n, ds);
    if (kind[i] !== KIND.tunnel) urbanLength += urban[i] * len;
    if (kind[i] !== KIND.earth) continue;
    footprint += width[i] * len;
    forestArea += forest[i] * width[i] * len;
    cutByClass[0] += sec.cutI[i] * len; cutByClass[1] += sec.cutII[i] * len; cutByClass[2] += sec.cutIII[i] * len;
  }
  lap('earthworks');

  // --- buildings in the footprint (slope to slope at grade, the deck strip under bridges), plus a
  // working strip on either side ---
  const buildingCost = new Float64Array(n);
  const demolished: Result['demolished'] = [];
  const bld = ctx.buildings;
  const gone = new Uint8Array(bld ? bld.n : 0);
  if (bld) {
    const items = bld.items;
    const best = new Map<number, { i: number; along: number }>();
    for (let i = 0; i < n; i++) {
      if (kind[i] === KIND.tunnel) continue;
      const left = kind[i] === KIND.earth ? sec.dayL[i] : w, right = kind[i] === KIND.earth ? sec.dayR[i] : w;
      const x = st.x[i], y = st.y[i], tx = st.tx[i], ty = st.ty[i];
      const off = (left - right) / 2, half = (left + right) / 2 + BUILDING_RULES.clearance;
      const cx = x - ty * off, cy = y + tx * off;
      bld.near(x, y, Math.max(left, right) + BUILDING_RULES.clearance + ds, (j) => {
        if (!bld.hits(j, cx, cy, tx, ty, ds / 2 + 0.5, half)) return;
        const along = Math.abs((items[j][0] - x) * tx + (items[j][1] - y) * ty);
        const p = best.get(j);
        if (!p) best.set(j, { i, along }); else if (along < p.along) { p.i = i; p.along = along; }
      });
    }
    for (const [j, p] of best) {
      gone[j] = 1;
      buildingCost[p.i] += bld.cost[j];
      demolished.push({ j, i: p.i, cost: bld.cost[j] });
    }
    demolished.sort((p, q) => p.i - q.i);
  }

  // --- crossings of existing roads ---
  const crossingLump = new Float64Array(n), crossingStructure = new Float64Array(n);
  let crossingsPaid = 0;
  for (const c of crossings) {
    const row = ROAD_CLASSES[c.cls];
    if (kind[c.i] === KIND.bridge) c.type = 'bridge';
    else if (kind[c.i] === KIND.tunnel) c.type = 'tunnel';
    else if (row.separable && c.h <= -CROSSING_RULES.underDepth) {
      // overbridge spanning the cut (slope edge to slope edge), as wide as the crossed road
      c.type = 'overbridge';
      c.cost = ((sec.dayL[c.i] + sec.dayR[c.i]) / 1000) * row.bridgePerKm;
      crossingStructure[c.i] += c.cost;
    } else {
      c.cost = row.atGrade;
      crossingLump[c.i] += c.cost;
    }
    if (c.cost > 0) crossingsPaid++;
  }

  // --- noise walls ---
  const wall = new Uint8Array(n), wallLength = new Float64Array(n);
  let walls: WallStretch[] = [];
  const noiseD = noiseDistance(scenario.traffic, d.speed);
  if (bld) {
    const ex = dwellingExposure(n, st.x, st.y, st.tx, st.ty, bld, noiseD, gone);
    const shieldL = new Uint8Array(n), shieldR = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (kind[i] === KIND.tunnel) { shieldL[i] = shieldR[i] = 1; continue; }
      if (kind[i] !== KIND.earth) continue;
      if (sec.zDayL[i] - grade[i] >= NOISE.cutShield) shieldL[i] = 1;
      if (sec.zDayR[i] - grade[i] >= NOISE.cutShield) shieldR[i] = 1;
    }
    const fl = wallFlags(ds, ex.L, shieldL), fr = wallFlags(ds, ex.R, shieldR);
    for (let i = 0; i < n; i++) {
      wall[i] = fl[i] | (fr[i] << 1);
      wallLength[i] = (fl[i] + fr[i]) * cellLength(i, n, ds);
    }
    walls = [...wallStretches(ds, al.length, fl, 'L'), ...wallStretches(ds, al.length, fr, 'R')];
  }
  lap('town');

  const bridges = runs.filter((r) => r.kind === KIND.bridge).map((r) => r.length);
  const tunnels = runs.filter((r) => r.kind === KIND.tunnel).map((r) => r.length);
  const bridgeLength = bridges.reduce((a, v) => a + v, 0);
  const tunnelLength = tunnels.reduce((a, v) => a + v, 0);
  const parts = costParts({
    category: d.category, terrainClass: scenario.terrainClass, n, ds, kind, urban,
    cutI: sec.cutI, cutII: sec.cutII, cutIII: sec.cutIII, fill: sec.fill, usable,
    haul: { moment: mh.moment, reused: mh.reused, surplus: mh.surplus, deficit: mh.deficit },
    width, forest, runs, buildings: buildingCost, crossingLump, crossingStructure, wallLength,
  });
  const cost = sumParts(parts);
  lap('cost');

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
  if (mustBridge.length) {
    const zc = elevations(prof, mustBridge.map((c) => c.s));
    let last = -Infinity;
    mustBridge.forEach((c, k) => {
      const ic = Math.min(n - 1, Math.round(c.s / ds));
      const above = zc[k] - c.g;
      if (kind[ic] === KIND.tunnel || above >= c.need - 1e-6 || c.s - last < 50) return;
      last = c.s;
      violations.push({
        kind: 'crossing', s0: c.s, s1: c.s,
        msg: `river/railway crossing needs the grade ≥ ${c.need} m above it (now ${above.toFixed(1)} m)`,
      });
    });
  }
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
    curves: al.curves.map((c) => ({ index: c.index, x: c.x, y: c.y, r: c.r, rEff: c.rEff, delta: c.delta, auto: c.auto, sStart: c.sStart, sEnd: c.sEnd, t: c.t, unit: c.unit })),
    violations, geomViolations, cost, parts, cell: { width, urban, forest, wall }, crossings, walls, demolished,
    quantities: {
      cut: vol.cut, fill: vol.fill, reused: mh.reused, surplus: mh.surplus, deficit: mh.deficit, avgHaul: mh.avgHaul,
      cutByClass, footprint, forestArea, buildingsHit: demolished.length, hitBuildings: demolished.map((p) => p.j),
      bridgeLength, tunnelLength, bridges: bridges.length, tunnels: tunnels.length, massHaul: vol.mass,
      urbanLength, wallLength: wallLength.reduce((a, v) => a + v, 0), crossingsPaid, noiseDistance: noiseD, materialValue,
    },
    travelMin, minCategory, valid: violations.length === 0, profileFeasible, timing,
  };
}
