// Explicit high-earthwork engineering allowances. Not a geotechnical design; see research/15.
import { STRUCTURE_RULES } from './data/prices';

/** Height above/below crown at offset x beyond its edge, including horizontal maintenance benches. */
export function slopeHeight(x: number, slope: number, fill: boolean): number {
  const r = STRUCTURE_RULES, width = fill ? r.fillBermWidth : r.cutBermWidth;
  const rise = r.bermInterval, period = slope * rise + width;
  const k = Math.floor(x / period), rem = x - k * period;
  return k * rise + Math.min(rise, rem / slope);
}

/** Next kink in the stepped slope, to integrate benches without smearing their corners. */
export function nextSlopeKink(x: number, slope: number, fill: boolean): number {
  const r = STRUCTURE_RULES, width = fill ? r.fillBermWidth : r.cutBermWidth;
  const run = slope * r.bermInterval, period = run + width;
  const k = Math.floor((x + 1e-8) / period), edge = k * period + run;
  return edge > x + 1e-8 ? edge : (k + 1) * period;
}

/** Flat-ground prism including benches; used by the same DP estimate as the sampled sections. */
export function flatEarthGeometry(h: number, crown: number, slope: number, fill: boolean) {
  h = Math.max(0, h);
  const r = STRUCTURE_RULES, bw = fill ? r.fillBermWidth : r.cutBermWidth;
  let area = crown * h + slope * h * h, width = crown + 2 * slope * h;
  for (let level = r.bermInterval; level < h - 1e-8; level += r.bermInterval) {
    area += 2 * bw * (h - level); width += 2 * bw;
  }
  return { area, width };
}

/** Extra cut area below each depth cap from benches, both sides, on flat ground. */
export function flatBermCutBands(depth: number, capI: number, capII: number): [number, number, number] {
  let a = 0, a1 = 0, a2 = 0;
  for (let level = STRUCTURE_RULES.bermInterval; level < depth; level += STRUCTURE_RULES.bermInterval) {
    const w = 2 * STRUCTURE_RULES.cutBermWidth, d = depth - level;
    a += w * d; a1 += w * Math.min(d, capI); a2 += w * Math.min(d, capII);
  }
  return [a1, a2 - a1, a - a2];
}

/** CZK per route metre, before surcharge; charged even when fill comes free from the route's cuts.
 * PROVISIONAL reserve for reinforcement, drainage, foundation treatment and slope stabilization.
 * Heights are geometry, NOT an inference of excavability or a universal Czech legal limit. */
export function earthEngineeringPerM(h: number, cut: number, fill: number): number {
  const r = STRUCTURE_RULES;
  return fill * Math.max(0, h - r.engineeringFromHeight) * r.highFillPerM3PerM
    + cut * Math.max(0, -h - r.engineeringFromHeight) * r.highCutPerM3PerM;
}

/** Excess barrel length beyond drainage already represented by the SPK road norm. */
export function culvertExtra(width: number, crown: number): number {
  const r = STRUCTURE_RULES;
  return Math.max(0, width - crown - r.culvertIncludedExtraWidth) * r.culvertExtraPerM;
}
