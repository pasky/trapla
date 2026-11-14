// The full recompute path: design → alignment → stations → profile → sections → structures →
// earthworks → buildings, crossings, noise → cost per station cell → checks. Pure (no DOM); runs in
// a Web Worker in the app.

import { autoProfile } from './autoprofile';
import { bridgeModel, bridgeRunCost } from './bridge';
import { noiseBuyoutCost, BuildingIndex } from './buildings';
import { normalizeBuildingOverrides, normalizeWallOverrides, wallOverrideMasks, type BuildingOverride, type WallOverride } from './build-controls';
import { noiseControlViolations } from './noise-control-violations';
import { categoryViolation, crossingViolation, mergeNearby, oobViolation, profileViolation, ROAD_CHECKS, slopeViolation, timeViolation, type Violation } from './checks';
import {
  basePerKm, basePerKmUrban, cellLength, costParts, decisionPrices, landPerM2, sumParts, surchargeRate, tunnelPerKm,
  type CostBreakdown, type CostParts,
} from './cost';
import { buildCrossingGeometry, crossingBridgeMask, crossingChoice, normalizeCrossingOverrides, resolveCrossings, type CrossingOverride, type CrossingResult } from './crossings';
export type { CrossingResult } from './crossings';
import { CATEGORIES, type CategoryId } from './data/categories';
import { horizontalRules, speedNorms } from './data/norms';
import { LAND, MATERIAL_VALUE, NORM_EARTHWORK_ALLOWANCE, PRICES, STRUCTURE_RULES } from './data/prices';
import { CATEGORY_RANK, minCategoryForTraffic, type ScenarioParams } from './data/scenario';
import { ACCESS, BUILDING_RULES, CROSSING_RULES, ROAD_CLASSES } from './data/urban';
import { massHaul, volumes } from './earthworks';
import { earthEngineeringPerM, flatEarthGeometry } from './earthengineering';
import { buildAlignment, station, type PI, type Vec2 } from './horizontal';
import {
  dwellingExposure, noiseBarrier, noiseFootprint, resolveNoiseWalls,
  type EarthEdges, type NoiseFootprint, type NoiseReceiver, type WallStretch,
} from './noise';
import { createNoiseModel } from './road-noise';
import { crossingWallGaps } from './crossing-walls';
import { mergeCrossings, type RoadNet } from './roadnet';
import type { GroundProfile } from './ground';
import { computeSections, DEFAULT_SLOPES, flatCutBands } from './sections';
import { chooseStructures, KIND, type Run } from './structures';
import { overrideMask, type StructureOverride } from './overrides';
import { BUILTUP_BIT, CLASS_BITS, LC, OOB_BIT, type Terrain } from './terrain';
import { buildProfile, elevations, type VPI } from './vertical';
import { CULVERT_RULES } from './data/culverts';
import { barrelLength, culvertCost, waterOpening, waterSize, type WaterCrossing, type WaterResult } from './watercourses';

export interface Design {
  category: CategoryId;
  speed: number;
  pis: PI[];
  profileMode: 'auto' | 'manual';
  /** full VPI list incl. endpoints; used in manual mode, refreshed from auto-profile otherwise */
  vpis: VPI[];
  /** Manual construction ranges in absolute chainage; omitted in older saved designs. */
  structureOverrides?: StructureOverride[];
  /** Auto-grade constraints in absolute chainage; retained but inactive in Manual. */
  gradePins?: { s: number; z: number }[];
  /** Per existing-road way (scenario-pack index), not a transient crossing station. */
  crossingOverrides?: CrossingOverride[];
  /** Building indices are stable within the scenario pack. Omission restores Auto. */
  buildingOverrides?: BuildingOverride[];
  /** Side-specific wall paint; height 0 removes Auto's wall, omitted ranges remain automatic. */
  wallOverrides?: WallOverride[];
  /** Scenario object-pack identity for positional building/road IDs; not a scoring version. */
  objectData?: string;
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

export interface Result {
  length: number;
  ds: number;
  n: number;
  s: Float64Array; x: Float64Array; y: Float64Array; tx: Float64Array; ty: Float64Array;
  ground: Float64Array;
  /** Centreline map priors for display / DP; sections sample geology across their entire width. */
  geology: { ids: Uint8Array; profiles: GroundProfile[] };
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
  waterCrossings: WaterResult[];
  walls: WallStretch[];
  /** demolished buildings: index into the pack's building list, station cell it is billed to, CZK */
  demolished: { j: number; i: number; cost: number }[];
  /** Outside the footprint: noise fallback or explicit player acquisition + demolition, including plot allowance. */
  boughtOut: { j: number; i: number; cost: number; reason?: 'manual' }[];
  /** Kept buildings remain present; hit means footprint/working-strip conflict. */
  kept: { j: number; i: number; hit: boolean }[];
  /** noise view: dwellings within the search radius with their status, and the ground-floor map */
  noise: { receivers: NoiseReceiver[]; footprint: NoiseFootprint | null };
  quantities: {
    cut: number; fill: number; reused: number; surplus: number; deficit: number; avgHaul: number;
    /** cut volume by local geology + estimated weathering class I / II / III, m³ */
    cutByClass: [number, number, number];
    footprint: number; forestArea: number; buildingsHit: number; hitBuildings: number[];
    bridgeLength: number; tunnelLength: number; bridges: number; tunnels: number; massHaul: Float64Array;
    /** at-grade + bridge length inside built-up areas, m */
    urbanLength: number;
    wallLength: number;
    wallArea: number;
    noiseBuyouts: number;
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
  let manualStructures = overrideMask(st.s, d.structureOverrides);
  const crossingOverrides = normalizeCrossingOverrides(d.crossingOverrides);
  const ground = new Float64Array(n);
  const groundIds = new Uint8Array(n), groundProfiles: GroundProfile[] = [];
  const groundClasses = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const id = terrain.groundIdAt(st.x[i], st.y[i]);
    let k = groundClasses.get(id);
    if (k === undefined) {
      k = groundProfiles.length;
      groundClasses.set(id, k);
      groundProfiles.push(terrain.groundAt(st.x[i], st.y[i]));
    }
    groundIds[i] = k;
  }
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
  const streamSamples: number[] = [];
  /** `below`: the crossing may instead pass this far below the crossed feature (motorways) */
  const mustBridge: { s: number; g: number; need: number; what: string; below?: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (const f of [0, 0.25, 0.5, 0.75]) {
      if (f > 0 && i + 1 >= n) break;
      const x = st.x[i] + (i + 1 < n ? (st.x[i + 1] - st.x[i]) * f : 0);
      const y = st.y[i] + (i + 1 < n ? (st.y[i + 1] - st.y[i]) * f : 0);
      if (!terrain.watercourses && terrain.landcover(x, y) === LC.stream) streamSamples.push(st.s[i] + f * ds);
      const c = terrain.crossing(x, y);
      if (!c) continue;
      const need = c === 2 ? STRUCTURE_RULES.railClearance : STRUCTURE_RULES.riverClearance;
      const gc = terrain.heightAt(x, y);
      mustBridge.push({ s: st.s[i] + f * ds, g: gc, need, what: c === 2 ? 'railway' : 'river' });
      for (const j of f === 0 ? [i] : [i, i + 1]) {
        const req = need + gc - ground[j];
        if (!(clearance[j] >= req)) clearance[j] = req;
      }
    }
  }

