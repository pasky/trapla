// Study-stage network resolution with terrain profiles on the actual OSM alignment.
import { surchargeRate } from './cost';
import { bridgeModel } from './bridge';
import { ACCESS, CROSSING_RULES, JUNCTION, minorCrossroads, ROAD_CLASSES } from './data/urban';
import { STRUCTURE_RULES } from './data/prices';
import { LOWERING_RULES, sagDrainage, underpassAssembly, UNDERPASS_RULES } from './data/remedies';
import { heldRailway, underpassFits } from './crossing-geometry';
import { crossingOutcome } from './terms';
import type { OurLine } from './terms';
import { KIND } from './structures';
import type { Violation } from './checks';
import type { LinkObstacle } from './link-route';
import type { RoadCrossing } from './roadnet';

export const CROSSING_CHOICES = ['junction', 'bridge', 'overbridge', 'reconnection', 'underpass'] as const;
export type CrossingChoice = typeof CROSSING_CHOICES[number];
/** Pack way index, stable within a scenario pack, not a station or merged-list index.
 * One choice applies to every intersection of that way. Omission restores Auto. */
export interface CrossingOverride { roadId: number; type: CrossingChoice;
  /** A reroute the player shaped: bend points of its two new pieces (the [-normal, +normal] sides of our
   * road, like `CrossingGeometry.links`); an empty side keeps its automatic path. Only with 'reconnection'. */
  via?: LinkVia;
  /** The crossing the shaped reroute leads to (its pack way; -1 / -2: the start / end of our road), so a
   * drag reshapes that connection rather than letting it pick another target. */
  to?: number;
  /** Where the player led each side's new piece ([-normal, +normal] sides, like `via`; null: Auto's target): onto
   * this mapped way, joining it at its point nearest (x, y) on the ground clear of our earthworks. Only with
   * 'reconnection'. */
  ends?: [LinkEnd | null, LinkEnd | null];
  /** Underpass / bridge over us: straighten the crossed road to cross square (true) or keep its line
   * (false); omitted: Auto decides. */
  square?: boolean }
export type LinkVia = [{ x: number; y: number }[], { x: number; y: number }[]];
/** A pack way index and the map point (local metres) the player dropped the end of a new piece of road on. */
export interface LinkEnd { way: number; x: number; y: number }
/** What a side the player led elsewhere joins (crossing-geometry.ts): that way's class, the crossing of ours on it
 * (when it carries traffic over or under us), the compass point of that side of our road, and whether it was built
 * there (false: Auto's line stands, an issue says why). */
