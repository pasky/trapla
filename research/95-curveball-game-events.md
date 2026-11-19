# 95 — Curveballs beyond the documented events: game events of kinds real projects meet, and where they go

Research note, 2026-11-20 (twists round 3). Rounds 1–2 (research/91–94) looked for **documented** events on each mission's
line and found few that can be located: the Šternberk villa, the butterflies and the Aleš stream (research/91), the
D3 0302 Luka tunnel and the 0303 side-valley bridge (ŘSD leaflets, research/92), the D35 Pod skálou protection zone (EIA
MZP136, research/93), the D11 contract (research/94). Every mission is to get 5–10 curveballs, so the rest are **game
events**: things of a kind that real Czech road and railway projects meet, placed where the map makes them plausible. The
game says so: their source line on the news card reads "A game event of a kind real projects meet", names the law or the
practice the kind comes from, and, where the place itself is real (a register's polygon), names the register and links it.
No game event cites an article; none claims that it happened.

Each curveball is one of the zone rules the twists already check (`src/core/twists.ts` `zoneRuns`): KEEP_OUT (nothing of
ours on the ground or over it; a mined tunnel deep under is fine), NO_CUT (no open cut), NO_PIERS (no earthworks and no
pier; a deck may pass over), SPAN (no cut or fill: a bridge over it or a mined tunnel under it), and one new list, LOW
(neither an embankment nor a bridge: the road in a cutting). Or a cap on the bill (a share of the starting bill). The places
are in EPSG:5514 in `src/core/data/curveballs.ts`, with a comment per curveball saying how it was placed; how each was
derived is reproducible from the pack (lines, land cover, ways, buildings) and the registers below.

## The kinds, their sources and their game rule

### Archaeology (rule NO_CUT: the find stays where it lies, under an embankment or a bridge)
- **Kind:** the Heritage Act 20/1987 §22(2): "Má-li se provádět stavební činnost na území s archeologickými nálezy, jsou
  stavebníci již od doby přípravy stavby povinni tento záměr oznámit Archeologickému ústavu a umožnit … provést na
  dotčeném území záchranný archeologický výzkum" (a builder in an area with finds must notify the Archaeological Institute
  from the preparation on and allow a rescue dig) — [zakonyprolidi.cz](https://www.zakonyprolidi.cz/cs/1987-20). The Valletta
  convention (Council of Europe treaty 143, 1992; ratified by the Czech Republic) art. 4(ii): "for the conservation and
  maintenance of the archaeological heritage, preferably in situ", art. 5(iv): "to make provision, when elements of the
  archaeological heritage have been found during development work, for their conservation in situ when feasible" —
  [rm.coe.int/168007bd25](https://rm.coe.int/168007bd25). Real finds on these corridors: the D11 war graves between Studenec
  and Střítež (12/2025, research/94, off our map), the D35 rescue surveys over the whole footprint (10/2024, 2/2025,
  research/93, no find published).
- **Game rule:** a find kept in place: no cutting into it (an embankment over it or a bridge). PROVISIONAL as a rule: real
  finds are mostly dug and recorded, then built over; keeping one in place is the exception the convention prefers.
- **Placement:** open land (pack land cover "none") within 1.5 km of a village where the starter and the reference both cut
  1.5–9 m, a 60–70 m circle between the two lines (so a design like either breaks it, and raising the line there meets it).

### A nest (rule KEEP_OUT: a quiet zone round the nest)
- **Kind:** the Nature Act 114/1992 §50 (specially protected animals: their nests and their disturbance are protected;
  an exemption under §56 is needed) — [zakonyprolidi.cz](https://www.zakonyprolidi.cz/cs/1992-114); the black stork
  (*Ciconia nigra*) and the eagle owl (*Bubo bubo*) are in its decree 395/1992 annex III —
  [zakonyprolidi.cz](https://www.zakonyprolidi.cz/cs/1992-395). Šternberk's real butterflies (research/91) are the same kind.
- **Game rule:** keep out of a 50–60 m circle (a game scale: real quiet zones round a stork's nest in the breeding season are
  larger, and are about time as much as place).
- **Placement:** a forest edge both lines cross, the circle between them.

### A gas main (rule SPAN: no cutting or embankment over it, i.e. bridge it)
- **Kind:** the Energy Act 458/2000 §68(3): a gas main's protection zone, "u plynovodů nad 40 bar 4 m na obě strany"
  (4 m either side of a main over 40 bar), works in it need the operator's consent —
  [zakonyprolidi.cz](https://www.zakonyprolidi.cz/cs/2000-458). Mains often run beside roads.
- **Game rule:** the operator will not have it buried deeper or loaded with an embankment: our line bridges it. PROVISIONAL
  (real crossings mostly put the main in a sleeve under the earthworks, or move it; a bridge is the game's one way).
- **Placement:** along a road of the pack's ways that the reference crosses, 150–160 m either side of the crossing, 10 m either
  side of the road.

### A newly listed building (rule KEEP_OUT)
- **Kind:** the Heritage Act 20/1987 §3 (the Ministry of Culture declares a cultural monument; from the notice of the
  proceedings the owner must protect it) — [zakonyprolidi.cz](https://www.zakonyprolidi.cz/cs/1987-20); the real case on our
  missions: the Šternberk villa, listed 2025 with its garden (research/91).
- **Placement:** farm buildings of the pack within 20–40 m of the starter's or the reference's works, a 35–40 m circle.

### Undermined ground and old mine workings (rules NO_CUT, KEEP_OUT) — real places
- **Kind:** builders on undermined ground design for it (ČSN 73 0039, designing structures on undermined ground; no URL);
  old shafts are sealed and kept clear. The places are **real**: the Czech Geological Survey's registers of undermined areas
  ([poddolovaná území](https://mapy.geology.cz/arcgis/rest/services/Dulni_Dila/poddolovana_uzemi/MapServer), layer 1) and of
  mine workings ([důlní díla](https://mapy.geology.cz/arcgis/rest/services/Dulni_Dila/dulni_dila/MapServer), layer 0), queried
  within 400 m of every mission's starter and reference (EPSG:5514, 2026-11-20). The event (the survey finding them, the rule)
  is the game's.
- **Used:** D3 0301 "Petrov u Prahy-Ostřetina" (gold ore, located exactly, a system of workings; both lines cut into it at
  km 8.1–8.4: NO_CUT, the polygon within 150 m of the lines); D3 0305 "Divišovice" (radioactive ores, after 1945, a system
  of workings, DIAMO's shafts nearby; both lines at km 7.1–7.4: NO_CUT, spoil from it would need a special tip); D11
  "šachtice Starý Rokytník" (an old shaft, notice 2919; both lines within 40 m at km 0.75: KEEP_OUT 40 m).
- **Not used:** the Jílové gold district and the shafts on Panský vrch by D3 0302 (dozens of registered workings round the
  Luka tunnel's hill; a keep-out of them forced a tunnel too long for the goal), the D35 coal workings at Mladějov (the
  lines pass in the deep tunnel), Královec black-coal area at the D11's end (4.5 km², the line's end is fixed in it).

### A landslide (rules SPAN where the line would fill over it, NO_CUT where it would cut into its foot) — mostly real places
- **Kind:** the real precedent is the D8 at Dobkovičky (the 2013 landslide that delayed the motorway's opening by years,
  [cs.wikipedia.org/wiki/Dálnice_D8](https://cs.wikipedia.org/wiki/D%C3%A1lnice_D8)); designs keep embankments off a slide or
  bridge it on deep piers, and do not cut its foot. The places are **real** where they come from the ČGS register of slope
  deformations ([svahové nestability](https://mapy.geology.cz/arcgis/rest/services/Geohazardy/svahove_nestability/MapServer),
  layer 1, polygons); the event is the game's.
- **Used:** D35 CGS1434151 (Radišov; both lines cut 6 m: NO_CUT, 15 m round it); D11 CGS0342252 (Poříčí u Trutnova; both lines
  fill 11–36 m over it: SPAN, 10 m round it) and CGS03422016 (Zlatá Olešnice; both cut up to 5 m: NO_CUT); Královec
  CGS0342191 (Libeč, SPAN, within 120 m of the lines) and CGS0342157 (Křenov, SPAN; the starter fills over it). One game place
  without a register entry: D3 0302, the steep (1:3) wooded north side of the Sázava valley the reference fills (SPAN).
- **Not used:** Šternberk CGS1444251 (neither line's works reach it), D35 CGS1434142a (the deep tunnel passes under), Královec
  CGS0342156 (the reference bridges it already).

### A village's demand (rule LOW: the road in a cutting past it)
- **Kind:** the EIA Act 100/2001 (the public hearing; the villages' comments go into the conditions) —
  [zakonyprolidi.cz](https://www.zakonyprolidi.cz/cs/2001-100); lowering the line past a village ("zahloubení") and earth
  banks are what villages ask for; the D3 0302 design has banks up to 10 m high and noise walls for that (research/92, the
  leaflet).
- **Placement:** the stretch of the reference nearest a village within 700 m where it runs on a low embankment (0.3–5 m),
  40 m either side, 200–500 m long.

### Less money (a cap on the bill)
- **Kind:** the State Transport Infrastructure Fund's budget is set year by year; a project not in it waits (the real case:
  Šternberk left out of the 2026 budget, research/91). The cap is the game's: 85–88 % of the starting bill (the goal is 90 %),
  the last curveball of each mission.

### Kinds looked at and not placed
- **A spring or a water source's protection zone** (the Water Act 254/2001 §30, zones I and II —
  [zakonyprolidi.cz](https://www.zakonyprolidi.cz/cs/2001-254)): no water source was located near a line (the D35 Pod skálou
  drinking spring of the EIA is not located, research/93); a zone invented by a stream would imply a real well.
- **Memorial trees** (the AOPK register, real polygons of declared protection zones): within 400 m of the lines, none closer
  than the works' edge (the nearest, "Hrušeň u Věnce" by D3 0302, 21 m off the reference's centre line, outside its slopes).
- **High-voltage lines:** the packs hold no power lines.

## Real data queried (2026-11-20)
ČGS ([mapy.geology.cz](https://mapy.geology.cz/arcgis/rest/services)): Geohazardy/svahove_nestability (0 points, 1 polygons),
Geohazardy/sesuvy_Geofond, Dulni_Dila/poddolovana_uzemi (1), Dulni_Dila/dulni_dila (0). AOPK
([gis.nature.cz](https://gis.nature.cz/arcgis/rest/services)): Aplikace/Opendata 3 (protection zones of small protected
areas: PP Pod skálou's polygon for the D35 curveball), 18, 20 (ÚSES), 29 (memorial trees' zones),
AplikovanaOchrana/MigraceSavci, MigracneVyznamneToky, Ekodukty. Queried by envelope round each mission's starter and
reference (`scripts/twists-check.ts --survey`), kept within 400 m.

## Per mission (what each asks, real or game)
| mission | curveballs, in the order they arrive |
|---|---|
| Šternberk | villa (real), butterflies (real event, game place), Aleš stream (real design), the houses above Jívavská (game, LOW), money (real event, game cap) |
| D3 0301 | graves by Libeř (game), gas main (game), listed farmstead (game), stork's nest (game), Ostřetina gold pits (real place), money (game) |
| D3 0302 | Luka crest (real design: its crest only), creeping Sázava valley side (game), Rakousy in a cutting (game), eagle owl (game), money (game) |
| D3 0303 | side-valley bridge (real design, km 15.5 of the leaflet), settlement by Dunávice (game), Dunávice in a cutting (game), gas main (game), eagle owl (game), money (game) |
| D3 0304 | burial ground by Maršovice (game), listed farm at Strnadice (game), Šebáňovice in a cutting (game), gas main (game), stork's nest (game), money (game) |
| D3 0305 | Divišovice uranium workings (real place), burial ground by Dědkov (game), stork's nest (game), Styrov in a cutting (game), money (game) |
| whole D3 | seven of the sections' (0301 graves and gold pits, 0302 Luka and the valley side, 0303 valley, 0304 graves, 0305 uranium), money |
| D35 stage 1 | Pod skálou protection zone (real EIA condition), Radišov slope (real place), settlement by Radišov (game; the rescue survey is real), Dětřichov in a cutting (game), stork's nest (game), money (game) |
| whole D35 | stage 1's four, and on the second section a burial ground by Řepová, a stork's nest by Javoří, Podolí in a cutting (game), money |
| D11 motorway | Starý Rokytník shaft (real place), Poříčí slope (real place), Zlatá Olešnice slope (real place), soldiers' graves by Lampertice (game; the kind is real on the D11), stork's nest (game), the contract (real event, game cap) |
| Královec railway | Libeč slope (real place), Křenov slope (real place), soldiers' graves by Bernartice (game), eagle owl (game), money (game) |
