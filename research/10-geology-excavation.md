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

No source reviewed supplies a deterministic lithology → excavability or lithology → weathering-depth lookup for this route. Jointing, cementation, groundwater, bedding and machinery matter. No detailed corridor borehole logs or seismic rippability measurements have been incorporated; the later calibration below uses actual local excavation quantities and basic ČGS borehole cover-depth attributes.

## 3. Implemented provisional table

**Every numerical depth below remains an ESTIMATE**, not a ČSN threshold or measured local thickness. Permian/Carboniferous depths were subsequently calibrated to local reported class volumes (§6); other profiles retain their qualitative priors. `a` = bottom of class-I loose/decomposed material; `b` = bottom of class-II weathered/rippable material; class III below `b`. Depths are vertical below the original local terrain. For unconsolidated deposits, `a` estimates deposit/loose-cover thickness and `a…b` is a generic underlying weathered substrate; the surface map does not identify the actual buried lithology. These profiles intentionally distinguish shallow resistant rock from deeper loose deposits; the ordering is qualitatively sourced, the metres are not.

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
| Permian sandstone / arkose | 3.5 / 5.9 | Weathered cover, then resistant cemented rock (Ss). |
| Permian conglomerate / breccia | 2.6 / 3.9 | Shallower resistant-rock prior. |
| Permian siltstone / claystone / fine interbeds | 5.2 / 8.9 | Deeper weathered weak-rock prior, not assumed loose at all depths. |
| Carboniferous sandstone / arkose / conglomerate | 3.5 / 5.9 | Coarse clastic prior. |
| Carboniferous fine / mixed interbeds | 4.4 / 6.9 | Alternating fine/coarse beds; no coal/mining penalty yet. |
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
- UI profile tooltip names mapped ground and both **estimated** depths; HUD retains the class quantities and explains unmapped norm fallback. Old packs load as explicitly unmapped, not as invented 3/8 m geology; rebuild with `npm run data` for mapped costs. Saved best scores include the ground-grid/profile fingerprint, so a rebuild invalidates incomparable scores without discarding the design.
- Tests cover raster cell centres/holes/islands, cached keyset pagination, ground-grid orientation/validation, cut contacts across the crown/slope, unknown prior, and spatially varying auto-profile costs. The complete pipeline was rebuilt from copied worktree-local terrain/OSM caches.
- Cut slopes remain 1:1.75, fill slopes 1:2 and unusable material 15%. Changing those from lithology alone would add unsupported stability/reuse claims and obscure this change's cost effect. Peat/clay suitability, groundwater, tunnel rock classes, landslides and undermining are **next steps**, not secretly priced here. In particular active-landslide excavation should eventually carry an explicit violation/risk treatment after querying activity polygons; absence of that penalty is not evidence of safety.

## 5. Initial branch experiment (main model 7 → uncalibrated geology)

Historical pre-calibration snapshot; current totals are maintained in PLAN.md after the main/noise rebase.

Rebased onto `428cd0d` (geometric crossing costs); the before column uses that main model, so the difference isolates geology. No alignments changed. CZK million; class shares are volume-weighted, rounded percentages (may sum to 99/101). All five VALID and every per-cell cost component sums to its bill.

| Design | Before → after total | Before I/II/III % | After I/II/III % |
|---|---:|---:|---:|
| best bypass 90 | 3,305 → 3,440 | 49 / 36 / 15 | 39 / 38 / 23 |
| reference/demo 90 | 4,158 → 4,296 | 39 / 34 / 26 | 31 / 34 / 35 |
| direct fringe 80 | 3,690 → 3,774 | 50 / 36 / 13 | 40 / 39 / 22 |
| direct fringe 90 | 3,807 → 3,958 | 44 / 36 / 21 | 34 / 37 / 30 |
| town centre 90 | 9,182 → 9,317 | 31 / 33 / 37 | 21 / 29 / 50 |

The automatic grade line can change, affecting fill, structures and property as well as excavation. These initial numbers precede the local-data fit in §6; no profile was fitted to the five comparison-design totals or to 75/20/5. Bench means after removing a LUT-building closure allocation: **31–42 ms** across the designs; simultaneous SwiftShader processes can more than double these timings.