export interface LinkEndTo { cls: string; s?: number; toward: string; built: boolean }
/** At most this many bend points per shaped reroute piece. */
export const MAX_LINK_VIA = 24;
/** Bend points lie on the scenario map (local metres): anything beyond is not a shape. */
export const MAX_LINK_COORD = 1e6;
export interface CrossingPoint {
  x: number; y: number; z: number;
  ground: number;
  surface: 'terrain' | 'ramp' | 'deck';
  /** Ramps are engineered surfaces, not unsupported ribbons. Cuts use retaining faces. */
  support?: 'embankment' | 'retaining';
  /** Signed chainage along the existing crossed way (road samples only). */
  d?: number;
  /** A terminating T-junction meets the constructed main road, not the removed old ground. */
  connection?: 'main-road';
  /** Retaining walls cutting this sample's slopes short, at these offsets from the centreline on
   * the [-normal, +normal] side (normal from the neighbouring samples), m. */
  wall?: [number | undefined, number | undefined];
}
export interface UnderpassWing { d: number; z: number; h: number }
export interface CrossingGeometry {
  /** Existing road, continuous under our bridge or over our cut. */
  road?: CrossingPoint[];
  /** Two side links, ending on existing roads / A/B collector anchors, never on our axis. */
  links?: [CrossingPoint[], CrossingPoint[]];
  /** The culverts under its links (`culverts`, `culvertCost` of the crossing): where each stands, drawn as our road's
   * (render/culvert-geometry.ts). */
  culverts?: import('./link-route').LinkCulvert[];
  width: number;
  /** Inclusive indices in road; deck top clears our crown by 4.8 m plus this depth. */
  deck?: { start: number; end: number; depth: number };
  /** Inclusive road-index ranges from each terrain tie-in to the adjusted footprint. */
  approaches?: [{ start: number; end: number }, { start: number; end: number }];
  /** Underpass: inclusive road indices of our footprint's toes along the way; the way keeps its terrain
   * level through a closed RC box of this clear opening between `portals`. */
  underpass?: { start: number; end: number; width: number; height: number; roof: number; wall: number;
    /** way chainages of the box's portals (where our slope comes down to its roof); between a toe and
     * its portal the way runs in the open between wing walls (`wings`: their tops `z` and heights `h`
     * above the way, sampled at way chainages `d`) */
    portals?: [number, number]; wings?: [UnderpassWing[], UnderpassWing[]] };
  /** Reconnection/diversion: signed way chainages where the severed way leaves the footprint. */
  removed?: [number, number];
  /** Side roads joining the rebuilt stretch, regraded from its new level down to their own ground. */
  ties?: { cls: string; way: number; path: CrossingPoint[] }[];
  /** A closed way's pieces that just end: each its cut end and the old road's first metres beyond it (what a road
   * rebuilt beside our earthworks meets; nothing built, drawn or billed). */
  keptEnds?: CrossingPoint[][];
  /** The new road of another way led to the same crossing that a side's piece joins (CrossingResult.joined), per side
   * ([] where that side joins none): what reaches this way's pieces goes on along it. */
  onto?: CrossingPoint[][];
  /** Severed existing-road ends at the sources of the two links. */
  turnarounds?: CrossingPoint[];
  /** Explicit priced turning disk, distinct from legacy small severed-end heads. */
  turnaroundRadius?: number;
  schematic: false;
  /** Incomplete source topology / bounded geometry, never silently invented extensions. */
  clipped?: boolean;
  /** (Auto) the kept way runs back under our earthworks right beyond its rebuilt stretch. */
  runsBack?: boolean;
  /** The crossed way's stretch through our earthworks (and the strip a new road keeps clear of them),
   * as measured on this build: its angle to our road in degrees (90: square; a way running along our
   * road reads lower than its local angle), and whether it comes back out on the side it went in. */
  skew?: number;
  sameSide?: boolean;
  /** How far along our road it enters and leaves our earthworks from the crossing, m (what a square
   * crossing's new line must at least make up). */
  skewRun?: number;
  diagnostics?: string[];
}
export interface CrossingIssue extends Violation {
  crossing: { roadId?: number; requested: CrossingChoice;
    /** 'square': the player's straightening cannot be built; the way is built on its own line */
    code: 'spacing' | 'class' | 'ours' | 'depth' | 'clearance' | 'structure' | 'reach' | 'geometry' | 'underpass' | 'shape' | 'reroute' | 'square'
      /** 'end': the road the player led a new piece to cannot take it (crossing-geometry.ts END_FAILS) */
      | 'end';
    actual?: number; required?: number; targetS?: number };
}
export interface CrossingResult {
  s: number; i: number; x: number; y: number;
  cls: string;
  /** Pack way index; optional only for legacy/synthetic callers. */
  roadId?: number;
  requestedType?: CrossingChoice;
  /** "Our bridge over it" chosen where our road was lower: how much higher our road was built for it, m, and
   * what that added to the bill (evaluate's regrade retry; the player's choice is met, its price said) */
  raised?: { m: number; cost: number };
  /** Built once with the other direction of a split motorway (that direction owns, bills and draws it). */
  shared?: true;
  /** The crossed road is a designed road of the project (it draws and bills its own body; this crossing
   * holds its height there, project-roadnet.ts). */
  designed?: true;
  /** That designed road passes high above here on its own bridge: over our bridge, or over us on its bridge (its deck
   * built higher than this crossing set it; set by the project evaluator). */
  above?: true;
  /** That designed road (set by the project evaluator), for the crossing card. */
  crossedRoute?: { id: string; name: string };
  /** The crossed way is a mapped bridge or tunnel (mapped-structures.ts): `h` is measured from its deck (its road in
   * the tunnel), not from the ground under it. */
  mapped?: 'bridge' | 'tunnel';
  /** That bridge spans our road with the clearance a new one would need (its bridge over us), or that tunnel lies
   * deep enough under our road (it passes under us): it is kept as it stands, nothing built or billed. */
  kept?: true;
  issues?: CrossingIssue[];
  geometry?: CrossingGeometry;
  /** New grade minus crossed-road ground, m. */
  h: number;
  type: 'bridge' | 'tunnel' | 'overbridge' | 'junction' | 'reconnection' | 'diversion' | 'underpass' | 'atGrade';
  /** Crossing-only cost excluding surcharge. Main-road structures are billed in their own runs. */
  cost: number;
  /** Both sides together, measured in plan from the built link geometry, m. */
  linkLength?: number;
  targetS?: number;
  /** The player's shape of the reroute (see CrossingOverride.via), on the one crossing of that way
   * nearest to it, and the crossing it leads to (CrossingOverride.to). */
  via?: LinkVia;
  viaTo?: number;
  /** The player's ends (CrossingOverride.ends) on that same crossing, and what each joins as built. */
  ends?: [LinkEnd | null, LinkEnd | null];
  endTo?: [LinkEndTo | undefined, LinkEndTo | undefined];
  /** Disambiguates independently selected roads at the same station; absent for A/B collectors. */
  targetRoadId?: number;
  span?: number;
  approachLength?: number;
  /** Underpass box length along the crossed way, portal to portal, m (measured from the geometry). */
  underpassLength?: number;
  /** Underpass under a low embankment: the crossed way is lowered into a cut by up to this much, m,
   * on ramps (approachLength) at its class gradient; its low point drains by gravity or a pump. */
  lowered?: number;
  drainage?: 'gravity' | 'pump';
  /** Pre-surcharge CZK of that drainage, included in cost. */
  drainCost?: number;
  roadCode?: string;
  roadPerKm?: number;
  /** Culverts carrying streams under a reroute (count, and their pre-surcharge CZK, included in cost). */
  culverts?: number;
  culvertCost?: number;
  /** Led under our bridge (Auto's reroute): the chainage where its new road passes under the deck, m. */
  under?: number;
  /** Its bridge over us also spans the mapped railway it crossed at the same level beside us (crossing-geometry.ts). */
  overRailway?: true;
  /** A rebuilt road's side road met at its old access (EvalOptions.sideWays): where it joined the old road. Its piece
   * beyond our road on that side led only there: it is taken up, not regraded (crossing-geometry.ts). */
  oldJunction?: { x: number; y: number };
  /** A cut way's pieces that still reach the road network over other ways and just end here ([right, left] of our
   * road), and, where both do, how much further its traffic goes round over the network, m (way-pieces.ts). */
  closure?: { connected: [boolean, boolean]; /** compass point of each side */ sides: [string, string]; extra?: number;
    /** a side whose piece is cut off but is only a short stub serving nothing: left as it is */
    nothing?: [boolean, boolean];
    /** per side whose piece still reaches the network: the way there from its cut end, and the class of the road it meets */
    reach?: [{ path: { x: number; y: number }[]; way: number; cls: string } | undefined, { path: { x: number; y: number }[]; way: number; cls: string } | undefined];
    /** a track's or service road's side whose piece serves buildings (closed only as a public road is) */
    serves?: [boolean, boolean];
    /** the way round (with `extra`): the public road it runs along furthest */
    via?: { way: number; cls: string } };
  /** Closed though a part of it serving buildings goes round further than CLOSURE_ROUND: nothing that keeps it across
   * our road can be built (Auto's last resort, crossing-geometry.ts). */
  farClosure?: true;
  /** The buildings a track or service road cut here serves whose traffic would go round further than CLOSURE_ROUND if
   * it were closed (what keeping its way across is for). */
  accessFor?: number[];
  /** Closed with those buildings bought out (`accessFor`, in `houses`): cheaper than keeping its way across, which
   * would have been `instead` (Auto's choice, crossing-geometry.ts). */
  buyout?: { instead?: { type: CrossingResult['type']; cost: number } };
  /** The player's "Cut it" closed though buildings it serves then go round further than CLOSURE_ROUND: what Auto would
   * build instead (its problem's fix), and how many of those buildings are homes. */
  cutOff?: { type: CrossingResult['type']; cost: number; homes: number; buyout?: true };
  /** Houses a reroute runs through, bought out and demolished (their price included in cost). */
  houses?: number[];
  houseCost?: number;
  /** How many of those are homes (the rest are sheds, garages, barns …). */
  homes?: number;
  /** A reroute that needed its class's justified-case steepest grade (research/20) somewhere. */
  linkGrade?: number;
  /** Laid on a new line near our road so that it crosses square (research/44): requested (by Auto's
   * choice or the player's) / built, with the angle it met our road at before, degrees. The new road
   * outside the structure and its ramps (realignLength, m) is billed in realignCost (pre-surcharge
   * CZK, included in cost, culverts included). */
  square?: boolean;
  squared?: number;
  realignLength?: number;
  realignCost?: number;
  /** A reroute whose new piece (on a side) ends on another way's new road led to the same crossing, rather than on the
   * crossed road: that crossing (its chainage, its way); the road along the strip is that one's, built and billed once. */
  joined?: { s: number; roadId?: number; cls: string };
  /** A reroute that only moves the crossed road beside our earthworks: it comes back out of them on
   * the side it went in, so it needs no crossing (no target; links on that side only). */
  moved?: true;
  /** Side roads regraded to meet the rebuilt stretch, m (measured along them). */
  tieLength?: number;
  /** Retaining walls holding its slopes off roads beside it, m. */
  wallLength?: number;
  /** Pre-surcharge CZK of those ties and walls, included in cost (never a lump sum). */
  worksCost?: number;
}

