# Tie-in junctions of a new road to an existing road

Research memo for connecting a new two-lane rural road (S 7.5 / S 9.5 / S 11.5; chosen design speed 70/80/90 km/h) to an existing ground road by an at-grade junction. Values are for a game model, not a substitute for project-specific design. Paid ČSN text is not treated as inspected. **Confidence** describes evidence quality. Costs are nominal reported award/estimate amounts; no inflation normalization is attempted. Related material: [08-junctions-crossings](08-junctions-crossings.md) already covers at-grade permission, broad junction cost placeholders, roundabout awards on I-class roads, and class-I spacing; [12-csn-norm-values](12-csn-norm-values.md) covers ČSN 73 6101 class-I spacing and older VL 3 spacing; [13-crossing-items-tenders](13-crossing-items-tenders.md) already details class-I roundabout costs; [20-minor-road-gradients](20-minor-road-gradients.md) covers ordinary gradients of local/tertiary roads. This note focuses on tie-in geometry and lower-class evidence.

## Adopted game values / decision table

| Topic | Adopted rule/value | Status and confidence |
|---|---|---|
| Junction form | Default to a simple priority T; X only where the network actually requires four arms. Consider a roundabout as an alternative for multiple arms, speed management, or demonstrated capacity/safety need—not as the default tie-in. | ČSN 73 6102 exact decision graph/criteria not accessible. Secondary reproduction supports these qualitative rules; **medium** for general typology, **low** as an automatic choice algorithm. |
| Lower-class tie-in | At-grade connection of a new public road to class III/local/service road is generally possible subject to approval, sight, spacing and standard-compliant form. Use priority T (or X if warranted); a class III/local label alone does not mandate a roundabout. | Act 13/1997 §10 summarized in [08](08-junctions-crossings.md); exact class-pair table/form criteria **UNVERIFIED**. |
| Junction-area gradient | Aim for ≤3%; avoid >6%. Use provisional 5% cap for the minor-road approach in the final 20 m before the conflict area. | VL 3 2010 secondary drawing note says preferable ≤3%, “nedoporučuji … nad 6%” for crossing branches. No verified ČSN 73 6102 specific “minor road length X / max Y%” clause found; 5% over 20 m is **PROVISIONAL**, not a claimed norm value. |
| Minor-road sight triangle | For an at-grade junction on a rural public road use the ČSN 73 6102 sight triangle, not the property-splay stopping sight-distance rule: secondary reproduction gives XB/XC (speed 50…90): 70/65, 90/80, 110/100, 135/120, 160/145 m for speeds 50/60/70/80/90 km/h respectively. Eye point 2.5 m from edge of adjacent lane is a defensible provisional assumption; verify against exact clause/table. | Public secondary reproduction of table 19 in ESTAV article; **medium** for reproduced values, low for legal/current status. Exact current 6102 norm inaccessible. See distinctions below. |
| Eye/object / obstacle | Use 1.0 m eye height for passenger car; for game visibility, obstacle ceiling 0.75 m above road is a conservative practical rule. | ESTAV discusses driveway/site access, not precisely public-road junctions; VL 3 reproduction gives obstacle exclusion relative to line of sight (0.25 m below ray). **Provisional for this junction model.** Do not claim object-height=1.0m norm value. |
| Turn-lane footprint | Make auxiliary lanes conditional on traffic/safety and site geometry; where present include taper/deceleration/storage (Lv + Ld + Lc for a left turn; terms differ for right turns), rather than one fixed junction length. | Tables 7/8 etc. of 2007 ČSN 73 6102 not publicly verified numerically in this pass. **UNVERIFIED** lengths for 70/90 km/h. |
| Roundabout size | Do not enforce 30–50 m as a universal rural diameter. VL 3 secondary notes cite TP 135: 23 m < D < 50 m corresponds to 30 km/h entry/exit design speed; D > 50 m corresponds to 50 km/h. Use 30–50 m only as a **PROVISIONAL game envelope** for compact single-lane rural concepts; no verified recommendation by I/II/III class found. | TP 135 (2017) and VL 3 2010 are the sources; exact table/site-selection criteria **UNVERIFIED**. |
| Spacing | Class I: 1.5 km as in [12](12-csn-norm-values.md). For class II/III, do not implement an asserted current minimum until current table confirmed; older VL 3/ČSN 73 6101 values are edition-dependent (see below). | Class I medium-high (secondary current citations); lower classes **UNVERIFIED current**. |
| Price | Retain T/X 25m CZK (range 15–35m), roundabout 32m (20–40m) from [08](08-junctions-crossings.md), [13](13-crossing-items-tenders.md). A small class-III/local tie-in can use **PROVISIONAL 5–10m** only for a simple compact scheme without major utilities, sidewalks or extensive approach reconstruction. | T/X original estimate low confidence; roundabout estimate medium for comparable class-I works. Lower-class tie-in allowance **very low confidence**, inferred rather than measured. |

