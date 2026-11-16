// Player vocabulary: the ONE place for the plain words the game uses for crossing and footprint
// outcomes, and the list of internal terms that must never reach player-facing text.
//
// Every player-facing message (violation title / fix / detail, crossing card labels and tooltips,
// profile tooltips, bill lines) says what is wrong or what is built in everyday words: where it is,
// one concrete fix with a number where one can be computed, and why. tests/player-text.test.ts
// generates every violation kind and every crossing / footprint outcome and fails on any JARGON hit.
// New features must add their outcome words here instead of inventing new terms in messages.
//
// Glossary of player words (allowed): our road, crossed road, track, service road, street, local road,
// class I–III road, motorway, junction, bridge, tunnel, cutting, embankment, slope, earthworks, ramp,
// retaining wall, culvert, stream, underpass, rerouted, reconnected, moved aside, closed, turning area,
// height point, bend, km, m, %. Source names (ČSN 73 …, SPK, OTSKP, research/NN, Act …) appear only
// where a requirement or a price cites its source: a violation's `rule` line and the bill's pricing
// tooltips.
import type { CrossingResult } from './crossings';
import type { FootprintConflict } from './footprint';
import type { RoadRealignmentPlan } from './road-realignment';
import type { ProjectReceiver } from './project';
import * as dm from './detmath';
import { ROAD_CLASSES } from './data/urban';
import { LOWERING_RULES, underpassAssembly } from './data/remedies';

