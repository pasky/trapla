# Where a fill meets a bridge: spill-through cones (playtest sweep 3, P1 #4; cost model 40)

Snapshot 2026-11-17 (qa3-realism-fixes agent). QA: high fills ended at a bridge in a vertical face under the deck (D3
0302 km 2.63 and 3.05, 41 / 47 m; a Královec railway bridge): not clickable, not billed, not a real abutment.

## What is implemented (`core/abutment-cone.ts`)

- **Geometry** (VL 4 Mosty 2021 sheets 204.02, 206.02, 206.03; §1 below): at a bridge end whose neighbour is
  earthwork, the abutment stands on top of the fill and the fill runs on under the end span as a cone: its top a
  deck depth (2 m, PROVISIONAL: span / 20 plus bearing) under the road, a 0.6 m berm, then 1:1.5 down to the ground,
  quarter cones round the crest corners. Where the ground is within 0.5 m of the cone's top (an abutment set into a
  bank) there is none.
- **Billed**: its fill (summed over the ground on a 2 m grid) joins the embankment beside the bridge end and the mass
  balance (placing, haul, borrow as any fill); its paving under the deck (deck width + 1 m, down the slope: 200 mm
  quarry stone on 150 mm C20/25, 2,148 CZK/m², OTSKP 465512 + 45131A) and its toe sill (0.5 × 0.8 m C25/30, 3,394
  CZK/m, OTSKP 467314) with the bridge (the D5 Rokycany SO 201 bill of quantities bills its cones inside the bridge
  object). Not billed separately (inside SPK's bridge row: "úprava přechodových oblastí"): the transition slab and
  wedge; not billed: the extra pile length through the fill under the abutment, the quarter cones' land beyond the
  deck strip (PROVISIONAL omissions).
- **Weighed by Auto**: a run's price in the structure choice includes its cones on level ground (prism 0.75 B h² and
  quarter cones 1.178 h³ at the starting fill value, research §4) and their paving; an embankment between two bridges
  that costs more than bridging the gap, its two cones counted, is bridged (direct-80 km 8.41–8.88: two bridges with
  a 34 m fill island between → one).
- **No pier on a cone**: the bridge's first pier stands at least 0.5 m beyond the toe (support-layout `coneReach`),
  so its end span reaches past it (research §2: "the cone toe must fall within the end span").
- **The longest end span**: where a cone would reach further than 60 m (the longest regular span of either style,
  data/bridges.ts) the abutment stands further out, where the fill is lower: Auto's bridge goes on (≈ 40 m of fill at
  most on level ground). Czech abutment fills documented are 7–14 m (§2); none in a 20–47 m fill. Below 60 m the
  height is left to the price.
- **Drawn and clickable**: the cone surface (earth; paved part concrete-coloured) from the last earth station under the
  deck, quarter cones included; the abutment's front wall only from the road down to the cone's top. A click on a
  cone selects its bridge, whose card says "Its ends stand on fills 7 and 20 m high, sloping on under the bridge:
  22,392 m³ of fill, 3.9 M CZK of paving" (D3 0302, the Sázava bridge).

## What it does

