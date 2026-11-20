# 102 — Listed monuments and their protection zones: the official data behind "Hands off the castle"

Research note, 2026-11-20 (twists round 4). Until now the twist kept rings round named OpenStreetMap castles, churches,
chapels, monuments and viewpoints (`pipeline/build_landmarks.py`, 479 points). The owner: "Hands off the castle rarely does
anything, since the areas are very far from any plausible route." The twist now reads the state's own register.

## The law: what a protection zone is
- **Act 20/1987 Sb. on state heritage care** ([zakonyprolidi.cz/cs/1987-20](https://www.zakonyprolidi.cz/cs/1987-20)):
  - §5 a **heritage reserve** (památková rezervace: "Území, jehož charakter a prostředí určuje soubor nemovitých kulturních
    památek … může vláda … nařízením prohlásit jako celek za památkovou rezervaci"), declared by government decree;
  - §6 a **heritage zone** (památková zóna: "Území sídelního útvaru nebo jeho části s menším podílem kulturních památek,
    historické prostředí nebo část krajinného celku …"), declared by the Ministry of Culture;
  - §17 a **protection zone** (ochranné pásmo: "Vyžaduje-li to ochrana nemovité kulturní památky, … památkové rezervace,
    památkové zóny nebo jejich prostředí, vydá obecní úřad obce s rozšířenou působností … opatření obecné povahy o
    ochranném pásmu. V ochranném pásmu může … omezit nebo zakázat určitou činnost"), declared one by one by the
    municipality with extended powers;
  - §14(2): in a reserve, a zone or a protection zone, anyone building ("k zamýšlené stavbě, změně stavby, terénní úpravě …")
    needs the heritage authority's binding opinion first;
  - §7(1): all of them, and every listed monument, are entered in the **Central List of Cultural Monuments** (Ústřední
    seznam kulturních památek, ÚSKP), kept by the Národní památkový ústav (NPÚ).
- So there is no default distance round a monument: where its setting matters a zone is declared with its own boundary,
  and elsewhere only the monument itself is protected. A road through a protection zone is not forbidden; it needs the
  authority's consent, which is the twist's game: keep out of them entirely.

## The data
- **Geometry** (fetched 2026-11-20, `pipeline/fetch_heritage.py`): NPÚ's geoportal, ArcGIS feature services in
  EPSG:5514, queried by each pack's box:
  - `https://geoportal.npu.cz/arcgis/rest/services/Hosted/pchu/FeatureServer/0` — the heritage areas as polygons
    (`typochranykod` OP / PR / PZ, `upresnenitypuochrany` MPR, VPR, MPZ, VPZ…, `rejstrikovecislouskp`, `nazev`, `urlext` the
    catalogue page, `priznakplatny` P = in force, `verejny`);
  - `…/Hosted/kp/FeatureServer/10` (kulturní památka) and `/11` (národní kulturní památka) — every listed monument as a
    point (`nazevprvku` its name, `obec`, `fazeochranykod` P = protected or R = protected with its extent revised,
    "památkově chráněno, rozsah revidován": both kept; `rejstrikovecislouskp`). A monument listed both as national and as
    ordinary (same name and place) is one landmark.
- **Names** of areas the geoportal leaves unnamed: the open data lists `https://www.pamatkovykatalog.cz/opendata/npu_opendata_{OP,PR,PZ}.csv`
  (open data date 31 Oct 2026), by ÚSKP number.
- **Licence**: the National Open Data Catalogue's record of the protection zones dataset
  ([data.gov.cz](https://data.gov.cz/dataset?iri=https%3A%2F%2Fdata.gov.cz%2Fzdroj%2Fdatov%C3%A9-sady%2F75032333%2F1320884679))
  gives its distribution's terms of use: an author's work under **CC BY 4.0**, not a database protected by copyright nor by
  the maker's special right; the CSVW schema of the list says `"dc:license": "https://creativecommons.org/licenses/by/4.0/legalcode"`.
  The credit "© NPÚ" is on the map's credits line and the About page (docs/deploy.md "Licences").
- **Per pack** (`pipeline/build_heritage.py` → `public/scenarios/<pack>/heritage.json`, 4–74 kB): the areas reaching into
  the play area (clipped, simplified to 1 m, in the pack's metres; the service returns some parts twice: dropped) with an
  English name (a table of the protection zones near the missions, e.g. 3065 "Ochranné pásmo státního hradu Trosky" →
  "Trosky castle protection zone"; reserves and zones "<place> town reserve / village heritage zone"), and the listed
  monuments of the kinds a road is planned round, by the first word of their name: castles and chateaux (hrad, zámek,
  zřícenina, letohrádek), forts and hillforts (tvrz, tvrziště, hradiště, opevnění, archaeological sites), churches
  (kostel, klášter, synagoga, sbor), chapels and bell towers (kaple, kaplička, zvonice, boží muka, křížová cesta), crosses
  and statues (kříž, krucifix, socha, sousoší, sloup, milník, hraniční kámen, rozcestník), memorials and graves (pomník,
  památník, hrob, hřbitov, pohřebiště), technical monuments (most, mlýn, důl, štola, vápenka, rozhledna). Houses,
  farmsteads, town halls, schools, vicarages, granaries, fountains and the like are left out: a road is not planned
  through a village. A monument inside a zone is left out too: the zone covers it.
- Counts (2026-11-20): D11 4 areas / 124 monuments; the D3 sections 1–4 / 10–67, the whole D3 6 / 132; D35 stage 1 none /
  35, the whole D35 7 / 103; the I/35 stages 2–12 / 39–54, the whole I/35 22 / 210; Šternberk 2 / 6 (the town's heritage
  zone and the castle's protection zone cover the rest).

## The game rule
- Nothing of ours (cutting, embankment, bridge, tunnel dug from the surface) **in a heritage area**, nor **within a ring
  round a listed monument outside one**: castle 400 m, fort or hillfort 200 m, church 200 m, chapel, memorial or technical
  monument 100 m, cross or statue 50 m (game scales: a castle's setting is its hill, a church's the green round it, a
  cross's its verge). A mined tunnel deep under one is fine (as a curveball's keep-out). The areas are the register's; the
  rings are the game's.
- **Which count for a mission**: those within 1.5 km of the starting line or of the straight line A–B (as before), except
  one that takes in an end of the mission or comes within 50 m of it (the ends are the mission's: no design can keep clear
  of them; the Královec railway's start by the listed road bridge at Trutnov station).
- **Offered only where it bites**: the starter (the planned line) breaks it, and a reference design meets it with the other
  default twists under the goal (`scripts/twists-check.ts`).

## Where it bites (the starters against the register)
| mission | the starter breaks | offered |
|---|---|---|
| D3 0304 | within 400 m of the ruin of Stejc castle (Maršovice) | yes (the round-3 references keep clear) |
| whole D3 | the same | yes |
| whole D35 | within 50 m of the Holy Trinity column at Mohelnice | yes (round 3's reference keeps clear) |
| D11 motorway | within 100 m of the memorial to the Austrian gunners of 1866 (Trutnov) | yes |
| I/35 Jičín | through the Studeňany village protection zone (declared 13 Aug 1997, its polygon updated 26 Jun 2026; ÚSKP 3260, 712 ha of the village's setting) | yes: round 3's line led north and east round it by hand |
| I/35 Turnov | within 200 m of the church of St John the Baptist (Turnov) | see below |
| whole I/35 | both of the stages' | see below |
| Šternberk, D3 0301–0303, 0305, D35 stage 1, I/35 Rovensko | nothing: the planned lines keep clear of every listed monument and zone | no |
| Královec railway | only the listed road bridge at Trutnov station, at its fixed start (left out) | no |

There the planned line already keeps clear of every listed monument and heritage area near it, so the twist would ask
nothing of it: it is not offered.

## The I/35 references (round 4: a full set of twists)
- **Turnov, the church of St John the Baptist** (Kostel sv. Jana Křtitele, a listed monument outside Turnov's heritage
  zone): the planned line passes 40–100 m from it at km 1.5–1.8, in a shallow cut on the valley floor west of the town.
  Round 3's searches never got 200 m off it. Here: south of it lie the railway yard and the town, north of it a factory
  inside its ring; a mined tunnel under it is out of reach (the valley floor gives no 14 m of cover; a 1.6 km tunnel painted
  under the church, the yard and Nudvojovice prices at 11.6 bn, the goal is 5.07). By hand (`twists-check.ts --edit`):
  the first two bends moved 254 m north-east, round the ring and the factory's north side (5.56 bn, industrial buildings
  bought out, invalid at a railway), then searched (seeds 2 → 3 → 8): **4.77 bn, VALID, every curveball met, earth balanced 4 %**.
- **Jičín, the Studeňany village protection zone** (ÚSKP 3260, declared 13 Aug 1997, its polygon updated 26 Jun 2026; 712 ha round the Studeňany village
  heritage zone): the planned line runs through its north-east part for 1.9 km (km 11.4–13.3; a cut). Round 3's reference
  moved north and east of it by hand (its last two bends; 4.55 bn), then searched: **4.14 bn**. It passes by Radim on the
  zone's north-east corner and buys out homes there: the price of keeping out of the zone.
- **The whole I/35**: round 3's whole-route reference with the two stages' new lines stitched in (`twists-stitch.ts --base`,
  new: keep a whole-route design outside the sections) and searched (seeds 9 → 10 → 13): **13.31 bn, under the money news
  (13.34 bn) and the goal (13.64 bn)**.
- **Nobody moves**: Jičín (a search from the starter: 3.51 bn, none bought out). Not on Turnov nor the whole route: six
  searches from the starter and from the references (≈ 3,500 designs) leave two homes, one by the Jizera at Ohrazenice on
  the bend that turns the line off the D10 interchange (demolished; moving the bend 20–30 m away takes others further on),
  one at km 3.7 beside the Jizera crossing (bought out); the planned line takes 12.
- **Spare the forest / Few bridges**: caps just above what a reference reaches under the goal: Turnov 0.6 ha (0.54) and
  700 m (690), Rovensko 5 ha (4.9) and 350 m (320), Jičín 0.8 ha (0.74) and 250 m (220), the whole route 8 ha (7.7) and
  1,600 m (1,580); the starters take 1.4 / 6.6 / 1.5 / 9.5 ha and 1,420 / 530 / 980 / 2,760 m. The whole route's are its own
  searches' (the stages' stitched lose their caps at the seams; ≈ 10 s a design on the whole route, so fewer were tried).
