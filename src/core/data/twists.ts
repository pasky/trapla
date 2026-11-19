// Which twists each mission offers and their numbers (core/twists.ts). A twist is offered on a mission only where
// scripts/twists-check.ts finds a VALID reference design that meets it (scripts/twists/<preset>/*.json, tests/twists.test.ts),
// and only where it asks for something: the starting design breaks it, or it rules out what the cheap designs use.
// Game rules, not norms: none changes the bill or validity.
import type { TwistId, TwistTerms } from '../twist-words';
import type { LandmarkKind } from './landmarks';

/** Earth balance: at most this share of the fill trucked away or brought in. A game rule: the starters bring in
 * 9–86 % (Auto buys fill where that is cheaper than digging deeper); 10 % asks for a different grade line on every
 * mission it is offered on (PLAN.md "Twists"). */
export const EARTH_SHARE = 0.1;
/** "Hands off the castle": nothing of ours within this distance of a landmark, m. A game rule (no Czech norm sets a
 * default distance: a listed monument's protection zone is declared one by one, Act 20/1987 §17): a castle's setting
 * is the hill it stands on, a church's the village green round it, a chapel's, monument's or viewpoint's its own
 * plot and approach. */
export const LANDMARK_RING: Record<LandmarkKind, number> = { castle: 400, church: 200, chapel: 100, monument: 100, viewpoint: 150 };
/** Landmarks that count for a mission: their ring within this distance of the starting line or of the straight line
 * from A to B (farther ones no design goes near), m. */
export const LANDMARK_REACH = 1500;
/** The goal the reveal waits for: the starting design's bill less this share. The starting design is the real
 * project's line on every mission but the railway (a game proposal there), priced by the game: the real prices
 * include what the game does not build (interchanges, climbing lanes, utilities), so they are no fair target
 * (Šternberk: ours 0.88 bn, the real estimate 2.04 bn; D11: 14.0 bn, the contract 11.7 bn). PLAN.md "Twists". */
export const GOAL_SHARE = 0.1;

export interface MissionTwists {
  /** offered twists, in TWIST_ORDER */
  offer: readonly TwistId[];
  /** the starting design's bill as the game prices it (scripts/twists-check.ts checks it), CZK */
  startBill: number;
  terms: Omit<TwistTerms, 'maxTravelMin' | 'landmarks'>;
  /** the curveballs (data/curveballs.ts ids), in the order they arrive */
  curveballs: readonly string[];
  /** the reveal: what really happened (research/91–94) */
  real: { price?: number; priceText: string; story: string };
}

export const MISSION_TWISTS: Record<string, MissionTwists> = {
  'i46-sternberk-road': {
    offer: ['earth', 'landmarks', 'curveballs', 'scratch', 'byHand'],
    startBill: 880e6,
    terms: { earthShare: EARTH_SHARE },
    curveballs: ['sternberk-villa', 'sternberk-money', 'sternberk-butterflies', 'sternberk-ales', 'sternberk-valley'],
    real: { price: 2_037e6, priceText: 'ŘSD estimate, 07/2025, with two interchanges, climbing lanes and walls',
      story: 'Designed and ready, but a listed villa’s garden and protected butterflies have stopped the permit until 2027.' },
  },
};

export const missionTwists = (presetId: string): MissionTwists | undefined => MISSION_TWISTS[presetId];
