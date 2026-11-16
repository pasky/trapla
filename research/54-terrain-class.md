# Terrain class (flat / hilly / mountainous): what the norm measures, how real sections were classed (2026-11-16)

Question: how should the game decide that the ground a road crosses is hilly or mountainous (it picks the max
gradient: ČSN 73 6101:2018 S 9.5 6 / 8 %, D 4 / 4.5 %; research/47 §1.1)? Current game reading
(`src/core/terrain-class.ts`): median ground slope of 50 m steps within 500 m of a point, mountainous above 15 %.

Confidence tags as in research/47: **H** = read in the norm itself or the primary document; **M** = secondary
quote (thesis, study) or inference from stated design parameters; **L** = indirect / foreign.

## 1. Definitions

### 1.1 ČSN 73 6101 (January 2000 edition, replaced the 1985 one) — the norm text itself (H)

Scan of the norm pages 0–40 published by VUT FAST (PDF metadata "ČSN 736101-Projektovaní silnic a dálnic",
"Ústav pozemních komunikací-FAST-VUT v Brně", 2000), archived at
<http://web.archive.org/web/20151010052427/http://www.fce.vutbr.cz:80/PKO/0M2/CSN736101-000-040.pdf>
(cited as source [5] by Louthan 2011, below). Title page: "ČESKÁ TECHNICKÁ NORMA … Leden 2000 … Touto normou
se nahrazuje ČSN 73 6101 Projektování silnic a dálnic z 1985-06-05". **§8.2.2, printed p. 19** (read on the
page image, not only OCR):

> "8.2.2 Pro hodnocení územních podmínek ke stanovení návrhové rychlosti se území člení do tří skupin:
> a) území rovinaté, popř. mírně zvlněné; přirozené sklony terénu zpravidla nepřevyšují:
>  – v území rovinatém až na nepatrné výjimky hodnotu 3 %;
>  – v území mírně zvlněném hodnotu 5 %;
> b) území pahorkovité - sklony nepřestupují hodnotu 15 %;
> c) území horské se hřbety, hřebeny, soutěskami a srázy, jejichž svahy mají sklony strmější než 15 %.
> V případech, kdy je rozhodující jenom druh území, volí se hodnoty návrhové rychlosti pro jednotlivé druhy
> silničních komunikací podle tabulky 8."

What it measures: the **natural slopes of the ground ("přirozené sklony terénu") of the area ("území")** —
not the road's gradient, not a cross-section ("příčný sklon" is not used), no direction, no corridor width,
no length, no statistic beyond "zpravidla" (as a rule) and "až na nepatrné výjimky" (barring minor
exceptions). Mountainous is described by landforms (ridges, crests, gorges, cliffs) whose *slopes* exceed 15 %.
§8.2.1 (same page): the design speed follows "rozboru konkrétních podmínek územních podle 8.2.2, klimatických,
geologických…" and "Na ucelených tazích dálnic a rychlostních silnic má být zajištěna jednotná hodnota návrhové
rychlosti" — the class is an input to a per-route (section) design decision.

Table 8 (p. 20) of that edition: S 11.5/10.5/9.5 80 / 70 / 60 km/h and 4.5 / 6 / 7.5 %; S 7.5 70 / 60 / 50 and
4.5 / 7 / 9 %; D 26.5 / D 27.5 120 / 120 or 100 / 80 and 3 / 4 / 4.5 % (flat / hilly / mountainous); footnote
***: exceeding the value "je třeba doložit rozborem zvýšení spotřeby pohonných hmot a je vázáno na souhlas
příslušného ústředního orgánu státní správy ve věcech dopravy" (H; same values as the VUT *Aplikace* table
already in research/47 §1.2).

Side finding for research/47: the 2000 edition *does* have a hairpin clause, §8.5.7 p. 23: "Točky jsou výjimečná
řešení, přípustná zpravidla na dvoupruhových silnicích v území horského charakteru (viz 8.2.2)", Table 12 p. 24
min hairpin radii at 7 % / 8 % banking: 45 km/h 75 / 65 m, 40: 60 / 50, 35: 45 / 40, 30: 35 / 30 m (H).