/** Internal terms that never appear in player-facing text, with the reason shown when a test fails. */
export const JARGON: readonly [RegExp, string][] = [
  [/\b[A-Z]\.\d+\.[A-Z0-9]/, 'price-list item code (e.g. A.1.M.7,5.NER)'],
  [/unhandled/i, '"unhandled"'],
  [/tie-?ins?\b/i, '"tie-in"'],
  [/realign/i, '"realignment"'],
  [/engineering/i, '"engineering"'],
  [/\bfaces?\b/i, '"faces"'],
  [/\bDP\b/, '"DP"'],
  [/\bVPIs?\b/, '"VPI"'],
  [/λ/, '"λ"'],
  [/\blump/i, '"lump"'],
  [/allowance/i, '"allowance"'],
  [/footprint/i, '"footprint"'],
  [/\bOSM\b|polyline|\bsource way\b/i, 'map-data internals'],
  [/budget|\bclipped\b|\bbounded\b|\bmask\b|\bgrid\b/i, 'solver internals'],
  [/\banchors?\b/i, '"anchor"'],
  [/study-stage|\bremed(y|ies)\b/i, 'planning jargon'],
  [/\bmain-road\b|\bmain road\b/i, '"main road" (say "our road")'],
  [/\bQ100\b|\bDEM\b|\bRC\b|\bA\/B\b/, 'technical abbreviation'],
  [/overbridge|diversion|diverted|reconnection/i, 'old outcome name (see OUTCOME)'],
  // the interface rethink (docs/interface-rethink.md): words players tripped over
  [/\breceivers?\b|L<sub>Aeq|\bLAeq\b/i, 'noise-model term (say "top floor", "night noise")'],
  [/\bretained\b|\bblocking\b|keep\/wall/i, 'rule-engine term'],
  [/\bdwellings?\b/i, '"dwelling" (say "house")'],
  [/#\d/, 'object ID'],
  [/\bstation\b/i, '"station" (say "km")'],
];
/** Source names: allowed only in a violation's `rule` line and pricing tooltips. */
export const SOURCE_NAMES: readonly [RegExp, string][] = [
  [/\bSPK\b/, '"SPK" (price norm)'],
  [/\bOTSKP\b/, '"OTSKP" (price list)'],
  [/\bSFDI\b/, '"SFDI"'],
  [/ČSN/, 'norm number'],
  [/research\/\d+/, 'research note reference'],
];

/** Every internal term found in `text`; `sources` also flags source names. */
export function jargonIn(text: string, sources = true): string[] {
  return [...JARGON, ...(sources ? SOURCE_NAMES : [])].filter(([re]) => re.test(text)).map(([, why]) => why);
}

const km = (s: number) => (s / 1000).toFixed(2);
const m = (v: number | undefined) => Math.round(v ?? 0).toLocaleString('en-US');
const pct = (v: number) => `${Math.round(v * 100)} %`;
const label = (cls: string) => ROAD_CLASSES[cls]?.label ?? 'road';

/** Crossing outcomes: a short tag, a label with the built quantities, a one-sentence explanation. */
export interface OutcomeText { tag: string; label: string; explain: string }
type OutcomeOf = Pick<CrossingResult, 'type' | 'cls' | 'span' | 'approachLength' | 'linkLength' | 'targetS' | 'underpassLength' | 'tieLength' | 'wallLength'
  | 'culverts' | 'houses' | 'linkGrade' | 'lowered' | 'drainage' | 'squared' | 'realignLength' | 'moved' | 'targetRoadId'>;
/** What our line is, in the player's words: "our road", "our railway", "our motorway". */
export type OurLine = 'road' | 'railway' | 'motorway';
export const ourWords = (text: string, line: OurLine = 'road') => line === 'road' ? text
  : text.replace(/\bour road\b/g, `our ${line}`).replace(/\bOur road\b/g, `Our ${line}`).replace(/\bthe new road\b/g, `the new ${line}`);
/** What a rebuilt stretch replaces, in the player's words: "old road", "old track". */
export const oldLineWords = (line: OurLine = 'road') => line === 'railway' ? 'old track' : 'old road';
export function crossingOutcome(c: OutcomeOf & Pick<CrossingResult, 'shared'>, line: OurLine = 'road'): OutcomeText {
  const words = (o: OutcomeText) => ({ ...o, label: ourWords(o.label, line), explain: ourWords(o.explain, line) });
  if (c.shared) {
    const o = ownOutcome({ ...c, targetS: undefined });
    return words({ ...o, label: `${o.label.replace(/ at km [0-9.]+/, '')}, built with the other direction`,
      explain: `${o.explain} Both directions of the motorway cross it here together; the other direction's bill carries it.` });
  }
  return words(ownOutcome(c));
}
function ownOutcome(c: OutcomeOf): OutcomeText {
  const row = ROAD_CLASSES[c.cls], what = label(c.cls);
  // what else its raised or lowered stretch takes (crossing-works.ts)
  const works = [c.tieLength ? ` Roads joining it there are raised or lowered to meet it (${m(c.tieLength)} m).` : '',
    c.wallLength ? ` A retaining wall (${m(c.wallLength)} m) keeps its slope off a road beside it.` : ''].join('');
  // what its new piece of road needs (link-route.ts)
  const link = [c.linkGrade ? ` The ground is steep: it climbs up to ${pct(c.linkGrade)} in places, the most its class allows where there is no other way.` : '',
    c.culverts ? ` ${c.culverts === 1 ? 'A culvert carries a stream' : `${c.culverts} culverts carry streams`} under it.` : '',
    c.houses?.length ? ` ${c.houses.length === 1 ? 'A house stands' : `${c.houses.length} houses stand`} in its way and ${c.houses.length === 1 ? 'is' : 'are'} bought out.` : ''].join('');
  // a skewed crossing laid on a new line at a right angle to ours (crossing-geometry.ts squarePath)
  const square = c.squared !== undefined ? `, the ${what} straightened to cross at a right angle` : '';
  const thing = c.type === 'underpass' ? 'box' : 'bridge';
  const squareWhy = c.squared !== undefined ? ` It met our road at ${Math.round(c.squared)}°; nearby it is laid on a new line crossing at a right angle, so the ${thing} is short (${m(c.realignLength)} m of new ${what}).` : '';
  const joinedTo = c.targetRoadId === undefined ? 'the road our road joins at its end' : `the road that crosses at km ${km(c.targetS ?? 0)}`;
  const crossesAt = c.targetRoadId === undefined ? 'the road at our road\'s end' : `the crossing at km ${km(c.targetS ?? 0)}`;
  // (its cut ends lie on the road that crosses there: nothing new to build)
  if ((c.type === 'reconnection' || c.type === 'diversion') && !c.moved && !Math.round(c.linkLength ?? 0)) return { tag: c.type === 'diversion' ? 'rerouted' : 'reconnected',
    label: `Joined to ${crossesAt} (no new road needed)`,
    explain: `The ${what} is cut by the new road; what is left of it already joins the road that crosses there.${link}` };
  if (c.moved && (c.type === 'reconnection' || c.type === 'diversion')) return { tag: 'moved aside',
    label: `Moved beside our road (+${m(c.linkLength)} m of new ${c.type === 'diversion' ? 'track' : 'road'})`,
    explain: `The ${what} runs into our earthworks and comes back out on the same side, so it does not need to cross our road: that stretch is rebuilt beside the earthworks.${link}` };
  switch (c.type) {
    case 'bridge': return { tag: 'under our bridge', label: 'Passes under our bridge',
      explain: `Our road crosses over the ${what} on a bridge; the ${what} stays as it is.` };
    case 'tunnel': return { tag: 'above our tunnel', label: 'Our road is in a tunnel below it',
      explain: `Our road passes below the ${what} in a tunnel; the ${what} stays as it is.` };
    case 'overbridge': return { tag: 'its bridge over us',
      label: `Carried over our road on a ${m(c.span)} m bridge${c.approachLength ? ` with ${m(c.approachLength)} m of ramps` : ''}${square}`,
      explain: `The ${what} is raised onto a new bridge over our road; earth ramps on both sides, no steeper than ${pct(row?.rampGradient ?? 0.06)}${row && row.rampSteepest > row.rampGradient ? ` (up to ${pct(row.rampSteepest)} where the ${what} itself slopes the same way)` : ''}, bring it back down to its old level.${squareWhy}${works}` };
    case 'junction': return { tag: 'junction', label: 'Junction with our road',
      explain: `The ${what} meets our road at the same level in a new junction; near it, the ${what} is raised or lowered to our road's height.${works}` };
    case 'reconnection': return { tag: 'reconnected',
      label: `Reconnected to the crossing at km ${km(c.targetS ?? 0)} (+${m(c.linkLength)} m of new road)`,
      explain: `The ${what} is cut by the new road; on each side a new piece of road joins it to ${joinedTo}, along the outside of the earthworks where it has to. The cut ends get a turning area.${link}` };
    case 'diversion': return { tag: 'rerouted',
      label: `Rerouted to the nearest crossing at km ${km(c.targetS ?? 0)} (+${m(c.linkLength)} m of new track)`,
      explain: `The track is cut by the new road; a new piece of track joins it to ${joinedTo}, along the outside of the earthworks where it has to. The stub ends in a turnaround.${link}` };
    case 'underpass': {
      const box = row?.underpass ? underpassAssembly(row.underpass, 0) : undefined;
      const inside = box ? ` (${box.width} × ${box.height} m inside)` : '';
      // (no box could be laid out: the way ends under our earthworks, or its class takes none)
      if (!c.underpassLength) return { tag: 'underpass', label: `Underpass: no box fits here`,
        explain: `The ${what} cannot be carried through our embankment in a box here; see the problem below.` };
      if (c.lowered) return { tag: 'underpass', label: `Underpass: ${m(c.underpassLength)} m concrete box${inside}, the ${what} lowered by ${c.lowered.toFixed(1)} m${square}`,
        explain: `Our embankment is too low for the box, so the ${what} is lowered into a cutting on ramps (${m(c.approachLength)} m) no steeper than ${pct(row?.rampGradient ?? 0.08)}${row && row.rampSteepest > row.rampGradient ? ` (up to ${pct(row.rampSteepest)} where the ${what} itself slopes the same way)` : ''} and passes through it in a concrete box. Rainwater from the lowest point ${c.drainage === 'pump' ? 'is pumped out' : 'runs off in a pipe to lower ground'}.${squareWhy}${works}` };
      return { tag: 'underpass', label: `Underpass: ${m(c.underpassLength)} m concrete box${inside}${square}`,
        explain: `The ${what} keeps its level and passes through our embankment in a concrete box.${squareWhy}` };
    }
    case 'atGrade': return { tag: 'not allowed', label: 'Crosses our road at the same level — not allowed',
      explain: `Roads may cross ours at the same level only in a junction; the ${what} needs a junction, a bridge, an underpass or a reroute.` };
  }
}

/** The motorway's two directions: edited together, or each on its own (split) and joined again. */
export const DIRECTIONS_TEXT = {
  heading: 'Edit',
  both: 'Both directions',
  towards: (place: string) => `Towards ${place}`,
  together: 'Dragging bends both directions: one road body, bridges side by side, twin tunnels.',
  one: (place: string) => `Drag to bend towards ${place}. Pull it inward and Auto moves the other direction alongside it, unless you edited that too.`,
  separate: 'Each direction now has its own bends and heights. Where they run side by side at the same height they share one embankment and are priced as one.',
  join: 'Both directions joined on their shared line again. Undo brings back the separate changes.',
  bothTitle: 'Bend and raise both directions together',
  oneTitle: (place: string) => `Bend towards ${place}; Auto keeps the directions from crossing`,
  apart: 'Changed stretches',
  following: 'Both follow this bend',
  resetFollow: 'Reset',
  resetFollowTitle: 'Put both directions back on their original line here',
  stretch: (km0: string, km1: string) => `km ${km0}–${km1}`,
  joinHere: 'Join',
  joinTitle: 'Both directions on one line here again (Undo brings this direction’s changes back)',
  joined: 'Both directions run together here again.',
  togetherAgain: 'Both directions moved together: where one ran on its own next to this change, they run together again.',
} as const;


/** Automatic on a motorway: no junction anywhere along it. */
export const MOTORWAY_AUTOMATIC = 'The game decides: existing bridges stay; every other road gets the cheapest of a bridge over the motorway, an underpass through a high enough embankment or a reroute to a nearby crossing. A motorway has no junctions with the roads it crosses.';
/** Automatic on a railway: no level crossing anywhere along it (game rule, M1). */
export const RAILWAY_AUTOMATIC = 'The game decides: existing bridges stay; every other road gets the cheapest of a bridge over the railway, an underpass through a high enough embankment or a reroute to a nearby crossing. A new railway has no level crossings.';

/** A mapped road's card where another road's earthworks cover it (ui/mapped-road.ts): `by` is "our road" or a road's name. */
export const coveredText = (by: string) => `${by.charAt(0).toUpperCase()}${by.slice(1)} covers it here: pick it further away.`;

/** Automatic and Junction on a local road or track (no junction spacing; research/42, 43). */
export const MINOR_CROSSING_TEXT = {
  automatic: 'The game decides: existing bridges stay; every road but a motorway or expressway meets ours at its level in a junction; those get the cheapest of a bridge over our road, an underpass or a reroute to a nearby crossing.',
  junction: 'The crossed road meets ours at the same level in a junction (never a motorway or expressway).',
} as const;

/** The player's choices on the crossing card: [value, button label, what gets built]. */
export const CROSSING_CHOICE_TEXT: readonly ['' | 'junction' | 'bridge' | 'overbridge' | 'reconnection' | 'underpass', string, string][] = [
  ['', 'Automatic', 'The game decides: existing bridges stay; class I–III roads get a junction at least 1.5 km from the next one; other roads get the cheapest of a bridge over our road, an underpass or a reroute to a nearby crossing.'],
  ['junction', 'Junction', 'The crossed road meets ours at the same level in a junction, at least 1.5 km from the next junction (Automatic offers this to class I–III roads only; motorways never).'],
  ['bridge', 'Our bridge over it', 'Our road crosses over the crossed road on a bridge; it needs enough height above it.'],
  ['overbridge', 'Its bridge over us', 'The crossed road is raised onto a new bridge over our road, with earth ramps on both sides (a motorway only over a cutting at least 6 m deep).'],
  ['reconnection', 'Cut and reroute', 'The crossed road is cut at our road; on each side a new piece of road runs along the outside of our earthworks to the nearest place where it can cross, and the cut ends get a turning area.'],
  ['underpass', 'Underpass', `The crossed track or local road passes through our embankment in a concrete box (5 × 4.5 m inside for tracks, 8 × 4.5 m for local roads). It needs 5.5 / 5.65 m of embankment above the road; where there is less, the road is lowered into a cutting, by up to ${LOWERING_RULES.maxDepth} m.`],
];

/** Footprint outcomes (things our earthworks cover beside the road). */
export function footprintOutcome(c: Pick<FootprintConflict, 'feature' | 'action' | 'cls' | 'length' | 'affectedLength' | 'closed' | 'continuation'>): OutcomeText {
  const what = c.feature === 'road' ? label(c.cls ?? 'unclassified') : c.feature === 'railway' ? 'railway' : c.feature === 'water' ? 'pond or river' : c.feature === 'building' ? 'building' : 'stream';
  switch (c.action) {
    case 'relocation': return c.closed && !c.closed.detour
      ? { tag: 'removed', label: `${what}: ${m(c.closed.length)} m removed (a dead end under our earthworks)`,
        explain: `This dead-end piece of the ${what} lies (almost) wholly under our earthworks; too little of it would be left to turn round in, so it is removed with the land.` }
      : c.closed
      ? { tag: 'closed', label: `${what}: ${m(c.closed.length)} m closed (its ends stay connected by ${m(c.closed.detour)} m of other roads)`,
        explain: `This short piece of the ${what} lies under our earthworks and is removed; both its ends stay connected by existing roads.` }
      : { tag: 'moved aside', label: `${what}: ${m(c.affectedLength ?? c.length)} m under our earthworks, ${m(c.length)} m rebuilt beside them`,
        explain: `Part of the ${what} lies under our earthworks; that part is rebuilt next to them and keeps its connections.` };
    case 'retaining-wall': return { tag: 'retaining wall', label: `Retaining wall ${m(c.length)} m`,
      explain: c.feature === 'building' ? 'A concrete wall ends our slope early, so that the building next to it can stay.'
        : `A concrete wall ends our slope early so that it does not cover the ${what} next to it.` };
    case 'culvert': return { tag: 'longer culvert', label: `Longer culvert ${m(c.length)} m`,
      explain: 'The stream runs under our earthworks in a longer concrete pipe or box.' };
    case 'channel-relocation': return { tag: 'stream moved', label: `Stream moved: ${m(c.length)} m of new bed`,
      explain: 'The stream gets a new bed outside our earthworks.' };
    case 'junction': if (c.continuation) return { tag: 'joins', label: `Joins the old ${what}${c.length > 0 ? ` (${m(c.length)} m of its edge rebuilt)` : ''}`,
      explain: `The rebuilt stretch continues as the old ${what} here; the joint is part of the new road.` };
      return { tag: 'junction', label: `Junction with the ${what}${c.length > 0 ? ` (${m(c.length)} m of it rebuilt)` : ''}`,
      explain: `Our road ends by joining the ${what}; the edge of the ${what} where they meet is rebuilt as part of the junction.` };
    case 'blocked': return { tag: 'in the way', label: `${what} in the way (${m(c.affectedLength ?? c.length)} m)`,
      explain: `Our earthworks or bridge supports cover the ${what} and the game found no fix; this is a violation.` };
  }
}

/** Why an automatic road relocation failed, in plain words (the problem codes stay internal). */
export function realignmentReason(problems: readonly string[]): string {
  const reasons = new Set<string>();
  for (const p of problems) reasons.add(
    /footprint|anchors/.test(p) && !/turnaround/.test(p) ? 'there is no room for it beside our earthworks'
      : /grade|support/.test(p) ? 'the ground there is too steep for it'
        : /intersects an unhandled road|grade-separated/.test(p) ? 'it would have to cross another road on a ramp'
          : /sever/.test(p) ? 'it would cut off a side road'
            : /water\/rail/.test(p) ? 'it would run into water or a railway'
              : /turnaround/.test(p) ? 'there is no room for a turning area at its cut end'
                : /terrain data/.test(p) ? 'it would leave the map'
                  : /no surviving branch/.test(p) ? 'none of it would remain outside our earthworks'
                    : /wider/.test(p) ? 'it joins a wider road right there'
                      : 'the game could not trace where it continues');
  const list = [...reasons];
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0] ?? 'it found no way';
}
/** Plain description of an accepted road relocation or closure. */
export function roadRemedyDetail(what: string, affected: number, plan: Pick<RoadRealignmentPlan, 'length' | 'closed' | 'retainingArea' | 'turnaroundArea' | 'lumpCost'>, shared = 1): string {
  if (plan.closed && !plan.closed.detour) return `${affected.toFixed(0)} m of the ${what} lies under our earthworks; it is a dead end with too little left beside them to turn round in, so it is removed.`;
  if (plan.closed) return `${affected.toFixed(0)} m of the ${what} lies under our earthworks and is closed; its two ends stay connected by ${plan.closed.detour.toFixed(0)} m of existing roads.`;
  const extras = [plan.retainingArea ? `retaining walls (${plan.retainingArea.toFixed(0)} m² of wall) where it is raised or lowered` : '',
    plan.turnaroundArea ? 'a turning area at its cut end' : '', plan.lumpCost ? 'its junction with the road it joins' : ''].filter(Boolean);
  return `${affected.toFixed(0)} m of ${shared > 1 ? `${shared} roads` : `the ${what}`} lies under our earthworks; ${plan.length.toFixed(0)} m of new road is built beside them${extras.length ? `, with ${extras.join(' and ')}` : ''}. Its connections are kept.`;
}
export function roadRemedySource(plan: Pick<RoadRealignmentPlan, 'roadCode' | 'closed' | 'retainingArea' | 'lumpCost'>): string | undefined {
  if (plan.closed) return undefined;
  return `SPK 2026 price per km of ${/P4/.test(plan.roadCode) ? 'paved track' : /S\d/.test(plan.roadCode) ? 'class I–III road' : 'local road'}${plan.retainingArea ? '; retaining walls per research/18' : ''}${plan.lumpCost ? `; ${(plan.lumpCost / 1e6).toFixed(1)} M CZK for access junctions (provisional estimate, research/13)` : ''}`;
}

