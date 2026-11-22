# 107 — A road over an existing railway tunnel

Why: the packs' railway raster (pipeline/build_pack.py) draws every mapped `railway=rail`, tunnels too, so a road over
a railway tunnel was a railway crossing at the ground: a forced bridge, a card, a bill (the D3 official line over the
130 m Jílovský tunel II, OSM 30231638). The game now reads the tunnels from the structures sidecar (`rail`) and takes
the underground stretches out of the raster (src/core/rail-tunnels.ts, PLAN.md "Mapped bridges and tunnels are
crossings").

## Findings

- **The tunnel's size.** SŽDC's sample cross-section for new double-track tunnels (vzorový list světlého tunelového
  průřezu dvoukolejného železničního tunelu, *Tunel* 2/2005, ITA-AITES CZ,
  https://www.ita-aites.cz/files/tunel/2005/2/tunel-0502-6.pdf): one circle of radius 5,700 mm for the inner face of
  the lining, its centre 1,900 mm above the top of rail (TK); "Vrchol tunelové klenby je 7600 mm nad TK. Dolní
  vodorovná hranice konstrukce ostění tunelu (dno tunelu) je 850 mm pod TK." It applies to new tunnels on
  double-track electrified lines (4.0 m track centres, 6.0 m contact wire). Single-track and older tunnels are lower;
  OSM does not say which (`tracks` is mostly missing), so every tunnel is taken at this size (on the safe side).
- **Not found / not taken:** the lining's thickness (taken 0.5 m, primary and final together, PROVISIONAL), our road's
  pavement and formation over it (0.5 m, PROVISIONAL), any rule on the least cover a railway administrator asks over a
  mined tunnel (the railway's protection zone, Act 266/1994 §8, is about works near the line, not a depth).
- **The rails' level.** OSM gives none: taken straight between the ground at the two portals, read as the lowest DMR 5G
  height within 15 m beyond each end node (the cutting's floor, not the hillside over the portal face the node may fall
  on). Railway grades are a few ‰, so 15 m is centimetres. Consecutive tunnel ways meeting end to end are joined
  first (pipeline/build_structures.py), so each tunnel's ends are its portals.

## Game input

- Our road over a railway tunnel: its grade at least 7.6 + 0.5 + 0.5 = **8.6 m** above the rails (RAIL_TUNNEL_OVER).
- Our road under it: at least 0.85 + 0.5 + 9 = **10.35 m** below the rails (its floor, its lining, our tunnel's 9 m
  structure height, TUNNEL_RULES.structureHeight).
- Underground (out of the railway raster): where the ground is at least 8.6 m over the rails. Nearer the portals the
  railway stays at the ground as before (our bridge over its cutting).

## Railway bridges (checked, not changed)

The raster draws railway bridges the same way, at the ground under them (the valley floor), so the rail level a railway
crossing reads there is the valley floor, not the deck. Across the packs (transport graphs): D11 70 railway bridges, 7
with the deck ≥ 6 m over the ground under it (13–40 m long, up to 19 m high); whole D3 53 / 15 (up to 245 m long, one
38 m high); whole D35 82 / 4; whole I/35 119 / 8; Šternberk 7 / 0. Our road crossing one of these is priced as our
bridge over a railway at the valley floor (deck 7.5 m over it, possibly through the viaduct) or the railway carried over
our cutting on a new bridge, where a real designer would pass under the existing viaduct between its piers. A kept
railway bridge (our road under its deck with its clearance, its piers kept clear) is the open follow-up.
