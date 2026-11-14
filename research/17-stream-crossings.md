# Watercourse crossings: Czech evidence and implemented screening model

Research / implementation snapshot 2026-11-14. **This is a game-scale screening model, not hydraulic design or a claim of ČSN compliance.** Prices exclude VAT; catalogue items are April 2026 OTSKP, assemblies include explicitly provisional quantities. See [exact price extraction](17-culvert-prices.md), [earlier bridge/fill work](15-bridge-vs-embankment.md).

## 1. Culvert versus bridge, flood and maintenance requirements

The public [ŘSD TP 232, Propustky a mosty malých rozpětí (2012)](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_232_2012.pdf) is the primary inspected source:

- Its scope distinguishes **culverts with clear span 0.40–2.00 m** from **small bridges 2.01–5.00 m**. This is a classification boundary, not an absolute technical prohibition on larger frames. The game's `box` assembly category includes frames that Czech asset classification calls small bridges; it denotes a buried frame, not an official asset class.
- §4.1–4.2 requires sufficient hydraulic opening, allowing for velocity, filling, bed slope, debris, ice and surrounding catchment. Current natural-watercourse flow data are to be requested from **ČHMÚ**; the text expressly says request the latest data. Artificial channels/drainage need different runoff treatment.
- Layout must not obstruct natural flow and should respect revitalization, biodiversity and water protection. **Bridge objects should preferably be designed** where they avoid adverse impacts on watercourses. This is qualified guidance, not a blanket culvert ban.
- Minimize barrel length; cleaning and inspection influence opening. General minimum clear opening **600 mm**, with **400 mm** only justified exceptionally. The guide recommends the 600 mm minimum only up to **15 m** length; for longer culverts, choose openings **from 800 mm upward** with maintenance in mind. It does **not** establish a universal DN1000 minimum specifically for class I.
- Common road RC pipes are **DN600–1600**. Example frame sizes include 2×1, 2×1.5, 2.5×2 and 3×2 m. No universal maximum barrel length or 4–6 m hard structural limit was verified.

