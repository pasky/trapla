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
  /** what the starting design is, in the player's words (default: the planned line) */
  baseline?: string;
  /** the reveal: what really happened (research/91–94) */
  real: { price?: number; priceText: string; story: string };
}

export const MISSION_TWISTS: Record<string, MissionTwists> = {
  'i46-sternberk-road': {
    offer: ['earth', 'landmarks', 'curveballs', 'forest', 'bridges', 'scratch', 'byHand'],
    startBill: 880e6,
    terms: { earthShare: EARTH_SHARE, bridgeM: 150, forestHa: 4.5 },
    curveballs: ['sternberk-villa', 'sternberk-butterflies', 'sternberk-ales', 'sternberk-quiet', 'sternberk-money'],
    real: { price: 2_037e6, priceText: 'ŘSD estimate, 07/2025, with two interchanges, climbing lanes and walls',
      story: 'Designed and ready, but a listed villa’s garden and protected butterflies have stopped the permit until 2027.' },
  },
  // ---- the other missions: earth balance and landmarks where the starter breaks / passes them (curveballs: research/92–94).
  // The whole D3 and the whole D35 have none yet: the reference search there takes hours (4.7 / 2 s an evaluation).
  'd3-0301-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'bridges', 'scratch', 'byHand'], startBill: 5_082e6, terms: { earthShare: EARTH_SHARE, bridgeM: 500 }, curveballs: ['d3-0301-graves', 'd3-0301-gas', 'd3-0301-farm', 'd3-0301-nest', 'd3-0301-money'],
    real: { price: 12_900e6, priceText: 'ŘSD estimate, 09/2025, with the 1.7 km Kamenná Vrata tunnel', story: 'The first stretch has its planning decision; an exploratory gallery is probing the rock for its tunnel.' } },
  'd3-0302-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'homes', 'forest', 'bridges', 'scratch', 'byHand'], startBill: 6_761e6, terms: { earthShare: EARTH_SHARE, bridgeM: 1300, forestHa: 5.0 }, curveballs: ['d3-0302-luka', 'd3-0302-slope', 'd3-0302-quiet', 'd3-0302-nest', 'd3-0302-money'],
    real: { price: 8_100e6, priceText: 'ŘSD estimate, 09/2025, with a 787 m Sázava bridge and the Luka tunnel', story: 'A 787 m bridge is to clear the Sázava valley; permits are being prepared, works no sooner than 2028.' } },
  'd3-0303-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'forest', 'bridges', 'scratch', 'byHand'], startBill: 5_633e6, terms: { earthShare: EARTH_SHARE, bridgeM: 300, forestHa: 12.5 }, curveballs: ['d3-0303-valley', 'd3-0303-pots', 'd3-0303-quiet', 'd3-0303-gas', 'd3-0303-nest', 'd3-0303-money'],
    real: { price: 14_500e6, priceText: 'ŘSD estimate, 09/2025', story: 'Tunnels and bridges carry it on through the hills; its permit documents are being prepared.' } },
  'd3-0304-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'bridges', 'tunnels', 'scratch', 'byHand'], startBill: 10_030e6, terms: { earthShare: EARTH_SHARE, bridgeM: 300 }, curveballs: ['d3-0304-graves', 'd3-0304-farm', 'd3-0304-quiet', 'd3-0304-gas', 'd3-0304-nest', 'd3-0304-money'],
    real: { price: 17_500e6, priceText: 'ŘSD estimate, 09/2025, with the Prostřední vrch tunnel and a green bridge', story: 'A tunnel under Prostřední vrch and a green bridge for wildlife are planned; its rock is being surveyed.' } },
  'd3-0305-motorway': { offer: ['earth', 'curveballs', 'bridges', 'scratch', 'byHand'], startBill: 9_439e6, terms: { earthShare: EARTH_SHARE, bridgeM: 900 }, curveballs: ['d3-0305-mastnik', 'd3-0305-graves', 'd3-0305-nest', 'd3-0305-uranium', 'd3-0305-gas'],
    real: { price: 18_500e6, priceText: 'ŘSD estimate, 09/2025, with a 925 m Mastník viaduct', story: 'A 925 m viaduct is to cross the Mastník valley before it joins the D3 already open.' } },
  'd3-full-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'scratch', 'byHand'], startBill: 36_081e6, terms: { earthShare: EARTH_SHARE }, curveballs: ['d3-0301-graves', 'd3-0302-luka', 'd3-0302-slope', 'd3-0303-valley', 'd3-0305-uranium', 'd3-full-money'],
    real: { price: 71_500e6, priceText: 'the five ŘSD estimates, 09/2025, with the Kamenná Vrata tunnel, the Sázava bridge and the Mastník viaduct', story: 'Its permits are advancing section by section; ŘSD wants to start building in 2028.' } },
  'd35-full-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'scratch', 'byHand'], startBill: 33_239e6, terms: { earthShare: EARTH_SHARE }, curveballs: ['d35-pod-skalou', 'd35-radisov-slope', 'd35-graves', 'd35-repova-graves', 'd35-javori-nest', 'd35-podoli-quiet', 'd35-quiet', 'd35-full-money'],
    real: { priceText: 'No construction price is public: the PPP bid of 71.3 bn covers 22 years of service too', story: 'Both sections have their permits; a private partner chosen in 10/2026 is to build and run them.' } },
  'd35-stage1-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'forest', 'bridges', 'budget', 'scratch', 'byHand'], startBill: 19_459e6, terms: { earthShare: EARTH_SHARE, budget: 17_694e6, bridgeM: 400, forestHa: 2.0 }, curveballs: ['d35-pod-skalou', 'd35-radisov-slope', 'd35-graves', 'd35-quiet', 'd35-nest', 'd35-money'],
    real: { price: 17_694e6, priceText: 'ŘSD estimate, 09/2025, with the 4 km Dětřichov tunnel', story: 'Its 4 km tunnel passes under the protected Pod skálou slope; it is to be built by a private partner.' } },
  'd11-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'bridges', 'scratch', 'byHand'], startBill: 14_029e6, terms: { earthShare: EARTH_SHARE, bridgeM: 1600, forestHa: 16 }, curveballs: ['d11-shaft', 'd11-porici-slope', 'd11-olesnice-slope', 'd11-graves', 'd11-nest', 'd11-contract'],
    real: { price: 11_710e6, priceText: 'the contract signed in 10/2024, 10 % under the estimate', story: 'Being built since October 2024 with two twin tunnels; the Polish S3 has waited at the border since 2024.' } },
  'd11-rail-kralovec': { offer: ['earth', 'landmarks', 'curveballs', 'forest', 'bridges', 'scratch', 'byHand'], startBill: 10_760e6, baseline: 'the starting line', terms: { earthShare: EARTH_SHARE, bridgeM: 1600, forestHa: 5.0 }, curveballs: ['kralovec-libec-slope', 'kralovec-krenov-slope', 'kralovec-graves', 'kralovec-nest', 'kralovec-money'],
    real: { priceText: 'No such railway is planned', story: 'Today a single unelectrified track winds via Libeč and Bernartice; trains take 26 minutes with four stops.' } },
};

export const missionTwists = (presetId: string): MissionTwists | undefined => MISSION_TWISTS[presetId];
/** what the goal is measured from, in the player's words */
export const baselineWords = (m: MissionTwists) => m.baseline ?? 'the planned line';
