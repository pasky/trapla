# Czech road-bridge geometry observations

Research snapshot: 2026-11-14. Nine distinct Czech bridge projects are represented below, each with a nominal deck area and a source-reported height/separation value. This is a source-led geometry set, **not** a statistically independent priced sample. A public award report was found for 268-007, but its awarded contract includes demolition, traffic measures and approach-road repairs, so it is not a clean bridge-only price. Rows may combine parallel structures; they are not independent cost observations. Areas are length × stated/identified width, sometimes approximate; the CSV preserves basis and caveats. Reported “height” definitions differ and are not silently treated as comparable maximum heights or clearances.

## Geometry

| Project (road) | Length basis | Width / area basis | Nominal deck area | Reported height (source wording / caveat) |
|---|---:|---|---:|---|
| D8 Opárno (two parallel decks) | 273 m each | 14.3 m each | 3,903.9 m² each | 50 m, PERI “height”; datum/definition unspecified |
| D8 Prackovice, left | 458 m | 14.85 m | 6,801.3 m² | up to 26.2 m, source “height of bridge”; datum unspecified |
| D8 Prackovice, right | 554 m | 14.85 m | 8,226.9 m² | up to 26.2 m, source “height of bridge”; datum unspecified |
| D8 Czech–German border (two structures combined) | 430 m | 30.7 m combined source width | 13,201 m² combined | 56 m above terrain (FIRESTA; history gives 56.4 m) |
| D1 Vysočina (twin carriageway decks) | 425 m total | 2 × 12.5 m | 10,625 m² combined | 70 m (Ministry, 2020); another report says 77.5 m; unresolved |
| D0 Lochkov | 425.30 m | 33.60–35.425 m structural width | **14,290–15,066 m²** range | 65 m across valley; datum not specified |
| D3 seven-span bridge | 241.95 m bridge (230 m superstructure) | 28 m between barriers (clear width) | 6,774.6 m² clear-width footprint | 12–17 m above terrain; legacy article only accessible via search index |
| II/268 bridge 268-007 over Jizera | 300.80 m superstructure | 12.10 m superstructure width (PDPS) | 3,639.68 m² (PDPS stated) | max. 8.85 m, PDPS “bridge height”; datum not specified |
| D35 Labe estacade, Opatovice–Časy (two decks combined) | 1,060.5 m left + 1,064 m right | 14.25 m each | 30,274 m² combined¹ | 17.335 m above Labe riverbed (source’s local separation; **not asserted as bridge maximum**) |
| D35 Janov–Opatovec SO 205 (two decks combined) | 438.65 m left + 434.15 m right | 14.75 m each, explicitly stated by ŘSD | 12,873.8 m² combined² | 13.83 m over Mikulečský potok; crossing-specific, **not asserted as bridge maximum** |

¹ Combined nominal area = (1,060.5 + 1,064) × 14.25 = 30,274.125 m² (rounded). ² Sum of directional lengths × 14.75 m each. Independently checked the original ŘSD page: “Celková šířka mostu: 14,75 m každá mostovka (LM i PM)”. An initial researcher mistakenly substituted half the D26 road width; that is corrected here and in the CSV.

**Area arithmetic:** Lochkov = 425.30 × 33.60–35.425 = 14,290–15,066 m² (rounded). D35 Labe combined area = 2,124.5 × 14.25 = 30,274.125 m². D35 Janov combined nominal area = (438.65 + 434.15) × 14.75 = 12,873.8 m².

## Caveats and use

- The nine projects are not nine independent cost samples. Parallel decks are combined where appropriate; the Opárno/Prackovice rows retain source-specific directional/deck geometry. Do not count duplicate decks as independent priced examples or fit a cost curve from this table.
- Height values are source-reported and heterogeneous: valley/terrain height, bridge height, and local vertical separation above a riverbed/stream are different measures. The Labe and Janov figures are included as requested with their crossing-specific caveats, not re-labelled maximum height. Structural depth, pier height, and clearance are not substitutes.
- Opárno uses 273 m from the history and PERI’s 50 m height; PERI reports 258 m. The 30.5 m combined bridge width is not used as one-deck width; history reports 14.3 m deck width.
- Prackovice uses reported directional lengths and source bridge width. D8 border uses combined width for the two superstructures and combined nominal footprint.
- Vysočina preserves the reported 70/77.5 m discrepancy. Lochkov area uses width endpoints; actual varying plan geometry is not represented. D3 width is between barriers, not gross deck width; its original article URL now returns 404.
- 268-007 PDPS gives an actual area for the load-bearing structure (12.10 × 300.80), while its total bridge width including footways/cornices is 12.60 m. Use the PDPS stated deck area, not 12.6 × length. The PDPS is a design document, not proof of as-built dimensions or price.
- For 268-007, the public award report gives 143,633,280.75 Kč excluding VAT (173,796,269.71 Kč incl. VAT). The contract covers demolition of the old bridge, the new bridge and foundations, traffic measures, and repairs of II/268 on both approaches (km 13.170–14.230); do not label the total as a pure bridge price or allocate it to deck area without scope adjustment. No comparable bridge-only award/final-account amounts were verified for the other additions. Whole-road contract values must not be allocated to individual bridges. This remains geometry evidence, not a statistically independent priced calibration set.

