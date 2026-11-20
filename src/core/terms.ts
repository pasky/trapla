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
// height pin (By hand: a ◆ point the player drags; on Auto the points are the game's and never named), pin, bend,
// km, m, %; slip road (one way, of an interchange; never "ramp", which is a bridge's), exit lane, entry lane, interchange,
// carriageway, hard shoulder; nature reserve, nature monument, protection zone, Natura 2000 site, national park, protected landscape
// area (research/75). Source names (ČSN 73 …, SPK, OTSKP, research/NN, Act …) appear only
// where a requirement or a price cites its source: a violation's `rule` line and the bill's pricing
// tooltips.
import type { CrossingResult } from './crossings';
import type { FootprintConflict } from './footprint';
import type { RoadRealignmentPlan } from './road-realignment';
import type { ProjectReceiver } from './project';
import * as dm from './detmath';
import { CROSSING_RULES, ROAD_CLASSES } from './data/urban';
import { LOWERING_RULES, underpassAssembly } from './data/remedies';
import { CLOSURE_ROUND, PIECE_SEARCH } from './way-pieces';

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
  // every house the project takes is one thing to the player, wherever it stands
  [/\bdemolish/i, '"demolished" (say "bought out")'],
  [/#\d/, 'object ID'],
  [/\bstation\b/i, '"station" (say "km")'],
  [/polygon/i, '"polygon" (say "the straights between bends")'],
  // (also in a rule line or a price source: the norm or price book is named, not our note on it)
  [/research\//, 'research note reference'],
  // (the profile draws Auto's height points nowhere: a message about them names nothing the player can see)
  [/\broundings?\b/i, '"rounding" (say "change of slope" or "radius")'],
  [/height points?\b/i, '"height point" (By hand: "your height pin"; on Auto name only the place)'],
];
/** Source names: allowed only in a violation's `rule` line and pricing tooltips. */
export const SOURCE_NAMES: readonly [RegExp, string][] = [
  [/\bSPK\b/, '"SPK" (price norm)'],
  [/\bOTSKP\b/, '"OTSKP" (price list)'],
  [/\bSFDI\b/, '"SFDI"'],
  [/ČSN/, 'norm number'],
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
type OutcomeOf = Pick<CrossingResult, 'type' | 'above' | 'cls' | 'span' | 'approachLength' | 'linkLength' | 'targetS' | 'underpassLength' | 'tieLength' | 'wallLength'
  | 'culverts' | 'houses' | 'homes' | 'linkGrade' | 'lowered' | 'drainage' | 'squared' | 'realignLength' | 'moved' | 'targetRoadId' | 'closure' | 'overRailway' | 'under' | 'endTo' | 'ends' | 'farClosure' | 'requestedType' | 'houseCost' | 'buyout'
  | 'mapped' | 'kept'> & { h?: number };
/** What our line is, in the player's words: "our road", "our railway", "our motorway". */
export type OurLine = 'road' | 'railway' | 'motorway';
export const ourWords = (text: string, line: OurLine = 'road') => line === 'road' ? text
  : text.replace(/\bour road\b/g, `our ${line}`).replace(/\bOur road\b/g, `Our ${line}`).replace(/\bthe new road\b/g, `the new ${line}`);
/** What a rebuilt stretch replaces, in the player's words: "old road", "old track". */
export const oldLineWords = (line: OurLine = 'road') => line === 'railway' ? 'old track' : 'old road';
/** What keeps a cut way across our road, in a few words ("an underpass"; `buyout`: buying out what it serves). */
export const remedyWords = (type: string) => ({ underpass: 'an underpass', overbridge: 'its bridge over us', bridge: 'our bridge over it',
  junction: 'a junction', reconnection: 'a new road to a crossing', diversion: 'a new track to a crossing', buyout: 'buy out what it serves' } as Record<string, string>)[type] ?? 'keep it across our road';
/** The fix of the player's cut that leaves houses going round further: what Auto builds there instead. */
export const cutOffFix = (remedy: string, cost: number) => `Choose "Automatic": ${remedyWords(remedy)}, ${Math.round(cost / 1e6).toLocaleString('en-US')} M CZK`;
/** A mapped road's name where the game knows one (`way`: its index in the pack's network): "road II/325", "Husova". */
export type RoadNamer = (way: number) => string | undefined;
export function crossingOutcome(c: OutcomeOf & Pick<CrossingResult, 'shared'>, line: OurLine = 'road', name?: RoadNamer): OutcomeText {
  const words = (o: OutcomeText) => ({ ...o, label: ourWords(o.label, line), explain: ourWords(o.explain, line) });
  if (c.shared) {
    const o = ownOutcome({ ...c, targetS: undefined }, name);
    return words({ ...o, label: `${o.label.replace(/ at km [0-9.]+/, '')}, built with the other direction`,
      explain: `${o.explain} Both directions of ${line === 'motorway' ? 'the motorway' : 'our road'} cross it here together; the other direction's bill carries it.` });
  }
  return words(ownOutcome(c, name));
}
/** "a house", "2 buildings", "a house and 2 other buildings" */
function buildingsWords(homes: number, others: number): string {
  const house = homes === 1 ? 'a house' : homes ? `${homes} houses` : '';
  const rest = !others ? '' : homes ? (others === 1 ? 'another building' : `${others} other buildings`) : (others === 1 ? 'a building' : `${others} buildings`);
  return [house, rest].filter(Boolean).join(' and ');
}
const money = (v: number) => `${Math.round(v / 1e6).toLocaleString('en-US')} M CZK`;
/** "A house stands", "2 buildings stand", "3 houses and 3 other buildings stand" (homes, sheds / garages / barns …) */
function standing(homes: number, others: number): string {
  const house = homes === 1 ? 'a house' : homes ? `${homes} houses` : '';
  const rest = !others ? '' : homes ? (others === 1 ? 'another building' : `${others} other buildings`) : (others === 1 ? 'a building' : `${others} buildings`);
  const parts = [house, rest].filter(Boolean).join(' and ');
  return `${parts.charAt(0).toUpperCase()}${parts.slice(1)} ${homes + others === 1 ? 'stands' : 'stand'}`;
}
/** "road II/325" / "a class III road": the road a cut way's piece still reaches, or the way round runs along. */
const roadWords = (r: { way: number; cls: string } | undefined, name?: RoadNamer) => {
  if (!r) return 'other roads';
  const what = label(r.cls);
  return name?.(r.way) ?? `${/^[aeiou]/i.test(what) ? 'an' : 'a'} ${what}`;
};
const distance = (v: number) => v < 1000 ? `${Math.max(10, Math.round(v / 10) * 10)} m` : `${(v / 1000).toFixed(1)} km`;
/** What a cut way's piece (side k) still reaches, in words. */
const reachOf = (c: OutcomeOf, k: number, name?: RoadNamer) => roadWords(c.closure?.reach?.[k], name);
/** How far round a closed way's traffic goes (both its parts still reach other roads). */
const detourOf = (c: OutcomeOf, name?: RoadNamer) => {
  const cl = c.closure!;
  // (Auto's last resort: a road serving houses would be kept across our road, but nothing that does so can be built)
  const why = !c.farClosure ? '' : c.requestedType === 'reconnection' ? ' No new road can lead it to a crossing from here.' : ' Auto found no way to keep it across our road that can be built.';
  if (cl.extra === undefined) return ` Its traffic has no way round over other roads within ${distance(PIECE_SEARCH)}.${why}`;
  return ` Its traffic goes round ${distance(Math.max(0, cl.extra))} further${cl.via ? `, via ${roadWords(cl.via, name)}` : ''}.${why}`;
};
function ownOutcome(c: OutcomeOf, name?: RoadNamer): OutcomeText {
  const row = ROAD_CLASSES[c.cls], what = label(c.cls);
  // what else its raised or lowered stretch takes (crossing-works.ts)
  const works = [c.tieLength ? ` Roads joining it there are raised or lowered to meet it (${m(c.tieLength)} m).` : '',
    c.wallLength ? ` A retaining wall (${m(c.wallLength)} m) keeps its slope off what stands beside it.` : '',
    c.houses?.length && c.type !== 'reconnection' && c.type !== 'diversion' ? ` ${standing(c.homes ?? 0, c.houses.length - (c.homes ?? 0))} under its slopes and ${c.houses.length === 1 ? 'is' : 'are'} bought out.` : ''].join('');
  // what its new piece of road needs (link-route.ts)
  const link = [c.linkGrade ? ` The ground is steep: it climbs up to ${pct(c.linkGrade)} in places, the most its class allows where there is no other way.` : '',
    c.culverts ? ` ${c.culverts === 1 ? 'A culvert carries a stream' : `${c.culverts} culverts carry streams`} under it.` : '',
    c.houses?.length ? ` ${standing(c.homes ?? 0, c.houses.length - (c.homes ?? 0))} in its way and ${c.houses.length === 1 ? 'is' : 'are'} bought out.` : ''].join('');
  // a skewed crossing laid on a new line at a right angle to ours (crossing-geometry.ts squarePath)
  const square = c.squared !== undefined ? `, the ${what} straightened to cross at a right angle` : '';
  const thing = c.type === 'underpass' ? 'box' : 'bridge';
  const squareWhy = c.squared !== undefined ? ` It met our road at ${Math.round(c.squared)}°; nearby it is laid on a new line crossing at a right angle, so the ${thing} is short (${m(c.realignLength)} m of new ${what}).` : '';
  const joinedTo = c.targetRoadId === undefined ? 'the road our road joins at its end' : `the road that crosses at km ${km(c.targetS ?? 0)}`;
  const crossesAt = c.targetRoadId === undefined ? 'the road at our road\'s end' : `the crossing at km ${km(c.targetS ?? 0)}`;
  // Led under our bridge beside it (crossing-geometry.ts c.under)
  if (c.under !== undefined && (c.type === 'reconnection' || c.type === 'diversion')) {
    const piece = c.cls === 'track' ? 'track' : 'road';
    return { tag: 'under our bridge', label: `Led under our bridge at km ${km(c.under)} (+${m(c.linkLength)} m of new ${piece})`,
      explain: `The ${what} is cut by our earthworks right beside our bridge; a new piece of ${piece} leads it along the earthworks and under the bridge, joining its two parts again.${link}` };
  }
  // A part the player led to a road of their choosing (CrossingOverride.ends), as built
  const led = c.endTo?.map(e => e?.built ? e : undefined);
  if (led?.some(Boolean) && (c.type === 'reconnection' || c.type === 'diversion') && !c.moved) {
    const piece = c.cls === 'track' ? 'track' : 'road';
    const dest = (e: NonNullable<typeof led[number]>, k: number) => {
      const own = c.ends?.[k] ? name?.(c.ends[k]!.way) : undefined;
      return own ? (e.s !== undefined ? `${own}, which crosses at km ${km(e.s)}` : own) : e.s !== undefined ? `the ${label(e.cls)} that crosses at km ${km(e.s)}` : `a ${label(e.cls)}`;
    };
    const parts = led.flatMap((e, k) => e ? [{ k, e }] : []);
    const sides = c.endTo!.map(e => e?.toward), other = parts.length === 1 ? 1 - parts[0].k : undefined;
    // (the other part: as Auto has it)
    const rest = other === undefined ? '' : c.closure?.connected[other] ? `; the ${sides[other] ?? c.closure.sides[other]} part still reaches ${reachOf(c, other, name)}, so it just ends at our earthworks`
      : c.closure?.nothing?.[other] ? '; the other part is a short stub that serves nothing (no house, no other road) and is left as it is'
      : c.targetS !== undefined || c.targetRoadId !== undefined ? `; the other part is led to ${crossesAt}` : '';
    const head = parts.length === 2 ? `Led to ${dest(parts[0].e, parts[0].k)} and ${dest(parts[1].e, parts[1].k)}` : `The ${parts[0].e.toward} part led to ${dest(parts[0].e, parts[0].k)}`;
    return { tag: 'rerouted', label: `${head} (+${m(c.linkLength)} m of new ${piece})`,
      explain: `The ${what} is cut by our road. ${parts.map(({ e, k }) => `The ${e.toward} part is led to ${dest(e, k)}`).join('; ')}, as you chose, by a new piece of ${piece}${rest}.${link}` };
  }
  // A cut way whose pieces still reach other roads just ends at our earthworks (way-pieces.ts); a piece cut off is led on.
  if (c.closure && (c.type === 'reconnection' || c.type === 'diversion')) {
    const [right, left] = c.closure.connected, both = right && left;
    const ends = ROAD_CLASSES[c.cls]?.label === 'track' || c.cls === 'service' ? 'just ends at our earthworks' : 'ends at our earthworks in a turning area';
    const sides = c.closure.sides, cut = 'Cut · no new road needed';
    if (!right && !left && !Math.round(c.linkLength ?? 0)) return { tag: 'closed', label: cut,
      explain: `The ${what} is cut by our road. What is left of it on either side is a short stub that serves nothing (no house, no other road): it is left as it is.${link}` };
    // (closed with the buildings it served bought out, cheaper than keeping its way across)
    if (both && c.buyout) {
      const n = c.houses?.length ?? 0, homes = c.homes ?? 0, them = buildingsWords(homes, n - homes), instead = c.buyout.instead;
      return { tag: 'bought out', label: `Cut · ${them} bought out`,
        explain: `The ${what} is cut by our road. The ${sides[0]} part still reaches ${reachOf(c, 0, name)}, the ${sides[1]} part ${reachOf(c, 1, name)}; each ${ends}.${detourOf(c, name)} Cheaper to buy out than to keep its access: ${them}, ${money(c.houseCost ?? 0)}${instead ? `; ${remedyWords(instead.type)} would cost ${money(instead.cost)}` : ''}.` };
    }
    if (both) return { tag: 'closed', label: cut,
      explain: `The ${what} is cut by our road. The ${sides[0]} part still reaches ${reachOf(c, 0, name)}, the ${sides[1]} part ${reachOf(c, 1, name)}; each ${ends}.${detourOf(c, name)}${link}` };
    if (!Math.round(c.linkLength ?? 0)) {
      const k = right ? 0 : 1;
      return { tag: 'closed', label: cut,
        explain: `The ${what} is cut by our road. The ${sides[k]} part still reaches ${reachOf(c, k, name)} and ${ends}; ${c.closure.nothing?.[1 - k]
          ? 'the other is a short stub that serves nothing (no house, no other road) and is left as it is' : 'nothing is left of the other beyond our earthworks'}.${link}` };
    }
    const k = right ? 0 : 1, kept = sides[k], led = sides[1 - k];
    return { tag: 'rerouted', label: `The ${led} part led to ${crossesAt} (+${m(c.linkLength)} m of new ${c.cls === 'track' ? 'track' : 'road'})`,
      explain: `The ${what} is cut by our road. The ${kept} part still reaches ${reachOf(c, k, name)}, so it ${ends}; the ${led} part, cut off, is led to ${crossesAt} by a new piece of ${c.cls === 'track' ? 'track' : 'road'} along the outside of the earthworks.${link}` };
  }
  // (its cut ends lie on the road that crosses there: nothing new to build)
  if ((c.type === 'reconnection' || c.type === 'diversion') && !c.moved && !Math.round(c.linkLength ?? 0)) return { tag: c.type === 'diversion' ? 'rerouted' : 'reconnected',
    label: `Joined to ${crossesAt} (no new road needed)`,
    explain: `The ${what} is cut by the new road; what is left of it already joins the road that crosses there.${link}` };
  if (c.moved && (c.type === 'reconnection' || c.type === 'diversion')) return { tag: 'moved aside',
    label: `Moved beside our road (+${m(c.linkLength)} m of new ${c.type === 'diversion' ? 'track' : 'road'})`,
    explain: `The ${what} runs into our earthworks and comes back out on the same side, so it does not need to cross our road: that stretch is rebuilt beside the earthworks.${link}` };
  // a mapped bridge or tunnel that already clears our road (crossings.ts keepsBridge / keepsTunnel)
  if (c.kept && c.type === 'overbridge') return { tag: 'existing bridge kept', label: 'Existing bridge kept',
    explain: `Our road fits under the ${what}'s own ${m(c.span)} m bridge. Nothing is built.` };
  if (c.kept && c.type === 'underpass') return { tag: 'existing tunnel kept', label: 'Existing tunnel kept',
    explain: `Our road passes over the ${what}'s tunnel. Nothing is built.` };
  // (its own bridge here, rebuilt: too low over our road, or too short for our earthworks; not where it is laid anew)
  const replaced = c.mapped === 'bridge' && c.squared === undefined
    ? ` Its old bridge here is too ${(c.h ?? 0) > -CROSSING_RULES.underDepth ? 'low' : 'short'} for our road.` : '';
  switch (c.type) {
    case 'bridge': return c.above ? { tag: 'over our bridge', label: 'Passes over our bridge on its own bridge',
      explain: `Our road is on a bridge here; the ${what} crosses high above it on a bridge of its own.` }
      : { tag: 'under our bridge', label: 'Passes under our bridge',
      explain: `Our road crosses over the ${what} on a bridge; the ${what} stays as it is.` };
    case 'tunnel': return { tag: 'above our tunnel', label: 'Our road is in a tunnel below it',
      explain: `Our road passes below the ${what} in a tunnel; the ${what} stays as it is.` };
    case 'overbridge': return { tag: 'its bridge over us',
      label: `Carried over our road${c.overRailway ? ' and the railway beside it' : ''} on a ${m(c.span)} m bridge${c.approachLength ? ` with ${m(c.approachLength)} m of ramps` : ''}${square}`,
      explain: `The ${what} is raised onto a new bridge over our road${c.overRailway ? ', long enough to span the railway it crossed at the same level beside it too' : ''}; earth ramps on both sides, no steeper than ${pct(row?.rampGradient ?? 0.06)}${row && row.rampSteepest > row.rampGradient ? ` (up to ${pct(row.rampSteepest)} where the ${what} itself slopes the same way)` : ''}, bring it back down to its old level.${replaced}${squareWhy}${works}` };
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

/** A mission end's place name without its note in brackets ("Hostěradice (on to 0303)" → "Hostěradice"):
 * what a motorway direction leads towards. */
export const placeName = (label: string) => label.replace(/\s*\([^()]*\)\s*$/, '');
/** Selecting a road before dragging it (a drag on a road not selected moves the map): `line` is road / motorway / railway. */
/** The button that leads a reroute's new piece back where Auto leads it (the player's end dropped; not the crossing's
 * own "Automatic" choice). */
export const END_AUTO_TEXT = 'Lead it where Auto does';
export const SELECT_TEXT = {
  /** the map's hover label over a road a click would select */
  hover: 'click to select',
  /** how to bend the line: the first-run intro, the cards' hint, Help */
  howTo: (line: string) => `Click the ${line}, then drag it to bend it.`,
  /** …once it is selected */
  selected: (line: string) => `Drag the ${line} to bend it.`,
} as const;

/** The motorway's two directions: edited together, or each on its own (split) and joined again. */
export const DIRECTIONS_TEXT = {
  heading: 'Edit',
  both: 'Both directions',
  towards: (place: string) => `Towards ${place}`,
  together: 'Dragging bends both directions: one road body, bridges side by side, twin tunnels.',
  one: (place: string) => `Drag the direction towards ${place}. Where it would cross the other, Auto brings them together if your other choices allow it.`,
  separate: 'Each direction now has its own bends and heights. Where they run side by side at the same height they share one embankment and are priced as one.',
  join: 'Both directions joined on their shared line again. Undo brings back the separate changes.',
  bothTitle: 'Bend and raise both directions together',
  oneTitle: (place: string) => `Bend the direction towards ${place}; Auto may move the other alongside it`,
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
/** A hairpin where it may stand (core/design-speed.ts hairpinViolations): what it still needs (research/47 §3) */
export const HAIRPIN_NOTE = 'A departure from the road standard: needs the road authority\'s approval, as the hairpins on I/44 Červenohorské sedlo did.';
export const MOTORWAY_AUTOMATIC = 'The game decides: existing bridges stay; every other road gets the cheapest of a bridge over the motorway, an underpass through a high enough embankment or a reroute to a nearby crossing. A motorway has no junctions with the roads it crosses.';
/** Automatic on a railway: no level crossing anywhere along it (game rule, M1). */
/** The same on a four-lane class I road built like a motorway (no level junctions either). */
export const FOUR_LANE_AUTOMATIC = 'The game decides: existing bridges stay; every other road gets the cheapest of a bridge over our road, an underpass through a high enough embankment or a reroute to a nearby crossing. This road has no junctions with the roads it crosses.';
export const RAILWAY_AUTOMATIC = 'The game decides: existing bridges stay; every other road gets the cheapest of a bridge over the railway, an underpass through a high enough embankment or a reroute to a nearby crossing. A new railway has no level crossings.';

/** A mapped road's card where another road's earthworks cover it (ui/mapped-road.ts): `by` is "our road" or a road's name. */
export const coveredText = (by: string) => `${by.charAt(0).toUpperCase()}${by.slice(1)} covers it here: pick it further away.`;

/** Automatic and Junction on a local road or track (no junction spacing; research/42, research/43-minor-crossroads.md). */
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
  ['reconnection', 'Cut it', `The crossed road is cut at our road. Where both parts still reach other roads and its traffic goes round at most ${CLOSURE_ROUND} m further (a track serving no houses: however far), each just ends at our earthworks; otherwise a new piece of road leads a part along the outside of our earthworks to the nearest place where it can cross.`],
  ['underpass', 'Underpass', `The crossed track or local road passes through our embankment in a concrete box (5 × 4.5 m inside for tracks, 8 × 4.5 m for local roads). It needs 5.5 / 5.65 m of embankment above the road; where there is less, the road is lowered into a cutting, by up to ${LOWERING_RULES.maxDepth} m.`],
];

/** A bridge's style, the bridge card's choice: [value, button label, how it is built]. */
export const BRIDGE_STYLE_TEXT: readonly ['short' | 'long' | 'arch', string, string][] = [
  ['short', 'Short spans', 'Piers about every 30 m, a thin deck: the usual bridge. A span over a road, railway or river can be up to 60 m.'],
  ['long', 'Long spans', 'Fewer, taller piers 45–60 m apart and a deeper deck, or one long span with longer spans beside it over what lies below.'],
  ['arch', 'Arch', 'One arch springing from the valley sides, the deck on columns; only where the valley fits an arch of 100–250 m.'],
];

/** Footprint outcomes (things our earthworks cover beside the road). */
export function footprintOutcome(c: Pick<FootprintConflict, 'feature' | 'action' | 'cls' | 'length' | 'affectedLength' | 'closed' | 'continuation' | 'takenUp' | 'buyout'>): OutcomeText {
  const bought = c.buyout?.length ? ` The ${c.buyout.length > 1 ? `${c.buyout.length} buildings it was the only road to are` : 'building it was the only road to is'} bought out: our earthworks bury its way in.` : '';
  const what = c.feature === 'road' ? label(c.cls ?? 'unclassified') : c.feature === 'railway' ? 'railway' : c.feature === 'water' ? 'pond or river' : c.feature === 'building' ? 'building' : c.feature === 'nature' ? 'protected nature area' : 'stream';
  switch (c.action) {
    case 'relocation': return c.closed && !c.closed.detour
      ? { tag: 'taken up', label: `${what}: its last ${m(c.closed.length)} m taken up (a dead end under our earthworks)`,
        explain: `This dead-end piece of the ${what} runs under our earthworks${bought ? '' : ' and serves nothing beyond them'}: it is taken up, and the ${what} ends where they begin.${bought}` }
      : c.takenUp && !c.closed
      ? { tag: 'taken up', label: `${what}: its last ${m(c.takenUp.length)} m taken up, a turning area where it now ends`,
        explain: `The dead end of this ${what} ran under our earthworks${bought ? '' : ' and served nothing there'}. It now ends beside them in a turning area; the piece beyond is taken up.${bought}` }
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
              : /protected nature/.test(p) ? 'it would run through a protected nature area'
              : /turnaround/.test(p) ? 'there is no room for a turning area at its cut end'
              : /building you keep/.test(p) ? 'taking its dead end up would cut off a building you keep'
                : /terrain data/.test(p) ? 'it would leave the map'
                  : /no surviving branch/.test(p) ? 'none of it would remain outside our earthworks'
                    : /wider/.test(p) ? 'it joins a wider road right there'
                      : 'the game could not trace where it continues');
  const list = [...reasons];
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0] ?? 'it found no way';
}
/** Plain description of an accepted road relocation or closure. */
export function roadRemedyDetail(what: string, affected: number, plan: Pick<RoadRealignmentPlan, 'length' | 'closed' | 'retainingArea' | 'turnaroundArea' | 'lumpCost' | 'takenUp' | 'buyout'>, shared = 1): string {
  const n = plan.buyout?.length ?? 0, bought = n ? ` It was the only road to ${n > 1 ? `${n} buildings, which are` : 'a building, which is'} bought out.` : '';
  if (plan.takenUp && !plan.closed) return `${affected.toFixed(0)} m of the ${what}'s dead end lies under our earthworks. It now ends beside them in a turning area, with ${plan.length.toFixed(0)} m of road rebuilt up to it${plan.retainingArea ? ` and retaining walls (${plan.retainingArea.toFixed(0)} m² of wall)` : ''}; its last ${plan.takenUp.length.toFixed(0)} m are taken up.${bought}`;
  if (plan.closed && !plan.closed.detour) return `${affected.toFixed(0)} m of the ${what} lies under our earthworks; it is a dead end${bought ? '' : ' serving nothing beyond them'}, so its last ${plan.closed.length.toFixed(0)} m are taken up.${bought}`;
  if (plan.closed) return `${affected.toFixed(0)} m of the ${what} lies under our earthworks and is closed; its two ends stay connected by ${plan.closed.detour.toFixed(0)} m of existing roads.`;
  const extras = [plan.retainingArea ? `retaining walls (${plan.retainingArea.toFixed(0)} m² of wall) where it is raised or lowered` : '',
    plan.turnaroundArea ? 'a turning area at its cut end' : '', plan.lumpCost ? 'its junction with the road it joins' : ''].filter(Boolean);
  return `${affected.toFixed(0)} m of ${shared > 1 ? `${shared} roads` : `the ${what}`} lies under our earthworks; ${plan.length.toFixed(0)} m of new road is built beside them${extras.length ? `, with ${extras.join(' and ')}` : ''}. Its connections are kept.`;
}
export function roadRemedySource(plan: Pick<RoadRealignmentPlan, 'roadCode' | 'closed' | 'retainingArea' | 'lumpCost'>): string | undefined {
  if (plan.closed) return undefined;
  return `SPK 2026 price per km of ${/P4/.test(plan.roadCode) ? 'paved track' : /S\d/.test(plan.roadCode) ? 'class I–III road' : 'local road'}${plan.retainingArea ? '; retaining walls from OTSKP 2026 items' : ''}${plan.lumpCost ? `; ${(plan.lumpCost / 1e6).toFixed(1)} M CZK for access junctions (provisional estimate)` : ''}`;
}

const NUMBERED: Record<string, string> = { primary: 'I', secondary: 'II', tertiary: 'III' };
/** A mapped road's name as Czech maps and signs write it: its own name, else "road III/1057" (class and
 * number; a stretch shared by two numbers names both), else the kind of road ("local road"). */
export function mappedRoadName(tags: { highway?: string; railway?: string; ref?: string; name?: string } | undefined, fallback = 'road'): string {
  if (tags?.name) return tags.name;
  const label = ROAD_CLASSES[tags?.highway ?? '']?.label ?? fallback, cls = NUMBERED[tags?.highway ?? ''];
  // (a railway's ref is a track code, "625 00", not a name anyone uses: research/96 §6)
  const numbers = tags?.railway ? [] : (tags?.ref ?? '').split(';').map(r => r.trim()).filter(Boolean);
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
  /** 'interchange': an interchange with a road, its slip roads not built here; 'joins': the motorway carries on
   * as an open road here; 'continues': the planned road goes on as another section; 'roundabout': our road
   * gets its own arm into an existing roundabout */
  kind: 'interchange' | 'joins' | 'continues' | 'roundabout';
  /** the road(s) met, in player words: 'road I/18', 'the D0 and road II/101', 'the open D3' */
  with: string;
  /** a section end: the section the motorway goes on as (at B) or comes from (at A) */
  section?: string;
  /** local knowledge: one grey sourced line about the real place (research/96) */
  lore?: string;
}
/** The end's card: a title and short lines, plain words. */
export function endCard(info: EndConnection, end: 'a' | 'b', line: OurLine = 'motorway'): { title: string; lines: string[] } {
  if (info.kind === 'continues') return { title: `Goes on as ${info.with}`, lines: ['That part is not in this job.'] };
  if (info.kind === 'roundabout') return { title: `Joins the roundabout on ${info.with}`,
    lines: ['Our road gets its own arm into it here, with a splitter island, priced as a junction; the roundabout itself stays as it is.'] };
  if (info.kind === 'joins') return { title: `Joins ${info.with}`, lines: [`It carries on as ${info.with} here; that road is not part of this job.`] };
  // (shown, not built: its slip roads are not engineered or billed; the SPK price per km of a divided road from S 20.75 up
  // includes earth-built slip roads of one interchange every 7 km, research/90 §7b, research/33 §3, which slip roads built
  // by hand are credited)
  return { title: `Interchange with ${info.with}`, lines: ['Shown only: its slip roads are not built or billed here.',
    `The ${line}’s price per km already includes earth-built slip roads of one interchange every 7 km.`,
    ...(info.section ? [end === 'b' ? `The ${line} goes on as ${info.section}.` : `The ${line} comes from ${info.section}.`] : [])] };
}

/** What a stream culvert's card says (its size, length and price are the bill's: WaterResult). */
export interface CulvertFacts {
  size: { type: 'pipe' | 'box'; width: number; height: number; buried?: boolean };
  /** barrel length, m; our road above the stream bed, m; the flood it is sized for, m³/s; land draining into it, km² */
  length: number; h: number; q100: number; catchmentKm2: number;
  /** its land runs off the map (the flood is a rougher guess) */
  truncated?: boolean;
  /** a buried bridge: the most fill a precast frame takes, m; its vault's clear span (billed width less its walls), m */
  frameCover?: number; vaultSpan?: number;
}
/** The culvert card in plain words: title, the one-line state, why (lines), and what "More" adds. */
export function culvertCard(c: CulvertFacts, line: OurLine = 'road'): { title: string; state: string; why: string[]; more: string[] } {
  const m = (v: number) => v.toFixed(1);
  const title = c.size.buried ? 'Buried bridge' : c.size.type === 'pipe' ? 'Pipe culvert' : 'Box culvert';
  const what = c.size.type === 'pipe' ? `${Math.round(c.size.width * 1000)} mm pipe` : c.size.buried ? `vault spanning ${m(c.vaultSpan ?? c.size.width)} m`
    : `${m(c.size.width)} × ${m(c.size.height)} m opening`;
  const why = [`Carries a stream under our road's embankment, ${m(c.h)} m below our road.`,
    c.size.buried ? `With that much earth over it (a precast frame takes ${m(c.frameCover ?? 7)} m), the ${m(c.size.width)} × ${m(c.size.height)} m opening the flood needs is built as a concrete vault spanning ${m(c.vaultSpan ?? c.size.width)} m.`
      : c.size.type === 'pipe' ? 'A precast concrete pipe, with a wall at each end.' : 'A precast concrete frame, with a wall at each end.',
    `Sized for a 100-year flood of about ${c.q100 < 10 ? c.q100.toFixed(1) : Math.round(c.q100)} m³/s.`];
  const more = [`${m(c.catchmentKm2)} km² of land drains into it${c.truncated ? ' (some of it off the map: a rougher guess)' : ''}.`,
    'Priced by its length under our earthworks and its two ends. The flood is a rough estimate from the land, not a survey.'];
  return { title, state: `${what} · ${Math.round(c.length)} m long`, why: why.map(t => ourWords(t, line)), more: more.map(t => ourWords(t, line)) };
}

/** A mapped railway's crossing (rail-over.ts RailCrossing): its card. */
export interface RailCrossingFacts {
  how: 'railway' | 'ours' | 'missed'; above: number; auto: boolean; chosen?: 'bridge' | 'overbridge'; tracks: 1 | 2; tunnel?: boolean;
  price?: { span: number; width: number; area: number; bridge: number; provisional: number; cost: number; code: string };
}
/** The railway crossing's choices: [value, button label, what it means]. */
export const RAIL_OPTIONS: readonly [string, string, string][] = [
  ['', 'Auto', 'Auto weighs our bridge over the railway against the railway on a new bridge over our cutting.'],
  ['bridge', 'Our bridge over it', 'Our road crosses over the railway on a bridge; it needs enough height above the wires.'],
  ['overbridge', 'The railway over us', 'The railway is carried over our road on a new bridge; our road runs in a cutting under it.'],
];
export function railCrossingCard(c: RailCrossingFacts, line: OurLine = 'road'): { title: string; state: string; why: string[]; more: string[] } {
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1), p = c.price, ours = line === 'railway' ? 'our railway' : `our ${line}`;
  const state = c.how === 'railway' && p ? `Carried over ${ours} on a new ${m(p.span)} m bridge`
    : c.how === 'ours' ? (c.tunnel ? `${cap(ours)} passes under it in a tunnel` : `${cap(ours)} crosses over it on a bridge`)
    : 'Crossed on the level: not allowed';
  const why: string[] = [c.chosen ? 'Your choice.' : !p ? `Our bridge over it: it crosses ${ours} at too sharp an angle, or too many tracks lie side by side, for a bridge of its own.`
    : c.how === 'railway' ? `Auto: cheaper here than lifting ${ours} over the railway.` : `Auto: cheaper here than lowering ${ours} under a new bridge of the railway.`];
  if (c.how === 'railway') why.push(`${cap(ours)} runs ${c.above < 0 ? `${(-c.above).toFixed(1)} m` : 'just'} under the rails here.`);
  else if (c.how === 'ours' && !c.tunnel) why.push(`${cap(ours)} is ${c.above.toFixed(1)} m above the rails here.`);
  const more: string[] = [];
  if (p) {
    more.push(`The railway's bridge: ${m(p.span)} m long, ${p.width.toFixed(1)} m wide for ${c.tracks === 2 ? 'two tracks' : 'one track'}: ${money(p.bridge)} (SPOŽES 2026 ${p.code.split(' ')[2]}).`);
    more.push(`While it is built, the trains run over a provisional bridge: ${money(p.provisional)} (SPOŽES 2026 H07).`);
    if (c.how !== 'railway') more.push(`Carrying the railway over us would cost about ${money(p.cost)} here, with ${ours} lowered into a cutting under it.`);
  } else more.push('The railway cannot be carried over us here: it crosses us at too sharp an angle, or too many tracks lie side by side.');
  return { title: 'Railway', state, why, more };
}
