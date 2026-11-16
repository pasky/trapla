# Tunnel portals: where mining starts, cut-and-cover, portal cuts and their cost

Research snapshot: 2026-11-16. Prices are CZK excl. VAT unless stated. **Sourced** = a cited document states the
value; **derived** = explicit arithmetic on sourced values; **PROVISIONAL / UNVERIFIED** = not a norm or tender
observation. Owner's question: *"a bit sus how much huge terrain changes tunnel entrances usually require — is it
100 % realistic?"*

## Findings at a glance

- **Czech mined (NRTM) tunnels start at about 5.5–8.5 m of cover above the crown**, about 0.5–0.7 × the excavation
  width, behind a micropile umbrella (mikropilotový deštník) or spiles: D11 Poříčí/Opevnění ≈ 6 m, D8 Radejčín
  6 m, rail tunnel Mezno 5.5 / 7.2 m, I/35 Hřebeč 5.5 m, D35 Homole 8–8.5 m. The German guide (Hessen Mobil 2006)
  advises ≥ 1.0 × tunnel width of cover in sound rock and 1.5–2.0 × in firm soil, with pipe umbrellas for 5–10 m.
- **Between the mined face and the visible portal there is almost always a cut-and-cover (hloubený) section.** It
  is built in an open pit and then **backfilled**, so the ground is put back over it. Typical lengths are 12–50 m
  per portal (D11: one or two 12 m blocks; Valík 20 / 30 m; Mezno 24 / 48 m). On flat approaches it runs to
  130–350 m (Radejčín 130 m, Klimkovice 166 m, Lochkov 347 m). Its cover runs from 0 m at the portal to 5–7.5 m
  (the official Radejčín card says up to 13 m).
- **The temporary pit at the mined face is typically 15–18 m deep** (D11 "up to 17 m"; Mezno face 16 / 18 m;
  D0 Cholupice 17 m). Its lower part is near-vertical (3:1 to 5:1), nailed or anchored and shotcreted; the upper
  part in soil is sloped 1:1.5–1:2. After backfilling, **the cut you still see at the final portal is about one
  tunnel height deep (≈ 8–10 m)**. 20–30 m portal pits exist (D0 Komořany 30 m; Mrázovka 27 m rock walls) but are
  exceptions. The Hessen guide: pre-cuts deeper than about 20 m "are often feasible only with high effort".
- **Engine check (code, not the prices.ts comment):** `evaluate.ts:802` allows a tunnel where ground − grade ≥ 14 m.
  With the crown 8 m above grade, that is **≈ 6 m of cover**, which matches the Czech mined-start evidence. So the
  14 m rule itself is not the problem. The problem is that Auto places portals where a tunnel becomes cheaper than
  the open cut. In current runs the open cut next to the portal is **12–34 m deep**: d11 straight S9.5 11.7 / 17.4 m;
  town-centre design 12.4–23.8 m; d35 straight S9.5 25.7 / 25.7 m; d35 straight D27.5 19.7 / 33.6 m; d3-0304 straight
  D27.5 26.9 / 27.0 m. The engine also has no cut-and-cover or backfill, so the whole approach stays an open
  1:1.75 cut that ends at a bare face. **Not 100 % realistic:** a 20–30 m deep, permanently open cut before every
  portal is not Czech practice.
- **Cost, SPK CN 2026 (sourced):** cut-and-cover 2-lane rural tube, ≤ 500 m: **1,598,997 CZK/m**, vs mined
  **1,487,547 CZK/m** (+7.5 %). The cut-and-cover row covers only up to 5 m of cover; deeper earthworks are priced
  extra. Neither row includes "extensive pre-portal works (walls, galleries, slope protection)". Covered bridges and
  ecoducts: **48,235 CZK/m² of plan area**.
- **Why real portals are shallower than a pure cost optimum:** most Czech road tunnels exist because a permit,
  EIA, spa, protected landscape or village demands them, not because a cut was dearer. The D3 tunnels Hostěradice
  (360 m), Vršky (120 m) and Krňany (415 m) have **at most 12–13 m of cover** in total. The Hessen guide puts the
  economic limit of a cut against a tunnel at **about 30 m depth**, so cost alone does not produce shallow portals.

## 1. Where mining starts (minimum cover) and the role of cut-and-cover

