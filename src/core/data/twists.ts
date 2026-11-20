// Which twists each mission offers and their numbers (core/twists.ts). A twist is offered on a mission only where
// scripts/twists-check.ts finds a VALID reference design that meets it (scripts/twists/<preset>/*.json, tests/twists.test.ts),
// and only where it asks for something: the starting design breaks it, or it rules out what the cheap designs use.
// Game rules, not norms: none changes the bill or validity.
import { DEFAULT_TWISTS, type LandmarkKind, type TwistId, type TwistTerms } from '../twist-words';
import type { MonumentKind } from '../heritage';

/** Earth balance: at most this share of the fill trucked away or brought in. A game rule: the starters bring in
 * 9–86 % (Auto buys fill where that is cheaper than digging deeper); 10 % asks for a different grade line on every
 * mission it is offered on (PLAN.md "Twists"). */
export const EARTH_SHARE = 0.1;
/** "Hands off the castle": nothing of ours in a heritage area (its declared protection zone, a heritage reserve or zone:
 * the register's polygons, research/102) nor within this distance of a listed monument that has no zone, m. A game rule:
 * no Czech norm sets a default distance (a protection zone is declared one by one, Act 20/1987 §17): a castle's setting
 * is the hill it stands on, a fort's or hillfort's its mound and ditch, a church's the village green round it, a
 * chapel's, memorial's or technical monument's its own plot and approach, a cross's or a statue's its verge. */
export const LANDMARK_RING: Record<MonumentKind, number> = { castle: 400, fort: 200, church: 200, chapel: 100, memorial: 100, technical: 100, cross: 50 };
/** "Hands off the castle" where the planned line keeps out of every monument's own ring (LANDMARK_RING) and every heritage
 * area: the mission names the monuments nearest it (`MissionTwists.inPlay`, `setting`) with this wider ring, their
 * setting, m. A game scale, the same for every monument of a kind, about as large as the larger quarter of the
 * protection zones NPÚ has declared round monuments of that kind (research/102 "Round 5", pipeline/heritage_zone_sizes.py:
 * of 455 zones in force, the upper quartile of their equivalent radii is 970 m round castles, 550 m round churches, 700 m
 * round forts, 440 m round memorials, 500 m round technical monuments; the largest 5.0, 2.3, 1.6, 1.7, 0.9 km). Chapels
 * count as churches (one declared zone only); crosses and statues keep 200 m (two zones, the larger 190 m). */
export const SETTING_RING: Record<MonumentKind, number> = { castle: 1000, fort: 600, church: 600, chapel: 600, memorial: 600, technical: 600, cross: 200 };
/** A landmark a mission names on its twist screen (the pack's heritage.json by its ÚSKP number; scripts/twists-check.ts checks
 * each is there, of that kind, and that the starter breaks one of them and nothing else): its name in the player's words;
 * `setting`: a monument put in play with its setting ring (SETTING_RING), else its own ring or the area itself. */
export interface InPlay { code: string; name: string; kind: LandmarkKind; setting?: boolean }
/** Landmarks that count for a mission: their ring or zone within this distance of the starting line or of the straight
 * line from A to B (farther ones no design goes near), m. */
export const LANDMARK_REACH = 1500;
/** The goal the reveal waits for: the starting design's bill less this share. The starting design is the real
 * project's line on every mission but the railway (a game proposal there), priced by the game: the real prices
 * include what the game does not build (interchanges, climbing lanes, utilities), so they are no fair target
 * (Šternberk: ours 0.88 bn, the real estimate 2.04 bn; D11: 14.0 bn, the contract 11.7 bn). PLAN.md "Twists". */
export const GOAL_SHARE = 0.1;

export interface MissionTwists {
  /** offered twists, in TWIST_ORDER */
  offer: readonly TwistId[];
  /** Hands off the castle: the landmarks the twist screen names (the starter breaks at least one) */
  inPlay?: readonly InPlay[];
  /** Hands off the castle not offered: why, in plain words (the twist screen says it) */
  noLandmarks?: string;
  /** default twists (DEFAULT_TWISTS) offered here but not on at first: no reference meets them with the other defaults
   * under the goal (scripts/twists-check.ts checks that one meets them, and the rest of the defaults with the goal) */
  notDefault?: readonly TwistId[];
  /** the starting design's bill as the game prices it (scripts/twists-check.ts checks it), CZK */
  startBill: number;
  terms: Omit<TwistTerms, 'maxTravelMin' | 'landmarks'>;
  /** the curveballs (data/curveballs.ts ids), in the order they arrive */
  curveballs: readonly string[];
  /** what the starting design is, in the player's words (default: the planned line) */
  baseline?: string;
  /** the reveal: what really happened (research/91–94); `reviewBy`: a year the real project was in environmental
   * review by (its earliest dated CENIA document found, research/96 §8), for "Yours took N minutes" */
  real: { price?: number; priceText: string; story: string; reviewBy?: number };
}

