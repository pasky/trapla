# Deep cuts and rock slopes on D3 0302 (playtest sweep 3, P1 #3; cost model 40)

Snapshot 2026-11-17 (qa3-realism-fixes agent). QA: on the D3 0302 starter Auto built "Cut km 0.73–2.29 · 1,558 m · up
to 62 m deep · 2.39 bn · Auto: at this depth cheaper than a tunnel" where the real section has the 1,843 m Luka tunnel,
and 41 / 47 m high fills at the Sázava bridge ends (those: research/68). Owner's decision (via the parent, 2026-11-17):
the designers' documented practice as a sourced game rule, the player may still paint a deep cut, the tunnel card
shows the open cut's price; presplit and rock slopes by what the geology says.

## Decisions and what is implemented

1. **Auto builds no road or motorway cut deeper than 30 m: a tunnel** (`STRUCTURE_RULES.deepCut`, structures.ts
   `deepCut`, the grade search prices an open line deeper than 29 m — the search's margin, as for a clearance — as
   unavailable). Sources ("Research: the deep cut" §1–§3 below): the D3 EIA 2010 (printed p. 23: "zářezy v kratších úsecích hloubky 20-30 m,
   zde jsou však navrženy tunely"; every 0302–0303 tunnel's first purpose "náhrada hlubokého zářezu"), Hessen Mobil
   Heft 52 §4.1.1 ("Die wirtschaftliche Grenze für eine Einschnittslösung liegt erfahrungsgemäß bei ca. 30 m Tiefe"),
   the deepest Czech motorway cut 38 m (D1 Lensedelský zářez). 30 m is the upper end of the D3 range. Not railways (no
   railway source). The player may paint a deeper cut (Earthwork): no problem is raised. The tunnel card says "Auto: a
   cut here would be up to 62 m deep; designers tunnel where a cut would be deeper than 30 m." and its Earthwork
   button carries the open cut's price against the tunnel (the structure choice's prices on this grade line).
   A cut just past 30 m over a ridge narrower than the grade search's 20 m samples (it could not see it) is lifted,
   not tunnelled (town-centre km 3.40: one station at 30.4 m had made a 430 m tunnel, +680 M).
2. **Presplit on the steep rock faces**: OTSKP 12892 2,360.50 CZK per m² of final face (class III), TKP 4 (2026)
   art. 52 ("vhodné zvážit a eventuálně použít technologii řízeného výlomu"), on every face steeper than 2:1 (the
   net, OTSKP 289941, as before). Faces of 2:1 and flatter are dug, not blasted to a face, and not netted (Derived).
3. **Rock by its kind** (`SIDE_SLOPES.rockByGround`): Permian siltstone / claystone (`perm_fine`) and Cretaceous
   marlstone (`marl`) are cut like soil (VL 2 1995 sheet 301.04 note 2, verbatim in "Research: rock slopes" §1.1; M Fels; BAW 2017; D35 / D11
   1108 projects: medium / medium-high); interbedded claystone sequences (`carb_mixed`) and phyllites at 5:4 faces
   (Brandecker group D, medium); Cretaceous sandstone at 2:1 (group C, medium). Left at 4:1: the Permian and
   Carboniferous sandstones and conglomerates (group B/C, low-medium evidence for a change), tuff (low-medium),
   gneiss, quartzite, limestone, igneous rock. **Not modelled:** fault zones (the Luka DÚR cut in the faulted
   Jílové belt at 1:1.25); our ground grid says `igneous` there (sound rock by kind).
4. **Not done:** wider berms (2–3 m) in cuts over 15 m (German; the Czech VL keep ≥ 1 m and the Luka DÚR 1.5 m);
   spoil tipping beyond the existing surplus haul; land / forest / wildlife-corridor costs of a deep cut (the
   non-monetary reasons the EIA gives). The 30 m rule stands for those.

## What it does (model 38 → 40, together with research/68's cones)

**D3 0302 starter**: 4,935 → 7,028 M CZK, VALID (7,045 after the review fixes of research/68 §4.5). Auto's line now rides higher: the cut at Luka is at most 27 m deep
(km 1.6–1.9), and the Sázava is crossed by one 1,678 m bridge (km 2.04–3.72, long spans, deck up to ≈ 145 m over the
river) instead of a 419 m bridge between 40 / 47 m fills. The real section (ŘSD leaflet: 10.54 bn) has the 1,843 m Luka
tunnel and a 787 m bridge 113 m high: its line is ≈ 30 m lower, because the town of Jílové asked for the line to be
covered ("Research: the deep cut" §1.2) — a preference the game does not price. With the player's tunnel over km 0.7–2.3 (QA: +4.8 bn on model
38) the gap remains the player's choice.

Frozen D11 fixtures (each mechanism's share measured as it was added; the rest is research/68):

| design | model 38 | rock slopes + presplit | + deep-cut rule | final (with cones) |
|---|---:|---:|---:|---:|
| straight | 8,224.7 | 8,527 | 8,726 | 8,859.7 |
| best | 3,618.5 | 3,645 | 3,645 | 3,650.9 |
| demo | 4,233.6 | 4,149 | 4,158 | 4,282.9 |
| direct-80 | 4,144.7 | 4,181 | 4,181 | 4,265.4 |
| direct-90 | 4,676.4 | 5,092 | 5,283 | 5,444.2 |
| town-centre | 8,972.7 | 9,150 | 9,140 | 9,420.4 |

direct-90's +415 M from the slopes: its deep cuts stand in Carboniferous interbeds and Permian claystones, now at
5:4 / soil slopes (wider, more excavation, more land).

## Research: the deep cut (research pass, sources)


Research snapshot 2026-11-17. CZK excl. VAT. Labels: **Sourced** = the cited document states it (quoted, page given);
**Derived** = my arithmetic on sourced values (shown); **UNVERIFIED** = not found / my assumption.
PDF page = PDF page index; "printed p." = number printed on the page. Local copies of everything read are in
`/tmp/q3/src/` (EIA zips, ZZŘ, oznámení 7z, OTSKP 2026 workbook, theses).

Not repeated here: portal cover / pre-cut depths (research/49), VL 1 slope sheets, II/157 4:1, OTSKP nets/bolts
(research/48), high fills, Ostopovice 32 m (research/52), Luka exploratory gallery 408 M (research/51), SPK tunnel rates (research/64).

## Findings at a glance

1. **The D3 designers wrote down the rule:** where the grade line leaves cuts of 20–30 m, they put a tunnel there.
   The 2010 D3 EIA says: *„Přes toto řešení dosahují zářezy v kratších úsecích hloubky 20-30 m, zde jsou však
   navrženy tunely (ražené či hloubené)"* ("even so, cuts reach 20–30 m in short stretches; tunnels, mined or
   cut-and-cover, are designed there instead"). Its tunnel table gives the purpose of almost every D3 tunnel as
   *„náhrada hlubokého zářezu"* ("replacing a deep cut"). For Luka the table adds field-road crossings, forest
   protection and a migration corridor. **Sourced**, high confidence.
2. **The tunnel was then lengthened from 1,200 to 1,845 m at the town's request.** The line was lowered up to
   10 m, and the extra tunnel replaced the north pre-portal cut: *„Prodloužení je z hlavní části na úkor
   předportálového zářezu"* ("most of the extension replaces the pre-portal cut"). The reason given is *„zakrytí
   trasy D3 … byl požadavek města Jílové u Prahy"* ("covering the D3 line … was a demand of the town of Jílové u
   Prahy"), near Horní Studené and the holiday homes at km 10.2. ŘSD's answer to objections:
   *„prodloužením tunelu Luka na úkor předzářezu dojde k úspoře výkopku"* ("lengthening the Luka tunnel at the
   expense of the pre-cut saves excavation"). **Sourced.**
3. **German guidance gives a number:** *„Die wirtschaftliche Grenze für eine Einschnittslösung liegt
   erfahrungsgemäß bei ca. 30 m Tiefe"* ("experience puts the economic limit of a cut at about 30 m depth";
   Hessen Mobil 2006). The federal *Leitfaden „Einschnitt oder Tunnel"* (ARS 25/1998, still referenced in
   RE-ING 2025) is a weighted matrix (noise, nature, landscape, land, cost, operations), not a depth cap.
   **Sourced.**
4. **The rock at Luka is not "sound rock".** Two documents describe it:
   - The EIA (2010) calls the Jílové belt (metabasalt, gabbro, tuff, rhyodacite) *„často silně rozpukané a
     provrásněné"* ("often strongly fractured and folded"), with old gold workings.
   - Pragoprojekt's own DÚR geometry for the Luka south-portal cut (km 11.700) uses **1:1.25 (≈ 39°) lower faces
     and 1:1.75 above, with 1.5 m berms every 5 m**.

   The engine uses 4:1 (76°). The German design-slope table (Brandecker, via the Grundbau-Taschenbuch) gives an
   **overall 5:4 (51°) for weathered or moderately jointed rock** at 40 m, and asks for **2–3 m berms (≥ 4 m if
   maintenance vehicles drive on them) once a cut is deeper than 15 m**. **Sourced.**
