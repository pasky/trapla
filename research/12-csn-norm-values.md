# ČSN road-design values: traffic, junctions and 2018 geometry

Research memo for the game's Czech rural-road model. The paid standards are not reproduced here; quoted snippets below are short excerpts from public teaching/revision material and project documents. **Confidence** means confidence in the reported figure and its edition, not approval for real design. Values in `norms.ts` previously marked provisional should remain so unless noted.

## 1. Traffic intensity → category / capacity

### What the public evidence supports

- ČSN 73 6101 category selection is **not a universal AADT lookup**. The VUT FAST course text *Aplikace ČSN 73 6101*, undated reproduction of the pre-2018 standard, says: “Jednotlivým kategoriím silničních komunikací odpovídají návrhové hodnoty intenzit silničního provozu” and forecast traffic “nesmí překročit návrhové intenzity odpovídající prostorovému uspořádání … výhledové skladbě … a požadovaným jízdním rychlostem” (p. 6, section on category choice). It also says changes of category should be resolved “v oblasti křižovatky.” [PDF](https://www.fce.vutbr.cz/pko/sad/pdf/aplikace.pdf). This is useful policy, but the reproduced category intensity table is **not** the 2018 norm.
- The 2018 revision presentation explicitly gives a threshold only for the large cross-section: D/R 27.5 “zpravidla” when forecast intensity reaches “hodnot větších než 19 000 voz./den” within 20 years of opening (Radimský, *Revize ČSN 73 6101*, 28 May 2019, slide 5). [PDF](https://konference-projektovani.cz/wp-content/uploads/2022/03/9.pdf). This is a qualifying threshold for a divided, four-lane category—not an S9.5 capacity figure or a general AADT mapping. **Confidence: high** that the slide reports this 2018 rule; medium that it captures all exceptions.
- The same slide deck lists the new design-speed/category pairs (slide 4): S 11.5/S 9.5/S 7.5/S 6.5 at 90 km/h; S 20.75 at 90; S 21.5 and S 15.25 at 110; D/S 26.0 etc. at 130. It does **not** provide AADT cutoffs for the two-lane categories.
- Older VUT material (pre-2018) says S7.5 at 300–1,500 vehicles/24h and permits S6.5 up to 300 (PDF p. 7). This is an explicit old-edition low-volume rule, not a basis for modern S9.5/S11.5 cutoffs. [Same VUT PDF](https://www.fce.vutbr.cz/pko/sad/pdf/aplikace.pdf). **Confidence: high as historical quote; not current.**
- TP 188 (2018), *Posuzování kapacity křižovatek a úseků pozemních komunikací*, is capacity-assessment guidance rather than an AADT-to-category table. [Official TP 188 PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_188_2018.pdf); [TP index](https://pjpk.rsd.cz/technicke-podminky-tp/). A 2019 TP 188 presentation defines capacity as the greatest number of vehicles a road can theoretically carry in a chosen period (slide 4), which is distinct from forecast daily demand. [PDF](https://konference-projektovani.cz/wp-content/uploads/2022/03/10.pdf). No robust openly accessible source located in this pass that assigns a single veh/h or veh/24h capacity to each 2018 category.

### Defensible game mapping (not claimed as a norm table)

| Forecast 24h traffic | Suggested game treatment | Basis / confidence |
|---|---|---|
| ≤1,500 | S7.5 (or a narrower low-volume category, if added) | Historic VUT S7.5 range is only a rough legacy indicator; **low confidence/current applicability**. |
| 1,500–10,000 | S9.5 default; allow S7.5 on low-speed/lower-class routes and S11.5 where heavy traffic/slow vehicles justify | **Scenario heuristic, low confidence.** Category choice also requires design-hour directional flow, heavy-vehicle share, terrain, desired speed, and junction/capacity assessment. Do not label 10,000 as a ČSN cutoff. |
| 10,000–19,000 | S11.5 / assess 2+1 or divided solution; do not hard-switch on AADT alone | **Scenario heuristic, low confidence.** AADT alone omits peak hour and direction split. |
| >19,000 | Consider divided 4-lane D/S category (e.g. D/S 25.5/26.0 or 27.5 depending project), with capacity assessment | 2018 slide says D/R27.5 is normally considered above 19,000 veh/day at year 20; applying that exact number to all divided categories is not warranted. **Medium confidence for the 27.5 trigger only.** |

For 9,000 veh/day, retaining S9.5 is a reasonable **game scenario**, not a verified normative determination. Calculate a peak-hour design flow from forecast AADT, directional split and vehicle composition, then use TP 188/appropriate capacity analysis; do not call a nominal daily capacity normative. **No defensible universal two-lane rural road veh/24h maximum found.**

## 2. Junction spacing and direct accesses

### Minimum spacing

- **At-grade junctions on class I outside built-up areas:** reported minimum permitted spacing **1.5 km** under ČSN 73 6101:2018. A 2024 official administrative document states “nejmenší vzdálenost křižovatek na silnicích I. třídy 1,5 km” and distinguishes ČSN 73 6102 (location/form) from 73 6101 (minimum spacing). [Document dated 30 Oct 2024](https://espis.desu.gov.cz/eDeska/download.jsp?idPriloha=423). A project technical report likewise says “Dle ČSN 73 6101/2018 je min. dovolená vzdálenost pro silnice I. třídy 1,5 km” and adds that reconstruction spacing is considered in context. [Report, Selibov](https://www.selibov.cz/wp-content/uploads/2024/03/B.-Souhrnn%C3%A1-technick%C3%A1-zpr%C3%A1va.pdf). **Confidence: medium-high** for class-I minimum, as both are secondary reproductions of current norm; exact clause/table could not be inspected.
- **Grade-separated intersections on motorways/high-speed divided roads:** 4 km is widely quoted for motorways, with possibility to reduce to 2 km near large cities in justified cases. This comes from older ČSN 73 6101 / project citations and is **not confirmed for 2018 or for ordinary class-I S roads**. Example explicitly says R at Vn=120 has minimum 4.0 km, reducible to 2.0 km near large cities: [discussion quoting norm](https://forum.ceskedalnice.cz/viewtopic.php?t=1856&start=50). Another planning page reports the motorway 4 km value and refers to table 21, but without edition. [Odolena Voda](https://www.odolenavoda.cz/letiste/d-4606). Do not apply 4 km to S9.5 at-grade crossings.
- The older public Vzorové listy VL 3 table (2010) says it lists “Nejmenší dovolené vzájemné vzdálenosti křižovatek … dle ČSN 73 6101, tab. 21”; rows include 1,000 m/150 m/50 m for various road classes and conditions, but this is not the 2018 table and not safe to use as the class-I current value. [VL 3 (2010), PDF](https://pjpk.rsd.cz/data/USR_001_2_10_VL/VL_3_2010_01.pdf). **Conflict/version warning:** urban-road ČSN 73 6110:2006 Table 2 has separate urban functional-category distances; amendment Z1 (2010) changed its A-speed-road entry from 500 to 1,000 m. These must not be substituted for rural class-I spacing. [73 6110 PDF](https://unmz.gov.cz/files/normalizace/%C4%8CSN%2073%206110/74506.pdf); [Z1 PDF](https://www.unmz.gov.cz/files/normalizace/%C4%8CSN%2073%206110/85035.pdf).

**Game recommendation:** enforce 1.5 km minimum between ordinary at-grade junctions on a new rural class-I road. For motorway-grade interchanges use 4 km as provisional default, with 2 km exceptional urban-area override; label that 2018 status unverified. No evidence found for a separate smaller grade-separated spacing on a conventional class-I S9.5 road.

### Sjezdy, field tracks, and property access

- Act 13/1997 §10(1) permits connecting public roads by junctions and connecting adjoining property by “sjezdů nebo nájezdů”; §10(4) requires permission. [Consolidated law, §10](https://www.zakonyprolidi.cz/cs/1997-13). This distinguishes property access from a public-road junction; access does not create a through-road node.
- Decree 104/1997 §12(1) states “Sjezdy a nájezdy … lze zřídit, jen pokud …” and conditions them on safety/operation; application is subject to the road authority’s authorization. [§12](https://www.zakonyprolidi.cz/cs/1997-104). Neither source grants a right to attach a driveway anywhere along a new class-I road.
- VL 3 (2010) explicitly notes the spacing table exclusion for forest/field roads and says in built-up areas it applies only to access of significant publicly used special-purpose roads under 73 6110 (notes under the table). The 2018 ČSN detailed treatment of field-track crossings/accesses could not be directly verified. Safe game rule: consolidate field tracks/local access via approved junctions or under/overpasses; direct parcel entrances are explicit, permitted sjezdy only, not general network junctions. **Confidence: medium for permit distinction; low for specific field-track design rule.**

## 3. 2018 geometry values and game data audit

Primary freely inspectable source for the revision is Michal Radimský, *Revize ČSN 73 6101 Projektování silnic a dálnic*, presentation 28 May 2019. It states the revision entered force October 2018 (slide 2); its numeric tables below are a direct presentation of the 2018 revision, not the paid standard itself. [Full PDF](https://konference-projektovani.cz/wp-content/uploads/2022/03/9.pdf).

### Maximum longitudinal grade, S9.5

The 2018 table is not organised by category alone; it reports design speed by terrain. Since S9.5 design speed is 90 km/h, the relevant *nominal* row is 90 km/h (the game should not treat 70/80 choices as the category's original design-speed row). The old VUT table, explicitly “podle ČSN 73 6101” (pre-2018, p. 10), lists S11.5/S10.5/S9.5 at 4.5% flat, 6% hilly, 7.5% mountainous. [VUT application PDF](https://www.fce.vutbr.cz/pko/sad/pdf/aplikace.pdf). This is exactly the likely source behind the current `maxGradient: 0.06`, but it is an **older edition**.

**2018 exact terrain values for S9.5 were not exposed in the revision presentation or found in a freely accessible verbatim table.** The presentation verifies the new 90 km/h design-speed designation but not the grade table. Therefore do not promote 6% as verified 2018. Keep 4.5/6/7.5% only as explicit legacy provisional values pending a current table. **Confidence:** high for old values; low/unverified for their 2018 continuation. Some project documents using 2018 cite 4.5% for a particular road, but they do not establish terrain maxima.

### Minimum horizontal radii at superelevation

Revision presentation slide 6 gives “Nejmenší dovolený poloměr [m]” at the following superelevations. The current game values for Rmin and no-superelevation threshold are confirmed directly:

| Design speed | At 6% superelevation | Radius not requiring superelevation | Game value | Confidence |
|---:|---:|---:|---:|---|
| 90 km/h | 355 m | 1,160 m | 355 / 1,160 m | High |
| 80 km/h | 280 m | 920 m | 280 / 920 m | High |
| 70 km/h | 205 m | 705 m | 205 / 705 m | High |

Quote/table: Radimský 2019, slide 6, table columns 90/80/70 and 6%; source edition **ČSN 73 6101:2018**. This confirms `norms.ts` horizontal radius values, with the important condition that these are for **6%** superelevation and must still satisfy stopping sight distance (slide footnote refers to tables 10 and 8.17). Values at 2.5%, 3%, 4%, 5% are also 90: 570/540/480/420 m; 80: 450/430/380/330 m; 70: 350/330/290/250 m. No need to substitute old-edition values.

### Crest/sag vertical curves; is there a 90 km/h column?

- Old VUT application table (pre-2018, p. 11) has columns 120, 100, 80, 70, 60, 50—not 90. Its minimum allowed crest radii are 11,000; 6,000; 3,000; 2,500; 1,500; 1,000 m respectively (90 km/h is absent). Sag minima are 5,000; 3,400; 2,100; 1,500; 1,000; 700 m. [PDF](https://www.fce.vutbr.cz/pko/sad/pdf/aplikace.pdf). Thus current game's 90=100 km/h proxy (6000/3400), 80 (3000/2100), and 70 (2500/1500) reproduce this older table exactly; the 90 proxy is not a 90-column value.
- 2018 revision fundamentally ties profile design to stopping sight distance; the revision presentation does not reproduce a fixed crest/sag minimum-radius table. It also states (slide 4) that S9.5 design speed is 90 km/h. **No 90 km/h crest/sag numeric column is verified from a public 2018 source.** It is therefore incorrect to call 6000/3400 the 2018 90-km/h values, and equally unjustified to interpolate/extrapolate them as normative. Keep all current vertical radii provisional, mark 90 as legacy proxy, and ideally change validation to a sight-distance-based rule only once the 2018 SSD assumptions/tables are obtained. **Confidence: high** on the old table and absence of old 90 column; low on the exact 2018 replacement implementation.

### Crown width

For single-carriageway categories the nominal formation/category width in the 2018 nomenclature is the category number: S9.5 means 9.5 m. The 2018 revision presentation's design category list includes S9.5 (slide 4), but does not reproduce the cross-section dimension table. The public pre-2018 VUT cross-section table gives S9.5 nominal category width b=9.5 m and decomposes the two-lane crown (p. 7) into 7.0 m lanes + 0.5 m guide strips + 1.0 m paved shoulders + 1.0 m unpaved shoulders = 9.5 m. **High confidence as nominal category width; medium for identical 2018 component allocation.** In game `crownWidth: 9.5` is correct if “crown” means category/formation width, not paved width: S9.5 paved portion is 8.5 m in the old table, not 9.5.

## Recommended values / implementation decisions

1. Keep `minRadius` 355/280/205 m and `noSuperelevationRadius` 1160/920/705 m for 90/80/70; these match ČSN 73 6101:2018 at 6% and require sight-distance check.
2. Keep `crownWidth=9.5m` as nominal category width. Document that paved width is distinct (historical breakdown: 8.5m).
3. Do **not** describe gradient 6% or vertical radii 6000/3000/2500 crest and 3400/2100/1500 sag as verified 2018. Preserve as provisional legacy values; the 90 values are actually the old 100 km/h column, because old table has no 90 column.
4. Use rural class-I junction spacing 1.5 km as the best-supported 2018 value (medium-high); do not use urban 73 6110 values. Keep 4 km/exceptional 2 km only for motorway/high-speed interchange simulation, flagged legacy/unverified for 2018.
5. Do not encode a normative daily-volume mapping for S7.5/S9.5/S11.5. Scenario heuristic at 9,000/day = S9.5 is reasonable but low-confidence. A publicly quoted 2018 threshold is D/R27.5 normally at forecast >19,000 vehicles/day within 20 years; it is not a two-lane cutoff/capacity.
6. Distinguish permitted property sjezdy (explicit, access-only, authorized) from junctions; consolidate field tracks. No evidence supports arbitrary direct access to new class-I alignments.
