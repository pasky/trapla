# Endpoint junctions: roundabout arm and merge

2026-11-15, stream S. Used by `ENDPOINT_JUNCTIONS` (src/core/data/urban.ts) for scenario-declared
connections of a mission end to a retained road. Research-mode pass, reviewed by the S agent.

## Roundabout arm — sourced

TP 135 *Projektování okružních křižovatek na silnicích a místních komunikacích* (April 2017),
§1.7.1 p. 5 ([PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_135_2017.pdf)):
“Dělicí ostrůvek se umísťuje mezi protisměrnými jízdními pruhy/pásy v délce 5–25 m a tvoří zpomalovací
prvek před vjezdem do křižovatky.” (A splitter island 5–25 m long separates the opposing lanes of an arm
and slows traffic before the entry.) §3.2.2 p. 23 recommends a 5–15° deflection of entry/exit lanes;
§§3.2.3.1–2 refer corner radii to ČSN 73 6102 without a universal length.

**Adopted:** the last 25 m of our route (upper bound of the splitter-island range) belong to the
roundabout's arm design. Entry/exit radii and a fixed arm length were **not** verified as numbers.

## Merge onto a retained carriageway — PROVISIONAL

ČSN 73 6102 tab. 35 gives merge-lane lengths (Lpp = Lod + Lm + Lz); below 80 km/h each part is sized
separately, above it a uniform length applies (ČZU lecture citing §§5.2.3.9.5–6,
[slides](https://home.czu.cz/storage/929/158640_04-Fanta-Doprava-2.pdf), slide 61; ŘSD VL 3/2010 cites
tab. 35, [PDF](https://pjpk.rsd.cz/data/USR_001_2_10_VL/VL_3_2010_01.pdf)). The table rows for 80/90 km/h
were **not** obtained. A Ministry of Transport technical report gives a compliant 130 km/h connector
“délka připojovacího pruhu je 295 m (Lod=30 m, Lm=175 m, Lz=90 m)”
([PDF](https://uredni-deska.md.gov.cz/media/InlineContent//priloha_md_14962_2026_940_8_TZ.pdf)).

**Adopted, PROVISIONAL:** 90 m merge zone (the end taper Lz of that 130 km/h example, an upper bound
for a slower road). Replace with the tab. 35 row when it is available.

## Price — PROVISIONAL reuse

No sourced item exists for adding an arm to an existing roundabout or for a merge. Both reuse the
all-in through-road junction allowance `JUNCTION` = 25 M CZK (research/08, low confidence; roundabout
awards 19.8–37.5 M are an upper-side comparator). It is booked once per declared end as a lump in the
road-crossings part, exempt from the other-objects surcharge, whether or not our earthworks touch the
joined road.

## Rule

Inside the zone, our earthworks over the **declared** joined ways are the junction's own works (shown
as one “junction” item with the length of joined road rebuilt), not violations. Bridge supports on the
joined road, any other road, building, stream or railway in the zone, and the joined road outside the
zone are handled exactly as before. `scripts/scenarios/check.ts` fails if a declared joined way does not
come within the zone of its end. D11 declares no junctions, so its bills are bit-identical and no
`COST_MODEL_VERSION` bump is needed: no existing scenario's result changes.
