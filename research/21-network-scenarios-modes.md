# New scenario and transport-mode source reconnaissance

2026-11-15, planning baseline `cb71b2c`. These are evidence boundaries, not a complete new norm table.
Implementation plan: [docs/multi-road-plan.md](../docs/multi-road-plan.md). Source research was independently
checked against the linked D3/D35 project material, Nová Paka project entry and motorway revision slides.
Unretrieved details below are tasks, not invented values.

## Scenarios

- **D3 Posázaví:** [ŘSD section 0303 Hostěradice–Václavice](https://www.stredoceskad3.cz/usek-0303-hosteradice-vaclavice/)
  links the [current project leaflet](https://apdos.roadmedia.cz/Upload/Stavby/43/infoletak_d3-0303-hosteradice-vaclavice.pdf).
  Both visited; leaflet downloaded/text inspected. This section starts after MÚK Hostěradice and ends
  after MÚK Václavice. The scenario should include the Sázava crossing north of this section: inspect
  adjoining [0302 Jílové–Hostěradice](https://www.stredoceskad3.cz/usek-0302-jilove-hosteradice/)
  before fixing A/B. A road exercise is not a claim that a two-lane category meets the actual D3 demand.
- **D35 Opatovec–Mohelnice:** [ŘSD Opatovec–Staré Město leaflet](https://apdos.roadmedia.cz/Upload/Stavby/53/infoletak_d35-opatovec-st_mesto.pdf)
  downloaded and inspected: 16,600 m, Dětřichov bored tunnel 3,983 m. It is a distinct first-stage
  scenario if the whole corridor exceeds measured budgets. The adjacent
  [Staré Město–Mohelnice leaflet](http://www.dalnice-d35.cz/public/files/documents/infoletak-d35-stare-mesto-mohelnice.pdf)
  was visited by the research pass and reports 18.23 km; recheck current edition before configuring.
  Full corridor is about 35 km, not a 20 km pack by assumption.
- **I/16 Nová Paka:** [OPD project entry](https://opd3.opd.cz/projekt/Silnice-I-16-Nova-Paka-obchvat)
  visited and text inspected: southeast bypass, **8.479 km, S11.5/70, class I**. It explains the town's
  deficient historical route and residential exposure. Project costs are funding totals, not a clean
  per-km construction tariff. [ŘSD project page](https://kraje.rsd.cz/kralovehradecky/stavba-i-16-nova-paka-obchvat/)
  and [Ministry opening report](https://md.gov.cz/Media/Media-a-tiskove-zpravy/Nova-Paka-se-dockala-8,5-kilometru-dlouheho-obchva)
  visited by the research pass; bypass opened in 2025. Current OSM can therefore already contain the
  completed road: the baseline needs a documented exclusion/historical snapshot, not a free built bypass
  competing with the player's task. Shorter than D11, intentionally suited to a town/bypass exercise.

For every scenario: verify actual OSM line continuity/tags and coordinates before building. Existing
`official_line()` does not match `proposed=motorway` and assumes forward-oriented chains; fix the pipeline,
do not silently retag extracted source data. ČÚZK DMR5G and OSM cover these Czech areas, but exact fetched
pack coverage, no-data and local geology must be measured. Planning envelopes are not surveyed bounds.

Traffic source: [ŘSD traffic census](https://www.rsd.cz/silnice-a-dalnice/scitani-dopravy), and the precise
CSD workbook already documented in research/14. No local counts have been extracted in this reconnaissance.
Observed AADT is not design-year AADT: forecast uplift/mission demand and heavy share require explicit
justification. X is a game goal. Do not copy the D11 9,000/day, 15% heavy or '70 km/h impossible' choices
as regional facts. The D3/D35 motorway presets need motorway demand/capacity, not class-I TP188 thresholds.

## Motorway

[Radimský, Revize ČSN 73 6101, 28 May 2019](https://konference-projektovani.cz/wp-content/uploads/2022/03/9.pdf)
was downloaded and relevant slides personally checked. It is public secondary evidence for the 2018
revision, not access to the full current standard.

| Input | Evidence | Status |
|---|---|---|
| D27.5 base design speed 130 km/h; justified reductions 10/20 | slide 4 | sourced, conditions matter |
| Radius at 6% crossfall: 130/120/110 → 840/690/560 m | slide 6 | sourced; stopping sight distance also required |
| Radius without superelevation: 2420/2060/1740 m | slide 6 | sourced; not transition omission threshold |
| Speed-based transition minimum `vn` metres | slide 15 | only one part: maximum of this and runoff length |
| D/S26.0 median 3.5 m | slide 8 | does **not** establish D27.5 median/layout |
| Complete D27.5 lane/shoulder/median dimensions | not recovered here | must research, do not infer from total width |
| Current maximum longitudinal gradient, crest/sag radii | not recovered here | must research; resultant slope is not longitudinal grade |

Slide 12's resultant-slope 13% is **not** permission for a 13% motorway gradient. The existing 70–90
road vertical rows are older-edition/provisional and do not establish motorway values.

Cost basis already present: `src/core/data/categories.ts` from committed extracted SFDI SPK CN 2026
prices: D27.5 flat+hilly 187.632 M CZK/km, mountainous 214.512 M/km, bridge 1495.178 M/km. Verify scope in
the source assemblies when splitting carriageways: these are whole-category rates, not per-direction
rates. [SFDI SPK CN](https://sfdi.gov.cz/cenove-databaze/spk-cn/),
[OTSKP](https://sfdi.gov.cz/cenove-databaze/otskp/) (visited by research pass). Existing tunnel-tube count
alone does not establish correct paired-tunnel cost/geometry, and a crossed-road bridge is not an interchange.

## Conventional railway

- [SŽ S3, Part I, change 4](https://www.spravazeleznic.cz/documents/50004227/139626480/SZDC_S3_Dil_01_sezm1az4_a_sopr1_20220101.pdf/08f34fa0-aabe-465a-8292-5c05e9a24cea?version=4.0),
  articles 45–50 (visited by research pass): geometry references ČSN 73 6360-1/-2; clearance references
  SŽ S11 and ČSN 73 6320. This names governing documents, not numeric limits.
- [ERA track gauge terminology](https://www.era.europa.eu/era-railway-terminology-collection/railtrackgauge/term/eu_policy)
  (visited by research pass): standard-gauge baseline **1,435 mm**. Gauge is not formation width.
- Cant equilibrium `D ≈ 11.8 V²/R` (mm, km/h, m) is a physics relation, not a Czech allowed-radius rule.
  Maximum cant, cant deficiency/excess, transitions, speed mix and curvature-dependent clearances need
  applicable Czech/TSI evidence. No numeric Czech track spacing or conventional-rail maximum grade was
  established here. Do not choose 12.5/15/25‰ interchangeably or inherit the road's 6%.
- OTSKP covers railway construction too, but an index webpage is not a source for item prices. Extract
  track/ballast/subgrade/earthwork/structure/electrification items and quantities. Do not relabel paved-road
  SPK rates. [EC rail unit-cost study, 2018](https://ec.europa.eu/regional_policy/sources/studies/assess_unit_cost_rail_en.pdf)
  (visited by research pass) cautions that per-km comparisons vary strongly with project scope; its
  international averages are not adopted as Czech conventional-rail rates.
- [NV 272/2011 §12 and Annex 3 A](https://www.zakonyprolidi.cz/cs/2011-272) (visited by research pass):
  new-road/new-rail day base 50 +10 dB, night correction road −10 / rail −5. Thus the new railway case
  is **60/55 dB day/night**, not road 60/50; older approved infrastructure has separate provisions.
  Recheck applicability for a relocated existing line. These are limits, not rail emission equations.
  Road vehicle emissions and the D11 acoustic ground calibration are not validated for railways.

Implementation must close these gaps using available public standards, SŽ documents, teaching material,
project drawings and tender quantities, marking justified provisional inputs as such. The first rail
case is a single conventional through track with defined operations, not an assertion that all railway
norms are implemented. Non-scored geometry support may precede scored rail, but is not completed gameplay.
