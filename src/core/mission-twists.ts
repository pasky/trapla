// A mission's twists as its map sees them: the numbers (data/twists.ts), the landmarks near its line and the curveballs'
// places in the pack's own metres. Shared by the game (ui/twists.ts) and scripts/twists-check.ts.
import type { ScenarioParams } from './data/scenario';
import { LANDMARKS } from './data/landmarks';
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

/** The landmarks whose ring comes near the starting line or the straight line A–B, inside the map. */
export function missionLandmarks(scenario: Pick<ScenarioParams, 'initial'>, frame: PackFrame): (Landmark & { ring: number })[] {
  const starter = [frame.a, ...(scenario.initial?.pis ?? []).map(p => ({ x: p.x, y: p.y })), frame.b], straight = [frame.a, frame.b];
  const out: (Landmark & { ring: number })[] = [];
  for (const [name, kind, ex, ey] of LANDMARKS) {
    const x = ex - frame.origin[0], y = ey - frame.origin[1], ring = LANDMARK_RING[kind];
    if (x < 0 || y < 0 || x > frame.width || y > frame.height) continue;
    if (Math.min(lineDist(x, y, starter), lineDist(x, y, straight)) - ring > LANDMARK_REACH) continue;
    out.push({ name, kind, x, y, ring });
  }
  return out;
}

export interface MissionTwistSetup { mission: MissionTwists; terms: TwistTerms; curveballs: (CurveballCheck & { story: string; cite: { text: string; url: string } })[] }

/** Everything the twists of mission `presetId` need on this map; undefined where it offers none. */
export function missionTwistSetup(presetId: string, scenario: Pick<ScenarioParams, 'initial' | 'maxTravelMin'>, frame: PackFrame): MissionTwistSetup | undefined {
  const mission = missionTwists(presetId);
  if (!mission) return undefined;
  const terms: TwistTerms = { ...mission.terms, maxTravelMin: scenario.maxTravelMin, landmarks: mission.offer.includes('landmarks') ? missionLandmarks(scenario, frame) : [] };
  const curveballs = mission.curveballs.map(id => {
    const c = CURVEBALLS[id];
    if (!c) throw new Error(`unknown curveball ${id}`);
    return { id, headline: c.headline, ask: c.ask, story: c.story, cite: c.cite, ...(c.budget !== undefined ? { budget: c.budget } : {}),
      ...(c.zone ? { zone: { label: c.zone.label, forbid: c.zone.forbid, shape: packShape(c.zone.shape, frame.origin) } } : {}) };
  });
  return { mission, terms, curveballs };
}
