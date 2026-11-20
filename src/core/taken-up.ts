// A mapped road's dead end the player cut back (owner, I/35 Turnov: a local road ending at our earthworks could not
// be shortened): the piece beyond the road's new end is taken up. It leaves the network every road is checked against
// (project-roadnet.ts takenUpTrims), its pavement is removed and its ground restored at the rates of a rebuilt
// stretch's old road (project-replacement.ts REMOVAL, OTSKP 2026), nothing is regraded, and it is billed with the
// project's road (the mission's). A house that piece was the only road to is said as a problem: the same test as for a
// track or service road cut at our road (crossing-geometry.ts: a house people go to within STUB_HOUSE of the piece and
// not within STUB_HOUSE of a road still there); buying it out, or leaving more of the road, settles it. The piece ends
// at the last junction before the dead end at the furthest (ui/mapped-road.ts), so no other way loses its road.
import type { BuildingIndex } from './buildings';
import { BUILDING_KIND } from './data/urban';
import { STUB_HOUSE } from './crossing-geometry';
import { ROAD_CLASSES } from './data/urban';
import type { ProjectDesign, ProjectIssue, RouteId } from './project';
import { removalPerMetre, type ReplacementWork } from './project-replacement';
import { takenUpTrims, type SourceWays } from './project-roadnet';
import type { RoadNet } from './roadnet';

type XY = { x: number; y: number };
type Line = { n: number; x: ArrayLike<number>; y: ArrayLike<number> };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export interface TakenUpOutcome {
  /** what each piece costs, for the road that bills it */
  works: ReplacementWork[];
  /** houses a piece was the only road to */
  issues: ProjectIssue[];
}

/** `roads`: the pack's network; `edited`: the network as the project leaves it (the pieces gone, its own roads added);
 * `gone`: houses the project takes anyway; `routeId`: the road that bills the pieces; `stationOf`: where along it. */
export function takenUpOutcome(design: ProjectDesign, roads: RoadNet, edited: RoadNet, sourceWays: SourceWays | undefined,
  buildings: BuildingIndex | undefined, gone: ReadonlySet<number>, routeId: RouteId, stationOf: (x: number, y: number) => number,
  /** roads of the project a house may be reached from too (their built centrelines) */
  lines: readonly Line[] = []): TakenUpOutcome {
  const out: TakenUpOutcome = { works: [], issues: [] };
  for (const trim of takenUpTrims(roads, design, sourceWays)) {
    const cls = roads.wayClass(trim.way), row = ROAD_CLASSES[cls], width = row?.width ?? 6.5, what = row?.label ?? 'road';
    const path = roads.wayPath(trim.way, trim.d0, trim.d1);
    let length = 0;
    for (let k = 1; k < path.length; k++) length += Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y);
    if (!(length > 0.5)) continue;
    const mid = path[Math.floor(path.length / 2)];
    out.works.push({ kind: 'removal', s: stationOf(mid.x, mid.y), x: mid.x, y: mid.y, length, cost: length * removalPerMetre(width),
      label: `${cap(what)} taken up: ${Math.round(length)} m` });
    const cut = servedOnly(path, edited, lines, buildings, gone);
    if (!cut.length) continue;
    const b = buildings!.items[cut[0]], homes = cut.filter(j => buildings!.dwelling[j]).length;
    const who = homes === cut.length ? (homes > 1 ? `${homes} homes` : 'A home') : cut.length > 1 ? `${cut.length} buildings` : 'A building';
    const s = stationOf(b[0], b[1]);
    out.issues.push({ code: 'taken-up-access', blocking: 'invalid', check: 'violation', scope: { routeIds: [routeId], buildingIndex: cut[0] },
      locations: [{ routeId, s0: s, s1: s }], at: { x: b[0], y: b[1] },
      violation: { kind: 'crossing', basis: 'law', title: `${who} lose${cut.length > 1 ? '' : 's'} ${cut.length > 1 ? 'their' : 'its'} road`,
        fix: `Leave more of the ${what}, or buy ${cut.length > 1 ? 'them' : 'it'} out`,
        detail: `The ${what} taken up here was the only road within ${STUB_HOUSE} m of ${cut.length > 1 ? 'them' : 'it'}; ${nearestText(edited, buildings!, cut[0])}.`,
        rule: 'Act 13/1997 §7, §24(4): neighbouring properties must stay accessible' } });
  }
  return out;
}

