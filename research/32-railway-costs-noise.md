# Czech railway cost norms and railway-noise evidence

Research date: 2026-11-15. Scope: Czech conventional railway route-design game; study-stage cost inputs and a defensible railway-noise calculation basis. This is source research, not a cost estimate or acoustic compliance assessment. Prices below are official study-stage unit norms where explicitly listed. They are not complete route costs.

## Findings at a glance

- **A current study-stage rail pricing database exists.** SFDI publishes SPOŽES, the *Sborník pro oceňování železničních staveb ve stupni studie*, in the CDDS cost databases. The 2026 functional workbook is downloadable from the official SFDI page.
- Its 2026 unit-price table does give useful rates for track, subgrade structural layers, overhead contact line, rail bridges, and one-/two-track tunnels, but **not a complete line-km norm**. It does not warrant summing selected partial rates and calling them a complete railway cost.
- The workbook labels its cost level **2026** and records VAT separately as **21%**; its unit rate column is in million CZK per stated unit. Treat listed rates as **excluding VAT** (the workbook's project financing table separately labels “tis. Kč (bez DPH)” and “tis. Kč (vč. DPH)”).
- Czech strategic-noise mapping used Dutch RMR II for rail in rounds 1–2, but the official Ministry page says the common EU method became mandatory from **31 December 2018**. For strategic maps the relevant current method is CNOSSOS-EU rail (Directive 2015/996 Annex II, amended by 2021/1226).
- No verified, compact Czech hygienic-assessment railway source-emission table (e.g. train-category SEL or LAeq at 25 m as a speed/length function) or representative regional/mainline day/night train-count table was recovered. Do not invent one. A statutory receptor limit is not an emission input.

## A. Costs

### Official study-stage source and price level

SFDI's [SPOŽES page](https://sfdi.gov.cz/cenove-databaze/spozes/) calls SPOŽES the “**Sborník pro oceňování železničních staveb ve stupni studie**” and identifies it as part of the *Cenové databáze pro investiční přípravu dopravních staveb (CDDS)*. The page makes available a [2026 functional workbook](https://sfdi.gov.cz/wp-content/uploads/2026/04/260429-funkcni-spozes.xlsx) (file change log dated 27 April 2026) and a [2026 SPOŽES ZIP package](https://sfdi.gov.cz/wp-content/uploads/2026/04/spozes-1.zip). SŽ's [cost-database page](https://www.spravazeleznic.cz/stavby-zakazky/modernizace/cenove-databaze) directs users to the SFDI-hosted databases.

This definitively answers “does a study-stage railway price book exist?” **Yes.** It is not a blanket price per route-km. The workbook's `Tabulka propočtu` sheet labels columns “Sazba (mil.Kč/m.j)” and “Přepočet sazby v CU2026 (mil.Kč/m.j)”; its `Zadání` sheet sets “Cenová úroveň 2026” and lists DPH 0.21. The row rates below are as shown in the workbook (million CZK/unit), with CU2026 equal to the stated rate. Quote from its instruction sheet: “Všechny individuální kalkulace, Redukční koeficienty jiné než 1 je nutno řádně zdůvodnit”. These are study-stage appraisal norms subject to selecting the applicable project assumptions, not tender bids or guaranteed outturn prices.

### Verifiable unit rates (SPOŽES 2026)

No page numbers apply to the source spreadsheet; sheet and row item codes identify each figure. Rates converted to CZK are shown alongside the source's million-CZK notation.

| Item | SPOŽES item and exact unit | CU2026 rate | What the item represents / limits |
|---|---|---:|---|
| New ballasted track / superstructure | `E02`, “Kolej, nová, štěrkové lože”, **m koleje** | **0.0220 mil. CZK/m = 22,000 CZK per track-m = 22.0m CZK per track-km** | New conventional track with ballast as grouped by this norm. It is per **track**, not per route-km. It is not the complete substructure, signalling, electrification or land cost. Do not interpret it as a separately priced rail/ballast bill of quantities; no further internal component breakdown is given on this row. |
| Formation structural layers (≤160 km/h) | `F03`, “Konstrukční vrstvy pražcového podloží - traťová rychlost do 160 km/h”, **m koleje** | **0.0123 mil. CZK/m = 12,300 CZK per track-m = 12.3m CZK per track-km** | Priced structural layers of sleeper support. It is not full earthworks, land, drainage, or all formation preparation. The workbook has speed alternatives F01–F04; use the matching project class. |
| Track+F03 arithmetic subtotal, single track | E02 + F03, per track-km | **34.3m CZK/track-km** | Arithmetic of two separate listed items only—not a complete new-line norm and not inclusive of unpriced earthworks/structures, signalling, traction power, stations, etc. A double-track application would be twice this **per track length** only if both tracks receive the same quantities and no shared/geometry effects are modelled: 68.6m CZK per route-km for these two items only. |
| Overhead contact line, AC, line | `N04`, “Trakční vedení, střídavá soustava (trať)”, **km koleje** | **13.3103 mil. CZK/km track = 13.3103m CZK per electrified track-km** | Separate overhead-line profession. Not substations/feeding network: separate C-profession items include traction substation technology. No claim that it covers all electrification works beyond the item definition. For two tracks, simple item arithmetic is 26.6206m per route-km if both are equipped; shared support arrangements need project-specific treatment. |
| Overhead contact line, DC, line | `N02`, “Trakční vedení, stejnosměrná soustava (trať)”, **km koleje** | **17.6113m CZK per electrified track-km** | Same caveats; do not confuse with AC. Stations have different items N01/N03. |
| New railway bridge up to 40 m | `H01`, “Nový železniční most - do 40 m”, **m²** | **0.0868 mil. CZK/m² = 86,800 CZK/m²** | The norm is by bridge area, not bridge-metre. To derive a bridge metre price requires an explicit priced deck width: cost per metre = 86,800 × deck width in m CZK/m. It says nothing about whether a particular project needs this type, approach works, foundations, or auxiliary systems. |
| New railway bridge over 40 m / viaduct | `H02`, “Nový železniční most - nad 40 m, estakáda”, **m²** | **0.1734 mil. CZK/m² = 173,400 CZK/m²** | Separate higher category; same area-to-length caveat. Do not use H01 for long viaducts. |
| Tunnel, new, single-track, outside urban area | `J01`, “Tunel - novostavba, 1-kolejný v extravilánu”, **bm** | **0.8475 mil. CZK/m = 847.5m CZK per tunnel-km** | Source unit is linear metre. “Extravilán” norm. This is a tunnel construction item, not a full route or total project cost. |
| Tunnel, new, single-track, urban area | `J02`, “Tunel - novostavba, 1-kolejný v intravilánu”, **bm** | **1.1949m CZK/m = 1,194.9m CZK per tunnel-km** | Context-specific higher norm. |
| Tunnel, new, double-track, outside urban area | `J03`, “Tunel - novostavba, 2-kolejný v extravilánu”, **bm** | **1.9209m CZK/m = 1,920.9m CZK per tunnel-km** | Two-track tunnel (one shared double-track tube in item description), not a pair of single-track tubes. Do not transfer to two separate bores. |
| Tunnel, new, double-track, urban area | `J04`, “Tunel - novostavba, 2-kolejný v intravilánu”, **bm** | **2.8183m CZK/m = 2,818.3m CZK per tunnel-km** | Context-specific higher norm. |
| Railway train-control (not a route-wide total) | `A04` / `A05`, TZZ single-/double-track, **km tratě** | **3.7511m / 5.9218m CZK per route-km** | Separate signalling item: “TZZ - jednokolejná trať” / “TZZ - dvoukolejná trať”. ETCS is separate item A09 at 2.6051m CZK per km of track. The listed TZZ items should not be treated as all train-control or safety systems. |

Thus the database does provide a direct unit price for overhead line and classified bridges/tunnels, plus per-track track construction, but it does **not** give a single “complete new single/double track per km” nor identify a total scope in which the rows above alone include signalling, electrification, stations, drainage and earthworks. Stations and other professions are separately represented in the workbook. The entire cell/item descriptions should govern inclusion; do not fabricate inclusions from the broad category name.

### Other sources and why not used as item-rate substitutes

The older SFDI [“Cenové normativy pro ocenění železničních staveb ve stupni IZ” PDF](https://sfdi.gov.cz/wp-content/uploads/2024/05/2013-cenove-normativy-2012-09.pdf) proves that earlier rail-specific normatives existed, but it is a 2012/2013-era document and has been superseded for current appraisal by the current SPOŽES database. SFDI's 2025 database announcement confirms annual database approval, but the 2026 SPOŽES workbook is more current for this research date.

The newly approved [Praha–Beroun feasibility-study announcement](https://www.spravazeleznic.cz/aktuality/-/asset_publisher/qSujQZ8W3r0i/content/studie-proveditelnosti-nove-trati-praha-beroun-je-schvalena?inheritRedirect=false) says total new route length is **26.3 km**, with **24.8 km in tunnel**, and “pro každou traťovou kolej bude ...” a separate tunnel (single-track tubes). The public announcement is not itself a priced item schedule. Media reports of its total estimated project costs do not establish separate cost rates for open line, bridge, tunnel, signalling or electrification. I therefore do **not** divide a project total by kilometres and call it a unit rate.

## B. Railway noise

### Legal hygienic limits are not source emission

Current NV 272/2011 Sb. [consolidated text](https://www.zakonyprolidi.cz/cs/2011-272), §12(3) and Annex 3 Part A, is the legal receptor-limit framework described in `research/23-railway-evidence.md`. It gives hygienic levels/corrections at protected receivers; those are **not** train SEL, sound power, reference-distance LAeq or a means to compute attenuation. For the ordinary protected outdoor-space case described there, a newly permitted railway has the cited 60 dB day / 55 dB night limits, subject to the actual legal correction and project status. Do not use this as an emission level.

### Calculation methods: official status and what can be reproduced

The Ministry of Health's official [“Metodiky výpočtu SHM” page](https://mzd.gov.cz/metodiky-vypoctu-shm/) states that Czech rounds 1 and 2 of strategic noise mapping used the Dutch railway method RMR II, *Rekenen Meetvoorschrift Railverkeerslawaai 96* (20 November 1996), under the methods recommended by Directive 2003/613/EC. It then states that Directive 2015/996 defined a new common EU method and that Member States were “**od 31.12.2018 ... povinny tyto metody používat**” (required to use these methods from 31 December 2018). For current strategic mapping the EU method is CNOSSOS-EU, rail source model in Annex II of [Commission Directive (EU) 2015/996](https://eur-lex.europa.eu/eli/dir/2015/996/oj), as amended by [Commission Delegated Directive (EU) 2021/1226](https://eur-lex.europa.eu/eli/dir_del/2021/1226/oj). The consolidated method is accessible via [EUR-Lex CELEX 02015L0996](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02015L0996).

This method is for **strategic noise mapping**, with long-term indicators and specified source/propagation modelling. It is not automatically identical to every hygienic assessment practice under Czech health law. Older Czech hygienic-study documents citing a Czech “Novela metodiky pro výpočet hluku ze železniční dopravy” should not be represented as the legally current strategic-map method without checking the assessment's governing requirement. MZ's page verifies a change in strategic-map method, not that every environmental/hygienic acoustic assessment must use CNOSSOS.

### CNOSSOS equations: exact model form, not a guessed 25 m level

CNOSSOS represents a railway source by **sound power per unit length** for octave bands, by source height and vehicle category. It does not supply one universal “train at 25 m” LAeq independent of train composition, track, speed, length and propagation. In the rail section of Annex II, the source term combines rolling, traction, aerodynamic and impact contributions energetically; it is built from vehicle-category emission coefficients and operating conditions. Train traffic is then converted to equivalent continuous levels over the relevant period, and propagation is computed separately under the method's propagation model.

The core energy aggregation is:

`L_total = 10 log10(Σ_i 10^(L_i/10)) dB`,

where `L_i` are mutually independent A-weighted or band-specific contributions on the same reference basis. For a category with a repeated number `N` of acoustically equal pass-bys, adding the event energy raises the period equivalent by `10 log10(N)` relative to one event after division by the period duration; durations must be in consistent units. For an individual event exposure level `L_AE` (SEL, dB re 20 μPa²·s), `L_Aeq,T = L_AE + 10 log10(N t_0/T)` where `t_0=1 s`, `N` is number of events during period T, T is in seconds, and all events are assumed identical. For variable events, sum `10^(L_AE,j/10)` before applying `10 log10(t_0/T · …)`. This is the energy definition, not a Czech railway empirical emission formula.

CNOSSOS railway source-category tables and formulas require the applicable rolling-stock category, speed, track-support/roughness parameters and source component; they do **not** reduce to passenger EMU / locomotive-hauled / freight with cast-iron/composite brakes using one verified Czech SEL-at-25-m table. The EU annex's rolling-noise source-power terms use speed-dependent coefficients and reference-speed scaling (in the relevant category-specific expressions proportional to `a + b log10(v/v_ref)` in dB), with track and vehicle roughness contributions and separate contact/track components; traction, aerodynamic and impact sources are added where applicable. Exact application requires following the full consolidated Annex II category tables and spectral equations, not replacing absent inputs with representative values.

The research did not extract every Annex II spectral coefficient here and did not find an official Czech hygienic-study table giving SEL/LAeq at 25 m by train type and speed. Consequently, no numerical passenger/freight emission levels, ballasted-vs-slab correction, bridge correction, or composite-brake correction are asserted. A model implementation needs a validated source dataset/method and a separate propagation calculation. **No simple `LAeq(25 m) = ...` equation is verified here.**

### Track corrections, propagation and train counts

- **Track type:** no Czech official source found in this pass supports a single flat correction for ballasted track versus slab track suitable for the game. CNOSSOS resolves track/vehicle roughness and track-support contributions with category data; do not paste in an unsupported universal correction.
- **Bridges:** no verified Czech railway bridge correction found. Any bridge-specific correction needs source and bridge type; avoid importing a road bridge correction.
- **Brake type:** no verified Czech per-train SEL correction separating cast-iron and composite freight brakes found. Modern brake/roughness category treatment depends on the selected CNOSSOS vehicle assumptions and parameters.
- **Propagation:** CNOSSOS separates emitted source power from propagation to receivers (geometrical divergence, atmospheric absorption, ground effect, screening/reflection under its prescribed method). It is not a fixed-distance emission table. Apply the exact annex's source heights, octave bands, ground/meteorological assumptions and receiver geometry if claiming strategic-map compatibility.
- **Typical train counts:** no official, source-stated “typical regional mixed line” and “main corridor” day/night counts recovered. Actual Czech line counts vary widely; published project timetables/strategic maps or SŽ operational data are needed for each scenario. Do not adopt a guessed universal train count. Keep traffic count as a sourced/explicit scenario input, separately day/night and by train category.

### Noise-law linkage and recommended boundary

Keep these concepts separate in the game data model: (1) train count and type by period, (2) source emission method and rolling-stock/track inputs, (3) propagation, and (4) legal receiver limit/correction. The lawful limit should not be reverse-engineered into train emission. Unless a Czech acoustic specialist validates the model and category inputs, label any gameplay railway-noise output provisional; do not present it as hygienic assessment or CNOSSOS compliance.

## Sources

1. SFDI, [SPOŽES](https://sfdi.gov.cz/cenove-databaze/spozes/) (official database description and downloads; accessed 2026-11-15).
2. SFDI, [SPOŽES functional workbook 2026](https://sfdi.gov.cz/wp-content/uploads/2026/04/260429-funkcni-spozes.xlsx), especially sheets `Changelog`, `Návod`, `Zadání`, `Tabulka propočtu`; source item codes E02, F03, N02/N04, H01/H02, J01–J04, A04/A05/A09.
3. Správa železnic, [Cenové databáze](https://www.spravazeleznic.cz/stavby-zakazky/modernizace/cenove-databaze) (official direction to SFDI-hosted databases).
4. SFDI, [older railway cost norms, price-level document](https://sfdi.gov.cz/wp-content/uploads/2024/05/2013-cenove-normativy-2012-09.pdf) (historical, not substituted for 2026 SPOŽES).
5. Ministry of Health, [Metodiky výpočtu SHM](https://mzd.gov.cz/metodiky-vypoctu-shm/) (official account of RMR II in first/second rounds and CNOSSOS deadline).
6. European Commission, [Directive 2015/996](https://eur-lex.europa.eu/eli/dir/2015/996/oj), Annex II; [amendment 2021/1226](https://eur-lex.europa.eu/eli/dir_del/2021/1226/oj); [consolidated text](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02015L0996).
7. Czech Government Regulation 272/2011 Sb., [consolidated text](https://www.zakonyprolidi.cz/cs/2011-272), §12 and Annex 3 Part A (receptor limits, not source emission).
8. Správa železnic, [approved Praha–Beroun feasibility-study announcement](https://www.spravazeleznic.cz/aktuality/-/asset_publisher/qSujQZ8W3r0i/content/studie-proveditelnosti-nove-trati-praha-beroun-je-schvalena?inheritRedirect=false) (route/tunnel lengths, not a unit-price schedule).