## 1. What form is appropriate?

The scope of ČSN 73 6102 is project design of new/reconstructed junctions; its public catalogue preview identifies coordination with ČSN 73 6101 for rural roads and ČSN 73 6110 for local roads. The full current normative decision rules are not freely inspectable here. The material below is a **secondary teaching reproduction** attributed to ČSN 73 6102, not verbatim current norm text:

- [Václav Fanta, ČZU, *Uspořádání křižovatek* (2021 lecture PDF)](https://home.czu.cz/storage/929/158640_04-Fanta-Doprava-2.pdf), slides 33–37: “Průsečné křižovatky bez usměrnění … s nízkou intenzitou”; “Styková křižovatka bez usměrnění … vhodná … s nízkou intenzitou dopravy.” For higher conflict/turning demand, it describes channelization/turning lanes and islands. This supports simple priority T/X as the low-intensity baseline, not a class-specific threshold.
- The same lecture calls roundabouts a way to handle more than four arms, reduce conflict points, and calm traffic. It does not give an I/II/III speed-based permission matrix. The same lecture's “Mimo sídelní útvary … na dálnicích a rychlostních komunikacích I. třídy” is about grade-separated junctions on motorways/high-speed class-I roads; it must not be misread as requiring all conventional class-I roads to be grade-separated.
- [ČSN 73 6102 catalogue preview](http://csnonlinefirmy.agentura-cas.cz/html_nahledy/73/17029/17029_nahled.htm) describes standard scope but not an open table of which forms may connect each road-class pair. The current edition/change status and full numerical provisions require confirmation from ČAS/ČSN text; edition/date details remain **UNVERIFIED here**. The 2007 edition is referenced by the task, but the game must not assume its clauses are unchanged without checking amendments/revisions.
- Act 13/1997 §10(1), already quoted in [08](08-junctions-crossings.md), says roads may be connected by junctions (“Pozemní komunikace lze navzájem připojovat zřizováním křižovatek”). That establishes general legal possibility, not approval of a particular site or geometry. A new road joining class III, local street or service road is not inherently banned at-grade. Local road tie-ins also need the appropriate 73 6110 design treatment where applicable.

**Game choice:** build a priority T by default at an ordinary two-road tie-in; use X only for two genuine through routes. Offer a roundabout where multiple arms, collision record, or demand justify it. Treat class I vs II/III as a design/approval context, not a categorical form toggle. Do not automatically place a roundabout solely because the new road is class I or has design speed 90.

## 2. Approach gradient

No publicly accessible, reliably quotable reproduction was found in this pass for the often-cited clause specifying *podélný sklon vedlejší komunikace v délce … m před křižovatkou max. … %*. **Exact clause/value/length: UNVERIFIED.** This must not be confused with the general maximum grade for a rural road (covered as edition-limited in [12](12-csn-norm-values.md)) or with grades for the local road itself (covered in [20](20-minor-road-gradients.md)).

A public 2010 VL 3 sheet is more helpful but still secondary: its note for junction branches says “Nejvhodnější podélný sklon křižujících se komunikací je do 3 %. Nedoporučuji se sklony nad 6 %” and references ČSN 73 6102 §6.8.2. This is a recommendation in a standard drawing note, not proof of a hard maximum or an approach-length definition. The same [VL 3 (2010)](https://pjpk.rsd.cz/data/USR_001_2_10_VL/VL_3_2010_01.pdf) says roundabout circulating-road grade should not exceed 5% (referencing §6.8.3); that is not the approach-branch limit.

**Game implementation pending primary confirmation:** make automatic design target ≤3% across the junction influence area; if terrain prevents that, allow up to 6% only as a flagged provisional limit and require sight/vehicle control checks. For a simplified approach check, use **≤5% over the last 20 m** as a conservative **PROVISIONAL** rule, with a violation above it. The 20m/5% pair is a game engineering assumption, not a sourced ČSN value, and should be replaced when the exact current 6102 clause is obtained.

## 3. Sight triangles

### Values available in a public reproduction

ESTAV's 2021 engineering explainer explicitly distinguishes local streets/property accesses from at-grade junctions and reports ČSN 73 6102 Table 19 sight-triangle values for **public-purpose road** access (účelová komunikace) connecting to another road. For vehicle group 1 (passenger/light van), the reported XB/XC pairs are:

| Speed on major road (km/h) | XB (m) | XC (m) |
|---:|---:|---:|
| 50 | 70 | 65 |
| 60 | 90 | 80 |
| 70 | 110 | 100 |
| 80 | 135 | 120 |
| 90 | 160 | 145 |

Source: [ESTAV, 12 May 2021](https://www.estav.cz/cz/9663.sjezd-na-pozemek-nelze-udelat-kdekoli-musi-plnit-technicke-parametry-jak-se-pocitaji-rozhledove-trojuhelniky), “Sjezd na účelovou komunikaci …” section, which identifies the source as ČSN 73 6102 Table 19. It gives the triangle vertex at **2.5 m** from the edge of the adjacent lane in the built-up-area case and **3.0 m** in extravilan. This is a public secondary reproduction, not the paid standard. It may be a valid conservative reference for an ordinary minor approach, but the exact application to a public-road junction and exact XB/XC geometry depend on the 6102 arrangement/vehicle-group table.

VL 3 (2010) sheet 500.24 says the triangle at at-grade junctions is per ČSN 73 6102 §5.2.9; its figure distinguishes the “rozhledový bod vozidla” and points to §5.2.9.1.6. It also says obstacle objects are excluded if their height exceeds a line **0.25 m below the applicable sight ray**. Its diagram labels a 2.50m offset for a truck in a different underpass/sight context, not necessarily as the universal minor-road junction eye-point offset. Therefore, for design use exact offset and eye-point position are **UNVERIFIED**; a 2.5m (built-up) / 3.0m (rural) game eye-point offset is reasonable as a secondary-source approximation.

### Avoid wrong table substitution

The same ESTAV article's table for **private individual driveways in built-up areas** is stopping sight distance DZ=35m at 50km/h, 25m at 40, 20m at 30 and 11m at 20; it gives a 2.0m setback and 1.0m passenger-car eye height. Its rural individual-driveway table gives DZ=40,55,75,100,120m for 50–90km/h and a 3.0m point. Those are ČSN 73 6110/6101 access-splay cases, **not** the intersection Xb/Xc requirement. The article gives 1.0m as passenger-car view height and 2.0m for truck for the driveway case, not a confirmed eye/object pair for a 6102 public junction. Do not use driveway DZ=75m at 70km/h as the junction triangle length.

**Game rule:** require both sight-triangle legs clear of opaque obstacles; use XB/XC table above as provisional group-1 minimums and 0.75m above road as a conservative obstacle-height cap (the figure's 0.25m below-ray criterion supports the concept, but not a constant 0.75m numerical cutoff for every point). Use eye height 1.0m for passenger-car inspection only as a game assumption. For trucks, sight and swept-path checks should be separate; a fixed 1.0m object height is **not verified**.

## 4. Turning lanes and roundabout footprint

### T/X turning lanes

ČZU lecture slide 55 states right-turn lanes are provided on other roads with design speed 80km/h also at at-grade junctions; slides 56/58 describe lane length as a combination of *vyřazovací úsek Lv*, *zpomalovací úsek Ld*, and *čekací úsek Lc*. For left turns the queue/storage component is demand-dependent. This is useful structure, but it is a teaching reproduction and does not provide the normative numerical table needed to size 70 vs 90km/h turn lanes. In particular, the often-used simplified formula “Lv + Ld + Lz” should not be assigned numeric length from these slides; the lecture's symbols indicate **Lc**, and VL 3 defines items by reference to 6102 tables/clauses.

**Exact lengths for 70/90 km/h and major-road widening: UNVERIFIED.** The full table 7 / applicable deceleration and waiting-length calculations in ČSN 73 6102 were not publicly inspectable. Game footprint should be traffic-dependent: no auxiliary lane for a quiet minor T if its low-volume/safety assessment supports it; otherwise reserve approach taper + lane-change/removal + speed-change + queue storage, then widen the major road accordingly. Do not create a fixed all-class lane length from speed alone.

### Roundabout

VL 3 2010 reproduces TP 135 roundabout guidance: “23 m < D < 50 m … 30 km/h” and “D > 50 m … 50 km/h” for entry/exit design speed, and refers to TP 135 p.13. The notation in the scanned/extracted sheet is imperfect; the distinction is **not** a simple recommended diameter range by road class. It only supports a relationship between outer diameter and design speed. [TP 135 page on PJPK](https://pjpk.rsd.cz/viewFile.asp?file=35654) identifies that large roundabouts are only for especially justified cases and refers back to ČSN 73 6102; the exact 2017 table text is not reliably extractable from the web visitor in this research pass.

Use a single-lane compact rural roundabout envelope **30–50m outer diameter as PROVISIONAL only**, with geometry checked against heavy vehicle swept path and visibility. Do not label it an official recommendation for class I/II/III. A 50m+ scheme is a large footprint/capacity case, not a routine tie-in. No class-specific rural diameter recommendations were verified from TP 135 in this pass.

## 5. Spacing

[12](12-csn-norm-values.md) already adopts **1.5km** minimum for ordinary at-grade class-I junctions based on 2018 ČSN 73 6101 secondary sources, and explains not to apply motorway interchange spacing.

The opened [VL 3 (2010) PDF](https://pjpk.rsd.cz/data/USR_001_2_10_VL/VL_3_2010_01.pdf) says its “Nejmenší dovolené vzájemné vzdálenosti křižovatek” rows follow ČSN 73 6101 Table 21; it is explicitly an older reference and excludes certain field/forest-road connections and treats urban streets separately. Public search extracts indicate rows for classes II/III, but I could not inspect a sufficiently clear complete table row with the relevant conditions (junction/connection type, terrain and access class) to transcribe safely. Older ČSN 73 6101 table-21 figures are **not current-2018 values** by default. Therefore:

- Class II / III current minimum: **UNVERIFIED** in this research pass. Do not invent values or apply the 1.5km class-I rule to them.
- VL 3 2010 / older ČSN 73 6101 Table 21: retain as a research lead only; edition and row applicability must be stated before implementation.
- Spacing still must accommodate turning-lane transitions/storage, visibility and network operation even where there is no simple class-specific number.

## 6. Price evidence and class effect

### Direct lower-class evidence found

| Project | Reported price | What it covers / quality |
|---|---:|---|
| “Silnice III. třídy – okružní křižovatka”, Tachov district, 2021 | **5.322m CZK estimated** (not award) | The opened [Poptávej listing](https://www.poptavej.cz/verejna-zakazka/VZ146281/silnice-iii-tridy-okruzni-krizovatka) describes a three-arm roundabout at class-III + municipal-road junction, plus a nearby offset class-III junction. Scope also includes drainage, sidewalks, access adjustments, signs, lighting, STL gas relocation, fencing and earthworks. It reports 5.322m CZK estimated value; not a winning bid, and likely an unusually limited/low estimate vs current class-I packages. **Low confidence price anchor; useful evidence that lower-class integrated schemes can be budgeted materially below major I-road junctions, not a universal price.** |
| II/191 Janovice–Nýrsko, 2021 | **62.974m CZK contract** | Opened [Plzeňský kraj E-ZAK record](https://ezak.cnpk.cz/vz00008127): whole reconstruction of II/191 between Janovice and Nýrsko, including conversion of class-II / class-II junction to roundabout, a left-turn lane, two bridge-deck reconstructions and culverts. This is emphatically **not** an isolated junction price; use only as a high-scope counterexample, not a unit rate. |
| II/211 Rybitví junction, 2026 procurement | **636,000 CZK estimated for design services** | Opened [SÚS Pardubického kraje E-ZAK](https://ezak.suspk.cz/contract_display_1520.html). This is a complex design commission (offset intersection, two turning lanes, links, bus stops, cycle/pedestrian path, drainage, lighting, utilities, etc.), **not construction price**, excluded from cost calibration. |

### Comparison / recommendation

[08](08-junctions-crossings.md) and [13](13-crossing-items-tenders.md) already record class-I roundabout awards around 19.76–37.5m CZK and retain 32m as a medium-confidence game anchor; T/X 25m is low-confidence because no isolated tender was found. The new class-III listing's 5.322m **estimate** has much lighter-scale evidence and mixed small-town components, but supports a lower-cost class-III case being plausible. It does not establish a clean like-for-like discount. No isolated awarded new T-junction or roundabout construction contract for class II/III with a separable construction price was verified here. Thus “lower-class tie-in is much cheaper” is a plausible modeling distinction but **not proven by comparable awards**.

**Provisional game pricing:** keep existing class-I-inclusive defaults from [08]. For a simple T joining a new road to class III/local/service road without added turn lanes, major utility relocation, lighting, sidewalks or extensive reconstruction, model **5–10m CZK** (midpoint 7m) as **PROVISIONAL / very low confidence**; scale up to 15–35m where the scheme widens/reconstructs an important class-I/II corridor or includes turning lanes. Keep small roundabout distinctly priced and footprint-dependent rather than applying 32m to every rural case. Costs exclude land acquisition and unmodeled scope.

## Sources opened in this pass

- [Václav Fanta, ČZU, *Uspořádání křižovatek* (2021 PDF)](https://home.czu.cz/storage/929/158640_04-Fanta-Doprava-2.pdf) — secondary lecture, slide references to ČSN 73 6102; form selection, lane components, sight concepts.
- [VL 3 Křižovatky (2010 PDF, PJPK)](https://pjpk.rsd.cz/data/USR_001_2_10_VL/VL_3_2010_01.pdf) — official exemplar drawings; older edition, cross-branch grade note, roundabout size/speed note, sight-triangle schemas, table-21 pointer.
- [ESTAV, *Sjezd na pozemek…* (12 May 2021)](https://www.estav.cz/cz/9663.sjezd-na-pozemek-nelze-udelat-kdekoli-musi-plnit-technicke-parametry-jak-se-pocitaji-rozhledove-trojuhelniky) — secondary public reproduction of 6102 Table 19 group-1 values, plus clear warning that private driveway DZ rules differ.
- [ČSN 73 6102 catalogue preview](http://csnonlinefirmy.agentura-cas.cz/html_nahledy/73/17029/17029_nahled.htm) — scope/edition metadata only; not normative tables.
- [TP 135 document on PJPK](https://pjpk.rsd.cz/viewFile.asp?file=35654) — opened; visitor extraction offered limited text. TP 135:2017 PDF requested at `https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_135_2017.pdf`; numerical class-based table not recovered.
- [Poptávej, class-III roundabout tender listing](https://www.poptavej.cz/verejna-zakazka/VZ146281/silnice-iii-tridy-okruzni-krizovatka) — opened; 2021 estimated contract value and scope, not actual award.
- [Plzeňský kraj E-ZAK, II/191 Janovice–Nýrsko](https://ezak.cnpk.cz/vz00008127) — opened; 2021 whole-road contract and scope.
- [SÚS Pardubického kraje E-ZAK, II/211 Rybitví, PD](https://ezak.suspk.cz/contract_display_1520.html) — opened; 2026 design-only procurement, not construction.

## Short adopted-values recap

1. Priority T is the automatic baseline; X only for real four-arm topology (**medium**, qualitative secondary evidence).
2. Roundabout is an alternative for arms/capacity/safety/speed management, not mandated by class-I status alone (**medium-low**).
3. At-grade tie-in to class III/local is generally legally possible subject to approval and design; exact class-pair norm matrix **UNVERIFIED** (**medium-high general rule**).
4. Grade target ≤3% near junction; >6% discouraged by 2010 VL 3 note (**medium**, secondary/older).
5. Last 20m approach cap 5% is a **PROVISIONAL** game rule; exact ČSN length/value not found (**low**).
6. Group-1 XB/XC from secondary 6102 Table 19 reproduction: 70/65m at 50, 90/80 at 60, 110/100 at 70 (**medium**).
7. At 80/90km/h: 135/120m and 160/145m respectively (**medium**).
8. Eye-point setback 2.5m built-up / 3.0m rural is a secondary reproduction, not confirmed universal intersection clause (**low-medium**).
9. Use passenger eye height 1.0m as provisional; object/constant obstacle height 1.0m is **not verified** (**low**).
10. T/X lane lengths for 70/90 and widening: **UNVERIFIED**; size by traffic and separate Lv/Ld/storage components.
11. Rural roundabout 30–50m as a game envelope only; not verified class-specific guidance (**low**).
12. Class-I spacing remains 1.5km per [12]; current II/III minimum **UNVERIFIED** (do not borrow old VL 3 table blindly).
13. Retain class-I T/X 25m (15–35m, low) and roundabout 32m (20–40m, medium) from [08]/[13].
14. Simple class-III/local T tie-in 5–10m (midpoint 7m) is **PROVISIONAL, very low confidence**.
15. Class-III 2021 roundabout listing estimated 5.322m; scope is mixed and no award price confirmed—evidence of possible low-cost cases, not a unit rate.

## Addendum (2026-11-21): the sight triangle's geometry, a roundabout's widths, the ground model's accuracy

- **Sight triangle points** (ČSN 73 6102 as reproduced by *Dopravní inženýrství*, "Nová verze software Rozhled a norma ČSN
  73 6102", opened): "Rozhledový bod vozidla na vedlejší komunikaci … v ose vozidla ve vzdálenosti 2,0 m od přídě vozidla
  vždy ve výšce 1,0 m nad vozovkou (pro vozidla skupiny 1) … Rozhledový bod vozidla na hlavní komunikaci je bod uprostřed
  přídě vozidla ve výšce 1,0 m nad vozovkou. … třetím bodem je průsečík os jízdních pruhů, ve kterých jedou posuzovaná
  vozidla (na hlavní komunikaci … jízdní pruh daného směru nejbližší vedlejší komunikaci)"; the waiting car's front
  n ≥ 1.0 m from the through lane's edge (so the eye 3.0 m from it). [Article](https://www.dopravniinzenyrstvi.cz/clanky/nova-verze-software-rozhled-a-norma-csn-73-6102/)
  (medium: a secondary reproduction of the norm by its software's authors). Confirms the game's 1.0 m / 1.0 m heights (§3
  item 9 now medium); the seen car is in its lane, the game keeps it on the road's line (a lane's offset, PROVISIONAL).
- **What the game does with it** (cost model 65, `core/tie-in.ts sightField`): every sight line from the eye to the joined
  road between the junction and the seen car (the whole triangle, on a 1 m grid), not only the far one. VL 3's obstacle rule
  (objects reaching above 0.25 m under the sight line) applies to the ground beside the road; designers keep the sight
  field clear, so such ground is dug down to it (PROVISIONAL game rule: up to 1 m; excavation hauled to a tip and its land,
  billed with the junction); deeper ground and houses stay problems. The joined road's own surface is read along its line
  (its centreline height on the ground model, not the verge the 5 m grid blends into its edge) and hides the car only where
  it rises over the sight line itself by more than the ground model's stated accuracy.
- **Ground model accuracy**: DMR 5G 0.18 m in open ground, 0.30 m under forest (ČÚZK's stated accuracy, research/00).
- **Roundabout widths** (TP 135 (2017) tab. 2, "Doporučené šířkové uspořádání JOK v extravilánu", read from
  [the PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_135_2017.pdf) p. 23): D 40 m: ring 5.10 m, apron (prstenec) 1.20 m,
  unpaved island 27.4 m (D 30: 6.00 / 1.80 / 14.4; D 50: 4.70 / 1.00 / 38.6). The game draws its 40 m ring so (high).