const NUMBERED: Record<string, string> = { primary: 'I', secondary: 'II', tertiary: 'III' };
/** A mapped road's name as Czech maps and signs write it: its own name, else "road III/1057" (class and
 * number; a stretch shared by two numbers names both), else the kind of road ("local road"). */
export function mappedRoadName(tags: { highway?: string; ref?: string; name?: string } | undefined, fallback = 'road'): string {
  if (tags?.name) return tags.name;
  const label = ROAD_CLASSES[tags?.highway ?? '']?.label ?? fallback, cls = NUMBERED[tags?.highway ?? ''];
  const numbers = (tags?.ref ?? '').split(';').map(r => r.trim()).filter(Boolean);
  if (!numbers.length) return label;
  return cls ? `road ${numbers.map(n => `${cls}/${n}`).join(' and ')}` : `${label} ${numbers.join(', ')}`;
}
/** Does that name already say the road's class (so a card need not repeat it)? */
export const namedByNumber = (tags: { highway?: string; ref?: string; name?: string } | undefined) => !tags?.name && !!tags?.ref && !!NUMBERED[tags.highway ?? ''];

/** The kernel words everything from the designed road's side ("our road", "our earthworks", "Its bridge
 * over us"). On a road that is not ours (a rebuilt or new side road) "our road" is the mission road, so
 * what the kernel says about the line being designed reads "this road" there (`line`: "this railway"). */