5. **The Sázava bridge length is set by the valley, so no high fills are built.** The 787 m bridge lands in cuts
   on both banks (*„viditelná část předmostí velmi krátká"*, "the visible part of the approach is very short").
   It is sized by the 113 m height, the 180–260 m main span, the railway tunnel and protection of the EVL Dolní
   Sázava.

   The engine's 40–47 m fills exceed the highest Czech motorway fill (32 m). Its 62 m cut exceeds the deepest
   Czech motorway cut (Lensedelský zářez on D1, **38 m**, also in the Sázava valley). The engine's cut is
   effectively paid for by fills that a real designer would not build. **Sourced** (records); the reading is mine.
6. **Things a pure excavation price leaves out** (prices from the OTSKP 2026 workbook):
   - presplit blasting of the final face, **12892: 2,360.50 CZK/m²**, recommended by TKP 4 (2026) art. 52;
   - tipping surplus rock 12 km away, **964.07 + 21.17 CZK/m³ vs 653.27** in place;
   - a blasting project with seismic monitoring (TKP 4 art. 51);
   - groundwater drawdown (Sichardt reach 150 m in faulted zones beside the 6 m-deep Jílové cut);
   - land and forest take: a 62 m cut is 86–130 m wide (Derived).

   With these, the direct-cost crossover against a twin mined tube (SPK 2 × 1.49 M CZK/m) falls from **≈ 60 m to
   ≈ 40–50 m** (Derived, flat cross-section). The rest of the gap to "≈ 30 m" is non-monetary: covering the line
   for settlements and forest, migration, landscape, and the municipality.

---

## 1. D3 0302 specifics

### 1.1 Facts of the section

| Item | Value | Source | Conf. |
|---|---|---|---|
| Length / category | 4,386 m (leaflet 06/2026; older leaflets 4,486 m), D 27,5/120 | [ŘSD leaflet 06/2026](https://www.dalniced3.cz/public/files/documents/infoletak-d3-0302-jilove-hosteradice.pdf) p. 2–4 | Sourced |
| Estimated cost of the section | **10,543,106,328 CZK** | same leaflet p. 4, "Předpokládané náklady stavby" | Sourced |
| Tunnel | *„Tunel Luka délky 1843 m vznikl spojením hloubeného tunelu Bohuliby délky 200 m, mezitunelového povrchového úseku délky 100 m a raženého tunelu Luka délky 1260 m"* ("formed by joining the 200 m Bohuliby cut-and-cover tunnel, a 100 m open stretch between the tunnels and the 1,260 m mined Luka tunnel"); T 9,5/100. The parts add up to 1,560 m: these are the pre-2019 part lengths, kept in the text | leaflet p. 2 | Sourced (inconsistency noted) |
| Stationing | LTT km 9.846–11.725 (1,872 m), PTT 9.881–11.726 (1,852 m); **cover up to 63 m**; grade 3.0–3.3 % falling to Tábor | [Menger, ITA Tunelářské odpoledne 2/2017](https://www.ita-aites.cz/files/Seminare/2017/to-2_17/d3-menger-tunelove-stavby.pdf) slides 19, 41 | Sourced |
| Geology at tunnel level | *„jílovské pásmo - v úrovni tunelu je masiv budován metabazalty, gabrem a tufy, kterými pronikají v příčném směru rudní žíly, (při průzkumu bylo vrtem HJ 27 zjištěno poddolování)"* ("Jílové belt: at tunnel level the massif is metabasalt, gabbro and tuff, crossed by ore veins; borehole HJ 27 found old mine workings") | Menger 2017 slide 19 | Sourced |
| Faults and weathering along the tunnel | Quaternary cover 1–3 m. Thicker weathering at km 10.56, 11.30 and **11.73–11.80**. Faults at km 10.22, 10.32, 10.90–10.92, 11.08–11.13, 11.28–11.31, 11.43, 11.49, 11.68 and 11.73–11.80. Bedding dips 80°. *„Směrem k Sázavě rozpukanost roste"* ("jointing increases toward the Sázava") | [Josefík, ČVUT BP 2017](https://dspace.cvut.cz/server/api/core/bitstreams/1f4190c6-06d5-4dc9-a181-8da762a52ec8/content) PDF p. 18–19 (§3.2, citing the Pragoprojekt survey) | Sourced (thesis citing the DÚR survey) |
| Borehole J30, km 11.700 (cut) | 0–2.5 m sandy clay F4. 2.5–5.0 m fully weathered metabasalt R6/R5. 5.0–6.3 m R5/R4. 6.3–12 m Králodvorské shales **R3** | Josefík PDF p. 21, Tab. 1 | Sourced |
| RQD / rock-mass classes | not found in public documents (the detailed GTP is the 2026 exploratory gallery) | — | UNVERIFIED |
| Groundwater | *„hlubší části masivu, již pod hloubkou 40 m, jsou pro vodu téměř neprostupné"* ("parts of the massif below 40 m are almost impermeable"). Sichardt drawdown reach: Jílové cut (6 m drawdown) **150 m in faulted zones, 10 m elsewhere**; Luka tunnel (50 m drawdown) 250 m / 50 m | [Oznámení MZP491 (Pragoprojekt 11/2019)](https://portal.cenia.cz/eiasea/detail/EIA_MZP491?lang=cs), PDF p. 58 and Tab. 30 p. 115 | Sourced |
| Tunnel price alone | not published. Derived from SPK (research/64): 1,843 m × 2 tubes × 1.49 M ≈ **5.5 bn** before the length factor | — | Derived / UNVERIFIED |

### 1.2 Why a tunnel and not an open cut — the documented chain

**2010 EIA (MZP325, [dokumentace zip](https://portal.cenia.cz/eiasea/download/RUlBX01aUDMyNV9kb2t1bWVudGFjZURPQ18xLnppcA/MZP325_dokumentace.zip), file `D3_dokumentace_EIA_.pdf`)**

- Printed p. 23 (PDF 25), general design principle: *„Pahorkatinné a vrchovinné území vyžaduje použití
  maximálních podélných spádů … Značná část dálnice je navržena v podélném spádu okolo 4 %. Přes toto řešení
  dosahují zářezy v kratších úsecích hloubky 20-30 m, zde jsou však navrženy tunely (ražené či hloubené). Násypy by
  dosahovaly výšky až 30 m, v místech překonávaných depresí jsou navrženy mosty."*

  Translation: hilly terrain forces maximum grades of about 4 %; even so, cuts reach 20–30 m over short stretches,
  and tunnels are designed there instead; fills would reach 30 m, so bridges are used where the line crosses
  hollows. **Sourced.**
- Same page: *„Konečné směrové i výškové vedení trasy není však určováno snahou o vyrovnanou bilanci, ale především
  požadavky na ochranu životního prostředí a zdraví obyvatel, které nutí projektanty trasu vést dále od obcí,
  zahlubovat a tím zřizovat tunely."*

  Translation: the final alignment is set not by balancing earthworks but by protecting the environment and
  residents' health, which pushes the line away from villages, deeper, and so into tunnels. The same page notes
  the rock is suitable for fills. **Sourced.**
- Printed p. 32 (PDF 34), Tab. 11 (purposes):
  - Hůrka, Z1: 250 m, *„náhrada hlubokého zářezu, převedení sil. III/1044, ochrana lesa, migrační koridor"*
    ("replaces a deep cut; carries road III/1044; protects forest; migration corridor").
  - Luka, Z1: 400 m.
  - Luka, Z2: 1,200 m, *„náhrada hlubokého zářezu, převedení polních cest, ochrana lesa, migrační koridor,
    nahrazuje i tunel Hůrka"* ("replaces a deep cut; carries field roads; protects forest; migration corridor;
    also replaces the Hůrka tunnel").

  Every tunnel of section 0302–0303 lists "náhrada hlubokého zářezu" first. **Sourced.**
- Printed p. 19 and 36: variant Z2 (the one carried forward) has *„delší tunel cca o 550 m a zkracuje mostní
  objekt přes údolí řeky Sázavy o 225 m s příznivějším kolmým přechodem"* ("a tunnel about 550 m longer, and a
  Sázava bridge 225 m shorter with a better, perpendicular crossing"). Z1 had a 1,025 m bridge. **Sourced.**
- Printed p. 116 (PDF 118): *„v nejkritičtějších místech jsou velmi hluboké zářezy nahrazeny tunely a velmi vysoké
  násypy jsou nahrazeny mosty. Obecně je … tendence celkového snižování nivelety, především z důvodu ochrany
  obyvatelstva před hlukem. Z toho vyplývá značný přebytek výkopového materiálu"*.

  Translation: at the most critical places very deep cuts are replaced by tunnels and very high fills by bridges;
  the general trend is to lower the grade line, mainly to protect residents from noise, which produces a large
  surplus of excavated material. **Sourced.**
- Printed p. 119 (PDF 121): western corridor surplus *„cca 3,5 mil m3"* (≈ 3.5 million m³). Section 2
  (Jílové–Vojtěchov) Z2: cut 1,393,897 + tunnels 628,100 m³, net surplus 1,194,229 m³ (Tab. 56). **Sourced.**
- Printed p. 214 (PDF 216): the corridor crosses and runs along **PP Střed Čech**, a nature park founded in 1990,
  9,893 ha, *„dramatickou krajinou hlubokých kaňonů Vltavy a Sázavy"* ("the dramatic landscape of the deep Vltava
  and Sázava canyons"). **Sourced.**

**2019–2020 change (MZP491; [ZZŘ MŽP 23 Jun 2020, MZP/2020/710/239](https://portal.cenia.cz/eiasea/download/RUlBX01aUDQ5MV96amlzdG92YWNpRE9DXzI4NTkyOTU4NjE4MzU1NjYzNjguWklQ/MZP491_zjistovaci.ZIP))**

- PDF p. 3, changes 4 and 8: *„Snížení výškového vedení trasy až o 10 m v km 9,5 - 13,0 … Snížení nivelety tunelu
  Luka až o cca 10 m"* and *„Prodloužení tunelu Luka o 645 m … Prodloužení je z hlavní části na úkor
  předportálového zářezu na severní straně tunelu."*

  Translation: the grade line is lowered by up to 10 m at km 9.5–13.0 (the Luka tunnel grade by about 10 m), and
  the Luka tunnel is lengthened by 645 m, mostly in place of the pre-portal cut on the north side. **Sourced.**
- PDF p. 6, reason for change 8: *„požadované zakrytí trasy D3 u sídla Horní Studené a u rekreační zástavby cca
  v km 10,2 vpravo, zakrytí trasy D3 v tomto úseku byl požadavek města Jílové u Prahy."*

  Translation: the D3 line had to be covered near Horní Studené and the holiday homes at about km 10.2 right;
  covering it there was a demand of the town of Jílové u Prahy. **Sourced.**
- PDF p. 15: lowering the line increases the distance to medieval mine workings (*„stařin"*). The new line
  *„podchází důlní díla z raného středověku, pozdější důlní díla nadchází"* ("passes under the early-medieval
  workings and over the later ones"). It also reduces groundwater effects in the fractured aquifer. **Sourced.**
- PDF p. 6: *„ražením dlouhých tunelů a zářezů poměrně velkého rozsahu"* ("driving long tunnels and cuts of a
  fairly large extent"). PDF p. 14: deeper grade and other changes raised the take of farmland (ZPF) by 9.4 ha,
  partly through the lowered grade; ≈ 27 ha of the take is class II protected soil. **Sourced.**
- Doplňující podklad PDF p. 3 (ŘSD reply): *„Zahloubení tunelu Luka … nemá vliv na množství vyrubaného kameniva.
  Naopak prodloužením tunelu Luka na úkor předzářezu dojde k úspoře výkopku."* ("Lowering the Luka tunnel does not
  change the volume of excavated rock; on the contrary, lengthening the tunnel at the expense of the pre-cut saves
  excavation.") **Sourced.**
- Press: [zdopravy 10 Dec 2019](https://zdopravy.cz/rsd-meni-podobu-dalnice-d3-pres-posazavi-a-miri-znovu-do-procesu-eia-38662/):
  *„Hlavním rozdílem je větší zahloubení dálnice a její odsun dále od lidských obydlí. Změnu … si podle ŘSD vyžádalo
  město Jílové."* ("The main difference is a deeper motorway, moved further from homes; according to ŘSD the change
  was requested by the town of Jílové.") ŘSD spokesman: lower noise and emissions. **Sourced.**

**Open-cut variants considered?** None of the documents shows an open-cut alternative through the Hůrka / Panský
vrch ridge. From 2010 the deep part was always a tunnel (Z1: several short tunnels; Z2: 1,200 m). The only open
part was the north pre-portal cut (km 9.8–10.5), and it was replaced in 2019. Arguments named against it: noise at
Horní Studené and the holiday homes, the municipal demand, forest, migration corridor, field roads, spoil volume.
Slope stability and cost were not named. **Sourced** (absence: medium confidence).

### 1.3 Sázava bridge (787 m)

| Item | Value | Source | Conf. |
|---|---|---|---|
| Length / stationing | 787 m, km 12.084–12.868 | Oznámení MZP491 PDF p. 81 (landscape chapter) | Sourced |
| Height | grade up to 113 m above the valley | leaflet p. 2; [dalniced3 04/2025](https://www.dalniced3.cz/novinky/z-tisku/most-sazava-podrobny-geotechnicky-pruzkum-pro-budouci-nejvyssi-dalnicni-most-v-cesku) | Sourced |
| Spans | 16 spans: 36.5 + 61 + 34.427 + 2 × 33.45 + 34.8 + 2 × 35.825 + 38.273 + 7 × 65 m; RC arch **237 m** (leaflet) / 251 m (2025 article) | leaflet p. 2; dalniced3 | Sourced (two arch values) |
| Why this length | *„požadavkem na minimalizaci zásahu do údolí, což reprezentuje maximální možné rozpětí středního pole mostu 180–260 m a polohou železničního tunelu"* ("the demand to minimise intervention in the valley, which sets the largest possible main span, 180–260 m, and the position of the railway tunnel") | leaflet p. 2 | Sourced |
| EVL | 2019 change 6: bridge 20 m shorter. Reason: *„minimalizace ovlivnění EVL Dolní Sázava během výstavby. Založení oblouku je … oddáleno od břehů řeky … výstavba … pouze „ze shora""* ("to minimise effects on the EVL Dolní Sázava during construction; the arch footings are moved away from the riverbanks; it is built only 'from above'") | ZZŘ PDF p. 5 | Sourced |
| Approaches | *„trasa D3 bude na pravém břehu vedena do zářezu obklopenému lesními porosty, na levém břehu bude viditelná část předmostí velmi krátká"* ("on the right bank the line enters a cut surrounded by forest; on the left bank the visible approach is very short"). After the bridge: *„Za mostem je trasa vedena v hlubokém zářezu"* ("beyond the bridge the line runs in a deep cut"), with II/106 crossing over it at km 13.1 | Oznámení PDF p. 81; leaflet p. 2 | Sourced |
| Fill heights at its ends | not stated. From the above, essentially none: both ends enter cuts | — | Derived |
| Spoil | *„Podél dálnice jsou navrženy zemní valy šířky 20–22 m a výšky až 10 m … Do valů jsou uloženy přebytečné zeminy a horniny z výkopů a výrubů stavby."* ("Earth bunds 20–22 m wide and up to 10 m high are designed along the motorway; surplus soil and rock from cuts and tunnel excavation go into them.") Bunds listed: 125 m × 5 m at the Luka south portal, 180 m × 9 m at Hostěradice, etc. | leaflet p. 2; Oznámení PDF p. 101 Tab. 28 | Sourced |

## 2. Deep rock cuts in practice

### 2.1 Records and examples

| Cut | Depth | Slope / berms | Source | Conf. |
|---|---|---|---|---|
| D1 Lensedelský zářez (by the Hvězdonice Sázava bridge) | **38 m**, 500 m long; called the deepest on Czech motorways | not given | [ČVUT FD 12PPOK lecture 07](https://k612.fd.cvut.cz/predmety/12PPOK/cviceni/vyklad/12ppok-c-07.pdf) p. 1 (*„příklad extrémních hodnot"*, "an example of extreme values"); [UPOL lexikon](https://geography.upol.cz/soubory/studium/e-ucebnice/Smolova-2010/lexikon/antropogenni/dopravni/dopravni_prukop.html): *„Jeho existence výrazně narušila krajinu"* ("its existence badly scarred the landscape") | Sourced |
| D3 0302 Luka south pre-cut / Bohuliby-side c&c pit, km 11.700 (Jílové belt) | ≈ 13–16 m (pit, backfilled over the c&c tunnel) | **Pragoprojekt DÚR: 1.5 m berms every 5.0 m; lower two 5 m benches 1:1.25, upper part 1:1.75.** Stability FS = 1.97; the thesis optimum is 1:0.75 / 1:1.25 (FS ≈ 1.5) | Josefík 2017, PDF p. 22 and 24 (§4.1–4.2), annex 3 cross-section | Sourced |
| D8 km 90.3–90.7 | 15 m, ≈ 75°, netted | (research/48) | Sourced |
| A38 Göttingen–Halle (hilly German motorway) | deepest cut ≈ 13 m | — | [DEGES 2009](https://www.deges.de/wp-content/uploads/2019/09/2009-12_A38_Dokumentation.pdf) | Sourced (search snippet) |
| SK / AT / CH 40–60 m road cuts | none found | — | — | UNVERIFIED |

### 2.2 Published rules for cuts deeper than about 15–20 m

- **Czech:** no fixed numbers. VL 1 sheet 31-04: rock slope ns:1, berms ≥ 1.0 m, *„dle geologického průzkumu"*
  ("according to the geological survey"). VL 2 301.02: deeper cuts *„stupňovitý sklon s lavičkami … stabilitu …
  prokázat výpočtem"* ("stepped slope with berms; stability proven by calculation"; research/48).
  [TKP kap. 4 (MD, 01/2026)](https://pjpk.rsd.cz/viewFile.asp?file=51786):
  - art. 51: blasting needs a blasting project, an OBÚ permit, *„zkušební odstřely doprovázené měřením
    seizmických účinků"* ("trial blasts with measurement of seismic effects"), ČSN 73 0040;
  - art. 52: *„vhodné zvážit a eventuálně použít technologii řízeného výlomu (hladký výlom neboli presplit)"*
    ("controlled blasting, smooth blasting or presplit, should be considered and possibly used").

  **Sourced.** ČSN 73 6133 text is paywalled; nothing found that quotes a depth-dependent berm rule from it.
  UNVERIFIED.
- **German** ([Adam, Grundbau-Taschenbuch 2.1 Erdbau, sample](https://application.wiley-vch.de/books/sample/3433031525_c01.pdf),
  printed p. 32–33, citing Brandecker 1971 and FGSV M Fels 2015):
  - *„Bermen werden bei Einschnitten ab einer Höhe von mehr als 15 m erforderlich … in der Regel mit einer Breite
    von 2 bis 3 m … Nach dem Merkblatt über das Bauen mit und im Fels sollte die Berme jedoch mindestens 4 m breit
    sein, wenn ein Befahren mit Wartungsfahrzeugen erforderlich ist."*

    Translation: berms are required in cuts deeper than 15 m, usually 2–3 m wide; under M Fels at least 4 m if
    maintenance vehicles must drive on them. **Sourced.**
  - *„Verwitterungsanfällige Gesteine sollten auf die Lockergesteinseigenschaften abgestimmt werden, die Neigung
    beträgt dann jedenfalls weniger als 1:1,5"* ("rocks prone to weathering should be sloped for their soil-like
    properties, and then in any case flatter than 1:1.5"). **Sourced.**
  - Bild 16 (Brandecker design slopes by height, read from the figure, 40 m cut):

    | Group | Rock | Faces | Berms | Overall |
    |---|---|---|---|---|
    | A | sound granite, gneiss, basalt | 5:1 | at ≈ 12 m and 25 m | **≈ 3:1 (72°)** |
    | B | unweathered, little jointed | 3:1 | — | **≈ 2:1 (63°)** |
    | C | weathered, moderately jointed A/B rocks | 2:1 | — | **≈ 5:4 (51°)** |
    | D | more weathered and jointed rock, shales, phyllites, flysch | 5:4–1:1 | — | **≈ 1:1 to 4:5** |
    | E | — | treated as soil | — | — |

    The chart stops at 40 m. **Sourced (figure reading).**
- **Hessen Mobil Heft 52** ([PDF](https://mobil.hessen.de/sites/mobil.hessen.de/files/2022-02/wirtschaftliche_aspekte.pdf)):
  - PDF p. 55: deep cuts cause *„verhältnismäßig großen und weit bis hinter die Baugrubenböschung reichenden
    Horizontalverschiebungen"* ("relatively large horizontal displacements reaching far behind the slope crest"),
    which can be problematic for nearby buildings;
  - PDF p. 60, checklist: *„Tiefe Voreinschnitte vermeiden"* ("avoid deep pre-cuts").

  **Sourced.**
- **Austria:** ASFINAG Planungshandbuch Straße–Bau §6.2.1: slopes steeper than 2:3 need special solutions,
  *„Anordnung von Bermen in Abhängigkeit von der Damm-/Einschnittshöhe"* ("berms arranged according to fill / cut
  height"); refers to RVS 03.03.32. RVS text not obtained. **Sourced / UNVERIFIED.**
- **Swiss VSS:** not checked. UNVERIFIED.

**Typical overall slope of a 40–60 m rock cut:** about 3:1 in sound massive granite or gneiss, 2:1 in unweathered
jointed rock, 5:4 in weathered or moderately jointed rock. That is the Brandecker figure, extrapolated beyond 40 m
(**Derived**). Posázaví specifics:
- Sázava-type granodiorite has a weathering mantle *„lokálně přesahujícího i 10 m … všesměrně rozpukané, s typickou
  blokovitou odlučností"* ("locally over 10 m thick; jointed in all directions, typically splitting into blocks";
  EIA printed p. 167). That suggests **group C** for the upper 10 m.
- The Jílové belt is *„často silně rozpukané a provrásněné"* ("often strongly fractured and folded"), with old
  workings. That suggests **group C/D**.
- The real designer slope at Luka, 1:1.25 (≈ 39°), is consistent with C/D.

## 3. Cut vs tunnel: the decision and the costs a pure excavation price misses

### 3.1 Rules of thumb

| Rule | Value | Source | Conf. |
|---|---|---|---|
| Economic limit of a cut | **≈ 30 m depth** (*„erfahrungsgemäß"*, "from experience") | Hessen Mobil Heft 52 (2006) §4.1.1, PDF p. 32 | Sourced |
| D3 practice | cuts of 20–30 m → tunnels ("náhrada hlubokého zářezu") | D3 EIA 2010 printed p. 23 and 32 | Sourced |
| Cut-and-cover is cheapest at shallow cover | ≤ 5–7 m crown cover; avoid deep pits near buildings | Hessen §4.1.1, PDF p. 32 | Sourced |
| Formal method (DE) | ARS 25/1998 Leitfaden: weighted matrix, required for all federal roads. *„Die Alternativen Einschnitt oder Tunnel kommen in technischer Hinsicht nur bei einer oberflächennahen Lage der Straße in Betracht"* ("cut or tunnel is technically a real choice only where the road lies close to the surface"). Its stated drivers: *„erhöhter Anforderungen an den Natur-, Landschafts- und Lärmschutz"* ("higher demands of nature, landscape and noise protection"), against tunnel operation and maintenance cost | [BW circular 1998 with ARS 25/1998](https://vm.baden-wuerttemberg.de/fileadmin/redaktion/m-mvi/intern/Dateien/MobiZ/AZ_66-3944_52-30.pdf) (OCR); [RE-ING Teil 3 Abschn. 1 §2 and Anhang C (2025/12)](https://www.bast.de/DE/Publikationen/Regelwerke/Ingenieurbau/Entwurf/RE-ING-Gesamt.pdf?__blob=publicationFile&v=3) (Anhang C: *„sollte bis zu seiner Fortschreibung nur in Ausnahmefällen angewendet werden"*, "should be applied only in exceptional cases until it is revised"); [Wiley sample](https://application.wiley-vch.de/books/sample/3433029571_c01.pdf) p. 13–14 | Sourced |
| Czech written depth rule | none found outside the D3 EIA | — | UNVERIFIED |

### 3.2 Cost items for a very deep rock cut (OTSKP 2026, [SFDI zip](https://sfdi.gov.cz/wp-content/uploads/2026/04/otskp-2.zip), workbook `Příloha č.2 … 20260410`)

| Item | Code | Price | Conf. |
|---|---|---|---|
| Excavation, class III (in place) | 12293 / 122931 | 653.27 CZK/m³ | Sourced |
| … with haul up to 12 km / 20 km | 122936 / 122938 | 964.07 / 1,190.06 CZK/m³ (+28.26 per extra km) | Sourced |
| **Presplit blasting, class III** (*„v [m2] požadované výsledné plochy"*, "per m² of the required final face"; excludes excavation) | **12892** | **2,360.50 CZK/m²** | Sourced |
| Presplit, class II | 12842 | 1,449.88 CZK/m² | Sourced |
| Placing on a tip without compaction | 17120 | 21.17 CZK/m³ | Sourced |
| Rock-fill placing with compaction | 17160 | 121.53 CZK/m³ | Sourced |
| Landfill fee | 014101 | 0 (project-specific) | Sourced |
| Mesh by climbers / SPOŽES rock-cut remediation (all in) / rebar bolt ≤ 3 m | 289941 / F16 / 285361 | 2,513.47 CZK/m² / 4,300 CZK/m² / 5,507.99 each + drilling (research/48) | Sourced |
| Prestressed anchor ≤ 10 m / shotcrete | 285378 / 28931 | 24,815.69 each / 9,956.55 CZK/m³ | Sourced |
| Rockfall barriers | no OTSKP item | — | UNVERIFIED |
| Monitoring and blasting project | TKP 4 art. 51 requires them; no unit price | — | Sourced (requirement) |
| Maintenance | D8 km 90.3–90.7 repair tender (research/48); berms ≥ 4 m for maintenance vehicles (M Fels) | — | Sourced (qualitative) |

**Derived comparison, per metre of motorway.**

Assumptions: flat cross-section, cut base 31 m (UNVERIFIED: D 27.5 crown plus ditches), both faces presplit and
netted (2,360.50 + 2,513.47 CZK/m²). The tunnel is twin mined tubes at the SPK rate, 2 × 1,487,547 =
**2.98 M CZK/m** (research/49), before the length factor.

| Depth H | Engine 4:1 + 1 m / 5 m | A 3:1 | B 2:1 | C 5:4 | D 1:1 |
|---|---|---|---|---|---|
| top width at 62 m | 86 m | 72 m | 93 m | 130 m | 155 m |
| excavation at 62 m (653 CZK/m³) | 2.37 M | 2.09 M | 2.51 M | 3.26 M | 3.77 M |
| crossover depth, spoil reused (653) | 61.5 m | 66.5 m | 59.5 m | 50.5 m | 46.5 m |
| crossover depth, spoil tipped 12 km (985) | 48.5 m | 52 m | 46.5 m | **40 m** | **37 m** |

Two notes on this table:
- The engine's 4:1 + 1 m benches works out to an overall ≈ 2.25:1 at 62 m, close to group B. That suits sound
  rock but is too steep for the Jílové belt (C/D).
- On direct cost alone, a cut and a tunnel break even at 40–60 m. Hessen's 30 m and the D3 20–30 m rule are lower
  because they also weigh land, forest and farmland take, noise and covering demands, migration, landscape,
  maintenance and risk.

## 4. Spoil (brief)

- **Waste law:** zákon 541/2020 Sb. §2(1)(e) excludes *„nekontaminovanou zeminu a jiný přírodní materiál vytěžený
  během stavební činnosti, pokud je zajištěno, že materiál bude použit ve svém přirozeném stavu pro účely stavby na
  místě, na kterém byl vytěžen"* ("uncontaminated soil and other natural material excavated during construction,
  where it is certain to be used in its natural state for construction on the site where it was excavated").
  Reuse in the same project's fills or bunds is not waste. Surplus taken off site is waste 17 05 04 (category O)
  ([zakonyprolidi](https://www.zakonyprolidi.cz/cs/2020-541)). **Sourced.**
- **Landfill fee:** Příloha 9 rates for 2026 are 1,600 CZK/t "využitelné" and **600 CZK/t "zbytkové"** odpady.
  Which band inert soil and rock falls in was not verified (UNVERIFIED; probably "zbytkový"). At about 2.0–2.6 t/m³
  that would be ≈ 1,200–1,560 CZK/m³ if landfilled. That is why projects put surplus into noise bunds and
  landscaping instead (the D3 leaflet; EIA printed p. 112: *„na výstavbu protihlukových valů … k úpravám povrchu
  terénu"*, "for building noise bunds … and landscaping"). **Derived / UNVERIFIED.**
- **OTSKP:** the price of tipping 17120 (21.17 CZK/m³) and the landfill fee 014101 is set per project (0 in the
  catalogue). TKP 4 art. 129–130: unusable soil goes to landfill as waste per vyhl. 273/2021 Sb. **Sourced.**
- **Scale:** the D3 western corridor had a surplus of ≈ 3.5 M m³ (EIA). Lengthening Luka "saves excavation"
  (ŘSD 2020). **Sourced.**

## Mechanisms the engine might be missing (ranked by evidence strength)

1. **A designer's limit on cut depth, tied to covering the line (strongest; primary documents).**
   - D3 EIA: cuts of 20–30 m are replaced by tunnels; reasons are forest protection, migration corridors, road and
     field-road crossings and noise.
   - Hessen: economic limit ≈ 30 m. RE-ING / ARS 25/1998: decided by a matrix.
   - Luka: the town's covering demand added 645 m of tunnel in place of the pre-cut.

   Not an arbitrary cap: it can be modelled as costs a cut carries and a tunnel avoids. Numbers needed:
   - forest take (PUPFL, about 4 ha on 0302) and class II farmland take, priced per ha;
   - a migration / ecological crossing obligation where the line cuts a forest block (an ecoduct or overbridge
     every X km of forest cut; the D3 EIA Tab. 13 places ecoducts over deep cuts);
   - noise: a cut of depth h near homes versus a covered line.

   Calibration targets: 20–30 m (D3), 30 m (Hessen), 38 m (deepest Czech motorway cut ever built).
2. **The real valley crossing keeps the bridge long, so there are no 40–47 m fills to absorb the cut's rock**
   (strong).
   - The real 787 m bridge lands straight in cuts on both banks.
   - Its length comes from the 113 m height, the 180–260 m main span, the railway tunnel and EVL Dolní Sázava /
     PP Střed Čech.
   - The highest Czech motorway fill is 32 m (research/52); soil fills above 10 m need individual design.

   Numbers needed: research/52's fill-height pricing or validity limit, plus a protected-valley footprint rule. If
   the fills go, the cut's rock becomes surplus and is tipped (≈ +330 CZK/m³ haul and placing, plus any landfill
   fee). That alone moves the direct-cost crossover from ≈ 60 m to ≈ 48 m (engine geometry) or ≈ 40 m (group C).
3. **Slope geometry by rock-mass quality and depth** (strong for the direction, medium for the numbers).
   - Group A/B (sound granite, gneiss): overall 3:1 to 2:1.
   - Group C (weathered, moderately jointed; Posázaví granodiorite with a 10 m mantle, the Jílové belt): overall
     **5:4**.
   - Group D: about 1:1.
   - Berms 2–3 m (≥ 4 m for maintenance access) in cuts deeper than 15 m.
   - Real Luka DÚR geometry: 1:1.25 lower, 1:1.75 upper, 1.5 m berms every 5 m.

   The engine's single 4:1 + 1 m / 5 m profile underestimates a 62 m cut in the Jílové belt by ≈ 38 % in volume
   and ≈ 44 m in total width (Derived). Needs a lithology → group map (the EIA describes the geology by unit; the
   ČGS GEOCR50 units already in the pipeline could carry it).
4. **Presplit of the final face** (strong; norm and price). TKP 4 art. 52 recommends it; OTSKP 12892 prices it at
   **2,360.50 CZK/m²** of final face (class III). For a 62 m cut that is ≈ 0.3 M CZK/m (Derived), and it scales with
   face area, which is what makes very deep cuts dear. Also: blasting project and seismic monitoring near
   settlements (TKP 4 art. 51; no unit price, UNVERIFIED lump sum).
5. **Groundwater drainage by deep cuts** (medium).
   - A cut lowers the water table as a line drain: Sichardt reach 150 m in faulted zones for 6 m of drawdown at
     the Jílové cut.
   - The massif below 40 m is almost impermeable, so a deep tunnel affects groundwater less (Oznámení MZP491).
   - The ZZŘ also cites the cut reducing flow in Studenecký potok (≤ 10 %).

   Numbers needed: springs and wells within about 150 m of a cut face below the water table, and a replacement
   water-supply cost (the D3 Posázaví water main was tendered for 11.7 M CZK; novinky 08/2026, not opened,
   UNVERIFIED).
6. **Old mine workings in the Jílové gold district** (medium, local). Both a cut and a tunnel meet them. The deep
   tunnel passes under the medieval workings (30 m loosening zone above a collapsed working, 51–56 m clearance
   reported; Blažek 2013 expert opinion, quoted in the ZZŘ Doplňující podklad PDF p. 3).
   A cut would open them in its faces. Needs: a mapped undermined-area layer (DIAMO / ČGS "poddolovaná
   území") plus a remediation surcharge per m² of face or per m of tunnel. UNVERIFIED prices.
7. **Cut-and-cover at the ends instead of an open pre-cut** (medium; research/49 already covers it). At Luka the
   tunnel ends are c&c (Bohuliby 200 m) built in pits ≈ 13–16 m deep and backfilled. The open approach the
   engine leaves is about 13–16 m deep, not 60 m.
8. **Horizontal ground movement near buildings and the costs of operating a deep cut** (weak, qualitative).
   Hessen §5.1.3 warns of displacements reaching far behind the crest. Maintaining berms and nets: no Czech unit
   cost found.


## Research: rock slopes by lithology (research pass, sources)


Question: today the engine cuts all class-III ground at 4:1 with 1 m benches every 5 m, and class II at the soil
slope of 1:1.75. Which ground profiles' class-III rock should instead be cut like soil (1:1.75 or flatter), and
what slope suits jointed hard rock?

Labels: **Sourced** means the source says it. **Derived** means my reading or arithmetic from sources.
**UNVERIFIED** means it was not confirmed.

Local copies of the sources are in `/tmp/q3/rs/` and `/tmp/q3/src/` (vl2.pdf, gbt21.pdf, josefik.pdf).

## Findings at a glance

- **VL 2 (1995) 301.04, note 2 is confirmed verbatim.** It names no rock types. VL 1 (2022) dropped the note:
  its sheets 31-01 and 31-04 say only "per stability assessment" and "per geological survey".
- **The only Czech standards that name rock types are:**
  - VL 2 sheet 432.02, which lists the frost-sensitive rocks;
  - the ČSN 73 6133 strength table (R1–R6 with example rocks), as quoted in teaching texts.

  Sources disagree on where "poloskalní" rock starts: R4–R6 (ČKAIT TP 1.9.5) or R3–R5 (VUT, Malotová).
- **The German / Austrian rule is explicit, and it is the best lithology table available.** M Fels says
  rocks prone to weathering are sloped like soil, flatter than 1:1.5. Brandecker sorts rock into groups A–E:
  - A/B: sound igneous, metamorphic and massive rock, steeper than 3:1;
  - C: weathered A/B rock, or sequences with marlstone or clayey-sandstone interbeds, and Cretaceous marls and
    sandstones: 3:1 to 2:1;
  - D: shales, crumbly phyllites, flysch and interbedded sediments: 3:2 to 1:1;
  - E: rocks whose strength changes with exposure, cut like soil.
- **Czech projects agree:**
  - Cretaceous marlstone and claystone cuts are designed as soil cuts: the D35 Litomyšl–Janov DÚR uses the
    ČSN 73 6133 soil slopes, and 1:2.5 in one cut.
  - The R11/D11 1108 EIA review asks for flatter, individually assessed slopes in marlstones and allows steeper
    ones in sandstones.
  - A Permian cut on the I/33 Náchod bypass is designed at 1:2.
  - Pragoprojekt's D3 Luka cut in faulted Jílové-belt metavolcanics uses 1:1.25.
- **Recommendation:**
  - perm_fine, marl and tuff → soil slope (1:1.75 rule).
  - phyllite and carb_mixed → 5:4 faces (≈ 1:1 overall).
  - perm_sand, perm_congl, carb_sand and cret_sand → 2:1 faces.
  - gneiss, hard, carbonate and igneous → keep 4:1.

## 1. Czech standards and classification

### 1.1 VL 2 (MD ČR 1995), sheet 301.04 "Tvary zářezových svahů — zářez od 2 m do 6 m"

Source: [PDF](https://pjpk.rsd.cz/data/USR_001_2_10_VL/VL2_Silnicni_teleso__199505_.pdf), PDF page 19, rendered
and read.

- The drawing: H = 2.00–6.00 m, slope "MAX 1:1,75". **Sourced.**
- Note 2, verbatim: *„SKLONY SVAHŮ V POLOSKALNÍCH A RYCHLE ZVĚTRÁVAJÍCÍCH HORNINÁCH SE NAVRHUJÍ JAKO SVAHY V
  ZEMINÁCH PO GEOTECHNICKÉM ZHODNOCENÍ STABILITY SVAHU"*. Translation: slopes in semi-rock and fast-weathering
  rock are designed like soil slopes, after a geotechnical stability assessment. **Sourced.** The note names no
  rock types.

Related VL 2 sheets:

- **301.06 (PDF page 21)**, note 1: *„SKLONY SVAHŮ SKALNÍCH ZÁŘEZŮ SE URČÍ DLE VÝSLEDKŮ GEOTECHNICKÉHO
  PRŮZKUMU"*. Translation: rock-cut slopes are set from the geotechnical survey. **Sourced.**
- **301.07 (PDF page 22):** the slope is shown only as "ns:1". H1 = 3.00 m and H2 = 5.00 m, with benches of at
  least 1.0 m at 10 %. Note: *„umístění a šířka laviček se navrhne s ohledem na geotechnické podmínky"*
  ("bench position and width according to geotechnical conditions"). **Sourced.** No numeric rock slope appears.
- **432.02 "Úprava podloží ve skalních zářezech" (PDF page 107, rendered).** Notes to the frost-resistance
  table:
  - 1) *„Horniny s vysokým obsahem jílovitých minerálů, s jílovitým tmelem, horniny jemnozrnné je třeba
    považovat za málo odolné proti účinkům mrazu"*. Translation: rocks rich in clay minerals, with clayey cement,
    or fine-grained, are to be treated as not frost-resistant.
  - 2) *„Horniny zjevně vrstevnaté a břidličnaté s vysokým obsahem slídy (svory, fylity, břidlice) …"*.
    Translation: obviously bedded and schistose rocks rich in mica (mica schists, phyllites, shales) are likewise
    not frost-resistant.

  **Sourced.** This is the only lithology list in the Vzorové listy. It is about the subgrade, not slopes; using
  it to tell what "rychle zvětrávající" means is **Derived**.

### 1.2 VL 1 (MD 01/2022)

Source: [PDF](https://upload.wikimedia.org/wikipedia/commons/5/59/VL_1_2022_Vozovky_a_krajnice.pdf).

- **Sheet 31-01 (PDF page 61):** *„SKLON DLE POSOUZENÍ STABILITY SVAHU 1:n"* ("slope per stability assessment").
  Note 2: in cut slopes of 1:2 and steeper the stability of the topsoil layer is to be checked.
- **Sheet 31-04 (PDF page 64):** *„Sklon svahu (ns), výšky H1–H3 a umístění laviček dle geologického
  průzkumu"* ("slope, heights and bench positions per geological survey"). Benches are at least 1.00 m.

**Sourced.** There is **no equivalent of note 2** in VL 1 2022.

### 1.3 ČSN 73 6133 itself

- It has no slope table. Its Příloha B (informative) gives only factors of safety for cuts. For rock these are
  1.3 on peak strength and 1.15 on critical strength; for fine-grained soil 1.5, 1.15 and 1.1. Source:
  [ŘSD seminar, Herle 2012](https://pjpk.rsd.cz/data/USR_001_3_2_K_VYKONU/P_4.pdf), PDF page 100. **Sourced.**
- The rule "≤ 2 m not steeper than 1:2; 2–6 m 1:1.75; deeper by survey" is already in research/48 §1.2.

### 1.4 Strength classes R1–R6 and "poloskalní"

**ČSN 73 6133 table** (R1–R6), from a
[VUT FAST teaching extract](https://geotech.fce.vutbr.cz/wp-content/uploads/sites/17/2026/07/Seminarni-prace-zatrideni-a-vlastnosti-hornin.pdf),
PDF page 3, §2.1 "Zatřídění skalních hornin dle ČSN 73 6133". **Sourced.**

| Class | σc (MPa) | Sound rocks listed | Weathered rocks listed |
|---|---|---|---|
| R1 | > 150 | granitoids, diorites, gabbros, migmatites, granulites, quartzites, amphibolites, basalts, silicified paragneisses, orthogneisses, crystalline limestones, silicites | — |
| R2 | 50–150 | limestones, dolomites, conglomerates, sandstones, greywackes, firm siltstones, paragneisses, **mica schists (svory), phyllites** | slightly weathered R1 |
| R3 | 15–50 | **claystones, marlstones, volcanic tuffites**, cataclasites | moderately weathered R2 |
| R4 | 5–15 | weakly cemented sandstones, siltstones and claystones; **chloritic and graphitic schists, phyllites**; ultramylonites | strongly weathered R1/R2 |
| R5 | 1.5–5 | very weakly cemented sandstones, siltstones and claystones; **tuffites**; fault clay | — |
| R6 | 0.5–1.5 | — | completely weathered R3–R5; eluvium |

**ČSN 72 1001 version** ([VŠB Tab. 5.1.1.6](http://geologie.vsb.cz/geologie//KAPITOLY/5_horniny_v_praxi/Tabulky/Tab6.htm)):
the same lists. In it, claystones and marlstones are R3, weakly cemented claystones, siltstones and sandstones
plus chloritic and graphitic schists are R4, and phyllites and mica schists are R2. **Sourced.**

**Where "poloskalní" starts.** The sources disagree:

- [ČKAIT TP 1.9.5](https://profesis.ckait.cz/dokumenty-ckait/tp-1-9-5/), commenting on Tab. 5:
  *„Třídám R1 až R3 odpovídají skalní horniny, třídám R4 až R6 pak poloskalní horniny"*. Translation: R1–R3
  are rock, R4–R6 semi-rock. **Sourced.**
- [VUT lecture "Mechanika hornin – laboratoř"](https://geotech.fce.vutbr.cz/wp-content/uploads/sites/17/2018/09/mhig_10.pdf),
  printed page 11, Tab. X.II (ČSN 72 1002/1990, ČSN 73 1001/1988), draws the rock / semi-rock boundary between
  R2 and R3 (50 MPa).
- [Malotová, Silnice Mosty 4/2024](https://www.silnice-mosty.cz/wp-content/uploads/2025/01/SM42024_KMalotova.pdf),
  page 33: *„Jako poloskalní horniny byly podle normy ČSN 73 1001 … označovány horniny s pevností v prostém
  tlaku σc = 1,5 MPa až 50 MPa"*.

**Sourced (conflict).** Either way, sound claystones, marlstones and tuffites (R3) sit at or just below the
boundary, and their weathered states are R4–R6.

**ČSN EN ISO 14689-1** (VUT mhig_10, page 11, Tab. X.III) uses words, not R classes: extremely weak < 1, very
weak 1–5, weak 5–25, medium 25–50, strong 50–100, very strong 100–250 MPa. **Sourced.** It has no "poloskalní"
term.

### 1.5 Mapped engineering character (ČGS IG rajons 1:50k)

These are the `ig_charakter` / `hornina` fields from the cached
[ČGS IG_rajony50 layer 1](https://mapy.geology.cz/arcgis/rest/services/Geohazardy/IG_rajony50/MapServer/1)
(`pipeline/cache/cgs_ig50_*`). **Sourced.**

| Rajon | Rocks | Engineering character |
|---|---|---|
| Sj | jílovce, prachovce, slínovce, břidlice | *„různá pevnost, často obtížně rozpojitelné, únosné, podmínečně vhodné základové půdy"* (variable strength, often hard to dig, bearing, conditionally suitable foundation) |
| Sf | flysch-like, strongly anisotropic interbeds | *„únosné, na svazích náchylné k sesouvání"* (bearing, prone to sliding on slopes) |
| Ss | sandstones, conglomerates, greywackes, arkoses | *„pevné, obtížně rozpojitelné"* (strong, hard to dig) |
| Mn | phyllites, quartzites | *„pevné, obtížně rozpojitelné, únosné a stabilní"* (strong, hard to dig, bearing and stable) |
| Mv | mica schists, gneisses, amphibolites | *„ve zdravém stavu pevné"* (strong when sound) |
| Vk | tuffs, tuffites | *„časté změny litologického charakteru"* (frequent changes of lithology) |
| Vl | compact volcanic rock | *„pevné, odolné vůči zvětrávání"* (strong, weathering-resistant) |

### 1.6 Field-road standard (secondary)

ČSN 73 6109, as quoted in a
[JČU thesis 2011](https://dspace.jcu.cz/bitstreams/38a57fa8-b908-4d8b-8cc6-261df7c64db0/download), PDF page 25:
*„ve zvětralé skále ve sklonu 2 : 1. Sklon svahů skalních zářezů závisí na sklonu diskontinuit … a určí se podle
výsledků geotechnického průzkumu"*. Translation: in weathered rock 2:1; the slope of rock cuts depends on the
dip of discontinuities and is set from the survey. **Sourced** (secondary, field roads).

A ČZU thesis snippet reads "od 1:1,25 do 5:1 v závislosti na stupni zvětrání a pevnosti" ("from 1:1.25 to 5:1,
depending on weathering and strength"). It is **UNVERIFIED**: bot-blocked, and its source is unknown.

## 2. Czech projects

| Project | Ground | Cut slope | Source | Label |
|---|---|---|---|---|
| D35 Litomyšl–Janov I (DÚR, HBH 06/2019) | Teplice Fm. calcareous claystones, marlstones, siltstones along the whole route (PDF page 6) | *„Sklony zářezových svahů … Pouze v jednom úseku … jiné sklony svahů než dle ČSN 73 6133: Zářez Z9 km 56,050–57,610 jednotný sklon svahu 1:2,5"*. All other cuts at the soil slopes of ČSN 73 6133, one cut at 1:2.5 | [B. Souhrnná TZ](https://nemcice.uo.cz/data/1612333752.62-10.pdf) PDF page 18 | Sourced |
| R11/D11 1108 Jaroměř–Trutnov (EIA review, MZP196) | Cretaceous sandstones and (sandy) marlstones | *„v místech výskytu pískovců bude možno volit svahy i strmější. V prostorech, kde budou zářezy procházet polohami písčitých slínovců a slínovců … sklony svahů posuzovat individuálně v závislosti na malé odolnosti těchto hornin proti zvětrávání. Tyto horniny velmi rychle zvětrávají až na střípky a jílovité zeminy … volbou mírnějších sklonů"*. Sandstones may be steeper than the template; marlstones weather fast into chips and clay and need flatter, individually assessed slopes | [posudek](https://portal.cenia.cz/eiasea/download/RUlBX01aUDE5Nl9wb3N1ZGVrRE9DXzEucGRm/MZP196_posudek.pdf) PDF page 68 | Sourced |
| D11 1106, D35 Časy–Ostrov, I/33 Jaroměř bypass | Cretaceous marlstone | Marlstone of strength R3–R5 decays to clay over one winter; frost-thaw samples fall apart after 4 cycles. D11 cut at km 102.4–105.6 and I/33 at km 1.12–1.45: R6 at the surface, R4 at formation level. No slopes given | Malotová, Silnice Mosty 4/2024, pages 33–36 | Sourced |
| I/33 Náchod bypass, cut Z3 (built) | Permian sandstones, conglomerates, siltstones. Eluvium 1.5–3.0 m, strongly weathered 0.5–2.5 m, in tectonic zones 8–10 m+. Geotypes P2 (R6) and P3 (R5) | *„Při uvažovaném svahování ve sklonu 1:2"*: slope 1:2, with a retaining structure where land is tight | [VUT BP Fábera 2026](https://www.vut.cz/www_base/zav_prace_soubor_verejne.php?file_id=299062) PDF pages 15 and 21 | Sourced |
| D3 0302 Luka, km 11.700 (Pragoprojekt DÚR geometry) | Jílové belt metavolcanics, faults and thicker weathering at km 11.73–11.80 | Lower two 5 m steps **1:1.25**, then 1:1.75; 1.5 m benches every 5 m; FS 1.97 | [Josefík, ČVUT BP 2017](https://dspace.cvut.cz/server/api/core/bitstreams/1f4190c6-06d5-4dc9-a181-8da762a52ec8/content) PDF page 24, §4.2 | Sourced |
| D8 km 90.34–90.74 | Rock cut (lithology not stated; Krušné hory crystalline by location) | Up to about 15 m high, about 75° (≈ 4:1), meshed; the face weathers and needs frequent clearing | [tender](https://portaldodavatele.cz/verejne-zakazky/d8-oprava-svahu-zajisteni-svahu-vpravo-d8-km-90-340-az-km-90-740) | Slope Sourced; lithology UNVERIFIED |
| I/44 Červenohorské sedlo | Gneiss, weathered mica schist, metabasite; three joint sets; foliation dipping 45° into the slope | 500 m rock cut, 3.0–5.5 m high, steep with overhangs of 1.0–2.5 m; rockfall remediation | [ASB 2014](https://www.asb-portal.cz/stavebnictvi/inzenyrske-stavby/geotechnika/hodnoceni-skalniho-riceni-a-jeho-sanace-na-silnici-i-44-cervenohorske-sedlo) | Sourced |
| II/157 Srubec | Crystalline rock | 4:1 with 1.0 m benches | research/48 §1.3 | Sourced |
| R49 | Flysch claystones and siltstones | 1:2.5 | research/48 §1.2 | Sourced |

**Not found:** design cut slopes for the Permian red beds of D11 1108/1109. The MZP197 (1109) EIA review only
says the Permian bedrock (sandstones, conglomerates, siltstones, claystones) varies in weathering, PDF page 25.
**UNVERIFIED.**

## 3. German / Austrian guidance

Source: D. Adam, *Grundbau-Taschenbuch* 2.1 Erdbau, printed pages 32–33
([Wiley sample](https://application.wiley-vch.de/books/sample/3433031525_c01.pdf)). It cites FGSV *M Fels*
(2015) [96] and Brandecker 1971 [14].

### 3.1 The weathering rule (M Fels)

> *„Dauerhafte, auch bei Witterungseinflüssen stabile Gesteinsböschungen können steiler als 1:1,5 frei geböscht
> werden. Verwitterungsanfällige Gesteine sollten auf die Lockergesteinseigenschaften abgestimmt werden, die
> Neigung beträgt dann jedenfalls weniger als 1:1,5 [96]."*

Translation: durable rock slopes may be steeper than 1:1.5; rocks prone to weathering are sloped for their soil
properties, and then in any case flatter than 1:1.5. **Sourced.**

### 3.2 Brandecker's rock groups

Each group with its listed rocks. **Sourced.**

- **A:** sound, compact igneous and metamorphic rock (granite, basalt, gneiss), plus massive sediments
  (limestone, dolomite, strongly cemented conglomerate).
- **B:** unweathered, little-jointed igneous rock, massive limestone and dolomite, mineral-cemented sandstones
  and greywackes.
- **C:** weathered A/B rock with moderate jointing; *„Zwischenlagen von Mergelsteinen und tonigen Sandsteinen"*
  (marlstone and clayey-sandstone interbeds); less-consolidated *„Kalke, Mergel und Sandsteine des Tertiärs und
  aus Kreide"* (Tertiary and Cretaceous limestones, marls and sandstones).
- **D:** more weathered and jointed rock; *„Tonschiefer, mürbe Phyllite und Flyschgesteine und
  Wechsellagerungen von festen Sedimentgesteinen"* (shales, crumbly phyllites, flysch, interbeds of firm
  sediments).
- **E:** decomposed, strongly weathered rock; interbeds of limestone or sandstone with shale; *„Gesteine mit
  veränderlicher Festigkeit"* (rocks whose strength changes). *„… werden im Extrem wie Lockergesteine
  geböscht"* (at the extreme they are sloped like soil).

### 3.3 Brandecker's design slopes (Bild 16)

Read from the figure (`/tmp/q3/src/gbt_p32-032.png`), face V:H. **Derived (figure reading).**

| Group | 10 m | 20 m | 30 m | 40 m |
|---|---|---|---|---|
| A | 10:1 | 5:1 | 5:1 faces with berm | 5:1 faces, about 3:1 overall |
| B | 5:1 | 3:1 | 3:1 faces with berm | 3:1 faces, about 2:1 overall |
| C | 3:1 | 2:1 | 2:1 faces, about 1.5:1 overall | 2:1 faces, about 5:4 overall |
| D | about 3:2 (about 8 m) | 5:4 faces, about 1:1 overall | about 1:1 to 4:5 overall | — |

### 3.4 Limits of the method and berms

- The slopes hold only *„unter günstigen geologischen Randbedingungen"* (under favourable geological
  conditions). They do not apply where discontinuities are unfavourably oriented. **Sourced.**
- Berms are needed above 15 m height, normally 2–3 m wide; M Fels asks for at least 4 m where maintenance
  vehicles drive. **Sourced.**

### 3.5 Which rocks change strength with exposure

[Kauther & Günther, BAWMitteilungen 101 (2017)](https://izw.baw.de/publikationen/mitteilungsblaetter/0/06_MBl_101_Kauther.pdf),
page 47: *„Beispiele für veränderlich-feste Gesteine sind vor allen Dingen feinkörnige Sedimentgesteine wie
Tonsteine, Schluffsteine, tonig gebundene Sandsteine und Mergelsteine."* Translation: the main examples are
fine-grained sedimentary rocks such as claystones, siltstones, clay-cemented sandstones and marlstones.
**Sourced.**

### 3.6 Sources not obtained

- ZTV E-StB 17 and M Fels (the full text): only quoted second-hand.
- RVS 08.03.01: not available.
- ASFINAG Planungshandbuch Straße–Bau §6.2.1: says only that slopes steeper than 2:3 need special solutions or
  berms.

**UNVERIFIED** beyond the above.

## 4. Mapping to the ground profiles

The rule below is **Derived**:

1. **Sloped like soil:** rock that the Czech classification puts at R3–R5 when sound and that BAW / VL 2 432.02
   call clay-rich or weathering-prone. This applies VL 2 note 2 and M Fels; Brandecker group E.
2. **Brandecker D:** schistose or interbedded rock.
3. **Brandecker C:** clastic rock with clayey or calcareous cement, or Cretaceous sandstone.
4. **4:1 stays:** sound crystalline, carbonate and massive volcanic rock (A/B).

Engine benches stay as they are: 1 m every 5 m in rock, and 1 m every 6 m for soil-like slopes.

Overall slopes with 1 m benches every 5 m (**Derived**):

| Face | Overall | Comparable Brandecker value |
|---|---|---|
| 4:1 | ≈ 2.2:1 (66°) | between A and B at 20–40 m |
| 2:1 | ≈ 1.4:1 (55°) | C at 30 m: 1.5:1 |
| 5:4 | 1:1 (45°) | D at 20 m |

Caveats on the profile keys (from `pipeline/geology.py`):

- `phyllite` also takes Barrandian "jílovité břidlice" (shales).
- `igneous` also takes amphibolite, green schist, metabasalt and metadacite, which includes the faulted Jílové
  belt at D3 Luka.
- `gneiss` also takes "krystalická břidlice" (crystalline schist).
- Fault zones (D3 Luka at 1:1.25) are not a lithology effect, so no per-lithology rule captures them.

| Profile key | Class III slope | Sources | Confidence |
|---|---|---|---|
| perm_fine (Permian siltstone / claystone) | **Like soil: 1:1.75**, benches as soil (1:2 for cuts ≤ 2 m) | VL 2 301.04 note 2; M Fels via Adam p. 32; Brandecker E; BAW (claystones and siltstones change strength); VL 2 432.02 note 1; ČSN 73 6133 (sound claystone R3, weakly cemented R4–R5); I/33 Náchod Permian cut 1:2 | Medium |
| marl (Cretaceous marlstone / opuka) | **Like soil: 1:1.75**; 1:2–1:2.5 where water or slides | VL 2 note 2; R11 1108 EIA p. 68 (marlstones weather fast; flatter slopes); D35 Litomyšl–Janov DÚR (soil slopes per ČSN 73 6133, Z9 1:2.5); Malotová (R3→clay in one winter); BAW (Mergelsteine) | Medium-high |
| tuff (tuff / tuffite) | **Like soil: 1:1.75** | ČSN 73 6133: tuffites R3 or R5 when sound (semi-rock on either boundary); ČGS Vk "frequent changes"; VL 2 note 2. No direct slope source | Low-medium |
| carb_mixed (Carboniferous interbedded siltstone / claystone / sandstone; also the IG fallback for Sf) | **5:4 faces (≈ 1:1 overall)**; soil slope if claystone dominates | Brandecker D (interbeds of firm sediments) or E (sandstone with shale); ČGS Sf "prone to sliding on slopes"; R49 flysch 1:2.5 | Low-medium |
| phyllite (phyllite / mica schist; also Barrandian shales) | **5:4 faces (≈ 1:1 overall)**; up to about 3:2 for cuts ≤ 8–10 m | Brandecker D ("Tonschiefer, mürbe Phyllite"); VL 2 432.02 note 2 (mica schists, phyllites and shales not frost-resistant); ČSN 73 6133 (phyllites R2 sound, R4 chloritic or graphitic); I/44 rockfall in weathered mica schist. Against: ČGS Mn "stable" | Medium |
| perm_sand (Permian sandstone / arkose) | **2:1 faces** (3:1 acceptable for cuts ≤ 10 m) | Brandecker C (clayey sandstones, marl interbeds); ČGS Ss "strong"; I/33 thesis (calcareous, clayey or ferruginous cement); BAW (clay-cemented sandstone changes strength) | Low-medium |
| perm_congl (Permian conglomerate / breccia) | **2:1 faces** | Brandecker A covers only *strongly cemented* conglomerate; Permian red-bed matrix is clayey or ferruginous (I/33 thesis) → C | Low |
| carb_sand (Carboniferous sandstone / arkose / conglomerate) | **2:1 faces** | Brandecker B/C (mineral-cemented sandstone is B, clayey is C); ČGS Ss | Low-medium |
| cret_sand (Cretaceous / Triassic sandstone) | **2:1 faces** | Brandecker C names Cretaceous sandstones; R11 1108 EIA says sandstone cuts can be steeper than the template | Medium |
| gneiss (gneiss / crystalline schist) | **Keep 4:1** + 1 m benches every 5 m | Brandecker A (gneiss: 10:1–5:1 faces, 3:1 overall at 40 m); D8 km 90 about 75°; II/157 4:1. Fault zones excepted | Medium-high |
| hard (quartzite / metagreywacke / calc-silicate) | **Keep 4:1** | Brandecker A/B; ČSN 73 6133 quartzite R1 | Medium-high |
| carbonate (crystalline limestone / dolomite) | **Keep 4:1** | Brandecker A/B (massive limestone and dolomite); ČSN 73 6133 crystalline limestone R1. Karst not modelled | Medium-high |
| igneous (volcanic / intrusive / green schist) | **Keep 4:1** | Brandecker A/B (granite, basalt); ČGS Vl "weathering-resistant". Exception: the faulted Jílové-belt metavolcanics at D3 Luka used 1:1.25 | Medium (lower for green schist and metavolcanics) |

**Open:**

- No design-stage cut slopes were found for D11 1108/1109 in Permian rock. The ŘSD DÚR/DSP cross-sections would
  settle perm_fine and perm_sand.
- M Fels, ZTV E-StB 17 and RVS 08.03.01 were not read in the original.
- Whether perm_fine is really "fast-weathering" depends on whether the clay-rich red beds there slake. That is
  plausible per BAW and VL 2 432.02, but no local slake-durability data was found.
