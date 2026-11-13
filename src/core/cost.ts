// Cost model (2026 prices, CZK excl. VAT). All numbers come from data/*.ts.

import { CATEGORIES, type CategoryId, type TerrainClass } from './data/categories';
import { LAND, NORM_EARTHWORK_ALLOWANCE, PRICES } from './data/prices';

/** value of the earthworks already included in the SFDI per-km norm, CZK per km */
export function allowanceValuePerKm(cat: CategoryId): number {
  const c = CATEGORIES[cat];
  const cut = NORM_EARTHWORK_ALLOWANCE.cutPerKm[c.roadClass];
  const fill = cut * NORM_EARTHWORK_ALLOWANCE.fillShareOfCut;
  const topsoilArea = 1000 * (c.crownWidth + NORM_EARTHWORK_ALLOWANCE.topsoilExtraWidth);
  return cut * PRICES.excavation + fill * PRICES.fillPlacing + topsoilArea * PRICES.topsoilDepth * PRICES.topsoil;
}

/** road base price per km: the norm minus the value of its built-in earthworks allowance */
export function basePerKm(cat: CategoryId, terrain: TerrainClass): number {
  return CATEGORIES[cat].normPerKm[terrain] - allowanceValuePerKm(cat);
}

export function tunnelPerKm(length: number): number {
  return length > PRICES.tunnelLongThreshold ? PRICES.tunnelLongPerKm : PRICES.tunnelShortPerKm;
}

/**
 * Marginal prices used for *decisions* (auto-profile, bridge vs embankment) before the global
 * mass balance is known: cut is assumed to be surplus half of the time (hauled 10 km), fill is
 * assumed to be bought 30 % of the time (tuned so auto-profiles come out roughly balanced on the
 * D11 terrain). The final bill uses the real mass balance.
 */
export const DECISION = {
  cutPerM3: PRICES.excavation + 0.5 * PRICES.surplusHaulKm * PRICES.haulPerM3Km,
  fillPerM3: PRICES.fillPlacing + 0.3 * PRICES.borrowFill,
  landPerM2: LAND.perM2 + PRICES.topsoilDepth * PRICES.topsoil,
};

export interface EarthworkQuantities {
  cut: number; // m³
  fill: number; // m³
  /** haul moment of the internally reused material, m³·m */
  haulMoment: number;
  /** cut that is not reused and is hauled to a tip, m³ */
  surplus: number;
  /** fill that must be bought, m³ */
  deficit: number;
  /** footprint of at-grade road incl. slopes, m² */
  footprint: number;
}

export interface CostInput {
  category: CategoryId;
  terrainClass: TerrainClass;
  /** length of at-grade road (not on bridges / in tunnels), m */
  atGradeLength: number;
  earth: EarthworkQuantities;
  bridges: number[]; // lengths, m
  tunnels: number[]; // lengths, m
  /** extra land: bridge deck area, m² */
  bridgeLand: number;
  forestArea: number; // m² of at-grade footprint in forest
  buildingsHit: number;
}

export interface CostBreakdown {
  roadBase: number;
  earthworks: number;
  earthDetail: { excavation: number; fillPlacing: number; haul: number; surplusHaul: number; borrow: number; topsoil: number };
  bridges: number;
  tunnels: number;
  construction: number;
  surcharge: number;
  land: number;
  landDetail: { land: number; forest: number; buildings: number };
  total: number;
}

export function rollup(i: CostInput): CostBreakdown {
  const roadBase = (i.atGradeLength / 1000) * basePerKm(i.category, i.terrainClass);
  const e = i.earth;
  const earthDetail = {
    excavation: e.cut * PRICES.excavation,
    fillPlacing: e.fill * PRICES.fillPlacing,
    haul: (e.haulMoment / 1000) * PRICES.haulPerM3Km,
    surplusHaul: e.surplus * PRICES.surplusHaulKm * PRICES.haulPerM3Km,
    borrow: e.deficit * PRICES.borrowFill,
    topsoil: e.footprint * PRICES.topsoilDepth * PRICES.topsoil,
  };
  const earthworks = Object.values(earthDetail).reduce((a, b) => a + b, 0);
  const bridges = i.bridges.reduce((a, L) => a + (L / 1000) * CATEGORIES[i.category].bridgePerKm, 0);
  const tubes = CATEGORIES[i.category].tunnelTubes;
  const tunnels = i.tunnels.reduce((a, L) => a + tubes * (L / 1000) * tunnelPerKm(L), 0);
  const construction = roadBase + earthworks + bridges + tunnels;
  const surcharge = construction * PRICES.otherObjectsSurcharge;
  const landDetail = {
    land: (e.footprint + i.bridgeLand) * LAND.perM2,
    forest: i.forestArea * LAND.forestExtraPerM2,
    buildings: i.buildingsHit * LAND.perBuilding,
  };
  const land = landDetail.land + landDetail.forest + landDetail.buildings;
  return {
    roadBase, earthworks, earthDetail, bridges, tunnels, construction, surcharge, land, landDetail,
    total: construction + surcharge + land,
  };
}
