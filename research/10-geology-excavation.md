# ČGS geology → excavation priors for Trutnov–border

Verified / implemented 2026-11-14. **Real mapped lithology, estimated vertical profiles.** This is a feasibility-game ground model, not a geotechnical investigation, ČSN class determination, or measured depth-to-bedrock model. See also [03](03-geology.md) and [09 §3](09-noise-earthworks-urban.md#3-earthworks-otskp-and-geology).

## 1. Data actually fetched

- [ČGS GEOCR50, layer 2 Horniny](https://mapy.geology.cz/arcgis/rest/services/Geologie/GEOCR50_mobil/MapServer/2): **1,690 polygons** intersecting EPSG:5514 envelope `−637500,−1011500,−620000,−989000`. Fields used: `hor_karto` (lithology), `hor_typ` (consolidated/unconsolidated), `utvar` (age), `geneze`; full attributes and geometries retained in the raw cache.
- [ČGS engineering-geological rajons 1:50k, layer 1](https://mapy.geology.cz/arcgis/rest/services/Geohazardy/IG_rajony50/MapServer/1): **1,230 polygons**, including `rajon_kod`, `nazev`, `ig_charakter`, `hornina`. These independently supply the engineering character below; their raster is also a fallback where GEOCR50 has no classified polygon (none of the playable cell centres needed that fallback in this build).
- `pipeline/geology.py` uses ArcGIS REST `/query`, envelope + `inSR=outSR=5514`, all fields, geometry, stable object-ID order, 500-record pages and one-second pauses with the existing pipeline UA. **Keyset pagination** (`objectid > last_id`): offset pagination repeated one IG boundary record during the live probe. Duplicate IDs/error responses fail the build rather than silently accepting incomplete data. Cache filenames include layer, envelope and last ID; cached reruns are offline. `pipeline/cache/` and generated packs remain gitignored.
- Raster: **700 × 900 at 25 m**, aligned to the 5 m terrain origin, row 0 north. Exact cell-centre polygon membership, even/odd holes and islands, deterministic object-ID paint order. No smoothing across geological contacts. The 25 m raster does **not** turn a 1:50k source into a 25 m survey.
- 545,544 cell centres have DMR terrain; **6,032 (1.11%) are unmapped** by ČGS and explicitly use the norm prior. This includes the edge of Czech map coverage; no inferred continuation into Poland. The pack retains per-profile counts and attribution. All encountered GEOCR lithology strings are classified; no unknown lithology silently receives a rock profile.

## 2. Evidence and its limits

**Engineering character directly in local ČGS IG attributes** (not inferred from rock names alone):

| Rajon | Local source description / engineering implication |
|---|---|
| Ft, river terraces | Sands/gravels are “únosné, snadno rozpojitelné základové půdy” — readily excavated granular deposits. |
| Fn, floodplain | Heterogeneous, poor-bearing ground, often shallow groundwater. |
| D / Dk, slope deposits | Clay/loam/sand with rock fragments; Dk often water-bearing and prone to slope movement. |
| Ss, sandstone/conglomerate/greywacke/arkose | “pevné, obtížně rozpojitelné” — competent material can be difficult to excavate. |
| Sj, claystone/siltstone/marlstone/shale | Variable strength, often difficult to excavate; not automatically loose soil. |
| Sf, alternating clastic beds | Alternating grain sizes, slope instability susceptibility. |
| Mn, phyllite/quartzite | Strong, difficult-to-excavate ground in the described rock state. |
| Mv, schist/gneiss/amphibolite | **In sound state**, strong and difficult to excavate. |
| Ih, intrusives | Weathering produces eluvium with an **irregular** transition to sound rock. |
| Sv, limestone/dolomite | Difficult excavation, karst susceptibility; neither karst geometry nor a surcharge follows from this map alone. |

Additional sources visited and reviewed:

1. [ÚRS, *Změny v oceňování zemních prací*, 2020, “Třídy těžitelnosti”](https://www.urs.cz/data/download/zemni-prace-2020.pdf): superseded ČSN 73 3050 used seven classes; ČSN 73 6133 and ČSN 73 3055 use three. The guide describes groups 1–3 / 4–5 / 6–7 within I / II / III for its current item system and says blasting and plastic clays may need individual pricing. **Do not read this as a universal old-class conversion or I=soil / II=ripping / III=blasting definition.** Here those are only game-profile shorthand. Full standards were not inspected.
2. [VUT FAST, *Geologie*, teaching text, sections on sediments, residual rocks and weathering](https://geotech.fce.vutbr.cz/wp-content/uploads/sites/17/2018/09/geologie.pdf): slope loams are displaced eluvium, clayey to sandy-loamy, potentially wet and unreliable; weathering reduces technical rock quality; granite can weather into sandy eluvium and blocks. This supports **weathered-to-sound progression and heterogeneous cover**, not a numerical depth table. It also cautions against assuming all slope deposits are usable fill.
3. [Masaryk University regional geology: Podkrkonoší Permocarboniferous basin](https://pruvodce.geol.cechy.sci.muni.cz/regionalni_geol/podkrkokon_permokarbon.htm): interbedded arkose, sandstone, conglomerate, aleuropelite, siltstone and claystone sequences around Trutnov. Age alone is insufficient; the mapper distinguishes the dominant fine/coarse lithology. The queried map also includes Cretaceous/Triassic and crystalline units, not just Permian bedrock.
4. [SFDI SPK CN annual database](https://sfdi.gov.cz/cenove-databaze/spk-cn/) and the project's already extracted [2026 norm evidence](00-feasibility-map.md): **75/20/5% I/II/III** is the study norm's assumed mixture. The web landing page by itself does not verify those percentages. They remain the norm-allowance price and the explicit **unmapped-ground** prior, not a target to which this mountainous corridor is forced.
5. [SFDI OTSKP](https://sfdi.gov.cz/cenove-databaze/otskp/), existing [project price extraction](00-feasibility-map.md): 12273/12283/12293, **183/391/653 CZK/m³**. Geology changes quantities, not these prices.

No source reviewed supplies a deterministic lithology → excavability or lithology → weathering-depth lookup for this route. Jointing, cementation, groundwater, bedding and machinery matter. No corridor borehole profiles or seismic rippability measurements have been incorporated.

## 3. Implemented provisional table

**Every numerical depth below is an ESTIMATE chosen for gameplay**, not a ČSN threshold or a measured local thickness. `a` = bottom of class-I loose/decomposed material; `b` = bottom of class-II weathered/rippable material; class III below `b`. Depths are vertical below the original local terrain. For unconsolidated deposits, `a` estimates deposit/loose-cover thickness and `a…b` is a generic underlying weathered substrate; the surface map does not identify the actual buried lithology. These profiles intentionally distinguish shallow resistant rock from deeper loose deposits; the ordering is qualitatively sourced, the metres are not.

Authoritative machine-readable table: `pipeline/ground_profiles.json`.

| Dominant mapped ground | a / b (m) | Rationale / limitation |
|---|---:|---|
| Quaternary loam / sandy loam | 4 / 8 | Loose cover over unknown weathered substrate. |
| Quaternary alluvium / floodplain | 5 / 9 | Thicker loose valley cover; groundwater treatment omitted. |
| Fluvial sands and gravels (Quaternary / Neogene) | 6 / 10 | Easily excavated deposits, unknown terrace thickness. |
| Stony / blocky slope deposits | 2 / 6 | Mixed fragments; not all loose class I. |
| Mixed slope–stream / proluvial deposits | 4 / 8 | Mixed cover; buried rock unobserved. |
| Peat / organic deposits | 2 / 5 | Table supports it; **no peat polygon found in this envelope**. Does not imply reusable fill. |
| Anthropogenic fill | 3 / 7 | Unknown compaction/composition; no contamination model. |
| Permian sandstone / arkose | 2 / 6 | Weathered cover, then resistant cemented rock (Ss). |
| Permian conglomerate / breccia | 1.5 / 4 | Shallower resistant-rock prior. |
| Permian siltstone / claystone / fine interbeds | 3 / 9 | Deeper weathered weak-rock prior, not assumed loose at all depths. |
| Carboniferous sandstone / arkose / conglomerate | 2 / 6 | Coarse clastic prior. |
| Carboniferous fine / mixed interbeds | 2.5 / 7 | Alternating fine/coarse beds; no coal/mining penalty yet. |
| Cretaceous / Triassic sandstone | 3 / 8 | Variable cementation; distinct from Permian map category. |
| Cretaceous marlstone / opuka | 3 / 8 | Variable-strength fine sedimentary rock. |
| Phyllite / mica schist | 2 / 6 | Weathered/fractured upper zone; sound rock can be difficult. |
| Gneiss / crystalline schist | 1.5 / 4 | More resistant sound-rock prior. |
| Quartzite / metagreywacke / calc-silicate rock | 1 / 3 | Resistant-rock group. |
| Crystalline limestone / dolomite | 1 / 3 | Resistant-rock group, karst unresolved. |
| Volcanic / intrusive rock / green schist | 1 / 3 | Resistant-rock group, no claim of identical properties. |
| Tuff / tuffite | 2 / 5 | More variable/decomposed volcanic material. |
| Unknown / outside coverage / old pack | no depths | Volumetric 75/20/5 at **any** cut depth. |

The mapper checks unconsolidated genesis first, then crystalline/volcanic lithology, then age and dominant clastic description. It does not classify a sandstone polygon as claystone just because the text mentions a subordinate clay interbed. IG gap-fill labels retain their rajon name rather than inventing a geological age.

## 4. Integration, checks and limitations

- Sections integrate the local profile through every cut strip (≤2.5 m transverse spacing, midpoint geology), under crown **and slopes**, not only at the centreline. Class parts sum to each section's cut and to billed volumes. A contact can be displaced by up to a strip width in addition to map/raster uncertainty.
- Auto-profile flat-section costs use **centreline-local** profiles, with one compact precomputed height-cost table per encountered category; candidate mass balance and final structure decisions use real transverse sections. Final prices remain the same class prices as the search.
- UI profile tooltip names mapped ground and both **estimated** depths; HUD retains the class quantities and explains unmapped norm fallback. Old packs load as explicitly unmapped, not as invented 3/8 m geology; rebuild with `npm run data` for mapped costs.
- Tests cover raster cell centres/holes/islands, cached keyset pagination, ground-grid orientation/validation, cut contacts across the crown/slope, unknown prior, and spatially varying auto-profile costs. The complete pipeline was rebuilt from copied worktree-local terrain/OSM caches.
- Cut slopes remain 1:1.75, fill slopes 1:2 and unusable material 15%. Changing those from lithology alone would add unsupported stability/reuse claims and obscure this change's cost effect. Peat/clay suitability, groundwater, tunnel rock classes, landslides and undermining are **next steps**, not secretly priced here. In particular active-landslide excavation should eventually carry an explicit violation/risk treatment after querying activity polygons; absence of that penalty is not evidence of safety.

## 5. Fixed-design comparison (model 6 → geology model 7)

No alignments changed. CZK million; class shares are volume-weighted, rounded percentages (may sum to 99/101). All five VALID and every per-cell cost component sums to its bill.

| Design | Before → after total | Before I/II/III % | After I/II/III % |
|---|---:|---:|---:|
| best bypass 90 | 3,038 → 3,195 | 49 / 36 / 15 | 37 / 39 / 24 |
| reference/demo 90 | 3,949 → 4,068 | 39 / 34 / 26 | 30 / 34 / 36 |
| direct fringe 80 | 3,470 → 3,563 | 50 / 36 / 13 | 38 / 39 / 23 |
| direct fringe 90 | 3,626 → 3,784 | 44 / 36 / 21 | 32 / 37 / 32 |
| town centre 90 | 9,024 → 9,175 | 31 / 33 / 37 | 20 / 29 / 51 |

The automatic grade line can change, affecting fill, structures and property as well as excavation. None of the profiles was fitted to these totals or to 75/20/5. Bench means after removing a LUT-building closure allocation: **33–40 ms** across the designs; simultaneous SwiftShader processes can more than double these timings.

Brief optimisation sanity check: `npx tsx scripts/optimize.ts 90 200 scripts/best-design.json /tmp/geology-opt-best.json 19421` found **3,059 M CZK**, VALID, 21.32 km / 14.21 min, classes 41/39/21. This temporary candidate is not substituted for a comparison design; no global optimum is claimed.
