# Czech road-noise calculation (cost model 7)

Research and implementation: 2026-11-14. Replaces research/09 §2's **guessed 100 m contour**.
This is a compact planning calculation, **not an acoustic study or a compliance certificate**.
The source and flat-ground equations are published Czech equations; terrain reduction, traffic composition,
barriers and acquisitions still contain explicit scenario assumptions. No empirical route-cost tuning.

## 1. Sources and applicable limits

Primary documents downloaded and inspected (PDF page numbers below are the printed numbers):

1. Liberko/Ládyš, [Výpočet hluku z automobilové dopravy — Manuál 2011](https://www.hlukplus.cz/manual/Metodika2011.pdf),
   ŘSD purpose publication, November 2011: pp.40–44 source equations and reference emissions, pp.45–46
   propagation definitions, pp.61–62 numerical ground formulas.
2. EKOLA, [Manuál 2018, verze 2020](https://md.gov.cz/getattachment/Dokumenty/Strategie/Hluk/Manual-2018/Zmeny-v-Manualu-2018/Manual_2018_aktual_2020.pdf.aspx),
   November 2020, 95-page PDF. Title page records MD approval 5 February 2019 and MZ acceptance of the
   2020 changes on 30 November 2020. §1.9.1 pp.45–46, equations 35–39 and table 21; §1.9.2 p.47;
   table 23 p.49; §1.9.4 p.50; §2 pp.63–64. The 2018 update retains the category speed functions and
   ground equations but revises fleet emissions and pavement factors. This is the implemented edition,
   not RLS-90 or CNOSSOS with a Czech label. [HLUK+](https://www.hlukplus.cz/) confirms these edition
   changes, and now advertises a newer 2025 manual approved in 2026; that newer edition is **not implemented**.
3. [TP 219, February 2019](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_219_2019.pdf), pp.18–22:
   vehicle-category conversion and time distribution; table 3-2 gives class-specific nighttime fractions.
4. [TP 189, September 2018](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_189_2018_final.pdf):
   counts and hourly profiles. [TP 225, 2018](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_225_2018__2_.pdf)
   concerns traffic **forecasting**, not the appropriate source of the acoustic day/night split.
5. [NV 272/2011 consolidated](https://www.zakonyprolidi.cz/cs/2011-272), §12 and annex 3 A;
   [NV 433/2022](https://www.zakonyprolidi.cz/cs/2022-433), effective 1 July 2023;
   [MZ explanation](https://mzd.gov.cz/novela-narizeni-vlady-o-ochrane-zdravi-pred-nepriznivymi-ucinky-hluku-a-vibraci/),
   [ČKAIT before/after table](https://zpravy.ckait.cz/vydani/2023-03/zmirneni-hygienickych-limitu-hluku-od-1-cervence-2023/).

**For this NEW road and ordinary residential protected outdoor receivers: 60 dB day / 50 dB night.**
§12(3) starts with “základní hladiny akustického tlaku A LAeq,T 50 dB”. Annex 3 A's ordinary-space row
(“Chráněný venkovní prostor ostatních staveb a chráněný ostatní venkovní prostor”) has **+10 dB in column 2**.
Its rule 2 says: “Použije se pro hluk z dopravy na pozemních komunikacích a dráhách, které byly umístěny
a povoleny rozhodnutím nebo opatřením podle jiného právního předpisu po 31. prosinci 2000.”
“For nighttime” is not implicit: the annex expressly adds “Pro noční dobu se pro chráněný venkovní
prostor staveb přičítá další korekce -10 dB”. Thus 50+10=60, 50+10−10=50. Corrections in the table
are alternatives, not cumulative allowances. §12(1) assesses the **whole 16-hour day and 8-hour night**.
No 68/58 old-road correction applies. Hospitals/spas have different rows and are not classified by the game.

The former rule also gave class I/II roads 60/50 where their noise predominated; **55/45 applied to
class III/certain local roads**, not universally to every new road. NV 433/2022 article II preserves
old treatment for specified pre-July-2023 noise-protection proceedings/measures. It does not make this
new class I road a 55/45 case. These limits concern incident sound at the protected receiver, not an
extra +3 dB self-façade reflection.

## 2. Vehicle source and traffic

For each category's hourly count n, compute its energy contribution to F1:

```
fOA(v) = 3.59e−5 · v^0.8    v ≤ 60 km/h
       = 2.70e−7 · v²       v > 60
fNA(v) = 1.50e−2 · v^−0.5   v ≤ 60
       = 2.45e−4 · v^0.5    v > 60
F1 = nOA · fOA(vOA) · 10^(LOA/10) + nNA · fNA(vNA) · 10^(LNA/10)
Y = 10·log10(F1 · F2 · F3) − 10.1 dB
```

Manual table 21, **class I / 2020: LOA=74.1, LNA=81.1 dB**. It explicitly prescribes the 2020 values
for subsequent forecast years. These are empirical source constants, **not individual vehicle sound
powers or Lmax**. Y is the reference traffic LAeq (manual: 7.5 m from the nearest lane axis).
NA combines trucks, buses and truck combinations because their source function is the same. In the
2011 edition the comparable future-year heavy constant was 80.2 dB: do not silently use that old value.
F2=1 is prescribed for modern class I roads up to 6% gradient (§1.9.2); invalid steeper routes are not
covered by this implementation. F3=1 assumes **ACO11/SMA11**, not a low-noise surface. Steady flow;
no junction acceleration correction. Light vehicles use design speed as an **operating-speed proxy**;
heavy vehicles use min(design speed, 80 km/h).

Default acoustic heavy share p=0.15 remains a **scenario prior**, not a verified Trutnov count.
Acoustic NA is not the same thing as the TNA-only column in a traffic study: the 2018 manual allocates
35% of N1 light goods to NA on class I roads (table 20). Examples show why a universal precise share
would be false: Sezemice's 2022 main bypass link has 750 TNA / 13,560 total = 5.53%, but OS+LNA is grouped;
Třebíč K1-B has (NA+TN)/all = 541/4,688 = 11.54%; TP189's I/43 Lažany worked example has 23.7%
trucks+buses+combinations before acoustic light-goods allocation. ŘSD's [CSD2020 summary](https://www.rsd.cz/silnice-a-dalnice/scitani-dopravy)
puts mean class-I traffic at 9,100/day, close to the scenario's 9,000, not evidence for a specific heavy share.

Use **TP219 table 3-2, non-E class I** (the fictional new road has no E-route designation). For each
category, the formula is Pnight = Nz + NQ + kPNA · PNA, with PNA in **percent**:

| category | Nz | NQ | kPNA | night fraction at p=15% |
|---|---:|---:|---:|---:|
| OA | 8.1 | −0.4 | 0.1 | 9.2% |
| NA+NS combined | 11.9 | −5.5 | 0.6 | 15.4% |

For each category separately, night count = AADTcategory × night fraction, day count = remainder;
divide by **8 and 16 hours**, respectively. At Q=9,000 this gives day OA/NA **434.1375/71.38125 veh/h**,
night **87.975/25.9875 veh/h**. Night share of all vehicles is 10.13%; heavy share of the night flow is
22.80%. This preserves daily energy/counts. Measured category-specific fractions and heavy speed can be
supplied to the calculator. E-road factors differ (table 3-2); TP189's workday profiles (~9% all-traffic
night share) are a sanity check, not interchangeable with this annual/category allocation.

| speed light / heavy | Yday | Ynight | controlling reference excess |
|---|---:|---:|---:|
| 80 / 80 | 65.859 | 60.409 | night, 10.409 dB |
| 90 / 80 | 66.389 | 60.793 | night, 10.793 dB |

## 3. Propagation, geometry and mitigation

Manual §2 pp.63–64 gives the empirical **line-source** losses below, not point-source 20 log r:

```
Uo(d) = 50.2 − sqrt(3357.23 − 911.8·log10(d))                  8…1000 m
Up(d,h) = 8.78·log10((d² + h² + 6h + 9)/(17h + 51))          8…1000 m, h=1.5…<10 m
```

For **mixed ground (40–60% porous)**, U=Up below 5 m; between 5 and 10 m blend
`U=Up·(10−h)/5 + Uo·(h−5)/5`; above 10 m use Uo. Pure porous ground uses a different height transition
(10–20 m); we deliberately do not label our mixed choice “all soft”. At 100 m, Uo=11.0384 dB and
Up(h=1.5)=18.5892 dB. Consequently **there is no single contour for all floors**.
The manual's 3.75…8 m near-distance branch continues with 10 log(d/8), using Up(8,h) for its soft term.
Below 3.75 m clamp rather than extrapolate the empirical fit; beyond 1 km continue at 10 log(r/1000).
The small mismatch of the empirical near-distance fits is retained; exact evaluation below 8.5 m avoids
interpolating across it. Cap soft-ground credit at zero (U≥Uo), so a fit mismatch cannot amplify sound.

**Explicit uneven-terrain approximation:** the live game has a local 2D section, not a full terrain
propagation mesh. Use `r=hypot(axisDistance−1.75, receiverElevation−roadGrade−0.5)` as d in these
loss equations, and effective height `max(1.5, abs(receiverElevation−roadGrade−0.5)+0.5)` as h.
This is a slant-range/elevated-ray extension, **not a clause in the Czech manual**. It removes most/all
soft-ground credit for high paths and makes a tall viaduct decay with real separation instead of
forcing a horizontal buyout radius. On level ground it differs slightly from the literal horizontal-d
manual formula (at the EIA comparison points <0.03 dB). On complex terrain no accuracy bound is claimed.

Compute **both** incident levels `Lday=Yday−U`, `Lnight=Ynight−U`; required attenuation is
`E=max(Lday−60, Lnight−50)`. Negative E needs no mitigation. All source terms are precomputed once per
design. A 0.5 m distance × 0.5 m height table supplies bilinear loss lookup (tested error <0.035 dB at
representative transition/interior points); out-of-table calls use the exact expression. Allocation is
bounded at 18 × 2,003 doubles even for extreme input traffic. Spatial queries use the **hard-ground
all-height bound**, not the low-receiver contour, so high floors outside that contour are not missed.

The road is treated locally as an infinite straight two-lane line with all Q assigned to its equivalent
near lane. This is consistent with the manual's two-lane aggregation and conservative near-lane
position, but **not a finite-segment sum**. Nearby stations test alternative local sections; they are
not independent full-Q sources to add together. No self-façade reflection, intervening building,
wind/downwind or vegetation correction. Existing cut-edge screening is retained.

Unchanged mitigation: 3/4/5 m crown-side walls, 0.5 m-high source at 1.75 m off axis, explicit sightline,
Maekawa-style `IL=clamp(10log10(3+40δ/0.68)−5,0,13)` dB, best of cut edge and wall **not sum**;
whole-dwelling acquisition when neither works. The 500 Hz surrogate, −5 dB allowance, 13 dB cap,
50 m end margin, highest-floor receiver and property/plot costs remain **provisional** (research/09 §5).

At Q=9,000, p=15%, flat mixed ground; distances are **road axis to protected receiver**, not façade:

| light speed | h=1.5 m contour | h=4.5 m contour | h=10.5 m contour | all-height hard bound, source slant |
|---|---:|---:|---:|---:|
| 80 km/h | 35.68 m | 45.14 m | 89.39 m | 88.21 m |
| 90 km/h | 37.47 m | 47.46 m | 96.46 m | 95.24 m |

Add 2 m to obtain the corresponding façade distance. `quantities.noiseDistance` now reports the
**1.5 m mixed-ground axis contour**, not the old source-slant surrogate. Default untagged two-storey
houses use the 4.5 m receiver. Old “82/100 m” values therefore are not an apples-to-apples single-height
comparison. Both calculations are night-controlled at the default traffic split.

## 4. Published-study comparison — qualified, not a calibration

Reproduce all numbers with **`npx tsx scripts/noise-check.ts`**. None of the visited EIA PDFs provides
a completely specified, flat, isolated, unshielded class-I benchmark with all link speeds/elevations.
The following checks are useful **partial validation**, not evidence for ±1–2 dB predictive accuracy.
In particular, using a generic flat mixed surface systematically underpredicts these façade cases;
do not conceal that by fitting an unexplained emission correction.

### I/23 Třebíč southwest bypass

[Akustika Bartek, January 2018 study](https://www.trebicobcanum.net/wp-content/uploads/2018/02/hlukova-studie.pdf),
HLUK+ 11.61 / 2011 method, forecast 2035. Table 2 p.10 gives RKB1 at **53 m from road axis**, chainage
~360 m; table 3 p.11 gives **53.0/45.6 dB at 2 m**, **55.7/48.3 dB at 5 m** (day/night, incident levels).
Listed barriers begin at 1,540 m, not here. The 3D figure 7 p.18 shows non-flat surroundings; the study
models reflections, whereas its point table is labelled incident. Its stated model uncertainty is ±1.5 dB.

Figure 1 p.9 K1-B lists OA **3,892/255**, NA **373/39**, TN **111/18** (day/night period counts).
**Link attribution is incomplete:** these are a junction-arm flow, not an independently established
RKB1 through-link count. §5 says K1-B is included in the model; it does not give the exact full upstream
link assignment. We use these published counts conditionally, assume 90/80 km/h, level grade and standard
asphalt. No numeric speed or pavement input is stated for RKB1. Comparing, rather than claiming a match:

| RKB1 height | study day/night | calculator mixed | delta calc−study | calculator hard |
|---|---:|---:|---:|---:|
| 2 m | 53.0 / 45.6 | 50.2 / 42.6 | −2.8 / −3.0 | 55.6 / 47.9 |
| 5 m | 55.7 / 48.3 | 52.0 / 44.3 | −3.7 / −4.0 | 55.6 / 47.9 |

Agreement is only at the **ground-assumption envelope** level, within about 0.4 dB at the upper-floor
hard-ground endpoint; the default mixed case is **not within** the study's uncertainty. The day/night
difference is reproduced within ~0.3 dB. More exact agreement needs the original link/terrain model,
not a guessed extra façade correction or doubled traffic.

### II/360 Jaroměřice: independent bypass-only comparator, not class I

[CENIA VYS922 project](https://portal.cenia.cz/eiasea/detail/EIA_VYS922?lang=cs),
[acoustic study, 5 December 2019](https://portal.cenia.cz/eiasea/download/RUlBX1ZZUzkyMl9wcmlsb2hhRG9rdW1lbnRhY2VET0NfNjI5NTI5NTIzNzAxNzg2MTIwOC5wZGY/VYS922_prilohaDokumentaceDOC_6.pdf).
S9.5/70 with maximum posted 90 km/h, 70 near junctions, asphalt concrete (§2.2 pp.5–6).
Reference point 17 is **about 30 m from the axis** (§2.4 p.12). Table 13 p.25 isolates the bypass-only
2035 contribution: floor 1 **55.2/46.5**, floor 2 **56.7/48.0 dB**.

Assume the south-link table 4 p.10 flow (O=3,138, LN=209, TN=126, BUS=5; Q=3,478), 90/80 km/h,
first/second-floor heights 1.5/4.5 m (not numerically specified in the report). Allocate 40% LN to NA
for class II and use TP219 class-II night shares (OA 5.3+0.1PNA %, combined NA 7.5%). Retain the
calculator's class-I source constants; class-II LNA is 0.2 dB higher, a small remaining source bias.

| assumed height | study day/night | calculator mixed | delta calc−study | calculator hard |
|---|---:|---:|---:|---:|
| 1.5 m | 55.2 / 46.5 | 52.4 / 43.7 | −2.8 / −2.8 | 56.3 / 47.6 |
| 4.5 m | 56.7 / 48.0 | 54.1 / 45.4 | −2.6 / −2.6 | 56.3 / 47.6 |

Day/night separation agrees (~8.7 dB); levels are bracketed within about 0.4 dB by the two ground
assumptions. This is still **not clean unmitigated validation**: the study includes acoustic bridge
parapets in all results, though point 17 is not among the specifically listed beneficiaries; exact
link speed, terrain elevation, floor heights and link assignment are missing. Its stated uncertainty
is ±2 dB, not a tolerance the game's mixed model has demonstrated.

### I/36 Sezemice — input cross-check, not a false distance validation

[2016 acoustic study](http://www.poklidnepocaply.cz/wp-content/uploads/2017/11/H6-Hlukova-studie.pdf),
HLUK+ 10.22: table 1 p.9 reports 2022 main-link **12,810 OS+LNA + 750 TNA**, 90 km/h, 0% gradient,
bituminous surface. Table 5 p.14 has receiver 5 **50.1/41.3 dB at 3 m**, **51.1/42.3 at 5 m**.
No tabulated road distance; the outputs also include other roads. Therefore these numbers **cannot**
serve as a matched distance-level check without map digitisation and source separation. They support
the broad class-I operating/traffic assumptions, not the former 100 m radius.

## 5. Costs, performance and remaining uncertainty

Noise-only change, saved geometries/profiles and other prices held fixed; M CZK, rounded independently:

| design | model 6 total → 7 total | buyouts before → after | wall area before → after m² |
|---|---:|---:|---:|
| Reference bypass | 3,949 → 3,868 | 3 → 1 | 12,115 → 9,136 |
| Optimised bypass 90 | 3,038 → 3,008 | 0 → 0 | 7,318 → 4,349 |
| Direct fringe 80 | 3,470 → 3,397 | 1 → 0 | 20,372 → 14,344 |
| Direct fringe 90 | 3,626 → 3,593 | 0 → 0 | 13,574 → 10,246 |
| Town centre 90 | 9,024 → 8,771 | 10 → 2 | 29,835 → 26,056 |

All five remain **VALID**, with matching per-station cost sums. Noise does not alter the auto-profile.
`npx vitest run` covers period-energy conservation, zero/day-only traffic, controlling period,
traffic/speed/heavy-share effects, contour inversion, table accuracy and existing geometric walls,
cut edges, buyouts, attribution and range sums. `npx tsc --noEmit` passes.
Five-run `bench.ts scripts/*.json` means: **30–40 ms**, town work ~2–3 ms. Shared-host runs can be slower;
a same-session old-main comparison gave 32–42 ms, so there is no material noise-path regression.

Unresolved: no local traffic survey or acoustic validation set; a fixed mixed surface can underpredict
hard/reflective surroundings; uneven-ground extension is approximate; highest-floor-only evaluation
is not a search over every occupied window; no curved finite-line integration, multiple-route
aggregation, wind, building screening or detailed meteorology. The EIA comparisons expose rather than
resolve those gaps. The wall model and buyout fallback remain deliberately separate provisional game
rules. A future precise model needs site inputs and segment/terrain propagation, not another fitted D.