/** Houses (no shed or garage) within STUB_HOUSE of the piece that are not within STUB_HOUSE of any road left (a
 * motorway is no way in), the project's own taken houses aside; both measured alike, from the house's outline to the
 * way's line (a house no road came within STUB_HOUSE of before loses nothing). */
export function servedOnly(path: readonly XY[], net: RoadNet, lines: readonly Line[], bld: BuildingIndex | undefined, gone: ReadonlySet<number>): number[] {
  if (!bld) return [];
  const found = new Set<number>();
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(len > 0)) continue;
    bld.near((a.x + b.x) / 2, (a.y + b.y) / 2, len / 2 + STUB_HOUSE + 5, j => {
      if (!gone.has(j) && bld.kind[j] !== BUILDING_KIND.minor && within(bld, j, a, b, STUB_HOUSE)) found.add(j);
    });
  }
  return [...found].filter(j => !onRoad(net, bld, j, STUB_HOUSE) && !lines.some(l => onLine(l, bld, j, STUB_HOUSE))).sort((a, b) => a - b);
}
/** building j's outline within `apart` of the segment a–b (at the point of it nearest the building's middle) */
function within(bld: BuildingIndex, j: number, a: XY, b: XY, apart: number): boolean {
  const [x, y] = bld.items[j], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return bld.facadeDistanceSq(j, a.x + t * dx, a.y + t * dy) < apart * apart;
}
/** how far the nearest road left is from building j, in words (looked for within NEAR_SEARCH) */
const NEAR_SEARCH = 300;
function nearestText(net: RoadNet, bld: BuildingIndex, j: number): string {
  const [x, y] = bld.items[j];
  let best = Infinity;
  net.nearSegments([x - NEAR_SEARCH, y - NEAR_SEARCH, x + NEAR_SEARCH, y + NEAR_SEARCH], g => {
    if (ROAD_CLASSES[g.cls]?.noAtGrade) return;
    const dx = g.bx - g.ax, dy = g.by - g.ay, t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (y - g.ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.sqrt(bld.facadeDistanceSq(j, g.ax + t * dx, g.ay + t * dy)));
  });
  return best <= NEAR_SEARCH ? `the nearest road left is ${Math.round(best)} m away` : `no road is left within ${NEAR_SEARCH} m`;
}
function onLine(l: Line, bld: BuildingIndex, j: number, apart: number): boolean {
  const [x, y, r] = bld.items[j], reach = r + apart;
  for (let i = 1; i < l.n; i++) {
    const a = { x: l.x[i - 1], y: l.y[i - 1] }, b = { x: l.x[i], y: l.y[i] };
    if (Math.min(a.x, b.x) > x + reach || Math.max(a.x, b.x) < x - reach || Math.min(a.y, b.y) > y + reach || Math.max(a.y, b.y) < y - reach) continue;
    if (within(bld, j, a, b, apart)) return true;
  }
  return false;
}
function onRoad(net: RoadNet, bld: BuildingIndex, j: number, apart: number): boolean {
  const [x, y, r] = bld.items[j];
  let hit = false;
  net.nearSegments([x - r - apart, y - r - apart, x + r + apart, y + r + apart], g => {
    if (!hit && !ROAD_CLASSES[g.cls]?.noAtGrade && within(bld, j, { x: g.ax, y: g.ay }, { x: g.bx, y: g.by }, apart)) hit = true;
  });
  return hit;
}