export function normalizeCrossingOverrides(value: unknown): CrossingOverride[] {
  if (!Array.isArray(value)) return [];
  const byRoad = new Map<number, CrossingOverride>();
  for (const o of value) if (o && Number.isSafeInteger(o.roadId) && o.roadId >= 0
    && CROSSING_CHOICES.includes(o.type)) {
    const via = o.type === 'reconnection' ? normalizeLinkVia(o.via) : undefined;
    const to = via && Number.isSafeInteger(o.to) && o.to >= -2 ? o.to as number : undefined;
    const ends = o.type === 'reconnection' ? normalizeLinkEnds(o.ends) : undefined;
    const square = (o.type === 'underpass' || o.type === 'overbridge') && typeof o.square === 'boolean' ? o.square as boolean : undefined;
    byRoad.set(o.roadId, { roadId: o.roadId, type: o.type, ...(via ? { via } : {}), ...(to !== undefined ? { to } : {}), ...(ends ? { ends } : {}), ...(square !== undefined ? { square } : {}) });
  }
  return [...byRoad.values()].sort((a, b) => a.roadId - b.roadId);
}

export function normalizeLinkVia(value: unknown): LinkVia | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const side = (v: unknown) => Array.isArray(v) && v.length <= MAX_LINK_VIA && v.every(p => p && Math.abs(p.x) <= MAX_LINK_COORD && Math.abs(p.y) <= MAX_LINK_COORD)
    ? v.map(p => ({ x: p.x, y: p.y })) : undefined;
  const a = side(value[0]), b = side(value[1]);
  return a && b && (a.length || b.length) ? [a, b] : undefined;
}
/** The player's ends of a reroute's two new pieces (undefined where neither side has one). */
export function normalizeLinkEnds(value: unknown): [LinkEnd | null, LinkEnd | null] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const end = (e: unknown): LinkEnd | null => {
    const o = e as Partial<LinkEnd> | null;
    return o && Number.isSafeInteger(o.way) && o.way! >= 0 && Number.isFinite(o.x) && Number.isFinite(o.y)
      && Math.abs(o.x!) <= MAX_LINK_COORD && Math.abs(o.y!) <= MAX_LINK_COORD ? { way: o.way!, x: o.x!, y: o.y! } : null;
  };
  const a = end(value[0]), b = end(value[1]);
  return a || b ? [a, b] : undefined;
}
export function crossingEnds(roadId: number | undefined, overrides: readonly CrossingOverride[] = []): [LinkEnd | null, LinkEnd | null] | undefined {
  for (let i = overrides.length - 1; i >= 0; i--) if (overrides[i].roadId === roadId) return overrides[i].type === 'reconnection' ? overrides[i].ends : undefined;
  return undefined;
}
export function crossingVia(roadId: number | undefined, overrides: readonly CrossingOverride[] = []): LinkVia | undefined {
  for (let i = overrides.length - 1; i >= 0; i--) if (overrides[i].roadId === roadId) return overrides[i].type === 'reconnection' ? overrides[i].via : undefined;
  return undefined;
}

/** The player's straightening choice for a crossing they set to an underpass or a bridge over us. */
export function crossingSquare(roadId: number | undefined, overrides: readonly CrossingOverride[] = []): boolean | undefined {
  for (let i = overrides.length - 1; i >= 0; i--) if (overrides[i].roadId === roadId) return overrides[i].square;
  return undefined;
}

export function crossingChoice(roadId: number | undefined, overrides: readonly CrossingOverride[] = []): CrossingChoice | undefined {
  for (let i = overrides.length - 1; i >= 0; i--) if (overrides[i].roadId === roadId) return overrides[i].type;
  return undefined;
}

/** Compose requested bridge cells with the existing manual mask (−1 elsewhere!). Pass this to
 * chooseStructures.overrides, never replace its economic/river/rail forced mask. Invalid bridges
 * stay built and billed; chooseStructures reports low/short runs. Crossing choices win overlapping
 * structure paint locally; unrelated paint remains untouched. Call at BOTH full and balance grids. */