  // Collapse adjacent raster hits, rather than billing a new culvert for every 5 m stream pixel.
  const streamS: number[] = [];
  for (let k = 0; k < streamSamples.length; k++) {
    const start = k;
    while (k + 1 < streamSamples.length && streamSamples[k + 1] - streamSamples[k] <= CULVERT_RULES.rasterMerge) k++;
    streamS.push((streamSamples[start] + streamSamples[k]) / 2);
  }
  const water = terrain.watercourses?.intersections(n, st.s, st.x, st.y) ?? streamS.map((s, id): WaterCrossing => {
    const i = Math.min(n - 1, Math.round(s / ds));
    return { s, id: -id - 1, x: st.x[i], y: st.y[i], waterKind: 'stream', width: 0.5,
      catchmentKm2: 0, truncated: true, sine: 1 };
  });
  const waterAt: WaterCrossing[][] = Array.from({ length: n }, () => []);
  const waterMin = new Float64Array(n).fill(NaN), waterBelow = new Float64Array(n).fill(NaN);
  const waterGround = new Map(water.map(c => [c, terrain.heightAt(c.x, c.y)]));
  for (const c of water) {
    const i = Math.min(n - 1, Math.round(c.s / ds));
    waterAt[i].push(c);
    const size = waterSize(c, cat.crownWidth + 12), g = waterGround.get(c)!;
    // Water can stay above a deep bored tunnel; an open cut needs a diversion we do not model.
    const need = size.minHeight;
    const i0 = Math.min(n - 2, Math.floor(c.s / ds));
    for (const j of [i0, i0 + 1]) {
      waterMin[j] = Math.max(Number.isNaN(waterMin[j]) ? -Infinity : waterMin[j], g + need - ground[j]);
      waterBelow[j] = Math.min(Number.isNaN(waterBelow[j]) ? Infinity : waterBelow[j], g - STRUCTURE_RULES.tunnelMinDepth - ground[j]);
    }
    mustBridge.push({ s: c.s, g, need, what: 'watercourse' });
  }
  // Distinct sparse crossing classes retain their actual size, skew and multiplicity in the DP.
  const costClasses = groundProfiles.map((_, ground) => ({ ground, water: [] as WaterCrossing[], elevation: 0 }));
  const profileCostClass = Uint16Array.from(groundIds);
  for (let i = 0; i < n; i++) if (waterAt[i].length) {
    profileCostClass[i] = costClasses.length;
    costClasses.push({ ground: groundIds[i], water: waterAt[i], elevation: ground[i] });
  }
  const crossingCost = (cs: WaterCrossing[], width: number, z: number) => cs.reduce((v, c) => v + (z > waterGround.get(c)! ? culvertCost(c, width) : 0), 0);
  const forceWater = (mask: Uint8Array, ss: ArrayLike<number>, heights: ArrayLike<number>, widths: ArrayLike<number>, chosen?: ArrayLike<number>) => {
    for (const c of water) {
      const i = Math.min(ss.length - 1, Math.round(c.s / (ss[1] - ss[0])));
      const size = waterSize(c, widths[i]);
      if (size.type !== 'bridge' && chosen?.[i] !== KIND.bridge) continue;
      const opening = Math.max(c.width + 2 * CULVERT_RULES.bridgeBanks, size.q100 / (CULVERT_RULES.velocity * 2) + 2 * CULVERT_RULES.bridgeBanks);
      const halfSpan = opening / Math.max(0.01, c.sine) / 2;
      for (let j = 0; j < ss.length; j++) if (Math.abs(ss[j] - c.s) <= halfSpan + (ss[1] - ss[0]) / 2 && heights[j] > 0) mask[j] = 1;
    }
  };

