// Reproduce the worked examples and qualified EIA comparisons in research/11-noise-calculation.md.
// These are NOT acceptance tests: local road elevation/speed and source attribution are incomplete.
import { createNoiseModel, noiseLevels, type NoiseOptions } from '../src/core/road-noise';

for (const speed of [80, 90]) {
  const model = createNoiseModel(9000, speed);
  console.log(`${speed} km/h: Yday=${model.dayDb.toFixed(3)}, Ynight=${model.nightDb.toFixed(3)} dB;`
    + ` low contour=${model.contour.toFixed(2)} m axis; hard search radius=${model.radius.toFixed(2)} m source`);
  for (const h of [1.5, 4.5, 10.5]) {
    let lo = 1.75, hi = model.radius + 1.75;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (noiseLevels(mid, h, model).excessDb > 0) lo = mid; else hi = mid;
    }
    console.log(`  h=${h}: contour=${hi.toFixed(2)} m; 50 m:`, noiseLevels(50, h, model));
  }
}
function compare(name: string, q: number, speed: number, options: NoiseOptions,
  distance: number, heights: number[], reported: [number, number][]) {
  for (const ground of ['mixed', 'hard'] as const) {
    const model = createNoiseModel(q, speed, { ...options, ground });
    heights.forEach((h, k) => {
      const l = noiseLevels(distance, h, model), study = reported[k];
      console.log(`${name}, ${ground}, h=${h}: ${l.dayDb.toFixed(1)}/${l.nightDb.toFixed(1)} dB;`
        + ` study ${study.join('/')}; delta ${(l.dayDb - study[0]).toFixed(1)}/${(l.nightDb - study[1]).toFixed(1)}`);
    });
  }
}
// Třebíč figure 1 K1-B counts, NOT proven to be the exact RKB1 link. Speed 90/80 assumed.
compare('I/23 Třebíč RKB1, conditional K1-B flow', 4688, 90,
  { heavyShare: 541 / 4688, lightNightShare: 255 / 4147, heavyNightShare: 57 / 541 },
  53, [2, 5], [[53, 45.6], [55.7, 48.3]]);
// II/360 comparator, not class I: LN allocated 40% to NA; TP219 class II night split.
// Keep class-I emission constants: class-II heavy constant is 0.2 dB higher (small remaining bias).
const p = (126 + 5 + 0.4 * 209) / 3478;
compare('II/360 Jaroměřice point17, south-link assumption', 3478, 90,
  { heavyShare: p, lightNightShare: 0.053 + 0.1 * p, heavyNightShare: 0.075 },
  30, [1.5, 4.5], [[55.2, 46.5], [56.7, 48]]);
