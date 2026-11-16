# Local-road and track traffic priors: Czech sources

**Scope.** Candidate sources for default average daily traffic (AADT/RPDI, vehicles per 24 h) and heavy-vehicle share on roads not systematically represented in ŘSD’s national census. I distinguish measured traffic from design limits and road-design categories. A design limit or pavement-load class is not a measured AADT. I found no primary source giving a representative measured AADT *and* heavy-vehicle share for the requested OSM road classes; the recommendations at the end are therefore explicitly provisional where stated.

## Findings

### 1. Residential streets / local roads and residential zones

**Best usable Czech figure: 500 vehicles/day, a recommended upper design intensity for an obytná zóna—not an average.**

- **Value and unit:** up to 500 motor vehicles/day (`voz/den`).
- **Applies to:** communications with little traffic significance where a residential zone (`obytná zóna`) is being designed. This is a better match for quiet residential/local streets than the general class III-road average, but it is not a universal limit for all functional-group-C local streets (which can also carry through traffic or buses).
- **Nature:** design guidance / recommended intensity, not measured mean or statutory maximum.
- **Exact Czech quote:** “Obytné zóny se navrhují na komunikacích s malým dopravním významem s doporučenou intenzitou do 500 voz/den.”
- **Translation:** “Residential zones are designed on roads of little traffic significance with a recommended traffic intensity of up to 500 vehicles/day.”
- **Citation:** Ministerstvo dopravy, *TP 132 Zásady zklidňování dopravy na pozemních komunikacích*, 12/2024, § 7.2 “Urbanistické a dopravně-inženýrské řešení”, printed p. 78 (PDF p. 80). [Official PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_132_Zklidnovani_PK_2024_final.pdf).
- **Confidence:** High that the value and applicability are transcribed correctly; medium as an anchor for ordinary quiet residential streets, because the value specifically concerns residential-zone design and is not an observed distribution.

A related older source uses a similar number but states a different condition. TP 103 says: “Za limitní pro zřízení komunikace bez samostatných zvýšených chodníků se považuje intenzita 500 voz/den.” (“An intensity of 500 vehicles/day is considered the limit for establishing a street without separate raised footways.”) It adds that if motor traffic after establishing an obytná zóna is higher, another street type, e.g. a Tempo 30 zone, is recommended. This is **not** evidence that all residential streets average 500/day. Citation: Ministerstvo dopravy, *TP 103 Navrhování obytných a pěších zón*, § 5.2.1, printed p. 16; [official PJPK PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_103_2008.pdf). Confidence: high for the quote, low-to-medium for generalizing it beyond the stated design context.

