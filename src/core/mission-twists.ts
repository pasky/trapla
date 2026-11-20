// A mission's twists as its map sees them: the numbers (data/twists.ts), the listed monuments and heritage areas near its
// line (the pack's heritage.json) and the curveballs' places in the pack's own metres. Shared by the game (ui/twists.ts)
// and scripts/twists-check.ts.
import type { ScenarioParams } from './data/scenario';
import { zoneRings, type HeritageData } from './heritage';
import { CURVEBALLS } from './data/curveballs';
import { LANDMARK_REACH, LANDMARK_RING, missionTwists, type MissionTwists } from './data/twists';
import { packShape, type CurveballCheck, type Landmark, type TwistTerms } from './twists';

export interface PackFrame { origin: readonly [number, number]; width: number; height: number; a: { x: number; y: number }; b: { x: number; y: number } }

const segDist = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(ax + t * dx - x, ay + t * dy - y);
};
const lineDist = (x: number, y: number, pts: readonly { x: number; y: number }[]) => {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
  return d;
};

/** Where a zone's name stands: the middle of its largest part, moved onto the part along its row where the middle falls
 * outside it (a bent zone). */
function labelPoint(rings: readonly (readonly (readonly [number, number])[])[]): { x: number; y: number } {
  const areaOf = (p: readonly (readonly [number, number])[]) => p.reduce((a, q, i) => { const o = p[(i + p.length - 1) % p.length]; return a + o[0] * q[1] - q[0] * o[1]; }, 0) / 2;
  const p = [...rings].sort((a, b) => Math.abs(areaOf(b)) - Math.abs(areaOf(a)))[0];
  let x = p.reduce((a, q) => a + q[0], 0) / p.length;
  const y = p.reduce((a, q) => a + q[1], 0) / p.length;
  // (the row through the middle: its crossings with the outline, the widest span inside)
  const xs: number[] = [];
  for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    if ((p[i][1] > y) !== (p[j][1] > y)) xs.push(p[i][0] + (y - p[i][1]) * (p[j][0] - p[i][0]) / (p[j][1] - p[i][1]));
  xs.sort((a, b) => a - b);
  const spans = Array.from({ length: Math.floor(xs.length / 2) }, (_, k) => [xs[2 * k], xs[2 * k + 1]] as const);
  if (spans.length && !spans.some(([a, b]) => x > a && x < b)) {
    const [a, b] = spans.reduce((w, s) => s[1] - s[0] > w[1] - w[0] ? s : w);
    x = (a + b) / 2;
  }
  return { x, y };
}
const segSeg = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(segDist(cx, cy, ax, ay, bx, by), segDist(dx, dy, ax, ay, bx, by), segDist(ax, ay, cx, cy, dx, dy), segDist(bx, by, cx, cy, dx, dy));
};
/** how far a zone's outline is from a line (0 where they cross; a line wholly inside counts as far as its outline) */
const zoneDist = (rings: readonly (readonly (readonly [number, number])[])[], pts: readonly { x: number; y: number }[]) => {
  let d = Infinity;
  for (const p of rings) for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    for (let k = 1; k < pts.length; k++) d = Math.min(d, segSeg(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y, p[j][0], p[j][1], p[i][0], p[i][1]));
  return d;
};

/** The listed monuments whose ring, and the heritage areas that, come near the starting line or the straight line A–B
 * (the pack's heritage.json, in its own metres), inside the map. */
export function missionLandmarks(scenario: Pick<ScenarioParams, 'initial'>, frame: PackFrame, heritage: HeritageData | null | undefined): (Landmark & { ring: number })[] {
  const starter = [frame.a, ...(scenario.initial?.pis ?? []).map(p => ({ x: p.x, y: p.y })), frame.b], straight = [frame.a, frame.b];
  const out: (Landmark & { ring: number })[] = [];
  for (const z of heritage?.zones ?? []) {
    const rings = zoneRings(z);
    if (Math.min(zoneDist(rings, starter), zoneDist(rings, straight)) > LANDMARK_REACH) continue;
    out.push({ name: z.name, kind: 'zone', ...labelPoint(rings), ring: 0, rings });
  }
  for (const { name, kind, x, y } of heritage?.monuments ?? []) {
    const ring = LANDMARK_RING[kind];
    if (x < 0 || y < 0 || x > frame.width || y > frame.height) continue;
    if (Math.min(lineDist(x, y, starter), lineDist(x, y, straight)) - ring > LANDMARK_REACH) continue;
    out.push({ name, kind, x, y, ring });
  }
  return out;
}

export interface MissionTwistSetup { mission: MissionTwists; terms: TwistTerms; curveballs: (CurveballCheck & { story: string; cite: { text: string; url?: string } })[] }

/** Everything the twists of mission `presetId` need on this map; undefined where it offers none. */
export function missionTwistSetup(presetId: string, scenario: Pick<ScenarioParams, 'initial' | 'maxTravelMin'>, frame: PackFrame,
  heritage: HeritageData | null | undefined): MissionTwistSetup | undefined {
  const mission = missionTwists(presetId);
  if (!mission) return undefined;
  const terms: TwistTerms = { ...mission.terms, maxTravelMin: scenario.maxTravelMin, landmarks: mission.offer.includes('landmarks') ? missionLandmarks(scenario, frame, heritage) : [] };
  const curveballs = mission.curveballs.map(id => {
    const c = CURVEBALLS[id];
    if (!c) throw new Error(`unknown curveball ${id}`);
    return { id, headline: c.headline, ask: c.ask, story: c.story, cite: c.cite, ...(c.budget !== undefined ? { budget: c.budget } : {}),
      ...(c.zone ? { zone: { label: c.zone.label, forbid: c.zone.forbid, shape: packShape(c.zone.shape, frame.origin) } } : {}) };
  });
  return { mission, terms, curveballs };
}
