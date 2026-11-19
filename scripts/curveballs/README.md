# Curveball places (research/95)

How the curveballs' places in `src/core/data/curveballs.ts` (the blocks between `// ---- <preset> (places: research/95) ----`
markers) were made. Run from the repository root; scratch files go to `/tmp/tw` (the scripts' working folder).

1. `npx tsx scripts/twists-check.ts --survey <preset> [reference.json…] --json /tmp/tw/<name>.json` — each mission's starter
   and reference lines every ≈ 25 m in EPSG:5514 (names used: d3-0301 … d3-0305, d35-stage1, d35-full, d11, kralovec,
   sternberk).
2. `uv run --with shapely python scripts/curveballs/query.py /tmp/tw/<name>.json /tmp/tw/q-<name>.json 400` — the ČGS
   (undermined ground, mine workings, slope deformations) and AOPK (protection zones, memorial trees, ÚSES, streams …)
   features within 400 m of the lines.
3. `uv run --with shapely --with pyproj python scripts/curveballs/cands.py <name> <pack> <reference>` — candidate places
   (open land cut near a village, forest edges, crossings, steep ground, low embankments near villages, buildings by the works).
4. `uv run --with shapely --with pyproj python scripts/curveballs/specs.py [preset…]` — the curveballs per mission
   (`specs.py`, `specs2.py`), printing what the starter and the reference do in each place, writing `/tmp/tw/gen-out.json`;
   `python3 scripts/curveballs/merge.py > /tmp/tw/ids.json` writes them into curveballs.ts, `python3 scripts/curveballs/lists.py`
   the missions' curveball lists into data/twists.ts (its explicit lists win: the order they arrive in, the whole routes').
5. `npx tsx scripts/twists-check.ts --show <preset|fixture>` to see what each design breaks; `--find … --twists
   earth,landmarks,curveballs --goal` for a reference that meets them all (scripts/twists/<preset>/all-news.json).