| Source | Statement | Value |
|---|---|---|
| [Hessen Mobil, *Wirtschaftliche Aspekte bei Tunnelbauwerken in frühen Planungsphasen*, Heft 52-2006](https://mobil.hessen.de/sites/mobil.hessen.de/files/2022-02/wirtschaftliche_aspekte.pdf), §4.1.2 | Crown cover needed for a full ground arch, first design: firm soil Hü ≥ 1.5–2.0 B; firm rock Hü ≥ 1.0 B (B = tunnel width) | ≈ 12 m rock, 18–24 m soil for B ≈ 12 m (derived) |
| same, §4.1.1 "Grundsatz offene Tunnelbauweise" | "Bei Firstüberdeckungen von maximal 5 m bis 7 m ist die offene Tunnelbauweise in der Regel vergleichsweise kostengünstig" | cut-and-cover up to 5–7 m cover |
| same, §4.1.2 "Abgrenzung offene / geschlossene Bauweise" | Make the cut-and-cover section as long as sensible; minimise mined sections that need special measures; "Voreinschnitte mit Firstüberdeckungen von weniger als ca. 7 m bis 8 m nach Möglichkeit vermieden" | mined start ≳ 7–8 m preferred |
| same, §4.1.1 | Deep pre-cuts shorten the expensive low-cover mining, but their support cost rises more than proportionally: "Tiefen von mehr als ca. 20 m sind häufig nur noch mit hohem Aufwand realisierbar" | pre-cut ≲ 20 m |
| same, Fig. 4.1-1 | Method by crown cover: < 5 m open; 5–10 m open or mined with special measures ("VKL 7 mit Rohrschirm"); 10–20 m mined (special measures in soil); > 20 m mined | see §3 for costs |
| same, Ch. 2 reference tunnel | "Portal und ca. 20 m des Tunnels werden in offener Bauweise erstellt, weitere 10 m … unter ungünstigen Vortriebsbedingungen (z. B. Vortriebsklasse 7A)" | 20 m cut-and-cover per portal |
| [FHWA-NHI-09-010 Road Tunnel Manual (2009)](https://www.fhwa.dot.gov/bridge/tunnel/pubs/nhi09010/tunnel_manual.pdf), §1.3.5 and §9.5.5 | A cut-and-cover portal "can be as close to the surface as the roof of the tunnel can be placed"; mountain portals "as close to the face of the mountain as practically constructible". Portal pre-support 3–18 m long at 0.30 m spacing; shotcrete canopies become the cut-and-cover section and are backfilled | qualitative |
| [D11 Poříčí/Opevnění project, Stavebnictví 2023](https://www.casopisstavebnictvi.cz/clanky-projekt-tunelu-porici-a-opevneni-na-dalnici-d11-v-useku-trutnov-statni-hranice-s-polskem.html) | Mining begins "s nadložím cca 6 m"; cover "minimálně 6 m v oblasti (ražených) portálů". Excavation 90 m², 12.3 m wide, 8.8 m high. Class TT 5a for portal zones with cover < 15 m, TT 4 above 15 m, TT 3 above 20 m. Spiles at the face plus a "falešné primární ostění" (false primary lining) | **6 m ≈ 0.5 B** |
| [Mezno rail tunnel, Stavebnictví 2021](https://www.casopisstavebnictvi.cz/clanky-realizace-noveho-dvoukolejneho-tunelu-mezno.html) | Cover at the mined portals 5.5 m and 7.2 m; micropile umbrella of 47 tubes 108/16 mm, 15 m long (lengthened to 18 m at entry); false lining 2.18 m | 5.5 / 7.2 m |
| [TKP-D kap. 7 (MD 2016), annex: tunnel card of Radejčín](https://pjpk.rsd.cz/viewFile.asp?file=1506) | "Výška nadloží: hloubená část min 0 m, max 13 m; ražená část min 6 m, max 28 m" | mined ≥ 6 m; cut-and-cover 0–13 m |
| [ITA-CZ, Automobilový tunel Hřebeč](https://www.ita-aites.cz/cz/podzemni_stavby/automobilovy-tunel-hrebec.html) | 3-lane, excavation 151–160 m², "výška nadloží 5,5–17 m" | 5.5 m |
| [Wikipedia, Tunel Homole](https://cs.wikipedia.org/wiki/Tunel_Homole) (search snippet), [Orlický deník 2023](https://orlicky.denik.cz/zpravy-region/tunel-homole-na-d35-da-stavarum-zabrat-nesmi-se-propadnout-silnice-i-17/) (snippet) | Mined cover 8–24 m (LTT), 8.5–19 m (PTT); [ITA seminar 2025](https://www.ita-aites.cz/files/Seminare/2025/to_3_25/03_korba_realizace.pdf): 150 / 176 m mined under 15 m micropile umbrellas, 13 / 16 umbrellas of up to 35 tubes | 8–8.5 m |
| [Klimkovice (ASB 2009)](https://www.asb-portal.cz/stavebnictvi/inzenyrske-stavby/tunely/tunel-klimkovice-2) | In the low-cover zone, cover ≈ excavation width (13.8 m): no natural ground arch formed, the primary lining carried the full overburden, settlement up to 46 mm | 13.8 m still counts as "low cover" |
| [Spang 2003, A17 Dresden portals](https://www.scribd.com/doc/125572360/Design-and-construction-of-tunnel-portals-pdf) | Dölzschen portals: mining started from a fill placed against a rock face, "ohne Voreinschnitt", under a short shotcrete canopy | steep rock: no pre-cut |

**Conclusion.** Mining starts at ≈ 6 m of cover (range 5.5–8.5 m) under pipe or micropile umbrellas, in the
worst excavation class. Below that the tunnel is cut-and-cover. With the game's crown at 8 m above grade, the mined
face is at a grade depth of ≈ 14–16 m, which is the engine's 14 m threshold. Confidence: high for Czech practice
(seven independent projects).

## 2. Czech (and a few Slovak) tunnels: lengths, cut-and-cover parts, portal pits

Lengths in m per tube (L/R or S/N where given). "c&c" = cut-and-cover (hloubený).

| Tunnel (road) | Total | Mined | c&c portal 1 | c&c portal 2 | Portal pit / slopes / support | Cover at mined portal | Source |
|---|---|---|---|---|---|---|---|
| Prackovice (D8) | 270 / 260 | 155.5 / 138 | Prague 85.8 (9 blocks of 10 m, one of 5 m) | Ústí 25 (2 blocks) | Prague portal cut into a quarry face. Pre-stressed anchors, nails into jet-grouted ground, reinforced shotcrete, double micropile umbrella. Removing ≈ 20,000 m³ in front of the portal wall moved the wall; fixed with a counter-fill and a third anchor row. Backfill over c&c ≤ 7.0 m | not stated | [ITA-CZ D8](https://www.ita-aites.cz/cz/podzemni_stavby/tunely-prackovice-radejcin-dalnici-d8.html), [dalnice-silnice.cz](https://www.dalnice-silnice.cz/tunel_d8.htm) |
| Radejčín (D8) | 620 / 600 | 446 / 446 | Prague 44 / 24 | Ústí 130 (carries the relocated road III/25832 at 59 m) | Backfill ≤ 7.5 m over the vault, then graded 1:10 to the mined face | 6 m (card) | ITA-CZ D8; TKP-D 7 annex |
| Libouchec (D8) | 535 / 454 | 511 / 406 | — | — | Plus a 160 m **gallery** on the left tube | — | dalnice-silnice.cz |
| Klimkovice (D1, ex D47) | 1077 / 1088 | 864.8 / 875.3 | Brno 165.8 / 166.4 | Ostrava 46.2 / 46.4 | Open pits with temporary portals. Waling beams, strand and bar anchors, nails, mesh-reinforced shotcrete, micropile umbrellas, RC collars. Ostrava side partly an anchored large-diameter pile wall. Brno side slope moved up to 75 mm, extra 12 m TITAN anchors | low cover ≈ 13.8 m zone | [ASB 1](https://www.asb-portal.cz/stavebnictvi/inzenyrske-stavby/tunely/tunel-klimkovice-1), [ASB 2](https://www.asb-portal.cz/stavebnictvi/inzenyrske-stavby/tunely/tunel-klimkovice-2), [Stavebnictví 2007](https://www.casopisstavebnictvi.cz/clanky-tunel-klimkovice-na-dalnici-d-47.html) |
| Valík (D5) | 390 / 380 | 330 | Prague 20 | Rozvadov 30 | Twin tubes with no rock pillar (shared central pillar), chosen to cut land take near the portals by 10–15 m per side. Weathering 3–20 m deep | low (no natural arch) | [ITA-CZ](https://www.ita-aites.cz/cz/podzemni_stavby/tunel-valik.html), [Stavebnictví 2007](https://www.casopisstavebnictvi.cz/clanky-stavba-dvoutubusoveho-tunelu-valik-soucast-obchvatu-plzne-na-dalnici-d-5.html) |
| Lochkov (D0 514) | 1619 / 1661 | 1252 / 1302 | Lahovice (steep slope, vertical face) 20 / 12 | Lochkov (flat plateau) 347 / 347 | Pit for the c&c tunnels 230,000 m³; Radotín portal micropile umbrella | — | [Wikipedia](https://cs.wikipedia.org/wiki/Lochkovsk%C3%BD_tunel), [ŘSD D0 brochure 04/2021](https://www.rsd.cz/documents/38144/80614/rsd-publikace-D0_04-2021.pdf), [Silnice železnice 2009](http://old.silnice-zeleznice.cz/clanek/tunel-v-useku-514-lahovice-slivenec-prazskeho-silnicniho-okruhu/) |
| Komořany / Cholupice (D0 513) | 1937 / 1924 | — | Komořany pit **170 m long, 30 m deep, 47 m wide** (sand) | Cholupice pit **85 m long, 17 m deep** (anchored pile wall) | Micropile umbrellas. The same stretch has a separate 70 m covered ("přesypaný") tunnel | — | [Mařík & Prajzler 2008](https://www.ita-aites.cz/files/Seminare/2008_02_TO/Marik-Prajzler-Technicke_reseni_513.pdf); ŘSD D0 brochure |
| Homole (D35) | 525 / 570 | 345–355 / 450 | c&c total 170–180 / 120 | — | Western portal in a pit; the tunnel passes low over road I/17 | 8–8.5 m | Wikipedia; ITA seminar 2025 |
| Poříčí (D11) | 576 / 540 | — | south: one 12 m block | north: two 12 m blocks (lengthened after extra investigation) | Sloped pits **up to 17 m deep**. Upper slopes 1:2–1:1.5 in soil and eluvium; lower slopes **3:1** with 6 m Ø 25 bars at 1.5 × 1.5 m and 200 mm shotcrete with one 8/150 mesh | ≈ 6 m | D11 project, Stavebnictví 2023; [zdopravy 2026](https://zdopravy.cz/ceske-dalnice-miri-pod-zem-prehled-ukazuje-vsechny-budovane-a-planovane-tunelove-useky-283786/) |
| Opevnění (D11) | 492 | 444 | 2 × 12 m | 2 × 12 m | as Poříčí; nails 6 m ([Silnice železnice 2026](https://silnice-zeleznice.cz/silnice/vystavba-tunelu-porici-a-opevneni-na-dalnici-d11-1196)) | ≈ 6 m | D11 project; [tvstav](https://tvstav.cz/clanek/8739-vystavba-tunelu-na-d11-u-trutnova-opevneni-ma-prorazku-za-sebou-a-vstupuje-do-dalsi-faze) |
| Kamenný vrch (D11 1108) | 780 / 756 | 684 | c&c 96 / 72 in total | — | Jet grouting at the Jaroměř portal | — | [ŘSD](https://kraje.rsd.cz/kralovehradecky/2269-2/) |
| Hostěradice / Vršky / Krňany (D3 0302–0303) | 360 / 120 / 415 | mined | — | — | — | **max cover ≤ 13 / ≤ 12 / ≤ 13 m** | [Menger, ITA 2017](https://www.ita-aites.cz/files/Seminare/2017/to-2_17/d3-menger-tunelove-stavby.pdf) |
| Libeř (D3 0301) | 1500 | 0 | entirely c&c in a supported pit | — | — | — | Menger 2017 |
| Luka (D3 0302) | 1843 | 1260 | Bohuliby c&c tunnel 200 + 100 open | — | — | up to 63 m | zdopravy 2026 |
| Pohůrka (D3, Č. Budějovice) | 999.5 | 0 | shallow c&c under a creek | — | Portals are U-shaped anchored diaphragm walls 0.8–1.0 m thick and 11.2–23.0 m deep; Kaplice portal cut up to ≈ 135 m wide at the top | — | [Silnice železnice 2025](https://silnice-zeleznice.cz/silnice/dalnicni-tunel-pohurka-na-obchvatu-ceskych-budejovic-1064) |
| Dubeč / Na Vysoké (D0 511) | 267 / 271; 392 / 385 | 0 | c&c in open pits (sloped, shotcrete, nails). Dubeč carries a road and a bio-corridor over the motorway cut; Na Vysoké was required by the EIA and the municipality | — | — | — | [ITA news 8/2026](https://www.ita-aites.cz/cz/aktuality-z-podzemnich-staveb/aktuality-z-8-2026.html), ŘSD D0 brochure |
| Stránov (I/16) | 270 | 0 | all c&c, 3-lane, grades up to 8 % | — | Anchored soldier-pile walls plus a nailed, shotcreted rock cut; temporary bridge over the pit 18.2 m high | — | [ASB.sk 2025](https://www.asb.sk/stavebnictvo/inzinierske-stavby/tunel-stranov-vo-vystavbe) |
| Kramolna / Dolní Radechová (I/33) | 100 / 363 | 0 / ≈ 301–332 | Kramolna all c&c; Radechová has three c&c parts, the middle one across a side valley "z důvodu nízkého nadloží" | — | — | — | ITA news 8/2026; [ŘSD 2025](https://www.rsd.cz/-/%C5%98editelstv%C3%AD-silnic-a-d%C3%A1lnic-za%C4%8Dalo-stav%C4%9Bt-obchvat-n%C3%A1choda-na-i/33) |
| Brandl (I/14) | 576 | 540 | 12 | 24 | — | — | zdopravy 2026 |
| Královo Pole (Brno, VMO) | 1237 / 1258 | 1019 / 1060 | Žabovřesky 168 / 149 | Královo Pole 50 / 49 | braced pits | — | [ITA-CZ](https://www.ita-aites.cz/cz/podzemni_stavby/kralovopolske-tunely-brno-vmo-dobrovskeho.html) |
| Mrázovka (Prague) | — | — | c&c at both portals | — | South portals in a steep slope with vertical rock walls **up to 27 m** held by permanent anchors and shotcrete; north portals in anchored pile walls | 5–80 m along the tunnel | [podzemi.solvayovylomy.cz](https://podzemi.solvayovylomy.cz/podzemi/mrazovka/mrazovka.htm) |
| Blanka (Prague) | 5.54 km mined tube vs 6.56 km c&c tube | | | | | | [Silnice železnice 2012](http://old.silnice-zeleznice.cz/clanek/tunelovy-komplex-blanka-na-mestskem-okruhu-v-praze/) |
| Mezno (rail, 4th corridor) | 840 | 768 | entry 48 (pit 48.5 m long, face **18.0 m** high) | exit 24 (pit 24.5 m, face **16.0 m**) | Sides 5:1 lower, then 4:1 or 2:1, top 1:1.5; 100 mm C16/20 shotcrete with mesh and 4 m SN Ø 25 bolts; the entry slope slid (May 2020) | 7.2 / 5.5 m | Stavebnictví 2021 |
| Březno (rail) | 1758 | 1478 | exit ≈ 250 | entry: anchored pile wall + closed frame (undermining found) | — | — | [Silnice železnice 2008](http://old.silnice-zeleznice.cz/clanek/nejdelsi-zeleznicni-tunel-brezno-v-provozu/) |
| Ejpovice (rail, TBM) | 4150 / 4174 | nearly all | short c&c portal parts | — | First 250 m of the north tube partly at low cover | — | [ČKAIT 30 let](https://30let.ckait.cz/stavba-24-ejpovicky-tunel-modernizace-zeleznicni-trati-rokycany-plzen.html) |
| Ovčiarsko (SK, D1) | 2367 / 2360 | 2320 / 2300 | 47–60 in total | — | — | — | search snippets of [ITA Tunel 2015/3](https://www.ita-aites.cz/files/tunel/2015/3/tunnel_2015_3-034.pdf) (scanned PDF, not text-verified) |

Not found in this pass: Pisárecký tunnel (Brno) and the Vinohradské rail tunnels' portal data. No source gave
the D48/D49 tunnels.

### Is a ~20+ m deep approach cut before every portal typical?

**No.** Typical Czech road and rail portals:

- At the **mined face**, a temporary pit about **15–18 m deep**: tunnel height (≈ 8.8–10 m) plus 5.5–8 m of cover.
  Examples: D11 ≤ 17 m, Mezno 16 / 18 m, D0 Cholupice 17 m, Stránov ≈ 18 m. The lower faces are steep (3:1–5:1),
  nailed or anchored and shotcreted. The pit is **backfilled** over the cut-and-cover tube.
- At the **final portal**, the open approach cut is about one structure height deep (≈ 8–10 m), because cover over
  the cut-and-cover tube runs from 0 m at the portal (Radejčín card: minimum 0 m). Portal collars often stick out
  of the slope (Homole: "vystupující lem portálu").
- **Exceptions:** D0 Komořany pit 30 m deep in sand (urban edge, steep valley side); Mrázovka rock walls up to 27 m
  (urban). Prackovice was cut into an existing quarry face, and removing 20,000 m³ there made the portal wall move.
  The Hessen guide says pre-cuts over ≈ 20 m are "often only feasible with high effort".

## 3. Costs

| Item | Value | Source / status |
|---|---|---|
| Mined 2-lane tube, rural, ≤ 500 m (A.3.R.2.NE.K) | 1,487,547 CZK/m (min 1,119,044, max 1,966,985) | SPK CN 2026, sourced; assumes NRTM class TT4 |
| Mined 2-lane tube, rural, > 500 m (A.3.R.2.NE.D) | 1,549,899 CZK/m | SPK CN 2026 |
| **Cut-and-cover** 2-lane tube, rural, ≤ 500 m (A.3.H.2.NE.K) | **1,598,997 CZK/m** (min 1,191,330, max 1,966,034) | SPK CN 2026; assumes excavation class I 80 % / II 20 % and "nadloží max. do výšky 5,0 m" |
| Cut-and-cover 2-lane, rural, > 500 m (A.3.H.2.NE.D) | 1,666,020 CZK/m | SPK CN 2026 |
| Cut-and-cover 3-lane, rural, ≤ 500 m / > 500 m | 1,919,029 / 2,006,539 CZK/m (mined: 1,710,553 / 1,781,992) | SPK CN 2026 |
| Cut-and-cover, urban | "individuálně" (priced case by case) | SPK CN 2026 |
| What the tunnel rows include | lining, **portals ("vybudování portálů tunelu")**, pavement, signs, drainage, lighting, equipment (20 % of cost) | SPK CN 2026 průvodní zpráva, A.3 |
| What they exclude | exploratory galleries, control buildings, monitoring, **"rozsáhlé předportálové úpravy (zdi, galerie, opevnění svahů a pod.)"**, ventilation buildings, **"zemní práce a ochranné konstrukce při zahloubení hloubených tunelů větším než 5,0 m nadloží"**, 12-month trial operation | same |
| Covered bridge / ecoduct (A.2.P.N / A.2.B.N) | 48,235 CZK per m² of plan area (span × length) | SPK CN 2026; derived: 12 m span ≈ 0.58 M CZK per m of road, 30 m span ≈ 1.45 M CZK/m |
| D35 Homole contract (2 tubes, 1,095 tube-m incl. 290–300 m c&c) | 1.754 bn CZK → **≈ 1.60 M CZK per tube-m** (derived) | ITA seminar 2025, Wikipedia |
| I/16 Stránov: whole 1.285 km relocation incl. 270 m 3-lane c&c tunnel | 662.09 M CZK | social-media / news snippets, low quality; upper bound only |
| D0 514 Lochkov, civil part of the tunnel | 1.8 bn CZK (2005 prices, incl. VAT) | Silnice železnice 2009; old |
| German reference tunnel (1 tube RQ 10.5T, < 400 m, good rock, cover > 20 m) | 14,000–16,000 €/m (civil + equipment, c. 2005) | Hessen Mobil 2006, ch. 2 |

**Relative cost by crown cover** (Hessen Mobil 2006, Fig. 4.1-1; read off the chart, ± 10 %; 100 % = the
reference tunnel above):

| Crown cover | Firm soil | Firm rock |
|---|---|---|
| < 5 m | open (c&c) 75–200 % | open 63–200 % |
| 5–10 m | open 180–250 % | mined with special measures (pipe umbrella) 180–250 % |
| 10–20 m | mined with special measures 230–365 % | mined 140–190 % |
| > 20 m | mined 170–240 % | mined 100–145 % |

So **mining under low cover costs ≈ 1.3–1.8 × deep mining in rock**, and cut-and-cover at < 5 m costs about the
same as mining. SPK says the same in absolute terms (c&c ≈ +7.5 % vs mined TT4).

**Share of the portal zone.** Hessen lists the pre-cuts, portal blocks and portal forecourt among the costs that do
not depend on length: "Die spezifischen Baukosten je Meter Tunnelröhre für einen ca. 1.000 m langen Tunnel [liegen]
im Mittel etwa 3 % bis 5 % unter … ca. 500 m", and up to 7 % lower at 2,000 m. *Derived:* fixed costs F with
per-metre cost c: (F/1000 + c) = 0.95–0.97 (F/500 + c) gives F ≈ 30–53 m of tunnel per tube. That is ≈ 10–15 % of a
300 m tunnel. This is PROVISIONAL (German, and F also covers site set-up). SPK, on the contrary, prices short
tunnels slightly *lower* per km than long ones, because long ones carry more equipment.

**Portal slopes and pit components (OTSKP 2026, sourced unit rates; assembly derived, PROVISIONAL).** Using the D11
Poříčí specification (6 m Ø 25 bars at 1.5 × 1.5 m = 0.444 per m², 200 mm reinforced shotcrete, one 8/150 mesh):

- nail 285364 "KOTVENÍ NA POVRCHU Z BETONÁŘSKÉ VÝZTUŽE DL. DO 6M": 8,468.58 CZK each, drilling not included;
- drilling 6 m: 261715 (class I–II, D ≤ 50 mm) 1,135.74 CZK/m to 261816 (class III–IV, D ≤ 80 mm) 2,224.60 CZK/m,
  so 6,814–13,348 CZK per nail;
- that gives 15,283–21,816 CZK per nail, i.e. **6,790–9,700 CZK/m²**;
- shotcrete 28932A (reinforced, C20/25) 11,252.13 CZK/m³ × 0.2 m = 2,250 CZK/m²;
- mesh 289366 41,919.81 CZK/t × 5.3 kg/m² = 221 CZK/m².

**Total ≈ 9,300–12,200 CZK per m² of supported face**, excluding waling beams, prestressed anchors (285374: 14,889 CZK
per 6 m anchor plus drilling), drainage and monitoring. A micropile umbrella like Mezno's (47 × 15 m = 705 m of
tube) costs 227832 at 3,491.42 CZK/m plus drilling 26183 at 2,733.38 CZK/m, i.e. **≈ 4.4 M CZK per tube portal**
(derived): about 3 m of tunnel. Backfill: 17411 "ZÁSYP JAM A RÝH ZEMINOU SE ZHUTNĚNÍM" 195.56 CZK/m³. These are
component rates; research/48 cautions against treating them as a tender assembly.

## 4. Galleries, covered cuttings, ecoducts and short tunnels as low-cover alternatives

- **Definitions (TKP-D kap. 7, 2016):** a *tunnel* is a structure on a road "délky nad 100 m, do této délky se jedná
  o podjezdy" (shorter ones are underpasses). A *galerie* is an open-sided protective roof over the road, usually
  built by excavation. A *hloubený tunel* is built in an open pit or trench, or on the surface, "později zasypaný"
  (backfilled later). The safety regulation NV 264/2009 applies only to tunnels over 500 m.
- **Uses:** the D8 Libouchec 160 m gallery; the D0 513 70 m covered tunnel; the D0 Dubeč c&c tunnel carrying a road
  and a bio-corridor over the motorway cut; c&c sections that carry relocated roads over the portal (Radejčín
  III/25832; D3 0301 III/00315 "přeložena do polohy nad portálem tunelu",
  [ŘSD leaflet](https://www.dalniced3.cz/public/files/documents/infoletak-d3-0301-praha-jilove.pdf), search snippet). Many fully c&c tunnels sit in shallow terrain: Libeř 1500 m, Pohůrka 999.5 m,
  Dubeč, Na Vysoké, Stránov, Kramolna, and the D0 north tunnels Suchdol 1970 m, Třeboradice 1330 m, Veleň.
- **Cost:** a covered bridge or ecoduct is 48,235 CZK/m² in SPK. Example size: the D55 Bzenec ecoduct is 66 m wide
  × 37 m long ([ČTK 2023](https://www.ceskenoviny.cz/zpravy/na-stavbe-d55-vznika-u-bzence-ekodukt-pro-zver-pro-snizeni-vysky-je-zalomeny/2438518));
  at the SPK rate that is ≈ 118 M CZK (derived). Covered sections ≤ 100 m are not tunnels under TKP, so no tunnel
  equipment is needed. Pricing them per m² is more realistic than the tunnel row.

## 5. Minimum length and cover for cut-and-cover

- **Minimum tunnel length:** no norm minimum for a *mined* tunnel was found. TKP-D 7 starts calling it a tunnel
  above 100 m. Short mined tunnels exist: Vršky 120 m (cover ≤ 12 m). SPK and the EU directive split at 500 m.
  RABT (via Hessen) raises safety requirements at 400 / 600 / 900 m.
- **Minimum cut-and-cover per portal:** observed 12 m (D11 Poříčí south, one block). Typical 12–50 m; the Hessen
  reference uses ≈ 20 m.
- **Backfill over cut-and-cover:** SPK prices up to **5 m**. Observed maxima: Prackovice 7.0 m, Radejčín 7.5 m (card:
  0–13 m). ASFINAG PLaPB requires root-protection mats where cover is ≤ 5 m, which shows ≤ 5 m is common
  ([ASFINAG PLaPB Tunnel](https://www.asfinag.net/media/1167/8005001000-technische-richtlinie_v6-2012017.pdf)).
  Minimum is **0 m at the portal** (Radejčín card); the final metres are often a free-standing portal collar.
  A minimum soil thickness on ecoducts was not verified.

## Game implications (proposal; the main agent decides)

The current rule — tunnel where ground − grade ≥ 14 m, i.e. ≈ 6 m above an 8 m crown — **already matches where
Czech mining starts** (confidence high). The unrealistic part is the portal itself: no cut-and-cover, no backfill,
and a 1:1.75 open cut down to wherever Auto finds a tunnel cheaper (12–34 m in current runs). Proposed model, with
C = ground − (grade + 8 m), cover above the crown:

1. **Mined** where C ≥ x, **x = 6 m** (observed 5.5–8.5 m; confidence high). Optionally a low-cover surcharge of
   **× 1.3–1.4 for 6 ≤ C < 15 m**: Hessen rock 140–190 % vs 100–145 %, and D11 assigns TT 5a below 15 m cover
   (confidence medium, PROVISIONAL). Simpler fallback: x = 8 m (Hessen: avoid starts below 7–8 m) with no surcharge.
2. **Cut-and-cover** from the portal (C ≈ 0) up to where mining starts, plus wherever 0 ≤ C ≤ y with **y = 5 m**,
   at SPK A.3.H rows (1,598,997 CZK/m per 2-lane tube rural ≤ 500 m; 1,666,020 > 500 m). For 5 < C ≤ 7.5 m, add
   the extra pit excavation and backfill (17411, 195.56 CZK/m³) at earthwork rates, as SPK requires (confidence
   medium-high). **Require ≥ 12 m of cut-and-cover at each portal** (one D11 block; typical 12–50 m). The ground is
   **restored over it**: draw and bill the pit as excavated and backfilled, not as an open cut. The visible approach
   cut then ends at C ≈ 0, ≈ 8–9 m below ground.
3. **Portal pit faces** at the mined face (and any approach-cut face more than ≈ 10 m deep at the portal):
   lower part steep 3:1 (rock) to 5:1, upper 1:1.5–1:2 in soil/eluvium. Nailed + shotcrete at **≈ 9–12 k CZK/m²**
   (derived from OTSKP, PROVISIONAL), plus ≈ 4.4 M CZK per tube for the micropile umbrella. SPK excludes these
   "extensive pre-portal works", so bill them separately (confidence low-medium on the rate, high that it exists).
4. **Short covered sections ≤ 100 m** (ecoduct, covered cutting): price at SPK A.2.P.N/A.2.B.N, 48,235 CZK/m² of
   plan, with no tunnel equipment. Consider lowering `minTunnelLength` from 150 m to the TKP 100 m threshold
   (confidence medium).
5. **Expectation management:** with these prices an open cut is still cheaper per metre than a tunnel down to
   ≈ 25–35 m depth. Hessen puts the economic cut/tunnel limit at ≈ 30 m, so Auto will keep choosing deep cuts
   where a tunnel is only a cost alternative, and that is defensible. Real Czech portals are shallower mainly
   because the tunnel was required (EIA, spa, protected landscape: Na Vysoké, Klimkovice, Valík land take, D8
   CHKO, D3 Vršky / Hostěradice / Krňany with ≤ 12–13 m cover). Engineering cost alone does not explain it.
   Items 1–3 make every tunnel *that is built* look and cost like Czech practice, but only if the portal (the start of
   cut-and-cover) is **required** to sit where C ≲ 1–2 m. Then a 20–30 m open cut ending at a bare face cannot occur
   by construction. The price: each tunnel gets longer by the cut-and-cover reach (C from ≈ 0 to 6 m), so Auto will
   choose tunnels somewhat less often. Whether to enforce this, or instead cap the portal-face height at ≈ 18–20 m
   (observed pits 15–18 m; Hessen: > 20 m "only with high effort"), is a design choice. Check it on d35 and d3-0304,
   where the straight runs above show 25–34 m approach cuts.