## Sources

1. **D8 history:** https://www.dalnice-silnice.cz/D8.htm — Opárno 273 m / combined width 30.5 m / deck width 14.3 m / historical construction amount 578m Kč; Prackovice directional lengths 458/554 m, width 14.85 m, height up to 26.2 m; border 430 m, width 30.7 m, height 56.4 m, Czech-share amount 687m Kč. Secondary compilation; cost scope/date/VAT unclear.
2. **PERI Opárno:** https://www.peri.cz/projekty/dalnicni-most-pres-oparenske-udoli.html — 258 m and 50 m height; height used, length discrepancy retained.
3. **FIRESTA border bridge:** https://www.firesta.cz/silnicni-mosty/most-hranicni — 430 m, 56 m above terrain; two separate structures.
4. **D1 Vysočina:** https://www.mostvysocina.cz/ — 425 m and 12.5 m carriageway width; Ministry height report: https://md.gov.cz/Media/Media-a-tiskove-zpravy/Most-Vysocina-na-D1-je-po-rozsireni-v-plnem-provozu .
5. **Lochkov designer SHP:** https://www.shp.eu/projekty/most-pres-lochkovske-udoli/100 — 425.30 m, 65 m across valley, structural width 33.60–35.425 m.
6. **D3 seven-span technical article:** http://old.konstrukce.cz/clanek/most-o-sedmi-polich-na-dalnici-d3/ — indexed text reports 241.95 m, 230 m superstructure, 28 m between barriers, 12–17 m above terrain; low confidence because source URL returns 404.
7. **II/268 268-007 PDPS, SO 201:** https://zakazky.kr-stredocesky.cz/document_101297/3bb5cc4bba6efc32f201d6d6068bcce7-201_01_technicka_zprava-pdf — 312 m total bridge, 300.8 m load-bearing structure, 12.10 m structure width, stated area 3,639.68 m², bridge height 3.57–8.85 m. Public design document downloaded and checked. **Award report:** https://zakazky.kr-stredocesky.cz/document_111704/0bd4d0b510d20d15b176b32763e8de81-ii-268-klaster-hradiste-n-j-most-ev-c-268-007-pisemna-zprava-zadavatele-pdf — awarded 143,633,280.75 Kč excluding VAT (173,796,269.71 Kč incl. VAT); scope includes demolition, new bridge, traffic measures and approach-road repairs, so this is not a clean bridge-only price.
8. **D35 Labe contractor article:** https://silnice-zeleznice.cz/silnice/smp-cz-realizuje-most-pres-labe-na-dalnici-d35-v-useku-opatovice-nad-labem-casy-360 — directional lengths 1,060.5/1,064 m, each 14.25 m; 17.335 m above the Labe channel bed. This is a local vertical separation, not stated as the structure’s maximum height.
9. **D35 Janov–Opatovec:** ŘSD Pardubický kraj, https://kraje.rsd.cz/pardubicky/na-nejdelsim-moste-useku-d35-janov-opatovec-zacala-realizace-hlubinneho-zalozeni/ — SO 205 lengths 438.65 m (left) / 434.15 m (right), 13.83 m at Mikulečský potok and 10.47 m at I/35. Article on two separate bridges: https://silnice-zeleznice.cz/silnice/d35-janov-opatovec-vyuziti-technologie-tzv-vysuvneho-nosu-neomezuje-pri-stavbe-dopravu-1005 . The ŘSD page explicitly gives each deck width as 14.75 m. Area is the derived nominal product.