export function crossingBridgeMask(s: ArrayLike<number>, raw: readonly RoadCrossing[],
  overrides: readonly CrossingOverride[] = [], base?: ArrayLike<number>): Int8Array {
  const mask = base ? Int8Array.from(base) : new Int8Array(s.length).fill(-1);
  if (s.length < 2) return mask;
  const ds = s[1] - s[0];
  const pad = Math.max(1, Math.ceil((STRUCTURE_RULES.minBridgeLength / ds - 1) / 2));
  for (const c of raw) if (crossingChoice(c.way, overrides) === 'bridge') {
    if (c.s < s[0] - ds || c.s > s[s.length - 1] + ds) continue;
    const i = Math.max(0, Math.min(s.length - 1, Math.round((c.s - s[0]) / ds)));
    // Tie-ins remain at grade. An endpoint request is still diagnosed by resolveCrossings rather
    // than drawing a bridge into A/B; a clipped short run remains a structure violation.
    for (let j = Math.max(1, i - pad); j <= Math.min(s.length - 2, i + pad); j++) mask[j] = KIND.bridge;
  }
  return mask;
}

/** Shared automatic/manual pricing; excludes main-road bridge/tunnel costs and surcharge. A railway or
 * motorway of the project carried over us climbs to the deck on its own line: its deck only (heldRailway). */
export function overbridgePrice(c: CrossingResult, footprint: number, urban: number) {
  const row = ROAD_CLASSES[c.cls], u = urban >= 0.5 ? 1 : 0;
  // (a mapped bridge high enough over our road is kept as it stands; the geometry checks that it spans our works)
  if (keepsBridge(c)) return { span: footprint, approachLength: 0, roadPerKm: row.roadPerKm[u], roadCode: row.roadCodes[u], cost: 0 };
  const approachLength = heldRailway(c) ? 0 : 2 * Math.max(0, CROSSING_RULES.underDepth + c.h) / row.rampGradient;
  const span = footprint, roadPerKm = row.roadPerKm[u];
  // The cut/road corridor stays unobstructed: one clear span, bank-top abutments, no fictitious
  // piers on the main road. Depth below the banks is not a pier height. Raised approaches stay separate.
  const deck = bridgeModel(row).total(span, 0, { span, pierDensity: 0 });
  return { span, approachLength, roadPerKm, roadCode: row.roadCodes[u], cost: deck + approachLength * roadPerKm / 1000 };
}
/** A mapped bridge over our road with the depth under it a new bridge over us needs (CROSSING_RULES.underDepth). */
export const keepsBridge = (c: Pick<CrossingResult, 'mapped' | 'h'>) => c.mapped === 'bridge' && c.h <= -CROSSING_RULES.underDepth + 1e-6;
/** A mapped tunnel under our road with the height over it our bridge over a road needs (CROSSING_RULES.overHeight). */
export const keepsTunnel = (c: Pick<CrossingResult, 'mapped' | 'h'>) => c.mapped === 'tunnel' && c.h >= CROSSING_RULES.overHeight - 1e-6;
export function reconnectionPrice(c: CrossingResult, gap: number, urban: number) {
  const row = ROAD_CLASSES[c.cls], u = urban >= 0.5 ? 1 : 0;
  const linkLength = 2 * Math.max(CROSSING_RULES.linkMinLength, gap), roadPerKm = row.roadPerKm[u];
  const linkCost = linkLength * roadPerKm / 1000;
  return { linkLength, roadPerKm, roadCode: row.roadCodes[u], linkCost,
    cost: linkCost + (c.cls === 'service' ? ACCESS : 0) };
}

/** Small RC box carrying the crossed way through our embankment, or undefined when its class
 * has no underpass size. `length` is the box length along the crossed way. */
export function underpassPrice(c: Pick<CrossingResult, 'cls'> & { h?: number }, length: number, urban: number) {
  const row = ROAD_CLASSES[c.cls], u = urban >= 0.5 ? 1 : 0;
  if (!row.underpass) return undefined;
  const box = underpassAssembly(row.underpass, row.roadPerKm[u] / 1000);
  // Under a low embankment (estimate; the geometry pass measures it): the way lowered on ramps at its
  // class gradient, its low point pumped up to where a ramp meets the ground (the dearer drainage).
  const lowered = c.h === undefined ? 0 : Math.max(0, box.minHeight - c.h), ramp = lowered / row.rampGradient;
  const extra = lowered > 0 ? 2 * ramp * row.roadPerKm[u] / 1000 + sagDrainage(undefined, ramp).cost : 0;
  return { underpassLength: length, roadCode: row.roadCodes[u], roadPerKm: row.roadPerKm[u], cost: length * box.perM + 2 * box.head + extra,
    minHeight: box.minHeight, box };
}
const priced = (p: NonNullable<ReturnType<typeof underpassPrice>>) => ({ underpassLength: p.underpassLength, roadCode: p.roadCode, roadPerKm: p.roadPerKm, cost: p.cost });

const rank = Object.fromEntries(Object.keys(ROAD_CLASSES).map((key, i) => [key, i]));

/** Mutates results, retaining station order. A/B consume junction spacing and include a collector,
 * NOT motorway access. Manual choices precede class-priority Auto junctions. Links expand from
 * already-resolved compatible roads, never cyclic pairs of severed roads. Invalid choices are
 * visible and priced, but cannot become anchors for another road. */
