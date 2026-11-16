// Flat rural S9.5 sensitivity, not a universal design threshold. Uniform runs incl. abutments.
// (The model-11 "excess culvert length" column went with that rule: stream crossings are sized and priced
// from their catchment since c6d7232, core/watercourses.ts; research/17.)
// npx tsx scripts/bridge-break-even.ts
import { basePerKm, decisionPrices } from '../src/core/cost';
import { bridgeModel } from '../src/core/bridge';
import { CATEGORIES } from '../src/core/data/categories';
import { LAND, MATERIAL_VALUE, PRICES, STRUCTURE_RULES } from '../src/core/data/prices';
import { earthEngineeringPerM, flatEarthGeometry } from '../src/core/earthengineering';
const cat = CATEGORIES['S9.5'], b = cat.crownWidth, slope = 2, sur = 1 + PRICES.otherObjectsSurcharge;
const bridge = cat.bridgePerKm / 1000 * sur + b * LAND.perM2, model = bridgeModel(cat);
const base = basePerKm('S9.5', 'hilly') / 1000;
console.log(`S9.5 hilly rural; old flat bridge ${(bridge / 1000).toFixed(1)}k CZK/m incl surcharge+land`);
for (const lambda of [MATERIAL_VALUE.lo, 0, 100, 200, MATERIAL_VALUE.hi]) {
  const p = decisionPrices(lambda).fillPerM3;
  const earth = (h: number, modern: boolean) => {
    const g = modern ? flatEarthGeometry(h, b, slope, true) : { area: b * h + slope * h * h, width: b + 2 * slope * h };
    return (base + g.area * p + g.width * PRICES.topsoil * PRICES.topsoilDepth
      + (modern ? earthEngineeringPerM(h, 0, g.area) : 0)) * sur + g.width * LAND.perM2;
  };
  const threshold = (length = 0, modern = true) => {
    for (let h = STRUCTURE_RULES.bridgeMinHeight; h <= 100; h += 0.01) {
      const rate = length ? model.total(length, h) / length * sur + b * LAND.perM2 : bridge;
      if (earth(h, modern) >= rate) return `${h.toFixed(2)}m`;
    }
    return '>100m / no crossing';
  };
  console.log(`λ=${lambda}: old earth ${threshold(0, false)}, model11 ${threshold()}, model12 L30 ${threshold(30)}, L120 ${threshold(120)}, L300 ${threshold(300)}`);
}