[ČSN 73 6201 preview](http://csnonlinefirmy.agentura-cas.cz/html_nahledy/73/17145/17145_nahled.htm) and [ČSN 75 2130 preview](https://nahledy.normy.biz/n.php?i=90009) establish their scopes (bridge design; crossings/parallel runs of watercourses and transport infrastructure), but do not expose the complete operative flow tables. [EDUMOS bridge-design presentation](https://edumos.eu/wp-content/uploads/2020/10/EDUMOS_MOSTY_Projektovani-mostu-dle-CSN736201.pdf) describes flow selection by object type/importance. **“Every class-I crossing must be Q100” was not verified from the standard itself.** The game deliberately chooses Q100 for all mapped watercourses as a conservative, consistent scenario policy; this must not be attributed to an uninspected ČSN clause. Q100 is an annual-exceedance quantile, not “one flood every exactly 100 years.”

## 2. Ecology: what is actually supported

[AOPK, Doprava a ochrana fauny v České republice](https://www.ceson.org/document/AOPK_METODIKA_DOF_WEB-1.pdf), §6.1.2, says preserve two-way aquatic migration, preferably the original natural channel beneath a bridge; otherwise retain comparable depths/velocities, natural bed and banks, and avoid drops. **Avoid pipes even on small streams inhabited by fish or aquatic fauna such as crayfish; a frame/box is generally better.** Fish passage is not established by one universal clear-height number; low-flow depth, bed continuity, velocity, outlet drops and species matter.

The scanned official [AOPK SPPK E 02 003 otter/small-mammal standard](https://aopk.gov.cz/documents/20121/4254509/E02003-Standard_vydra_Itechnicka_uprava_podpis.pdf/a5a045b5-7930-c89c-a156-f6d58d10336d?t=1690191452001) initially resisted text extraction. The implementation author OCRed it and **visually checked pages 9–10**:

- §3.1.1: dedicated **dry otter tunnel** (not the water-conveying barrel): minimum **40 cm width × 40 cm height**, preferably concrete frame, pipe only justified; barrier-free ends. Near a watercourse, maximum **5 m from the bank**, located above the water-conveying structure.
- §3.2.1 / §3.4.1: berm or attached ledge recommended width **40 cm**, justified constrained minimum **25 cm**, ideally **10 cm above ordinary water level**, connected continuously to banks without steps. Thus “dry at Q100” is not the quoted rule.
- §3.3.1: loose-stone bank minimum width **30 cm**, ideally stones 10–20 cm above the water surface.

**Game inference:** mapped natural streams with catchment ≥1 km² or tagged width ≥1.5 m receive a natural-bed frame with a 0.5 m bank allowance, rather than a pipe. This is a deliberately conservative **ecological proxy, not surveyed fish/otter presence**; no ÚSES polygon intersection or fish inventory is inferred. Frame height 2–3 m and bank 0.5 m are game dimensions, not AOPK universal minima. A mapped biocorridor alone would not justify pretending every crossing needs a large wildlife bridge.

## 3. Prices: OTSKP items versus complete assemblies

The [official SFDI archive](https://sfdi.gov.cz/wp-content/uploads/2026/04/otskp-2.zip) contains the April 10 item workbook. The implementation author independently streamed and checked rows 9183F2, 9183I2, 91843, 9181F and 899524. Full table and scopes: [17-culvert-prices.md](17-culvert-prices.md).

| Opening / item | Pipe or frame CZK/m | Concrete head CZK/end |
|---|---:|---:|
| DN800 — 9183E2 | 9,450.93 | 73,383.97 (up-to-DN1000 band) |
| DN1000 — 9183F2 | 12,641.30 | 73,383.97 |
| DN1200 — 9183G2 | 18,688.24 | 93,823.61 |
| DN1400 — 9183H2 | 23,093.38 | 113,553.52 |
| DN1600 — 9183I2 | 27,765.44 | 133,851.20 |
| >DN1600 — 9183J2 | 44,317.95 | 160,252.41 |
| Frame 2×2 — 91843 | 48,259.84 | bespoke, no matched fixed catalogue head used |
| Frame 2.5×2 — 91844 | 52,997.84 | as above |
| Frame 3×2 — 91845 | 61,052.44 | as above |

The >1600 band is **not an exact DN2000 quote**. Pipe items supply/lay pipe but exclude bedding/encasement; frame items exclude bedding, leveling/fall concrete and waterproofing. Heads 9181F–J are complete concrete headwall items; they are **per end**, not a pair.

Implemented assembly, before surcharge:

- Pipe metre = catalogue pipe + `0.6 × (DN/0.8)^2 m³ × 4,366.36 CZK/m³` encasement (899524) + `3,000 × DN/0.8 CZK/m` bedding/excavation/drainage allowance. Quantities and latter allowance are **provisional**. Two catalogue concrete heads are added.
- Frame metre = catalogue ×1.25 for bedding/waterproofing/natural-bed assembly (**provisional**). 4×2.5 and 5×3 frames extrapolate the 3×2 item by perimeter, not a claimed OTSKP rate. Endworks = **100,000 CZK × clear width per end**, provisional.
- Charge full skew-corrected barrel: **footprint / |sin(crossing angle)| × rate + two heads**. No more `culvertExtra` / crown+12 m deductible and no second excess-length charge. The remaining road-base norm represents ordinary road drainage; explicit mapped watercourse structures are additional measured objects. The SPK drainage share is not separately quantified, so residual aggregate-norm overlap remains an appraisal uncertainty, not an exact BOQ reconciliation.

## 4. Hydrology data and its limits

[ČHMÚ GIS practice](https://www.vtei.cz/2022/02/prakticke-priklady-vyuziti-gis-v-hydrologii-v-chmu/) says M-daily and N-year flow data can be provided for arbitrary profiles, not just gauges. This is the appropriate real-project source; no open arbitrary-point Q100 API was verified. [DIBAVOD structure](https://www.dibavod.cz/27/struktura-dibavod.html) and [HEIS hydrological catchments](https://heis.vuv.cz/data/spusteni/pgstart.asp?pg=HTML_HEIS$HydrologPovodi$info&pgload=1&ico=icoopeninf.png&nadpis1=Hydrologick%E1%20povod%ED&nadpis2=Informa%E8n%ED%20str%E1nky) expose river-network/catchment context sourced from ČHMÚ. Basin IDs/boundaries support joins and area estimates; they do **not** themselves supply Q100.

The implementation uses **25 m D8 accumulation from the 5 m DMR grid**, waterway burning, depression filling and flat drainage. Area is sampled near each densified OSM reach point. `watercourses.json.gz` stores OSM ID, kind (stream/river/ditch/canal; drain normalized to ditch), tagged width if parsable, pointwise upstream km² and an **incomplete/uncertain** flag. Independent vector geometry prevents a road/railway raster pixel from erasing a stream.

**Play-rectangle truncation is material:** no upstream terrain outside the Czech DMR/play rectangle is invented. Contributions touching domain edges or missing/Polish terrain propagate uncertainty downstream. A zero/unknown area remains flagged, not silently treated as a complete tiny basin. 25 m smoothing, burning, adjacent-cell snapping, culverted/artificial drainage and missing channels can still misroute flow. These are approximate delineations, not ČHMÚ certified catchments. A larger hydrological DEM domain or official profile data is the next accuracy improvement.

Implemented **provisional** upland proxy:

`Q100 [m³/s] = 3 × max(0.1, A[km²])^0.75 × U`, with `U=2` for incomplete catchments, otherwise 1.

Examples (complete): 0.1 km² →0.53, 1→3.0, 5→10.0, 10→16.9, 30→38.5 m³/s. **This is not a sourced Czech regional equation, a calibrated ČHMÚ model, or an uncertainty bound.** The factor two avoids pricing truncated data optimistically but cannot recover missing upstream area. Rainfall, soil, runoff, slope, snow, storage and shape are not resolved. Artificial ditches/canals use the same screening proxy faute de operational/diversion data; their actual design flows may differ substantially.

## 5. Implemented decisions and validation contract

`src/core/watercourses.ts` / `data/culverts.ts` share the same size/cost calculation between final bill, bridge-vs-fill selection and auto-profile estimate:

- Pipe tiers DN800–2000, ≥DN1000 for >15 m barrels (game floor; TP supports ≥800). Capacity = 70% full cross-sectional area ×2 m/s. Tagged channel width must fit.
- Natural-bed frame tiers 2×2 through 5×3 m. Capacity = `(clear width − bank allowance) × 0.75 height ×2 m/s`. These hydraulic-area/velocity allowances are screening assumptions, not an inlet/outlet, tailwater, freeboard, slope or scour calculation.
- **Bridge required** for rivers, exceeding the largest frame's capacity/width, or footprint-length >100 m. Pipe limit 80 m; 80–100 m uses a frame. Both length limits are **game maintainability limits**, not TP limits. A bridge opening allows channel width +2 m banks each side, or the screening flood width if larger, corrected for skew; existing minimum bridge-run length still applies.
- Barrel crown needs 0.8 m cover; Auto requests ≥3 m bed-to-grade clearance (or the larger opening+cover). **Cutting through a watercourse is invalid**, not an unpriced diversion. A sufficiently deep bored tunnel may preserve the surface stream. Manual conflicting structure paint remains visible and invalid.
- `Result.parts.culverts` bills full assemblies only for earthwork; bridge/tunnel cells do not also pay a culvert. `Result.waterCrossings` exposes decisions, area, Q100 and cost. Culvert cost is a distinct HUD/profile cost group, with blue-ring map/profile markers. Reported bridge cost is the associated whole bridge-run item (possibly shared), not a separate water-crossing surcharge.
- Legacy raster-only packs retain a conservative unknown-area fallback; new packs use exact vector intersections and only merge coincident endpoints, not every pair of streams within 30 m.

Validation results and the owner's ~km12.2 crossing are recorded in [17-stream-validation.md](17-stream-validation.md). Run `npx tsx scripts/stream-report.ts scripts/best-design.json` to reproduce the crossing table.