export function resolveCrossings(crossings: CrossingResult[], length: number, kind: ArrayLike<number>,
  footprint: ArrayLike<number>, urban: ArrayLike<number>, billingUrban: ArrayLike<number> = urban,
  overrides: readonly CrossingOverride[] = [], gradeSeparated: false | 'motorway' | 'railway' = false,
  /** A designed road of the project (project-roadnet.ts): bridged, passed under or met in a junction,
   * never cut and rerouted (the player has just drawn it there). */
  designed: (roadId: number) => boolean = () => false,
  /** Junctions this far apart along our road, m: ČSN 73 6101's 1.5 km; none for a local road or track, whose
   * norms (ČSN 73 6110 group C, ČSN 73 6109) set no such spacing in the parts read (research/42). */
  junctionSpacing: number = CROSSING_RULES.junctionSpacing,
  /** Our road is a local road or a track (its category's `minor`): where it meets another minor road at the
   * same level, Auto builds a crossroads (minorCrossroads), as for class I–III roads. */
  minor?: 'local' | 'track',
  /** A rebuilt stretch's side road (EvalOptions.sideWays): what its junction costs where the new line crosses it
   * at its level (undefined: not one). Its access is kept: it joins the new road there as it joined the old one
   * (an existing access, not a new junction: no spacing). */
  sideAccess?: (c: CrossingResult) => number | undefined,
  /** A mapped bridge's or tunnel's ends lie outside our earthworks (evaluate.ts): only then can it stay as it stands. */
  endsOutside: (c: CrossingResult) => boolean = () => true): CrossingIssue[] {
  const issues: CrossingIssue[] = [];
  /** what a junction with the crossed way costs; undefined: Auto does not meet it at a junction */
  const junctionCost = (c: CrossingResult) => minorCrossroads(minor, c.cls) ?? (ROAD_CLASSES[c.cls].junction ? JUNCTION : undefined);
  const issue = (c: CrossingResult, code: CrossingIssue['crossing']['code'], title: string, fix: string,
    actual?: number, required?: number, targetS?: number) => {
    const v: CrossingIssue = { kind: 'crossing', s0: c.s, s1: c.s, title, fix, basis: 'game',
      rule: {
        spacing: 'ČSN 73 6101:2018: junctions at least 1.5 km apart, counting both ends of the route (also in town: a scenario assumption)',
        class: 'ČSN 73 6101: motorways and expressways are crossed only at a different level, with no direct access', // research/08
        ours: gradeSeparated === 'railway' ? 'Game rule: a new railway crosses roads only on bridges, under them or by rerouting them (no level crossings)'
          : 'ČSN 73 6101: a motorway has no level junctions or direct access; other roads cross it on bridges, under it, or are rerouted to such a crossing', // research/08
        depth: 'Game rule: a bridge over our road needs a cutting at least 6 m deep where the crossed road cannot be raised; a junction cannot lie in such a cutting',
        clearance: 'Game rule: our bridge needs 6 m above ordinary roads and 7.5 m above motorways; a junction cannot lie that high',
        structure: 'Game rule: the crossing choice and what our road does there (bridge, tunnel, earthworks) must agree',
        reach: `Game limit: a reroute reaches at most ${CROSSING_RULES.linkHardReach} m along our road to the next crossing`,
        geometry: 'Game rule: crossed roads keep their real line and meet the ground at both ends',
        underpass: `Game estimate: an underpass box takes only tracks, service roads and local roads, needs room for its height, roof and earth cover under our road (the crossed road may be lowered by up to ${LOWERING_RULES.maxDepth} m to make it), and is at most ${UNDERPASS_RULES.maxLength} m long`,
        shape: 'Game rule: a reroute the player shaped must be buildable where it is drawn',
        reroute: 'Game rule: a reroute must be buildable',
        square: 'Game rule: a straightened crossing is built like any new road', // research/44
        end: 'Game rule: a new piece of a cut road joins, on its own side of our road, a road that leads on',
      }[code],
      detail: 'Your choice stays as you made it and is priced. Set it back to Automatic to let the game decide.',
      crossing: { roadId: c.roadId, requested: c.requestedType!, code, actual, required, targetS } };
    issues.push(v); (c.issues ??= []).push(v);
  };
  const priority = [...crossings].sort((a, b) => rank[a.cls] - rank[b.cls] || a.s - b.s || a.i - b.i);
  const junctions = [0, length];
  // A grade-separated route (motorway) cannot take local traffic at its ends: no reroute leads there.
  const anchors: { s: number; cls?: string; roadId?: number }[] = gradeSeparated ? [] : [{ s: 0 }, { s: length }];
  const separated = (c: CrossingResult) => overbridgePrice(c, footprint[c.i], urban[c.i]);
  for (const c of crossings) {
    c.type = 'atGrade'; c.cost = 0;
    delete c.linkLength; delete c.targetS; delete c.targetRoadId; delete c.span; delete c.approachLength; delete c.underpassLength;
    delete c.roadCode; delete c.roadPerKm; delete c.issues; delete c.geometry;
    delete c.tieLength; delete c.wallLength; delete c.worksCost; delete c.via; delete c.viaTo; delete c.ends; delete c.endTo; delete c.culverts; delete c.culvertCost; delete c.houses; delete c.houseCost; delete c.homes; delete c.linkGrade; delete c.closure; delete c.farClosure; delete c.accessFor; delete c.buyout; delete c.cutOff;
    delete c.lowered; delete c.drainage; delete c.drainCost; delete c.squared; delete c.realignLength; delete c.realignCost; delete c.moved; delete c.under; delete c.overRailway; delete c.kept; delete c.joined;
    c.requestedType = crossingChoice(c.roadId, overrides);
    const square = crossingSquare(c.roadId, overrides);
    if (square !== undefined) c.square = square; else delete c.square;
  }
  // A choice is made for a way; where that way crosses us again under our bridge or in our tunnel, and the
  // choice is met at another of its crossings, that one is simply passed (no clash).
  for (const c of crossings) if (c.requestedType && c.requestedType !== 'bridge' && kind[c.i] !== KIND.earth
    && crossings.some(o => o !== c && o.roadId === c.roadId && kind[o.i] === KIND.earth)) { delete c.requestedType; delete c.square; }
  // A shape is absolute: it belongs to the one crossing of its way nearest to its bend points (and the ends the
  // player led its pieces to).
  for (const o of overrides) if (o.type === 'reconnection' && (o.via || o.ends)) {
    const points: { x: number; y: number }[] = [...o.via?.[0] ?? [], ...o.via?.[1] ?? []];
    for (const e of o.ends ?? []) if (e) points.push(e);
    const x = points.reduce((a, p) => a + p.x, 0) / points.length, y = points.reduce((a, p) => a + p.y, 0) / points.length;
    let owner: CrossingResult | undefined;
    for (const c of crossings) if (c.roadId === o.roadId && (!owner || Math.hypot(c.x - x, c.y - y) < Math.hypot(owner.x - x, owner.y - y))) owner = c;
    if (owner && o.via) { owner.via = o.via; if (o.to !== undefined) owner.viaTo = o.to; }
    if (owner && o.ends) owner.ends = o.ends;
  }
  for (const c of priority) {
    const choice = c.requestedType, row = ROAD_CLASSES[c.cls];
    if (!choice) continue;
    c.type = choice === 'reconnection' && c.cls === 'track' ? 'diversion' : choice;
    if (choice !== 'bridge' && kind[c.i] !== KIND.earth) issue(c, 'structure', 'Your crossing choice clashes with our bridge or tunnel here',
      'Set this crossing back to Automatic, or change our bridge or tunnel here in the profile');
    // row.junction is an Auto candidate heuristic, not a ban on manually connecting local roads.
    if (choice === 'junction' && gradeSeparated)
      issue(c, 'ours', gradeSeparated === 'railway' ? 'Our railway cannot cross a road at the same level' : 'Our motorway cannot have a level junction',
        'Choose "Our bridge over it", "Its bridge over us", an underpass or "Cut it"');
    else if ((choice === 'junction' || choice === 'reconnection') && row.noAtGrade)
      issue(c, 'class', `A ${row.label} cannot meet our road at the same level`, 'Choose "Our bridge over it" with enough height, or "Its bridge over us" over a cutting at least 6 m deep');
    if (choice === 'bridge') {
      const need = row.noAtGrade ? STRUCTURE_RULES.railClearance : CROSSING_RULES.overHeight;
      if (c.h < need - 1e-6) issue(c, 'clearance', 'Our bridge is too low over this road',
        `Raise our road here by ${(need - c.h).toFixed(1)} m, to at least ${need} m above the crossed road`, c.h, need);
      if (kind[c.i] !== KIND.bridge) issue(c, 'structure', 'Our bridge over this road was not built',
        'Paint a bridge over this stretch in the profile, or set the crossing back to Automatic');
    } else if (choice === 'overbridge') {
      Object.assign(c, separated(c));
      // Ordinary roads can be raised on the same priced approaches as Auto. Motorways/trunks
      // retain their fixed level and require our road to provide the full depth.
      if (row.noAtGrade && c.h > -CROSSING_RULES.underDepth + 1e-6) issue(c, 'depth', 'A bridge over our road needs a deeper cutting here',
        `Lower our road here by ${(c.h + CROSSING_RULES.underDepth).toFixed(1)} m, to ${CROSSING_RULES.underDepth} m below the crossed road`, -c.h, CROSSING_RULES.underDepth);
    } else if (choice === 'junction') {
      // (a rebuilt road's side road keeps its access at its price, an existing access: no spacing)
      const access = gradeSeparated || row.noAtGrade ? undefined : sideAccess?.(c);
      c.cost = access ?? junctionCost(c) ?? JUNCTION;
      const near = junctions.reduce((a, s) => Math.abs(c.s - s) < Math.abs(c.s - a) ? s : a, junctions[0]);
      const gap = Math.abs(c.s - near);
      if (access === undefined && gap < junctionSpacing) issue(c, 'spacing', 'Junctions are too close',
        `Keep at least ${junctionSpacing} m from the junction (or route end) at km ${(near / 1000).toFixed(2)} — now ${gap.toFixed(0)} m — or choose a bridge instead`, gap, junctionSpacing, near);
      if (c.h <= -CROSSING_RULES.underDepth) issue(c, 'depth', 'Junction would lie deep below the crossed road',
        `Raise our road here by more than ${(-CROSSING_RULES.underDepth - c.h).toFixed(1)} m, out of the ${CROSSING_RULES.underDepth} m deep cutting, or choose "Its bridge over us"`, c.h, -CROSSING_RULES.underDepth);
      if (c.h >= CROSSING_RULES.overHeight) issue(c, 'clearance', 'Junction would lie high above the crossed road',
        `Lower our road here by more than ${(c.h - CROSSING_RULES.overHeight).toFixed(1)} m, below ${CROSSING_RULES.overHeight} m above the crossed road, or choose "Our bridge over it"`, c.h, CROSSING_RULES.overHeight);
      if (!row.noAtGrade && (access === undefined || row.junction)) junctions.push(c.s);
    } else if (choice === 'underpass' && keepsTunnel(c) && kind[c.i] === KIND.earth && !c.square && endsOutside(c)) {
      // (a mapped tunnel deep enough under us already is one: kept as it stands)
      c.kept = true;
    } else if (choice === 'underpass') {
      const box = underpassPrice(c, footprint[c.i], urban[c.i]);
      if (!box) issue(c, 'underpass', `A ${row.label} cannot pass through a small underpass`, 'Choose "Our bridge over it", "Its bridge over us" or "Cut it"');
      else {
        Object.assign(c, priced(box));
        // (lower than the box needs, the way is lowered into a cut, by at most LOWERING_RULES.maxDepth)
        const lowest = box.minHeight - LOWERING_RULES.maxDepth;
        if (c.h < lowest - 1e-6) issue(c, 'underpass', 'Embankment too low for an underpass',
          `Raise our road here by ${(lowest - c.h).toFixed(1)} m, ${lowest < -0.005 ? `to ${(-lowest).toFixed(2)} m below` : `to at least ${Math.abs(lowest).toFixed(2)} m above`} the crossed road: the box needs ${box.minHeight.toFixed(2)} m (${box.box.height} m inside, plus its roof and earth cover), and the ${row.label} can be lowered by at most ${LOWERING_RULES.maxDepth} m`, c.h, lowest);
      }
    }
    if (choice !== 'reconnection' && !row.noAtGrade && !c.issues?.length) anchors.push(c);
  }
  for (const c of priority) {
    const row = ROAD_CLASSES[c.cls];
    if (c.requestedType) continue;
    // (a mapped bridge with room over our own bridge passes over it as it stands: the geometry checks its ends)
    if (kind[c.i] === KIND.bridge && keepsBridge(c)) { c.type = 'overbridge'; Object.assign(c, separated(c)); }
    else if (kind[c.i] === KIND.bridge) c.type = 'bridge';
    else if (kind[c.i] === KIND.tunnel) c.type = 'tunnel';
    // a mapped tunnel deep enough under our earthworks, its portals beyond them, passes under us as it is (nothing built)
    else if (keepsTunnel(c) && endsOutside(c)) { c.type = 'underpass'; c.kept = true; }
    else if (row.noAtGrade && (c.h <= -CROSSING_RULES.underDepth || heldRailway(c))) {
      // (a railway of the project passes over us wherever our line is: it follows our crossing's height,
      // project-evaluate.ts, as a road of the project does)
      c.type = 'overbridge'; Object.assign(c, separated(c));
    } else continue;
    if (!row.noAtGrade) anchors.push(c);
  }
  for (const c of priority) {
    const access = gradeSeparated || ROAD_CLASSES[c.cls].noAtGrade ? undefined : sideAccess?.(c);
    if (access === undefined || c.requestedType || c.type !== 'atGrade' || c.h <= -CROSSING_RULES.underDepth || c.h >= CROSSING_RULES.overHeight) continue;
    c.type = 'junction'; c.cost = access; anchors.push(c);
    if (ROAD_CLASSES[c.cls].junction) junctions.push(c.s);
  }
  for (const c of priority) {
    const cost = junctionCost(c);
    if (gradeSeparated || c.requestedType || c.type !== 'atGrade' || cost === undefined || c.h <= -CROSSING_RULES.underDepth) continue;
    if (junctions.every(s => Math.abs(c.s - s) >= junctionSpacing)) {
      c.type = 'junction'; c.cost = cost;
      junctions.push(c.s); anchors.push(c);
    }
  }
  const pending = priority.filter(c => c.requestedType === 'reconnection' || (c.type === 'atGrade' && !ROAD_CLASSES[c.cls].noAtGrade));
  const tier = (c: CrossingResult) => ROAD_CLASSES[c.cls].junction ? 0 : c.cls === 'track' ? 3 : c.cls === 'service' ? 2 : 1;
  const kept = (c: CrossingResult, a: { s: number; roadId?: number }) => c.viaTo !== undefined
    && (c.viaTo >= 0 ? a.roadId === c.viaTo : a.roadId === undefined && a.s === (c.viaTo === -1 ? 0 : length));
  const nearest = pending.map(c => {
    let target = anchors[0] as (typeof anchors)[number] | undefined, gap = Infinity, fixed = false;
    for (const a of anchors) if (kept(c, a)) { target = a; gap = Math.abs(c.s - a.s); fixed = true; }
    if (!fixed) for (const a of anchors) if (compatible(c, a.cls)) {
      const d = Math.abs(c.s - a.s);
      if (d < gap || (d === gap && a.s < target!.s)) { gap = d; target = a; }
    }
    return { c, target, gap, fixed };
  });
  while (nearest.length) {
    // A shaped reroute waits for the crossing it leads to (unless nothing else is left to resolve).
    const waiting = (p: typeof nearest[number]) => p.c.viaTo !== undefined && !p.fixed;
    let next = 0;
    for (let i = 1; i < nearest.length; i++) {
      const a = nearest[i], b = nearest[next];
      if (waiting(b) !== waiting(a)) { if (waiting(b)) next = i; continue; }
      if (tier(a.c) < tier(b.c) || (tier(a.c) === tier(b.c) && (a.gap < b.gap || (a.gap === b.gap && a.c.s < b.c.s)))) next = i;
    }
    const { c, target, gap } = nearest.splice(next, 1)[0];
    const link = reconnectionPrice(c, gap, urban[c.i]);
    const access = c.cls === 'service' ? ACCESS : 0;
    const linkCost = link.linkCost;
    const over = separated(c);
    const surcharge = 1 + surchargeRate(billingUrban[c.i]);
    // Footprint width is the box-length estimate; the geometry pass measures it along the way.
    const box = kind[c.i] === KIND.earth && underpassFits(c, footprint[c.i]) ? underpassPrice(c, footprint[c.i], urban[c.i]) : undefined;
    const linkTotal = gap <= CROSSING_RULES.linkMaxReach ? linkCost * surcharge + access : Infinity;
    const overTotal = over.cost * surcharge, boxTotal = box ? box.cost * surcharge : Infinity;
    if (c.roadId !== undefined && designed(c.roadId)) {
      if (c.requestedType === 'reconnection') issue(c, 'reach', 'A new road cannot be cut and rerouted', 'Choose "Our bridge over it", "Its bridge over us" or a junction');
      if (box && boxTotal < overTotal) { c.type = 'underpass'; Object.assign(c, priced(box)); } else { c.type = 'overbridge'; Object.assign(c, over); }
    } else if (c.requestedType === 'reconnection' && (!target || !Number.isFinite(gap)) && c.ends?.some(Boolean)) {
      // (no crossing of ours to lead it to, but the player led its pieces to roads of their choosing: those are
      // built, the geometry says whether every part that needs one has a road; priced meanwhile on the straight
      // line to the farthest of them)
      c.type = c.cls === 'track' ? 'diversion' : 'reconnection';
      const reach = Math.max(...c.ends.map(e => e ? Math.hypot(e.x - c.x, e.y - c.y) : 0));
      const { linkCost: _linkCost, ...priced } = reconnectionPrice(c, reach, urban[c.i]);
      Object.assign(c, priced);
    } else if (c.requestedType === 'reconnection' && !target) {
      // A grade-separated route has no crossing yet that a cut road could be led to: say so and keep
      // the road over us so the result stays buildable and priced.
      issue(c, 'reach', 'No crossing to reroute it to', 'Choose "Its bridge over us" or an underpass, or first build a bridge or underpass for another road nearby');
      c.type = 'overbridge'; Object.assign(c, over);
    } else if (c.requestedType === 'reconnection' || (target && linkTotal < overTotal && linkTotal <= boxTotal)) {
      c.type = c.cls === 'track' ? 'diversion' : 'reconnection';
      const { linkCost: _linkCost, ...priced } = link;
      Object.assign(c, priced); c.targetS = target!.s; c.targetRoadId = target!.roadId;
      // (not where both pieces are led where the player chose)
      if (c.requestedType && gap > CROSSING_RULES.linkHardReach && !(c.ends?.[0] && c.ends[1])) issue(c, 'reach', 'Reroute would be too long',
        `Choose "Its bridge over us" or an underpass, or make a crossing it can reach within ${CROSSING_RULES.linkHardReach} m along our road (now ${gap.toFixed(0)} m)`, gap, CROSSING_RULES.linkHardReach, target!.s);
    } else if (box && boxTotal < overTotal) {
      c.type = 'underpass'; Object.assign(c, priced(box));
    } else {
      c.type = 'overbridge'; Object.assign(c, over);
    }
    // A reroute leads to a crossing that carries traffic over or under us (or to a route end), never to
    // another cut road (a shaped one keeps leading where the player led it).
    const carries = c.type !== 'reconnection' && c.type !== 'diversion';
    for (const p of nearest) if (!p.fixed && !c.issues?.length && !ROAD_CLASSES[c.cls].noAtGrade && ((carries && compatible(p.c, c.cls)) || kept(p.c, c))) {
      const d = Math.abs(p.c.s - c.s);
      // a shaped reroute keeps leading where it led when the player shaped it
      if (kept(p.c, c)) { p.gap = d; p.target = c; p.fixed = true; }
      else if (d < p.gap || (d === p.gap && c.s < (p.target?.s ?? Infinity))) { p.gap = d; p.target = c; }
    }
  }
  return issues;
}

