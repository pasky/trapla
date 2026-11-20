# 100 — Which sea a tunnel's or a cut's ends drain to (2026-11-20)

Why: the board's fable-1w (memo of 2026-11-19): where our tunnel or cut has its two ends in different seas' basins
(checked per end, so it follows the player's design), its card says so in one line. On the official divide, not a
computed one. Used by `pipeline/build_basins.py` (a pack's `basins.json`), `src/core/basins.ts`, the tunnel / cut
card (`src/ui/inspector.ts`).

## Source

- VÚV TGM, DIBAVOD layer A10, [catalogue](https://www.dibavod.cz/27/id_dib-10.html), download
  `https://www.dibavod.cz/data/download/dib_A10_Povodi_I.zip` (fetched 2026-11-19, ESRI shapefile, S-JTSK Křovák
  East/North = EPSG:5514, the packs' own coordinates): "Název objektu: hydrologické členění – povodí I.řádu" — "hydrological
  division – 1st-order basins"; "Povodí - území, ze kterého veškerý povrchový odtok odtéká sítí vodních toků k
  určitému místu vodního toku … Povodí je ohraničeno rozvodnicí" — "a basin is the area from which all surface runoff
  drains through the stream network to a point of a watercourse … it is bounded by a divide". Attribute `RAD_I`:
  1 Labe (Elbe → North Sea), 2 Odra (Oder → Baltic), 4 Morava and Dyje (Danube → Black Sea). No explicit licence on the
  pages; attributed to VÚV TGM / DIBAVOD (a localhost game: AGENTS.md).
- The ridge: the Hřebeč ridge "představuje hlavní středoevropské rozvodí Labe–Dunaj" — "forms the main Central
  European Elbe–Danube divide" (Museum of Eastern Bohemia, [Práce a studie 21 (2014), p. 147](https://www.vcm.cz/documents/1032/08-lemberk2_prace_a_studie_21_2014.pdf)).

## Checked here (2026-11-20)

- Packs crossed by a 1st-order divide (within 2 km): d11 (Labe / Odra, at the Polish border), d35 and d35-full
  (Labe / Morava). Every other pack lies in one basin (d3*, i16, Labe; i46-sternberk, Morava); the i35 packs were
  not rebuilt here (their cached inputs differ from their manifests): no file, nothing said.
- The D35 starters' Auto tunnel under the Hřebeč ridge (stage 1 km 4.07–7.10, whole D35 km 4.10–7.08): its west
  portal (S-JTSK −595 337, −1 092 551) is in the Labe basin, its east portal (−592 344, −1 092 931) in the Morava
  basin; the line between them crosses the A10 divide at −593 313, −1 092 808. The whole D35's second tunnel
  (km 19.07–19.53) is in the Morava basin at both ends: nothing said.
- The D11 and the Královec railway **do** cross it, unlike the board's own flood test (round 1, "the whole line, and
  B itself, drain south to the Úpa"): on the A10 polygons the D11 motorway starter enters the Odra (Baltic) basin at
  km 17.35 of 20.36, the railway starter at km 12.08 of 13.27, in a 12 m cut, both on Czech ground before the border
  (the Královec saddle drains to the Bóbr). Their starters' tunnels have both ends in the Labe basin. The official line
  decides, not a computed one.

## The line

"Its ends drain to different seas: rain at its km 4.10 end runs to the North Sea, at its km 7.08 end to the Black
Sea." (a tunnel or a cut; the km are the card's own). An end outside every basin (Poland) says nothing.
