// Flat rural S9.5 sensitivity, not a universal design threshold. Ignores run minima/merging.
// npx tsx scripts/bridge-break-even.ts
import { basePerKm, decisionPrices } from '../src/core/cost';
import { CATEGORIES } from '../src/core/data/categories';
import { LAND, MATERIAL_VALUE, PRICES, STRUCTURE_RULES } from '../src/core/data/prices';
import { culvertExtra, earthEngineeringPerM, flatEarthGeometry } from '../src/core/earthengineering';
const cat = CATEGORIES['S9.5'], b = cat.crownWidth, slope = 2, sur = 1 + PRICES.otherObjectsSurcharge;
const bridge = cat.bridgePerKm / 1000 * sur + b * LAND.perM2;
const base = basePerKm('S9.5', 'hilly') / 1000;
console.log(`S9.5 hilly rural; bridge ${(bridge / 1000).toFixed(1)}k CZK/m incl surcharge+land`);
for (const lambda of [MATERIAL_VALUE.lo, 0, 100, 200, MATERIAL_VALUE.hi]) {
  const p = decisionPrices(lambda).fillPerM3;
  const earth = (h: number, modern: boolean, stream: boolean) => {
    const g = modern ? flatEarthGeometry(h, b, slope, true) : { area: b * h + slope * h * h, width: b + 2 * slope * h };
    return (base + g.area * p + g.width * PRICES.topsoil * PRICES.topsoilDepth
      + (modern ? earthEngineeringPerM(h, 0, g.area) : 0)
      + (stream ? culvertExtra(g.width, b) / STRUCTURE_RULES.minBridgeLength : 0)) * sur + g.width * LAND.perM2;
  };
  const threshold = (modern: boolean, stream = false) => {
    for (let h = STRUCTURE_RULES.bridgeMinHeight; h <= 100; h += 0.01) if (earth(h, modern, stream) >= bridge) return `${h.toFixed(2)}m`;
    return '>100m / no crossing';
  };
  console.log(`λ=${lambda}: old ${threshold(false)}, engineered ${threshold(true)}, one stream per 30m ${threshold(true, true)}`);
}
