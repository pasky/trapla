# 64 — A long mined tunnel's price per metre (2026-11-17)

Why: research/63 found the real D35 choice (a 3,983 m twin tube) 21 % dearer in our model and implied ≈ 1.0 M CZK
per tube-m against SPK's 1.55 M. Research subagent pass (smart mode, every row opened unless marked), reviewed;
implemented as cost model 36 (`data/prices.ts` TUNNEL_RULES.lengthFactor, `cost.ts` tunnelLengthFactor).

CZK excl. VAT unless stated. **Derived** = my arithmetic. Escalation: ČSÚ CZ-CC **2142 "Tunely a podchody"**
(separate from 2141 Mosty; same workbook as research/50), chained annual y/y indices → factor to 2025:
2003 2.020 · 2004 1.955 · 2005 1.900 · 2006 1.850 · 2007 1.782 · 2008 1.714 · 2022 1.186 · 2024 1.068 (derived).
Caveat: CZ-CC is an input-cost index; it does not track the 2007–08 tender boom or the 2010–14 price war.

## 1. SPK CN 2026 — no length attribute beyond 500 m

| Item | Value (quoted) | Source | Opened |
|---|---|---|---|
| Length categories, Příloha 1 §A.3 | "délka tunelu: krátký (do 500 m), střední a dlouhý (nad 500 m)" — nothing else | [SPK CN 2026 zip](https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip), Příloha č.1 R4 docx | y |
| Příloha 2 (struktura) | "DÉLKA TUNELU: do 500 m / nad 500 m" (only two values) | same zip | y |
| Příloha 5 (atributy) | **no A.3 sheets at all** (sheets A.1.*, A.2.*, A5.* only) | same zip | y |
| XML / Příloha 7 (changes) | A.3.R.2.NE.D 1,549,899,000 / min 1,165,950,000 / max 2,049,434,000; .K 1,487,547,000 / 1,119,044,000 / 1,966,985,000; no tunnel entry in the change list | same zip | y |
| Příloha 6 base | .K "DLE STANDARDU SBORNÍKU DPZ" 823,800,000; .D 792,000,000 (short **dearer** in the base). 2026 values are links to an unpublished workbook `'[1]825 122'!K47 / K49` | same zip | y |
| Includes | lining, cross-passages "případně", portals, pavement, signs, drainage, lighting, all tunnel technology; TT4 excavation; "kalkulováno s náklady na technologii ve výši 20 % celkových nákladů" | Příloha 1 §A.3 | y |
| Excludes | průzkumné štoly, provozní objekty, monitoring, rozsáhlé předportálové úpravy, výdechové objekty, příjezdové komunikace/heliporty, 12-month trial operation | Příloha 1 §A.3 | y |

So SPK has **no economies of scale beyond 500 m**; its only length step goes the other way (+4.2 % above 500 m).
The D35-implied 1.0 M/tube-m is **below the SPK technological minimum** (1.166 M/m) for > 500 m.

## 2. Published cost-vs-length curves

