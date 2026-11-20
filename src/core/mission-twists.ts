// A mission's twists as its map sees them: the numbers (data/twists.ts), the listed monuments and heritage areas near its
// line (the pack's heritage.json) and the curveballs' places in the pack's own metres. Shared by the game (ui/twists.ts)
// and scripts/twists-check.ts.
import type { ScenarioParams } from './data/scenario';
import { zoneRings, type HeritageData } from './heritage';
import { CURVEBALLS } from './data/curveballs';
import { LANDMARK_REACH, LANDMARK_RING, missionTwists, SETTING_RING, type InPlay, type MissionTwists } from './data/twists';
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

/** even-odd over all of a zone's rings (a hole is outside) */
const insideRings = (rings: readonly (readonly (readonly [number, number])[])[], q: { x: number; y: number }) => {
  let c = false;
  for (const p of rings) for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    if ((p[i][1] > q.y) !== (p[j][1] > q.y) && q.x < (p[j][0] - p[i][0]) * (q.y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
};
/** Where a zone's name stands: the middle of its largest part, moved along its row to the middle of the widest stretch
 * inside the zone where the middle falls outside it (a bent zone, or a hole there). */
function labelPoint(rings: readonly (readonly (readonly [number, number])[])[]): { x: number; y: number } {
  const areaOf = (p: readonly (readonly [number, number])[]) => p.reduce((a, q, i) => { const o = p[(i + p.length - 1) % p.length]; return a + o[0] * q[1] - q[0] * o[1]; }, 0) / 2;
  const p = [...rings].sort((a, b) => Math.abs(areaOf(b)) - Math.abs(areaOf(a)))[0];
  const x = p.reduce((a, q) => a + q[0], 0) / p.length, y = p.reduce((a, q) => a + q[1], 0) / p.length;
  if (insideRings(rings, { x, y })) return { x, y };
  // (the row through the middle: its crossings with every outline, the widest span between two inside)
  const xs: number[] = [];
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if ((r[i][1] > y) !== (r[j][1] > y)) xs.push(r[i][0] + (y - r[i][1]) * (r[j][0] - r[i][0]) / (r[j][1] - r[i][1]));
  xs.sort((a, b) => a - b);
  let best = { x, w: -1 };
  for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > best.w) best = { x: (xs[k] + xs[k + 1]) / 2, w: xs[k + 1] - xs[k] };
  return { x: best.x, y };
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

/** how far our body and its slopes reach from a mission's fixed end, m: a game approximation (a motorway's half-width
 * with its slopes) */
const END_REACH = 50;

/** The listed monuments whose ring, and the heritage areas that, come near the starting line or the straight line A–B
 * (the pack's heritage.json, in its own metres), inside the map. `inPlay` (data/twists.ts): the ones the mission names, by
 * their ÚSKP number, with the name it gives them; a monument there marked `setting` keeps its setting's ring (SETTING_RING). */
export function missionLandmarks(scenario: Pick<ScenarioParams, 'initial'>, frame: PackFrame, heritage: HeritageData | null | undefined,
  inPlay: readonly InPlay[] = []): (Landmark & { ring: number })[] {
  const named = new Map(inPlay.map(p => [p.code, p]));
  const starter = [frame.a, ...(scenario.initial?.pis ?? []).map(p => ({ x: p.x, y: p.y })), frame.b], straight = [frame.a, frame.b];
  const out: (Landmark & { ring: number })[] = [];
  // (one that takes in an end of the mission, or comes within its body's reach of it, no design can keep clear of: the
  // ends are the mission's, not the player's)
  const atEnd = (d: (p: { x: number; y: number }) => number) => d(frame.a) <= END_REACH || d(frame.b) <= END_REACH;
  for (const z of heritage?.zones ?? []) {
    const rings = zoneRings(z);
    if (Math.min(zoneDist(rings, starter), zoneDist(rings, straight)) > LANDMARK_REACH) continue;
    if (atEnd(p => zoneDist(rings, [p, p])) || insideRings(rings, frame.a) || insideRings(rings, frame.b)) continue;
    out.push({ name: named.get(z.code)?.name ?? z.name, kind: 'zone', ...labelPoint(rings), ring: 0, rings, code: z.code });
  }
  for (const { name, kind, x, y, code } of heritage?.monuments ?? []) {
    const p = named.get(code), ring = p?.setting ? SETTING_RING[kind] : LANDMARK_RING[kind];
    if (x < 0 || y < 0 || x > frame.width || y > frame.height) continue;
    if (Math.min(lineDist(x, y, starter), lineDist(x, y, straight)) - ring > LANDMARK_REACH) continue;
    if (atEnd(p => Math.hypot(p.x - x, p.y - y) - ring)) continue;
    out.push({ name: p?.name ?? name, kind, x, y, ring, code, ...(p?.setting ? { setting: true } : {}) });
  }
  return out;
}

export interface MissionTwistSetup { mission: MissionTwists; terms: TwistTerms; curveballs: (CurveballCheck & { story: string; cite: { text: string; url?: string } })[] }

/** Everything the twists of mission `presetId` need on this map; undefined where it offers none. */
export function missionTwistSetup(presetId: string, scenario: Pick<ScenarioParams, 'initial' | 'maxTravelMin'>, frame: PackFrame,
  heritage: HeritageData | null | undefined): MissionTwistSetup | undefined {
  const listed = missionTwists(presetId);
  if (!listed) return undefined;
  // (a pack without its listed monuments, or whose file did not load, offers no Hands off: it would be met on nothing)
  const mission = heritage ? listed : { ...listed, offer: listed.offer.filter(t => t !== 'landmarks') };
  const terms: TwistTerms = { ...mission.terms, maxTravelMin: scenario.maxTravelMin, landmarks: mission.offer.includes('landmarks') ? missionLandmarks(scenario, frame, heritage, mission.inPlay) : [] };
  const curveballs = mission.curveballs.map(id => {
    const c = CURVEBALLS[id];
    if (!c) throw new Error(`unknown curveball ${id}`);
    return { id, headline: c.headline, ask: c.ask, story: c.story, cite: c.cite, ...(c.budget !== undefined ? { budget: c.budget } : {}),
      ...(c.zone ? { zone: { label: c.zone.label, forbid: c.zone.forbid, shape: packShape(c.zone.shape, frame.origin) } } : {}) };
  });
  return { mission, terms, curveballs };
}