export const MISSION_TWISTS: Record<string, MissionTwists> = {
  'i46-sternberk-road': {
    offer: ['earth', 'curveballs', 'forest', 'bridges', 'scratch', 'byHand'],
    noLandmarks: 'Not here: the bypass keeps 670 m from the town’s historic centre and 1.2 km from its castle, and no other listed place is near.',
    startBill: 880e6,
    terms: { earthShare: EARTH_SHARE, bridgeM: 150, forestHa: 4.5 },
    curveballs: ['sternberk-villa', 'sternberk-butterflies', 'sternberk-ales', 'sternberk-quiet', 'sternberk-money'],
    real: { price: 2_037e6, priceText: 'ŘSD estimate, 07/2025, with two interchanges, climbing lanes and walls',
      story: 'Designed and ready, but a listed villa’s garden and protected butterflies have stopped the permit until 2027.', reviewBy: 2003 },
  },
  // ---- the other missions (curveballs: research/92–95; the whole routes' references stitched from their sections',
  // scripts/twists-stitch.ts)
  'd3-0301-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'bridges', 'scratch', 'byHand'], inPlay: [{ code: '10874/2-4319', name: 'Chapel of St Wenceslas, Jílové u Prahy', kind: 'chapel', setting: true }], startBill: 4_855e6, terms: { earthShare: EARTH_SHARE, bridgeM: 500 }, curveballs: ['d3-0301-graves', 'd3-0301-gas', 'd3-0301-farm', 'd3-0301-nest', 'd3-0301-money'],
    real: { price: 12_900e6, priceText: 'ŘSD estimate, 09/2025, with the 1.7 km Kamenná Vrata tunnel', story: 'The first stretch has its planning decision; an exploratory gallery is probing the rock for its tunnel.', reviewBy: 2011 } },
  'd3-0302-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'homes', 'forest', 'bridges', 'scratch', 'byHand'], inPlay: [{ code: '101806', name: 'St Joseph gold mine adit, Jílové u Prahy', kind: 'technical', setting: true }, { code: '22458/2-2261', name: 'Žampach railway viaduct', kind: 'technical', setting: true }], startBill: 6_761e6, terms: { earthShare: EARTH_SHARE, bridgeM: 1300, forestHa: 5.0 }, curveballs: ['d3-0302-luka', 'd3-0302-slope', 'd3-0302-quiet', 'd3-0302-nest', 'd3-0302-money'],
    real: { price: 8_100e6, priceText: 'ŘSD estimate, 09/2025, with a 787 m Sázava bridge and the Luka tunnel', story: 'A 787 m bridge is to clear the Sázava valley; permits are being prepared, works no sooner than 2028.', reviewBy: 2011 } },
  'd3-0303-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'forest', 'bridges', 'scratch', 'byHand'], inPlay: [{ code: '11034/2-4317', name: 'Chapel of Our Lady, Chrášťany', kind: 'chapel', setting: true }], startBill: 5_633e6, terms: { earthShare: EARTH_SHARE, bridgeM: 300, forestHa: 12.5 }, curveballs: ['d3-0303-valley', 'd3-0303-pots', 'd3-0303-quiet', 'd3-0303-gas', 'd3-0303-nest', 'd3-0303-money'],
    real: { price: 14_500e6, priceText: 'ŘSD estimate, 09/2025', story: 'Tunnels and bridges carry it on through the hills; its permit documents are being prepared.', reviewBy: 2011 } },
  'd3-0304-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'bridges', 'tunnels', 'scratch', 'byHand'], inPlay: [{ code: '14683/2-267', name: 'Stejc castle ruin, Maršovice', kind: 'castle' }], startBill: 10_030e6, terms: { earthShare: EARTH_SHARE, bridgeM: 300 }, curveballs: ['d3-0304-graves', 'd3-0304-farm', 'd3-0304-quiet', 'd3-0304-gas', 'd3-0304-nest', 'd3-0304-money'],
    real: { price: 17_500e6, priceText: 'ŘSD estimate, 09/2025, with the Prostřední vrch tunnel and a green bridge', story: 'A tunnel under Prostřední vrch and a green bridge for wildlife are planned; its rock is being surveyed.', reviewBy: 2011 } },
  'd3-0305-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'bridges', 'scratch', 'byHand'], inPlay: [{ code: '16850/2-281', name: 'Křenovice fort site, Vojkov', kind: 'fort', setting: true }], startBill: 9_344e6, terms: { earthShare: EARTH_SHARE, bridgeM: 900 }, curveballs: ['d3-0305-mastnik', 'd3-0305-graves', 'd3-0305-nest', 'd3-0305-uranium', 'd3-0305-gas'],
    real: { price: 18_500e6, priceText: 'ŘSD estimate, 09/2025, with a 925 m Mastník viaduct', story: 'A 925 m viaduct is to cross the Mastník valley before it joins the D3 already open.', reviewBy: 2011 } },
  'd3-full-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'scratch', 'byHand'], inPlay: [{ code: '14683/2-267', name: 'Stejc castle ruin, Maršovice', kind: 'castle' }], startBill: 36_081e6, terms: { earthShare: EARTH_SHARE }, curveballs: ['d3-0301-graves', 'd3-0302-luka', 'd3-0302-slope', 'd3-0303-valley', 'd3-0305-uranium', 'd3-full-money'],
    real: { price: 71_500e6, priceText: 'the five ŘSD estimates, 09/2025, with the Kamenná Vrata tunnel, the Sázava bridge and the Mastník viaduct', story: 'Its permits are advancing section by section; ŘSD wants to start building in 2028.', reviewBy: 2011 } },
  'd35-full-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'scratch', 'byHand'], inPlay: [{ code: '41581/8-2138', name: 'Holy Trinity column, Mohelnice', kind: 'cross' }], startBill: 32_614e6, terms: { earthShare: EARTH_SHARE }, curveballs: ['d35-pod-skalou', 'd35-radisov-slope', 'd35-graves', 'd35-repova-graves', 'd35-javori-nest', 'd35-podoli-quiet', 'd35-quiet', 'd35-full-money'],
    real: { priceText: 'No construction price is public: the PPP bid of 71.3 bn covers 22 years of service too', story: 'Both sections have their permits; a private partner chosen in 10/2026 is to build and run them.', reviewBy: 2006 } },
  // ---- Český ráj: the I/35 Turnov – Úlibice (research/89; curveballs research/95)
  // (no earth balance: the starter balances its earth since model 62, the dead end at km 3.0 no longer held up)
  'i35-turnov-road': { offer: ['landmarks', 'curveballs', 'forest', 'bridges', 'scratch', 'byHand'], inPlay: [{ code: '45976/6-2842', name: 'Church of St John the Baptist, Turnov', kind: 'church' }], startBill: 4_481e6, terms: { earthShare: EARTH_SHARE, forestHa: 0.6, bridgeM: 700 }, curveballs: ['i35-nudvojovice', 'i35-zone-iii', 'i35-libunka', 'i35-jizera', 'i35-turnov-money'],
    real: { price: 7_255e6, priceText: 'ŘSD study 03/2023 (2022 prices), with the Pelešany and Přepeře tunnels', story: 'Its approval was revoked in December 2025; a new environmental review, with tunnels round Turnov, takes until about 2029.', reviewBy: 2016 } },
  'i35-rovensko-road': { offer: ['earth', 'landmarks', 'curveballs', 'forest', 'bridges', 'scratch', 'byHand'], inPlay: [{ code: '22814/6-2750', name: 'Chapel at Radostná pod Kozákovem', kind: 'chapel', setting: true }], startBill: 4_386e6, terms: { earthShare: EARTH_SHARE, forestHa: 5.0, bridgeM: 350 }, curveballs: ['i35-k31b', 'i35-scarp-11-5', 'i35-scarp-15-8', 'i35-vaclavi-graves', 'i35-rovensko-slope'],
    real: { price: 6_209e6, priceText: 'ŘSD study 03/2023 (2022 prices), with the feeder road to Semily', story: 'It skirts the protected landscape past Rovensko; its approval was revoked in December 2025 and is being redone.', reviewBy: 2016 } },
  'i35-jicin-road': { offer: ['earth', 'landmarks', 'curveballs', 'homes', 'forest', 'bridges', 'scratch', 'byHand'], inPlay: [{ code: '3260', name: 'Studeňany village protection zone', kind: 'zone' }], startBill: 5_237e6, terms: { earthShare: EARTH_SHARE, forestHa: 0.8, bridgeM: 250 }, curveballs: ['i35-species', 'i35-jinolice-graves', 'i35-gas', 'i35-soberaz-quiet', 'i35-jicin-money'],
    real: { price: 5_514e6, priceText: 'ŘSD study 03/2023 (2022 prices), as a 2+1 road', story: 'The last stage meets the D35 at Úlibice, under construction since April 2026; building here is to start no sooner than 2032.', reviewBy: 2016 } },
  'i35-full-road': { offer: ['earth', 'landmarks', 'curveballs', 'forest', 'bridges', 'scratch', 'byHand'], inPlay: [{ code: '3260', name: 'Studeňany village protection zone', kind: 'zone' }, { code: '45976/6-2842', name: 'Church of St John the Baptist, Turnov', kind: 'church' }], startBill: 14_087e6, terms: { earthShare: EARTH_SHARE, forestHa: 8.0, bridgeM: 1600 }, curveballs: ['i35-nudvojovice', 'i35-zone-iii', 'i35-jizera', 'i35-scarp-11-5', 'i35-scarp-15-8', 'i35-species', 'i35-full-money'],
    real: { price: 18_978e6, priceText: 'ŘSD study 03/2023 (2022 prices), the three road stages, with two tunnels and eight interchanges', story: 'Planned through the edge of the Bohemian Paradise; its approval was revoked in December 2025 and the review starts over.', reviewBy: 2016 } },
  'd35-stage1-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'forest', 'bridges', 'budget', 'scratch', 'byHand'], inPlay: [{ code: '50949/6-6189', name: 'Chapel of St Roch, Staré Město', kind: 'chapel', setting: true }], startBill: 18_876e6, terms: { earthShare: EARTH_SHARE, budget: 17_694e6, bridgeM: 400, forestHa: 2.0 }, curveballs: ['d35-pod-skalou', 'd35-radisov-slope', 'd35-graves', 'd35-quiet', 'd35-nest', 'd35-money'],
    real: { price: 17_694e6, priceText: 'ŘSD estimate, 09/2025, with the 4 km Dětřichov tunnel', story: 'Its 4 km tunnel passes under the protected Pod skálou slope; it is to be built by a private partner.', reviewBy: 2006 } },
  'd11-motorway': { offer: ['earth', 'landmarks', 'curveballs', 'bridges', 'scratch', 'byHand'], inPlay: [{ code: '33165/6-3675', name: 'Memorial to the Austrian gunners of 1866, Trutnov', kind: 'memorial' }], startBill: 14_029e6, terms: { earthShare: EARTH_SHARE, bridgeM: 1600, forestHa: 16 }, curveballs: ['d11-shaft', 'd11-porici-slope', 'd11-olesnice-slope', 'd11-graves', 'd11-nest', 'd11-contract'],
    real: { price: 11_710e6, priceText: 'the contract signed in 10/2024, 10 % under the estimate', story: 'Being built since October 2024 with two twin tunnels; the Polish S3 has waited at the border since 2024.', reviewBy: 2008 } },
  'd11-rail-kralovec': { offer: ['earth', 'landmarks', 'curveballs', 'forest', 'bridges', 'scratch', 'byHand'], inPlay: [{ code: '101745', name: 'Church of St John of Nepomuk, Trutnov', kind: 'church', setting: true }], startBill: 10_801e6, baseline: 'the starting line', terms: { earthShare: EARTH_SHARE, bridgeM: 1600, forestHa: 5.0 }, curveballs: ['kralovec-libec-slope', 'kralovec-krenov-slope', 'kralovec-graves', 'kralovec-nest', 'kralovec-money'],
    real: { priceText: 'No such railway is planned', story: 'Today a single unelectrified track winds via Libeč and Bernartice; trains take 26 minutes with four stops.' } },
};

export const missionTwists = (presetId: string): MissionTwists | undefined => MISSION_TWISTS[presetId];
/** the twists a mission starts with: the owner's default difficulty, where offered and reachable together */
export const missionDefaults = (m: Pick<MissionTwists, 'offer' | 'notDefault'>): TwistId[] =>
  DEFAULT_TWISTS.filter(t => m.offer.includes(t) && !m.notDefault?.includes(t));
/** what the goal is measured from, in the player's words */
export const baselineWords = (m: MissionTwists) => m.baseline ?? 'the planned line';
