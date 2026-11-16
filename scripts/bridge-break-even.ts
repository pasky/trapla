// Flat rural S9.5 sensitivity, not a universal design threshold. Uniform runs incl. abutments.
// Fill height above which a bridge of the given length is cheaper than the embankment, for the current side
// slopes (VL 1 2022, no reserve: research/48) and for the cost-model-28 slopes (1:2 with a 2 m bench every
// 6 m, plus the PROVISIONAL high-fill reserve of 35 CZK/m³ per metre above 6 m) at the same prices.
// npx tsx scripts/bridge-break-even.ts
import { basePerKm, decisionPrices, surchargeRate } from '../src/core/cost';
import { bridgeModel } from '../src/core/bridge';
import { CATEGORIES } from '../src/core/data/categories';
import { LAND, MATERIAL_VALUE, PRICES, STRUCTURE_RULES } from '../src/core/data/prices';
import { flatSection } from '../src/core/sections';
const cat = CATEGORIES['S9.5'], b = cat.crownWidth, sur = 1 + surchargeRate(0);
const model = bridgeModel(cat);
const base = basePerKm('S9.5', 'hilly') / 1000;
/** cost model 28's fill: 1:2 with a 2 m bench every 6 m, and its reserve */
const model28 = (h: number) => {
  let area = b * h + 2 * h * h, width = b + 4 * h;
  for (let level = 6; level < h - 1e-8; level += 6) { area += 4 * (h - level); width += 4; }
  return { area, width, reserve: area * Math.max(0, h - 6) * 35 };
};
console.log('S9.5 hilly rural, flat ground: fill height where a bridge becomes cheaper');
for (const lambda of [MATERIAL_VALUE.lo, 0, 100, 200, MATERIAL_VALUE.hi]) {
  const p = decisionPrices(lambda).fillPerM3;
  const earth = (h: number, old: boolean) => {
    const g = old ? model28(h) : { ...flatSection(h, b), reserve: 0 };
    return (base + g.area * p + g.width * PRICES.topsoil * PRICES.topsoilDepth + g.reserve) * sur + g.width * LAND.perM2;
  };
  const threshold = (length: number, old: boolean) => {
    for (let h = STRUCTURE_RULES.bridgeMinHeight; h <= 100; h += 0.01)
      if (earth(h, old) >= model.total(length, h) / length * sur + b * LAND.perM2) return `${h.toFixed(2)} m`;
    return '> 100 m';
  };
  console.log(`λ=${lambda.toFixed(0)}: ` + [30, 120, 300].map(L => `L${L} ${threshold(L, true)} (model 28: ${threshold(L, false)})`).join(', '));
}
