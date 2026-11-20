// The twists' names and one-line descriptions (core/twists.ts checks them): light, for the start screen's twist screen too.
import type { MonumentKind } from './heritage';

export type TwistId = 'earth' | 'landmarks' | 'curveballs' | 'homes' | 'forest' | 'bridges' | 'tunnels' | 'faster' | 'budget' | 'scratch' | 'byHand';
/** in the order the twist screen lists them */
export const TWIST_ORDER: readonly TwistId[] = ['earth', 'landmarks', 'curveballs', 'homes', 'forest', 'bridges', 'tunnels', 'faster', 'budget', 'scratch', 'byHand'];
/** the owner's default difficulty, where a mission offers them */
export const DEFAULT_TWISTS: readonly TwistId[] = ['earth', 'landmarks', 'curveballs'];

/** What the "Hands off" twist keeps clear (a pack's heritage.json, core/heritage.ts): a listed monument with a ring
 * round it, or a heritage area (a protection zone, a heritage reserve or zone) itself. */
export type LandmarkKind = MonumentKind | 'zone';
/** `x`, `y`: the monument, or where a zone's name stands (inside it); `rings`: a zone's polygons (pack metres) */
export interface Landmark { name: string; kind: LandmarkKind; x: number; y: number; rings?: readonly (readonly (readonly [number, number])[])[];
  /** its ÚSKP number */
  code?: string;
  /** a monument the mission puts in play with its wider setting ring (data/twists.ts SETTING_RING) */
  setting?: boolean }
/** what a landmark is, in the player's words */
export const LANDMARK_KIND_WORDS: Record<LandmarkKind, string> = { castle: 'castle', fort: 'fort', church: 'church', chapel: 'chapel', cross: 'cross or statue',
  memorial: 'memorial', technical: 'technical monument', zone: 'heritage area' };
/** a landmark's name, kind and ring in a few words ("Chapel of St Roch, Staré Město · chapel · 600 m ring") */
export const landmarkWords = (l: Pick<Landmark, 'name' | 'kind'> & { ring: number }) =>
  `${l.name} · ${LANDMARK_KIND_WORDS[l.kind]}${l.kind === 'zone' ? '' : ` · ${l.ring.toLocaleString('en-US')} m ring`}`;

/** What a mission's twists are measured with (data/twists.ts). */
export interface TwistTerms {
  /** earth balance: at most this share of the fill trucked away or brought in */
  earthShare?: number;
  /** bridges: at most this many metres of bridge on our line */
  bridgeM?: number;
  /** forest: at most this many hectares of forest taken */
  forestHa?: number;
  /** budget: the real project's price, CZK */
  budget?: number;
  /** the travel-time goal, min (faster: 10 % under it) */
  maxTravelMin: number;
  landmarks: readonly (Landmark & { ring: number })[];
}

const num = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const money = (v: number) => v >= 1e9 ? `${num(v / 1e9, 2)} bn` : `${num(v / 1e6)} M`;

/** The twists' one-line descriptions (the twist screen and the card). */
export function twistLine(id: TwistId, t: TwistTerms): string {
  switch (id) {
    case 'earth': return `What you dig fills your embankments: at most ${Math.round((t.earthShare ?? 0.1) * 100)} % of the fill brought in, or of the dug earth trucked away.`;
    case 'landmarks': return 'Keep out of the shaded historic areas and the rings round listed monuments; a deep tunnel may pass under.';
    case 'curveballs': return 'News from the site arrives as you play: a place to keep out of, a new demand, less money.';
    case 'homes': return 'Nobody loses their home: no house bought out.';
    case 'forest': return `At most ${num(t.forestHa ?? 0, 1)} ha of forest cleared for our road.`;
    case 'bridges': return `At most ${num(t.bridgeM ?? 0)} m of bridges on our road in all.`;
    case 'tunnels': return 'No tunnels at all.';
    case 'faster': return `Travel time 10 % under the goal: at most ${num(t.maxTravelMin * 0.9, 2)} min.`;
    case 'budget': return `No dearer than the real project: ${money(t.budget ?? 0)} CZK.`;
    case 'scratch': return 'No starting line: begin from a straight line from A to B.';
    case 'byHand': return 'Set our road’s heights yourself; Auto still builds the crossings, culverts and walls.';
  }
}
/** A twist in a few words, under its name on the twist screen's card (the line above on hover or focus). `landmarks`: what
 * Hands off keeps clear of here, in a few words. */
export function twistShort(id: TwistId, t: TwistTerms, landmarks = 'Rings round listed places'): string {
  switch (id) {
    case 'earth': return `≤ ${Math.round((t.earthShare ?? 0.1) * 100)} % earth trucked in or away`;
    case 'landmarks': return landmarks;
    case 'curveballs': return 'News from the site as you play';
    case 'homes': return 'No home bought out';
    case 'forest': return `≤ ${num(t.forestHa ?? 0, 1)} ha of forest cleared`;
    case 'bridges': return `≤ ${num(t.bridgeM ?? 0)} m of bridges`;
    case 'tunnels': return 'No tunnels';
    case 'faster': return `≤ ${num(t.maxTravelMin * 0.9, 2)} min end to end`;
    case 'budget': return `≤ ${money(t.budget ?? 0)} CZK`;
    case 'scratch': return 'Begin on the straight line';
    case 'byHand': return 'You set the heights';
  }
}
export const TWIST_NAMES: Record<TwistId, string> = {
  earth: 'Earth balance', landmarks: 'Hands off the castle', curveballs: 'Curveballs', homes: 'Nobody moves', forest: 'Spare the forest',
  bridges: 'Few bridges', tunnels: 'No tunnels', faster: 'Faster', budget: 'Real price', scratch: 'From scratch', byHand: 'By hand',
};