D3 0302: its Sázava bridge now ends where the fills are 7 and 20 m (together with research/67's line: one 1,678 m
bridge). D11 direct-80: 25 cones, 14 bridges; its 8.58 km end stood on a 34 m fill (cone reaching 56 m): now one
bridge km 8.41–8.88. Frozen D11 bills with cones against without (research/67's table, measured as the mechanisms were added): straight +134, best +6, demo
+125, direct-80 +84, direct-90 +161, town-centre +280 M CZK.

## Research pass (sources)


Research snapshot 2026-11-17. CZK excl. VAT, OTSKP 2026 price level. Labels: **Sourced** = the cited
document states it (quoted, page given; PDF page = PDF page index); **Derived** = shown arithmetic or a
reading of a drawing or BOQ; **UNVERIFIED** = not found, or only a secondary source.
Local copies used: `/tmp/q3/` (VL 4 2021 PDF, SPK CN 2026 ZIP, OTSKP 2026 extract `/tmp/otskp-all.json`,
D5 Rokycany BOQ).

## Findings at a glance

- **The Czech standard detail is an abutment that stands on top of the fill, with the fill running down in
  front of it as a paved 1:1.5 slope (the "svahový kužel").** VL 4 (MD ČR, 2021) sheets 206.02/206.03
  ("Úprava před opěrou") draw a 1:1.5 slope paved with 200 mm quarry stone set in 150 mm of concrete, a
  ≥ 600 mm berm in front of the abutment and a 0.5 × 0.8 m concrete toe sill. Sheet 204.02 drains the
  back of the abutment "do svahového kužele". **Sourced.**
- **Czech motorway valley bridges use exactly this layout:** "Krajní opěry se skládají ze základu,
  úložného prahu s bločky, závěrné zídky a rovnoběžných zavěšených křídel" (D11 1106). On the D1, an
  abutment sits on a 13 m fill on 22 m piles, about 8 m of which pass through the fill. **Sourced.**
- **No Czech height threshold for "wings vs cone" was found.** French SETRA practice, from a secondary
  source: a full-height closed abutment ("culée remblayée") only "pour une hauteur limitée à une dizaine
  de mètres"; otherwise use a buried abutment in a 3/2 fill. **UNVERIFIED** (secondary).
- **Real Czech motorway fills at abutments are about 7–14 m. None of 20+ m was found.** D35 Loučná:
  "výšku násypu v místě opěr (až 14 m)", which needed consolidation surcharges, and the end spans were
  added after consolidation. D1: 13 m and 7 m. D3 Sázava (787 m): the far end runs into "hlubokém
  zářezu". **Sourced** examples; reading them as a cap is **Derived** (absence of evidence).
- **Transition zone ≈ 1.5 × fill height behind the abutment** (ČSN 73 6100-1 term 7.2.11). Transition
  slabs in real projects: **5.0 m × 0.30 m** (Olbramovice), **6.5 m × 0.30 m** (D5 Rokycany),
  4.1 m (Jablonné). **Sourced** projects. The ČSN 73 6244 rule for slab length is **UNVERIFIED**
  (the standard is paywalled).
- **SPK CN 2026 A.2 (bridges) includes the substructure and "úprava přechodových oblastí", and is
  measured between the ends of the wings.** Cones are not named. In a real tender BOQ (D5 SO 201), the
  cones, the paving in front of the abutment, the backfill, the transition wedge and the transition slabs
  are all items **inside the bridge object**. **Sourced** (text and BOQ). That SPK therefore covers them
  for standard ≤ 8 m bridges is **Derived**.
- **The engine's provisional abutment (12 m³ per m width incl. wings) matches a real BOQ:** D5 SO 201 has
  224.3 m³ for two abutments 8.8 m wide = **12.7 m³/m**, at about 7.5 m fill, abutments with cones.
  **Derived** (from a Sourced BOQ).

## 1. Czech practice for bridge ends in fills

### 1.1 Standard sheets: MD ČR, VL 4 Mosty (2021)

Source: [VL 4 – Mosty, approved MD-5181/2021-120/2, effective 1 Mar 2021](https://upload.wikimedia.org/wikipedia/commons/c/cb/VL_4_2021_Mosty.pdf)
(an official mirror; the original is distributed on pjpk.cz). The list of sheets is on PDF p. 8. The
drawings are rasters; I read them from renders.

| Sheet (PDF p.) | What it fixes | Label |
|---|---|---|
| 201.01 "Přechodová oblast s přechodovou deskou" (p. 33) | Behind the abutment, in order: "zásyp za opěrou (čl. 5.4)", "podkladní přechodový klín (čl. 5.6)" at **1:1**, a sealing layer, a protective drainage backfill and a drain; the lower backfill boundary is **1:n**, starting ≥ **1000 mm** behind the heel. Note 1: "Délka přechodové oblasti Lo a přechodové desky Ld se stanoví dle ČSN 73 6244". Note 4: if the subsoil fails the settlement check, "je třeba učinit opatření pro urychlení konsolidace (např. svislé drény apod.)". Slab ≥ 3 % fall. | Sourced |
| 201.02–201.07 (pp. 34–39) | Variants: no slab, separate or strengthened transition wedge, buried structure, semi-integral and integral bridges | Sourced |
| 204.02 "Odvodnění rubu opěr – vyústění ve svahovém kuželu" (p. 42) | Drain from behind the abutment carried down the cone in concrete channels to the ditch. Note 4: soakaway "až mimo patu svahového kužele" (beyond the toe of the cone). This confirms the cone is the standard thing in front of the abutment | Sourced |
| 206.02 "Opevnění svahu z lomového kamene" (p. 44) | "ÚPRAVA PŘED OPĚROU": slope **1:1.5**, "opevnění svahu dlažbou z lomového kamene tl. 200 mm do betonu C20/25n-XF3 tl. 150 mm"; berm in front of the abutment **min. 600 mm** at 5–10 %; toe "betonový práh C25/30 XF3" **500 × 800 mm**; bedding steps every max. 5 m. Along a wing: min. 500 mm strip and a 100/250 kerb. Note 3: "Úprava platí i pro boční obrubník svahového kužele" (the same detail applies to the side kerb of the cone) | Sourced |
| 206.03 "Opevnění svahu z betonové dlažby" (p. 45) | Same geometry, with **60 mm** concrete paving in 150 mm C20/25 | Sourced |
| 206.22 / 206.23 (pp. 47–48) | Paving at the wing end over **5.0 m** (may be shortened to 2.5 m); "rozšíření násypového tělesa **10 000**" (the fill crest is widened over 10 m before and after the bridge) | Sourced |

### 1.2 Teaching texts

- Šertler & Pokorný, *Mosty* (UPCE mirror, [PDF](https://vladimirsuchanek.upce.cz/files/Mosty_-_cast_1.pdf)),
  printed p. 55 (PDF p. 57): "Opěry kromě reakcí od nosné konstrukce mostu zachycují i tlak zeminy a
  uzavírají společně s křídly krajní část mostního otvoru vůči zemnímu tělesu … celkové uspořádání
  tížné … opěry včetně přiléhajících **násypových kuželů** v standardním klasickém uspořádání."
  (Translation: besides the deck reactions, abutments carry earth pressure and, together with the wings,
  close the end of the bridge opening against the fill … a gravity abutment with the adjoining fill
  cones, in the standard classic layout.) **Sourced.**
- Same text, p. 57 (PDF p. 59), Fig. 7.8: "plovoucí opěry, kdy základ může být přímo na terénu nad
  překážkou … a celé krajní pole mostu představuje přechodovou část. Nebo část dříku a úložný práh se
  **zavěšeným křídlem** jsou umístěny na pilotách" (floating abutments: the footing sits on the ground
  above the obstacle and the whole end span is the transition. Or part of the stem and the bearing shelf
  with a suspended wing stand on piles). Wings may be "rovnoběžná, kolmá a šikmá" (parallel,
  perpendicular, skewed; p. 58). **Sourced.**
- ČVUT *Betonové mosty 1*, lecture 5 (search snippet only; the [PDF](https://concrete.fsv.cvut.cz/~drahomic/Vyuka/BM01/Prednasky/BM01_Pr05.pdf)
  now returns 404) lists the abutment types "Nízká opěra na násypu", "Vysoká opěra s plošným základem",
  "Opěra s rovnoběžnými křídly". **UNVERIFIED** (no text available).

### 1.3 Real Czech motorway abutments

| Project | Abutment layout | Source | Label |
|---|---|---|---|
| D11 1106 HK–Smiřice, valley bridges | "Krajní opěry se skládají ze základu, úložného prahu s bločky, závěrné zídky a rovnoběžných zavěšených křídel." Piles Ø 880. "v přechodových oblastech mostních objektů navrženo opatření v podobě **štěrkových pilot**" (gravel piles) to speed up consolidation under high fills | [ebeton 2022](https://www.ebeton.cz/clanky/2022_3_04_mostni-objekty-na-dalnicnim-useku-d11-1106/) | Sourced |
| D1 estakáda "M1" (≈ 20 years old) | "Výška násypů za oběma opěrami … cca **13 m**. V tomto případě je **opěra umístěna na tělese násypu**, piloty tedy procházejí v úseku cca **8 m** své délky samotným násypovým tělesem, délka pilot je u obou opěr **22 m**." (The abutment stands on the fill; 8 m of its 22 m piles run through the fill.) | [Midas/Ing. article 2025](https://www.midascivil.cz/novinky/analyza-sedani-mostnich-oper-na-dalnici-d1-pomoci-3d-matematickeho-modelovani-v-midas-gts-nx) | Sourced |
| D1 three-span "M2" | 7 m fills; "horní hrana základu opěry zhruba v úrovni původního terénu" (a full-height abutment founded at ground level); piles 16 m | same | Sourced |
| D35 Časy–Ostrov, Loučná estakáda 464 m | "s ohledem na výšku násypu v místě opěr (**až 14 m**) … v místě krajních opěr vybudovány **konsolidační násypy**" (consolidation surcharges at the abutments); "první a poslední pole byla vynechána a budou dodatečně dobudována **po skončení konsolidace**" (first and last spans left out until consolidation ended) | [silnice-zeleznice.cz](https://silnice-zeleznice.cz/silnice/mostni-estakada-na-dalnici-d35-v-useku-casy-ostrov-493) | Sourced |
| D11 SO 209 Poříčí (696 m) | O1 on Ø 1.2 m piles; "Krajní opěry O1 a O7 jsou masivní železobetonové, složené z dříku, závěrné zídky a křídel"; O7 on micropiles in a rock slope (the bridge ends in rock, not in a fill) | [ebeton 2026](https://www.ebeton.cz/clanky/2026_1_70_most-so-209-pres-porici-na-dalnici-d11/) | Sourced |
| D5 Rokycany feeder, SO 201 (38.2 m, 9.5 m) | Quarter cones on both sides of each abutment, paving in front of the abutment, slabs 6.5 m (details in §3.3) | [BOQ, smlouvy.gov.cz](https://smlouvy.gov.cz/smlouva/soubor/36008220/Rokycansko-D5%201ET_SP.pdf?backlink=cl8k5) PDF pp. 335–360 | Sourced |
| Typical small-bridge paving extent | "Svahy pod mostem, lavičky před lícem opěr, pruhy podél a za rovnoběžnými křídly budou zpevněny dlažbou z lomového kamene … pod mostem je ukončena patními zídkami." (Slopes under the bridge, berms in front of the abutments and strips along and behind the wings are paved; under the bridge the paving ends at toe walls.) | [KÚ JčK decision (D3 area), PDF line ≈ 1298](https://www.starehodejovice.cz/wrs_frontend/download.php?file=2023-6381604212525.pdf&param=94390) | Sourced |
| Other cone slopes in documents | "Svahové kužele jsou navrženy ve sklonu 1:1,5" (VRT Prosenice EIA); "svahový kužel … ve sklonu 1:2" (VUT thesis, Blansko); "ve sklonu 1:1 odlážděny" (old railway bridge, 2000) | search snippets: [cenia EIA](https://portal.cenia.cz/eiasea/download/RUlBX01aUDUyNl9kb2t1bWVudGFjZURPQ183NTQ1NzA0OTk0ODMwNjgwNTEucGRm/MZP526_dokumentace.pdf), [VUT](https://www.vut.cz/www_base/zav_prace_soubor_verejne.php?file_id=121793) | Sourced (snippet) |

### 1.4 When to use wings and when a cone

- **Czech numeric rule: not found** (ČSN 73 6201, the "13.13 Zpevnění svahů a svahových kuželů" clause,
  is paywalled; only the table of contents was visible, [ČSN 73 6201 preview](https://www.normservis.cz/download/view/csn/73/17145/17145_nahled.pdf)).
  **UNVERIFIED.**
- French SETRA tradition, secondary course text ([Soltani, "Les appuis de ponts", Scribd](https://fr.scribd.com/document/717770440/Appuis)):
  "C'est vers ce type de culée [enterrée] que le projeteur doit s'orienter au début … Une culée
  enterrée suppose une implantation en retrait … Il en résulte un allongement du tablier … largement
  compensé … En général, les remblais sont talutés à 3/2". (Start from the buried abutment; it is set
  back, the deck gets longer, and that is more than paid back; fills are sloped 3:2.) The search snippet
  of the same doc adds: "Une culée remblayée ne peut se concevoir que pour une hauteur limitée à une
  dizaine de mètres" (a full-height abutment only for heights up to about ten metres). **Sourced** for
  the first quote (secondary). The 10 m limit is **UNVERIFIED** (snippet only).
- **Derived:** a closed abutment holding a fill of height H with parallel wings needs wings about
  1.5·H long to hold the 1:1.5 side slopes. Real suspended wings are short: 3.8 m
  ([cisteves.cz](https://www.cisteves.cz/file-download/11820/)) and 7.5 m (VUT thesis 121609, snippet).
  So wings stop working at roughly H ≈ 5 m, and above that the cone takes over. **Derived / UNVERIFIED**
  as a threshold.

### 1.5 Where the cone sits relative to the spans

- The deck's end span crosses over the cone. The abutment's bearing line is at the top of the cone, and
  the cone toe lies under the end span (VL 4 206.02 geometry; Soltani "allongement du tablier";
  Šertler & Pokorný Fig. 7.4). **Sourced** (qualitative).
- Horizontal reach from the abutment face to the toe = berm 0.6 m + 1.5·h_a, where h_a = fill height at
  the abutment front. For h_a = 14 m that is 21.6 m; for 30 m it is 45.6 m. **Derived.**
- The first pier must stand beyond the toe (paving sill 0.5 m), unless it is designed to stand inside the
  cone. **UNVERIFIED** as a rule. It is consistent with VL 4 drawing the paving down to a sill.

## 2. Heights at which abutments stand in a fill, and where valley bridges end

| Item | Value | Label |
|---|---|---|
| Fills at abutments, documented CZ motorways | D1 7 m and 13 m; D35 up to 14 m; D3 0310/II Plavnice "konsolidací násypů v místě opěr" (research/52); D11 1106 gravel piles in transition zones; D1 Jánovce (SK) > 12 m reinforced bridge approach (research/52) | Sourced |
| Largest documented | **14 m** (D35). No Czech abutment found in a 20–47 m fill | Derived (absence of evidence) |
| D3 Sázava 787 m (0302, km 12.5) | Deck up to 113 m above the valley. The south end goes into a deep cut: "Za mostem je trasa vedena v hlubokém zářezu" ([ŘSD leaflet](https://www.dalniced3.cz/public/files/documents/infoletak-d3-0302-jilove-hosteradice.pdf), p. 2). The north end is near the Luka tunnel's south portal. No end heights were published | Sourced (cut); north end UNVERIFIED |
| Transition zone length | "část zemního tělesa přiléhající k opěře … do vzdálenosti asi **1,5 násobku výšky násypu** (zásypu) od rubu opěry … vlivy nestejného sedání" (the part of the fill next to the abutment, out to about 1.5 × the fill height behind it, where uneven settlement shows) ([ČSN 73 6100-1 term 7.2.11, nlfnorm](https://www.nlfnorm.cz/terminologicky-slovnik/144416)) | Sourced |
| Consolidation time | 95 % consolidation in 259–1008 days on D47/D1 fills (research/52, Karlín 2013). D35 delayed its end spans | Sourced (research/52) |
| Designers' rule "end the bridge where the fill is X m" | Not found (CZ, DE, FR). Research/52 already reports no sourced bridge-or-fill break-even height | UNVERIFIED |
| Geometric limit (Derived) | The cone toe must fall within the end span: 0.6 + 1.5·h_a ≤ L_end. With the engine's 30 m spans: **h_a ≤ 19.6 m** | Derived |
| German RE-ING / Austrian RVS | Not reached: the Kordina (TU BS) paper and the RiZ-ING "Wid" sheets were blocked or not fetched | UNVERIFIED |

## 3. Costs

### 3.1 OTSKP 2026 items ([SFDI ZIP](https://sfdi.gov.cz/wp-content/uploads/2026/04/otskp-2.zip), item set XLSX; prices checked against research/16 for 333325)

| Code | Item | Unit | CZK | Label |
|---|---|---|---:|---|
| 333325 | Mostní opěry a křídla ze ŽB do C30/37 (incl. formwork and falsework per spec) | m³ | 9,377.28 | Sourced |
| 333365 | Výztuž mostních opěr a křídel B500B | t | 40,874.37 | Sourced |
| 272325 / 272365 | Základy ze ŽB do C30/37 / výztuž | m³ / t | 5,775.35 / 40,761.57 | Sourced |
| 420324 / 420325 | Přechodové desky mostních opěr ŽB C25/30 / C30/37 | m³ | 5,360.58 / 5,746.13 | Sourced |
| 420365 | Výztuž přechodových desek B500B | t | 41,635.80 | Sourced |
| 451312 / 45131A | Podkladní a výplňové vrstvy z prostého betonu C12/15 / C20/25 | m³ | 4,242.32 / 4,648.04 | Sourced |
| 465512 | Dlažby z lomového kamene na MC (incl. "nutné zemní práce (svahování …)"; **excl.** "podklad pod dlažbu, vykazuje se samostatně položkami SD 45") | m³ | 7,252.50 | Sourced |
| 465511 | Dlažby z lomového kamene na sucho | m³ | 4,236.15 | Sourced |
| 465921 / 465922 | Dlažby z betonových dlaždic na sucho / na MC | m² | 952.63 / 1,101.04 | Sourced |
| 467314 | Stupně a prahy … z prostého betonu C25/30 (proxy for the toe sill) | m³ | 8,483.77 | Sourced (proxy choice Derived) |
| 45852 | Výplň za opěrami a zdmi z kameniva drceného | m³ | 1,293.46 | Sourced |
| 45861 | Výplň za opěrami a zdmi ze zeminy stabil. cementem | m³ | 1,633.65 | Sourced |
| 17513 | Obsyp … ze zeminy upravené pojivy | m³ | 581.47 | Sourced |
| 17581 | Obsyp potrubí a objektů z nakupovaných materiálů (the D5 BOQ uses it for cones and backfill) | m³ | 1,104.63 | Sourced |
| 17110 / 17180 | Uložení sypaniny do násypů se zhutněním / z nakupovaných materiálů | m³ | 89.60 / 635.85 | Sourced |
| 18242 | Založení trávníku hydroosevem | m² | 29.35 | Sourced |

Derived unit rates:

- **Stone paving per VL 4 206.02:** 0.20 m × 7,252.50 + 0.15 m × 4,648.04 = **2,148 CZK/m²**.
  The D5 BOQ shortcut ("465512 R … včetně lože a prahů", 0.4 m) gives 0.4 × 7,252.50 = **2,901 CZK/m²**.
- **Concrete paving per VL 4 206.03:** 1,101.04 + 697.21 = **1,798 CZK/m²**.
- **Toe sill** 0.5 × 0.8 m: 0.4 m³/m × 8,483.77 = **3,394 CZK/m**.
- **Transition slab** 0.30 m with 0.20 t/m³ rebar (the D5 BOQ ratio) on a 0.15 m C12/15 bed:
  0.3 × 5,360.58 + 0.06 × 41,635.80 + 0.15 × 4,242.32 = 1,608 + 2,498 + 636 = **4,742 CZK/m²**.

### 3.2 What SPK CN 2026 A.2 (bridge row) includes

Source: [SPK CN 2026 ZIP](https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip), *Příloha č. 1 – průvodní zpráva*,
PDF p. 8 (A.2 Standard „Mosty"). **Sourced:**

- Measured length: "Délka mostu v km stanovená podle ČSN 736201 – tj. **délka spojnice konců křídel
  mostu**, měřená v ose mostu … Délka mostů s kolmými nebo šikmými křídly se stanoví, jako by křídla byla
  navržena rovnoběžná." (Bridge length = the line joining the ends of the wings, measured on the axis;
  bridges with perpendicular or skewed wings are measured as if the wings were parallel.) The ČSN term
  agrees: délka mostu = "průměrná podélná vzdálenost mezi konci mostních křídel anebo mezi jinými
  ukončeními mostu" ([ČSN 73 6100-1 11.1.9, nlfnorm](https://www.nlfnorm.cz/terminologicky-slovnik/144581)).
- Included: "náklady spojené se zakládáním opěr a pilířů, spodní stavbu mostu, nosnou konstrukci, …
  **úprava přechodových oblastí**, osazení ložisek a dilatačních závěrů …" (foundations of abutments and
  piers, the substructure, the deck, … treatment of the transition zones, bearings and joints).
- Excluded: "zvýšení nákladů spodní stavby mostu v případě výšky větší než 8,0 m", "náklady na
  zakládání … v území nestabilním …", "úpravy prostoru pod mostem" (extra substructure cost above 8 m;
  foundations in unstable ground; works in the space under the bridge).
- Cones and slope paving are **not named** in either list. **UNVERIFIED** whether they count as
  "spodní stavba / přechodová oblast" or as "úpravy prostoru pod mostem".
- **Derived:** the road standard A.1 is measured "bez délky mostů" (without the bridge length, same
  document, PDF p. 6). So earthworks inside the bridge length, which includes the cone, are not in the road row.

### 3.3 Real BOQ: what a bridge object contains (D5 Rokycany SO 201, 2019, OTSKP item codes)

[Soupis prací](https://smlouvy.gov.cz/smlouva/soubor/36008220/Rokycansko-D5%201ET_SP.pdf?backlink=cl8k5), SO 201
"Most v km 1.493 přes Voldušský potok", measured "M2 422,10". **Sourced:**

| Item | Quantity line (verbatim) | PDF p. |
|---|---|---:|
| 17581a obsyp (cones) | "Obsyp podpěr na líci křídel (**svahové kužele**) a před opěrou (pod dlažbu): 2\*3,14159\*13\*13\*7,5/3/4+2\*3,14159\*15\*15\*7,6/3/4+2\*11\*3 = 1 625,014" m³ | 341 |
| 17581b backfill | "Zbytek obsypu krajních opěr na rubu v přechodové oblasti: 8,8\*(25,4+29,1)=479,600" m³ | 342 |
| 17581c | "Ochranný obsyp objektu a přechodový klín: 8,8\*(9,8+10,5)=178,640" m³ | 343 |
| 333325 | "Monolitické opěry a křídla: … =224,325" m³; rebar 0.25 t/m³ | 351 |
| 420324 | "Monolitické přechodové desky: 2\*0,30\*6,5\*8,8=34,320" m³; rebar 0.20 t/m³ | 354 |
| 451312 | includes "podkladní beton pod přechodové desky" | 359 |
| 465512 R | "Veškeré zpevnění, skluzy a vývařiště: … =108,440" m³ (laid 0.4 m thick) | 360 |

**Derived:**
- Cones are quarter cones, V = πR²H/12 each, two per abutment. Here R/H = 13/7.5 = 1.73 and 15/7.6 = 1.97.
- Backfill plus wedge ≈ 35–40 m² per m of width for abutments about 7 m high.
- Abutment concrete = 224.3 / (2 × 8.8) = **12.7 m³ per m width**, which matches the engine's 12.

## 4. Model proposal

Notation:
- h_a = fill height at the abutment front: road surface minus ground there.
- B = formation (crest) width.
- W = deck width.
- h_ab = abutment height from foundation top to road level.

### 4.1 Geometry (what Auto designs and what is drawn)

| Case | Design | Label |
|---|---|---|
| h_a ≤ ~3 m | As now: the abutment stands at ground level with short parallel wings, and the fill slopes run past the wings | Derived (D1 M2 is a full-height abutment at 7 m; VL wing details) |
| 3 m < h_a ≤ **h_max** | **Abutment on top of the fill (in a cone):** bearing shelf, back wall and short parallel suspended wings, founded on piles through the fill. In front, a 0.6 m berm, then the fill slope at **1:1.5** down to ground, with **quarter cones of radius 1.5·h_a** around the wing ends meeting the normal side slopes. The deck's end span crosses the cone. Paving covers the cone slope under the deck footprint plus 0.5 m each side, ending at a toe sill. The rest is grassed. The transition slab is 5 m long behind the back wall | Sourced (VL 4 sheets 204.02, 206.02/03, 206.22; D11 and D1 examples) / Derived (exact extents) |
| h_a > h_max | Not built in practice. **Auto lengthens the bridge** to the nearest station where h_a ≤ h_max, comparing cost. A player's override may keep a higher end: bill the full cone and show a game-rule warning ("the bridge ends in a very high fill: extend it") | Derived |
| h_max | **15 m** proposed. The documented maximum is 14 m (D35) and the geometric cap is 19.6 m with 30 m spans. Optionally h_max = min(15, (L_end − 0.6)/1.5) | Derived (PROVISIONAL) |
| First pier | Must stand ≥ 0.5 m beyond the cone toe (station of abutment + 0.6 + 1.5·h_a). Otherwise move it or lengthen the end span | Derived |
| Abutment foundation | Piles = the standard 15 m + depth of fill under the abutment footing, (h_a − h_ab). D1 M1: 13 m fill, 22 m piles, 8 m through fill | Sourced example / Derived rule |
| h_ab | ≈ 7 m, i.e. deck depth + bearing + about 3–4 m stem and footing (D5 cones H ≈ 7.5; D1 M1 13 − 8 ≈ 5 m) | Derived |

### 4.2 What is billed per bridge end (new explicit items)

| Item | Quantity | Rate | Label |
|---|---|---|---|
| Cone fill | V = 0.75·B·h_a² (front 1:1.5 prism across the crest) + 2·πR²h_a/12 with R = 1.5·h_a (= 1.178·h_a³), minus fill already billed by the road cross-sections at those stations | The engine's own embankment rate: site fill from cut, or 17180 at 635.85 if imported. The D5 BOQ used 17581 at 1,104.63 (small bridge, bought material) | Derived (geometry), Sourced (rates) |
| Cone paving | A = (W_total + 1.0) × 1.803·h_a, where 1.803 = √(1+1.5²) is the slant per metre of height | 2,148 CZK/m² (stone, VL 206.02), or 2,901 (BOQ-style 0.4 m), or 1,798 (concrete paving) | Derived |
| Toe sill | W_total + 1.0 m | 3,394 CZK/m | Derived |
| Grass on the rest of the cone | slant area of the cone minus the paved area | 29.35 CZK/m² (18242), or the engine's slope-finishing rate | Sourced / Derived |
| Extra pile length | n_piles × (h_a − h_ab) | 2,364.57–3,400.82 CZK/m bore + pile concrete and rebar, as in research/16 | Derived |
| Transition slab | 5.0 m × width between wings | 4,742 CZK/m² | Sourced (slab size), Derived (rate). **Already in SPK ("úprava přechodových oblastí"), see §4.3** |
| Backfill and wedge behind the abutment | A ≈ 0.5·h_ab² + h_ab + 10 m² per m width (≈ 41 m²/m at h_ab = 7, matching D5 at 35–40) | 45852 at 1,293.46 or 17581 at 1,104.63 | Derived. **Already in SPK, see §4.3** |
| Abutment and wings concrete | Keep 12 m³ per m width (D5 check: 12.7) | As research/16 | Sourced check |

Worked example (D27.5, B = 28 m, two decks totalling W ≈ 29.5 m, h_a = 12 m, per end). **Derived:**
- Cone fill: 0.75 × 28 × 144 + 1.178 × 1728 = 3,024 + 2,036 = **≈ 5,060 m³**.
- Paving: 30.5 × 21.6 = 659 m² × 2,148 = **1.42 M CZK**.
- Toe sill: 0.10 M CZK.
- Cone reach to the toe: 18.6 m.

The same at h_a = 30 m:
- Cone fill: 18,900 + 31,800 = **≈ 50,700 m³**.
- Paving: 3.5 M CZK.
- Reach: 45.6 m, more than one 30 m span. This is why real bridges do not end there.

### 4.3 What is already inside the bridge price (avoid double billing)

| Element | In SPK A.2? | In the engine's bridge bill now? | Proposal | Label |
|---|---|---|---|---|
| Abutments and wings, their foundations | Yes ("spodní stavbu", "zakládáním opěr") | Yes, as an explicit abutment item (12 m³/m, 15 m piles) | Keep. Add only the extra pile length through the fill (height-driven, outside the ≤ 8 m standard) | Sourced / Derived |
| Transition slab, backfill, transition wedge | Yes ("úprava přechodových oblastí") | Implicitly, in the fitted residual R | **Do not bill separately.** Show them on the card as included | Sourced (text) / Derived |
| Cone fill under the end span | Not named. In the BOQ it sits inside the bridge object. The road row excludes the bridge length | No: the fill currently ends in a vertical face | **Bill it** as earthworks (the volume grows with h_a³, far beyond the ≤ 8 m standard) | Derived |
| Cone paving and toe sill | Not named. In the BOQ it sits inside the bridge object | No | **Bill it.** For h_a ≤ 8 m this overlaps SPK by roughly 1 M CZK per end; accept it or subtract the 8 m share | Derived |
| Bridge length measure | Between the ends of the wings | The run between abutment stations | Mention only. Wings add about 2 × (1–8 m) to SPK's measured length; no change proposed | Sourced / Derived |

### 4.4 Not found / open

- The text of ČSN 73 6201 §13.13 (cone protection: extent and slope) and of ČSN 73 6244 §7.4 (rule for
  slab length): both paywalled. **UNVERIFIED.**
- A Czech or German numeric threshold for wings versus cone, and for the bridge-end fill height.
  **UNVERIFIED.**
- End heights of the D3 Sázava, D8 Ohře/Řehlovice and Lochkov bridges: not published in the sources
  reached.

### 4.5 After review (2026-11-17): what a cone may cover, cross slopes, cones that meet

- **A cone never covers a road, railway or stream under the bridge** (it had: the review's repro put 8.4 m of fill
  over a secondary road while the crossing read "bridge"). Designers either end the bridge with a closed abutment (a
  front wall holding the fill, wings along it) or lengthen it so the end span clears the cone and what lies below.
  The only height found for the closed abutment is SETRA's "une culée remblayée ne peut se concevoir que pour une
  hauteur limitée à une dizaine de mètres" (§1.4, secondary, **UNVERIFIED**). Rule (`CONE.closedMax` = 10 m,
  support-layout.ts): on a fill of at most 10 m the end is a closed abutment, no cone (billed as every abutment was
  before model 40, inside the bridge price: **PROVISIONAL**, its extra wall is not priced); above 10 m Auto's bridge
  goes on to the first end whose cone is clear, counting only what the footprint screen may not move aside (a minor
  road it may move only closes the end); where none is found within the abutment search's reach, and on the
  player's bridge, a closed abutment. D11 best: the end at km 6.99 over a service road is a wall; the 21 m fill at
  km 11.40 runs on 20 m past a 0.5 m stream (+32 M of bridge).
- **Cross slopes:** the cone's fill is summed row by row out to where it meets the ground on either side (the grid
  had been bounded by the ground on the axis: on a 30 % cross slope a 20 m cone stopped 9 m above the ground on its
  low side, unbilled and undrawn); the drawn mesh uses the same extents.
- **Two cones under a short bridge** each go to where their surfaces meet on the axis (no fill counted twice, no toe
  sill between them); the two directions of a motorway count their overlapping cones once (project-motorway.ts
  splitLedger).
