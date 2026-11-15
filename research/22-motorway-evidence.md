# Motorway D 27.5: cross-section, geometry and SPK scope evidence

Research note, checked 2026-11-15. This records public source evidence and gaps; it is not a reproduction of ČSN 73 6101 and does not propose implementation values. The relevant project context is [research/21](21-network-scenarios-modes.md), [docs/multi-road-plan.md](../docs/multi-road-plan.md) §5, and the prior norm/cost notes [04](04-design-norms.md), [12](12-csn-norm-values.md), [05](05-costs.md). **Confidence** is confidence in what the accessible source states, not engineering certification.

## 1. D 27.5 cross-section

### Direct public drawing

The Czech Ministry of Transport's *Vzorové listy – VL 1 Vozovky a krajnice*, sheet **11-02, “Kategorijní typ D 27,5,” dated 01/2022**, provides a dimensioned model cross-section. Visited PDF: [VL 1 2022 (public copy)](https://upload.wikimedia.org/wikipedia/commons/5/59/VL_1_2022_Vozovky_a_krajnice.pdf), printed sheet 11-02 (PDF page approximately 12; the source's own sheet number is the precise locator). This is an official Ministry technical model sheet, but it is not the paid ČSN itself.

The sheet labels the category width as 27.50 m, split symmetrically into two 12.50 m sides and a 3.50 m central median. Per side, outside-to-inside, its basic dimensions are:

| Part | Width | Sheet label / meaning |
|---|---:|---|
| Unpaved outer shoulder included in category width | 0.50 m | `NK`, `e` |
| Paved outer shoulder | 3.50 m | `ZK1`, `c1` |
| Outer lane | 3.75 m | `JP1`, `a1` |
| Inner lane | 3.75 m | `JP2`, `a2` |
| Paved inner shoulder | 0.50 m | `ZK2`, `c2` |
| Median (SDP) | 3.50 m | `d` |

Thus the dimensioned sum is `2 × (0.50 + 3.50 + 3.75 + 3.75 + 0.50) + 3.50 = 27.50 m`. Four lanes total, each 3.75 m. Per direction the carriageway-side envelope including its half of the median is 12.50 m; the lane pair alone is 7.50 m. **Do not treat 27.5 as two independent 13.75 m cross-sections.**

The VL 1 legend explicitly calls `ZK1/ZK2` the *paved part of shoulder* and `NK` the *unpaved part of shoulder counted in category width or motorway clear width*. In this drawing the broad outer hard shoulder is 3.50 m and the paved inner shoulder is 0.50 m; these are distinct from the two traffic lanes. The figure separately shows an additional 0.25 m of unpaved shoulder outside category width where delineator posts are installed, or 1.00 m for guardrail installation. These are conditional additions, not part of the 27.50 m sum. The cross-section also shows the outer shoulder and lanes at 2.5% crossfall; this does not establish a universal crossfall rule in all situations.