ČSN 73 6110 identifies the function but gives no volume in the pertinent passages: “Obslužné místní komunikace plní obslužnou funkci, zpřístupňují území a stavby. Nemají umožňovat zbytečné průjezdy obytnými okrsky.” (“Local access roads serve an access function, providing access to areas and buildings. They should not enable unnecessary through traffic in residential districts.”) The same clause permits public transport, so group C includes routes unlike a quiet residential dead-end. Citation: ČSN 73 6110:2006, § 5.1.9, printed p. 20; [public UNMZ PDF](https://unmz.gov.cz/files/normalizace/%C4%8CSN%2073%206110/74506.pdf). Confidence: high. It supplies useful classification context, **not** a traffic prior.

### 2. Field and forest tracks / purpose-built roads

**No verified Czech source found that assigns an AADT or heavy-vehicle share to HPC, VPC, DPC, forest roads, or OSM `highway=track`.** The reviewed ČSN 73 6109 lecture material classifies roads by importance and construction, not traffic counts. It describes HPC as “vždy zpevněné, s odvodněním, celoroční sjízdnost” (“always surfaced, drained, all-year passability”); VPC as predominantly single-lane and serving directly adjacent land; DPC as single-lane, unsurfaced and potentially grassed. Thus treating all tracks as one traffic category is itself a rough simplification. Citation: ČVUT, *GPU2016 – Polní cesty* lecture slides, slides 8–10 (PDF slide numbering; no page numbering printed), [PDF](https://storm.fsv.cvut.cz/data/files/p%C5%99edm%C4%9Bty/GPU/prednasky%20GPU/GPU2016_polni_cesty_bez_obr.pdf). Confidence: high in the displayed classification, none as a numeric traffic source.

**Useful indirect pavement-design bound, not AADT:** TP 170’s lowest load class VI is defined by a daily average of **fewer than 15 heavy goods vehicles/day** (`TNVk < 15 voz`). Class V is 15–100 TNV/day. The text defines TNVk as average daily heavy goods traffic in the (partial) design period. Exact quote: “Pro rozdělení vozovek s běžným silničním provozem podle dopravního zatížení se používají třídy dopravního zatížení (TDZ) definované rozpětím průměrných denních intenzit provozu TNVk podle tabulky 3.” (“For dividing pavements with ordinary road traffic by traffic load, load classes are used, defined by ranges of average daily TNVk traffic intensity in Table 3.”) Table 3: “V 15–100”; “VI <15”.

- **Applies to:** pavement design, including some low-volume local and purpose roads; TP 170 classes are not assigned specifically to field/forest tracks and do not constrain total vehicles/day.
- **Nature:** design-load category boundary, not a measured average or a guaranteed maximum for tracks.
- **Citation:** Ministerstvo dopravy, *TP 170 Navrhování vozovek pozemních komunikací*, 2/2024, § 3.2.2 and Table 3, printed p. 18 (PDF page 21); [official PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_170_2024.pdf).
- **Confidence:** High for table/text and the interpretation as TNV/day; low for using it to infer track AADT or percentage heavy vehicles. The formula converts/increases traffic for a design period, so this is not equivalent to present-day observed traffic.

### 3. Service roads

**No separate Czech AADT or heavy-share prior verified.** OSM `highway=service` spans materially different things (access drives, industrial access, parking aisles, service lanes), so a single traffic number is especially weak. Neither the cited ČSN 73 6110 local-road function description nor TP 170’s pavement-load table identifies an OSM service-road type or supplies a typical count. The TP 170 VI threshold above can be used only as a low-load design reference, not a universal service-road ceiling.

- **Value / quote / citation:** no applicable numeric source verified; hence no quote to report.
- **Confidence:** High that the reviewed candidates do not establish a class-wide number; this is not proof that no local study or road-owner count exists.

## Measured counts and non-Czech comparisons

The available search result for ČSÚ’s historical account of the national census notes that counting took place on roads “nejen na komunikacích mezi městy, ale v některých případech i uvnitř měst” (“not only on roads between cities, but in some cases also within cities”). That does not establish that local streets were systematically sampled or provide a class-level local-road AADT, so it cannot support a local-road prior. Citation: ČSÚ, “5.5 Doprava”, [webpage](https://csu.gov.cz/produkty/101362-09-2000___2008-5_5_doprava). No suitable measured local-street dataset with both AADT and heavy share was verified in this search.

German RASt 06 references found in secondary search results report up to 400 motor vehicles/hour (roughly 4,000 per working day) for Wohnstraßen, but this is a different design context, the cited result is secondary, and it is not a suitable Czech default. I do not recommend importing it. No German figure is used in the recommendation.

## Recommendation for game defaults

These are **game priors, not published Czech averages**. Keep them tagged `PROVISIONAL`, expose them as assumptions, and replace them with segment-specific survey data where available. Heavy shares below are likewise not sourced by the documents above; they are explicit fallback heuristics, not empirical claims.

| Game road type | Suggested initial prior | Heavy share | Best evidence / qualification |
|---|---:|---:|---|
| Quiet local/residential street (`residential`, `living_street`, residential `unclassified`) | **300 vehicles/24 h, PROVISIONAL** | **3%, PROVISIONAL** | TP 132 recommends up to 500/day for residential zones. Choosing 300 as a central game prior below that recommended threshold is a design choice, not a cited mean. Do not apply to town through-roads, bus routes, or busier C streets. |
| Service road (`service`) | **50 vehicles/24 h, PROVISIONAL** | **5%, PROVISIONAL** | No class-wide count exists in the verified sources; this low default is a gameplay placeholder for access/service function. Industrial accesses and parking circulation should be overridden upward; nearly unused farm accesses downward. |
| Field/forest track (`track`, including DPC-like paths) | **10 vehicles/24 h, PROVISIONAL** | **5%, PROVISIONAL** | No Czech AADT figure verified. TP 170 class VI’s `<15 TNVk/day` is a useful low-volume *heavy-traffic design-class* reference, not an observed track count; a 10/day total default stays below that heavy-vehicle threshold even if traffic composition differs. Keep HPC/VPC-like, farm-serving or recreational routes overridable. |

Avoid reporting a “sourced heavy percentage” for any of these types: the found Czech standards provide none. The game should not infer heavy share from the CSD class III average and silently transfer it to tracks. If a fully source-derived prior is required, the defensible result is **unknown AADT and unknown heavy share** for service roads and tracks, and **at most a recommended 500/day ceiling for the specific residential-zone context**, not an average, for local streets.
