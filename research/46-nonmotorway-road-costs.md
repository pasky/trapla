# What non-motorway roads really cost in Czechia (2026-11-16)

This note checks the game's prices for class I–III roads. It covers real Czech per-km prices, what the SFDI
SPK CN 2026 road norm contains, and where a model that adds the norm, the "other objects" surcharge, earthworks
billed separately, bridges and land could count something twice. It extends `05-costs.md` (motorways only),
`13-crossing-items-tenders.md`, `24-nova-paka-scenario.md` and `30-road-reconstruction.md`, and does not
repeat them. All prices are in CZK **excluding VAT** unless marked otherwise. "M" means million CZK.

**Price level.** Contract prices are nominal for the year the contract was signed or work started. The
"2026 level" column escalates them with the index table that SPK CN itself says to use for older costs
(ČSÚ CZ-CC "Inženýrská díla", cumulative to 2026, průvodní zpráva p. 4). The multipliers are 2014 ×1.734,
2015 ×1.727, 2016 ×1.703, 2017 ×1.685, 2018 ×1.660, 2019 ×1.610, 2020 ×1.538, 2021 ×1.483, 2022 ×1.348,
2023 ×1.185, 2024 ×1.056 and 2025 ×1.019. The escalation is mechanical. It ignores how the valorisation was
actually settled and any change orders.

**Scope of an ŘSD "cena stavby dle smlouvy".** It is the construction contract price. It does not include
land purchase, the design stages before the tender (DÚR/DSP/PDPS), or rescue archaeology, which ŘSD leaflets
show as separate contracts (e.g. I/45 Bruntál: "V 06/2024 byla uzavřena smlouva provedení zemních prácí pro ZAV
a v 07/2024 na samotný ZAV"). It does include the contractor's preliminaries, the construction design where it
is specified, and every SO: affected roads, utility relocations, noise walls and the rest.

## 1. Real projects

### 1a. New class I bypasses and relocations (ŘSD)

**Source.** Every row is an official ŘSD project leaflet ("informační leták"). The leaflets were found through
ŘSD's project map export (`https://apdos-v2.creativesound.cz/static/stavby-linestring-v2025.json`, 603
projects, exported 2026-05-05). All 151 class-I leaflets marked "in operation" or "under construction" were
downloaded on 2026-11-16 and their data blocks parsed.

**What the columns mean.**
- **km** is the leaflet's "délka" of the main route.
- **Bridges** is the total bridge length on the route. "n/s" means the leaflet does not give it.
- **Terrain** is *my* reading of the leaflet text and geography: flat, rolling or hilly. It is not ŘSD's
  classification (confidence medium).
- **Cut / fill** comes from the leaflet's "výkopy / násypy", in 1,000 m³ per km.
- **Price** is the "cena stavby dle smlouvy". **Year** is the contract or start year from the leaflet text.
- Every row is a two-lane rural road, with land and design not included.