  const waterSide = Array.from({ length: n }, (_, i) => (terrain.watercourses?.section(st.x[i], st.y[i], st.tx[i], st.ty[i], 150, 150) ?? []).map(hit => ({ ...hit,
    offset: -(hit.x - st.x[i]) * st.ty[i] + (hit.y - st.y[i]) * st.tx[i], ground: terrain.heightAt(hit.x, hit.y) })));
  const exposedWater = (i: number, left: number, right: number) => waterSide[i].filter(hit => hit.offset <= left && hit.offset >= -right
    && !water.some(c => terrain.watercourses!.connected(c.id, hit.id)
      && Math.abs(c.s - st.s[i]) <= barrelLength(c, left + right) / 2 + ds
      && Math.hypot(c.x - hit.x, c.y - hit.y) <= barrelLength(c, left + right) + ds));
  const forceParallelWater = (mask: Uint8Array, indices: ArrayLike<number>, z: ArrayLike<number>, left: ArrayLike<number>, right: ArrayLike<number>) => {
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      if (z[k] <= ground[i]) continue;
      if (exposedWater(i, left[k], right[k]).some(hit => z[k] - hit.ground >= STRUCTURE_RULES.riverClearance)) mask[k] = 1;
    }
  };
  const tunnelWater = (ss: ArrayLike<number>, z: ArrayLike<number>) => {
    const mask = new Uint8Array(ss.length);
    for (const c of water) {
      const i = Math.min(ss.length - 1, Math.round(c.s / (ss[1] - ss[0])));
      if (z[i] <= waterGround.get(c)! - STRUCTURE_RULES.tunnelMinDepth) mask[i] = 1;
    }
    return mask;
  };

  // existing roads crossed by the route (geometry only; resolved once the grade is known)
  const rawRoadX = ctx.roads?.intersections(n, st.s, st.x, st.y) ?? [];
  // Billing may merge carriageways / omit tie-in-area objects; safety must see every raw crossing.
  const roadX = mergeCrossings(rawRoadX, al.length, undefined, new Set(crossingOverrides.map((o) => o.roadId)));
  manualStructures = crossingBridgeMask(st.s, rawRoadX, crossingOverrides, manualStructures);
  const roadG = roadX.map((c) => terrain.heightAt(c.x, c.y));
  // motorways / expressways are never crossed at grade: the grade clears them like a railway (the
  // auto-profile requests an overpass) or pass far enough below for an overbridge
  rawRoadX.forEach((c) => {
    if (!ROAD_CLASSES[c.cls].noAtGrade) return;
    // Only the actual endpoint tie-in is exempt (1 m coordinate tolerance), not the 150 m billing
    // margin or the other carriageway. B lies on D11; A gets the same rule if placed on a motorway.
    if (c.s <= CROSSING_RULES.endpointTolerance || al.length - c.s <= CROSSING_RULES.endpointTolerance) return;
    const need = STRUCTURE_RULES.railClearance, g = terrain.heightAt(c.x, c.y);
    mustBridge.push({ s: c.s, g, need, what: ROAD_CLASSES[c.cls].label, below: CROSSING_RULES.underDepth });
    // A requested overbridge asks Auto for a cut, not the automatic motorway-overpass option.
    if (crossingChoice(c.way, crossingOverrides) === 'overbridge') return;
    const i0 = Math.min(n - 1, Math.floor(c.s / ds));
    for (const j of c.s > st.s[i0] && i0 + 1 < n ? [i0, i0 + 1] : [i0]) {
      const req = need + g - ground[j];
      if (!(clearance[j] >= req)) clearance[j] = req;
    }
  });
  // Raster crossings were collected before vector roads; elevations() requires station order.
  mustBridge.sort((a, b) => a.s - b.s);
  lap('stations');