export function thisRoadWords(text: string, line: OurLine = 'road'): string {
  return text.replace(/\bOur (road|railway|motorway)\b/g, 'This $1').replace(/\bour (road|railway|motorway)\b/g, 'this $1').replace(/\bours\b/g, `this ${line}`)
    .replace(/\b(over|under|above|below|beside|across|to|from) us\b/g, `$1 this ${line}`)
    .replace(/\bOur (?=\w)/g, `This ${line}’s `).replace(/\bour (?=\w)/g, `this ${line}’s `);
}

/** The house card of a house heard by two or more roads, decided once for the project (ProjectReceiver.together):
 * the roads' noise added together at its loudest floor, each road's share there (as built, with the project's
 * walls) and what was decided. `name`: a road's name in player words; `money`: the card's price format. */
export function togetherHouseText(rec: ProjectReceiver, name: (routeId: string) => string, money: (v: number) => string): { state: string; why: string } | null {
  const t = rec.together; if (!t) return null;
  const night = rec.nightDb - rec.nightLimit > rec.dayDb - rec.dayLimit, period = night ? 'at night' : 'by day';
  const level = night ? rec.nightDb : rec.dayDb, limit = night ? rec.nightLimit : rec.dayLimit;
  const floors = Math.max(1, ...rec.contributions.map(c => c.storeys?.length ?? 1));
  const floor = floors === 1 ? 'only' : t.storey === floors - 1 ? 'top' : 'loudest';
  const shares = rec.contributions.flatMap(c => {
    const e = c.storeys?.[t.storey]; if (!e) return [];
    const v = night ? e.night : e.day;
    return [`${name(c.routeId)} ${v > 0 ? (10 * dm.log10(v)).toFixed(1) : '—'} dB`];
  });
  const roads = rec.contributions.length === 2 ? 'both roads' : `all ${rec.contributions.length} roads`;
  const heard = `${level.toFixed(1)} dB ${period} on the ${floor} floor, ${roads} together (limit ${limit}): ${shares.join(', ')}.`;
  if (t.decision === 'wall' && t.wall) return { state: `Stays · behind a ${t.wall.height} m wall`,
    why: `${heard} A ${t.wall.height} m wall, ${Math.round(t.wall.length)} m long, along ${name(t.wall.routeId)}: ${money(t.wall.cost)}.` };
  if (t.decision === 'buy' && t.buyout) return { state: `Bought out · ${money(t.buyout.cost)}`,
    why: `${heard} No single wall along ${name(t.buyout.routeId)} brings it within the limit; that road buys it.` };
  if (t.over !== undefined && t.over > 0) return { state: `Stays · ${level.toFixed(1)} dB ${period} (limit ${limit})`, why: heard };
  return { state: 'Stays · quiet enough', why: heard };
}