/** Through/local roads cannot discharge into a driveway/track; lower classes may share higher ones. */
export function compatible(c: Pick<CrossingResult, 'cls'>, cls?: string): boolean {
  return c.cls === 'track' || c.cls === 'service' || (cls !== 'track' && cls !== 'service');
}

/** Player-facing label with the built quantities (src/core/terms.ts). */
export function crossingLabel(c: CrossingResult, line: OurLine = 'road'): string { return crossingOutcome(c, line).label; }

/** Geometry inputs deliberately do not import evaluate.ts; safe in the worker and synthetic tests. */
/** (What of it differs between the passes of one evaluation is listed in crossings-kept.ts `CrossingInputs`:
 * a retry builds again only the crossings near where those differ. A new per-pass input belongs there too.) */
export interface CrossingRoute {
  s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>;
  tx: ArrayLike<number>; ty: ArrayLike<number>; grade: ArrayLike<number>;
  /** Actual built footprint, not the earthwork option under a bridge. */
  width: ArrayLike<number>;
  /** Optional asymmetric built footprint distances, positive to either side. */
  left?: ArrayLike<number>; right?: ArrayLike<number>;
  /** The cones of fill in front of our abutments (abutment-cone.ts): part of our body a slope keeps out of (our-body.ts). */
  cones?: readonly import('./abutment-cone').AbutmentCone[];
  crownWidth?: number;
  /** Built structure kind per station; Auto considers an underpass only under earthwork. */
  kind?: ArrayLike<number>;
  /** Streams (watercourse lines) a new road from a to b crosses: each needs a culvert. */
  streams?: (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: number; y: number; crossing: import('./watercourses').WaterCrossing })[];
  /** Urban share per station (≥ 0.5: urban SPK price rows for side-road regrades). */
  urban?: ArrayLike<number>;
  /** The crossed roads' own level: a mapped bridge's deck or a mapped tunnel's road where one is (mapped-structures.ts
   * wayLevels), the ground elsewhere (absent: the ground everywhere). The same for every pass of an evaluation. */
  wayLevel?: (x: number, y: number) => number;
  /** What blocks a new road of this half-width from a to b on the ground (a player's reroute shape; a kept house
   * within its working strip). */
  obstacle?: (a: { x: number; y: number }, b: { x: number; y: number }, half: number) => LinkObstacle | null;
  /** Houses still standing under a new road from a to b or within the working strip beside it (BUILDING_RULES.clearance). */
  houses?: (a: { x: number; y: number }, b: { x: number; y: number }, half: number) => number[];
  /** The buildings people go to (a house, flats, a farm or a works, a civic building; no shed or garage) still standing
   * (kept ones too) within `reach` of the stretch a–b, and (`apart`) not within that of a public road (what a cut way's
   * piece serves). */
  served?: (a: { x: number; y: number }, b: { x: number; y: number }, reach: number, apart?: number) => readonly number[];
  /** A house the player keeps (never bought out for a crossing). */
  keptHouse?: (j: number) => boolean;
  /** Houses on a paved disk (a turning area) or within its working strip still standing: those bought out with it, and whether one is kept. */
  housesOnDisk?: (x: number, y: number, radius: number) => { take: number[]; kept: boolean };
  /** Houses and mapped railways beside a crossed road's raised or lowered stretch (crossing-works.ts). */
  beside?: import('./crossing-works').WorksContext['beside'];
  /** A mapped railway under a road of this half-width from a to b. */
  railway?: (a: { x: number; y: number }, b: { x: number; y: number }, half: number) => boolean;
  houseCost?: (j: number) => number;
  /** A home (not a shed, garage or barn): a reroute takes one only where nothing else can be built (research/60). */
  dwelling?: (j: number) => boolean;
}

export { buildCrossingGeometry, ownHomes, crossingCache, crossingPlanLength, auditCrossingGeometry, underpassFits, type CrossingCache } from './crossing-geometry';
