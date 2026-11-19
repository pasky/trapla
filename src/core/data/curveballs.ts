// Curveballs: news from the site that arrive during play (core/twists.ts, ui/twists.ts), drawn from the real projects'
// histories where possible (research/91–94). Each is a place with a rule the twist checks (core/twists.ts zoneRuns) or a
// budget. Places are in EPSG:5514 (the packs' crs; a pack's own metres are these less its origin), so one list serves every
// pack of a corridor. A curveball is offered on a mission only where scripts/twists-check.ts replays it on a reference
// design that meets it (data/twists.ts lists them per mission, in the order they arrive).
import type { Use } from '../twists';

export interface Curveball {
  id: string;
  /** the card's headline, a few plain words */
  headline: string;
  /** one plain line of story */
  story: string;
  /** what it asks of our line, in a few words (the twists card) */
  ask: string;
  /** where the story comes from, for the curious (shown small on the card) */
  cite: { text: string; url: string };
  /** the place and what our line may not do there (EPSG:5514) */
  zone?: { label: string; shape: { kind: 'circle'; x: number; y: number; r: number } | { kind: 'polygon'; pts: readonly (readonly [number, number])[] }; forbid: readonly Use[] };
  /** the bill may not exceed this share of the mission's starting bill */
  budget?: number;
}

/** keep out: nothing of ours there, on the ground or over it on a bridge; a mined tunnel deep under it is fine */
export const KEEP_OUT: readonly Use[] = ['cut', 'fill', 'bridge'];
/** nothing of ours on the ground there: a bridge may pass over it, its piers outside */
export const NO_PIERS: readonly Use[] = ['cut', 'fill', 'pier'];
/** leave the ground as it is: a bridge over it or a mined tunnel under it, no cutting or filling */
export const SPAN: readonly Use[] = ['cut', 'fill'];

