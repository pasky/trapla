# 99 — The mapped ground in the profile and on a cut's card, in plain words (2026-11-20)

Why: the board's fable-8 (memo of 2026-11-19): name the mapped ground under the line, the long section's own
convention (a geology band under the ground line), behind the profile's Key ▾ toggle, off by default, and one
"Mapped ground: …" line in a cut's More. Used by `src/ui/ground-words.ts`; nothing priced changes.

## What is shown

- The classes are the game's own, from `pipeline/ground_profiles.json`: the ČGS geological map 1:50,000 (GEOCR50,
  `pipeline/geology.py` `classify`, research/03 and /10) grouped by how they dig; where GEOCR50 has no polygon, the ČGS
  engineering-geology zoning 1:50,000 (IG rajony, `ig_<code>`, the zone's own ČGS name, e.g. "IG Ss: Rajon
  pískovcových a slepencových hornin" — "zone of sandstone and conglomerate rocks"). Unmapped cells
  (`unknown`, priced by the norm's mix) get no band and no line: nothing is said that the map does not say.
- Plain words: each class's ČGS name shortened to what a non-geologist reads (rock names kept; "Quaternary alluvium /
  floodplain deposits" → "river silt and sand"; "Anthropogenic fill" → "made ground"). The table is in
  `ground-words.ts`; the period names (Quaternary, Permian …) are left out as jargon (two classes of different age may read
  alike, "sandstone and conglomerate"; their colours differ).
- Colours: our own, in the manner of a geological map (loose ground in yellows, Permian in reds, Cretaceous in
  greens, crystalline rock in pinks and violets, limestone in blue, igneous rock in red). No ČGS colour scheme is
  claimed.
- The band follows the ground line at 6 px, the share in a cut's More is by its length on the 25 m ground grid
  (classes under 5 % left out). The weathering depths that price the cut (`classIto` / `classIIto`) are not shown:
  they are estimates (core/ground.ts) and the card already prices the cut.
