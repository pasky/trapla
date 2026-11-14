# International bridge construction cost evidence: parametric drivers

**Purpose.** Evidence for a simple Czech study-stage model of the form `deck area × superstructure base rate + piers × height rate + foundations + fixed abutments`. This note separates observed cost data from suggested model structure. It does **not** claim that international unit rates can be transplanted directly into Czech SPK/OTSKP prices.

## Findings in brief

- Strongest directly useful empirical evidence is Germany’s TU Dresden analysis of **42 awarded Autobahn bridges**. It regresses cost per deck-area against total deck area and separates bridge function and traffic handling. Published summary confirms nonlinear area curves and cost-group estimates for foundations, substructures and superstructures; the exact fitted total-cost coefficients are embedded in figures and not recoverable as text from the visited page. Its underlying 334-page study is needed before reusing coefficients.
- FHWA’s 2024 NBI replacement unit-cost series provides a broad, annually updated **whole-replacement $/deck-area benchmark**, not a new-build superstructure rate. National mean reported for NHS bridges is **$429/ft² = $4,617/m²** (429 × 10.764), and for non-NHS **$382/ft² = $4,111/m²**. These are nominal US dollars, computed from reported state bridge replacement costs, averaged across 2022–24 submissions for 2024 estimates. This is useful as a whole-bridge cross-check only.
- A German government road-project estimate gives explicit, recent planning rates: small new bridges **€4,500/m²** for bridge areas in the 300–600 m² class and large valley bridges **€2,750/m²** for >1,000 m². These are project-specific experience values, not a standardized national tariff; their difference illustrates area/structure-class effects, not a pure span coefficient.
- The public evidence reviewed supports modeling deck area nonlinearly and treating exceptional foundations/traffic management separately. It does **not** establish a transferable numeric €/m-pier-height coefficient or a generic foundation €/pier amount. Do not invent either: derive them from Czech SPK/OTSKP quantities and priced project bills, or present them as explicit calibrated assumptions.

## Sources and quantitative details

### Germany — TU Dresden / Autobahnamt Sachsen cost functions (empirical awards)

