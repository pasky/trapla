# D3 Posázaví: curveballs and real-world reveal

Research note, 2026-11-16. “Curveballs” below are playable translations of sourced events or real site constraints, not claims that the game reproduces a particular historic design decision. Coordinates marked approximate are map-level anchors, not surveyed footprints. Czech quotations are verbatim; glosses are English translations.

## Curveballs

### 1. `kamena-vrata-probe` — The mountain has a hollow
- **Section:** 0301 Praha–Jílové.
- **News from the site:** “News from the site: A test tunnel is probing the rock before the motorway tunnel is built.”
- **Date/source:** 27 November 2024, ŘSD news via [Ekonomický deník](https://ekonomickydenik.cz/rsd-spustilo-geotechnicky-pruzkum-pro-tunel-kamenna-vrata-na-budouci-casti-dalnice-d3/); [ŘSD 09/2025 leaflet](https://apdos.roadmedia.cz/Upload/Stavby/45/infoletak_d3-0301-praha-jilove.pdf).
- **Quote:** “Samotná ražba průzkumné štoly bude trvat 25 měsíců.” (“The excavation of the exploratory tunnel itself will take 25 months.”) Leaflet: “Tunel Kamenná Vrata, který je dlouhý 1690 m.” (“The Kamenná Vrata tunnel, which is 1,690 m long.”)
- **Where:** Kamenná Vrata tunnel corridor, west of Jílové u Prahy; point **49.9628, 14.4967**, radius 1.0 km; **approximate** map anchor for the corridor, not the tunnel alignment. This is within the map window and near the 0301 planned line. The leaflet and source establish the feature, but not a geodetic point.
- **Game rule:** **No cutting / no embankment in zone** (tunnel is fine). The real design is a tunnel through the hill; the probe is for ground knowledge, not evidence of a particular old mine or an exclusion zone.
- **Status:** documented D3 project event. Do not turn the nearby gold-mining history into a claim that the motorway hits a mine.

### 2. `sazava-deep-crossing` — The river cannot be filled
- **Section:** 0302 Jílové–Hostěradice.
- **News from the site:** “News from the site: The road must clear the Sázava valley on a long bridge.”
- **Date/source:** ŘSD leaflet, state 09/2025, [0302](https://apdos.roadmedia.cz/Upload/Stavby/44/infoletak_d3-0302-jilove-hosteradice.pdf).
- **Quote:** “Hluboké údolí Sázavy překonává trasa v km 12,5” (“The route crosses the deep Sázava valley at km 12.5”). The leaflet identifies the bridge as 787 m long.
- **Where:** river crossing at **49.86796, 14.47921**, radius 500 m; **approximate** crossing point. This coordinate was recorded in `research/25-d3-scenario.md` from the OSM river geometry and checked against the leaflet map. The crossing is near the planned line.
- **Game rule:** **The road must cross the zone on a bridge or in a tunnel.** The real design uses a long bridge to span the deep valley; filling across the river valley is not a credible alternative.
- **Status:** documented D3 design constraint.

### 3. `jilove-gold-workings` — Old workings below the hills
- **Section:** 0301 / 0302 boundary, near Jílové u Prahy.
- **News from the site:** “News from the site: Historic gold workings lie around Jílové; check the ground before digging.”
- **Date/source:** access-date 2026-11-16, [Jílovské zlaté doly official visitor site](https://www.jilovskezlatedoly.cz/); [Central Bohemian tourism entry](https://www.strednicechy.cz/zazitek/jilovske-zlate-doly/).
- **Quote:** “historická důlní díla jílovského zlatonosného revíru” (“historic mine workings of the Jílové gold-bearing district”), official site's description.
- **Where:** Důl Pepř / Jílové mining district, **49.895, 14.493**, radius 1.0 km; **approximate** district anchor, not a mine-workings polygon. The gold district is a real place near the corridor; no overlay proving a D3 intersection was found.
- **Game rule:** **No cutting / no embankment in zone** (a bridge over it is fine), as a conservative scenario precaution pending site-specific geotechnical records—not a claim that the real D3 crosses an abandoned void.
- **Status:** **NOT a documented D3 incident.** This is a sourced feature of the place, deliberately labelled as a hypothetical site constraint; do not present it as a confirmed alignment conflict.

### 4. `eia-redesign` — The plans had to change
- **Section:** corridor-wide; most useful as a whole-route event, anchored at 0302/0303 boundary.
- **News from the site:** “News from the site: The motorway design changed, so its environmental review had to be revisited.”
- **Date/source:** 10 December 2019, [Zdopravy.cz](https://zdopravy.cz/rsd-meni-podobu-dalnice-d3-pres-posazavi-a-miri-znovu-do-procesu-eia-38662/); [Ministry of Environment EIA record/news, 3 February 2012](https://mzp.gov.cz/cz/pro-media-a-verejnost/aktuality/archiv-tiskovych-zprav/dalnice-d3-stredoceska-cast-ziskala-kladne).
- **Quote:** “Ředitelství silnic a dálnic mění technické řešení.” (“The Road and Motorway Directorate is changing the technical solution.”) MŽP: “Souhlasné stanovisko je podmíněno splněním 172 podmínek” (“The favourable opinion is conditional on meeting 172 conditions”).
- **Where:** corridor-wide zone: **A 49.962545, 14.496702; B 49.54341, 14.665286**, buffered 1.5 km around the planned line; **approximate** route envelope. The 2019 design change is not a single localized impact.
- **Game rule:** **Tightened noise limit.** Environmental review requires impacts to be assessed and conditions to be met, so a stricter local noise target is a plausible gameplay constraint; its numeric value and exact affected receptors are **UNVERIFIED** here. Do not claim that the 2019 redesign itself set a new noise limit.
- **Status:** documented D3 planning history. The EIA was granted in 2012 and its validity was later extended; the 2019 story does not establish that the whole EIA was annulled or that a replacement corridor EIA was completed.

### 5. `krnany-valley-bridge` — A second valley bridge
- **Section:** 0303 Hostěradice–Václavice, Sázava valley approach.
- **News from the site:** “News from the site: The planned motorway crosses a side valley on a 117-metre bridge.”
- **Date/source:** ŘSD leaflet, state 09/2025, [0303](https://apdos.roadmedia.cz/Upload/Stavby/43/infoletak_d3-0303-hosteradice-vaclavice.pdf).
- **Quote:** “V km 15,5 je navržen dálniční most přes údolí o délce 117 m” (“At km 15.5 a 117 m motorway bridge over a valley is proposed.”)
- **Where:** D3 0303 project km 15.5, **49.850, 14.480**, radius 1.0 km; **approximate** stationing-to-map anchor, not a surveyed point.
- **Game rule:** **The road must cross the zone on a bridge or in a tunnel.** This matches the proposed bridge over the valley; the precise structure design/length is not claimed here.
- **Status:** documented D3 design feature; the coordinate is not independently geocoded.

### 6. `zderadicky-ecoduct` — Wildlife needs a crossing
- **Section:** 0304 Václavice–Voračice.
- **News from the site:** “News from the site: A green bridge will keep a wildlife route open.”
- **Date/source:** ŘSD leaflet, state 09/2025, [0304](https://apdos.roadmedia.cz/Upload/Stavby/42/infoletak_d3-0304-vaclavice-voracice.pdf).
- **Quote:** “ekodukt” (“wildlife overpass / green bridge”); the leaflet locates one near Homole and Šibinka and separately says “v km 35,808 navržen 46 m dlouhý dálniční most přes biokoridor” (“at km 35.808 a 46 m motorway bridge over a biocorridor is proposed”).
- **Where:** 0304 km 35.808 biocorridor crossing, **49.660, 14.620**, radius 1.0 km; **approximate** stationing-to-map anchor only, not a surveyed coordinate. The leaflet map and the route line locate the feature within 0304; the exact km-to-coordinate projection was not supplied by ŘSD.
- **Game rule:** **The road must cross the zone on a bridge or in a tunnel.** This reflects the planned bridge over the mapped biocorridor. The leaflet also includes a wildlife overpass; do not conflate the two crossings.
- **Status:** documented D3 design feature, not an invented animal sighting.

### 7. `mastnik-valley-bridge` — A stream valley needs a span
- **Section:** 0305/I Voračice–Nová Hospoda.
- **News from the site:** “News from the site: The motorway crosses the Mastník valley on an elevated span.”
- **Date/source:** ŘSD leaflet, state 09/2025, [0305/I](https://apdos.roadmedia.cz/Upload/Stavby/41/infoletak_d3-0305-I-voracice-nova%20hospoda.pdf).
- **Quote:** “925 metrů dlouhá estakáda přes údolí potoka Mastník” (“a 925-metre viaduct across the Mastník stream valley”).
- **Where:** Mastník valley crossing, roughly between Styrov and Horní Borek, **49.620, 14.650**, radius 1.2 km; **approximate** corridor anchor, not exact bridge endpoints. Section-map location only.
- **Game rule:** **The road must cross the zone on a bridge or in a tunnel.** This matches the actual long viaduct; a deep embankment through the valley would not reproduce the project solution.
- **Status:** documented D3 design feature.

## What really happened

Status and cost below distinguish the 09/2025 construction leaflets from later public reporting. Leaflet costs are estimates, all **excluding VAT**. The five 09/2025 figures total **CZK 71.5 billion** (simple sum); this is not the same as the Ministry's later rounded headline of CZK 75 billion. Designation “0305/I” and project chainage refer to ŘSD construction packages, not the game map's measured span.

| Mission | Real price / status | Reveal line (≤25 words) |
|---|---|---|
| 0301 Praha–Jílové | **CZK 12.9bn**; 9.514 km, leaflet 09/2025. EIA in place; territorial proceeding announced 20 Aug 2025; ŘSD later announced territorial decision for this first section on 28 Nov 2025. Construction was not underway in that report. Sources: [leaflet](https://apdos.roadmedia.cz/Upload/Stavby/45/infoletak_d3-0301-praha-jilove.pdf), [ČTK](https://www.ceskenoviny.cz/zpravy/2753416). | The first stretch has its planning decision, but the motorway still needs permits and construction. |
| 0302 Jílové–Hostěradice | **CZK 8.1bn**; 4.486 km; 787 m Sázava bridge and Luka tunnel; leaflet 09/2025. Permit preparation was ongoing; detailed geotechnical work for the Sázava bridge was being prepared. | A long bridge clears the Sázava valley, with the Luka tunnel through the hill beyond. |
| 0303 Hostěradice–Václavice | **CZK 14.5bn**; 11.292 km; leaflet 09/2025. Permit documentation was being prepared; anticipated DSP concept by November 2025 in leaflet. | Tunnels and bridges carry the route onward through the hills toward Václavice. |
| 0304 Václavice–Voračice | **CZK 17.5bn**; 15.840 km; leaflet 09/2025. Territorial proceeding announced 12 Sep 2024; the leaflet reports a DSP concept and targeted clean copy by October 2025. ŘSD announced geotechnical exploration for Prostřední Vrch in 2026. Sources: [leaflet](https://apdos.roadmedia.cz/Upload/Stavby/42/infoletak_d3-0304-vaclavice-voracice.pdf), [Ministry of Transport 2026](https://md.gov.cz/Media/Media-a-tiskove-zpravy/Zacina-geotechnicky-pruzkum-pro-tunel-Prostredni-V). | A new tunnel and wildlife crossings are part of the planned passage from Václavice to Voračice. |
| 0305/I Voračice–Nová Hospoda | **CZK 18.5bn**; 17.360 km; leaflet 09/2025. Territorial proceeding announced 17 Jun 2024; DSP concept issued March 2025 and permit preparation continued. | The last new section crosses the Mastník valley before joining the existing motorway. |
| Whole route (0301–0305/I) | Leaflet estimates sum to **CZK 71.5bn** excluding VAT. Ministry of Transport's 23 Apr 2025 page described the Central Bohemian D3 as **58.5 km**; a Jan 2026 Seznam Zprávy report used a rounded **CZK 75bn**. EIA: favourable 2012 opinion with 172 conditions; validity extended in 2024 to 1 Feb 2027. The 2019 technical changes led to renewed EIA-process reporting, but the 2012 opinion was not thereby “annulled”; no evidence here supports that broad claim. In late 2025, 0301 received a territorial decision; remaining sections were still in preparation. ŘSD said it wanted construction to start in 2028, not that work had begun. Sources: [MŽP EIA](https://mzp.gov.cz/cz/pro-media-a-verejnost/aktuality/archiv-tiskovych-zprav/dalnice-d3-stredoceska-cast-ziskala-kladne), [ŘSD EIA extension](https://www.stredoceskad3.cz/stredoceska-d3-ma-prodlouzenou-platnost-eia/), [Ministry status](https://md.gov.cz/Media/Media-a-tiskove-zpravy/Aktualni-stav-pripravy-stredoceske-D3), [Seznam Zprávy, 21 Jan 2026](https://www.seznamzpravy.cz/clanek/domaci-stredoceska-d3-bude-stat-75-miliard-razi-se-prvni-stola-pro-tunel-u-prahy-296759). | The planned 58.5-kilometre motorway crosses the Sázava country; its permits are advancing, but the route is not yet built. |

**Coordinate caveat:** only the Sázava point is supported by a checked OSM geometry coordinate (`research/25-d3-scenario.md`). Other curveball points are approximate anchors from map reading and section geography; verify them against the current OSM proposed D3 line / leaflet maps before implementing spatial triggers. Do not treat the approximate radius as a legally mapped feature boundary.

## Summary table

| id | section | headline | rule | location precision | source |
|---|---|---|---|---|---|
| `kamena-vrata-probe` | 0301 | The mountain has a hollow | No cut / embankment | Approximate, 1 km radius | [Ekonomický deník](https://ekonomickydenik.cz/rsd-spustilo-geotechnicky-pruzkum-pro-tunel-kamenna-vrata-na-budouci-casti-dalnice-d3/) |
| `sazava-deep-crossing` | 0302 | The river cannot be filled | Must bridge or tunnel | Approximate, 500 m radius | [ŘSD 0302 leaflet](https://apdos.roadmedia.cz/Upload/Stavby/44/infoletak_d3-0302-jilove-hosteradice.pdf) |
| `jilove-gold-workings` | 0301/0302 | Old workings below the hills | No cut / embankment | Approximate district, 1 km; not D3 incident | [Jílovské zlaté doly](https://www.jilovskezlatedoly.cz/) |
| `eia-redesign` | Whole corridor | The plans had to change | No physical rule justified | Approximate corridor envelope | [Zdopravy](https://zdopravy.cz/rsd-meni-podobu-dalnice-d3-pres-posazavi-a-miri-znovu-do-procesu-eia-38662/) |
| `krnany-valley-bridge` | 0303 | A second valley bridge | Must bridge or tunnel | Approximate stationing anchor, 1 km | [ŘSD 0303 leaflet](https://apdos.roadmedia.cz/Upload/Stavby/43/infoletak_d3-0303-hosteradice-vaclavice.pdf) |
| `zderadicky-ecoduct` | 0304 | Wildlife needs a crossing | Must bridge or tunnel | Approximate stationing anchor, 1 km | [ŘSD 0304 leaflet](https://apdos.roadmedia.cz/Upload/Stavby/42/infoletak_d3-0304-vaclavice-voracice.pdf) |
| `mastnik-valley-bridge` | 0305/I | A stream valley needs a span | Must bridge or tunnel | Approximate valley anchor, 1.2 km | [ŘSD 0305/I leaflet](https://apdos.roadmedia.cz/Upload/Stavby/41/infoletak_d3-0305-I-voracice-nova%20hospoda.pdf) |

## Round 2: located curveballs

This pass compares candidates with the supplied starting polyline. Distances are shortest point-to-segment estimates in a local metric projection. **Not located** means no coordinate/distance is asserted and the lead is not ready for a spatial trigger; Round 1's approximate anchors are not promoted to exact geometry.

### 1. `kamena-vrata-portals-check` — The probe is under way
- **Section:** 0301 D0–Jílové.
- **News from the site:** “News from the site: A test tunnel probes the hill before the motorway tunnel.”
- **Date/source:** 27 November 2024, [ŘSD project news](https://www.dalniced3.cz/novinky/z-tisku/byl-zahajen-geotechnicky-pruzkum-pro-tunel-kamenna-vrata-d3-0301); [technical paper](https://www.ita-aites.cz/files/Seminare/2024/to_3_24/menger-pruzkumne-stoly-d3.pdf).
- **Quote:** “Průzkumná štola bude mít délku 1 617 m.” (“The exploratory gallery will be 1,617 m long.”) Paper: “Průzkumná štola bude vedena v ose levé tunelové trouby tunelu Kamenná Vrata.” (“The exploratory gallery will follow the axis of the left tunnel tube of the Kamenná Vrata tunnel.”)
- **Geometry/distance:** **Portals not located.** Old rough point `49.9628, 14.4967` is 29 m from line but is only a hill/corridor anchor—not a portal or alignment—and is not offered as event geometry.
- **Rule:** No cut or fill on a verified footprint; presently **no playable rule** pending portal/alignment coordinates.
- **Status:** documented D3 event; exact geometry unverified.

### 2. `sazava-bridge-crossing` — The river needs a span
- **Section:** 0302 Jílové–Hostěradice.
- **News from the site:** “News from the site: A long bridge carries the motorway across the Sázava valley.”
- **Date/source:** ŘSD leaflet, state 09/2025, [0302](https://apdos.roadmedia.cz/Upload/Stavby/44/infoletak-d3-0302-jilove-hosteradice.pdf); checked OSM river point recorded in `research/25-d3-scenario.md`.
- **Quote:** “Hluboké údolí Sázavy překonává trasa v km 12,5.” (“The route crosses the deep Sázava valley at km 12.5.”)
- **Geometry/distance:** Point **49.86796, 14.47921**, radius **0 m** (river point, not the bridge footprint); **84 m** from supplied line. Bridge endpoints need a design drawing.
- **Rule:** **Must cross on a bridge or in a tunnel**; documented design, not a legally defined exclusion buffer.
- **Status:** documented D3 design feature; point is not surveyed bridge geometry.

### 3. `jilove-mine-sites-check` — Gold workings are not a pin
- **Section:** 0301/0302, Jílové area.
- **News from the site:** “News from the site: Historic gold mines are part of Jílové’s story, but their map matters.”
- **Date/source:** undated, [Jílovské zlaté doly](https://www.jilovskezlatedoly.cz/); [ČGS mine-workings register](https://mapy.geology.cz/dulni_dila/).
- **Quote:** “Důl Pepř je součástí historicky nejvýznamnějšího českého zlatonosného revíru.” (“Pepř Mine is part of the historically most important Czech gold-bearing district.”)
- **Geometry/distance:** No individual register working within 1 km verified. Prior rough district point `49.895, 14.493` is about **1,518 m** from supplied line; it does not establish a sub-1-km conflict. Specific workings **not located**.
- **Rule:** None until a specific adit/shaft and extent are verified; no blanket district exclusion.
- **Status:** real feature of the place, not a documented D3 event.

### 4. `sazava-noise-wall-check` — Noise walls are in the design
- **Section:** 0302, Sázava crossing.
- **News from the site:** “News from the site: The Sázava bridge has noise walls on both sides.”
- **Date/source:** [Středočeská D3 project Q&A](https://www.stredoceskad3.cz/otazky-a-odpovedi/); [ŘSD 0302 leaflet](https://apdos.roadmedia.cz/Upload/Stavby/44/infoletak-d3-0302-jilove-hosteradice.pdf).
- **Quote:** “Po obou stranách mostu Sázava jsou navrženy protihlukové stěny o výšce 3m.” (“Three-metre noise barriers are proposed on both sides of the Sázava bridge.”)
- **Geometry/distance:** Bridge-area pin **49.86796, 14.47921**, **84 m** from line. Wall ends/footprint **not located**; pin locates bridge only.
- **Rule:** No invented noise budget or wall polygon. Use 3 m walls only after georeferencing the design footprint; otherwise no spatial trigger.
- **Status:** documented D3 design feature, geometry incomplete.

### 5. `eia-conditions-location-check` — EIA conditions need a map
- **Section:** corridor-wide; no single site assigned.
- **News from the site:** “News from the site: The environmental opinion came with conditions for the project.”
- **Date/source:** 3 February 2012, [MŽP EIA announcement](https://mzp.gov.cz/cz/pro-media-a-verejnost/aktuality/archiv-tiskovych-zprav/dalnice-d3-stredoceska-cast-ziskala-kladne).
- **Quote:** “Souhlasné stanovisko je podmíněno splněním 172 podmínek.” (“The favourable opinion is conditional on meeting 172 conditions.”)
- **Geometry/distance:** Announcement does not locate individual conditions; **not located**, distance not computable. Condition count is not a route-wide spatial feature.
- **Rule:** None until a numbered condition and its map/site are verified.
- **Status:** documented D3 planning history; no located EIA condition found in this pass.

### 6. `evl-sazava-check` — Do not put an EVL on the river
- **Section:** 0302 vicinity.
- **News from the site:** “News from the site: The EIA describes the Sázava EVL upstream of the project area.”
- **Date/source:** [CENIA Natura 2000 assessment](https://portal.cenia.cz/eiasea/download/U0VBX1NUQzY4OUZfTmF0dXJhXzEyNzkzODU5NTUyOTI5NjI0ODYucGRm/STC689F_Natura.pdf); [AOPK EVL register](https://drusop.nature.cz/ost/chrobjekty/evl/index.php?SHOW_ONE=1&CIS=2523).
- **Quote:** “EVL Sázava. … EVL proti proudu řeky Sázavy od zájmového území.” (“Sázava SAC … upstream along the Sázava River from the area of interest.”)
- **Geometry/distance:** No boundary intersection or nearest-boundary coordinate verified; **not located**. Do not treat bridge pin as an EVL coordinate.
- **Rule:** None absent official boundary overlay and demonstrated proximity.
- **Status:** real protected-area feature referenced by project assessment; no confirmed line conflict.

### 7. `municipal-objection-site-check` — Objections need a named place
- **Section:** corridor-wide lead; exact municipality/site unestablished.
- **News from the site:** “News from the site: Residents challenged the route, but petition sites do not locate a constraint.”
- **Date/source:** [Alternativa D3 territorial-proceeding notice](https://www.alternativad3.cz/uzemni-rizeni/1/171).
- **Quote:** “téměř 700 občanů podepsalo hromadné námitky na 12 petičních místech” (“nearly 700 residents signed collective objections at 12 petition sites”).
- **Geometry/distance:** Source does not identify one village's requested change or affected parcel; **not located**, distance not computable. It does not support attributing an objection to a specific municipality.
- **Rule:** None until objection text identifies a place and concrete request.
- **Status:** documented opposition to D3, not a located municipal constraint.

### 8. `posazavi-archaeology-check` — No local find verified
- **Section:** 0301–0305/I.
- **News from the site:** “News from the site: No rescue excavation or find on this corridor was verified.”
- **Date/source:** checked 16 November 2026; reported D3 burial mounds are at Plav on the České Budějovice bypass ([ČT24](https://ct24.ceskatelevize.cz/clanek/veda/archeologove-odkryli-tri-mohyly-z-doby-bronzove-na-trase-budouci-dalnice-d3-92788)).
- **Quote:** “u Plavu na Českobudějovicku” (“near Plav in the České Budějovice region”).
- **Geometry/distance:** No qualifying Středočeská D3 find located; **not located**. Plav is outside this scenario.
- **Rule:** None; archaeological potential alone is not a located event.
- **Status:** no qualifying event verified.

### 9. `near-route-monument-check` — No monument pin cleared
- **Section:** 0301–0305/I.
- **News from the site:** “News from the site: A listed building needs a verified coordinate before it becomes a map constraint.”
- **Date/source:** checked 16 November 2026; [Jílové monument list](https://cs.wikipedia.org/wiki/Seznam_kulturn%C3%ADch_pam%C3%A1tek_v_J%C3%ADlov%C3%A9m_u_Prahy) and [Benešov district list](https://cs.wikipedia.org/wiki/Seznam_kulturn%C3%ADch_pam%C3%A1tek_v_okrese_Bene%C5%A1ov).
- **Quote:** “Seznam kulturních památek v Jílovém u Prahy” (“List of cultural monuments in Jílové u Prahy”).
- **Geometry/distance:** No specific listed monument within 500 m of supplied line verified; **not located**, no distance asserted. Municipality-wide list does not establish proximity.
- **Rule:** None until asset and coordinate are checked; use its footprint, not an assumed legal buffer.
- **Status:** research lead, not a confirmed curveball.

**Round 2 disposition:** only the Sázava bridge pin is currently a located spatial trigger, although full bridge geometry remains to be obtained. Kamenná Vrata is documented but its portals remain unlocated. Other candidates are explicitly unlocated or outside the 1 km claim, not assigned fabricated coordinates. To locate events in 0303, 0304 and 0305/I, georeference the 09/2025 design drawings or obtain project GIS/CAD before spatially triggering bridge/ecoduct features.