  // --- per-metre costs for the auto-profile: rural rates on flat ground, incl. the surcharge ---
  const sur = 1 + PRICES.otherObjectsSurcharge;
  const baseRural = basePerKm(d.category, scenario.terrainClass) / 1000;
  const baseUrban = basePerKmUrban(d.category, scenario.terrainClass) / 1000;
  const tunnelPerM = (cat.tunnelTubes * tunnelPerKm(0) / 1000) * sur;
  const bridge = bridgeModel(cat);
  const bridgeRural = (h: number) => bridge.estimatePerM(h) * sur + cat.crownWidth * LAND.perM2;
  const { fillSlope, cutSlope } = DEFAULT_SLOPES;
  const b = cat.crownWidth;
  const topsoilPerM2 = PRICES.topsoilDepth * PRICES.topsoil;
  // Hydraulics does not depend on the mass-balance shadow price. Cache the sparse height LUT
  // across its iterations instead of resizing every barrel twice per entry on every iteration.
  const waterLut = costClasses.map(() => new Map<number, { cost: number; bridge: boolean; tunnel: boolean }>());
  const waterOption = (cls: number, h: number, wd: number) => {
    const entry = costClasses[cls];
    if (!entry.water.length) return { cost: 0, bridge: false, tunnel: false };
    let value = waterLut[cls].get(h);
    if (!value) {
      value = { cost: crossingCost(entry.water, wd, h + entry.elevation) / ds,
        bridge: entry.water.some(c => h + entry.elevation > waterGround.get(c)! && waterSize(c, wd).type === 'bridge'),
        tunnel: entry.water.some(c => h + entry.elevation <= waterGround.get(c)! - STRUCTURE_RULES.tunnelMinDepth) };
      waterLut[cls].set(h, value);
    }
    return value;
  };
  /** cost per metre against grade-minus-ground h for a given value of a m³ of fill material */
  const costFor = (materialValue: number) => {
    const dp = decisionPrices(materialValue);
    return (h: number, kind = -1, costClass = 0) => {
      if (kind === KIND.bridge) return bridgeRural(h);
      if (kind === KIND.tunnel) return tunnelPerM;
      let earth: number;
      const wd = flatEarthGeometry(Math.abs(h), b, h >= 0 ? fillSlope : cutSlope, h >= 0).width;
      const waterPrice = waterOption(costClass, h, wd);
      if (h >= 0) {
        const { area, width: wd } = flatEarthGeometry(h, b, fillSlope, true);
        earth = (baseRural + area * dp.fillPerM3 + earthEngineeringPerM(h, 0, area) + wd * topsoilPerM2
          + waterPrice.cost) * sur + wd * LAND.perM2;
      } else {
        const c = -h, wd = flatEarthGeometry(c, b, cutSlope, false).width;
        const [a1, a2, a3] = flatCutBands(c, b, cutSlope, groundProfiles[costClasses[costClass].ground]);
        earth = (baseRural + a1 * dp.cutPerM3.I + a2 * dp.cutPerM3.II + a3 * dp.cutPerM3.III
          + earthEngineeringPerM(h, a1 + a2 + a3, 0) + wd * topsoilPerM2 + waterPrice.cost) * sur + wd * LAND.perM2;
      }
      const waterBridge = waterPrice.bridge;
      if (waterBridge) earth = bridgeRural(h) + 1e7; // unavailable earthwork, not a free zero-price culvert
      if (waterPrice.tunnel) earth = tunnelPerM + 1e7;
      if (kind === KIND.earth) return earth;
      if (waterPrice.tunnel) return tunnelPerM;
      if (waterBridge && h >= STRUCTURE_RULES.riverClearance) return bridgeRural(h);
      let best = earth;
      if (h >= STRUCTURE_RULES.bridgeMinHeight) best = Math.min(best, bridgeRural(h));
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
  const subWater: WaterCrossing[][] = Array.from({ length: sub }, () => []);
  for (const c of water) subWater[Math.min(sub - 1, Math.round(c.s / subDs))].push(c);
  const subOverrides = crossingBridgeMask(subS, rawRoadX, crossingOverrides, overrideMask(subS, d.structureOverrides));
  const roadS = roadX.map((c) => c.s);
  const balanceOf = (v: VPI[], materialValue: number) => {
    const p = buildProfile(v, norms.minCrestRadius, norms.minSagRadius);
    const z = elevations(p, subS);
    const sc = computeSections(terrain, sub, subX, subY, subTx, subTy, z, tpl);
    const dp = decisionPrices(materialValue);
    const hh = new Float64Array(sub), earth = new Float64Array(sub), bp = new Float64Array(sub), tunnel = new Float64Array(sub);
    const must = new Uint8Array(sub);
    for (let k = 0; k < sub; k++) {
      hh[k] = z[k] - ground[subI[k]];
      const u = subUrban[k], su = 1 + surchargeRate(u), land = landPerM2(u), wd = sc.dayL[k] + sc.dayR[k];
      earth[k] = (baseRural + (baseUrban - baseRural) * u + sc.cutI[k] * dp.cutPerM3.I + sc.cutII[k] * dp.cutPerM3.II
        + sc.cutIII[k] * dp.cutPerM3.III + sc.fill[k] * dp.fillPerM3 + wd * topsoilPerM2
        + earthEngineeringPerM(hh[k], sc.cut[k], sc.fill[k])
        + crossingCost(subWater[k], wd, z[k]) / subW[k]) * su + wd * land;
      bp[k] = bridge.perM(hh[k]) * su + b * land;
      tunnel[k] = (cat.tunnelTubes * tunnelPerKm(0, u) / 1000) * su;
      if (subMust[k] && hh[k] > 0) must[k] = 1;
    }
    forceWater(must, subS, hh, Float64Array.from(sc.dayL, (v, i) => v + sc.dayR[i]));
    forceParallelWater(must, subI, z, sc.dayL, sc.dayR);
    if (roadS.length) {
      const rz = elevations(p, roadS);
      roadX.forEach((c, j) => {
        const k = Math.min(sub - 1, Math.round(c.s / subDs));
        const choice = crossingChoice(c.way, crossingOverrides);
        if ((!choice || choice === 'bridge') && ROAD_CLASSES[c.cls].separable && rz[j] - roadG[j] >= CROSSING_RULES.overHeight && hh[k] > 0) must[k] = 1;
      });
    }
    const input = { ds: subDs, h: hh, earthPerM: earth, bridgePerM: bp, tunnelPerM: tunnel, forced: must, forcedTunnel: tunnelWater(subS, z), overrides: subOverrides,
      bridgeRunCost: bridgeRunCost(bridge, hh, subDs, i => surchargeRate(subUrban[i]), i => landPerM2(subUrban[i])) };
    const firstChoice = chooseStructures(input);
    forceWater(must, subS, hh, Float64Array.from(sc.dayL, (v, i) => v + sc.dayR[i]), firstChoice.kind);
    const { kind } = chooseStructures(input);
    let bal = 0;
    for (let k = 0; k < sub; k++) if (kind[k] === KIND.earth) bal += (usable * sc.cut[k] - sc.fill[k]) * subW[k];
    return bal;
  };

  // --- vertical alignment ---
  let vpis: VPI[];
  let profileFeasible = true;
  let pinViolations: Violation[] = [];
  let materialValue = MATERIAL_VALUE.start;
  const zA = ground[0], zB = ground[n - 1];
  if (d.profileMode === 'auto' || d.vpis.length < 2) {
    const minH = clearance.slice();
    const maxH = new Float64Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      if (manualStructures[i] === KIND.bridge) minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], STRUCTURE_RULES.bridgeMinHeight);
      if (manualStructures[i] === KIND.tunnel) maxH[i] = -STRUCTURE_RULES.tunnelMinDepth;
    }
    for (const c of rawRoadX) {
      const choice = crossingChoice(c.way, crossingOverrides);
      if (choice !== 'bridge' && choice !== 'overbridge') continue;
      const g = terrain.heightAt(c.x, c.y), i0 = Math.min(n - 1, Math.floor(c.s / ds));
      for (const i of [i0, Math.min(n - 1, i0 + 1)]) {
        if (choice === 'bridge') {
          const need = ROAD_CLASSES[c.cls].noAtGrade ? STRUCTURE_RULES.railClearance : CROSSING_RULES.overHeight;
          minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], g + need - ground[i]);
        } else if (ROAD_CLASSES[c.cls].noAtGrade) maxH[i] = Math.min(Number.isNaN(maxH[i]) ? Infinity : maxH[i], g - CROSSING_RULES.underDepth - ground[i]);
      }
    }
    const apOpt = {
      maxGradient: scenario.maxGradient, minCrest: norms.minCrestRadius, minSag: norms.minSagRadius,
      costPerM: costFor(MATERIAL_VALUE.start), minH, maxH, eitherH: { above: waterMin.slice(), below: waterBelow }, structureKind: manualStructures, pins: d.gradePins,
      costClass: profileCostClass, costClassCount: costClasses.length,
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
      const minH = apOpt.minH.slice(), waterAbove = apOpt.eitherH.above.slice();
      mustBridge.forEach((c, k) => {
        // A surface stream above a deep bored tunnel is already separated. Never let that
        // crossing raise every other clearance by the hill's entire height.
        if (c.what === 'watercourse' && z0[k] <= c.g - STRUCTURE_RULES.tunnelMinDepth) return;
        if (c.below !== undefined && (z0[k] <= c.g - c.below || rawRoadX.some((road) => Math.abs(road.s - c.s) < 1e-6 && crossingChoice(road.way, crossingOverrides) === 'overbridge'))) return;
        const deficit = c.g + c.need - z0[k];
        if (deficit <= 1e-6) return;
        short = Math.max(short, deficit);
        const target = c.what === 'watercourse' ? waterAbove : minH;
        const i0 = Math.min(n - 2, Math.floor(c.s / ds));
        for (const i of [i0, i0 + 1]) target[i] = Math.max(Number.isNaN(target[i]) ? -Infinity : target[i], c.g + c.need - ground[i] + deficit + 0.5);
      });
      if (short <= 1e-6) break;
      apOpt.minH = minH; apOpt.eitherH.above = waterAbove;
      // same material value: only the clearance changes
      const mv = ap.materialValue ?? MATERIAL_VALUE.start;
      const retry = autoProfile(st.s, ground, { ...apOpt, balance: { ...apOpt.balance, start: mv, lo: mv, hi: mv } });
      // A clearance refinement must not replace an already pin-compliant solution by its straight
      // fallback. Keep the useful grade and report its clearance shortfall instead.
      if (d.gradePins?.length && !retry.feasible) break;
      ap = retry;
    }
    vpis = ap.vpis;
    materialValue = ap.materialValue ?? MATERIAL_VALUE.start;
    profileFeasible = ap.feasible;
    pinViolations = ap.pinViolations ?? [];
  } else {
    // manual: keep interior VPIs inside the route, pin the ends to the tie-in elevations
    const L = al.length;
    vpis = normalizeVpis(d.vpis, L, zA, zB);
  }
  lap('profile');
  const prof = buildProfile(vpis, norms.minCrestRadius, norms.minSagRadius);
  const grade = elevations(prof, st.s);
  const waterZ = elevations(prof, water.map(c => c.s));
  const waterElevation = new Map(water.map((c, i) => [c, waterZ[i]]));

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
  const geotechnicalPerM = new Float64Array(n), culverts = new Float64Array(n);
  const earthPerM = new Float64Array(n), bridgePerM = new Float64Array(n), tunnelPerMAt = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    h[i] = grade[i] - ground[i];
    geotechnicalPerM[i] = earthEngineeringPerM(h[i], sec.cut[i], sec.fill[i]);
    for (const c of waterAt[i]) culverts[i] += crossingCost([c], sec.dayL[i] + sec.dayR[i], waterElevation.get(c)!);
    const ue = urbanEarth[i], ud = urbanDeck[i], ut = urbanCentre[i], wd = sec.dayL[i] + sec.dayR[i];
    earthPerM[i] = (baseRural + (baseUrban - baseRural) * ue + sec.cutI[i] * cutP.I + sec.cutII[i] * cutP.II
      + sec.cutIII[i] * cutP.III + sec.fill[i] * fillP + wd * topsoilPerM2
      + geotechnicalPerM[i] + culverts[i] / cellLength(i, n, ds)) * (1 + surchargeRate(ue))
      + wd * (landPerM2(ue) + forestEarth[i] * LAND.forestExtraPerM2);
    bridgePerM[i] = bridge.perM(h[i]) * (1 + surchargeRate(ud)) + b * landPerM2(ud);
    tunnelPerMAt[i] = (cat.tunnelTubes * tunnelPerKm(0, ut) / 1000) * (1 + surchargeRate(ut));
  }
  // Rivers / water / railways and watercourses exceeding practical culvert limits need bridges.
  // Inadequate clearance stays a violation, never a fake buried bridge.
  const forced = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (clearance[i] > -Infinity && h[i] > 0) forced[i] = 1;
  forceWater(forced, st.s, h, Float64Array.from(sec.dayL, (v, i) => v + sec.dayR[i]));
  forceParallelWater(forced, Array.from({ length: n }, (_, i) => i), grade, sec.dayL, sec.dayR);
  // an existing road clearly below the grade passes under a (short) bridge instead of being buried
  const roadZ = roadS.length ? elevations(prof, roadS) : new Float64Array(0);
  const crossings: CrossingResult[] = roadX.map((c, k) => ({
    s: c.s, i: Math.min(n - 1, Math.round(c.s / ds)), x: c.x, y: c.y, cls: c.cls, roadId: c.way,
    h: roadZ[k] - roadG[k], type: 'atGrade', cost: 0,
  }));
  for (const c of crossings) {
    const choice = crossingChoice(c.roadId!, crossingOverrides);
    if ((!choice || choice === 'bridge') && ROAD_CLASSES[c.cls].separable && c.h >= CROSSING_RULES.overHeight && h[c.i] > 0) forced[c.i] = 1;
  }
  const structureInput = { ds, h, earthPerM, bridgePerM, tunnelPerM: tunnelPerMAt, forced, forcedTunnel: tunnelWater(st.s, grade), overrides: manualStructures,
    bridgeRunCost: bridgeRunCost(bridge, h, ds, i => surchargeRate(urbanDeck[i]), i => landPerM2(urbanDeck[i])) };
  let selection = chooseStructures(structureInput);
  // An economical bridge still needs its abutments outside the channel/banks, even if a culvert
  // was hydraulically possible. Extend crossing spans, retaining manual overrides and checks.
  forceWater(forced, st.s, h, Float64Array.from(sec.dayL, (v, i) => v + sec.dayR[i]), selection.kind);
  selection = chooseStructures(structureInput);
  const { kind, runs, violations: structureViolations } = selection;
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
  const buildingOverrides = normalizeBuildingOverrides(d.buildingOverrides, bld?.n ?? 0);
  const keptIds = new Set(buildingOverrides.filter((o) => o.action === 'keep').map((o) => o.j));
  const kept: Result['kept'] = [], manualBuys: Result['boughtOut'] = [];
  const buildingViolations: Violation[] = [], noiseViolations: Violation[] = [];
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
      if (keptIds.has(j)) {
        buildingViolations.push({ kind: 'building', basis: 'game', s0: st.s[p.i], s1: st.s[p.i],
          title: 'The road runs through a building you kept',
          fix: `Buy out building #${j}, or move the road and its working strip clear of its footprint`,
          detail: `Building #${j} is retained: no acquisition is billed. The collision includes slopes/deck and the ${BUILDING_RULES.clearance} m working strip.`,
          rule: 'A kept building cannot be demolished by the road footprint or working strip.' });
        continue;
      }
      gone[j] = 1;
      buildingCost[p.i] += bld.cost[j];
      demolished.push({ j, i: p.i, cost: bld.cost[j] });
    }
    for (const o of buildingOverrides) {
      if (gone[o.j]) continue; // footprint acquisition already pays the building once
      const hit = best.get(o.j);
      let i = hit?.i ?? 0;
      if (!hit) {
        const [x, y] = items[o.j]; let distance = Infinity;
        for (let k = 0; k < n; k++) {
          const d2 = (x - st.x[k]) ** 2 + (y - st.y[k]) ** 2;
          if (d2 < distance) { distance = d2; i = k; }
        }
      }
      if (o.action === 'keep') kept.push({ j: o.j, i, hit: !!hit });
      else {
        gone[o.j] = 1;
        manualBuys.push({ j: o.j, i, cost: noiseBuyoutCost(bld.cost[o.j], bld.area[o.j]), reason: 'manual' });
      }
    }
    demolished.sort((p, q) => p.i - q.i);
  }

  // --- crossings of existing roads ---
  const crossingLump = new Float64Array(n), crossingStructure = new Float64Array(n);
  let crossingsPaid = 0;
  const crossingIssues = resolveCrossings(crossings, al.length, kind, width, urbanCentre, urban, crossingOverrides);
  crossingIssues.push(...buildCrossingGeometry(crossings, { ...st, grade, width, crownWidth: b,
    left: Float64Array.from(kind, (k, i) => k === KIND.earth ? sec.dayL[i] : width[i] / 2),
    right: Float64Array.from(kind, (k, i) => k === KIND.earth ? sec.dayR[i] : width[i] / 2),
  }, (x, y) => terrain.heightAt(x, y), ctx.roads));
  for (const c of crossings) {
    // SPK links/approaches/bridges receive other-objects surcharge; all-in junction/access do not.
    const lump = c.type === 'junction' ? c.cost : c.type === 'reconnection' && c.cls === 'service' && c.cost > 0 ? ACCESS : 0;
    crossingLump[c.i] += lump;
    crossingStructure[c.i] += c.cost - lump;
    if (c.cost > 0) crossingsPaid++;
  }

  // --- noise walls ---
  const wall = new Uint8Array(n), wallLength = new Float64Array(n), wallArea = new Float64Array(n);
  const noiseBuyouts = new Float64Array(n);
  let walls: WallStretch[] = [], boughtOut: Result['boughtOut'] = [];
  let receivers: NoiseReceiver[] = [], footprintMap: NoiseFootprint | null = null;
  const noiseModel = createNoiseModel(scenario.traffic, d.speed, { heavyShare: scenario.heavyShare });
  const wallOverrides = normalizeWallOverrides(d.wallOverrides);
  const wallMasks = wallOverrideMasks(st.s, wallOverrides);
  const wallGaps = crossingWallGaps(st, crossings, cat.crownWidth);
  // Explicit walls are construction even when there are no nearby buildings (or no building layer).
  const noiseBuildings = bld ?? (wallOverrides.length ? new BuildingIndex([]) : undefined);
  if (noiseBuildings) {
    const shieldL = new Uint8Array(n), shieldR = new Uint8Array(n);
    const edges: EarthEdges = { L: new Array(n), R: new Array(n) };
    for (let i = 0; i < n; i++) {
      if (kind[i] === KIND.tunnel) { shieldL[i] = shieldR[i] = 1; continue; }
      if (kind[i] !== KIND.earth) continue;
      // Positive cut edges only; no terrain shield under a bridge or at an embankment toe.
      if (sec.zDayL[i] > grade[i]) edges.L[i] = { offset: sec.dayL[i], height: sec.zDayL[i] - grade[i] };
      if (sec.zDayR[i] > grade[i]) edges.R[i] = { offset: sec.dayR[i], height: sec.zDayR[i] - grade[i] };
    }
    const barrier = noiseBarrier(cat.crownWidth);
    const ex = dwellingExposure(n, st.x, st.y, st.tx, st.ty, noiseBuildings, noiseModel, gone,
      grade, (x, y) => terrain.heightAt(x, y), shieldL, shieldR, barrier, edges,
      { keptBuildingIds: keptIds, wallL: wallMasks.L, wallR: wallMasks.R, gapL: wallGaps.L, gapR: wallGaps.R });
    const resolved = resolveNoiseWalls(ex, ds, al.length, shieldL, shieldR, barrier, edges);
    boughtOut = [...manualBuys, ...resolved.boughtOut].sort((a, b) => a.i - b.i);
    for (const p of boughtOut) noiseBuyouts[p.i] += p.cost;
    const fl = resolved.L, fr = resolved.R;
    for (let i = 0; i < n; i++) {
      wall[i] = (fl[i] ? 1 : 0) | (fr[i] ? 2 : 0);
      wallLength[i] = ((fl[i] ? 1 : 0) + (fr[i] ? 1 : 0)) * cellLength(i, n, ds);
      wallArea[i] = (fl[i] + fr[i]) * cellLength(i, n, ds);
    }
    walls = resolved.walls;
    receivers = resolved.receivers;
    noiseViolations.push(...noiseControlViolations(receivers, ex.scratch, st.s, cat.crownWidth));
    footprintMap = noiseFootprint(n, st.x, st.y, st.tx, st.ty, grade, (x, y) => terrain.heightAt(x, y), noiseModel,
      shieldL, shieldR, fl, fr, (i, left) => (kind[i] === KIND.earth ? (left ? sec.dayL[i] : sec.dayR[i]) : w), barrier, edges);
  }
  lap('town');

  const bridges = runs.filter((r) => r.kind === KIND.bridge).map((r) => r.length);
  const tunnels = runs.filter((r) => r.kind === KIND.tunnel).map((r) => r.length);
  const bridgeLength = bridges.reduce((a, v) => a + v, 0);
  const tunnelLength = tunnels.reduce((a, v) => a + v, 0);
  const parts = costParts({
    category: d.category, terrainClass: scenario.terrainClass, n, ds, kind, urban, h,
    cutI: sec.cutI, cutII: sec.cutII, cutIII: sec.cutIII, fill: sec.fill, usable,
    haul: { moment: mh.moment, reused: mh.reused, surplus: mh.surplus, deficit: mh.deficit },
    width, forest, runs, geotechnicalPerM, culverts, buildings: buildingCost, noiseBuyouts, crossingLump, crossingStructure, wallArea,
  });
  const cost = sumParts(parts);
  lap('cost');

  // --- checks ---
  const violations: Violation[] = [
    ...structureViolations,
    ...pinViolations,
    ...crossingIssues,
    ...buildingViolations,
    ...ROAD_CHECKS.horizontal(al, norms, { a: ctx.a, b: ctx.b, pis: d.pis }),
    ...ROAD_CHECKS.vertical(prof, norms, scenario.maxGradient),
  ];
  const waterCrossings: WaterResult[] = water.map((c, k) => {
    const i = Math.min(n - 1, Math.round(c.s / ds));
    const wd = sec.dayL[i] + sec.dayR[i], size = waterSize(c, wd);
    const above = waterZ[k] - terrain.heightAt(c.x, c.y);
    const tunnelRun = runs.find(r => r.kind === KIND.tunnel && i >= r.i0 && i <= r.i1);
    const shortTunnel = !!tunnelRun && tunnelRun.length < STRUCTURE_RULES.minTunnelLength;
    const isTunnel = kind[i] === KIND.tunnel && above <= -STRUCTURE_RULES.tunnelMinDepth && !shortTunnel;
    const run = runs.find(r => r.kind === KIND.bridge && i >= r.i0 && i <= r.i1);
    const bridgeSpan = Math.max(c.width + 2 * CULVERT_RULES.bridgeBanks, size.q100 / (CULVERT_RULES.velocity * 2) + 2 * CULVERT_RULES.bridgeBanks) / Math.max(0.01, c.sine);
    const clearBridge = !!run && c.s - bridgeSpan / 2 >= run.s0 && c.s + bridgeSpan / 2 <= run.s1;
    const need = kind[i] === KIND.bridge ? STRUCTURE_RULES.riverClearance : size.minHeight;
    const ok = isTunnel || (above >= need - 1e-6 && (kind[i] === KIND.bridge ? clearBridge : kind[i] === KIND.earth && size.type !== 'bridge'));
    if (!ok) violations.push({ kind: 'crossing', s0: c.s, s1: c.s,
      title: shortTunnel ? 'Watercourse tunnel is too short' : above < 0 ? 'Cut intercepts a watercourse' : 'Watercourse crossing is obstructed',
      fix: shortTunnel ? `Provide at least ${STRUCTURE_RULES.minTunnelLength} m of bored tunnel with sufficient cover, or pass above the channel` : size.type === 'bridge' || kind[i] === KIND.bridge ? `Provide a bridge clearing the channel and banks (${bridgeSpan.toFixed(1)} m opening along the road), at least ${need.toFixed(1)} m above the bed`
        : `Raise the road to at least ${need.toFixed(1)} m over the stream for ${waterOpening(size)}, or use a bridge`,
      detail: `Estimated Q100 ${size.q100.toFixed(2)} m³/s, DEM catchment ${c.catchmentKm2.toFixed(2)} km²${c.truncated ? ' (incomplete/uncertain)' : ''}. No automatic channel diversion is included. A deep bored tunnel can retain the surface watercourse.`,
      basis: 'game', rule: 'Provisional flood-capacity, cover and ecological screening; not a hydraulic design (research/17)',
    });
    let cost = kind[i] === KIND.earth && above > 0 ? culvertCost(c, wd) : 0;
    if (run) {
      for (let j = run.i0; j <= run.i1; j++) cost += parts.bridges[j];
      cost /= water.filter(other => other.s >= run.s0 && other.s <= run.s1).length;
    }
    return { ...c, i, bed: waterGround.get(c)!, h: above, q100: size.q100, structure: !ok ? 'blocked' : isTunnel ? 'tunnel' : kind[i] === KIND.bridge ? 'bridge' : size.type,
      opening: kind[i] === KIND.bridge ? `≥${bridgeSpan.toFixed(1)} m clear` : isTunnel ? 'surface channel retained' : waterOpening(size),
      length: run?.length ?? tunnelRun?.length ?? barrelLength(c, wd), cost, requiredBridge: size.type === 'bridge' };
  });
  // A channel parallel to the alignment can be buried without any centreline intersection.
  // No silent channel relocation: expose it as a conflict outside a priced crossing's barrel.
  const waterAlongside = new Map<number, { s0: number; s1: number }>();
  if (terrain.watercourses) for (let i = 0; i < n; i++) {
    if (kind[i] !== KIND.earth) continue;
    for (const hit of exposedWater(i, sec.dayL[i], sec.dayR[i])) {
      const range = waterAlongside.get(hit.id);
      if (range) range.s1 = st.s[i]; else waterAlongside.set(hit.id, { s0: st.s[i], s1: st.s[i] });
    }
  }
  for (const range of waterAlongside.values()) violations.push({ kind: 'crossing', ...range,
    title: 'Earthwork footprint intercepts a watercourse',
    fix: 'Move the alignment clear of the channel, or bridge it; channel diversion is not modelled',
    basis: 'game', rule: 'A parallel watercourse cannot be buried for free outside a priced crossing',
  });
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
  ranges((i) => kind[i] === KIND.earth && sec.open[i] === 1, (i0, i1) => {
    let above = 0, below = 0;
    for (let i = i0; i <= i1; i++) { above = Math.max(above, h[i]); below = Math.max(below, -h[i]); }
    violations.push(slopeViolation(st.s[i0], st.s[i1], above, below, 150));
  });
  if (mustBridge.length) {
    const zc = elevations(prof, mustBridge.map((c) => c.s));
    const last = new Map<string, number>();
    mustBridge.forEach((c, k) => {
      if (c.what === 'watercourse') return; // sized opening / actual structure checked above
      const ic = Math.min(n - 1, Math.round(c.s / ds));
      const above = zc[k] - c.g;
      if (kind[ic] === KIND.tunnel || above >= c.need - 1e-6) return;
      if (c.below !== undefined && above <= -c.below + 1e-6) return;
      if (c.s - (last.get(c.what) ?? -Infinity) < 50) return;
      last.set(c.what, c.s);
      violations.push(crossingViolation(c.s, c.what, above, c.need, c.below));
    });
  }
  for (let i = 0; i < n; i++) {
    if (!oob[i]) continue;
    let j = i;
    while (j + 1 < n && oob[j + 1]) j++;
    violations.push(oobViolation(st.s[i], st.s[j], st.s[j] - st.s[i] + ds));
    i = j;
  }
  if (!profileFeasible && d.profileMode === 'auto' && pinViolations.length === 0) {
    violations.push(profileViolation(al.length, scenario.maxGradient));
  }
  violations.splice(0, violations.length, ...mergeNearby(violations));
  const travelMin = al.length / (d.speed / 3.6) / 60;
  const minCategory = minCategoryForTraffic(scenario.traffic);
  if (CATEGORY_RANK[d.category] < CATEGORY_RANK[minCategory]) {
    violations.push(categoryViolation(al.length, d.category, scenario.traffic, minCategory));
  }
  if (travelMin > scenario.maxTravelMin + 1e-9) {
    violations.push(timeViolation(al.length, d.speed, travelMin, scenario.maxTravelMin));
  }
  violations.push(...noiseViolations); // grouped noise issues never hide geometric/goal constraints
  const geomViolations = violations.filter((v) => !v.goal).length;
  lap('total');

  return {
    length: al.length, ds, n, s: st.s, x: st.x, y: st.y, tx: st.tx, ty: st.ty, ground, grade, kind,
    geology: { ids: groundIds, profiles: groundProfiles },
    cut: sec.cut, fill: sec.fill, dayL: sec.dayL, dayR: sec.dayR, zDayL: sec.zDayL, zDayR: sec.zDayR, oob, runs,
    vpis, vcurves: prof.curves.map((c) => ({ s: c.s, z: c.z, len: c.lenEff, r: c.r, type: c.type })), grades: prof.grades,
    curves: al.curves.map((c) => ({ index: c.index, x: c.x, y: c.y, r: c.r, rEff: c.rEff, delta: c.delta, auto: c.auto, sStart: c.sStart, sEnd: c.sEnd, t: c.t, unit: c.unit })),
    violations, geomViolations, cost, parts, cell: { width, urban, forest, wall }, crossings, waterCrossings, walls, demolished, boughtOut, kept,
    noise: { receivers, footprint: footprintMap },
    quantities: {
      cut: vol.cut, fill: vol.fill, reused: mh.reused, surplus: mh.surplus, deficit: mh.deficit, avgHaul: mh.avgHaul,
      cutByClass, footprint, forestArea, buildingsHit: demolished.length, hitBuildings: demolished.map((p) => p.j),
      bridgeLength, tunnelLength, bridges: bridges.length, tunnels: tunnels.length, massHaul: vol.mass,
      urbanLength, wallLength: wallLength.reduce((a, v) => a + v, 0),
      wallArea: wallArea.reduce((a, v) => a + v, 0), noiseBuyouts: boughtOut.length,
      crossingsPaid, noiseDistance: noiseModel.contour, materialValue,
    },
    travelMin, minCategory, valid: violations.length === 0, profileFeasible, timing,
  };
}
