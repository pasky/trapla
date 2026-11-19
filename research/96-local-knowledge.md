# 96 — Local knowledge: the sourced lines on cards the player already opens (2026-11-20)

Why: the owner asked for "fun non-cringe but delightful easter eggs / small joyful details"; a board of three models
proposed and cross-examined them (memo in the parent session: fable-6 "local knowledge", fable-5 "St Barbara",
fable-7 "how long the real one took"). Each line is a fact and carries its source like a price. Method: two research
subagents (2026-11-19/20), then every quote below re-read here; the OSM ways were checked in the packs'
`transport.json.gz`. Used by `src/core/data/lore.ts` (mapped ways, a mission end), `src/ui/inspector.ts` (a tunnel's
More) and `src/ui/twists.ts` (the reveal).

Rule: one grey sentence, at most ≈ 15 words, on a card the object already opens; never on our own road's cards except
where the line is about the real place (St Barbara). No line where a fact is not sourced.

## 1. Ecce Homo, Šternberk (i46-sternberk: road III/44423)

**Line:** "Part of the Ecce Homo hill-climb course, 7.8 km from Šternberk; first raced in 1905."

- Course on III/44423: Autoklub ČR, Ecce Homo 2017 supplementary regulations
  ([PDF](https://www.autoklub.cz/wp-content/uploads/2018/11/zav_sternberk_17.pdf)): "Opava na silnici č. III 44423" —
  "(towards) Opava on road no. III/44423". Length: the 2014 regulations
  ([PDF](https://www.autoklub.cz/wp-content/uploads/2018/11/zav_eccehomo_14_gb.pdf)): "Length 7800 m".
- 1905: the organiser, [AMK Ecce Homo](https://www.eccehomo.cz/): "První informace o trati se závodním obsahem je
  datován na rok 1905, první samostatně konaný závod do vrchu s názvem Ecce Homo byl uspořádán v roce 1921." — "The
  first record of racing on the course dates from 1905; the first hill-climb held on its own under the name Ecce Homo
  was in 1921." Mapy.com's entry ([id 2081956](https://mapy.com/cs/?source=base&id=2081956)): "Poprvé se ve Šternberku
  závodilo již v roce 1905" — "Šternberk first saw racing as early as 1905". So "first raced in 1905", not "raced
  every year since". Still raced: 2026 FIA European Hill-Climb Championship round, 5–7 June 2026 (organiser).
- Start: cs.wikipedia "Ecce Homo (závodní trať)": "Start závodu se nachází ve Šternberku na křižovatce ulic Opavská a
  Sadová" — "the start is in Šternberk at the junction of Opavská and Sadová streets" (secondary; no primary quote).
- Ways (all ref 44423, from node 253313156, the Opavská × Sadová junction, north out of town): Opavská 233754777,
  260133002, 233754932, 260133001; 1562071054, 233754680, 233757455; Na Valech 233757456, 233757497, 682525712; Ecce
  Homo 41552242, 205203355; 23396775, 969799598. Not the course (ref 44423 in town, south of the start): Sadová
  30501999, 1009644819; Svatoplukova 24496922, 968782630, 1380202040; 1380202043.

## 2. The Žampach viaduct (d3-0301, d3-0302, d3-full: railway way 30231642)

**Title:** "Žampach viaduct" (the way has no name tag). **Line:** "Stone, opened in 1900; its highest arch stands
42 m above the Kocour gorge."

- [Central Bohemia tourism](https://www.visitcentralbohemia.com/experience/zampach-railway-viaduct/): "Built between
  1898 and 1899 with seven arches, the highest at 41 meters" and "Once completed, railway operations began on May 1,
  1900."
- [Mapy.com, Železniční viadukt Žampach](https://mapy.com/cs/?source=base&id=1907937): "nejvyšší dosahuje výšky 41,73
  metrů nad roklí Kocour" — "the highest reaches 41.73 m above the Kocour ravine"; 109 m long.
- Cultural monument (NPÚ register 1000133403, via [pamatky.cz](https://www.pamatky.cz/pamatky/zampassky-most)).
- Not said: "the tallest stone railway viaduct in the country". Sources differ ("one of the highest", Mapy's "the
  highest stone railway bridge"); no national comparison found.

## 3. The Hřebeč tunnel (d35, d35-full: road I/35 ways 1319367452 and 694293527, either side of the tunnel)

**Line:** "It passes under the ridge in the Hřebeč tunnel, the first motorway-size tunnel mined in Czechia."

- The tunnel way itself (22824470, "tunel Hřebeč") is not drawn (`render: []`), so the line goes on the two ways that
  lead into it.
- [ITA-CZ, Automobilový tunel Hřebeč](https://www.ita-aites.cz/cz/podzemni_stavby/automobilovy-tunel-hrebec.html):
  "Silniční tunel Hřebeč je součástí přeložky silnice I/35 … Je prvním raženým tunelem dálničního typu v České
  republice. Je třípruhový … Celková délka je 357 m, z toho 298 m ražených." — "The Hřebeč road tunnel is part of the
  I/35 relocation … It is the first mined tunnel of motorway type in the Czech Republic. It has three lanes … Total
  length 357 m, of which 298 m mined." Opened November 1997, 354 m (Mapy.com, id 2092700; secondary: not said).

## 4. R35 (i35-full, i35-turnov, i35-rovensko, i35-jicin: road I/35, ref 35)

**Line:** "The new road planned beside it was called the R35 expressway until 2015."

- research/89 §1: "The line was the R35 expressway until 2015; from 1 Jan 2016 (the R category abolished, zákon
  268/2015) R35 Úlibice – Lipník became D35, while Turnov – Úlibice was 'vyřazena z plánované dálniční sítě'".
  Statute: [zákon č. 268/2015 Sb.](https://www.e-sbirka.cz/sb/2015/268), in force 1 Jan 2016. The existing road was
  never R35: the line says "the new road planned beside it".

## 5. The Polish S3 at the D11's end B (d11 motorway mission)

**Line (B's card):** "Across the border, Poland's S3 has run all the way to Szczecin since July 2024."

- ŘSD leaflet D11 1109 stage 2, 04/2026 (research/94): "Silnice S3 Lubawka–Legnica–Štětín na polském území byla
  v celé délce zprovozněna na konci 07/2024." — "The S3 Lubawka–Legnica–Szczecin on Polish territory opened along its
  whole length at the end of 07/2024."
- GDDKiA, ["Pierwsze urodziny tuneli na S3"](https://www.gov.pl/web/gddkia/pierwsze-urodziny-tuneli-na-s3), 1 Aug
  2025: "Od 31 lipca 2024 roku dostępny jest ostatni wybudowany w woj. dolnośląskim odcinek drogi ekspresowej S3" —
  "Since 31 July 2024 the last built section of the S3 expressway in Lower Silesia has been open".

## 6. The Trutnov – Královec railway (d11: railway way 602447755)

**Title:** "Trutnov – Lubawka railway". **Line:** "Trains run on over the border to Lubawka and Sędzisław."

- The way's only name-like tag is `ref=625 00` (not the timetable number; its meaning is unverified): a railway's
  `ref` is no longer shown as its name anywhere (`mappedRoadName`).
- [ČD, timetable 043](https://www.cd.cz/jizdni-rad/tratove-jizdni-rady/trat/043/): "Trať 043: Trutnov - Lubawka",
  valid 14 Dec 2025 – 12 Dec 2026. [GW Train Regio timetable](https://www.gwtr.cz/en/hradec-kralove/timetables/timetable)
  lists "Trutnov - Královec - Lubawka - Sędzisław" for the same period.

## 7. St Barbara at a mined tunnel (D11 motorway mission)

**Line (a mined tunnel's More, d11 only):** "Tunnellers set St Barbara, their patron, at its portal, as at the real
Poříčí tunnel here in November 2026."

- [Valbek Story, 7 Nov 2026](https://www.valbekstory.com/clanky/detail-clanky/r/svata-barbora-bude-bdit-nad-vystavbou-tunelu-porici):
  "V úterý 3. listopadu se u tunelu Poříčí na dálnici D11 odehrál slavnostní okamžik … Trutnovský farář Ján Kubiš
  požehnal sošce svaté Barbory, patronky horníků a tunelářů. Ta následně našla své místo na portálu nově budovaného
  tunelu." — "On Tuesday 3 November a ceremony took place at the Poříčí tunnel on the D11 … the Trutnov priest Ján
  Kubiš blessed a statue of St Barbara, patron of miners and tunnellers. It then found its place at the portal of the
  tunnel being built."
- Mined: [Silnice-železnice, 29 May 2026](https://silnice-zeleznice.cz/silnice/vystavba-tunelu-porici-a-opevneni-na-dalnici-d11-1196):
  Poříčí 540 m and 576 m; "je s výhodou využito ražeb na základě principů Nové rakouské tunelovací metody (NRTM)" —
  "excavation on the principles of the New Austrian Tunnelling Method is used". The same custom at the project's
  Opevnění tunnel, 21 Jan 2026 ([ŘSD](https://kraje.rsd.cz/kralovehradecky/slavnostni-ulozeni-sosky-sv-barborky-na-portale-tunelu-opevneni-na-stavbe-d11-trutnov-statni-hranice-cr-pl/)):
  "Dřevěné sošce sv. Barbory požehnal … Patronka horníků byla následně uložena do kapličky na portále" — "The wooden
  statue of St Barbara was blessed … the miners' patron was then placed in the little chapel at the portal".
- Only on a mined tunnel (cut and cover is not mined) and only on the D11, where the real tunnels are; a trade custom,
  said as whose it is. No mark is drawn on the map (a statue would be an unbilled object).

## 8. How long the real one took (the reveal)

**Line:** "Yours took N minutes. The real one was in environmental review by YEAR." YEAR is the earliest dated
document of the real project's record in the CENIA EIA register found here; it says "by", since older steps (other
records, earlier variants) may exist. A mission without one says nothing.

| Mission(s) | Year | Source |
|---|---|---|
| I/46 Šternberk | 2003 | [CENIA OLK068](https://portal.cenia.cz/eiasea/detail/EIA_OLK068): notice uploaded 22 Dec 2003, screening conclusion 20 Feb 2004, "Nepodléhá dalšímu posuzování" (not subject to further assessment; research/91) |
| D3 0301–0305, whole D3 | 2011 | [CENIA MZP325](https://portal.cenia.cz/eiasea/detail/EIA_MZP325) ("D3 - Středočeská část"): screening conclusion and documentation uploaded 14 Jan 2011; favourable opinion 7 Feb 2012 ([MŽP, 3 Feb 2012](https://mzp.gov.cz/cz/pro-media-a-verejnost/aktuality/archiv-tiskovych-zprav/dalnice-d3-stredoceska-cast-ziskala-kladne): "Ministerstvo životního prostředí vydalo souhlasné stanovisko EIA … k záměru 'D3 - Středočeská část'") |
| D35 stage 1, whole D35 | 2006 | [CENIA MZP136](https://portal.cenia.cz/eiasea/detail/EIA_MZP136): "Rychlostní silnice R35 v úseku MÚK Ostrov - MÚK Staré Město", notice 2 Oct 2006, screening conclusion 10 Nov 2006 |
| D11 1109 | 2008 | [CENIA MZP197](https://portal.cenia.cz/eiasea/detail/EIA_MZP197): "Datum zveřejnění závěrů zjišťovacího řízení … 16.01.2008" (screening conclusion published) |
| I/35 Turnov – Úlibice (stages, whole) | 2016 | [CENIA MZP462](https://portal.cenia.cz/eiasea/detail/EIA_MZP462); Turnov town archive: "Závěr zjišťovacího řízení MŽP ze dne 29.04.2016" (screening conclusion) |
| Královec railway | — | no real project (the story already gives today's 26 minutes) |

The minutes are the player's active play on that design (`src/ui/twists.ts` clock), whole minutes.