| Project (leaflet) | km | Category | Bridges m | Terrain | Cut / fill k m³/km | Contract M | Year | M/km nominal | M/km 2026 level |
|---|---:|---|---:|---|---|---:|---:|---:|---:|
| [I/11 Postřelmov–Chromeč](https://letaky.rsd.cz/media/stavba/127/leaflet/infoletak_s11-postrelmov-chromec.pdf) | 4.03 | S 9,5/80 | n/s | rolling | – | 317.6 | 2022 | 79 | 106 |
| [I/11 Opava, sev. obchvat – západ](https://letaky.rsd.cz/media/stavba/129/leaflet/infoletak_s11-opava-sev-obchvat-zapad.pdf) | 5.13 | S 11,5/80 | 951 | flat (urban edge, MÚK) | – | 994.2 | 2020 | 194 | 298 |
| [I/11 Doudleby n. O. – obchvat](https://letaky.rsd.cz/media/stavba/132/leaflet/infoletak_s11-doudleby-obchvat.pdf) | 2.78 | S 11,5/90 | n/s | rolling | – | 147.8 | 2021 | 53 | 79 |
| [I/13 Rynoltice–Lvová](https://letaky.rsd.cz/media/stavba/144/leaflet/infoletak_s13-rynoltice-lvova.pdf) | 2.36 | S 13,5/90 (2+1) | 142 | hilly / mountain foothill | – | 624.5 | 2026 | 265 | 265 |
| [I/14 Kunratice–Jablonec](https://letaky.rsd.cz/media/stavba/158/leaflet/infoletak_s14-kunratice-jablonec.pdf) | 2.51 | S 11,5/70 | 161 | hilly | 83 / 29 | 296.5 | 2016 | 118 | 201 |
| [I/15 Kravaře – obchvat](https://letaky.rsd.cz/media/stavba/168/leaflet/infoletak_s15-kravare-obchvat.pdf) | 2.71 | S 9,5/70 | 123 | rolling | 48 / 21 | 176.7 | 2017 | 65 | 110 |
| [I/16 Nová Paka – obchvat](https://letaky.rsd.cz/media/stavba/173/leaflet/infoletak_s16-novapaka-obchvat.pdf) | 8.48 | S 11,5/70 | 1020 | hilly | 71 / 59 | 1,308.6 | 2022 | 154 | 208 |
| [I/19 Chýnov](https://letaky.rsd.cz/media/stavba/177/leaflet/infoletak_s19-chynov.pdf) | 3.55 | S 11,5/80 | n/s | rolling | 36 / 41 | 261.6 | 2020 | 74 | 113 |
| [I/19 Kámen – obchvat](https://letaky.rsd.cz/media/stavba/178/leaflet/infoletak_s19-kamen-obchvat.pdf) | 2.41 | S 11,5/70 | 91 | hilly | 35 / 15 | 155.3 | 2018 | 64 | 107 |
| [I/21 Trstěnice–Drmoul](https://letaky.rsd.cz/media/stavba/200/leaflet/infoletak_s21-trstenice-drmoul.pdf) | 5.01 | S 11,5/80 | 246 | rolling | 49 / 34 | 376.0 | 2018 | 75 | 125 |
| [I/26 Staňkov, přeložka](https://letaky.rsd.cz/media/stavba/211/leaflet/infoletak_s26-stankov-prelozka.pdf) | 2.97 | S 11,5/80 | 222 | rolling | 36 / 29 | 165.2 | 2015 | 56 | 96 |
| [I/27 Klatovy, přeložka 1. st.](https://letaky.rsd.cz/media/stavba/217/leaflet/infoletak_s27-klatovy-1-st.pdf) | 7.63 | S 9,5/70 | n/s (8 bridges) | rolling | – | 863.4 | 2021 | 113 | 168 |
| [I/27 Žiželice, obchvat a přemostění](https://letaky.rsd.cz/media/stavba/223/leaflet/infoletak_s27-zizelice-obchvat.pdf) | 2.96 | S 11,5/70 | 380 (1 bridge) | valley crossing, landslide area | – | 820.1 | 2022 | 277 | 373 |
| [I/3 Olbramovice, přeložka](https://letaky.rsd.cz/media/stavba/241/leaflet/infoletak_s3-olbramovice-prelozka-A5.pdf) | 3.42 | S 11,5/80 | 144 | rolling | – | 320.9 | 2021 | 94 | 139 |
| [I/33 Jaroměř, obchvat](https://letaky.rsd.cz/media/stavba/248/leaflet/infoletak_s33-jaromer-obchvat.pdf) | 6.55 | S 11,5/80 | 673 | flat (river plain) | – | 687.8 | 2022 | 105 | 141 |
| [I/34 Lišov–Vranín](https://letaky.rsd.cz/media/stavba/251/leaflet/infoletak_s34-lisov-vranin.pdf) | 9.51 | S 11,5/80 | 232 | rolling | – | 963.9 | 2023 | 101 | 120 |
| [I/34 Rouštany–Pohled](https://letaky.rsd.cz/media/stavba/252/leaflet/infoletak_s34-roustany-pohled.pdf) | 2.89 | S 11,5/70 | 143 | rolling | 53 / 22 | 166.9 | 2017 | 58 | 97 |
| [I/34 Stráž n. N.–Lásenice](https://letaky.rsd.cz/media/stavba/254/leaflet/infoletak_s34-straz-n-n-lasenice.pdf) | 2.65 | S 11,5/90 | 111 | flat | – | 246.8 | 2021 | 93 | 138 |
| [I/36 Sezemice – obchvat](https://letaky.rsd.cz/media/stavba/270/leaflet/infoletak_s36-sezemice-obchvat.pdf) | 6.86 | S 11,5/90 | 289 | flat | – | 838.3 | 2024 | 122 | 129 |
| [I/36 Časy–Holice](https://letaky.rsd.cz/media/stavba/272/leaflet/infoletak_s36-casy-holice.pdf) | 3.44 | S 9,5/70 | 52 | flat | – | 197.8 | 2022 | 58 | 78 |
| [I/37 Sklené n. O., obchvat](https://letaky.rsd.cz/media/stavba/275/leaflet/infoletak_s37-sklene-nad-oslavou-obchvat.pdf) | 2.08 | S 9,5/80 | 94 | rolling | 29 / 27 | 113.8 | 2017 | 55 | 92 |
| [I/37 Osová Bítýška – obchvat](https://letaky.rsd.cz/media/stavba/277/leaflet/infoletak_s37-osova-bityska.pdf) | 2.83 | S 9,5/80 | n/s (1 bridge) | hilly | 25 / 162 | 214.4 | 2019 | 76 | 122 |
| [I/37 Chrudim, I/17–Slatiňany](https://letaky.rsd.cz/media/stavba/278/leaflet/infoletak_s37-chrudim-slatinany.pdf) | 4.56 | S 11,5/80 | 207 | rolling | 22 / 46 | 442.0 | 2019 | 97 | 156 |
| [I/38 Znojmo obchvat II](https://letaky.rsd.cz/media/stavba/285/leaflet/infoletak_s38-znojmo-obchvat-II.pdf) | 3.43 | S 11,5/80 | 275 | rolling | 47 / 61 | 264.2 | 2016 | 77 | 131 |
| [I/38 Havl. Brod JV obchvat](https://letaky.rsd.cz/media/stavba/291/leaflet/infoletak_s38-havlickuv-brod-jv-obchvat.pdf) | 4.12 | S 11,5/70 | 858 (7 bridges) | hilly (Sázava and Šlapanka valley bridges) | – | 1,598.3 | 2019 | 388 | 624 |
| [I/38 Církvice, obchvat](https://letaky.rsd.cz/media/stavba/292/leaflet/infoletak_s38-cirkvice-obchvat.pdf) | 4.17 | S 11,5/80 | 249 | flat | – | 444.8 | 2020 | 107 | 164 |
| [I/43 Hradec n. Sv.–Lačnov](https://letaky.rsd.cz/media/stavba/315/leaflet/infoletak_s43-hradec-lacnov.pdf) | 9.50 | S 11,5/70 | 180 | hilly | – | 786.9 | 2021 | 83 | 123 |
| [I/45 Bruntál – vých. obchvat I](https://letaky.rsd.cz/media/stavba/326/leaflet/infoletak_s45-bruntal-vych-obchvat-1etapa.pdf) | 4.51 | S 9,5/80 | 224 | rolling / hilly ("zvlněný") | – | 827.6 | 2024 | 183 | 194 |
| [I/53 Lechovice, obchvat](https://letaky.rsd.cz/media/stavba/337/leaflet/infoletak_s53-lechovice-obchvat.pdf) | 4.40 | S 11,5/80 | 203 | rolling | 54 / 47 | 270.8 | 2017 | 62 | 104 |
| [I/57 Krnov – SV obchvat](https://letaky.rsd.cz/media/stavba/345/leaflet/infoletak_s57-krnov-sv-obchvat.pdf) | 7.78 | S 11,5/80 + S 9,5/80 | 829 | rolling (high fills) | 10 / 66 | 949.0 | 2017 | 122 | 205 |
| [I/58 Příbor–Skotnice](https://letaky.rsd.cz/media/stavba/352/leaflet/infoletak_s58-pribor-skotnice.pdf) | 2.97 | S 11,5/80 | 245 | rolling (≈ 9 m fills) | 39 / 169 | 439.0 | 2017 | 148 | 249 |
| [I/58 Mošnov – obchvat](https://letaky.rsd.cz/media/stavba/353/leaflet/infoletak_s58-mosnov-obchvat.pdf) | 3.33 | S 11,5/80 | 44 | flat | – | 368.5 | 2022 | 111 | 149 |
| [I/9 Dubá, obchvat](https://letaky.rsd.cz/media/stavba/362/leaflet/infoletak_s9-duba-obchvat.pdf) | 2.92 | S 9,5/70 | 306 | hilly | 44 / 30 | 440.2 | 2014 | 151 | 261 |
| [I/9 Svor](https://letaky.rsd.cz/media/stavba/370/leaflet/infoletak_S9-svor.pdf) | 1.88 | S 9,5/70 | 124 | mountainous | – | 469.2 | 2024 | 250 | 264 |
| [I/27 Přeštice, obchvat](https://letaky.rsd.cz/media/stavba/430/leaflet/infoletak_s27-prestice-obchvat.pdf) | 5.06 | S 11,5/80 | n/s (rail bridge, delta MÚK) | flat | – | 788.4 | 2025 | 156 | 159 |
| [I/16 Slaný–Velvary I + II](https://letaky.rsd.cz/media/stavba/549/leaflet/infoletak_s16-slany-velvary-II-etapa.pdf) | 12.85 | S 9,5/80 | 489 | flat / rolling | – | 746.6 (both stages) | 2017 | 58 | 98 |
| [I/46 Opava, jižní obchvat](https://letaky.rsd.cz/media/stavba/597/leaflet/infoletak_s46-opava-jizni-obchvat-hradecka-olomoucka-A5.pdf) | 2.27 | S 9,5/90 | 48 | flat (urban edge) | – | 381.8 | 2025 | 168 | 172 |

**Statistics of the 37 rows.**
- Nominal: median **101 M/km** (interquartile range, IQR, 69–152).
- At 2026 level: median **139 M/km** (IQR 108–203).
- At 2026 level by terrain:
  - rolling (16 rows): median **117** (79–249);
  - flat (10 rows): median **145** (78–298). The flat rows are recent projects at urban edges with grade-separated
    junctions or rail bridges, so terrain alone does not explain them.
  - hilly (11 rows): median **208** (107–624).

Confidence: high for the leaflet numbers, medium for the terrain labels and the escalation.

**Projects left out of the statistics.**
- I/33 Náchod obchvat, 6.485 km with a tunnel: 3,184.4 M (2025). That is 491 M/km.
- I/20 České Budějovice severní spojka, an urban road: 1,973.5 M for 2.522 km.
- I/16 Jizerní Vtelno, 1.285 km with a cut-and-cover tunnel T 11.5: 662.1 M.
- I/57 Semetín–Bystřička 2. stavba, a four-lane road: 1,706.7 M for 4.4 km
  ([ŘSD](https://kraje.rsd.cz/zlinsky/jak-pokracuje-vystavba-silnice-i-57-semetin-bystricka/)).

**Contract prices against ŘSD's own estimates.** 38 class-I leaflets give both the pre-tender "předpokládaná
cena" and the contract price. The contract is a median **0.80** of the estimate (IQR 0.73–0.86). Bids come in
about 20 % under ŘSD's estimates. Contract prices also rise after signing: Nová Paka went from 1,308.6 M to
"1,6 miliardy Kč bez DPH" after valorisation and changes ([skypaper / ŘSD release,
2025-08-05](https://skypaper.cz/novinky/obchvat-nove-paky-stal-16-mld-kc-stavi-se-kolem-nachoda-i-pardubic/)), which is +22 %.

### 1b. I/16 Nová Paka in detail (the game's scenario)

Sources: the leaflet above, ŘSD's [project page](https://kraje.rsd.cz/kralovehradecky/stavba-i-16-nova-paka-obchvat/),
and the contractor's article (Porr, [silnice-zeleznice.cz,
2025-11-11](https://silnice-zeleznice.cz/silnice/nova-paka-se-dockala-obchvatu-krajina-nove-mostni-dominanty-pres-stikovskou-rokli-1130)).

**What was built.**
- 8,479 m in category S 11,5/70, with 144 SOs.
- 13 bridges on the road and 3 over it, 1,020 m in total. The longest is the 423 m, 25 m high estakáda over
  the Štikov ravine.
- 2 roundabouts and a grade-separated junction with II/284.
- 22 noise walls, 4,180 m in total, and 3 retaining walls, 176 m in total.
- Relocated or adjusted other roads: III-class 1,303 m, local 720 m, field and forest 1,712 m, cycle paths 843 m.
- Earthworks: "přes 600 000 m³ výkopů a 500 000 m³ násypů, z nichž velká část byla stabilizována hydraulickými
  pojivy". That is ≈ 71k m³ of cut per km, against the norm's 40k.
- Pavement "přesahuje 100 000 m²", and part of the route needed blasting.

**Price.**

| Price | Total M | M/km over 8.479 km |
|---|---:|---:|
| Contract (bid 2022) | 1,308.6 | 154 |
| ŘSD estimate | 1,634 | 193 |
| After valorisation (2025) | ≈ 1,600 | ≈ 189 |
| Contract escalated to 2026 (×1.348) | ≈ 1,764 | 208 |

The new branch the game anchors is ≈ 7.40 km (research/24). Pro-rating the full scope to it gives ≈ 1.54 bn at
2026 level. That over-credits the branch, because the 8.48 km scope includes the two end connections.

**What SPK CN 2026 would predict** (my build-up from the norm rows and attributes; method as SPK prescribes):
- **Road** (7.459 km, i.e. without the bridges) at S1.11,5.NER 68.894 M/km, raised by the earthworks attribute
  for 71k instead of 40k m³/km (+31 %): ≈ 675 M.
- **Bridges** 1.020 km at A.2.S.11,5.N 692.4 M/km: 706 M. This is the standard for clearance ≤ 8 m; the 25 m high
  estakáda would get an expert uplift on top.
- **One grade-separated junction** A.4.N: 77 M.
- **Main objects (A)** total 1,458 M. Adding B at 29.4 % (B.6 does not apply, see §2) gives **1,887 M**.
  Adding the P1 + P2 risk markups (8 + 4 %) gives ≈ 2.1 bn.

So the SPK study-stage price is ≈ +7 % above the escalated contract price before the risk markups, and ≈ +20 %
with them. **A model that follows SPK should land at ≈ 1.8–2.1 bn for the full 8.48 km. It cannot be justified
much above ≈ 250 M/km on this alignment.** The game's starter bills 2.23 bn over 6.6 km (337 M/km); §5 shows
why (its route, not the unit prices).

### 1c. New class II/III bypasses and relocations by the regions

| Project | km | Category / structures | Price | Year | M/km excl. VAT | Basis | Source |
|---|---:|---|---:|---:|---:|---|---|
| II/385 Čebín obchvat (SÚS JMK) | 3.9 | 4 bridges, roundabout, 2 noise walls 1.5 km | 434 M excl. VAT | 2022 | **111** (2026 level ≈ 150) | contract | [zdopravy 2022-01-07](https://zdopravy.cz/podepsano-stavba-obchvatu-jihomoravskeho-cebina-zacne-v-unoru-100784/); length 3.9 km from the [awarding report](https://zakazky.krajbezkorupce.cz/document_123023/23879150669fb5d8df1192399a039526-pisemna_zprava_zadavatele_signed-pdf); estimate 501 M ([E-ZAK](https://zakazky.krajbezkorupce.cz/contract_display_21904.html)) |
| II/416 Blučina obchvat (SÚS JMK) | ≈ 4.5 | 2 junctions, 5 bridges, III/41614 relocated ≈ 0.5 km, other roads adjusted 1.418 km; flat | 695 M **incl. VAT** → 574 M excl. | 2026 | **128** | contract | [SÚS JMK release](https://www.susjmk.cz/o-organizaci/media/tiskove-zpravy/zhotovitel-obchvatu-bluciny-je-vybrany-stavba-odstartuje-na-jare); estimate 859 M excl. VAT ([portál dodavatele](https://portaldodavatele.cz/verejne-zakazky/ii-416-blucina-obchvat)) |
| II/137 Tábor–Slapy, new line (Jihočeský kraj) | 3.65 | S 9,5/90; 5 bridges incl. a 284.8 m arch bridge over the Lužnice | 853.075 M incl. VAT → 705 M excl. (iROZHLAS: bid 711 M excl. VAT) | 2026 | **≈ 193** | contract | [Táborský deník 2026-10-01](https://taborsky.denik.cz/zpravy-region/po-letech-priprav-se-zacina-stavet-obchvat-mezi-taborem-a-slapy/), [iROZHLAS](https://www.irozhlas.cz/zpravy-domov/po-15-letech-planovani-byla-zahajena-stavba-jizniho-obchvatu-tabora-silnice_2610011415_aru) |
| II/245 Čelákovice obchvat | 1.905 | 1 bridge 113 m; urban edge, flat | 280 M excl. VAT (whole build, several stages) | 2024–26 | **≈ 147** | final total (low confidence: built in stages; the last stage's bid was 58.6 M excl. VAT) | [Stavba roku 2026](https://www.stavbaroku.cz/soutezici/ii-245-celakovice-obchvat/), [KSÚS award](https://zakazky.kr-stredocesky.cz/document_174841/76b8b8abc685115fe8e554022c70d575-ii-245-celakovice-oznameni-o-vyberu-pdf) |
| II/152 Moravské Budějovice JV obchvat (Vysočina) | 2.8 | – | 275 M excl. VAT | 2026 | **≈ 98** | estimate | [zdopravy 2026-08-23](https://zdopravy.cz/necele-tri-kilometry-za-275-milionu-stavba-obchvatu-moravskych-budejovic-odstartuje-v-unoru-294600/) |
| II/173 Blatná obchvat, I. etapa | 1.415 | S 7,5/90; 3 bridges (spans 120 + 18.5 + 28.5 m), roundabout | 335.5 M incl. VAT → 277 M excl. | – | **≈ 196** | estimate | [Jihočeský kraj](https://dopravnistavby.kraj-jihocesky.cz/cs/prelozka-silnice-ii173-obchvat-blatna-i-etapa) |
| II/145 Husinec, north bypass | 3.48 | S 9,5/70; "značně členitý" terrain with ≈ 100 m climb; 450 m bridge plus the Blanice bridge | 1.6 bn incl. VAT → 1.32 bn excl. | – | **≈ 380** | estimate | [Jihočeský kraj](https://dopravnistavby.kraj-jihocesky.cz/cs/severni-obchvat-husince-silnice-ii145) |

The regions' contract prices for flat or rolling class II bypasses with a few bridges run **≈ 110–150 M/km at
2026 level**, the same as ŘSD's class-I bypasses. Bridge-heavy hilly ones run **190–380 M/km** (two of those are
estimates). I found **no clean recent example of a new rural class III road** with a published price and length
(UNVERIFIED). The nearest are SPK A.1.S3.7,5.NER at 30.7 M/km and the class III relocations built as SOs inside
ŘSD projects, whose prices are not public.

### 1d. Reconstructions and modernisations of existing class I–III roads

| Project | km | Scope | Price | Year | M/km excl. VAT | Source |
|---|---:|---|---:|---:|---:|---|
| III/2622 Bukovany (Liberecký kraj) | ≈ 2.7 | repair ("oprava") | 14.85 M excl. VAT | 2026 | **5.5** | [kraj-lbc](https://www.kraj-lbc.cz/aktuality/necele-tri-kilometry-silnice-treti-tridy-v-bukovanech-ceka-oprava-n590923.htm) |
| Four Liberecký kraj repairs | 2.386 / 5.072 / 2.564 / 1.981 | repair; tender ceilings | 34.07 / 41.27 / 17.84 / 13.83 M incl. VAT | 2025 | **11.8 / 6.7 / 5.7 / 5.8** | [kraj-lbc 2025](https://www.kraj-lbc.cz/aktuality/rekonstrukce-krajskych-silnic-pokracuji-kraj-zahajuje-dalsi-verejne-zakazky-n580688.htm) |
| II/360 Ústí n. O.–Litomyšl (Pardubický kraj) | 16.21 | "modernizace", mixed rural and urban | 87.9 M excl. VAT | 2023 | **5.4** | [ČKAIT CIK](https://cik.ckait.cz/2023/modernizace-silnice-ii-360-usti-nad-orlici-litomysl/) |
| II/605 Rokycany úsek 3 (SÚS PK, IROP) | 3.914 | reconstruction, 8 culverts, bridge repair | 41.93 M excl. VAT | 2025 | **10.7** | [SÚS PK](https://www.suspk.eu/%F0%9F%9A%A7-suspk-zahajuje-dalsi-vyznamnou-dopravni-stavbu-rekonstrukce-silnice-ii-605-v-okrese-rokycany-usek-3%F0%9F%9A%A7/) |
| II/290 Roprachtice–Kořenov (Liberecký kraj, mountainous) | ≈ 7.3 (ČTK); IROP card says 2.4 | "kompletní rekonstrukce" incl. drainage, culverts, barriers | 138.5 M incl. VAT → 114.5 M excl.; later 168 M incl. VAT | 2024 | **≈ 16** at 7.3 km (≈ 48 at 2.4 km) | [genus/ČTK](https://genus.cz/regiony/liberecky-kraj/obnova-silnice-ii-290-z-roprachtic-do-korenova-prijde-kraj-na-138-5-milionu-korun-o-tretinu-levneji-n702162.htm), [kraj-lbc](https://www.kraj-lbc.cz/projekty/silnice-ii-290-roprachtice-korenov-r583407.htm) (length conflict UNVERIFIED) |
| II/207 Toužim–Smilov, I. etapa (KSÚS KK, IROP) | ≈ 1.7 | modernisation: widened to S 7,5, partial regrade, drainage, culverts | ≈ 81.9 M (12.3 own + 69.6 EU; VAT basis not stated) | 2023 | **≈ 48** | [KSÚS KK](https://www.ksusk.cz/aktuality/ii207-modernizace-silnice-touzim-smilov-irop) |
| II/292 Benešov u Semil – I/14, 1. etapa (Jizera valley) | 2.319 | "kompletní rekonstrukce" | 253.2 M total project expenditure (probably incl. VAT) | ≈ 2022 | **≈ 90** (if incl. VAT) | [kraj-lbc](https://www.kraj-lbc.cz/projekty/silnice-ii-292-benesov-u-semil-krizovatka-s-i-14-1-etapa-r570965.htm) |
| I/44 Červenohorské sedlo – jih (ŘSD, mountain pass) | 7.962 | rebuilt to S 9,5/60, widened in hairpins, overtaking sections | 248.7 M | 2015–17 | **31** (2026 level ≈ 54) | [ŘSD leaflet](https://letaky.rsd.cz/media/stavba/320/leaflet/infoletak_s44-cervenohorske-sedlo-jih.pdf) |
| I/53 Znojmo–Lechovice (ŘSD) | 7.192 | rebuild and widening on the existing line, S 11,5 / S 13,75 | 328.3 M | 2022 | **46** (2026 level ≈ 61) | [ŘSD leaflet](https://letaky.rsd.cz/media/stavba/470/leaflet/infoletak_s53-znojmo-lechovice.pdf) |

**Typical ranges.**
- Repair or resurfacing of a class II/III road: **≈ 5–12 M/km**.
- Full reconstruction or modernisation on the existing line (new layers, drainage, culverts, some widening):
  **≈ 15–50 M/km**.
- A full rebuild of a class I road with widening: **≈ 30–60 M/km** at 2026 level.
- Valley or river-side sections with retaining structures: **up to ≈ 90 M/km**.

**SPK A.5 rebuild norms (2026), per m² of paved area.**

| Row | What it covers | CZK/m² |
|---|---|---:|
| A.5.O.R | Wearing-course replacement (100 mm incl. milling and tack coat) | 872 |
| A.5.K.DS1.R | Full-depth rebuild, motorways and class I (650 mm) | 2,197 |
| A.5.K.S2.R | Full-depth rebuild, classes II and III (550 mm) | 2,093 |
| A.5.R.S1.R | Widening, class I | 6,278 |
| A.5.R.S2.R | Widening, classes II and III | 4,457 |

For a 7 m wide class II/III carriageway, the full-depth rebuild is ≈ 14.7 M/km, or ≈ 19 M/km with the B
surcharge.

## 2. What the SPK CN 2026 rows contain and leave out

**Source.** SFDI, *Cenové normativy staveb pozemních komunikací ve stupni studie 2026*, approved 24 Apr 2026.
ZIP: <https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip>, inspected. "PZ" below is Příloha 1 –
průvodní zpráva; page numbers are the printed ones.

**How the norms are meant to be combined** (PZ p. 3, II.f):
1) „Stanovení ‚Základní ceny' podle cenových normativů (hlavní stavební objekty typu ‚A')"
2) „Expertní úprava ‚Základní ceny' podle ‚Atributů'"
3) „Dopočet ceny ostatních objektů podle procentní sazby (ostatní objekty typu ‚B')"
4) „Stanovení složky přirážek pro všechny stavební objekty (typy ‚A' i ‚B')"

- **A objects** (II.g): „komunikace, mosty, tunely a mimoúrovňové křižovatky … V případě silnic I. třídy i na MÚK".
- **B objects** (III.B, p. 5): „Jejich cena se stanoví procentní sazbou z ceny hlavních stavebních objektů,
  stanovené v části A (základní cena + expertní úprava)".

**So the B surcharge is levied on roads, bridges, tunnels and junctions, including the attribute adjustments.**
Applying it to bridges matches the method.

**The A.1 road row is priced per km of route without bridges and tunnels** (p. 6): „Délka komunikace v km bez
délky mostů a tunelů … Od délky komunikace se neodečítá délka mostů přesypaných a šířka propustků."

**What the A.1 road row includes** (p. 6–7):
- site preparation and setting out;
- topsoil stripping and its handling;
- earthworks for a standard grade line, with 15 % unsuitable soil hauled ≤ 10 km to a tip (tip fees included)
  and the same volume brought from a borrow pit ≤ 10 km. The cut volumes, with fill at 85 % of them:

  | Road | Cut, m³/km |
  |---|---:|
  | Divided roads (S 20,75 and up) | 70,000 |
  | Class I, undivided | 40,000 |
  | Class II | 20,000 |
  | Class III | 15,000 |
  | Local roads | no volume ("běžné … bez výrazných výkopů či násypů") |
  | Field tracks | 6,000 |
  | Cycle paths | 4,000 |

- excavation classes 75 / 20 / 5 % (I / II / III);
- spreading topsoil, seeding the slopes, the active zone under the pavement;
- **„opěrné a zárubní zdi v rozsahu do 100 m/km trasy a výšky nepřesahující 2,0 m"**;
- the pavement („nečiní rozdíl mezi živičnou a CB vozovkou");
- **climbing lanes** „v rozsahu, odpovídajícímu užité podkategorii charakteru území";
- **„odvodnění pláně, příkopy a rigoly, trativody, drenáže, propustky apod."**;
- safety barriers, crash cushions, railings, posts and kerbs, and fixed signs;
- a crossing of the central reserve every 3 km and a service access every 20 km;
- on divided roads, junction ramps built on embankment, assuming one junction per 7 km;
- noise walls to the extent stated in B.5.

**What the A.1 road row leaves out:**
„nevyrovnanou bilanci zemin, náklady na zlepšování podloží, sanace zemin, opevnění svahů dlažbou, odvodňovací
žebra …, chodníky (mimo M 11,5/7,5), chráničky inženýrských sítí, SSÚD, odpočívky", and the work covered by
B.1–B.8.

**Bridges A.2** (p. 8–9). The price is per km of bridge length, measured between the wing ends per ČSN 73 6201,
for clearance under the bridge ≤ 8 m.
- *Included:* foundations, substructure, deck, waterproofing and surfacing, barriers, cable ducts, drainage,
  **transition zones**, bearings and joints, load tests and falsework.
- *Left out:* the extra cost of piers over 8 m, special methods such as arches, noise walls on the bridge,
  lighting, inspection gear, relocating networks or roads needed for the substructure, undermined or landslide
  ground, and works under the bridge.

**Junctions A.4** (p. 10). The A.4.N grade-separated junction, 76.70 M a piece, is counted in full for class I
roads below S 20,75. It covers the ramps on embankment in two quadrants, but „neobsahuje křižující komunikaci a
mostní objekt v křížení". **At-grade junctions and roundabouts have no SPK row and are not part of A.1**; they
fall under expert pricing or B.7 adjustments of affected roads (inference).

**The B "other objects" rates** (`spk-cn-2026-oceneni.csv`; PZ p. 14–16):

| Row | What it contains (PZ quote) | Rural | Urban |
|---|---|---:|---:|
| B.1 General items | chapter "0" of the bill: insurance, fees, the engineer's office, tests, the construction design „(pokud je specifikována samostatně)" | 6 % | 6 % |
| B.2 Preparatory works | „demolice, přístupové komunikace, úpravy objížďkových komunikací … DIO …, zařízení staveniště, mobilizaci" | 5 % | 7.5 % |
| B.3 Water objects | „kanalizace, lapoly, retenční nádrže …, přeložky vodovodů, přeložky vodotečí a úpravy jejich koryt, úpravy meliorací" | 6 % | 10 % |
| B.4 Utility networks | „přeložky NN, VN, VVN …, plynovodů, …, veřejného osvětlení" | 3.7 % | 10 % |
| B.5 Protective measures | „protihlukové stěny a zemní valy, oplocení, …, zdi v rozsahu nad limit zahrnutý v normativu ‚komunikace'". Standard noise-wall lengths are given only for motorways (150 m/km) and divided class I roads (75 / 225 m/km). | 3.7 % | 10 % |
| B.6 Technology | „Tento standard se použije **pouze u dálnic a směrově dělených silnic a u městských komunikací se světelnou signalizací**" | 1.2 % | 1.2 % |
| B.7 Surface adjustments | „vegetační úpravy, **úpravy komunikací dotčených stavbou**, ostatní plochy" | 5 % | 4.6 % |
| B.8 Railway objects | always an individual calculation | – | – |

The rural rates sum to 30.6 % and the urban rates to 49.3 %. **For a two-lane rural class I–III road, B.6 does not
apply, so the surcharge is 29.4 %** (urban without signals 48.1 %). PZ p. 14 adds: „V případě výrazně vyššího
rozsahu … (např. u protihlukových stěn, mimořádných přeložek inženýrských sítí apod.) je nutné stanovit podíl …
expertním posouzením".

**Risk markups P1–P3** (Příloha 4) come on top of A + B and are not in the game:
- P1, missing surveys, new build: roads 8 %, bridges 8 %, other 5 %;
- P2, environment, rural: 4 / 5 / 3 %;
- P3, work under traffic. For new builds the text says „není přirážka uplatněna, respektive je nulová", but
  the table shows 7 % in column (3). The two contradict each other.

**NER and NEH.**
- NER: „extravilán, novostavba, rovinaté **a pahorkovité** území" (outside built-up areas, new build, flat and
  hilly ground).
- NEH: „… hornaté území" (mountainous ground).

Hilly ground is therefore NER. NEH is +19 % for S1 9,5 (67.98 against 56.91 M/km) and +19 % for S1 11,5. **The
attribute sheets give NEH the same standard 40,000 m³/km of earthworks as NER** (Příloha 5, p. 23–24), so the
+19 % is not more earthwork. Its content is not stated; climbing lanes and walls are plausible. UNVERIFIED.

**Values implied by the earthworks attribute** (Příloha 5; linear interpolation of the norm price by volume):

| Row | Volume change → price change | ≈ CZK per m³ of cut (incl. 0.85 m³ of fill, topsoil, haul, 15 % exchange) | Share of the norm at the standard volume |
|---|---|---:|---:|
| S1 9,5 NER | 20k → −20.4 %, 120k → +81.6 % | **580** | **≈ 41 % (23.2 M/km)** |
| S1 11,5 NER | 20k → −16.4 %, 120k → +65.6 % | **565** | **≈ 33 % (22.6 M/km)** |
| S2 9,5 NER | 5k → −20.1 % (standard 20k) | 613 | ≈ 27 % (12.3 M/km) |
| S2 7,5 NER | 5k → −26.4 % (standard 20k) | 636 | ≈ 35 % (12.7 M/km) |

The class III rows have no attribute sheet; their min = standard = max.

## 3. Cost shares

I found **no published actual cost split** of a Czech class I project into earthworks, pavement, bridges and
other objects. A VUT bachelor thesis and the NKÚ audit [k18021](https://www.nku.cz/assets/kon-zavery/k18021.pdf)
were checked: neither has a split or a per-km figure. UNVERIFIED.

Split derived from SPK CN 2026 for one km of S 9,5 NER without bridges (56.9 M, before B):
- **earthworks ≈ 41 %**, from the attribute slope above;
- **pavement ≈ 30 %**: ≈ 8.5 m paved × 2,000 CZK/m², see the OTSKP build-up below; the paved width is assumed
  from the usual S 9,5 layout and not re-verified;
- **the rest ≈ 29 %**: drainage and culverts, barriers, signs, topsoil handling, active zone, walls up to
  100 m/km. This is a residual.

On a whole project, B adds 29.4 % of A on top. In the SPK build-up for Nová Paka above, bridges are ≈ 48 % of A:
Nová Paka is bridge-heavy, with 12 % of its length on bridges.

**OTSKP 2026 pavement prices per m²** (`/tmp/otskp-all.json` = OTSKP 2026 soubor položek). The layer sets are
illustrative, of the TP 170 type:

- **Class I, heavy traffic: ≈ 2,000 CZK/m²**
  - Layers: SMA 11S 40 mm + ACL 22S 80 + ACP 22S 80 + SC C8/10 170 + ŠD 200. This is the set a
    [VUT thesis](https://www.vut.cz/www_base/zav_prace_soubor_verejne.php?file_id=75101) quotes for TP 170;
    the 200 mm ŠD is my assumption.
  - Items: 574I54 362.63 + 574C78 451.41 + 574E78 475.34 + 0.17 × 56140G 2,575.55 = 437.84 + 56334 219.66 +
    2 × 572213 15.21 + 572123 23.06.
- **Class III: ≈ 1,300 CZK/m²**
  - Layers: ACO 11+ 50 mm + ACP 16S 60 + SC C8/10 150 + ŠD 150. The [diagnostic
    report](https://ezak.kr-karlovarsky.cz/document_52272/3c462305360581028d8ce2f0db332b87-e-4-2_diagnostika_silnicni-spol-pdf)
    names ACO 11+ and ACP 16S for a class III road; the thicknesses are assumed.
  - Items: 574A44 339.70 + 574E56 365.53 + 56143G 386.32 + 56333 169.05 + tack and prime coats 38.

These agree with SPK's full-depth rebuild rows (2,197 / 2,093 CZK/m²), which also include removal. The pavement
alone is ≈ 17 M/km for an S 9,5 class I road and ≈ 7 M/km for an S 6,5 class III road.

## 4. Comparison hooks for the engine

All values are CZK excl. VAT at 2026 level. They are construction only: no land, no design before the tender,
no archaeology. Final costs typically run +10–25 % over contract (Nová Paka +22 %).

| Road / terrain | Real contracts, M/km | SPK-only ballpark, M/km (norm + attributes + bridges + 29.4 % B, no risk markups) |
|---|---|---|
| Class I S 9,5 / 11,5, flat or rolling, ≤ 5 % of length on bridges | median ≈ **115–145** (IQR ≈ 95–165) | road 57–69 × 1.294 ≈ 74–89, plus bridges (50 m/km × 580–690 ≈ 29–35) → **≈ 110–135** |
| Class I, hilly, 10–15 % on bridges, 60–80k m³/km of cut | median ≈ **200** (107–265; the valley-bridge outliers reach 370–620) | **≈ 180–230** |
| Class I, mountainous and short (I/9 Svor, I/13 Lvová) | **≈ 265** | NEH rows + walls, by expert judgement |
| Class II bypass, flat or rolling, few bridges | **≈ 110–150** (Čebín, Blučina, Čelákovice) | S2 7,5 NER 36.1 × 1.294 ≈ 47 without bridges. Real bypasses cost far more because junctions, bridges, relocations and noise walls dominate. |
| Class II, hilly with a big bridge | **≈ 190–380** (Tábor contract; Blatná and Husinec estimates) | – |
| Class III, new rural | no clean data | S3 7,5 NER 30.7 × 1.294 ≈ 40 + structures |
| Repair or resurfacing, II/III | **5–12** | A.5.O.R 872 CZK/m² × 6–7 m ≈ 6 |
| Full rebuild or modernisation, II/III | **15–50** (≈ 90 in a river valley) | A.5.K.S2 2,093 × 7 m × 1.294 ≈ 19 (pavement only) |

**Verdict on the owner's suspicion.**
- **Hilly S 9,5 at 200–240 M/km, all in, is at or just above the real hilly median** (≈ 200 construction-only,
  before land and changes). It is plausible for D11-type terrain, but only if the alignment really has
  ≈ 10–15 % bridges or ≈ 70k m³/km of earthworks.
- **The Nová Paka scenario at ≈ 2.2 bn is too high.** The real project cost ≈ 1.76 bn at 2026 level for the full
  8.48 km (1.6 bn nominal final), and the SPK method gives ≈ 1.9 bn before risk markups. For the 7.4 km branch,
  ≈ 1.5–1.7 bn construction plus land would be realistic. The starter's 2.23 bn over 6.6 km is ≈ 1.6× the real
  cost per km; §5: a line that follows the real bypass bills ≈ 205 M/km, the excess is the starter's route.

### Ways the engine's build-up double counts or mis-scales (checked against `src/core/cost.ts`, `data/prices.ts`)

1. **Culverts.** The A.1 norm includes „propustky" and drainage. The engine adds `parts.culverts` on top and puts
   the surcharge on it. Only culverts beyond the ordinary ones should be billed, or larger ones above some size.
2. **Surcharge rate.** 30.6 % includes B.6 technology at 1.2 %, which SPK reserves for motorways, divided roads
   and signalised urban streets. For S 7,5 / 9,5 / 11,5 rural the rate should be **29.4 %**, and urban
   **48.1 %** unless there are signals.
3. **B.5 against separately billed walls.** B.5 (3.7 %) is meant to cover noise walls and earth berms in the
   ordinary extent, fences, and retaining walls above the norm's 100 m/km. If the engine bills noise walls and
   retaining walls item by item *and* applies the full B, the B.5 part (≈ 3.7 % of A) is paid twice. The norm
   also already includes walls up to 100 m/km and up to 2 m high, so billing every retaining wall from the first
   metre double counts that allowance.
4. **B.2 / B.7 against separately billed demolitions and road works.** B.2 includes demolitions, access roads
   and diversions. B.7 includes „úpravy komunikací dotčených stavbou". The engine bills buildings (purchase and
   demolition), reroutes, links, junction lumps and overbridges separately, and also charges the full surcharge.
   About 5–10 % of A overlaps. Either credit B.2 and B.7, or stop billing ordinary road adjustments
   individually. Grade-separated junctions and overbridges for the main road are legitimately extra:
   A.4 and A.2 are separate objects.
5. **Earthwork-allowance credit too small.** For S1 9,5 the engine subtracts ≈ 15.0 M/km (40k × 248 + 34k ×
   100 + 6k × 196 + topsoil). SPK's own attribute values those 40k m³ at ≈ 23 M/km. The remaining "base" of
   41.9 M/km is ≈ 8 M/km (≈ 10.7 M/km after surcharge) higher than what SPK prices for the non-earthwork content.
   The engine's marginal earthworks (≈ 350–400 CZK per m³ cut, including the matching fill) are cheaper than SPK's
   ≈ 580. The two errors cancel at ≈ 80k m³/km. Below that the engine over-bills; above it the engine under-bills.
   For class II S 7,5 the credit is ≈ 7.7 M against ≈ 12.7 M implied.
6. **Topsoil and land are fine in principle.** SPK includes topsoil handling, and the engine credits it, though
   the credited topsoil area (crown + 12 m) is a guess. Land, ZPF/PUPFL levies and design are outside SPK and
   outside the contract prices above, so the engine is right to add them. Compare against contract prices only
   after removing them.
7. **NEH.** If a player or scenario uses the mountainous row, its +19 % premium is not earthwork (same 40k m³
   standard). Billing extra earthworks on top of NEH is not a double count by itself. But the NEH premium plus
   separately billed climbing lanes or walls could overlap. The content of the premium is UNVERIFIED.
8. **No risk markups and no at-grade junction row.** The engine correctly leaves out P1–P3 (contracts don't
   include them). At-grade junctions and roundabouts are not in A.1 and are legitimately extra, at ≈ 20–37 M each
   (research/13, 29).
9. **The bridge norm is per km of bridge with transition zones included, at clearance ≤ 8 m.** The engine's own
   bridge model (research/16) should not also add approach slabs, and the road norm must not run under bridges.
   The engine already drops `roadBase` on bridge cells.

## 5. What the engine bills (main `8ac09c5`, cost model 28)

Measured by the main agent with `scripts/road-cost-audit.ts` (whole route and "plain" cells: at grade, rural, no
crossing, building, culvert or buyout there), M CZK per km, Auto grade line, CZK excl. VAT at 2026 level.

| Design | km | Total M/km | Bridges % of length | Cut / fill k m³/km | Plain km M/km (of which land) | Buildings + buyouts | Crossings |
|---|---:|---:|---:|---:|---:|---:|---:|
| D11 best, S 9.5/90 | 21.1 | **196** | 7.0 | 64 / 52 | 119.5 (9.9) | 2 % | 8 % |
| D11 demo, S 9.5/90 | 21.1 | **230** | 8.6 | 73 / 63 | 139.2 (10.9) | 3 % | 7 % |
| D11 best as S 7.5 / S 11.5 | 21.1 | 166 / 229 | 7.2 / 6.9 | 60 / 72 | 97.8 / 144.7 | 3 / 2 % | 9 / 7 % |
| Nová Paka starter, S 11.5/70 | 6.6 | **337** | 9.0 | 52 / 36 | 131.9 (9.0) | **22 %** | **11 %** |
| Nová Paka, bends every 300–450 m along the mapped bypass | 7.2–7.3 | **202–208** | 3–5 | – | – | 9–10 % | 10–12 % |

**Hilly D11 (S 9.5) is in the real range.** 196–230 M/km all-in against the real hilly class I median ≈ 208 M/km
(107–265) at 2026 level, construction only (§1a, §4). Not a gross overcharge.

**Nová Paka: the starter's route, not the unit prices.** Its four-bend chord of the mapped bypass demolishes
480 M CZK of buildings (a 5,125 m² hall under a bridge 161 M, a 1,270 m² apartment block 110 M, 19 others) and
pays 255 M of crossing works (three street reconnections 25–46 M each). A line with a bend every 300–450 m along
the mapped bypass bills 1.46–1.52 bn for 7.2–7.3 km (≈ 205 M/km) against the real ≈ 1.54 bn pro-rated to the
branch at 2026 level (§1b). Those closer lines are not yet VALID (earthworks over side roads, ramp problems:
crossing-engine work), and they bridge only 230–340 m where the real project bridged 1,020 m (the 423 m
estakáda over the Štikov ravine is an embankment in Auto).

**A plain km costs 20–26 % more than SPK's own build-up.** SPK for the same volumes (norm × earthworks
attribute × 1.294): D11 best S 9.5 at 64k m³/km ≈ 91.7 M/km against the engine's 109.6 (plain km without land),
Nová Paka S 11.5 at 52k ≈ 97.9 against 122.9. Explained by:

| Mechanism | D11 best, M/km of plain road incl. surcharge | Source status |
|---|---:|---|
| High-earthworks reserve 35 / 20 CZK per m³ per m above 6 m (`STRUCTURE_RULES`) | **14.1** (10.8 + 30.6 %) | PROVISIONAL, no source (research/15, /48 §5) |
| B.6 technology 1.2 % in the surcharge, not for undivided roads | ≈ 1.0 | SPK PZ p. 15, text checked |
| Earthwork slope: engine's marginal m³ (≈ 350–400 CZK/m³ cut incl. fill) vs SPK attribute (≈ 580) | ≈ −3 … +3 | both sourced; equal at the norm's 40k m³/km by construction |
| Noise walls billed and B.5 in the surcharge | ≈ 0.5 | partial overlap (B.5 gives no standard length for 2-lane roads) |

Whole-route items beyond the plain km: the surcharge is also put on crossing works (links, reroutes, relocated
roads), which SPK treats as B.7 objects that carry no surcharge (PZ III.B: B is a percentage of the A objects);
on D11 best that is ≈ 0.306 × 15 M/km of crossing works ≈ 4–5 M/km. Watercourse culverts (0.6–0.9 M/km) partly
overlap the norm's "propustky"; kept (they are mapped-stream assemblies beyond ordinary drainage).

**Class III roads use the class II row.** `S7.5` serves legal classes II and III with A.1.S2.7,5 (36.1 M/km, 20k m³
allowance). SPK has A.1.S3.7,5.NER 30.7 M/km (15k m³) for class III; rebuilt and rerouted class III roads are
≈ 18 % dearer per km than the norm. A rebuilt 438 m stretch of D3 III/1057 billed 34–36 M (docs/any-road-editing.md),
≈ 80 M/km; not decomposed here.

## 6. Sources, reproducibility, open items

**Sources.**
- SPK CN 2026 ZIP (above): PZ pp. 2–16, Příloha 4 pp. 1–5, Příloha 5 pp. 23–24. Prices are in
  `research/data/spk-cn-2026-oceneni.csv`.
- ŘSD leaflets: URLs in §1a; the project list is ŘSD's map JSON (above). Parsing used the leaflets' "délka /
  kategorie / celková délka mostů / výkopy / násypy / Předpokládaná cena / Cena stavby dle smlouvy" fields.
  Raw files are not committed.
- OTSKP 2026 item list: SFDI `otskp-2.zip` (research/15-followup), extracted to `/tmp/otskp-all.json`.

**Open items.**
- **UNVERIFIED:** a recent new rural class III road; an actual cost split of a project; what the NEH premium
  contains; ŘSD land and design costs as a share of a project.
- **Contradiction in SPK:** P3 for new builds, the table against the text.
- **Low confidence:** the II/290 length (2.4 or 7.3 km); whether the II/207 and II/292 project totals include VAT.
