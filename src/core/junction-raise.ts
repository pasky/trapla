// A rebuilt stretch of an existing road (a crossing the player slid, a road of the project rebuilt on its old line)
// ends where it rejoins its old road, often in a junction with other roads. Owner report (recurring): a stretch held on
// its bridge over our road between two junctions rose straight from the junction nodes at its class's steepest grade,
// its embankments drawn as fans round the nodes, and still missed its deck. A designer instead keeps a junction's grade
// in the junction and, where the ramps to the deck cannot get down within the stretch, raises the junction with them:
// every road meeting there is regraded from the raised node back down to its own ground no steeper than its class
// allows, along its own line (as Auto's crossing regrades a side road joining its ramps, crossing-works.ts). That is
// what this module plans; project-road.ts runs the kernel again with the ends raised.
import { BUILDING_RULES, ENDPOINT_JUNCTIONS, ROAD_CLASSES } from './data/urban';
import { SIDE_ROAD_SLOPE as SLOPE } from './data/remedies';
import type { BuildingIndex } from './buildings';
import { MAX_RAMP_LENGTH } from './data/remedies';
import { nodeTies, type CrossingTie } from './crossing-works';
import { rampLimit } from './crossing-geometry';
import { TIE_IN_RULES, type TieIn } from './tie-in';
import type { EvalOptions, Result } from './evaluate';
import type { RoadNet } from './roadnet';
import type { Terrain } from './terrain';

type Holds = NonNullable<EvalOptions['holds']>;
/** A held height missed by less than this is met (the kernel aims inside each band by its own margin), m. */
const MET = 0.05;
/** The raise aims this much past what the line missed by (the next solve's own rounding), m (PROVISIONAL: a solver
 * margin, not a design value). */
const AIM = 0.1;
/** Solves after the first at most (each raises by what the last still missed). */
const PASSES = 2;

/** Rebuilt stretch ends that may be raised (it continues as its old road there) and those in a junction (other roads
 * meet there: a junction's grade within its zone, tie-in.ts tieInChecks). */
export function raisableEnds(ties: readonly TieIn[]) {
  const ends = ties.filter(t => t.junction.kind === 'continuation');
  const endGrades: NonNullable<EvalOptions['endGrades']> = {};
  for (const t of ends) if (t.existing) endGrades[t.end] = { zone: ENDPOINT_JUNCTIONS.continuation.zone, grade: TIE_IN_RULES.maxGrade };
  return { ends, endGrades };
}

const gradeAt = (r: Result, s: number) => {
  const k = Math.max(0, Math.min(r.n - 2, Math.floor(s / r.ds))), t = Math.max(0, Math.min(1, (s - r.s[k]) / ((r.s[k + 1] - r.s[k]) || 1)));
  return r.grade[k] + (r.grade[k + 1] - r.grade[k]) * t;
};
/** How far below a held height (a band's floor: its deck over a road of the project) the line lies at its most, m. */
export function holdMiss(r: Result, holds: Holds): { miss: number; s: number } {
  let worst = { miss: 0, s: 0 };
  for (const h of holds) if (h.min > -Infinity && h.s >= 0 && h.s <= r.length) {
    const miss = h.min - gradeAt(r, h.s);
    if (miss > worst.miss) worst = { miss, s: h.s };
  }
  return worst;
}

export interface RaisedEnd { z: number; ties: CrossingTie[]; cost: number }
/** The ends to raise, and the ties of each raised node, for a line `r` that misses its holds. Each end as little as its
 * own ramp needs: from the end at a junction's grade across its zone (a plain continuation: at the line's own), then at
 * the steepest grade the line climbs anywhere (where it misses a hold its ramps are at their limit), up to each held
 * floor; an end already raised (`raised`) by what the line still missed. Null: nothing to raise, or a node that cannot be
 * regraded (a motorway meets there, an arm that cannot get down within MAX_RAMP_LENGTH). `along`: the stretch's own
 * lines (new and old), no arm of its nodes. */
export function raiseEnds(r: Result, holds: Holds, ends: readonly TieIn[], raised: { a?: RaisedEnd; b?: RaisedEnd },
  endGrades: NonNullable<EvalOptions['endGrades']>, along: readonly (readonly { x: number; y: number }[])[], roads: RoadNet, terrain: Terrain,
  crownWidth: number, buildings?: BuildingIndex): { a?: RaisedEnd; b?: RaisedEnd } | null {
  const { miss } = holdMiss(r, holds);
  if (miss <= MET || !ends.length) return null;
  let steep = 0;
  for (let k = 1; k < r.n; k++) steep = Math.max(steep, Math.abs(r.grade[k] - r.grade[k - 1]) / ((r.s[k] - r.s[k - 1]) || 1));
  const out: { a?: RaisedEnd; b?: RaisedEnd } = {};
  for (const t of ends) {
    const i = t.end === 'a' ? 0 : r.n - 1, se = r.s[i], zone = endGrades[t.end];
    let z = r.grade[i];
    if (raised[t.end]) z = raised[t.end]!.z + miss + AIM;
    else for (const h of holds) if (h.min > -Infinity && h.s >= 0 && h.s <= r.length) {
      const d = Math.abs(h.s - se), near = zone ? Math.min(d, zone.zone) : 0;
      z = Math.max(z, h.min + AIM - (zone?.grade ?? steep) * near - steep * (d - near));
    }
    if (z <= r.grade[i] + MET) { if (raised[t.end]) out[t.end] = raised[t.end]; continue; }
    const works = nodeTies({ x: t.x, y: t.y }, z, along, { roads: roads.ground, heightAt: (x, y) => terrain.heightAt(x, y), rampLimit,
      maxTie: MAX_RAMP_LENGTH, urban: (r.cell.urban[i] ?? 0) >= 0.5 ? 1 : 0 });
    if (works.problems.length || (buildings && underWorks(r, i, z, works.ties, crownWidth, terrain, buildings))) return null;
    out[t.end] = { z, ties: works.ties, cost: works.cost };
  }
  return out.a || out.b ? out : null;
}
export const RAISE_PASSES = PASSES;
/** A raised end's line misses its holds by no more than this (project-evaluate.ts HOLD_SLACK: the crossing's own ramps
 * carry it the rest): only then is the junction raised, else the stretch stays at its old road's level there, m. */
export const RAISE_MEETS = 0.5;

/** Whether a house left standing lies under the fill a raised node builds, or within the working strip round it: its
 * cone (the end's crown, then 1:1.5 down to the ground) and the ties' slopes (1:1.5 from their paved edges). */
function underWorks(r: Result, i: number, z: number, ties: readonly CrossingTie[], crownWidth: number, terrain: Terrain, buildings: BuildingIndex) {
  const gone = new Set([...r.demolished, ...r.boughtOut].map(b => b.j));
  const near = (x: number, y: number, reach: number) => {
    let hit = false;
    buildings.near(x, y, reach, j => { if (!hit && !gone.has(j) && buildings.facadeDistanceSq(j, x, y) < reach * reach) hit = true; });
    return hit;
  };
  const strip = BUILDING_RULES.clearance;
  if (near(r.x[i], r.y[i], crownWidth / 2 + SLOPE * Math.max(0, z - terrain.heightAt(r.x[i], r.y[i])) + strip)) return true;
  return ties.some(t => t.path.some(p => p.z - p.ground > DRAPED && near(p.x, p.y, (ROAD_CLASSES[t.cls]?.width ?? 6) / 2 + SLOPE * (p.z - p.ground) + strip)));
}
/** Earth this thin under a tie is draped pavement, not a slope (crossing-works.ts DRAPED), m. */
const DRAPED = 0.3;
