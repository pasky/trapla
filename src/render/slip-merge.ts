// A slip road beside its motorway, drawn as one body of earthworks (display only; what each bills is the engine's,
// the overlap credited by core/slip-roads.ts). Each road's Result has its own slopes to the ground; beside each other:
// - where the slip road's crown lies on the motorway's formation (by its gore) at its height, neither has a slope
//   between them (the slip road's inner slope and the motorway's outer slope there are under the other's pavement);
// - where both are in cutting with a ridge too narrow to keep between them, it is dug out (and billed so): one slope
//   from crown edge to crown edge, each face ending halfway on it;
// - embankments side by side are drawn as they are (the higher face is the surface, as built).
// Returns shallow copies with those stations' daylight changed (and the ridge heights), or the inputs unchanged.
import { CATEGORIES } from '../core/data/categories';
import type { Result } from '../core/evaluate';
import { KIND } from '../core/structures';
import { FACE_AT } from '../core/sections';
import { dugRidges, STEP_TOLERANCE } from '../core/slip-roads';

// (`faceL`/`faceR`: the engine's face samples, dropped where a face is ended here: drawn straight to its new end)
type Arrays = { dayL: Float64Array; dayR: Float64Array; zDayL: Float64Array; zDayR: Float64Array; apexL: Float32Array; apexR: Float32Array;
  faceL: (number[] | undefined)[]; faceR: (number[] | undefined)[] };
const copy = (r: Result): Arrays => ({ dayL: Float64Array.from(r.dayL), dayR: Float64Array.from(r.dayR), zDayL: Float64Array.from(r.zDayL),
  zDayR: Float64Array.from(r.zDayR), apexL: r.apexL ? Float32Array.from(r.apexL) : new Float32Array(r.n).fill(NaN), apexR: r.apexR ? Float32Array.from(r.apexR) : new Float32Array(r.n).fill(NaN),
  faceL: r.faceL ? r.faceL.slice() : new Array(r.n).fill(undefined), faceR: r.faceR ? r.faceR.slice() : new Array(r.n).fill(undefined) });

/** one side of a station ended at (day, z), on a ridge at `apex` */
function set(a: Arrays, left: boolean, i: number, day: number, z: number, apex: number) {
  (left ? a.dayL : a.dayR)[i] = day; (left ? a.zDayL : a.zDayR)[i] = z; (left ? a.apexL : a.apexR)[i] = apex; (left ? a.faceL : a.faceR)[i] = undefined;
}
/** at most this many motorway stations in a row met by no slip road station, between two that are, follow them */
const GAP = 2;
export function mergeSlipRoads(motorway: Result, slips: readonly Result[], heightAt: (x: number, y: number) => number): { motorway: Result; slips: Result[] } {
  const wm = CATEGORIES['D27.5'].crownWidth / 2, wr = CATEGORIES['V7.25'].crownWidth / 2;
  const own: { m: Arrays | null } = { m: null };
  const out: Result[] = [];
  for (const ramp of slips) {
    const mine: { r: Arrays | null } = { r: null }, ridge = dugRidges(ramp, motorway, heightAt);
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
      const dayM = (mLeft ? motorway.dayL : motorway.dayR)[k], zm = motorway.grade[k];
      const dayR = (rLeft ? ramp.dayL : ramp.dayR)[q], zr = ramp.grade[q];
      const setM = (day: number, z: number, apex: number) => set(own.m ??= copy(motorway), mLeft, k, day, z, apex);
      const setR = (day: number, z: number, apex: number) => set(mine.r ??= copy(ramp), rLeft, q, day, z, apex);
      if (dd - wr <= wm + 1e-6) {
        // crowns side by side or overlapping, at one height: one paved area, no slope between them (at another height
        // each keeps its slopes, drawn as built: the clash is the slip road's problem, core/slip-roads.ts)
        if (Math.abs(zm - zr) > STEP_TOLERANCE) continue;
        // (ended at the pavement's edge, as a ridge: no ground collar over the other road)
        if (dayM > wm) setM(Math.min(dayM, Math.max(wm, dd - wr)), zm, zm);
        if (dayR > wr) setR(wr, zr, zr);
        continue;
      }
      // both cuttings with a ridge too narrow to keep between them: dug out to one slope from crown edge to crown
      // edge, and its nose cut down along the road where that ends, as billed (core/slip-roads.ts dugRidges): each
      // face ends halfway, on that bottom
      // (the slip road's face covers all of it, to the motorway's crown edge, the motorway's face there ended at its
      // crown edge: one surface between them, not two faces that would have to meet exactly; a nose drawn as its
      // face's samples, up to the ridge left and down to the motorway)
      if (!Number.isFinite(ridge.x[q])) continue;
      const kr = ridge.k[q], ml = ridge.mLeft[q] === 1, m = own.m ??= copy(motorway), zk = motorway.grade[kr], d = ridge.d[q];
      set(m, ml, kr, wm, zk, zk);
      const r = mine.r ??= copy(ramp), rl = ridge.rLeft[q] === 1;
      // (a hand's breadth under the motorway's crown edge: no sliver of sky between them)
      // (measured across the slip road, which may run askew to the motorway there)
      set(r, rl, q, (d - wm) / ridge.cos[q] + 0.25, zk, zk);
      const x = ridge.x[q], z = ridge.z[q], across = d - wm - wr;
      // (u: from the slip road's crown edge, d − wr from the motorway's line, to the motorway's, wm)
      const at = (u: number) => { const o = d - wr - u * across; return o >= x ? zr + (z - zr) * (d - wr - o) / Math.max(1e-6, d - wr - x) : z + (zk - z) * (x - o) / Math.max(1e-6, x - wm); };
      if (Math.abs(z - (zr + (zk - zr) * (d - wr - x) / Math.max(1e-6, across))) > 0.05) (rl ? r.faceL : r.faceR)[q] = FACE_AT.map(at);
    }
    out.push(mine.r ? { ...ramp, ...mine.r } as Result : ramp);
  }
  // (the slip road's stations meet the motorway's at a slightly different spacing: a motorway station between two
  // that end on the slip road's pavement or ridge, met by none of its own, would stand its full face up between them,
  // a blade of ground; it ends as they do)
  if (own.m) for (const [day, zDay, apex, face] of [[own.m.dayL, own.m.zDayL, own.m.apexL, own.m.faceL], [own.m.dayR, own.m.zDayR, own.m.apexR, own.m.faceR]] as const)
    for (let k = 1; k < motorway.n - 1; k++) {
      if (Number.isFinite(apex[k]) || !Number.isFinite(apex[k - 1])) continue;
      let j = k + 1; while (j < motorway.n && j <= k + GAP && !Number.isFinite(apex[j])) j++;
      if (j >= motorway.n || j > k + GAP) continue;
      for (let q = k; q < j; q++) {
        const t = (q - k + 1) / (j - k + 1), lerp = (v: ArrayLike<number>) => v[k - 1] + (v[j] - v[k - 1]) * t;
        day[q] = lerp(day); zDay[q] = lerp(zDay); apex[q] = lerp(apex); face[q] = undefined;
      }
      k = j;
    }
  return { motorway: own.m ? { ...motorway, ...own.m } as Result : motorway, slips: out };
}
