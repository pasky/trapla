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
  /** where the story comes from, for the curious (shown small on the card): a real event's source (a link); a game
   * event says so and names the kind of rule it stands for (no link, or the register its place comes from) */
  cite: { text: string; url?: string };
  /** the place and what our line may not do there (EPSG:5514) */
  zone?: { label: string; shape: { kind: 'circle'; x: number; y: number; r: number } | { kind: 'polygon'; pts: readonly (readonly [number, number])[] }; forbid: readonly Use[] };
  /** the bill may not exceed this share of the mission's starting bill */
  budget?: number;
}

/** keep out: nothing of ours there, on the ground or over it on a bridge; a mined tunnel deep under it is fine */
export const KEEP_OUT: readonly Use[] = ['cut', 'fill', 'bridge', 'cover'];
/** no open cut: a tunnel through it (or a bridge, or an embankment) */
export const NO_CUT: readonly Use[] = ['cut'];
/** nothing of ours on the ground there: a bridge may pass over it, its piers outside */
export const NO_PIERS: readonly Use[] = ['cut', 'fill', 'cover', 'pier'];
/** leave the ground as it is: a bridge over it or a mined tunnel under it, no cutting or filling */
export const SPAN: readonly Use[] = ['cut', 'fill', 'cover'];
/** keep the road low: in a cutting (or a tunnel), neither on an embankment nor on a bridge */
export const LOW: readonly Use[] = ['fill', 'bridge'];

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
  // moved to the next year). The cap is the game's: 88 % of the starting bill (the goal is 90 %); it comes last, after
  // the news that costs money.
  'sternberk-money': {
    id: 'sternberk-money', headline: 'No money for the bypass this year',
    story: 'The state’s road money for 2026 left the bypass out. To get in next year, it must cost less.',
    ask: 'Keep the bill under 88 % of the planned line’s',
    cite: { text: 'zdopravy.cz, 21 Dec 2025', url: 'https://zdopravy.cz/stavba-obchvatu-sternberka-se-zpozdi-v-rozpoctu-na-nej-nejsou-penize-269148/' },
    budget: 0.88,
  },
  // Protected butterflies found in the works' area (reported to the region 9/2026; ŘSD asked for an exemption in 8/2026;
  // the permit suspended until 9/2027 at the latest). Neither the species nor the place is published: the game puts
  // them on the open land by the shooting range that the line crosses at km 1.1–1.3 (a 90 m circle; PROVISIONAL, the
  // game's guess: military ranges often keep the grassland such butterflies need).
  'sternberk-butterflies': {
    id: 'sternberk-butterflies', headline: 'Protected butterflies on the route',
    story: 'Surveyors found protected butterflies in the way. Where is not published: here, their meadow is by the shooting range.',
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
  // ---- d3-0301-motorway (places: research/95) ----
  // GAME EVENT (research/95 "Archaeology"): a find on open land near a village, kept where it lies under an embankment;
  // the place is the game's, where the starter and the reference both cut (km 4.8, 2–10 m).
  'd3-0301-graves': {
    id: 'd3-0301-graves', headline: 'Graves under the field',
    story: 'Archaeologists found an old burial ground in the field by Libeř. It is to stay where it lies, under the road.',
    ask: 'No cutting into the burial ground',
    cite: { text: 'A game event of a kind real projects meet (heritage act 20/1987)' },
    zone: { label: 'Burial ground', forbid: NO_CUT, shape: { kind: 'circle', x: -741905, y: -1061566, r: 70 } },
  },
  // GAME EVENT (research/95 "A gas main"): along the tertiary road the line crosses at km 3.75 (the pack's ways), 160 m
  // either side of the crossing, 10 m either side of the road.
  'd3-0301-gas': {
    id: 'd3-0301-gas', headline: 'A gas main by the road',
    story: 'A high-pressure gas main runs beside the road to Libeř. Its owner will not have it buried deeper or an embankment put on it.',
    ask: 'No cutting or embankment over the gas main',
    cite: { text: 'A game event of a kind real projects meet (energy act 458/2000, protection zones)' },
    zone: { label: 'Gas main', forbid: SPAN, shape: { kind: 'polygon', pts: [[-741125, -1060883], [-741117, -1060904], [-741102, -1060917], [-741108, -1060936], [-741133, -1060916], [-741145, -1060887], [-741169, -1060620], [-741149, -1060618]] } },
  },
  // GAME EVENT (research/95 "A newly listed building"): the farm buildings at km 7.2 (pack buildings 5194, 5207), a 35 m
  // circle; the starter bridges over them.
  'd3-0301-farm': {
    id: 'd3-0301-farm', headline: 'The farmstead is now listed',
    story: 'The old farmstead below Zahořany was declared a cultural monument. Nothing of ours may stand on it or pass over it.',
    ask: 'Keep clear of the farmstead',
    cite: { text: 'A game event of a kind real projects meet (heritage act 20/1987)' },
    zone: { label: 'Farmstead', forbid: KEEP_OUT, shape: { kind: 'circle', x: -742040, y: -1063820, r: 35 } },
  },
  // GAME EVENT (research/95 "A nest"): at the forest edge the line enters at km 6.75, between the starter and the
  // reference, a 60 m circle.
  'd3-0301-nest': {
    id: 'd3-0301-nest', headline: 'A black stork nests here',
    story: 'A pair of black storks nests at the edge of the wood. The nature office wants the works kept away from the nest.',
    ask: 'Keep out of the nest’s quiet zone',
    cite: { text: 'A game event of a kind real projects meet (nature act 114/1992)' },
    zone: { label: 'Stork’s nest', forbid: KEEP_OUT, shape: { kind: 'circle', x: -741960, y: -1063406, r: 60 } },
  },
  // GAME EVENT on a real place (research/95 "Undermined ground"): the ČGS register of undermined areas, "Petrov u
  // Prahy-Ostřetina" (gold ore, located exactly, a system of workings), within 150 m of the starter and the reference. On
  // the whole D3 only: in the 0301 mission it lies at the section's end, whose height the next section sets.
  'd3-0301-gold': {
    id: 'd3-0301-gold', headline: 'Old gold pits under the line',
    story: 'The survey found the old gold pits of Ostřetina under the line. Digging into them would open the old workings.',
    ask: 'No cutting into the old gold pits',
    cite: { text: 'A game event of a kind real projects meet, on a place in the ČGS register of undermined areas', url: 'https://mapy.geology.cz/arcgis/rest/services/Dulni_Dila/poddolovana_uzemi/MapServer' },
    zone: { label: 'Old gold pits', forbid: NO_CUT, shape: { kind: 'polygon', pts: [[-742042, -1064797], [-742239, -1065111], [-742267, -1065093], [-742298, -1065062], [-742312, -1065036], [-742321, -1065008], [-742325, -1064973], [-742182, -1064746]] } },
  },
  // GAME EVENT (research/95 "Money"): the cap is the game's, 85 % of the starting bill (the goal is 90 %); it comes last.
  'd3-0301-money': {
    id: 'd3-0301-money', headline: 'Less money for roads',
    story: 'The state road fund has less money next year. The first section must cost less to keep its place.',
    ask: 'Keep the bill under 85 % of the planned line’s',
    cite: { text: 'A game event of a kind real projects meet (the state road fund is set year by year)' },
    budget: 0.85,
  },
  // ---- end d3-0301-motorway ----
  // ---- d3-0302-motorway (places: research/95) ----
  // The real design (ŘSD leaflet 0302, 09/2025: "Tunel Luka délky 1843 m" ... "raženého tunelu Luka délky 1260 m, kterým
  // podchází lesní masiv"; the detailed survey by a trial gallery begun 5 Mar 2025; research/92) tunnels the wooded hill
  // the starter and the reference cut 20–29 m deep; the place: its crest only, km 1.6–1.96 of both lines, 60 m either side
  // (the whole tunnel would put the goal out of reach at the game's prices).
  'd3-0302-luka': {
    id: 'd3-0302-luka', headline: 'A tunnel under Luka',
    story: 'Miners have begun a trial gallery for the Luka tunnel. The design review wants the wooded crest crossed in a tunnel, as the real design has it.',
    ask: 'No open cut through the crest at Luka',
    cite: { text: 'ŘSD leaflet, 09/2025 (the trial gallery, 3/2025)', url: 'https://apdos.roadmedia.cz/Upload/Stavby/44/infoletak_d3-0302-jilove-hosteradice.pdf' },
    zone: { label: 'Luka crest', forbid: NO_CUT, shape: { kind: 'polygon', pts: [[-742271, -1066525], [-742175, -1066807], [-742289, -1066847], [-742385, -1066561]] } },
  },
  // GAME EVENT (research/95 "A landslide"): the steep (1:3) wooded north side of the Sázava valley the reference fills at
  // km 2.2–2.45, 45 m either side of both lines.
  'd3-0302-slope': {
    id: 'd3-0302-slope', headline: 'The valley side is creeping',
    story: 'The survey found the steep wooded side of the Sázava valley slowly sliding. No earthworks on it: bridge it, with the piers founded deep.',
    ask: 'No cutting or embankment on the creeping slope',
    cite: { text: 'A game event of a kind real projects meet (slope surveys before a design)' },
    zone: { label: 'Creeping slope', forbid: SPAN, shape: { kind: 'polygon', pts: [[-741948, -1067152], [-741926, -1067420], [-742016, -1067428], [-742027, -1067294], [-742111, -1067324], [-742179, -1067126], [-742095, -1067096], [-742027, -1067293], [-742038, -1067158]] } },
  },
  // GAME EVENT (research/95 "A village's demand"): the reference's stretch past Rakousy (km 3.38–3.9, 40 m either side),
  // where the starter is on a bridge and an embankment.
  'd3-0302-quiet': {
    id: 'd3-0302-quiet', headline: 'Rakousy asks for quiet',
    story: 'The village of Rakousy asks for the motorway to run past it in a cutting, out of sight and quieter.',
    ask: 'Keep the road in a cutting past Rakousy',
    cite: { text: 'A game event of a kind real projects meet (the EIA hearing: villages ask for a lower line)' },
    zone: { label: 'Past Rakousy', forbid: LOW, shape: { kind: 'polygon', pts: [[-741854, -1068407], [-741843, -1068490], [-741829, -1068546], [-741811, -1068598], [-741787, -1068650], [-741760, -1068700], [-741694, -1068798], [-741760, -1068842], [-741829, -1068740], [-741859, -1068685], [-741886, -1068626], [-741906, -1068568], [-741921, -1068505], [-741931, -1068443], [-741938, -1068353], [-741858, -1068347]] } },
  },
  // GAME EVENT (research/95 "A nest"): the forest edge the reference crosses at km 0.87–0.93, a 55 m circle 35 m off its
  // line (away from the starter).
  'd3-0302-nest': {
    id: 'd3-0302-nest', headline: 'An eagle owl nests here',
    story: 'An eagle owl nests at the edge of the wood below Studené. The nature office wants the works kept away from it.',
    ask: 'Keep out of the nest’s quiet zone',
    cite: { text: 'A game event of a kind real projects meet (nature act 114/1992)' },
    zone: { label: 'Owl’s nest', forbid: KEEP_OUT, shape: { kind: 'circle', x: -742065, y: -1065868, r: 55 } },
  },
  // GAME EVENT (research/95 "Money"): the cap is the game's, 88 % of the starting bill (the goal is 90 %); it comes last.
  'd3-0302-money': {
    id: 'd3-0302-money', headline: 'Less money for roads',
    story: 'The state road fund has less money next year. The Sázava section must cost less to keep its place.',
    ask: 'Keep the bill under 88 % of the planned line’s',
    cite: { text: 'A game event of a kind real projects meet (the state road fund is set year by year)' },
    budget: 0.88,
  },
  // ---- end d3-0302-motorway ----
  // ---- d3-0303-motorway (places: research/95) ----
  // The real design (ŘSD leaflet 0303, 09/2025: "V km 15,5 je navržen dálniční most přes údolí o délce 117 m"; research/92
  // krnany-valley-bridge) bridges the valley at real km 15.5, our km ≈ 1.5 (0303 starts at real km 14.0); the place: the
  // valley floor, where the starter and the reference fill 11–18 m deep, km 1.45–1.56 of both lines, 40 m either side (the
  // bridge's 117 m).
  'd3-0303-valley': {
    id: 'd3-0303-valley', headline: 'A bridge over the side valley',
    story: 'The design review wants the side valley near the start bridged, as the real design has it, not filled.',
    ask: 'No embankment in the side valley',
    cite: { text: 'ŘSD leaflet, 09/2025', url: 'https://apdos.roadmedia.cz/Upload/Stavby/43/infoletak_d3-0303-hosteradice-vaclavice.pdf' },
    zone: { label: 'Side valley', forbid: SPAN, shape: { kind: 'polygon', pts: [[-741120, -1070830], [-741178, -1070844], [-741178, -1070840], [-741198, -1070844], [-741218, -1070724], [-741128, -1070709], [-741100, -1070822], [-741120, -1070828]] } },
  },
  // GAME EVENT (research/95 "Archaeology"): open field near Dunávice where both lines cut 1–3 m (km 7.6), a 60 m circle.
  'd3-0303-pots': {
    id: 'd3-0303-pots', headline: 'A Bronze Age settlement',
    story: 'Archaeologists found the pits of an old settlement in the field by Dunávice. It is to stay where it lies, under the road.',
    ask: 'No cutting into the settlement',
    cite: { text: 'A game event of a kind real projects meet (heritage act 20/1987)' },
    zone: { label: 'Old settlement', forbid: NO_CUT, shape: { kind: 'circle', x: -737111, y: -1074998, r: 60 } },
  },
  // GAME EVENT (research/95 "A village's demand"): the reference's stretch nearest Dunávice, km 6.93–7.23, 40 m either
  // side.
  'd3-0303-quiet': {
    id: 'd3-0303-quiet', headline: 'Dunávice asks for quiet',
    story: 'Dunávice asks for the motorway to pass the village in a cutting, out of sight and quieter.',
    ask: 'Keep the road in a cutting past Dunávice',
    cite: { text: 'A game event of a kind real projects meet (the EIA hearing: villages ask for a lower line)' },
    zone: { label: 'Past Dunávice', forbid: LOW, shape: { kind: 'polygon', pts: [[-737622, -1074495], [-737544, -1074581], [-737412, -1074700], [-737464, -1074760], [-737600, -1074638], [-737682, -1074547]] } },
  },
  // GAME EVENT (research/95 "A gas main"): along the secondary road the reference crosses at km 3.2 (the pack's ways), 150
  // m either side, 10 m either side of the road.
  'd3-0303-gas': {
    id: 'd3-0303-gas', headline: 'A gas main by the road',
    story: 'A high-pressure gas main runs beside the road the motorway crosses near Maskovice. Its owner will not have it buried deeper or an embankment put on it.',
    ask: 'No cutting or embankment over the gas main',
    cite: { text: 'A game event of a kind real projects meet (energy act 458/2000, protection zones)' },
    zone: { label: 'Gas main', forbid: SPAN, shape: { kind: 'polygon', pts: [[-740550, -1072453], [-740529, -1072197], [-740509, -1072196], [-740530, -1072453], [-740529, -1072496], [-740549, -1072496]] } },
  },
  // GAME EVENT (research/95 "A nest"): the forest edge at km 6.75, between the starter and the reference, a 55 m circle.
  'd3-0303-nest': {
    id: 'd3-0303-nest', headline: 'An eagle owl nests here',
    story: 'An eagle owl nests at the edge of the wood by Dunávice. The nature office wants the works kept away from it.',
    ask: 'Keep out of the nest’s quiet zone',
    cite: { text: 'A game event of a kind real projects meet (nature act 114/1992)' },
    zone: { label: 'Owl’s nest', forbid: KEEP_OUT, shape: { kind: 'circle', x: -737787, y: -1074391, r: 55 } },
  },
  // GAME EVENT (research/95 "Money"): the cap is the game's, 88 % of the starting bill (the goal is 90 %); it comes last.
  'd3-0303-money': {
    id: 'd3-0303-money', headline: 'Less money for roads',
    story: 'The state road fund has less money next year. The section to Václavice must cost less to keep its place.',
    ask: 'Keep the bill under 88 % of the planned line’s',
    cite: { text: 'A game event of a kind real projects meet (the state road fund is set year by year)' },
    budget: 0.88,
  },
  // ---- end d3-0303-motorway ----
  // ---- d3-0304-motorway (places: research/95) ----
  // GAME EVENT (research/95 "Archaeology"): open field near Maršovice where both lines cut 3–5 m (km 8.7), a 70 m circle
  // between them.
  'd3-0304-graves': {
    id: 'd3-0304-graves', headline: 'A Slavic burial ground',
    story: 'Archaeologists found an early medieval burial ground in the field by Maršovice. It is to stay where it lies, under the road.',
    ask: 'No cutting into the burial ground',
    cite: { text: 'A game event of a kind real projects meet (heritage act 20/1987)' },
    zone: { label: 'Burial ground', forbid: NO_CUT, shape: { kind: 'circle', x: -738312, y: -1085010, r: 70 } },
  },
  // GAME EVENT (research/95 "A newly listed building"): the farm buildings at km 10.8 (pack buildings 1322, 1342), a 40 m
  // circle.
  'd3-0304-farm': {
    id: 'd3-0304-farm', headline: 'The farm at Strnadice is now listed',
    story: 'The old farm buildings at Strnadice were declared a cultural monument. Nothing of ours may stand on them or pass over them.',
    ask: 'Keep clear of the Strnadice farm',
    cite: { text: 'A game event of a kind real projects meet (heritage act 20/1987)' },
    zone: { label: 'Strnadice farm', forbid: KEEP_OUT, shape: { kind: 'circle', x: -739252, y: -1086858, r: 40 } },
  },
  // GAME EVENT (research/95 "A village's demand"): the reference's stretch nearest Šebáňovice, km 12.56–12.9, 40 m either
  // side.
  'd3-0304-quiet': {
    id: 'd3-0304-quiet', headline: 'Šebáňovice asks for quiet',
    story: 'Šebáňovice asks for the motorway to pass the village in a cutting, out of sight and quieter.',
    ask: 'Keep the road in a cutting past Šebáňovice',
    cite: { text: 'A game event of a kind real projects meet (the EIA hearing: villages ask for a lower line)' },
    zone: { label: 'Past Šebáňovice', forbid: LOW, shape: { kind: 'polygon', pts: [[-739637, -1088572], [-739725, -1088890], [-739803, -1088868], [-739715, -1088550]] } },
  },
  // GAME EVENT (research/95 "A gas main"): along the secondary road the reference crosses at km 4.44, 150 m either side,
  // 10 m either side of the road.
  'd3-0304-gas': {
    id: 'd3-0304-gas', headline: 'A gas main by the road',
    story: 'A high-pressure gas main runs beside the road the motorway crosses near Neštětice. Its owner will not have it buried deeper or an embankment put on it.',
    ask: 'No cutting or embankment over the gas main',
    cite: { text: 'A game event of a kind real projects meet (energy act 458/2000, protection zones)' },
    zone: { label: 'Gas main', forbid: SPAN, shape: { kind: 'polygon', pts: [[-736147, -1081414], [-736144, -1081395], [-735848, -1081443], [-735851, -1081463]] } },
  },
  // GAME EVENT (research/95 "A nest"): the forest edge at km 3.06, between the starter and the reference, a 55 m circle.
  'd3-0304-nest': {
    id: 'd3-0304-nest', headline: 'A black stork nests here',
    story: 'A pair of black storks nests at the edge of the wood by Přibyšice. The nature office wants the works kept away from the nest.',
    ask: 'Keep out of the nest’s quiet zone',
    cite: { text: 'A game event of a kind real projects meet (nature act 114/1992)' },
    zone: { label: 'Stork’s nest', forbid: KEEP_OUT, shape: { kind: 'circle', x: -735315, y: -1080256, r: 55 } },
  },
  // GAME EVENT (research/95 "Money"): the cap is the game's, 85 % of the starting bill (the goal is 90 %); it comes last.
  'd3-0304-money': {
    id: 'd3-0304-money', headline: 'Less money for roads',
    story: 'The state road fund has less money next year. The section to Voračice must cost less to keep its place.',
    ask: 'Keep the bill under 85 % of the planned line’s',
    cite: { text: 'A game event of a kind real projects meet (the state road fund is set year by year)' },
    budget: 0.85,
  },
  // ---- end d3-0304-motorway ----
  // ---- d3-0305-motorway (places: research/95) ----
  // GAME EVENT on a real place (research/95 "Undermined ground"): the ČGS register of undermined areas, "Divišovice"
  // (radioactive ores, after 1945, located exactly, a system of workings; DIAMO manages the shafts), within 150 m of both
  // lines (km 7.1–7.4).
  'd3-0305-uranium': {
    id: 'd3-0305-uranium', headline: 'Old uranium workings',
    story: 'The survey found the old uranium workings of Divišovice under the line. Dug spoil from them would have to go to a special tip.',
    ask: 'No cutting into the old uranium workings',
    cite: { text: 'A game event of a kind real projects meet, on a place in the ČGS register of undermined areas', url: 'https://mapy.geology.cz/arcgis/rest/services/Dulni_Dila/poddolovana_uzemi/MapServer' },
    zone: { label: 'Uranium workings', forbid: NO_CUT, shape: { kind: 'polygon', pts: [[-739726, -1098075], [-739706, -1098208], [-739655, -1098100], [-739525, -1098309], [-739589, -1098315], [-739669, -1098302], [-739741, -1098230], [-739748, -1098287], [-739781, -1098284], [-739806, -1098193]] } },
  },
  // GAME EVENT (research/95 "Archaeology"): open field near Dědkov where both lines cut 1.5–3 m (km 4.7), a 60 m circle
  // between them.
  'd3-0305-graves': {
    id: 'd3-0305-graves', headline: 'Graves under the field',
    story: 'Archaeologists found an old burial ground in the field by Dědkov. It is to stay where it lies, under the road.',
    ask: 'No cutting into the burial ground',
    cite: { text: 'A game event of a kind real projects meet (heritage act 20/1987)' },
    zone: { label: 'Burial ground', forbid: NO_CUT, shape: { kind: 'circle', x: -740707, y: -1095914, r: 60 } },
  },
  // GAME EVENT (research/95 "A nest"): the forest edge at km 1.5–1.6, between the starter and the reference, a 55 m
  // circle.
  'd3-0305-nest': {
    id: 'd3-0305-nest', headline: 'A black stork nests here',
    story: 'A pair of black storks nests at the edge of the wood by Bezmíř. The nature office wants the works kept away from the nest.',
    ask: 'Keep out of the nest’s quiet zone',
    cite: { text: 'A game event of a kind real projects meet (nature act 114/1992)' },
    zone: { label: 'Stork’s nest', forbid: KEEP_OUT, shape: { kind: 'circle', x: -740514, y: -1092834, r: 55 } },
  },
  // GAME EVENT (research/95 "A gas main"): along the secondary road the reference crosses at km 7.53 (the pack's ways),
  // 150 m either side, 10 m either side of the road.
  'd3-0305-gas': {
    id: 'd3-0305-gas', headline: 'A gas main by the road',
    story: 'A high-pressure gas main runs beside the road the motorway crosses by Loudilka. Its owner will not have it buried deeper or an embankment put on it.',
    ask: 'No cutting or embankment over the gas main',
    cite: { text: 'A game event of a kind real projects meet (energy act 458/2000, protection zones)' },
    zone: { label: 'Gas main', forbid: SPAN, shape: { kind: 'polygon', pts: [[-739696, -1098513], [-739653, -1098496], [-739500, -1098455], [-739465, -1098451], [-739401, -1098452], [-739400, -1098472], [-739465, -1098471], [-739495, -1098475], [-739647, -1098516], [-739687, -1098531]] } },
  },
  // A real place, a game event (research/95 "A stream for animals"): the AOPK register of migration-significant streams
  // ("Mastník", regional priority corridor); the real design crosses its valley on a 925 m viaduct (ŘSD leaflet 0305/I,
  // research/92 mastnik-valley-bridge). The place: the stream 150 m either side of the reference's crossing, 40 m either
  // side of it.
  'd3-0305-mastnik': {
    id: 'd3-0305-mastnik', headline: 'Leave the Mastník open for otters',
    story: 'The Mastník is a stream fish and otters travel along. The nature office wants its banks left free under a wider bridge.',
    ask: 'No cutting or embankment on the Mastník’s banks',
    cite: { text: 'A game event of a kind real projects meet, on a place in the AOPK register of migration-significant streams', url: 'https://gis.nature.cz/arcgis/rest/services/AplikovanaOchrana/MigracneVyznamneToky/MapServer' },
    zone: { label: 'Mastník banks', forbid: SPAN, shape: { kind: 'polygon', pts: [[-740983, -1094062], [-740969, -1094067], [-740965, -1094016], [-740970, -1094018], [-740964, -1094012], [-740962, -1093988], [-740943, -1093994], [-740923, -1093991], [-740901, -1093976], [-740873, -1093969], [-740842, -1093967], [-740806, -1093974], [-740781, -1093986], [-740768, -1094000], [-740746, -1094056], [-740729, -1094080], [-740727, -1094095], [-740730, -1094118], [-740801, -1094108], [-740799, -1094113], [-740785, -1094125], [-740804, -1094117], [-740818, -1094100], [-740834, -1094050], [-740879, -1094057], [-740893, -1094066], [-740908, -1094069], [-740924, -1094080], [-740942, -1094084], [-740957, -1094083], [-740982, -1094071], [-740992, -1094059], [-740997, -1094043]] } },
  },
  // ---- end d3-0305-motorway ----
  // ---- d35-stage1-motorway (places: research/95) ----
  // A real condition (EIA MZP136, 2010: the eastern portal fixed in place, its works not to touch the forest of the nature
  // monument's protection zone; research/93 pod-skalou-protected-slope); the place: the AOPK polygon of the protection
  // zone of PP Pod skálou (declared). Both lines dig it up at km 6.7–7.1 (cut and cover, cutting).
  'd35-pod-skalou': {
    id: 'd35-pod-skalou', headline: 'Hands off the Pod skálou forest',
    story: 'The tunnel’s east end may not touch the forest round the Pod skálou reserve: its portal must lie outside the protection zone, a deep tunnel may pass under it.',
    ask: 'Keep out of the Pod skálou protection zone',
    cite: { text: 'EIA documentation, 2010', url: 'https://portal.cenia.cz/eiasea/download/RUlBX01aUDEzNl9kb2t1bWVudGFjZURPQ18xLnppcA/MZP136_dokumentace.zip' },
    zone: { label: 'Pod skálou', forbid: KEEP_OUT, shape: { kind: 'polygon', pts: [[-592430, -1092724], [-592383, -1092836], [-592360, -1092948], [-592298, -1093083], [-592276, -1093184], [-592268, -1093300], [-592279, -1093363], [-592319, -1093427], [-592420, -1093528], [-592487, -1093552], [-592490, -1093616], [-592503, -1093642], [-592530, -1093655], [-592554, -1093654], [-592679, -1093603], [-592704, -1093584], [-592713, -1093562], [-592738, -1093553], [-592754, -1093575], [-592786, -1093590], [-592876, -1093572], [-592900, -1093554], [-592909, -1093520], [-593020, -1093480], [-593112, -1093458], [-593177, -1093428], [-593189, -1093400], [-593186, -1093375], [-593149, -1093346], [-593013, -1093362], [-592932, -1093362], [-592872, -1093387], [-592865, -1093358], [-592843, -1093338], [-592713, -1093313], [-592737, -1093277], [-592729, -1093225], [-592695, -1093202], [-592610, -1093208], [-592616, -1093184], [-592606, -1093155], [-592692, -1092997], [-592727, -1092980], [-592742, -1092952], [-592738, -1092922], [-592715, -1092899], [-592711, -1092865], [-592684, -1092842], [-592701, -1092792], [-592699, -1092746], [-592667, -1092719], [-592607, -1092721], [-592480, -1092688], [-592451, -1092696]] } },
  },
  // GAME EVENT on a real place (research/95 "A landslide"): the ČGS register of slope deformations, CGS1434151 (Radišov),
  // 15 m round it; both lines cut 6 m there (km 11.5).
  'd35-radisov-slope': {
    id: 'd35-radisov-slope', headline: 'A creeping slope at Radišov',
    story: 'The slope above Radišov is a known slow landslide. Cutting into its foot would set it moving.',
    ask: 'No cutting into the Radišov slope',
    cite: { text: 'A game event of a kind real projects meet, on a place in the ČGS register of slope deformations', url: 'https://mapy.geology.cz/arcgis/rest/services/Geohazardy/svahove_nestability/MapServer' },
    zone: { label: 'Radišov slope', forbid: NO_CUT, shape: { kind: 'polygon', pts: [[-587943, -1093255], [-587915, -1093267], [-587908, -1093279], [-587908, -1093294], [-587918, -1093321], [-587931, -1093339], [-587941, -1093345], [-587958, -1093348], [-587972, -1093343], [-587981, -1093335], [-587985, -1093326], [-587987, -1093303], [-587972, -1093264], [-587959, -1093255]] } },
  },
  // GAME EVENT (research/95 "Archaeology"; the rescue survey itself is real: research/93 op-s-m-rescue-survey, no find
  // published): open field near Radišov where both lines cut 3–4 m (km 12.6–13), a 70 m circle between them.
  'd35-graves': {
    id: 'd35-graves', headline: 'A prehistoric settlement',
    story: 'The archaeologists surveying the route found a prehistoric settlement in the field by Radišov. It is to stay where it lies, under the road.',
    ask: 'No cutting into the settlement',
    cite: { text: 'A game event of a kind real projects meet (heritage act 20/1987) and the real rescue survey along the route since 10/2024' },
    zone: { label: 'Old settlement', forbid: NO_CUT, shape: { kind: 'circle', x: -586688, y: -1093308, r: 70 } },
  },
  // GAME EVENT (research/95 "A village's demand"): the stretch nearest Dětřichov, km 2.82–3.03 of both lines, 40 m either
  // side.
  'd35-quiet': {
    id: 'd35-quiet', headline: 'Dětřichov asks for quiet',
    story: 'Dětřichov asks for the motorway to pass the village in a cutting, out of sight and quieter.',
    ask: 'Keep the road in a cutting past Dětřichov',
    cite: { text: 'A game event of a kind real projects meet (the EIA hearing: villages ask for a lower line)' },
    zone: { label: 'Past Dětřichov', forbid: LOW, shape: { kind: 'polygon', pts: [[-596563, -1092637], [-596359, -1092583], [-596337, -1092661], [-596539, -1092713]] } },
  },
  // GAME EVENT (research/95 "A nest"): the wood strip both lines cross at km 11.1–11.4, a 50 m circle.
  'd35-nest': {
    id: 'd35-nest', headline: 'A black stork nests here',
    story: 'A pair of black storks nests in the wood strip by Kunčina. The nature office wants the works kept away from the nest.',
    ask: 'Keep out of the nest’s quiet zone',
    cite: { text: 'A game event of a kind real projects meet (nature act 114/1992)' },
    zone: { label: 'Stork’s nest', forbid: KEEP_OUT, shape: { kind: 'circle', x: -588242, y: -1093412, r: 50 } },
  },
  // GAME EVENT (research/95 "Money"): the cap is the game's, 85 % of the starting bill (the goal is 90 %); it comes last.
  'd35-money': {
    id: 'd35-money', headline: 'Less money for roads',
    story: 'The state road fund has less money next year. The first section must cost less to keep its place.',
    ask: 'Keep the bill under 85 % of the planned line’s',
    cite: { text: 'A game event of a kind real projects meet (the state road fund is set year by year)' },
    budget: 0.85,
  },
  // ---- end d35-stage1-motorway ----
  // ---- d11-motorway (places: research/95) ----
  // GAME EVENT on a real place (research/95 "Undermined ground"): the ČGS register of mine workings, "šachtice Starý
  // Rokytník" (an old shaft, notice 2919), 40 m round it; both lines pass within 40 m (km 0.75).
  'd11-shaft': {
    id: 'd11-shaft', headline: 'An old shaft by Starý Rokytník',
    story: 'The survey found an old copper mine shaft under the line. Nothing of ours may go near it.',
    ask: 'Keep off the old shaft',
    cite: { text: 'A game event of a kind real projects meet, on a place in the ČGS register of mine workings', url: 'https://mapy.geology.cz/arcgis/rest/services/Dulni_Dila/dulni_dila/MapServer' },
    zone: { label: 'Old shaft', forbid: KEEP_OUT, shape: { kind: 'circle', x: -630366, y: -1007499, r: 40 } },
  },
  // GAME EVENT on a real place (research/95 "A landslide"): the ČGS register of slope deformations, CGS0342252 (Poříčí u
  // Trutnova), 10 m round it; both lines fill 11–36 m over it (km 5.5–5.8).
  'd11-porici-slope': {
    id: 'd11-porici-slope', headline: 'A creeping slope at Poříčí',
    story: 'The slope below Poříčí is a known slow landslide. An embankment on it would push it down: bridge it, with the piers founded deep.',
    ask: 'No cutting or embankment on the Poříčí slope',
    cite: { text: 'A game event of a kind real projects meet, on a place in the ČGS register of slope deformations', url: 'https://mapy.geology.cz/arcgis/rest/services/Geohazardy/svahove_nestability/MapServer' },
    zone: { label: 'Poříčí slope', forbid: SPAN, shape: { kind: 'polygon', pts: [[-627390, -1003953], [-627379, -1003959], [-627372, -1003970], [-627369, -1003981], [-627371, -1003996], [-627419, -1004077], [-627428, -1004099], [-627444, -1004126], [-627481, -1004160], [-627499, -1004166], [-627517, -1004164], [-627539, -1004153], [-627556, -1004135], [-627565, -1004107], [-627565, -1004091], [-627555, -1004065], [-627544, -1004053], [-627504, -1004023], [-627437, -1003961], [-627413, -1003951]] } },
  },
  // GAME EVENT on a real place (research/95 "A landslide"): the ČGS register of slope deformations, CGS03422016 (Zlatá
  // Olešnice); both lines cut up to 5 m there (km 12.6–13.1).
  'd11-olesnice-slope': {
    id: 'd11-olesnice-slope', headline: 'A creeping slope at Zlatá Olešnice',
    story: 'The hillside by Zlatá Olešnice is a known slow landslide. Cutting into it would set it moving.',
    ask: 'No cutting into the Zlatá Olešnice slope',
    cite: { text: 'A game event of a kind real projects meet, on a place in the ČGS register of slope deformations', url: 'https://mapy.geology.cz/arcgis/rest/services/Geohazardy/svahove_nestability/MapServer' },
    zone: { label: 'Olešnice slope', forbid: NO_CUT, shape: { kind: 'polygon', pts: [[-627086, -996970], [-627038, -996979], [-627019, -996988], [-627007, -997001], [-626992, -997027], [-626988, -997038], [-626987, -997060], [-626995, -997104], [-626990, -997158], [-626992, -997196], [-627011, -997252], [-627027, -997278], [-627041, -997288], [-627207, -997341], [-627317, -997347], [-627336, -997340], [-627343, -997327], [-627338, -997304], [-627297, -997240], [-627284, -997170], [-627277, -997145], [-627263, -997122], [-627189, -997030], [-627163, -997004], [-627125, -996978], [-627105, -996971]] } },
  },
  // GAME EVENT (research/95 "Archaeology"; the real find of war graves on the D11 between Studenec and Střítež, 12/2025,
  // research/94 střítež-war-graves, lies outside this map): open field near Lampertice where both lines cut 2.5–5 m (km
  // 16.75), a 60 m circle.
  'd11-graves': {
    id: 'd11-graves', headline: 'Soldiers’ graves by Lampertice',
    story: 'Archaeologists found graves of soldiers from the wars of 1745 and 1866 in the field by Lampertice. They are to stay where they lie, under the road.',
    ask: 'No cutting into the graves',
    cite: { text: 'A game event of a kind real projects meet (heritage act 20/1987); such graves were really found on the D11 near Střítež in 2025' },
    zone: { label: 'Soldiers’ graves', forbid: NO_CUT, shape: { kind: 'circle', x: -626050, y: -993866, r: 60 } },
  },
  // GAME EVENT (research/95 "A nest"): the forest edge at km 2.67, between the starter and the reference, a 55 m circle.
  'd11-nest': {
    id: 'd11-nest', headline: 'A black stork nests here',
    story: 'A pair of black storks nests at the edge of the wood above Bojiště. The nature office wants the works kept away from the nest.',
    ask: 'Keep out of the nest’s quiet zone',
    cite: { text: 'A game event of a kind real projects meet (nature act 114/1992)' },
    zone: { label: 'Stork’s nest', forbid: KEEP_OUT, shape: { kind: 'circle', x: -629496, y: -1005846, r: 55 } },
  },
  // A real event (the D11 1109 contract, 8 Oct 2024: CZK 11.71 bn against the 13.07 bn estimate, research/94
  // contract-price-ceiling); the cap is the game's (our bill does not hold what the contract does): 89 % of the starting
  // bill, the goal is 90 %, what the reference with every news reaches. It comes last.
  'd11-contract': {
    id: 'd11-contract', headline: 'The works are let',
    story: 'The contract was signed 10 % under the estimate. The design must now keep within it.',
    ask: 'Keep the bill under 89 % of the planned line’s',
    cite: { text: 'ŘSD leaflet, 04/2026 (the contract, 10/2024)', url: 'https://apdos-v2.creativesound.cz/media/stavba/747/leaflet/infoletak_d11-trutnov-hranice-2etapa.pdf' },
    budget: 0.89,
  },
  // ---- end d11-motorway ----
  // ---- d11-rail-kralovec (places: research/95) ----
  // GAME EVENT on a real place (research/95 "A landslide"): the ČGS register of slope deformations, CGS0342191 (Libeč),
  // within 120 m of both lines (km 4.5–4.8).
  'kralovec-libec-slope': {
    id: 'kralovec-libec-slope', headline: 'A creeping slope at Libeč',
    story: 'The hillside at Libeč is a known slow landslide. No embankment or cutting on it: bridge it, with the piers founded deep.',
    ask: 'No cutting or embankment on the Libeč slope',
    cite: { text: 'A game event of a kind real projects meet, on a place in the ČGS register of slope deformations', url: 'https://mapy.geology.cz/arcgis/rest/services/Geohazardy/svahove_nestability/MapServer' },
    zone: { label: 'Libeč slope', forbid: SPAN, shape: { kind: 'polygon', pts: [[-629666, -999596], [-629605, -999621], [-629476, -999656], [-629280, -999669], [-629234, -999677], [-629210, -999685], [-629285, -999807], [-629287, -999806], [-629454, -999769], [-629656, -999697], [-629705, -999690], [-629730, -999683]] } },
  },
  // GAME EVENT on a real place (research/95 "A landslide"): the ČGS register of slope deformations, CGS0342157
  // (Bernartice, Křenov u Žacléře); the starter fills over it at km 9.7–9.8.
  'kralovec-krenov-slope': {
    id: 'kralovec-krenov-slope', headline: 'Another creeping slope',
    story: 'Below Křenov the survey found a slow landslide. No embankment or cutting on it: bridge it, with the piers founded deep.',
    ask: 'No cutting or embankment on the Křenov slope',
    cite: { text: 'A game event of a kind real projects meet, on a place in the ČGS register of slope deformations', url: 'https://mapy.geology.cz/arcgis/rest/services/Geohazardy/svahove_nestability/MapServer' },
    zone: { label: 'Křenov slope', forbid: SPAN, shape: { kind: 'polygon', pts: [[-626813, -995333], [-626799, -995340], [-626794, -995348], [-626787, -995379], [-626778, -995390], [-626770, -995394], [-626695, -995402], [-626647, -995389], [-626613, -995372], [-626582, -995368], [-626556, -995376], [-626547, -995392], [-626548, -995408], [-626556, -995426], [-626567, -995435], [-626579, -995441], [-626619, -995452], [-626684, -995449], [-626783, -995421], [-626799, -995425], [-626822, -995441], [-626835, -995443], [-626845, -995438], [-626852, -995430], [-626856, -995418], [-626852, -995380], [-626836, -995347], [-626822, -995333]] } },
  },
  // GAME EVENT (research/95 "Archaeology"; the real find: research/94 střítež-war-graves): open field near Bernartice
  // where the reference cuts 7 m (km 10.9), a 60 m circle.
  'kralovec-graves': {
    id: 'kralovec-graves', headline: 'Soldiers’ graves by Bernartice',
    story: 'Archaeologists found graves of soldiers from the war of 1866 in the field by Bernartice. They are to stay where they lie, under the railway.',
    ask: 'No cutting into the graves',
    cite: { text: 'A game event of a kind real projects meet (heritage act 20/1987); such graves were really found on the D11 near Střítež in 2025' },
    zone: { label: 'Soldiers’ graves', forbid: NO_CUT, shape: { kind: 'circle', x: -626129, y: -994452, r: 60 } },
  },
  // GAME EVENT (research/95 "A nest"): the forest edge at km 6.6, between the starter and the reference, a 55 m circle.
  'kralovec-nest': {
    id: 'kralovec-nest', headline: 'An eagle owl nests here',
    story: 'An eagle owl nests at the edge of the wood above Zlatá Olešnice. The nature office wants the works kept away from it.',
    ask: 'Keep out of the nest’s quiet zone',
    cite: { text: 'A game event of a kind real projects meet (nature act 114/1992)' },
    zone: { label: 'Owl’s nest', forbid: KEEP_OUT, shape: { kind: 'circle', x: -628386, y: -998082, r: 55 } },
  },
  // GAME EVENT (research/95 "Money"): the cap is the game's, 88 % of the starting bill (the goal is 90 %); it comes last.
  'kralovec-money': {
    id: 'kralovec-money', headline: 'Less money for roads',
    story: 'The state road fund has less money next year. The railway must cost less to keep its place.',
    ask: 'Keep the bill under 88 % of the planned line’s',
    cite: { text: 'A game event of a kind real projects meet (the state road fund is set year by year)' },
    budget: 0.88,
  },
  // ---- end d11-rail-kralovec ----
  // ---- i46-sternberk-road (places: research/95) ----
  // GAME EVENT (research/95 "A village's demand"): the stretch past the houses above Jívavská street, km 2.65–3.05 of the
  // reference with every other news, 40 m either side; the reference runs at the ground there, the starter just under it.
  'sternberk-quiet': {
    id: 'sternberk-quiet', headline: 'The town asks for quiet',
    story: 'Šternberk asks for the bypass to pass the houses above Jívavská in a cutting, out of sight and quieter.',
    ask: 'Keep the road in a cutting past the houses',
    cite: { text: 'A game event of a kind real projects meet (the planning hearing: towns ask for a lower line)' },
    zone: { label: 'Past the houses', forbid: LOW, shape: { kind: 'polygon', pts: [[-542108, -1108048], [-542097, -1107956], [-542079, -1107893], [-542064, -1107859], [-542032, -1107804], [-542009, -1107775], [-541962, -1107730], [-541936, -1107708], [-541880, -1107676], [-541844, -1107748], [-541890, -1107774], [-541931, -1107810], [-541950, -1107829], [-541980, -1107872], [-542003, -1107919], [-542019, -1107972], [-542028, -1108056]] } },
  },
  // ---- end i46-sternberk-road ----
  // ---- d35-full-motorway (places: research/95) ----
  // GAME EVENT (research/95 "Archaeology"; the rescue survey of the second section is real: research/93
  // sm-m-rescue-survey, no find published): open field near Řepová where the starter cuts 6–9 m (km 27.2), a 70 m circle.
  'd35-repova-graves': {
    id: 'd35-repova-graves', headline: 'Graves under the field',
    story: 'The archaeologists surveying the route found an old burial ground in the field by Řepová. It is to stay where it lies, under the road.',
    ask: 'No cutting into the burial ground',
    cite: { text: 'A game event of a kind real projects meet (heritage act 20/1987) and the real rescue survey along the route since 2025' },
    zone: { label: 'Burial ground', forbid: NO_CUT, shape: { kind: 'circle', x: -573099, y: -1094934, r: 70 } },
  },
  // GAME EVENT (research/95 "A nest"): the wood the starter crosses at km 22.3–22.4, a 55 m circle 25 m off the line.
  'd35-javori-nest': {
    id: 'd35-javori-nest', headline: 'A black stork nests here',
    story: 'A pair of black storks nests in the wood by Javoří. The nature office wants the works kept away from the nest.',
    ask: 'Keep out of the nest’s quiet zone',
    cite: { text: 'A game event of a kind real projects meet (nature act 114/1992)' },
    zone: { label: 'Stork’s nest', forbid: KEEP_OUT, shape: { kind: 'circle', x: -577739, y: -1093975, r: 55 } },
  },
  // GAME EVENT (research/95 "A village's demand"): the starter's stretch nearest Podolí, km 31.54–31.72, 40 m either side.
  'd35-podoli-quiet': {
    id: 'd35-podoli-quiet', headline: 'Podolí asks for quiet',
    story: 'Podolí asks for the motorway to pass the village in a cutting, out of sight and quieter.',
    ask: 'Keep the road in a cutting past Podolí',
    cite: { text: 'A game event of a kind real projects meet (the EIA hearing: villages ask for a lower line)' },
    zone: { label: 'Past Podolí', forbid: LOW, shape: { kind: 'polygon', pts: [[-570428, -1098054], [-570321, -1098196], [-570385, -1098244], [-570494, -1098100]] } },
  },
  // GAME EVENT (research/95 "Money"): the cap is the game's, 88 % of the starting bill (the goal is 90 %); it comes last.
  'd35-full-money': {
    id: 'd35-full-money', headline: 'Less money for roads',
    story: 'The state road fund has less money next year. The motorway to Mohelnice must cost less to keep its place.',
    ask: 'Keep the bill under 88 % of the planned line’s',
    cite: { text: 'A game event of a kind real projects meet (the state road fund is set year by year)' },
    budget: 0.88,
  },
  // ---- end d35-full-motorway ----
  // ---- d3-full-motorway (places: research/95) ----
  // ---- end d3-full-motorway ----
};