### 1.2 ČSN 73 6101:2004 (H/M)

Its text was not found. Two Jihomoravský kraj route studies citing "ČSN 736101/Z1 tab. 9" reuse the 2000
wording: "Území lze považovat za rovinaté až mírně zvlněné, kde přirozené sklony terénu zpravidla nepřevyšují
5 %. Dle ČSN 736101/Z1 tab. 9 byla zvolena pro … S 9,5 návrhová rychlost 80 km/h" (Pohořelice–Hustopeče
study, §3.2, <https://www.jmk.cz/archiv/oup/urbanisticke_studie/WEB_us_propoj_R52_I53_D2/pdf/2_etapa/pohorelice_hustopece_2_etapa_text.pdf>)
and for I/23 Rosice–Zakřany "mírně zvlněné až pahorkovité, kde přirozené sklony terénu zpravidla nepřevyšují
8 %" → S 11.5/80 (<https://www.kr-jihomoravsky.cz/archiv/oupsr/urbanisticke_studie/Web_I_23_Rosice_Zakrany/pdf/rosice_zakrany_text.pdf>,
§5.1 p. 22) (M). A VUT FAST bachelor thesis 2020 (Kozminský, Bojkovice, p. 14,
<https://www.vut.cz/www_base/zav_prace_soubor_verejne.php?file_id=211573>) quotes the group text verbatim:
"území pahorkovité – sklony nepřestupují hodnotu 15 %" (M).

### 1.3 ČSN 73 6101:2018 (M — norm text not seen)

The ČAS preview (<https://nahledy.normy.biz/n.php?i=505692>) shows only the contents (§8.2 Návrhová rychlost
p. 20, §8.13 Podélný sklon p. 31). Practitioners working under the 2018 edition use three groups with 5 / 15 %:
- Šilhan, ČVUT FD DP 2021, printed p. 40: "Rovinaté území – nejstrmější sklon terénu nepřevyšuje 5 % /
  Pahorkovité území – nejstrmější sklon terénu nepřevyšuje 15 % / Horské území – horské hřbety, hřebeny, srázy a
  jiné útvary, jejichž nejstrmější svahy nepřevyšují [sic] 15 %"
  (<https://projects.fd.cvut.cz/k612x1ps/soubory/F6-DP-2021-Silhan-Matej-diplomova-prace.pdf>).
- Skočdopole, ČVUT FD DP 2020 (I/9 Svor), printed p. 40: "Rovinaté – přirozené sklony terénu nepřevyšující 5 % /
  Území pahorkovité – přirozené sklony terénu nepřevyšují hodnotu 15 % / Horské – horské hřbety, hřebeny,
  soutěsky a srázy, jejichž svahy mají sklony strmější než 15 %"
  (<https://projects.fd.cvut.cz/k612x1ps/soubory/Skocdopole%20J..pdf>).
- SUDOP PRAHA, *II/347 Humpolec – obchvat, technická studie*, 07/2022, A.1 p. 16: "předmětné území uvažováno jako
  pahorkovité (přirozené sklony okolního terénu nepřevyšují 15 %). Z toho plyne nejvyšší povolený sklon 6 %
  pro komunikaci kategorie S 9,5" (<https://humpolec.cz/wp-content/uploads/2025/04/A.-Pruvodni-zprava-Humpolec.pdf>)
  — a professional study, and 6 % matches the 2018 S 9.5 hilly value.

So the 2018 edition very likely merged "rovinaté + mírně zvlněné" into flat ≤ 5 % and kept hilly ≤ 15 % and the
mountainous landform wording. Exact 2018 wording: UNVERIFIED.

### 1.4 Teaching material: no measuring method (H)

- ČVUT 12SDK exercise (<https://k612.fd.cvut.cz/predmety/12SDK/cviceni/vyklad/12sdk-c-01.pdf>) assigns the class by
  map sheet: "určení druhu území (dle mapového podkladu – MP) 1. MP ∈ {10; 11; 12; 13} → rovinaté, mírně zvlněné
  území 2. MP ∈ {1; 4; 5; 8; 9} → pahorkovité území 3. MP ∈ {2; 3; 6; 7} → horské území" — one class per
  assignment area.
- VUT *Aplikace ČSN 73 6101* (<https://www.fce.vutbr.cz/pko/sad/pdf/aplikace.pdf>) only: "Podélný sklon nivelety se
  řídí členitostí území a návrhovou rychlostí."
- RoadPAC road software takes "Druh území … kód 1, 2, 3 nebo 4 (rovinaté, mírně zvlněné, pahorkovité, horské)" as
  a user input (<https://www.roadpac.cz/files/DocumentDocumentItems/file/19/90-rp44-abf4832bff5e0001.pdf>) (M).
- GIS theses re-use the numbers on the *road's* slope, which is a different quantity: Louthan (UP Olomouc 2010;
  GISáček 2011 paper Tab. 1 p. 4, <http://gisacek.vsb.cz/GISacek_2011/papers/louthan.pdf>) "Rovinné (do 3 %) /
  Mírně skloněné (3 – 5 %) / Pahorkovité (5 – 10 %) / Horské (nad 10 %)", adapted "[5, terénní výzkum]";
  Bartoš (UK 2012, p. 35) "rovinaté s přirozenými sklony terénu do 3 %, mírně zvlněné do 5 %, pahorkovité do 15 % a
  horské nad 15 %" (L — not for design).

### 1.5 SPK CN (SFDI 2026) NER / NEH (H)

`spk-cn-1.zip` (<https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip>): Příloha 2 structure has a column
"CHARAKTER ÚZEMÍ" with "ROVINATÉ A PAHORKOVITÉ" / "HORNATÉ"; no definition anywhere in Přílohy 1–7. The one
place the class enters the content of the standard (Příloha 1 průvodní zpráva, list "Cenový standard Komunikace
obsahuje"): "přídatné jízdní pruhy a zvětšení jízdních pruhů ve stoupání či klesání v rozsahu, odpovídajícímu
užité podkategorii charakteru území" — i.e. the NEH +19 % includes climbing / crawler lanes (answers the
"content not stated" UNVERIFIED in research/46 §NER/NEH, partly).

### 1.6 Foreign classifications (L, for comparison)

- **India IRC:73** §4.1 (<https://law.resource.org/pub/in/bis/irc/translate/irc.gov.in.073.1990.html>): "Terrain is
  classified by the general slope of the country across the highway alignment … While classifying a terrain,
  short isolated stretches of varying terrain should not be taken into consideration." Table 1: plain 0–10 %,
  rolling 10–25 %, mountainous 25–60 %, steep > 60 % cross slope.
- **World Bank / HDM-III**, Hoban, *Evaluating Traffic Capacity and Improvements to Road Geometry*, WB Technical
  Paper 74, 1987 (<https://documents.worldbank.org/curated/en/616111468184147999/pdf/WTP74000Proced0nts0to0road0geometry.pdf>):
  terrain bands by **ground** rise plus fall GRF 0–10 / 10–40 / 40–100 m/km (Table 2); typical alignments
  (Table 30): level RF 10 m/km, rolling 20, hilly 50, mountainous 80 m/km (grades small / 3 / 6 / 9 %, design
  speeds 100+ / 60–80 / 60–80 / 50). RF there is the road's own rise+fall — a result of design, so circular for
  classifying ground.
- MZe forest-road guide (Zlatuška ed., 2020, p. 24, <https://mze.gov.cz/public/web/file/658791/Technicka_doporuceni_projektovani_lesni_dopravni_site_A4_WEB.pdf>):
  "Za rovinatý terén se považuje lesní území sklonu terénu do 10 %" (forestry, other purpose).
- German RAL 2012 sets the max gradient per Entwurfsklasse, not by terrain; not checked further.

## 2. Real sections: stated class, gradient, speed

| Section | Stated terrain | Category / design speed | Max gradient | Source |
|---|---|---|---|---|
| D11 1106 HK–Smiřice, 1107 Smiřice–Jaroměř | "rovinatém území" | D 27.5/120 | 1107: 1.90 % | ŘSD *Dálnice D11* brochure 08/2017 (stavba 1106, 1107 pages), <https://rsd.cz/documents/38144/80614/Publikace-D11-08-2017-dvoustrany.pdf> (H) |
| D11 1108 Jaroměř–Trutnov | "max. podélný sklon pro rychlostní komunikaci v kategorii R27,5 v pahorkovitém území, tzn. 4,5 %" | R 27.5/120 → R 25.5/120 | 3.3 % (1108 part), 4.0 % in the part later in 1109 | EIA posudek 06/2011 p. 19, <https://portal.cenia.cz/eiasea/download/RUlBX01aUDE5Nl9wb3N1ZGVrRE9DXzEucGRm/MZP196_posudek.pdf> (H) |
| D11 1108 (zoning decision) | "Trasa dálnice prochází pahorkatinou. Stoupá na hřeben nad obcí Kocbeře" | D 25.5/120 | 4 % | ÚR MěÚ Dvůr Králové 26.11.2021 p. 22, <https://www.choustnikovohradiste.cz/soubory/uredni_deska/2021/2018-33012-1.pdf> (H) |
| D11 1109 Trutnov–border (game pack `d11`) | EIA: "Zájmové území je zvlněné, pahorkovitého typu, jedná se o předhůří Krkonoš s převýšením terénu až 260 m" (p. 49). NGO comment demanded "R25,5/100 (dle ČSN 73 6101, jde o horské území)" (p. 31) — not adopted | R 27.5/120 | UNVERIFIED (not in the EIA text) | EIA documentation, EVERNIA, Liberec 2009, `MZP197_dokumentace.zip` → `R1109_Trutnov-statni_hranice_EIA-text.pdf`, <https://portal.cenia.cz/eiasea/detail/EIA_MZP197> (H) |
| D49 (R49) Fryšták–Zádveřice | "terén pahorkovitý až zvlněný … 250 – 350 m n. m." | R 25.5/120 | 4.5 % used on the route | EIA dokumentace PRAGOPROJEKT 06/2009 pp. 13, 26, <https://portal.cenia.cz/eiasea/download/RUlBX01aUDI3Ml9kb2t1bWVudGFjZURPQ18xLnBkZg/MZP272_dokumentace.pdf> (H) |
| D49 Zádveřice (Vizovice)–Horní Lideč–SK border | "územím horského charakteru, překonává hřeben Vizovických vrchů, výška terénu … 300 do 690 m"; border part "konfigurace terénu má horský charakter" | R 25.5/80 (80 = mountainous speed) | 4.5 % | same, pp. 13, 26 (H) |
| D3 0301 Praha–Jílové | not stated | D 27.5/120 | 3.70 % (> 3 % flat value → hilly row, inference) | dalnice-silnice.cz/D3.htm (M) |
| D3 0305/I Voračice–Nová Hospoda | leaflet: "Území je zde výškově velmi členité" (Zahrádka–Bučovice) | D 27.5/130 (leaflet) | 4 % (hilly row, inference) | ŘSD leaflet Stavby/41; tvstav.cz/clanek/4026 (M) |
| D3 0302–0304 | not stated in leaflets | D 27.5/120–130 | not found | ŘSD leaflets (research/39) |
| D35 Ostrov–Staré Město (incl. Opatovec; pack `d35`) | not stated | R 25.5/120 | 4.5 % | dalnice-silnice.cz/D35.htm, EIA variant summary (M) |
| D35 Staré Město–Mohelnice (DÚR, 2018 norm) | not stated; climbing / descent lanes km 7.7–14.1 | D 26.0/130 | 4.5 % (= old mountainous motorway value; inference only) | SO 101 technical report p. 4, <https://www.maletin.cz/modules/file_storage/download.php?file=d328b8dd%7C265> (H for numbers) |
| I/16 Nová Paka bypass (pack `i16-nova-paka`) | not stated | S 11.5/70 (70 = hilly speed in the old Tab. 8) | not found | ŘSD leaflet (research/46) (M) |
| I/13 Ostrov–Smilov (Ohře gorge, "strmé skalní útvary a strmé svahy") | "Tato návrhová rychlost splňuje ČSN 736101 pro pahorkovité území" | S 11.5/80 (70) | 6.00 % | EIA posudek 04/2007 pp. 8, 11, 19, <https://portal.cenia.cz/eiasea/download/RUlBX01aUDA4MF9wb3N1ZGVrRE9DXzEucGRm/MZP080_posudek.pdf> (H) |
| I/33 Jaroměř bypass | not stated | S 11.5/80 | 3.5 % | EIA oznámení 03/2009 p. 11, portal.cenia.cz HKK485 (H) |
| I/9 Nový Bor–Cvikov vs Svor bypass (thesis design) | hilly ("sklony terénu nepřevyšovaly 15 %") vs mountainous: "Z podélného profilu obchvatu je patrné, že sklon stávajícího terénu často překonává hodnotu 15 %" | S 9.5 | 6 % vs 8 % (8 % used over 763 m) | Skočdopole 2020 pp. 40–41 (M; read from the ground's long-section) |
| II/347 Humpolec bypass | hilly, "přirozené sklony okolního terénu nepřevyšují 15 %" | S 9.5/90 | 6 % allowed | SUDOP 07/2022 p. 16 (H) |
| I/44 Červenohorské sedlo – jih | "charakter komunikace mění na horský s průměrným podélným sklonem nad 5 %, v extrémních případech až 7,15 %" | S 9.5 (approved deviation) | 7.15 % | TVstav 2017 (research/47) (H) |
| I/14, I/11, D1, D8 (Krušné hory / České středohoří) | no stated class found | — | — | searched, nothing usable |

Pattern: designers classify **whole sections or 10–20 km parts** (D49 split in three, D11 1108/1109 one class
each), by a narrative judgement of the region; a deep valley crossed by the route (Ohře gorge on I/13, Labe at
1108, Úpa/Poříčí at 1109) does not make the section mountainous. The class is disputable (1109 EIA vs NGOs).
The only per-stretch reading found is Skočdopole's: the existing ground on the long-section, > 15 % "často".

## 3. Game DEM check (our packs, official lines)

Method: the current `groundSlopeAt` (median of 50 m ground gradients within 500 m, cached per 100 m cell)
sampled every 100 m of chainage on each pack's official line (`/tmp/r54/tc3.ts`; `scripts/_tc2.ts` gives the same
picture with other radii, but oversamples dense vertices), then a running median over a chainage window:

| Pack (real class) | section median | > 15 %: per point | 2 km window | 5 km | 7 km | 10 km |
|---|---:|---:|---:|---:|---:|---:|
| d11 = D11 1109 (hilly, EIA) | 0.098 | 21 % (runs to 3.6 km, km 8.5–12.1) | 14 % | 16 % (km 7.8–12.1, peak 0.192) | 21 % (peak 0.179) | **0 %** (peak 0.146) |
| d3-0301 (hilly, inferred) | 0.081 | 15 % | 11 % | 1 % | 0 % | 0 % |
| d3-0302 (Sázava valley) | 0.119 | 33 % | 29 % | 11 % | 0 % | 0 % (peak 0.147) |
| d3-0303 | 0.080 | 14 % | 14 % | 4 % | 4 % | 0 % |
| d3-0304 | 0.076 | 3 % | 1 % | 0 % | 0 % | 0 % |
| d3-0305 (hilly, inferred) | 0.091 | 3 % | 0 % | 0 % | 0 % | 0 % |
| d35 Opatovec–St. Město (not flat: 4.5 %) | 0.053 | 4 % | 0 % | 0 % | 0 % | 0 % |
| i16-nova-paka (hilly, inferred) | 0.090 | 0 % | 0 % | 0 % | 0 % | 0 % |

So the current per-point reading calls 15–33 % of the D11 1109 and D3 0301–0303 lines mountainous (river
valleys and the Poříčí scarp), where the real designs used the hilly / motorway-hilly row. A ≈ 10 km window
(or one class per section) reproduces every stated class; D11 km 7–13 stays close to 15 % at 5–7 km windows,
which matches the real dispute about 1109. Flat ≤ 5 %: d35's median 0.053 sits just above it, consistent with
its 4.5 % design. No pack covers a stated-mountainous road (D49 east, I/44, Svor), so the mountainous side of
the threshold is **not** calibrated.

## 4. Recommendation for the game

1. **Quantity**: magnitude of the natural ground slope from the DEM (not the road, not only across it), median
   over a corridor of ≈ ±500 m. That is the norm's "přirozené sklony terénu" (2000 §8.2.2, H) and keeps the
   current `groundSlopeAt`. Thresholds 5 % / 15 % (2018 per Šilhan, Skočdopole, SUDOP 2022; M).
2. **Length**: classify **stretches, not stations**: running median of the per-point value over **≈ 10 km of
   chainage** (whole route if shorter), mountainous when > 15 %. Basis: the norm classifies "území" with
   "zpravidla" / exceptions, keeps one design speed per "ucelený tah" (H); designers classed whole sections
   (table above, H); IRC:73 "short isolated stretches … should not be taken into consideration" (L); and the
   10 km window is the shortest that matches all six stated/inferred hilly sections in our packs (game
   calibration, PROVISIONAL). A 5 km window would still call 4 km of D11 1109 mountainous.
3. Hairpins / mountain passes (I/44, Svor ≈ 1.9 km) are mountainous through their surroundings, not the
   stretch itself; a 10 km window should catch them (UNVERIFIED — no pack to test).
4. Gap: the game has no **flat** class. On flat ground the norm caps S 9.5 at 4.5 % and D at 3 % (2018 per
   Šilhan Tab. 8); treating flat as hilly lets ramps / grade lines go to 6 % / 4 % there. Add it if the price
   (SPK has no flat-only row, NER covers both) is not the only use.
5. Rise + fall per km (HDM) is not recommended: on the road it is a design result; on the ground it was not
   tested here.

Confidence: definition and that it is about natural ground slopes of a region — **high** (2000 text read;
2018 wording medium). That real classes are per section — **medium-high** (8 documents). The 10 km window —
**low-medium** (fits six hilly sections, no mountainous one tested).

## 5. Game rule: hairpins on locally steep ground (parent / owner decision, 2026-11-16)

**This is a game rule, not a norm reading.** With the corridor-scale class (§4) no stretch of any pack is
mountainous, so hairpins — allowed by ČSN 73 6101:2000 §8.5.7 only "v území horského charakteru", and absent from
the 2018 edition — would be violations everywhere. The game therefore allows a hairpin (VALID, with the note "a
departure from the road standard: needs the road authority's approval, as the hairpins on I/44 Červenohorské sedlo
did") wherever the ground **around the hairpin itself** is steep: the per-point reading of §4.1 (predominant slope
within 500 m) over 15 %, on a stretch at the category's lowest design speed, turning ≥ 150°. The gradient limits
keep the section class of §4.2 (the norm). Elsewhere a hairpin remains a violation the player may keep.
Precedent: I/44 Červenohorské sedlo (S 9.5/60, hairpins of 17.5 m) was built under an approved departure from
ČSN 73 6101 on a mountain pass (research/47 §2–3).