/** What a mission end meets (scenario data), for the card shown when the end is clicked. */
export interface EndConnection {
  /** 'interchange': an interchange with a road, its ramps not built here; 'joins': the motorway carries on
   * as an open road here; 'continues': the planned road goes on as another section; 'roundabout': our road
   * gets its own arm into an existing roundabout */
  kind: 'interchange' | 'joins' | 'continues' | 'roundabout';
  /** the road(s) met, in player words: 'road I/18', 'the D0 and road II/101', 'the open D3' */
  with: string;
  /** a section end: the section the motorway goes on as (at B) or comes from (at A) */
  section?: string;
}
/** The end's card: a title and short lines, plain words. */
export function endCard(info: EndConnection, end: 'a' | 'b'): { title: string; lines: string[] } {
  if (info.kind === 'continues') return { title: `Goes on as ${info.with}`, lines: ['That part is not in this job.'] };
  if (info.kind === 'roundabout') return { title: `Joins the roundabout on ${info.with}`,
    lines: ['Our road gets its own arm into it here, with a splitter island, priced as a junction; the roundabout itself stays as it is.'] };
  if (info.kind === 'joins') return { title: `Joins ${info.with}`, lines: [`Our motorway carries on as ${info.with} here; that road is not part of this job.`] };
  return { title: `Interchange with ${info.with}`, lines: ['Its ramps are not part of this job.',
    ...(info.section ? [end === 'b' ? `The motorway goes on as ${info.section}.` : `The motorway comes from ${info.section}.`] : [])] };
}
