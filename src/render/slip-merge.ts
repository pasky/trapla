// A slip road beside its motorway, drawn as one body of earthworks (display only; what each bills is the engine's,
// the overlap credited by core/slip-roads.ts). Each road's Result has its own slopes to the ground; beside each other:
// - where the slip road's crown lies on the motorway's formation (by its gore), neither has a slope between them
//   (the slip road's inner slope and the motorway's outer slope there are under the other's pavement);
// - where both are in cutting with their faces meeting between them, each face ends at the ridge where they meet
//   (drawn to the ground, the two faces stood up as a blade of earth at full ground height);
// - embankments side by side are drawn as they are (the higher face is the surface, as built).
// Returns shallow copies with those stations' daylight changed (and the ridge heights), or the inputs unchanged.
import { CATEGORIES } from '../core/data/categories';
import type { Result } from '../core/evaluate';
import { KIND } from '../core/structures';

type Arrays = { dayL: Float64Array; dayR: Float64Array; zDayL: Float64Array; zDayR: Float64Array; apexL: Float32Array; apexR: Float32Array };
const copy = (r: Result): Arrays => ({ dayL: Float64Array.from(r.dayL), dayR: Float64Array.from(r.dayR), zDayL: Float64Array.from(r.zDayL),
  zDayR: Float64Array.from(r.zDayR), apexL: r.apexL ? Float32Array.from(r.apexL) : new Float32Array(r.n).fill(NaN), apexR: r.apexR ? Float32Array.from(r.apexR) : new Float32Array(r.n).fill(NaN) });

export function mergeSlipRoads(motorway: Result, slips: readonly Result[]): { motorway: Result; slips: Result[] } {
  const wm = CATEGORIES['D27.5'].crownWidth / 2, wr = CATEGORIES['V7.25'].crownWidth / 2;
  const own: { m: Arrays | null } = { m: null };
  const out: Result[] = [];
  for (const ramp of slips) {
    const mine: { r: Arrays | null } = { r: null };
    let last = -1;
    for (let q = 0; q < ramp.n; q++) {
      // (the nearest station of the motorway: searched near the last one after the first)
      let k = 0, dd = Infinity;
      const j0 = last < 0 ? 0 : Math.max(0, last - 40), j1 = last < 0 ? motorway.n - 1 : Math.min(motorway.n - 1, last + 40);
      for (let j = j0; j <= j1; j++) { const e = Math.hypot(motorway.x[j] - ramp.x[q], motorway.y[j] - ramp.y[q]); if (e < dd) { dd = e; k = j; } }
      last = k;
      if (ramp.kind[q] !== KIND.earth) continue;
      if (motorway.kind[k] !== KIND.earth || !(dd > 1e-6) || dd > wm + wr + 80) continue;
      // across the motorway's line towards the slip road: which side of each faces the other
      const nx = (ramp.x[q] - motorway.x[k]) / dd, ny = (ramp.y[q] - motorway.y[k]) / dd;
      const mLeft = -motorway.ty[k] * nx + motorway.tx[k] * ny > 0, rLeft = -ramp.ty[q] * -nx + ramp.tx[q] * -ny > 0;
      const dayM = (mLeft ? motorway.dayL : motorway.dayR)[k], zDayM = (mLeft ? motorway.zDayL : motorway.zDayR)[k], zm = motorway.grade[k];
      const dayR = (rLeft ? ramp.dayL : ramp.dayR)[q], zDayR = (rLeft ? ramp.zDayL : ramp.zDayR)[q], zr = ramp.grade[q];
      const setM = (day: number, z: number, apex: number) => { const m = own.m ??= copy(motorway); (mLeft ? m.dayL : m.dayR)[k] = day; (mLeft ? m.zDayL : m.zDayR)[k] = z; (mLeft ? m.apexL : m.apexR)[k] = apex; };
      const setR = (day: number, z: number, apex: number) => { const r = mine.r ??= copy(ramp); (rLeft ? r.dayL : r.dayR)[q] = day; (rLeft ? r.zDayL : r.zDayR)[q] = z; (rLeft ? r.apexL : r.apexR)[q] = apex; };
      if (dd - wr <= wm + 1e-6) {
        // crowns side by side or overlapping: one paved area, no slope between them
        // (ended at the pavement's edge, as a ridge: no ground collar over the other road)
        if (dayM > wm) setM(Math.min(dayM, Math.max(wm, dd - wr)), zm, zm);
        if (dayR > wr) setR(wr, zr, zr);
        continue;
      }
      // both cuttings, their faces meeting between the crowns: x from the motorway's line, faces linear crown → daylight
      if (!(zDayM > zm && zDayR > zr) || !(dayM > wm) || !(dayR > wr)) continue;
      const lo = dd - dayR, hi = dayM;
      if (!(hi > Math.max(wm, lo))) continue; // (they do not reach each other)
      const fm = (x: number) => zm + (zDayM - zm) * (x - wm) / (dayM - wm), fr = (x: number) => zr + (zDayR - zr) * ((dd - x) - wr) / (dayR - wr);
      // fm rises outward from the motorway, fr rises towards it: the crossing is where fm − fr changes sign
      const a = Math.max(wm, lo), b = Math.min(hi, dd - wr);
      if (!(b > a)) continue;
      const ga = fm(a) - fr(a), gb = fm(b) - fr(b);
      if (!(ga <= 0 && gb >= 0)) continue;
      const x = a + (b - a) * (ga === gb ? 0.5 : -ga / (gb - ga)), z = fm(x);
      // (the nearer ridge wins where several stations of one meet one of the other)
      const mNow = (own.m ? (mLeft ? own.m.dayL : own.m.dayR) : (mLeft ? motorway.dayL : motorway.dayR))[k];
      if (x < mNow) setM(x, z, z);
      setR(dd - x, z, z);
    }
    out.push(mine.r ? { ...ramp, ...mine.r } as Result : ramp);
  }
  return { motorway: own.m ? { ...motorway, ...own.m } as Result : motorway, slips: out };
}