| Source | What | Values | Opened |
|---|---|---|---|
| Hessen Mobil Heft 52-2006, Abb. 3-2 ([PDF](https://mobil.hessen.de/sites/mobil.hessen.de/files/2022-02/wirtschaftliche_aspekte.pdf), p. 22) | spez. Baukosten je Meter Tunnelröhre, 100 % = 400 m; chart covers ≈ 240–2,000 m only. I re-read it by pixel (250 dpi render) | 250 m ≈ 109 %; 300 m 104.8; 400 m 100.0; **500 m 98.9**; 600 m 97.8; 800 m 96.1; **1,000 m 94.8**; 1,200 m 94.2; 1,500 m 93.4; 1,800 m 92.7; **2,000 m 92.4**. Text: 1,000 m "3 % bis 5 % unter" 500 m; 2,000 m "um bis zu 7 %". Fixed costs named: Baustelleneinrichtung, Anfahrvorgänge, Voreinschnitte, Portalblöcke, Portalvorfeld, Betriebsgebäude, Zufahrten. Equipment 3–12 %, 2–4 k€/m | y |
| Hessen, relative to 500 m (derived) | — | 1,000 m **0.959**; 2,000 m **0.934**; nothing published for 3–4 km | — |
| BASt-funded cost model (Thewes et al., Ruhr-Uni Bochum + BUNG + Schüßler-Plan), tunnel 2019, "Kostendiagramm RQ 10,5T, konventionelle Bauweise" ([article](https://www.tunnel-online.info/de/artikel/tunnel_Kostenmodell_zur_Abschaetzung_der_Herstellkosten_von_Tunnelbauwerken-3471803.html), [figure](https://www.tunnel-online.info/imgs/1/5/1/5/7/0/2/05-kostenmodell-strassentunnel-Kostendiagramm-neu-86ea097a9658b754.jpeg)) | **Rohbaukosten** (civil only) k€ per m, 100–1,800 m, linear, read off ±0.5 | leicht 17.2 → 16.5 (500 m) → 14.3 (1,800 m); mittel 29.4 → 28.5 → 25.6; schwer flat ≈ 46.3. Derived 1,800/500: **0.87 / 0.90 / 1.00** | y |
| Swiss EFK audit of 10 motorway tunnels ([PDF](https://www.efk.admin.ch/wp-content/uploads/publikationen/berichte/sicherheit_und_umwelt/verkehr_und_umwelt/7367/7367zf_dx.pdf)) | per lane-metre | 18–45 k CHF, mean 26.5 k; shortest (Roche Saint-Jean 211 m) "praktisch der teuerste (44'000 Franken)". No curve | y |
| ASTRA fact sheet (via research/51) | M CHF/km, c. 2010 | Baregg 1.1 km 272; Serrières 1.7 km 140; Belchen 3.2 km 156; Gubrist 3.3 km 171; Axen 7.8 km 126; Gotthard 16.9 km 119 — no trend within 1.7–3.3 km | n |
| PIARC Road Tunnels Manual, costs ([page](https://tunnelsmanual.piarc.org/en/strategy-and-general-design-strategic-issues/costs-financial-aspects)) | qualitative | ratios vary 1:5; ventilation/safety weigh more in long tunnels, access/portals more in short ones | y |
| EC DG REGIO rail unit costs, Annex 13 ([PDF](https://ec.europa.eu/regional_policy/sources/studies/assess_unit_cost_rail/annex_13_case_study_tunneling.pdf)) | qualitative, rail | "length … inversely related to its unit cost" (esp. TBM) but longer → more uncertainty/contingency; conventional 24–28 M€/km | y |
| Norway (Statens vegvesen), ÖBB/ASFINAG, ITA | — | **not found** (no published curve located) | — |

## 3. Czech tunnels per tube-m (nominal → 2025 with CZ-CC 2142, derived)

| Tunnel (tubes, m) | Figure, year, scope | Nominal /tube-m | ≈ 2025 /tube-m | Source | Opened |
|---|---|---:|---:|---|---|
| D8 Panenská (2,058 + 2,030) | 4.2 bn, built 2003–06, **incl. 800 m motorway with retaining walls + Petrovice junction**; VAT basis unstated (5 % → 19 % in 5/2004) | ≤ 1.03 M | ≤ 1.75–2.08 M | [Wikipedia](https://cs.wikipedia.org/wiki/Tunel_Panensk%C3%A1), [ČKAIT](https://30let.ckait.cz/stavba-05-dalnice-d8-stavba-0807-v-useku-trmice-statni-hranice-nemecko.html), lengths [ITA](https://www.ita-aites.cz/cz/podzemni_stavby/tunel-panenska.html) | y |
| D1 Klimkovice (1,076 + 1,088) | ≈ 2.5 bn "celkové náklady", 2004–08; VAT unstated | ≈ 1.15 M | ≈ 1.84–2.26 M | [Wikipedia](https://cs.wikipedia.org/wiki/Tunel_Klimkovice) | y |
| D0 514 Lochkov (1,661 + 1,620; one 3-lane tube) | **"cena stavební části tunelu … 1,8 mld. Kč"** (2005 price level, incl. VAT) — civil only → 1.51 bn excl. 19 % VAT | 0.46 M civil | 0.88 M civil (≈ 1.10 M if civil = 80 % per SPK) | [Silnice-železnice](http://old.silnice-zeleznice.cz/clanek/tunel-v-useku-514-lahovice-slivenec-prazskeho-silnicniho-okruhu/) | y |
| D5 Valík (390 + 380, 11.5 m wide, poor ground) | "vlastní tunel … 1,75 miliardy Kč", 2006 | 2.27 M | ≈ 4.2 M | [Ekolist 2006](https://ekolist.cz/cz/zpravodajstvi/zpravy/dalnice-d5-byla-dokoncena-po-29-letech-stavby) | y |
| D8 Prackovice (270 + 260) | 2007 tender 1,267.1 M incl. 10 % reserve + 19 % VAT → 968 M | 1.83 M | 3.26 M | [Oživení](https://oziveni.cz/wp-content/uploads/2010/01/cenadalnic_cast5_d8_d11.pdf) tab. 6 | y |
| D8 Radejčín (620 + 600) | same tender 2,953.2 M → 2,256 M; incl. bridge + 1,080 m motorway | ≤ 1.85 M | ≤ 3.29 M | same | y |
| D35 Homole (525 + 569) | 2024 D&B contract 1,754 M, incl. 1 bridge, 2 retaining structures, design | 1.60 M | 1.71 M | research/51 (zdopravy) | n |
| D8 Libouchec, D11 Poříčí/Opevnění/Kamenný vrch, D3 Prostřední vrch (950 m) | **not found** object-level. Prostřední vrch only its exploratory gallery (838 m, 248 M, snippet) | — | — | search snippets | n |
| D35 Dětřichov (2 × 3,983) | **not found** tunnel-only. Section 17,693,831,000 (leaflet, no split); PPP 71.324 bn = NPV of availability payments for 35.4 km + O&M, no construction split | — | — | [leaflet](https://apdos.roadmedia.cz/Upload/Stavby/53/infoletak_d35-opatovec-st_mesto.pdf), [Strabag](https://newsroom.strabag.com/en/press-releases/group/2026-10/strabag-consortium-is-the-preferred-bidder-for-the-largest-motorway-ppp-project-in-the-czech-republic-), [Wikipedia](https://cs.wikipedia.org/wiki/Tunel_D%C4%9Bt%C5%99ichov) | y |
| Blanka (urban) | excluded comparator (research/51: ≲ 3.6 M gross) | — | — | — | n |

Reading: escalated, **no Czech long tunnel is clearly cheaper per tube-m than SPK**, except the Lochkov civil-only
figure (≈ 0.7× SPK's civil 80 %). Panenská's "≲ 1.0 M" in research/51/63 is nominal 2003–06; escalated it is
1.75–2.08 M (upper bound, includes motorway). Same-era pairs: Prackovice 0.53 km vs Radejčín 1.22 km (2007) —
no visible discount; Valík vs Panenská (2003–06) — 0.45×, but confounded by width, geology, scope.

## 4. Proposed length factor on A.3.R.2.NE.D (L = tube length, L > 500 m)

**f(L) = 0.913 + 43.7 m / L** (derived: a + b/L through the Hessen reads at 500 and 2,000 m, normalised to 500 m;
reproduces the 1,000 m read within 0.3 %).

| L | 500 m | 1,000 m | 2,000 m | 3,000 m | 4,000 m |
|---|---:|---:|---:|---:|---:|
| f(L) | 1.000 | 0.957 | 0.935 | 0.928 | 0.924 |
| × 1,549,899 CZK/m | 1.550 M | 1.483 M | 1.449 M | 1.438 M | 1.432 M |

Supporting points: Hessen Abb. 3-2 (total cost, 1,000 → 0.959, 2,000 → 0.934); BASt/Bochum 2019 civil-only
(0.87–0.90 at 1,800 m for leicht/mittel; with SPK's 20 % equipment held flat → ≈ 0.90–0.92 total, consistent);
PIARC/EFK qualitative (short = dearer per m). Beyond 2 km is **extrapolation**; the 1/L form flattens by design,
and RABT/NV 264 add cost steps there (exhaust-air central from 3,000 m per Hessen Abb. 3-1; control centre
> 3,000 m, forced ventilation > 1,000 m), so do not let f fall further. Optional clamp: f ≥ 0.92.
Note the 500 m step: f(500⁺) × .D = 1.550 M vs .K 1.488 M — keep SPK's step, apply f only on the .D row.

**Confidence:** medium to 2 km (two independent German sources agree on −4 % at 1 km, −7 % at 2 km);
low for 3–4 km (no data). Czech evidence neither supports nor refutes it (scopes and price levels too mixed).

**D35 cross-check (not used for tuning):** f(3,983) = 0.924 gives 1.43 M/tube-m vs the ≈ 1.0 M implied in research/63.
The length factor explains **≈ 0.12 of the 0.55 M/m gap (≈ 22 %)**. Mechanisms to examine for the rest (not
established here): (a) the research/63 split, which assigns the whole residual to the tunnel and rests on our own
7.2 bn for the non-tunnel works, an ŘSD estimate, and a different alignment; (b) the 29.4 % "other objects" surcharge
applied on top of a tunnel row that already includes portals and equipment; (c) cover/ground: SPK assumes TT4 throughout,
but a 4 km tunnel under up to 150 m of cover is mostly deep rock (Hessen Fig. 4.1-1: > 20 m rock 100–145 % vs 10–20 m
140–190 %; research/49), so a cover-dependent factor fits better than a stronger length factor. An f of ≈ 0.65 at 4 km
would contradict every curve found and the SPK minimum.

## Caveats
- Hessen (2006) and BASt (2019) are German, single-tube RQ 10.5T references; SPK is Czech and per tube. Using only their
  *ratios* assumes the same fixed-cost share in the Czech row (unverified: SPK's base data are unpublished).
- Hessen's curve is total construction cost; BASt's is Rohbau only; neither goes past 2 km.
- CZ-CC 2142 escalation of 2003–08 figures probably overstates (input-cost index; boom-era tenders). VAT basis of
  Panenská, Klimkovice and Valík is not stated.
- Not found: any SPK/OTSKP length split > 500 m; object-level prices for Dětřichov, Libouchec, D11 tunnels,
  Prostřední vrch; Norwegian, Austrian, ITA cost-vs-length curves.


## Review and what was implemented

- Taken: **f(L) = 0.913 + 43.7 / L on the > 500 m mined row, held at ≥ 0.92** (0.957 at 1 km, 0.935 at 2 km, 0.924
  at 4 km); the two German sources agree to 2 km, beyond is the 1/L form's own flattening, which the safety
  steps from 3 km argue against pushing further. Not on cut and cover (A.3.H) nor the railway's SPOŽES rows (no
  evidence there), not on the ≤ 500 m row (SPK's own step stays).
- The structure choice used the ≤ 500 m row per station for every tunnel; it now weighs the bill's rows for the
  run's length (+4.2 % at 501 m, −3.7 % at 4 km against that row), so what is billed is what was weighed.
- Corrections to research/51 and /63: Panenská's "≲ 1.0 M per tube-m" is a 2003–06 nominal figure (≈ 1.75–2.08 M
  in 2025 money, an upper bound with its motorway); escalated, no Czech long tunnel is clearly cheaper than SPK
  (Lochkov's civil part aside). The D35-implied 1.0 M is below SPK's own minimum for the row (1.166 M).
- So the length explains ≈ a fifth of the D35 gap. Left as hints, not implemented: the 29.4 % "other objects"
  surcharge on a row that already holds portals and equipment (research/46 §2 would need re-reading for its base),
  a cover / rock factor (Hessen Fig. 4.1-1: > 20 m of rock cover 100–145 % against 140–190 % at 10–20 m), and the
  research/63 split itself (an ŘSD estimate, our own non-tunnel price, another alignment).
