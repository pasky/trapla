// Flat rural S9.5 sensitivity, not a universal design threshold. Uniform runs incl. abutments.
// Fill height above which a bridge of the given length is cheaper than the embankment: on firm dry ground,
// on soft ground (subgrade treated, data/prices.ts SUBGRADE) and over a stream (one culvert or buried bridge
// under the fill, data/culverts.ts), against cost model 28 (1:2 with a 2 m bench every 6 m, the PROVISIONAL
// high-fill reserve of 35 CZK/m³ per metre above 6 m, culverts at any depth).
// npx tsx scripts/bridge-break-even.ts
import { basePerKm, decisionPrices, surchargeRate } from '../src/core/cost';
import { bridgeModel } from '../src/core/bridge';
import { CATEGORIES } from '../src/core/data/categories';
import { LAND, MATERIAL_VALUE, PRICES, STRUCTURE_RULES } from '../src/core/data/prices';
import { groundWorksPerM, treatedSubgrade } from '../src/core/earthengineering';
import { flatSection } from '../src/core/sections';
import { culvertCost, waterSize, type WaterCrossing } from '../src/core/watercourses';
const cat = CATEGORIES['S9.5'], b = cat.crownWidth, sur = 1 + surchargeRate(0);
const model = bridgeModel(cat);
const base = basePerKm('S9.5', 'hilly') / 1000;
const soft = { key: 'loam', name: 'loam', classIto: 4, classIIto: 8 };
/** a natural stream draining 5 km², 2 m wide, crossing square (a frame with dry banks) */
const stream = { id: 1, s: 0, x: 0, y: 0, sine: 1, width: 2, catchmentKm2: 5, truncated: false, waterKind: 'stream' } as unknown as WaterCrossing;
/** cost model 28's fill: 1:2 with a 2 m bench every 6 m, and its reserve */
const model28 = (h: number) => {
  let area = b * h + 2 * h * h, width = b + 4 * h;
  for (let level = 6; level < h - 1e-8; level += 6) { area += 4 * (h - level); width += 4; }
  return { area, width, works: area * Math.max(0, h - 6) * 35 };
};
const now = (h: number, ground?: typeof soft) => {
  const g = flatSection(h, b);
  return { ...g, works: groundWorksPerM(0, ground && treatedSubgrade(h, ground) ? g.width : 0) };
};
console.log('S9.5 hilly rural, flat valley floor: fill height where a bridge of length L becomes cheaper, now (cost model 28); * = the culvert would be over 100 m long');
for (const lambda of [MATERIAL_VALUE.lo, 0, 200, MATERIAL_VALUE.hi]) {
  const p = decisionPrices(lambda).fillPerM3;
  const earth = (g: { area: number; width: number; works: number }) =>
    (base + g.area * p + g.width * PRICES.topsoil * PRICES.topsoilDepth + g.works) * sur + g.width * LAND.perM2;
  const threshold = (L: number, g: (h: number) => { area: number; width: number; works: number }, water: 'now' | 'old' | null) => {
    for (let h = STRUCTURE_RULES.bridgeMinHeight; h <= 100; h += 0.01) {
      // a stream under a fill wider than any culvert may be (100 m, research/17) must be bridged
      if (water && waterSize(stream, g(h).width, water === 'now' ? h : 0).type === 'bridge') return `${h.toFixed(1)}*`;
      const fill = earth(g(h)) * L + (water ? culvertCost(stream, g(h).width, water === 'now' ? h : 0) * sur : 0);
      if (fill >= model.total(L, h) * sur + b * LAND.perM2 * L) return `${h.toFixed(1)}`;
    }
    return '>100';
  };
  const row = (L: number) => `L${L}: firm ${threshold(L, h => now(h), null)} (${threshold(L, model28, null)}), soft ${threshold(L, h => now(h, soft), null)}, over a stream ${threshold(L, h => now(h, soft), 'now')} (${threshold(L, model28, 'old')}) m`;
  console.log(`λ=${lambda.toFixed(0)}: ` + [30, 120].map(row).join(' | '));
}