A related public teaching handout, *Šířkové uspořádání koruny silnice nebo dálnice* ([PDF](https://www.stavarna.com/download2/1238_1724_cs_koruna.pdf), unpaginated), defines `a` as lane width, `b` category width, `c` paved shoulder, `e` unpaved shoulder and `v/v1/v2` guide strips. It says that for divided roads the cross-section includes two one-way carriageways, guide strips, median and shoulders; guide strips are functionally treated as part of the permanently non-trafficked area adjacent to them. It reports median 3.50 m for R/D 33.5 and D/R 27.5; paved-shoulder widths for R+D in the 2.25–3.50 m range; and unpaved-shoulder widths specified in category tables (0.5 m in its summary). This is useful terminology, but its page does not state an edition; VL 1 2022 is stronger for the specific D27.5 dimensions.

**Confidence:** High for the stated 2022 example dimensions and labels (direct, dimensioned Ministry sheet). The `3.75 m` lane width, `3.50 m` outer paved shoulder, `0.50 m` inner paved shoulder, `3.50 m` median, and included `0.50 m` unpaved shoulder are directly legible on that sheet. Medium-high for treating this as the ordinary/reference D27.5 arrangement: VL1 directs median widening to ČSN 73 6101, so site-specific widening and departures exist. No conclusion here about barriers, drainage, clear zones beyond the illustrated additions, or every permitted variant.

## 2. Longitudinal grade and vertical curves: evidence limits

The directly inspected public revision presentation is Michal Radimský, *Revize ČSN 73 6101 Projektování silnic a dálnic*, dated 28 May 2019, [PDF](https://konference-projektovani.cz/wp-content/uploads/2022/03/9.pdf). It states the revised ČSN took effect in October 2018 (slide 2). Slide 4 lists D27.5 design speed as 130 km/h and says the design speed may, in justified cases, be reduced by 10 or 20 km/h. Slide 12 says the revised limit is for **resultant slope**: at least 1% (0.5% in justified cases), at most 13% (14% in justified cases; 10% in frequent icing areas). This is a combined longitudinal/transverse slope criterion, **not** a 13% longitudinal-grade allowance; slide 13 further discusses checking compatibility of longitudinal and crossfall.

The requested current *longitudinal maximum grade* and minimum crest/sag vertical-curve radii at motorway design speeds were **not published in the inspected presentation**. The presentation has slides on “Lomy podélného sklonu” (10) and revised sight-distance method (9), but no numerical vertical-radius table for 130/120/110. Its slide 4 category list gives 130 for D27.5, while slide 12 is not a substitute for a longitudinal-grade limit. The current accessible evidence therefore does not establish these values:

| Design speed | Current maximum longitudinal grade | Current minimum crest radius | Current minimum sag radius |
|---:|---|---|---|
| 130 km/h | Not verified from accessible 2018-revision material | Not verified | Not verified |
| 120 km/h | Not verified | Not verified | Not verified |
| 110 km/h | Not verified | Not verified | Not verified |

**Historical comparator only (not current):** the public VUT FAST teaching text *Aplikace ČSN 73 6101* ([PDF](https://www.fce.vutbr.cz/pko/sad/pdf/aplikace.pdf)) reproduces a pre-2018 table. At printed p. 10, its D26.5/D27.5 maximum longitudinal gradients are 3% flat, 4% hilly and 4.5% mountainous (the table’s speed row is 120/100/80 km/h by terrain). Printed p. 11 has minimum *permitted-for-stopping* crest radii 11,000 m at 120 and 6,000 m at 100; its sag radii are 5,000 m at 120 and 3,400 m at 100. It has no 130 or 110 column. These figures are tied to the older edition/category framework and cannot safely fill any of the current table above. The same historical source's values therefore do not verify current 120 either.

Radimský 2019 is credible secondary evidence (revision presentation by a VUT academic involved in road design/revision) for the 2018 changes, but it is not the full standard. The full ČSN 73 6101 text is paid; the public catalogue record linked in [research/04 §1](04-design-norms.md) does not expose the numeric clauses. **Confidence:** high that the 2019 deck does not give the requested values and distinguishes resultant from longitudinal slope; no defensible confidence/value assigned for current max grade or vertical radii. Further access to the applicable current ČSN or an authoritative public reproduction is required; no interpolation, extrapolation or inference from project-specific profiles is made here.

## 3. SPK CN D27.5 price and what it covers

### Rate identification / price basis

SFDI's official [SPK CN page](https://sfdi.gov.cz/cenove-databaze/spk-cn/) identifies the database as *Cenové normativy staveb pozemních komunikací ve stupni studie* (study-stage cost norms), and links the current **SPK CN April 2026** approved by the Central Commission of the Ministry of Transport on 24 April 2026. Downloaded and inspected within a 40 MB cap: [2026 archive](https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip), notably *Příloha č. 1 – SPK CN 2026 – průvodní zpráva* and *Příloha č. 3 – ocenění*.

The 2026 assessment workbook / existing project extraction records D27.5 as:

| Code | Description | Unit | Defined standard (CZK, excl. VAT) |
|---|---|---:|---:|
| A.1.D.27,5.NER | motorway D27.5, extravilan, new build, flat and hilly terrain | km | 187,632,000 |
| A.1.D.27,5.NEH | motorway D27.5, extravilan, new build, mountainous terrain | km | 214,512,000 |

The archive's scope report §§II, III A.1 clarifies that this is an **aggregated study-stage standard/base construction cost**, not a tender price or turnkey total. The base price is subsequently subject to expert adjustment, costs for other (B-type) objects, and separately defined markups. Its quoted unit is kilometre of communication **excluding bridge and tunnel lengths**; those use their own A.2/A.3 standards. The standard describes construction of the road category as a whole, not one carriageway: specifically, for constructing *half of a future divided road*, it prescribes **60% of the applicable category norm**, not 50% (report p. 7). Do not multiply the full D27.5 norm independently by two carriageways.

### Included / excluded scope relevant to a corridor

The 2026 scope report's A.1 “Komunikace” section (pp. 7–8) says the motorway-road standard includes, among other items:

- standard-level site preparation and setting out;
- topsoil stripping, storage/handling and reuse;
- earthworks under a “standard” vertical alignment (not deepened alignment), with 15% unsuitable material hauled to landfill within 10 km including disposal fee and equal suitable replacement material brought from a borrow source within 10 km;
- for divided roads from S20.75 upward, 70,000 m³ cut/km and fill assumed at 85% of cut; 75/20/5% excavability classes I/II/III;
- topsoil spreading, active zone, pavement, drainage, ditches, culverts, safety/guide equipment and fixed signs;
- retaining/cutoff walls up to 100 m per route-km and no more than 2 m high;
- earth-built branches of grade-separated junctions (not bridge ramps), assuming 1 MÚK/7 km for divided roads from S20.75 upward. It expressly says bridge objects and crossing roads are priced under their respective standards;
- noise barriers in the extent defined by B.5.

The same section excludes unbalanced earthwork balance, ground improvement, soil treatment, special slope stabilisation, utility ducts, service areas and other items covered by B1–B8. It says these are to be handled separately/expertly as applicable. Consequently the D27.5/km line is not simply “pavement plus earthwork” and not a complete itemized contract sum: it has a substantial normal-road work allowance, but also clear scope boundaries.

### Bridges and paired decks

The A.2 “Mosty” section states that bridge cross-section width corresponds to the relevant road category; a divided-road bridge includes two maintenance walkways, each 0.75 m clear width. The unit is bridge length in km, measured along the bridge axis between wingwall ends. For four-lane roads, **bridge length is the average of the left and right bridges**. The standard lists foundations, substructure, superstructure, waterproofing/pavement, barriers, drainage, utility cable ducts and transition zones among included elements, with several special cases excluded (e.g. height above 8 m, special construction methods, bridge noise barriers, some unstable-ground and utility/under-bridge works).

This supports the existence of a separate D27.5 bridge-category norm, not charging a motorway-grade bridge merely at the flat-road D27.5/km price. It also shows how the SPK convention handles two parallel bridge lines (average their lengths). **It does not explicitly describe a single broad “twin-deck” structure carrying both directions on separate superstructure decks, nor establish that a single-deck bridge and a split twin-deck bridge have equal costs.** The published measure and category width are a study-level norm; project-specific arrangement remains an expert adjustment. The road-rate text excludes bridge lengths, so bridge cost should not be presumed included in the ordinary D27.5/km rate.

### Tunnels / two tubes

A.3 “Tunely” is separately priced. The 2026 report describes standard tunnel categories by two-/three-lane tunnel class (clear width between kerbs), bored/NRTM versus cut-and-cover (the latter assumes up to 5 m overburden), short ≤500 m versus >500 m, and rural versus urban; tunnel length is measured between portal faces. The stated standard includes lining, portals, tunnel pavement, signs, drainage, lighting, tunnel technology and potentially cross-passages; excludes e.g. investigation galleries, traffic-control buildings, geotechnical monitoring, major portal works and deeper-than-5 m cut-and-cover work. It assumes TT4 for bored construction and 20% technology in the study unit costs.

The separate tunnel rate row in the project’s 2026 source extraction is explicitly a **two-lane tube** (e.g. rural bored, >500 m, code A.3.R.2.NE.D). Therefore that row is per two-lane tube, not a complete bidirectional motorway tunnel pair. D27.5's ordinary road norm does not subsume tunnel length; paired two-tube construction must be represented using two tube quantities if both tubes are built. The source does not say that the pair shares all approach, portal, safety or cross-passage costs proportionally; those details and any shared-cost treatment remain uncertain from the public aggregate norm.

## 4. Sources visited and source quality

1. **Ministry of Transport, VL 1 (2022), sheet 11-02:** [PDF](https://upload.wikimedia.org/wikipedia/commons/5/59/VL_1_2022_Vozovky_a_krajnice.pdf). Direct dimensioned model drawing. High confidence on shown D27.5 dimensions; departures require project/norm context.
2. **Radimský, 28 May 2019, revision of ČSN 73 6101:** [PDF](https://konference-projektovani.cz/wp-content/uploads/2022/03/9.pdf), slides 2–16. Public secondary source tied to 2018 revision. Strong for design speed/revision/resultant slope distinction, silent on requested vertical table/longitudinal maxima.
3. **VUT FAST, *Aplikace ČSN 73 6101*:** [PDF](https://www.fce.vutbr.cz/pko/sad/pdf/aplikace.pdf), printed pp. 10–11. Public teaching reproduction of older-edition values; historical comparator only.
4. **SFDI, SPK CN:** [official database page](https://sfdi.gov.cz/cenove-databaze/spk-cn/), [2026 archive](https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip). Primary public source for 2026 cost-norm methodology, structure and schedules. Archive report provides the scope statements quoted/paraphrased above; workbook provides code/amount. Current page says approved 24 Apr 2026.
5. **Teaching handout, *Šířkové uspořádání koruny silnice nebo dálnice*:** [PDF](https://www.stavarna.com/download2/1238_1724_cs_koruna.pdf). Supporting vocabulary / broad width ranges; undated in PDF, secondary and lower confidence than VL1.

Raw downloads and extracted text were kept in `/tmp`; no raw data was added to the repository. No implementation changes or normative inferences are made in this note.
