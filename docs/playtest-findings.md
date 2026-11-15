# Playtest findings (independent UX QA)

Played like a first-time player in headless Chromium with real mouse / keyboard (driver: `qa/drive.mjs`),
screenshots under `/tmp/trapla-qa/` (not committed). Newest session on top. Severity: **P0** broken /
untruthful, **P1** confusing, **P2** polish.

## Test plan

Per session, fresh localStorage, 1440×900 (one pass also at 1280×720), no console tricks for the player
steps — the page API is used only to read state for precise repros.

1. **Scenario picker** — find it without the README; every entry: D11, D3 sections, D35, Nová Paka, motorway
   presets, railway mission. Does each load, is A/B sensible (not mid-field), is the goal readable, does the
   camera frame the route, does switching keep / lose work as the player expects?
2. **Core on D11** — intro; drag the road; add / move / delete bends; tightest / widest; radius; profile:
   click, stretch, pin height by dragging, By hand; crossings: click a crossed road, every choice, click its
   works, shape a reroute; houses: buy out / keep, demolished and bought-out visuals; noise view + walls;
   undo / redo across all of these; reload → continue; Start over; photo view; camera limits (under terrain).
3. **Any road (b)** — click mapped roads of several classes (track, class III, street, motorway); drag to
   rebuild; its card (traffic field visibility, bend cards, violations wording); Build → Road (free end,
   joining our road, junction / roundabout); pricing in the bill; a rebuilt road crossing our road
   (resolved? bridge pier on the old alignment?).
4. **Motorway / rail (c)** — motorway preset: both directions, split, tweak one direction; railway mission:
   endpoints, reroute a railway when the highway crosses it.
5. **D3 / D35 / Nová Paka** — endpoints, overview, quick drag, crossings and houses spot checks.
6. **Owner's known complaints** — re-verify each after the relevant merges.
