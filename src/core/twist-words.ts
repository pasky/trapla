// The twists' names and one-line descriptions (core/twists.ts checks them): light, for the start screen's twist screen too.
import type { LandmarkKind } from './data/landmarks';

export type TwistId = 'earth' | 'landmarks' | 'curveballs' | 'homes' | 'forest' | 'bridges' | 'tunnels' | 'faster' | 'budget' | 'scratch' | 'byHand';
/** in the order the twist screen lists them */
export const TWIST_ORDER: readonly TwistId[] = ['earth', 'landmarks', 'curveballs', 'homes', 'forest', 'bridges', 'tunnels', 'faster', 'budget', 'scratch', 'byHand'];
/** the owner's default difficulty, where a mission offers them */
export const DEFAULT_TWISTS: readonly TwistId[] = ['earth', 'landmarks', 'curveballs'];

/** A landmark the "Hands off" twist keeps clear (data/landmarks.ts). */
export interface Landmark { name: string; kind: LandmarkKind; x: number; y: number }

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
    case 'landmarks': return 'Keep clear of the castles, churches, chapels and viewpoints near the line (their rings on the map).';
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
export const TWIST_NAMES: Record<TwistId, string> = {
  earth: 'Earth balance', landmarks: 'Hands off the castle', curveballs: 'Curveballs', homes: 'Nobody moves', forest: 'Spare the forest',
  bridges: 'Few bridges', tunnels: 'No tunnels', faster: 'Faster', budget: 'Real price', scratch: 'From scratch', byHand: 'By hand',
};