export const CURVEBALLS: Record<string, Curveball> = {
  // ---- I/46 Šternberk bypass (research/91) ----
  // The villa at Jívavská 1416/73 (49.72399 N, 17.31799 E), a cultural monument since 30 Dec 2025 (ÚSKP 107460, "Vila se
  // zahradou"); the press: one pier of the planned bridge stands in its garden by the historic greenhouse. The place: the
  // cadastral parcels of the villa, its greenhouse and the gardens around them (ČÚZK RÚIAN: st. 1529, st. 1531, 1535/1,
  // 1535/2, 6491/45; which of them the listing takes in is not published: PROVISIONAL).
  'sternberk-villa': {
    id: 'sternberk-villa', headline: 'The villa is now a listed monument',
    story: 'The Weisshuhn villa and its garden were listed. A pier of our bridge may not stand in it.',
    ask: 'No pier or earthworks in the villa’s garden',
    cite: { text: 'zdopravy.cz, 16 Nov 2026', url: 'https://zdopravy.cz/nejdriv-historicka-vila-ted-chraneni-motyli-priprava-obchvatu-sternberka-se-znovu-zasekla-307213/' },
    zone: { label: 'Villa garden', forbid: NO_PIERS, shape: { kind: 'polygon', pts: [[-540933, -1107526], [-540920, -1107524], [-540907, -1107530],
      [-540903, -1107527], [-540904, -1107524], [-540851, -1107569], [-540840, -1107580], [-540843, -1107606], [-540889, -1107577],
      [-540909, -1107570], [-540917, -1107552], [-540929, -1107548], [-540929, -1107545], [-540925, -1107541], [-540927, -1107539], [-540923, -1107533]] } },
  },
  // The SFDI budget for 2026 left the bypass out (zdopravy.cz 21 Dec 2025; ŘSD 28 Jan 2026: one of the very few works
  // moved to the next year). The cap is the game's: 85 % of the starting bill (the goal is 90 %).
  'sternberk-money': {
    id: 'sternberk-money', headline: 'No money for the bypass this year',
    story: 'The 2026 state budget left the bypass out. To get in next year, it must cost less.',
    ask: 'Keep the bill under 85 % of the planned line’s',
    cite: { text: 'zdopravy.cz, 21 Dec 2025', url: 'https://zdopravy.cz/stavba-obchvatu-sternberka-se-zpozdi-v-rozpoctu-na-nej-nejsou-penize-269148/' },
    budget: 0.85,
  },
  // Protected butterflies found in the works' area (reported to the region 9/2026; ŘSD asked for an exemption in 8/2026;
  // the permit suspended until 9/2027 at the latest). Neither the species nor the place is published: the game puts
  // them on the open land by the shooting range that the line crosses at km 1.1–1.3 (a 90 m circle; PROVISIONAL, the
  // game's guess: military ranges often keep the grassland such butterflies need).
  'sternberk-butterflies': {
    id: 'sternberk-butterflies', headline: 'Protected butterflies on the route',
    story: 'Surveyors found protected butterflies on the open land by the shooting range. Their meadow stays as it is.',
    ask: 'Keep out of the butterflies’ meadow',
    cite: { text: 'zdopravy.cz, 16 Nov 2026', url: 'https://zdopravy.cz/nejdriv-historicka-vila-ted-chraneni-motyli-priprava-obchvatu-sternberka-se-znovu-zasekla-307213/' },
    zone: { label: 'Butterflies', forbid: KEEP_OUT, shape: { kind: 'circle', x: -542700, y: -1109400, r: 90 } },
  },
  // The real design bridges the Aleš stream and the road to the chalets with one 56 m bridge (ŘSD leaflet 07/2025,
  // "V km 1,218 překonává mostem délky 56 m místní komunikaci do chatové osady a souběžný potok Aleš"), at our km 0.75
  // where the starter fills over it in a culvert. The place: the stream (OSM 968409233, the pack's watercourses) 150 m
  // either side of the starter's crossing, 20 m either side of it.
  'sternberk-ales': {
    id: 'sternberk-ales', headline: 'Leave the Aleš stream open',
    story: 'The design review wants the Aleš stream and the chalet road under a bridge, as the real design has it.',
    ask: 'Bridge the Aleš stream: no embankment over it',
    cite: { text: 'ŘSD leaflet, 07/2025', url: 'https://apdos.roadmedia.cz/Upload/Stavby/329/infoletak_s46-sternberk-obchvat.pdf' },
    zone: { label: 'Aleš stream', forbid: SPAN, shape: { kind: 'polygon', pts: [[-542694, -1109750], [-542742, -1109765], [-542837, -1109821], [-542961, -1109877],
      [-542978, -1109841], [-542856, -1109786], [-542755, -1109727], [-542705, -1109712]] } },
  },
  // The real design crosses the Sprchový potok valley on a 287 m viaduct (ŘSD leaflet 07/2025: "hustého lesa ve strmém
  // svahu Sprchového potoka … trasa překračuje údolí estakádou délky 287 m"). The place: the stream's mapped reach (OSM
  // 389408307) by the starter's crossing, 45 m either side: no embankment across the valley floor.
  'sternberk-valley': {
    id: 'sternberk-valley', headline: 'The Sprchový valley stays open',
    story: 'The forest and the stream in the Sprchový valley must stay connected under the road.',
    ask: 'Bridge the Sprchový valley floor',
    cite: { text: 'ŘSD leaflet, 07/2025', url: 'https://apdos.roadmedia.cz/Upload/Stavby/329/infoletak_s46-sternberk-obchvat.pdf' },
    zone: { label: 'Sprchový valley', forbid: SPAN, shape: { kind: 'polygon', pts: [[-540874, -1107680], [-540922, -1107665], [-541001, -1107655],
      [-540990, -1107566], [-540908, -1107576], [-540855, -1107589], [-540811, -1107613], [-540859, -1107690]] } },
  },
};
