# 75 — Nature protection areas: data, what the law forbids, how the game treats them (2026-11-17)

Why: research/73 found that the real D35 tunnel's length follows from the nature monument PP Pod skálou on the
escarpment. Our model had no protected areas, and Auto's tunnel exits inside the monument. The owner asked for
every scenario pack to carry them: a violation with a sourced basis where works stand in a protected site, and
Auto avoiding them as real designers do. Implementation: `pipeline/fetch_protected.py`, `build_protected.py`,
`src/core/data/protected.ts`, `protected-areas.ts`, `nature-works.ts`.

## Data

AOPK ČR open data, ArcGIS service `https://gis.nature.cz/arcgis/rest/services/Aplikace/Opendata/MapServer`.
Licence: "Všechna data v mapové službě podléhají licenci Creative Commons (CC-BY 4.0): Uveďte původ" (service
description, opened), shown as "© AOPK ČR". Layers used:

- 0: large protected areas (CHKO, NP), and a national park's protection zone (KAT "OP");
- 1: their zones (CHKO I–IV, NP A–D);
- 2: small protected areas (NPR, PR, NPP, PP);
- 3: protection zones of small areas, `OP_TYP` "ZAK" (the statutory 50 m) or "VYH" (declared);
- 6: Natura 2000 sites of community importance (EVL);
- 7: Natura 2000 bird areas (PO).

Polygons come simplified by the service to 1 m (`maxAllowableOffset`). They are clipped to the play area,
converted to the pack's local metres and filled even-odd on the 5 m grid (cell centres, like the land cover).

## What zákon 114/1992 Sb. forbids (quoted from [zakonyprolidi.cz](https://www.zakonyprolidi.cz/cs/1992-114), opened)

| Area | Provision | Game |
|---|---|---|
| NPR | §29: "Na celém území národních přírodních rezervací je zakázáno … b) povolovat nebo provádět stavby" | no works |
| PR | §34(1): "Na celém území přírodních rezervací je zakázáno … c) povolovat nebo provádět stavby" | no works |
| NPP | §35(2): "Změny či poškozování národních přírodních památek … je zakázáno" | no works |
| PP | §36(2): "Změna nebo poškozování přírodní památky … jsou zakázány" | no works |
| Protection zone (OP) | §37(1): "ochranné pásmo, ve kterém lze vymezit činnosti a zásahy, které jsou vázány na předchozí souhlas orgánu ochrany přírody"; undeclared, it is the land within 50 m of the area | **a note**: "needs the nature authority's consent" (owner's decision, 2026-11-17); no violation, no cost |
| EVL | §45c(2): "jsou chráněny před poškozováním a ničením … K zásahům, které by mohly vést k takovým nežádoucím důsledkům, si musí ten, kdo tyto zásahy zamýšlí, předem opatřit souhlas orgánu ochrany přírody"; §§45h–45i: Natura assessment, variants, overriding public interest | no works |
| PO | §45e(2): activities needing consent are set per bird area by government order; §§45h–45i assessment | a note only (no general ban) |
| NP | §16(2): "Na území národních parků mimo zastavěná území obcí … je zakázáno … b) povolovat nebo provádět stavby" | no works outside built-up areas (the land-cover built-up flag stands in for "zastavěné území") |
| CHKO | §26(1): "Na celém území chráněných krajinných oblastí je zakázáno … f) stavět nové dálnice"; (2) zone I: "a) povolovat nebo provádět nové stavby"; (3) zones I–II: "… provádět terénní úpravy značného rozsahu" | zones I–II: no works; zones III–IV: no works for motorways, a note for other roads (§44 consent) |

Exceptions exist (§43 exemptions in the public interest, §45i(8)–(9) overriding public interest). The game does
not model them: a player who builds there gets the problem, with the Act in its rule line.

"Works" = what takes ground: earthworks (cuttings, embankments and their slopes), bridge supports and ends,
tunnel entrances, the open pits of a tunnel dug from above (cut and cover), rebuilt and rerouted roads. A bridge
deck passing over an area and a mined tunnel under it take nothing. The EIA for D35 said exactly that of the
mined Dětřichov tunnel under PP Pod skálou: "Toto řešení je optimální" (research/73 §1).

## The packs (survey of the saved designs before Auto avoids the areas)

| Pack | Areas | Saved designs touching them |
|---|---|---|
| d11 | KRNAP zones A–D and its zone, CHKO Broumovsko III, PP ×4 with zones, EVL ×4, PO Krkonoše | none of the five D11 designs; the Královec railway starter: see the tests |
| d3, d3-03xx, d3-full | PP, PR, NPP with zones; EVL incl. Dolní Sázava (the river) | the Sázava bridge passes over EVL Dolní Sázava; one pier stands in it on d3-full and the d3 motorway starter |
| d35, d35-full | PP Pod skálou, PP Rychnovský vrch, NPR Rohová, PR Hřebečovský les, EVL Hřebečovský hřbet and others | the tunnel's east end, its pit and the first earthworks stand in PP Pod skálou |
| i16-nova-paka | PP, PR with zones, EVL Kozlov – Tábor | none |

## Not modelled

- Ventilation shafts and access roads of long tunnels (the D35 EIA asks for them to keep out of the EVL).
- Groundwater protection zones of water sources (research/73 found none relevant on D35).
- ÚSES (research/53: crossings, not bans).
- Exemptions and compensation measures.

## Implemented (cost model 42)

Owner's decisions (2026-11-17): a protection zone (§37) takes works with a note ("…need the nature authority's
consent"), no problem and no invented cost; the no-works rule applies to the areas themselves; tunnels: Auto keeps
to 3 %, the player gets a note above 3 % and a problem above 5 % (NV 264/2009 annex 2.2). Not taken: the ×0.89 tube
width and the rock-cover factor (research/73 §5, too weak), running costs (research/74, owner to decide).

- Problems: basis "law", the Act's section in the rule line, a computed fix (a bridge from km … to km … with no
  supports in the area, a tunnel at least 14 m below the ground, or another line). Notes: one per area on a
  stretch card.
- Auto (evaluate.ts): an area under our crown is a hard clearance of the grade search (a bridge's height over it,
  only where the area is at most 180 m long along the road; or 14 m under it, mined); within a dug tunnel end's
  reach of it (≈ 30 m), no tunnel end. Bridge supports and ends stand clear (support-layout.ts); a wall keeps a slope
  out, else a bridge or tunnel (retaining.ts); rebuilt roads and reroutes do not enter.
- Results (model 41 → 42): every starter VALID; d35 stage-1 Auto builds a 3,159 m tunnel under Pod skálou at
  ≤ 3 %, out of its forest (research/73 §6); the D3 Sázava viaduct's piers leave EVL Dolní Sázava (820 → 929 m).
- Not modelled: the QA's new lines across Královec run through EVL Krkonoše and are problems there (their crossing
  tests load the pack without areas); Auto's tunnel of a steep road may still exceed 5 % where its structure choice
  tunnels a deep cut on a steep grade (said on the card).