[Naumann, Heilfort & Schach, “Kostenkennzahlen für Brückenbauwerke im Autobahnbau” (2002), visited article and linked PDF](https://heilfort.de/05-kostenkennzahlen-fuer-brueckenbauwerke-im-autobahnbau/) (article source cites *Straße + Autobahn*, 9/2002, pp. 502–509; [direct PDF](https://heilfort.de/wp-content/uploads/b05-naumann-heilfort-schach-kostenkennzahlen-fuer-brueckenbauwerke-im-autobahnbau.pdf)).

- Dataset: awards/prices for **42 bridges**; four types formed from bridge function (Autobahn bridge vs overpass) and whether built with traffic maintained (replacement) or without traffic-management constraints (new build).
- Deck area definition: span from end bearing lines × width between inner edges of deck railings.
- The authors produce cost functions for total work and AKS cost groups; costs are expressed as cost per m² versus deck area, with a separate fit per bridge class. The reported general functional form for total cost density is `y = a × x^b`, where `x` is deck area and `y` is net construction € / m²; total is `x × y`. The applicable source-data range is **150–3,000 m²**, extendable to **9,000 m² only for Autobahn bridges without traffic management**. Larger sizes lack adequate data. As area grows, €/m² commonly declines for earthworks, excavation, foundations, bearings, expansion joints and technical design; some categories (e.g. scaffolding/temporary works/demolition) may increase per m².
- Cost groups include foundations (AKS 42), substructures (43), superstructure (44), ancillary/temporary works (45), bearings/joints (46), etc. The article explicitly says deep foundations, waterworks and noise barriers are special costs excluded from the standardized bridge rate and must be added case-by-case. Replacement under traffic is generally costlier than greenfield construction due to demolition, traffic handling, and more demanding earthworks/substructure/access.
- A worked *component* example gives six observed costs for AKS/standard work item LB 115; one observed pair is area **487.68 m²**, **€31.61/m² net**. After excluding two non-comparable cases, the example regression on four observations is `y = 357.1 × x^0.4094` (this is only LB 115—paving/kerbs/channels—not a bridge total; not suitable as a bridge unit rate).
- Statistical caveat: only 42 bridges, nonuniform/small samples; source itself calls for cautious use and updating. The numeric coefficients and plotted confidence limits for total bridge classes appear in figures, not extracted here; therefore this note does not quote a fictitious curve.

**Model implication (inference, not source formula):** a `€/m² × deck area` term is a defensible early baseline, with a class/size-dependent area rate and separate additions for known unusual costs. This source does not give a generic independently fitted cost per pier-height meter.

### Germany — official planning estimate with explicit bridge rates

[Regierungspräsidium Stuttgart, B27 Neckarsulm feasibility study, Appendix 2: cost estimates based on experience/unit values](https://rps.baden-wuerttemberg.de/fileadmin/RP-Internet/Stuttgart/Abteilung_4/Referat_44/B27_AS_Neckarsulm_B27_L1095/Planunterlagen/U1_2_Anh_2_Kosteneinschaetzung.pdf), visited PDF. In variant 1.1, bridge-related planning entries (net) are:

| Scope in estimate | Quantity × unit rate | Total |
|---|---:|---:|
| New small bridges, “L bis ca. 100 m” | 3,500 m² × **€4,500/m²** | €15.75m |
| New valley bridges, >1,000 m² | 8,750 m² × **€2,750/m²** | €24.0625m |
| Demolition, small bridges, no parallel traffic | 1,390 m² × €330/m² | €458,700 |
| Demolition, valley bridge >1,000 m² | 3,600 m² × €500/m² | €1.8m |

The study gives bridge-area class and experience rate, not individual bridge span, pier height or foundation quantities. Its two new-build rates differ by 1.64×, but this is **not** a controlled causal comparison: construction type, project/site and bridge class differ. It is a useful independent planning-rate check only. The document also shows noise walls at €525/m² on a retaining wall/trough/bridge vs €700/m² on their own foundation, illustrating that support/foundation configuration matters, but those are noise-wall rates, not bridge foundation rates.

### United States — FHWA/NBI whole replacement rates

[FHWA, Bridge Replacement Unit Costs 2024](https://www.fhwa.dot.gov/bridge/nbi/sd2024.cfm), visited. FHWA displays state-level replacement costs in dollars/ft², areas per NBI deck-area definition, and says the cost used for 2024 estimates averages current and previous two years of submitted unit costs. National average of costs collected: NHS **$429/ft²**, non-NHS **$382/ft²**. Convert to per m² by multiplying $/ft² by 10.764: NHS **$4,617/m²**, non-NHS **$4,111/m²** (rounded). FHWA says unit costs vary year-to-year and averaging reduces variation. The page estimates rehabilitation at 68% of replacement for its poor-bridge funding totals; that ratio is an FHWA estimation convention, not a new-build cost factor.

These are whole-replacement values at network-program level, not a design-specific engineering estimate. They pool bridge systems, site conditions and scopes; use only as an external plausibility band after adjusting price date/currency and scope. State values vary greatly (the NHS table includes e.g. Texas $109/ft², Massachusetts $1,606/ft²), demonstrating why one national average cannot price a specific site.

### United States — FHWA model / academic model leads (not used for rates)

- FHWA’s [Slide-In Bridge Construction Cost Estimation Tool Guidelines](https://www.fhwa.dot.gov/construction/sibc/pubs/costest/sibc_costest.pdf) says the cost difference can be estimated using difference in deck area and unit bridge cost, while noting that the slide-in alternative can require larger foundations. This supports deck area as a baseline and explicit foundation adjustments, but it is a method for comparing a construction technique, not a general pier-height equation.
- [Parametric Model for Conceptual Cost Estimation of Bridge Foundations](https://ascelibrary.org/doi/10.1061/%28ASCE%29IS.1943-555X.0000044) (ASCE; page visit blocked by bot verification). Search-indexed abstract says it develops a conceptual foundation cost model and that foundation costs include earthworks and foundations. No formula, sample, or numeric rates verified from the accessible source, so no quantitative claim is made from it.
- [Kentucky Transportation Center, Updating the Bridge Construction Cost Database](https://uknowledge.uky.edu/cgi/viewcontent.cgi?article=2761&context=ktc_researchreports) describes a database compiled by summing plan quantities and successful-low-bid pricing by structure. Search-indexed source says DOTs commonly base conceptual bridge estimates on deck area. Useful as a model/data methodology lead, but no extracted quantitative rates used here.

### Austria — ASFINAG / context and missing rate evidence

- ASFINAG’s [Bridge Planning Handbook (PLaPB BR, 2021)](https://www.asfinag.net/media/2402/plapb-8003001000-bruecke-v700-technische-richtlinie.pdf) is an engineering design guideline rather than a rate book; it specifies design requirements, not a verified pier-height/foundation price curve.
- ASFINAG’s [Netzzustandsbericht 2022](https://www.asfinag.at/media/p5tpase5/netzzustandsbericht-2022.pdf) reports 5,819 bridges and around **5.9 million m²** of bridge deck area. Useful inventory scale, no bridge-build unit cost identified.
- A search located [ASFINAG Steinbrückenbach viaduct project page](https://www.asfinag.at/bauen-erhalten/bauprojekte/a-10-neubau-taluebergang-steinbrueckenbach/) reporting planned total project cost €70m, but no verified deck area/cost split was extracted, so it cannot calibrate €/m² or a pier term.
- The Luegbrücke sources encountered report differing scope totals and are not used as rates; do not divide project budgets by deck area without verifying contract scope, price basis and included approach works.

No accessible public ASFINAG source reviewed here provided a standard unit rate for piers, pier height or foundations. Treat that as a data gap rather than imply the Austria material supports the proposed equation.

## What the evidence supports for a simple Czech model

A transparent candidate structure is:

`C_bridge = A × r_superstructure(A, type, span regime) + Σ C_pier(height, section/material) + Σ C_foundation(ground/foundation type) + C_abutments + C_site/traffic + C_fixed`

This is a **model architecture recommendation**, not a published international formula. Interpret each term carefully:

1. **Area/base:** Germany’s empirical evidence supports area-based cost curves (not a universal flat €/m²) differentiated by bridge type and traffic handling. A single `area × span-base` risks double-counting area if “span-base” already encodes span. Prefer a named area-rate with a span-regime multiplier/curve, or model area and structural system explicitly.
2. **Span effect:** span affects superstructure system, depth, erection and temporary works; the sources reviewed do not provide a controlled, general span-only coefficient. Derive span factors from Czech project data stratified by material/system and span bands, not by treating German small-vs-valley rates as causal.
3. **Pier height:** none of the verified sources provides a transferable numeric `€/pier-height-meter` curve. A linear pier-height term is a tractable **assumption**, but actual pier cost depends on height, cross-section, pier count, seismic/wind design, access and construction method. Calibrate with Czech quantities/costs (concrete, rebar, formwork, bearings/access) or leave explicitly uncalibrated.
4. **Foundation:** the TU Dresden sample excludes deep-foundation special costs from standard rates; FHWA slide-in guidance notes foundation enlargement can add cost; neither supplies a universal foundation rate. Model foundations by type and quantities (e.g. pile length/count/diameter or footing concrete/excavation) and local ground, not only number of piers.
5. **Abutments/fixed costs:** fixed endpoint costs are a reasonable accounting decomposition but not separately estimated by the international aggregate sources reviewed. They must not be added on top of a benchmark that already includes them unless the base rate is explicitly stripped of those components.
6. **Avoid double counting:** German total bridge rates already cover standardized components including foundations and substructure (ordinary cases), while special deep foundations are excluded. If using a whole-bridge €/m² rate, add only clearly excluded exceptional foundation/site costs; do not add generic pier/foundation terms again.

## Czech normalization to SPK

International values above are benchmarks only; they must **not** be relabeled SPK rates. Normalize by scope, price year and currency before comparing:

- Start with Czech SPK-CN’s relevant bridge object/standard price basis for the matching year and define whether it includes design, traffic management, demolition, approach earthworks, land, VAT, risk, and special foundations. The project’s existing [research/05-costs.md](05-costs.md) identifies SFDI SPK-CN as the official study-stage database and OTSKP as itemized price structure.
- For an estimated bridge: use the SPK base for the same structure class/area if available; extract bridge-specific Czech bills and map them to superstructure, piers/substructures, foundations, abutments, equipment/ancillaries. Calibrate the component terms against priced quantities, preserving local units and scope.
- To compare a foreign figure, first adjust nominal price year using the relevant construction-cost index, then currency/PPP as appropriate, then reconcile scope and tax. FX conversion alone is not cost normalization. US $/m² and Germany/Austria €/m² above are stated at source-period prices and have not been escalated to current Czech prices.
- Report two outputs separately: (a) empirical whole-bridge benchmark (German award curve / FHWA replacement average / German planning rates) and (b) Czech SPK-normalized project estimate. Keep the former as cross-check, not model input unless a documented index and scope bridge is supplied.

## Evidence vs assumptions

| Claim | Status |
|---|---|
| German empirical costs regress against deck area, vary by bridge function and traffic handling; 42-award sample, 150–3,000 m² range (one type to 9,000 m²) | Source evidence: Naumann et al. article |
| German curve form `€/m² = a × area^b`; exact total coefficients | Form verified; coefficients not extracted from figure, intentionally unreported |
| German small-bridge €4,500/m² and valley-bridge €2,750/m² planning estimates | Source evidence: B27 planning appendix; project-specific experience values |
| FHWA 2024 national replacement averages $429/ft² NHS and $382/ft² non-NHS; metric conversions above | Source evidence + arithmetic conversion; whole-replacement, not new-build component rates |
| Area term as a conceptual baseline, with separate special foundation/site allowances | Supported general modeling inference from sources; not a universal formula |
| Linear `pier count × height × rate`, fixed abutment amount, chosen rates | Proposed simplifying assumptions only; no rate endorsed by sources reviewed |
| Czech SPK normalization via matched scope/year and Czech item/project data | Method recommendation; specific SPK bridge component rates not extracted in this task |