Brief optimisation sanity check: `npx tsx scripts/optimize.ts 90 200 scripts/best-design.json /tmp/geology-opt-best-final.json 19421` found **3,281 M CZK**, VALID, 21.30 km / 14.20 min, classes 42/38/20. This temporary candidate is not substituted for a comparison design; no global optimum is claimed.

## 6. Local D11 quantities and borehole calibration

Follow-up verification 2026-11-14, prompted by the high class-III shares. **The best local primary evidence does not support replacing the corridor split with 75/20/5.** Project numbering: 1108 is Jaroměř–Trutnov, 1109 is Trutnov–state border; 1107 is Smiřice–Jaroměř.

### Inspected local quantities

ŘSD director Ing. Radek Mátl, [*Předpokládané geotechnické podmínky vs. realita stavby: zkušenosti z projektů ŘSD*, 2026 seminar PDF](https://www.ita-aites.cz/files/Seminare/2026/to_2_26/06-matl-predpokladane-gtp-vs-realita-rsd.pdf), **printed page 5**, supplies this direct comparison for **D11 1109, SO 101, km 133.000–154.175**:

| Excavation | PDPS (ZDS) m³ | “Skutečnost (RSD)” m³ |
|---|---:|---:|
| Class I | 1,536,933 | 1,177,963 |
| Class II | 658,934 | 505,032 |
| Class III | 553,555 | 1,093,421 |
| Total | 2,749,422 | 2,776,416 |
| Shares I / II / III | **55.90 / 23.97 / 20.13%** | **42.43 / 18.19 / 39.38%** |

The slide estimates **+264 M CZK excl. VAT** for the class change. This is a construction-stage reported comparison, **not a final audited bill**; the table has no explicit reporting cutoff and does not print OTSKP item numbers. It labels the classes I/II/III directly. Do not equate class III mechanically with blasting. On **page 6** (embedded image inspected), the GTP author cautions that whole-project class percentages are not the investigation's goal; encountered classes on their section corresponded to PoGTP/DoGTP conclusions and class determinations were recorded in the construction diary/survey protocols. Thus the table is useful local aggregate calibration evidence, not proof of a unique geological depth profile.

Other checked leads: [1109 supplementary GTP contract](https://smlouvy.gov.cz/smlouva/soubor/20317987/Smlouva%2010PT-%20001109-anonym.pdf) orders drilling/geophysics/logging but does not attach the final logs; [1108 detailed GTP tender](https://tenderarena.cz/dodavatel/seznam-profilu-zadavatelu/detail/Z0003026/zakazka/199200) did not yield a public class-volume table. The [ŘSD 2017 D11 booklet](https://rsd.cz/documents/38144/80614/Publikace-D11-08-2017-dvoustrany.pdf), p.22, lists 1108 overall excavation 2,692,672 m³, but no class breakdown; it is not used to fit class shares. No measured local rippability/strength-versus-depth logs were recovered in this bounded search.

### ČGS borehole check

Queried [Vrtna_prozkoumanost layer 1](https://mapy.geology.cz/arcgis/rest/services/Prozkoumanost/Vrtna_prozkoumanost/MapServer/1) using the same cached EPSG:5514 envelope/keyset protocol: **3,107 point records**, raw pages `pipeline/cache/cgs_boreholes_*_after*.json`. Of 2,230 engineering-geology records, **1,753** have a named first sub-Quaternary material and `0 ≤ max_q < hloubka` (exclude missing, negative and end-of-hole/censored depths). Recorded cover depth percentiles P10/P25/P50/P75/P90: **0.72 / 1.6 / 3.1 / 4.3 / 5.8 m**.

| First sub-Quaternary material, engineering subset | n | Median cover / P25–P75 (m) |
|---|---:|---:|
| Sandstone | 689 | 3.3 / 2.0–4.5 |
| Siltstone + claystone + aleuropelite | 641 | 2.8 / 1.2–4.2 |
| Conglomerate | 90 | 2.95 / 1.7–4.58 |
| Phyllite | 59 | 2.9 / 2.3–4.05 |
| Gneiss | 9 | 5.1 / 2.9–5.2 |

`max_q` is **recorded Quaternary thickness**, not decomposed-rock thickness or a measured class-I boundary. The first underlying material can itself be unconsolidated, and sampling is clustered along investigations, not area-uniform. These summaries support several metres of cover—especially sandstone's ~3.3 m versus our original 2 m—but cannot define class-II/III depth or justify interpolating a continuous weathering surface. No borehole values are silently painted onto the grid.

### Explicit aggregate fit and uncertainty

Target: the local construction-reported **42.43/18.19/39.38%**, with planned **55.90/23.97/20.13%** retained as an alternative, not averaged away. Comparator: the existing `scripts/bench.ts` **official-ish 13-PI S9.5 auto-profile**, 20.44 km, VALID. It is **not the as-built D11 motorway**: width, exact alignment, grade, tunnels, structures and contract scope differ. Therefore this is a transparent game-surrogate fit, not a reconstruction or independent validation of D11 quantities.

Only five Permian/Carboniferous profile rows are adjusted. Fit two shared coefficients: `a′ = αa`, `b′ = max(a′ + 0.25, βb)`; preserve each lithology's relative prior and all Quaternary/crystalline/Cretaceous profiles. Minimise squared share error, re-evaluating the automatic grade and structure choice at every trial. The initial surrogate was **27.28/33.60/39.12%**, already close in class III but too little I. Best coefficients **α=1.745, β=0.985** produce **42.39/18.24/39.37%**. Round table depths to **0.1 m** to avoid implying survey precision: resulting surrogate **42.56/18.05/39.39%**, cut **2.612 M m³**, VALID. The match is by construction; its total cut is not forced to the source's 2.776 M m³.

This increases estimated loose/decomposed cover, rather than assuming deeper ripping everywhere. Sandstone becomes **3.5/5.9 m**, conglomerate **2.6/3.9 m**, Permian fine beds **5.2/8.9 m**, Carboniferous coarse/fine **3.5/5.9 / 4.4/6.9 m**. The fine-bed class-I depth exceeds median Quaternary cover because the game combines cover and decomposed bedrock; that additional depth remains an estimate. The aggregate does not identify per-lithology parameters uniquely. In particular it does not establish that every Permian sandstone is hard below 5.9 m.

Sensitivity: fitting the **planned** split instead requires much deeper profiles (rough exploratory α≈2.58, β≈1.64; sandstone ~5.2/9.8 m) and gives about 55.5/23.3/21.2% in the coarse search. We prefer the construction-reported local quantities for the central game calibration; the planned case illustrates substantial uncertainty. Neither local source supports a 5% class-III corridor target. Deep cuts in the different town-centre alignment can legitimately remain harder than the corridor aggregate; no route-specific split is guaranteed.

Reproduce the fit against its initial priors:

```sh
git show 22958ec:pipeline/ground_profiles.json > /tmp/ground-initial.json
npx tsx scripts/calibrate-ground.ts /tmp/ground-initial.json actual
npx tsx scripts/calibrate-ground.ts /tmp/ground-initial.json planned
# Check the current table without fitting:
npx tsx scripts/calibrate-ground.ts pipeline/ground_profiles.json actual --check
```

The share-fit check was rerun after rebasing onto the model-9 noise/crossing implementation: the same **42.56/18.05/39.39%** result holds in model 10. A later engineering/berm change can alter the surrogate shares and should rerun this check rather than presenting the old match as permanent.

Final model-10 five-design results (rebased main model 9 → mapped/calibrated geology), M CZK: best **3,303→3,325**, demo **4,105→4,144**, direct80 **3,661→3,694**, direct90 **3,799→3,873**, town **8,957→9,035**. Class shares respectively **57/19/23**, **47/18/35**, **59/19/22**, **51/20/29**, **35/16/49** (rounded). All VALID; per-cell parts sum. The town route was not a fit target and makes much deeper cuts; its high class-III share is not evidence of pervasive blasting in shallow red beds.
