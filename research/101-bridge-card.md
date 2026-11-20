# 101 — A bridge for your desk: the printed bridge card (2026-11-20)

Why: the board's astra-8 (memo of 2026-11-19): More → Print bridge card gives one landscape A4, folded once along its
middle and stood as a tent; one face the bridge in side view over its ground, the other the bridge from above over
what passes under it. The owner's condition: only if it reads at true proportions on paper; beam and long-span bridges
first; the plan shows what passes underneath, railways included, and river names if the packs carry them cheaply.
Used by `src/ui/bridge-print.ts`; `pipeline/build_water_names.py` (a pack's `water-names.json`).

## What is drawn, and from where

- One scale for both faces, heights to the same scale as lengths (no exaggeration): the larger that fits 267 mm
  across and 58 mm up. The D3 0302 starter's 1,488 m bridge prints at ≈ 1 : 5,600 (146 m high = 26 mm), the
  Šternberk 240 m viaduct at ≈ 1 : 1,000. A scale bar of a round length.
- Side face: the ground under the line (`Result.ground`), our road's height (`grade`), the deck from each span's depth
  as the 3D view draws it (`render/bridge-surface.ts` `bridgeDeckSpans`: span / 20, at least 1.2 m), the piers where
  the bill and the footprint place them (`Run.pierStations`, 2.4 m along the line as `core/footprint.ts` adds them),
  the abutments at the bridge's ends.
- Plan face (printed upside down: upright once folded): every deck of the project there (both directions of a
  motorway; their crown widths), the mapped roads (`overlays.net` and the mapped bridges, at their class's width),
  railways from the transport graph (dashed and named "railway, in a tunnel" where mapped in a tunnel; the Žampach
  viaduct by its name, research/96), the watercourses (`watercourses.json.gz`, their mapped or class width) with their
  OSM `name` (`water-names.json`: the reach ids of the pack in the same OSM snapshot it was built from,
  `pipeline/cache/osm_<id>_watercourses_v1.json`; none for the i35 packs, whose snapshots are not cached). Names only
  for what passes within 40 m of the deck, each once.
- Arch bridges are left out for now (their ribs and columns are not drawn on the card).

## Checked on paper (2026-11-20)

`scripts/eggs-shots.mjs --only print` prints the D3 0302 starter's bridge and the Šternberk viaduct to PDF
(Chromium, A4 landscape, no margins; `/tmp/trapla-eggs/bridge-card-*.pdf`), looked at at 110 dpi: the side faces read
as a long viaduct over a deep valley and a short one over a shallow one; the 0302 plan face names the Sázava, the
railway (in a tunnel where the deck crosses it) and road II/106; the Šternberk one names Sprchový potok and Jívavská.
A physical print and fold is for the owner.
