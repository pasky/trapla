# Bridge styles: span, depth, piers and cost by structural system

Research snapshot 2026-11-16. CZK excl. VAT unless stated. Extends research/16-* (SPK/OTSKP basis, height
attribute, geometry comparators); does not repeat them. Purpose: evidence for a player-selectable bridge style
that trades pier count against deck cost (owner: "choose a bridge style e.g. cantilevered to trade number of
pillars for cost").

Escalation to 2025 prices uses ČSÚ CZ-CC **2141 "Mosty a visuté dálnice"** annual year-on-year indices (Cenová
statistika stavebnictví 2004–2025, tab. 8): chained factor **2007→2025 = 1.540**, 2014→2025 = 1.553,
2022→2025 = 1.096. SPK CN 2026 is treated as ≈2025/26 price level. Escalated figures are arithmetic, not
sourced outturns.

## 1. Does SPK CN 2026 price by structural system or span? — No

Checked the official ZIP (all docx/xlsx/xml of appendices 1–7 and the main XML) for *rozpět, oblouk, letm,
výsuv, spřaž, zavěš, prefabrik, nosník, předpj, ocelov*: **one hit only**, in appendix 1 §A.2 list of what the
bridge standard does **not** contain:

> „náklady na speciální technologie výstavby (např. mosty obloukové apod.)“

(also excluded: „náklady z titulu omezení výstavby (např. nepřístupnost prostoru pod mostem z důvodu ochrany
přírody apod.)“). The same §A.2 says the standard **does** contain „náklady na montážní zařízení, skruže atd.“
— i.e. falsework/erection equipment of an ordinary bridge is inside the per-km price, special technology is
not. Appendix 5 bridge sheets carry exactly two attributes for every `A.2.*` row: *výška spodní stavby*
(8 → 35 m, +0.30) and *šířka NK* (standard −1 m … +3 m; S9.5 −9.4 % / +28.2 %, research/16). No span,
system or technology attribute. The only per-system rows are **přesypané mosty** (buried frames/vaults) and **biomosty**, both
**48,235.18 CZK/m² of plan area** (appendix 3, rows `A.2.P.N`, `A.2.B.N`), and footbridges.

OTSKP 2026 is also technology-agnostic: concrete items include „podpěrné konstr. (skruže) a lešení všech
druhů“ (appendix 1), so one m³ of box girder costs the same whether cast on falsework, a movable scaffolding
system (MSS), launched or cast in balanced cantilever. Only material/section differs:

| OTSKP 2026 | Item | CZK/unit |
|---|---|---:|
| 421325 / 421335 | RC / PT slab superstructure C30/37 | 13,417.90 / 16,295.90 per m³ |
| 422335 | PT beam (T, two-girder) superstructure | 17,952.09 per m³ |
| 42333 / 423335 | PT box superstructure (C30/37) | 19,883.43 / 22,703.78 per m³ |
| 42413 / 424135 | precast PT bridge beams, supplied + placed | 41,624.09 per m³ |
| 42417 / 42417B | steel bridge girders (S355) | 120,124.26 / 117,600.60 per t |
| 422411–417, 423411–417 | stay cables of beam/box bridges, by strand count | 2,199.66 – 11,051.58 per m |

The only **span-banded** row in either database is OTSKP **424A1x „Spřažená mostovka beton–beton silniční“**
(precast beams + composite RC slab + end diaphragms incl. all rebar, per m²):

| span ≤10 | ≤15 | ≤20 | ≤25 | ≤30 | ≤35 | >35 m |
|---:|---:|---:|---:|---:|---:|---:|
| 15,442 | 17,408 | 18,259 | 20,216 | 21,526 | 23,449 | 25,352 CZK/m² |

Cross-check: our provisional deck term at 30 m, `v(30)·Udeck = 0.65 × 29,266 ≈ 19.0k CZK/m²`, is 12 % below
424A15 (21.5k). Superstructure only; substructure, bearings, equipment extra.

## 2. Bridge types usable on Czech roads

Depth = structural depth / span. "Falsework" = ground-supported scaffolding (pevná skruž).

### (a) Slab bridges (deskové), short spans
- **Spans:** RC slab single span to ~15 m, continuous/frame to ~35 m (Stavarna course notes); PT continuous
  slab max ~40 m (Suchánek tab. 15). Precast slab beams KA-61/KA-73 (1962–1990), 9–21 m (ŠMT 2025 sborník).
- **Depth:** RC single span L/10–L/15, continuous L/13–L/18; PT L/16–L/20 and L/18–L/25 (Suchánek tab. 5).
- **Construction:** falsework from the ground (CTU BM01 př. 11: "základní metoda… malých a středních
  rozpětí"); fixed falsework only to ~100 m bridge length and 10–15 m height (Suchánek). Precast slab beams by
  crane, no falsework.
- **Cost:** inside SPK standard; per-m² dominated by the two abutments (model: one 30 m S9.5 span +15 % per m
  vs. SPK row, research/16). Buried frames: SPK 48,235 CZK/m² plan area.
- **Piers:** many; spans ≤ ~20 m.

### (b) Precast beam bridges (prefabrikované nosníky + spřažená deska)
| Family | Span (source) | Depth |
|---|---|---|
| KA-61 / KA-73 / I-73 (1962–96) | 9–21 m (KA-61), I-73 from MPD 5/6 (≤30 m) | slab of beams |
| T93 (SSŽ/SMP/Pontex) | 12–27 m (asb 2009); typové spans 11.2–23.2 m | beam 0.55–0.95 + slab 0.22 m → **L/20** at 23.2 m |
| Petra | 24–36 m (asb 2009); 24–30 m, experimental ~40 m (patent CZ308615) | lightened web |
| MK-T (ZPSV) | beams 15–32 m; one piece to ~36 m, longer in 2–3 parts | |
| DPS VP-T 07 (Doprastav) | 33–42 m | hybrid prestress |
| KSP-NDPP / NDPO / NPP | 12–24 / 21–33 / ≤32 m | 0.6–1.2 / 1.2–1.6 m beam |

Post-tensioned beams typically ≤45 m long, pretensioned ≤20 m (CTU BM01 př. 8). Construction: crane
erection, "rychlá výstavba bez omezení podjezdné výšky", no falsework (asb 2009) → suits crossings of
roads/rail; hauling and crane reach limit length/height (not quantified in sources). Cost: OTSKP 424A1x above;
D8 Vchynice (6 equal spans, precast) is the only Czech outturn found and it is contaminated by a 192 m steel
noise tube (table §3). Piers: one per 20–36 m.

### (c) Cast-in-place continuous PT slab/two-girder/box, falsework or MSS (30–60 m)
- **Spans:** MSS whole-span casting optimal 30–60 m, segmental MSS 60–100 m (Suchánek); 30–70 m, limit
  80–90 m (Paulík, SK). Czech: D1 Hvězdonice first MSS, 54 m two-girder (Vítek, Beton TKS 4/2008); D35
  Opatovice 32 + 18×45 + 32 m = 874 m two-girder on underslung MSS, ~12 days per span (Freyssinet); D8
  Prackovice 36 + 9×48 + 36 / 36 + 11×48 + 36 m (technology not verified); Plzeň Křimická ~33 m, 2×~510 m.
- **Depth:** II/268 Jizera two-girder 1.70–1.97 m at 30 m (**L/15–L/18**), haunched box 2.8 m at the 60 m
  span; Křimická 1.6 m at 33 m (L/21).
- **Construction:** fixed falsework needs ground access, ≤10–15 m height; MSS rides on the permanent piers,
  "bez zásahu do terénu pod mostem" (CTU př. 11), suits long bridges of many equal spans and constant width
  ("pro dlouhé mosty (stovky metrů)"). Short obstacles can be bridged
  by hanging falsework from a cantilever (II/268: 12 m over the Jizera). Suchánek's wording for MSS is
  „hospodárná pro mosty velkých rozpětí (více jak 400 m)“ — ambiguous, read as bridge length.
- **Cost:** II/268 268-007 (S9.5 class width 9.5 m, 312 m, spans 6×30 + 60 + 2×30, ≤8.85 m high, fixed
  falsework): award 2022 **143.6 M → 157.4 M (2025)**, **43.3k CZK/m²** of NK, including demolition of the old
  bridge, traffic measures and approach repairs. SPK S9.5 × 0.312 km = 180.9 M → **0.87× SPK** even with that
  extra scope. Best Czech evidence that the current 30 m reference is not under-priced.
- **Piers:** one per 30–60 m.

### (d) Incrementally launched box (výsuvná technologie / postupný výsuv)
- **Spans:** typically 35–60 m; temporary supports or a steel launching nose for longer.
  Římov 35 + 4×45 + 35 m, depth 3.0 m (**L/15**), first Czech launch without temporary piers; D8 Rybný potok
  34 + 48 + 54 + 3×58 + 44 m, one 31.1 m deck for both directions, piers to 47 m, 19,000 t launched (CTU
  př. 11, SHP); D35 Janov–Opatovec SO 205, 438.65/434.15 m with a 140 t steel nose, takt 10–14 days.
  Fáblovka (cable-stayed) launched in 32 m takts over temporary concrete supports.
- **Constraints:** straight or constant-curvature plan (CTU př. 11), constant depth, casting yard behind an
  abutment; extra centric launching prestress. "Volí se tam, kde je možné vybudovat větší množství pilířů …
  pravidelná geometrie" (Valbek interview). No access needed below → over valleys, roads, rail, water.
- **Cost:** no isolated Czech price. D8 Dobkovičky (10-span PT box, 454.7 m, two decks; technology not
  verified) tender 2007: 610.5 M ex VAT/reserve → **940 M (2025) = 1.38× SPK D27.5 standard**; height not
  verified, so height-adjusted ratio unknown (≈1.2 if ~20 m).
- **Piers:** one per 35–60 m.

### (e) Balanced cantilever box (letmá betonáž)
- **Spans:** "typické rozpětí mezi 80 a 250 m", segments 3–5 m, ≤250 t (CTU př. 11); box girders 40–300 m,
  haunches above ~70 m (Suchánek). Czech: D35 Labe 45 + 80 + 45 m (8-day segments); Plzeň Křimická 85 m;
  I/7 Hačky 60 + 116 + 66 + 50 + 40 m, 62 m high, pier walls 42.8–46.6 m; D11 Líčná 60 + 85 + 4×120 + 85 m;
  D11 Poříčí 94 + 151 + 151 + 141 + 94 + 65 = 696 m; Zvíkov 48 + 2×84 + 48 m (hinge at midspan).
- **Depth (haunched):** Poříčí 7.5 m at pier / 3.5 m in span at 151 m (**L/20 / L/43**); Líčná 6 / 3 m at
  120 m (L/20 / L/40); Křimická 5 / 2.1 m at 85 m (L/17 / L/40); Valbek 230 m study 12 / 5 m (L/19 / L/46).
- **Side spans** 0.56–0.71 × main (45/80, 94/151, 85/120, 60/116) → minimum bridge ≈ 2.1–2.4 × main span.
- **Constraints:** no falsework; "hluboká údolí, vodní toky, místa zástavby" (Valbek); drawback "cena …
  předpínací výztuž … je více než u mostů realizovaných běžnou technologií" (Valbek, Matoušek).
- **Cost:** no isolated Czech outturn found (Poříčí/Líčná sit inside the 11.7 bn D11 Trutnov – state border
  contract).
- **Piers:** one per 80–150 m, but tall and massive (twin walls).

### (f) Arches
- **Spans (Czech):** concrete — Opárno 135 m (2×, D8), Podolsko 150 m (I/29, 1943), Schwarzenberský 156 m
  (rail, 2024), Plasy 180 m (I/27, building), D3 Sázava 251 m (planned, 113 m high, 787 m); steel — Napajedla
  115 m tied Langer (D55, rise ~20 m = L/5.8), Trojský 200.4 m network arch (rise 20 m = L/10), Žďákovský 380 m
  (1967). Deck on the arch: Opárno 13 spans 17.5–24 m; Plasy 14 spans 25–32 m.
- **Construction:** concrete arches built by cantilevering with backstays/temporary pylons (Opárno,
  Schwarzenberský: "bez zásahu do prostoru údolí"); steel tied arches launched (Napajedla, two temporary
  supports in the river). Need stiff abutments for the thrust ("tuhé podepření", Suchánek); tied arches carry
  thrust in the deck.
- **When used:** Suchánek: arches 30–200 m are "not economical" vs beams (falsework). Czech practice chooses them
  for deep protected valleys (Opárno: design "vyplynul z požadavku na ochranu biotopu"), reservoirs and
  floodplains where no pier may stand (Napajedla: piers out of the Morava channel). SPK excludes them.
- **Cost:** Opárno tender 2007 509.0 M incl. 19 % VAT + 10 % reserve → **388.9 M ex → 598.8 M (2025)**,
  **76.7k CZK/m²**, 1.46× SPK D27.5 standard, **0.99× SPK with its height attribute extrapolated to 50 m**.
  Plasy 2025 contract **571.3 M, 72.0k CZK/m²** (16 m deck incl. 3 m footway), 1.55× SPK S9.5 (+28.2 % width
  attribute), **0.82× SPK height-extrapolated to 87 m**.

### (g) Steel / steel–concrete composite (spřažené ocelobetonové)
- **Spans:** D8 border bridge 58.4 + 4×73 + 58.4 m, steel box + RC slab, depth 3.65 m (**L/20**), 56 m high,
  launched (Pontex, FIRESTA); D0 Lochkov 70 + 79.85 + 99.3 + 93.85 + 80.5 m strut frame (157.1 m between
  strut feet), box 4.8 m (L/21), 65 m high, launched over two temporary piers; D1 Vysočina max ~134 m
  (mapy.cz), steel boxes, first large free-cantilever erection (Metrostav), 70 m.
- **Steel quantity (derived):** D8 border 3,485 t / 13,201 m² = **264 kg/m²**; Lochkov 4,700 t /
  (425.3 × 35.2) = **314 kg/m²** + 5,700 m³ slab (0.38 m³/m²); Napajedla 1,700 t / (115 × 31.2) = **474 kg/m²**
  (tied arch). At OTSKP 120k CZK/t that is 32–38k CZK/m² (girders) and 57k CZK/m² (arch) for steel alone.
- **Constraints:** light → smaller foundations, launch or crane, good over roads/rail; price follows steel
  market: Fáblovka's tender design had a steel main span but "kvůli vysoké ceně oceli … ocelové konstrukce
  nebyly konkurenceschopné" (Vítek, ČKAIT 2025).
- **Cost:** D8 border bridge 687 M "Czech share" (date and scope unclear) — not usable per m².

### (h) Cable-stayed / extradosed
- **Spans (Czech):** Jordán Tábor 111 m (1991), Poděbrady 123 m (1990), Mariánský Ústí 124 m (329 m long),
  D1 (ex-D47) Odra 105 m in a 605.6 m bridge (depth 2.2 m = **L/48**, pylon 48 m), Fáblovka 122 + 135 m
  (largest CZ). No Czech extradosed road bridge cost found.
- **Construction:** Fáblovka: PT box launched on temporary supports, then 7 stays (single pylon, 48 m above deck);
  stays let a pier-free river span at low height.
- **Cost:** Fáblovka (I/36, 279.6 m, NK 259.5 × 27.4 m, 14 m high, D&B, opened 2025): **85k CZK/m² excl. VAT**
  (ČKAIT; the designer calls ~80k "všeobecně nízké"). Implied ≈ 604 M; 1.87× SPK S20.75 standard
  (1.75× after the 14 m height attribute). Trojský "about double" per m² (designer).

## 3. Czech examples

`SPK×` = cost ÷ (SPK CN 2026 standard row × bridge length), both ≈2025 prices; `SPK×h` additionally divides by
SPK's height attribute `1 + 0.3 (H − 8)/27`, extrapolated beyond 35 m as the SPK methodology allows. n/v = not
verified / not found. CZK/m² uses the deck area stated (or length × stated width).

| # | Bridge (road) | Length m | Max span m | Height m | Type / technology | Cost (source basis) | CZK/m² (2025) | SPK× / SPK×h |
|---|---|---:|---:|---:|---|---|---:|---|
| 1 | 268-007 Jizera (II/268) | 312 | 60.1 (else 30) | 8.85 | CIP PT two-girder + box, fixed falsework | 143.6 M award 2022, incl. demolition + approaches | 43.3k | 0.87 / 0.86 |
| 2 | Vchynice (D8) | 242.8 | 6 equal spans (n/v) | 23.4 incl. tube | precast PT beams + composite slab | 410.6 M (2007 tender ex VAT/reserve) incl. 192 m noise tube + 840 m road III | 81.0k | 1.74 / n/a |
| 3 | Opárno (D8) | 273–275 | 135 arch | 50 | RC arch, cantilevered with backstays; 2 decks | 388.9 M (2007) | 76.7k | 1.46 / 0.99 |
| 4 | Dobkovičky (D8) | 454.7 | ~45 (10 spans) | n/v | PT box, 2 decks | 610.5 M (2007) | n/v (width) | 1.38 / n/v |
| 5 | Prackovice (D8) | 458 / 554 | 48 | ≤26.2 | continuous PT, 2 decks | n/v | — | — |
| 6 | Rybný potok (D8) | 356 | 58 | piers ≤47–49 | launched PT box, one 31.1 m deck | n/v | — | — |
| 7 | Border bridge (D8) | 430 | 73 | 56 | steel box composite, launched | 687 M Czech share, year n/v | — | — |
| 8 | Lochkov (D0) | 425.3 | 99.3 (157 strut) | 65 | composite steel box strut frame, launched | n/v | — | — |
| 9 | Vysočina (D1) | 425 | ~134 | 70 / 77.5 | steel boxes, free cantilever erection (1978) | — | — | — |
| 10 | Poříčí (D11) | 696 | 151 | n/v | balanced cantilever PT box, 7.5/3.5 m deep | inside 11.7 bn section | — | — |
| 11 | Líčná (D11) | 710 | 120 | n/v | balanced cantilever PT box, 6/3 m, 12.6 m decks | inside section | — | — |
| 12 | Labe Opatovice (D35) | 874 + 170 | 45 / 80 | 17.3 over bed | MSS two-girder + cantilever box | inside section | — | — |
| 13 | Janov–Opatovec SO 205 (D35) | 438.65 / 434.15 | n/v | 13.8 local | launched PT, steel nose | inside section | — | — |
| 14 | Hačky (I/7) | 336 | 116 | 62 | balanced cantilever box (3 spans) + fixed falsework (2 spans) | n/v | — | — |
| 15 | Odra Bohumín (D1, ex-D47) | 605.6 | 105 | low | cable-stayed, depth 2.2 m | n/v | — | — |
| 16 | Fáblovka (I/36 Pardubice) | 279.6 | 135 | 14.05 | cable-stayed, launched PT box | 85k/m² stated (≈604 M implied), 2025 | 85k | 1.87 / 1.75 |
| 17 | Napajedla (D55) | span 115, 31.2 wide | 115 | ~10 embankment | steel tied (Langer) arch, launched | 674.4 M contract for the whole 495 m section | ≤188k (bound) | — |
| 18 | Plasy, Střela (I/27) | 496 | 180 arch | 87.3 | RC arch + PT deck on columns | 571.3 M contract 2025 | 72.0k | 1.55 / 0.82 |
| 19 | Trojský (Prague) | 262 | 200.4 | — | steel network arch, road + tram | ≈1.5 bn (≈0.5 + ≈1 bn) 2014, VAT/scope n/v | ≈158k nominal | outlier |
| 20 | Dvorecký (Prague) | 337 | 87 | — | haunched PT box, 16 m | ≈1.45 bn excl. VAT whole project (bridgeheads, cycle bridge, info centre, art) | ≤269k | outlier |
| 21 | Suchdol (D0 519, planned) | 606 | n/v | ~80 | competition design (Stráský, Hustý a p. + Studio acht), type n/v | 3.5 bn estimate | — | 3.2 / 1.8 (D33.5) |
| 22 | Žďákovský (I/19) | 543 | 380 arch | 50 over water | steel two-hinged arch (1967) | 71 M Kčs | — | historical |
| 23 | Podolský (I/29) | 510 | 150 arch | — | RC arch (1943) | — | — | — |
| 24 | Schwarzenberský, Červená (rail) | 316.3 | 156 arch | 35 over water | RC arch, cantilevered; 6.4 m wide | n/v | — | — |
| 25 | Mariánský, Ústí (city) | 329 | 124 | — | cable-stayed (1998) | n/v | — | — |

Reading the costed rows: **ordinary 30 m falsework bridge ≈ 0.9× SPK; tall long-span valley bridges
(arches, boxes, 45–180 m spans, 50–87 m high) ≈ 0.8–1.0× SPK-with-height (1.4–1.6× SPK standard);
cable-stayed at low height ≈ 1.75–1.9×; urban signature bridges 2.5–4×+.** n is tiny (5 clean-ish costed new
builds); treat as order-of-magnitude.

**International shape check (low weight).** CTU poster (SMA2, Michell 2014 US data × 0.9) gives deck price vs
main span (read off the figure, ±10k CZK/m²): girder ≈ 30k at 0 m, ≈ 46k at 30 m, ≈ 85k at 100 m, ≈ 140k at
200 m; arch with deck on top ≈ 70k at 0, ≈ 130k at 200 m; cable-stayed ≈ 120k at 50 m, ≈ 140k at 200 m.
Text: "do cca 100 m … trámový most, pro 100–300 m obloukový či příhradový, pro 300–600 m zavěšený".
Czech outturns show **smaller** long-span premiums than this US-derived curve (Fáblovka 85k at 135 m vs ≈130k).

## 4. What the current model does with long spans

`npx tsx` sensitivity of the existing `bridgeModel` (S9.5, uniform 300 m run, k CZK per metre, before surcharge):

| span | h = 10 | 20 | 40 | 60 | 80 m |
|---:|---:|---:|---:|---:|---:|
| 30 | 566 | 644 | 798 | 953 | 1107 |
| 43 | 603 | 654 | **757** | **860** | 963 |
| 60 | 699 | 730 | 798 | 867 | **936** |
| 100 | 953 | 965 | 1000 | 1034 | 1069 |
| 150 | 1289 | 1293 | 1310 | 1328 | 1345 |

The cheapest span moves to 43–60 m at 40–80 m height, matching Czech practice for tall viaducts (45–73 m:
Dobkovičky, Prackovice, Rybný potok, D8 border). But 100–150 m spans cost **1.2–1.6×** the model's own 30 m-span
price at 40–80 m height (1.7–2.3× at 10 m), whereas the costed Czech long-span valley bridges (arches Opárno
135 m, Plasy 180 m) sit at 0.8–1.0× SPK-with-height, i.e. ≈ that 30 m-span price; low-height cable-stayed
Fáblovka is 1.75×. The provisional `v(s) = 0.85 + 0.025 (s − 40)` m³/m² above 40 m is the cause: at 45 m it gives
0.975 vs 0.75 m³/m² for a real 45 m cast-in-place box (PCI Journal 2026, Nasr et al., tab. 3; also 38.5 kg/m²
PT and 160 kg/m² rebar, close to the model's ratios). **No source found** for box-girder equivalent thickness
at 100–150 m; do not tune v(s) to the outturns without one.

## 5. Game implications

Proposal: one "Bridge style" choice per bridge run (Auto picks), 4 options. **Cost factor** = multiplier on
the current model price for the same run and heights, computed with the style's span. It is a calibration
target from §3, not a sourced coefficient.

| Style (player word) | Span | Depth | Cost factor vs current model | Confidence | Visual | Suits |
|---|---|---|---|---|---|---|
| **Short spans** (default; precast / falsework / MSS) | 20–35 m (precast ≤36, MSS to ~50) | L/15–L/20 (≈1.5–2 m) | **1.00** | high (SPK-calibrated; II/268 0.87× SPK incl. extras) | many slender piers, thin deck | low bridges (≤ ~20 m), floodplains, long viaducts, ordinary road/rail crossings |
| **Long spans** (launched or cantilevered box, or steel composite) | 45–150 m; launched 35–60 (straight or constant curve only); cantilever 60–150 (side spans 0.6–0.7× main) | constant L/15–L/20 (launched/steel); haunched L/17–L/20 at pier, L/40–L/45 mid | 35–60 m: **1.00 on the model run with the style's span** (it already gives 0.85–1.0× of the 30 m price at h = 40–80 m and 1.02–1.23× at 10–20 m). >60 m: target **≈1.0–1.2× the 30 m-span price at h ≥ 40 m** (Czech long-span outturns ≈ SPK-with-height); the model's v(s) overshoots by 1.2–1.6× there (§4), so cap rather than multiply. No Czech outturn at low height | low–medium | few tall piers, deep (haunched) box | deep valleys (≥ 30–40 m), rivers/rail/roads with no supports during construction |
| **Arch** | arch 100–250 m + 17–35 m approach spans on columns; rise ≈ L/5–L/10 | deck as short spans; arch rib | **≈1.0 (0.8–1.2)** of the model's 30 m-span viaduct at the same max height (Opárno 0.99, Plasy 0.82 × SPK-with-height) | low (n=2) | arch springing from the valley sides, short columns, no tall piers | narrow deep valleys with rock flanks, protected valley floors, reservoirs; needs valley width ≈ 1.8–2.8× arch span (Opárno 273/135, Plasy 496/180, Červená 316/156) |
| **Cable-stayed** | main span 100–150 m (CZ 105–135), 1 pylon | box ≈ L/50 | **≈1.75–1.9** vs SPK-with-height (Fáblovka); i.e. ≈1.7 of a 30 m-span model bridge at low height | low (n=1) | one pylon (48 m at 105 and 135 m spans → ≈0.35–0.45× main span), stays, thin deck | rivers/floodplains where no pier may stand in the channel at low height (Labe, Odra) |

Notes for implementation:
- Precast vs MSS vs falsework need not be separate player choices: same price class (SPK standard covers
  „skruže“), same visual (span 25–35 m). Launching vs cantilever vs steel composite likewise merge into "Long
  spans"; their constraints (launching: straight or constant curvature, constant grade curvature) could become
  rules Auto respects.
- The trade the owner wants exists in the evidence: at 40–80 m height, going from 30 m to 45–60 m spans saves
  5–15 % in the current model and is what Czech designers built. Beyond ~60 m spans, arches/cantilevers are
  chosen for access/protection (SPK §A.2 exclusions: special technology, inaccessible space below), not
  because the per-metre price drops.
- SPK's height attribute already contains most of the long-span premium for tall valley bridges (§3).
  A style factor must not add it again.
- Gaps: no isolated Czech outturn for a launched or cantilevered box; Dobkovičky width/height not verified;
  no source for long-span deck equivalent thickness; Michell chart values are read off a figure.

## Sources

- SFDI SPK CN 2026 ZIP, appendices 1 (§A.2), 3, 5: https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip
- SFDI OTSKP 2026 ZIP, items + appendix 1: https://sfdi.gov.cz/wp-content/uploads/2026/04/otskp-2.zip
- ČSÚ Cenová statistika stavebnictví 2004–2025, tab. 8 (CZ-CC 2141): https://csu.gov.cz/docs/107508/d12e70bf-70a1-0a98-d6d3-6af4b9f3c0ba/0110002608.xlsx?version=1.0
- Suchánek, Betonové mosty II (UPa): https://vladimirsuchanek.upce.cz/files/Betonove_mosty_2.pdf
- Drahorád, CTU BM01 př. 11 (výstavba) a 8 (prefabrikace): https://concrete.fsv.cvut.cz/~drahomic/Vyuka/BM01/Prednasky/BM01_Pr11.pdf , …/BM01_Pr08.pdf
- T93 table: https://concrete.fsv.cvut.cz/~drahomic/Pomucky/Prefa/T93.pdf ; asb 2009 (T93/Petra/VP-T 07 spans): https://www.asb-portal.cz/stavebnictvi/inzenyrske-stavby/mosty/prefabrikace-nosnych-konstrukci-mostu-umoznuje-zrychleni-vystavby ; ZPSV MK-T: https://www.zpsv.cz/mostni-konstrukce-a-propustky/mostni-prvky/zakazkova-vyroba-mostnich-nosniku-mk-t-petra/ ; KS Prefa: https://ksprefa.cz/produkty/dopravni-stavby/mostni-nosniky/ ; patent CZ308615: https://patents.google.com/patent/CZ308615B6/cs ; ŠMT 2025 (KA-61): https://www.divypbrno.cz/download/sbornik/komplet_SMT2025_online_200dpi.pdf
- Stavarna course notes: https://www.stavarna.com/download2/2299_2478_cs_mosty.pdf ; Paulík (SK MSS spans): https://www.proponti.sk/files/Peter_Paulik_Skruze.pdf (search-index snippet only)
- CTU SMA2 poster (Michell 2014 chart): https://mech.fsv.cvut.cz/homeworks/student/SMA2/C3-nosneKce-reduced.pdf
- Vítek, Betonové mosty, Beton TKS 4/2008: https://www.ebeton.cz/wp-content/uploads/2008-4-03_0.pdf
- Valbek interview (Matoušek): https://www.valbekstory.com/clanky/detail-clanky/r/ondrej-matousek-letmo-betonovane-konstrukce-maji-budoucnost-a-sve-misto-tam-kam-zapadaji
- II/268 PDPS + award: see research/16-czech-observations.md (award procedure started 06.05.2022)
- D8 0805 tender split (Vchynice/Opárno/Dobkovičky, incl. 10 % reserve + 19 % VAT): https://oziveni.cz/wp-content/uploads/2010/01/cenadalnic_cast5_d8_d11.pdf ; ŘSD leaflet: https://apdos-v2.creativesound.cz/media/stavba/122/leaflet/infoletak_d8-lovosice-rehlovice.pdf ; Vchynice: http://old.silnice-zeleznice.cz/stavby/stavba/dalnicni-most-na-d8-u-obce-vchynice/?stavba=122 ; Dobkovičky: https://de8.cz/D8/turistika/d8-061.htm ; Opárno deck spans: https://www.technickytydenik.cz/rubriky/archiv/konci-zakladni-stavba-unikatniho-mostu-oparno_16726.html (snippet)
- D8 border bridge: https://www.firesta.cz/silnicni-mosty/most-hranicni ; Rybný potok: https://www.shp.eu/projekty/most-pres-rybny-potok/39 ; Prackovice spans: https://www.dalnice-silnice.cz/D8.htm
- Lochkov: https://cs.wikipedia.org/wiki/Lochkovsk%C3%BD_most , https://www.shp.eu/projekty/most-pres-lochkovske-udoli/100
- D11 Poříčí, Líčná: https://konstrukce.cz/realizace-staveb/mosty-pres-porici-a-udoli-reky-licne-patri-k-nejvyznamnejsim-stavbam-vznikajicim-na-d11-1804
- D35 Labe: https://www.freyssinet.cz/273-dalnice_d35_opatovice-casy_estakada_pres_inundacni_uzemi_labe.html ; Janov: https://silnice-zeleznice.cz/silnice/d35-janov-opatovec-vyuziti-technologie-tzv-vysuvneho-nosu-neomezuje-pri-stavbe-dopravu-1005
- Hačky: https://www.casopisstavebnictvi.cz/clanky-letmo-betonovany-most-pres-udoli-hacky-na-silnici-i7-u-chomutova.html
- Odra D47: http://old.silnice-zeleznice.cz/clanek/most-pres-odru-je-dopravni-stavbou-roku/
- Fáblovka: https://cik.ckait.cz/2025/zaveseny-most-pres-labe-u-fablovky-v-pardubicich/ , https://silnice-zeleznice.cz/silnice/blizime-se-do-finale-stavby-nejvetsiho-lanoveho-mostu-v-cechach-1063
- Napajedla: https://www.rsd.cz/-/%C5%98editelstv%C3%AD-silnic-a-d%C3%A1lnic-otev%C5%99elo-nov%C3%BD-most-na-d55-u-napajedel , https://silnice-zeleznice.cz/silnice/most-na-d55-pres-reku-moravu-se-stane-dominantou-napajedel-barevnym-odstinem-se-inspiroval-u-golden-gate-bridge-1109
- Plasy: https://www.vinci-construction.cz/blog/zacina-stavba-nejvyssiho-silnicniho-mostu-v-cesku , https://www.seznamzpravy.cz/clanek/ekonomika-firmy-zacina-stavba-rekordniho-mostu-vyska-87-metru-cena-pres-pul-miliardy-276283 ; contract 571,285,524 CZK excl. VAT: ŘSD press release (search-index text) https://www.rsd.cz/web/guest/-/%C5%98editelstv%C3%AD-silnic-a-d%C3%A1lnic-za%C4%8Dalo-stav%C4%9Bt-nejvy%C5%A1%C5%A1%C3%AD-silni%C4%8Dn%C3%AD-most-v-%C4%8Cr
- Trojský: https://ct24.ceskatelevize.cz/clanek/domaci/pokuta-za-trojsky-most-plati-praha-zaplati-11-milionu-za-to-ze-most-je-jiny-nez-mel-byt-69535 ; Dvorecký: Beton TKS 2025 yearbook https://www.ebeton.cz/wp-content/uploads/2025-beton.pdf
- Suchdol: https://zdopravy.cz/po-roce-finalne-rozhodnuto-prazsky-okruh-prevede-pres-vltavu-drazsi-ale-odvaznejsi-navrh-mostu-282691/ ; D3 Sázava: https://www.dalniced3.cz/novinky/z-tisku/most-sazava-podrobny-geotechnicky-pruzkum-pro-budouci-nejvyssi-dalnicni-most-v-cesku
- Schwarzenberský: https://cik.ckait.cz/2024/zeleznicni-most-cervena-nad-vltavou/ ; Podolský: https://ct24.ceskatelevize.cz/clanek/regiony/podolsky-most-spojuje-brehy-vltavy-od-roku-1942-byl-strategickou-spojnici-zazil-i-valecna-zverstva-90875 ; Mariánský: https://cs.wikipedia.org/wiki/Mari%C3%A1nsk%C3%BD_most ; Vysočina span: https://mapy.com/cs/?source=base&id=1718225 ; Žďákovský: research/16-extra-observations.md
- PCI Journal 2026 (45 m box quantities): https://www.pci.org/Common/Uploaded%20files/PCI/Publications/PCI%20Journal/2026/November-December/26-0011_Nasr_ND26.pdf
