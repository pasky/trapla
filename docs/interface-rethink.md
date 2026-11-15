# Interface rethink — powerful but simple

Owner, after playing: getting to the building tools is too complicated (see a stretch on the map, find
it again from scratch in the profile), single click adding bends is awkward, the whole interface is
overcomplicated, the text is full of junk, the noise view looks broken. Realism and control stay; the
interface gets simple.

This document is the playtest record, the decisions taken and the copy rules. It was written before the
implementation and updated after it; the screenshots at the end are the implemented result.

## 1. Playtest (scripted real-mouse sessions, 1280 × 800)

Three personas, driven step by step through Playwright with real pointer events, a screenshot after each
step (`/tmp/rethink/shots`). The state before the rethink is commit `4061314`.

### (a) First-time player who wants a cheaper road

| # | friction |
|---|---|
| A1 | The intro card covers the upper half of the route, including B. |
| A2 | The straight line is already ✓ VALID at 10.0 bn. Nothing on the map says where the money goes; the cost is only in the profile's strip and a HUD table whose rows are not clickable ("Bridges 2.34 bn" — which ones?). |
| A3 | One click took the cost from 10.01 to 8.20 bn — no "−1.81 bn" anywhere. During a drag a "best 7.97 bn" appeared silently; the player cannot know which position that was. |
| A4 | The bend card: "turns 27.8°", radius field, "smallest allowed" checkbox, slider, "curve 172 m long, starts 88 m before the bend", plus a second radius chip on the map. Jargon and duplication for someone who just moved a point. |
| A5 | Hovering the road shows no affordance; dragging the road pans the map. The route-planner gesture everyone knows does nothing. |
| A6 | A stray click on empty terrain (to deselect, to look) adds a bend far away: the route jumps, +0.5 bn. |
| A7 | Inserting a bend renumbers all following bends (bend 1 becomes 2). |
| A8 | The profile's hover tooltip is ~250 px tall and sits over the map, covering the spot it marks. |
| A9 | A click in the profile is "zoom in" — except near a crossed road (opens a track's card with six options) or on the line (pins a height by accident). The tunnel the player wanted to look at cannot be selected at all. |
| A10 | Several cards stack in the HUD (bend + crossing + building), pushing everything down. |
| A11 | Zooming the map does not move the profile; nothing in the profile says which part is on screen. |
| A12 | Red means "violation" and also "demolished" in the legend. |
| A13 | "Other objects +31 / 49 %", "Start over" inside the Road height block, scenario block repeats the score. |

### (b) Player fixing a violation they see

Setup: the demo design with a bend nudged and one "No wall" decision → 3 violations.

| # | friction |
|---|---|
| B1 | At the overview the violations are invisible on the map (sub-pixel red) and faint pink in the profile. |
| B2 | The list item reads "Road realignment needs engineering → Move the alignment at km 7.87 clear of this 26.2 m road stretch, or bridge it; path intersects the footprint". The jump works, but nothing is selected and the fix is prose, not a button. |
| B3 | "Retained dwelling #23031 exceeds the noise limit by up to 4.7 dB → Add 4 m walls on the right from km 10.11 to 10.26, or buy out dwelling #23031". The building card offers Automatic / Buy out / Keep — not the wall it recommends. Building the wall means: find km 10.11–10.26 in the profile, drag across it, then in the HUD pick side, type 4, Build wall (≈ 6 actions, two views, typing). |
| B4 | The building sits in the pale part of the noise band yet is flagged 4.7 dB too loud: the band is the ground floor (1.5 m), the decision is the top floor. Raising walls changes the band little for the same reason. |
| B5 | The noise tooltip: "Retained by your keep/wall decision: 4.7 dB over the limit. Add adequate walls, change the route, or explicitly buy out this dwelling. This is a blocking violation, not an automatic purchase." |
| B6 | The noise legend takes a third of the map. |

### (c) Power user

| task | before |
|---|---|
| force a bridge over a valley | find the valley in the profile, drag across it, Bridge in the floating bar (map: impossible) |
| keep a building | zoom in until buildings are pickable, click, Keep — fine |
| add a wall | profile only: drag a stretch, then in the HUD side + height + Build wall; clicking a wall on the map **adds a bend** |
| change a crossing | click it close up (from afar the click does nothing / adds a bend), six buttons with mixed jargon |
| pin a height | profile only, click the line (which elsewhere zooms); drag the pin |

Hidden gestures: Shift+click (bend over a building), double-click (height point), right-drag profile
scroll, wheel on a bend (radius), B/T/E/C only while a stretch is selected (otherwise C/E are map views).

## 2. Decisions

### 2.1 Map-first editing, no harmful clicks

- **Click anything on the map to inspect it**: the road (selects the piece of road under the mouse —
  a bridge, a tunnel, a cut or an embankment), a bend, a building, a crossed road, a wall, a violation
  mark. **Click empty ground: deselect.** Nothing is ever added by a single click.
- **Drag the road to bend it** (route-planner style): a new bend appears under the mouse and follows it.
  Hovering the road shows a grab cursor and "drag to bend · click for details".
- Drag a bend to move it; right-click a bend or *Delete* in its card to remove it.
- **Double-click empty ground** adds a bend there (accelerator for big detours; also in Help).
- Buildings and crossed roads are clickable at every zoom where they are drawn; Shift+click is gone.

### 2.2 One inspector

One card, under the score, for whatever is selected — a road piece (bridge/tunnel/cut/embankment or a
dragged stretch), bend, pin, height point, crossed road, building. Only one thing is selected at a time.
Every inspector has the same shape:

1. **Header**: what it is and where (`Bridge · km 5.82–6.23`), ✕.
2. **Status line**: what the game decided and why, one line, numbers first
   (`412 m · 18 m high · 1.05 bn` / `Auto: cheaper than a 18 m embankment`).
3. **Violation banner** if it has one, with the fix as a **button** where it can be applied
   (`Build 4 m wall right`, `Buy out`, `Bridge it`, `Set radius 520 m`).
4. **Choices** as a segmented control, the current one highlighted, *Auto* first.
5. **More ▸** (remembered): the numbers — radius field, wall side/height, typed pin height, km range.

Violations are not a separate kind of thing: clicking a violation (list, chip, map mark) selects the
object it is about and flies there; the banner is the top of that object's card.

### 2.3 Map ↔ profile always in sync

- Selecting in either view selects in both: the map highlights the piece and flies to it if it is off
  screen; the profile highlights it and scrolls/zooms to show it.
- The profile shows which part of the route the map is looking at (a light window) once the map is
  zoomed in.
- Hover stays linked as before.

### 2.4 The profile's role

The profile is the side view: heights, structures, the cost strip. Same verbs as the map:
**click = select** the piece of road at that km; **drag sideways = select any stretch**; **drag the road
line up/down = pin the height there** (in By hand: drag the ◆ points); wheel = zoom; *Whole route*.
Its tooltip shrinks to 3 lines and stays inside the profile.

### 2.5 HUD layout

1. **Score** (sticky): cost, ✓/✗, change since the last edit (`−1.81 bn`), travel time chip,
   violations chip (click = select the first one), best (*Load*). The goal sits in one line under it.
2. **Inspector** — or, with nothing selected, **Where the money goes**: the 5 most expensive pieces of
   the road, each a link that selects it. This answers A2 without reading tables.
3. **Violations** (only while there are any), each a link.
4. Folded: **Cost breakdown**, **Road** (category, speed, road height Auto / By hand, Start over),
   **Your decisions**, **Quantities**, **Help**.

### 2.6 Visual language

- Same colours everywhere: road orange, bridge blue, tunnel purple, wall teal, violation red,
  demolished dark grey square, bought out magenta, kept green.
- Noise is one ramp (pale → yellow at the limit → red) used by the band, the building colours and the
  inspector's diagram.
- Map legend: short, one line.

### 2.7 Noise that tells the truth

- **Band** = night level at the **top floor of the houses beside the road** (per station and side, the
  tallest dwelling nearby; 1 floor where there are none) — the height the decisions use. Raising a wall
  visibly cools the band where it shadows those floors.
- **Buildings** are coloured by their **own** worst level after walls/cuts on the same ramp; bought out
  magenta; demolished removed.
- **Building inspector** shows a **cross-section**: the road and its noise source, the wall or cut edge,
  the house with each floor labelled with its level (before → after), the sightline over the wall and
  its shadow. Changing the wall height re-draws it.
- The legend is one ramp and three swatches.

### 2.8 Progressive disclosure and modes

- Default inspector = status + choices. Numbers behind *More ▸*.
- Road height Auto / By hand moves into the folded *Road* section; pins work in Auto by dragging the line.
- No modifier keys needed. Keys are accelerators only (shown in tooltips): Del, Esc, Ctrl+Z, B/T/E/A on
  a selected stretch, C/S/R/O/N map views.

### 2.9 Onboarding

Three steps, placed bottom-left so the route stays visible:
1. **Drag the orange road** to bend it.
2. **Click anything** — road, bridge, house, crossing — to see why it costs what it costs and change it.
3. The cost counts when the design is **✓ valid**.

## 3. Copy rules

Default: delete. Numbers before words. No IDs (`#23031`), no internal terms (receiver, LAeq, retained,
blocking, resolved, provisional, keep/wall decision, realignment, engineering, alignment, station).

| element | budget |
|---|---|
| violation title | ≤ 6 words, the problem, with its number |
| violation fix | ≤ 10 words, imperative, or a button |
| inspector status | 1 line |
| button | 1–3 words |
| tooltip | ≤ 12 words |
| explanations / sources | only behind *More ▸* / *why?* |

### Before / after (the 30 worst)

| # | before | after |
|---|---|---|
| 1 | Retained dwelling #23031 exceeds the noise limit by up to 4.7 dB | House 4.7 dB too loud |
| 2 | Add 4 m walls on the right from km 10.11 to 10.26, or buy out dwelling #23031 | [Build 4 m wall right] [Buy out] |
| 3 | Buildings: #23031. Keep or an explicit wall decision forbids automatic acquisition. Excess is evaluated with actual walls and cut edges at the top occupied floor. A buyout requires your explicit choice. | Your wall choice stops the automatic buyout. |
| 4 | Retained by your keep/wall decision: 4.7 dB over the limit. Add adequate walls, change the route, or explicitly buy out this dwelling. This is a blocking violation, not an automatic purchase. | (diagram + banner "4.7 dB too loud — top floor") |
| 5 | top-floor receiver 16.0 m above the road, 34 m from the axis (km 10.19, right) | 2 floors · 34 m from the road |
| 6 | Night LAeq without mitigation: 54.7 dB (+4.7), limit 50 dB | 54.7 dB at night (limit 50) |
| 7 | Provisional screening model, not an acoustic assessment. | (Help) |
| 8 | Road realignment needs engineering | Crossed road in the way |
| 9 | Move the alignment at km 7.87 clear of this 26.2 m road stretch, or bridge it; path intersects the footprint | Move the road or bridge it |
| 10 | Not valid yet — this cost does not count until the violations are fixed. | (struck-through cost + ✗ badge) |
| 11 | a violation: your wall choice here leaves it over the noise limit | 4.7 dB too loud |
| 12 | Buying out includes the plot. A kept building in the road's way, or left too loud, is a violation. | (deleted) |
| 13 | Applies wherever we cross this road. Choices that do not work are kept and shown as violations. | (deleted; a failing choice shows its banner) |
| 14 | No walls here now. Sides as seen driving from A to B. | Walls: none |
| 15 | Your walls here: right: no wall (km 2.10–2.36). | Right: no wall (yours) |
| 16 | 21 % of the route's cost on 11 % of its length | 21 % of the cost |
| 17 | curve 172 m long, starts 88 m before the bend | (More ▸) |
| 18 | Automatic — the lowest-cost legal heights; click the road line in the profile to pin one. | Auto: cheapest heights. Drag the line in the profile to pin. |
| 19 | Automatic road height · click the line to pin its height there, then drag the pin | drag the line up/down to pin a height |
| 20 | drag across the profile to select a stretch · click a curve / straight in the band above to select it | (deleted) |
| 21 | Noise — night LAeq relative to the 50 dB limit, ground floor (1.5 m), walls and cuts included | Night noise at the top floors, vs 50 dB limit |
| 22 | Top-floor façade decides walls and buyouts. Hover a building or a wall for details. | (deleted — the band now is the top floor) |
| 23 | Dwellings: behind a wall · screened by a cut · within limit · bought out · demolished (in the road's way) · retained, over limit | (one ramp) bought out · demolished |
| 24 | Building: click for its options (Shift+click adds a bend here instead) | (deleted) |
| 25 | Keep existing bridges, junctions at least 1.5 km apart, otherwise the cheapest of a bridge, an underpass through a high enough embankment or a link to a nearby crossing road | Cheapest that works |
| 26 | Bend 1: drag to move it, click to select it (radius grips), right-click to delete | Bend 1 |
| 27 | Other objects +31 / 49 % | Other (drainage, safety…) |
| 28 | The map data changed: your building and road-crossing choices were cleared so they cannot land on different objects. Choices tied to km positions are kept. | Map data changed: building and crossing choices cleared. |
| 29 | No choices of your own yet: everything is automatic. Select a stretch in the profile, or click a crossed road or a building on the map. | Nothing yet — everything is Auto. |
| 30 | Below the map: the road's height profile — drag across it to select a stretch and build a bridge or tunnel. Everything can be undone (Ctrl+Z). | (deleted; intro has 3 short steps) |

Crossing card texts and the jargon guard test are owned by the concurrent crossing-sanity work; the
inspector builds on its strings.

## 4. Result

Implemented as decided above (owner: "just fix everything yourself"). What changed, concretely:

- **Gone:** click-to-add-bend, Shift+click, the floating selection bar over the profile, the profile's
  click-to-zoom, the separate bend / height point / stretch / crossing / building cards (one inspector now),
  the scenario section (one goal line under the score), the "not valid yet" sentence (the struck-through
  cost and the badge say it), the "How to play" wall of text (a short *Help*).
- **Map:** drag the road = new bend under the mouse; click = inspect (crossing → road piece → house → wall);
  empty click = deselect; double-click = bend there. Crossed roads are clickable once they are drawn
  (< 10 m per pixel); from afar a click on the road picks its piece. Hover: grab cursor and "drag to bend"
  over the road, pointer over houses / crossings / walls.
- **Inspector** (`src/ui/inspector.ts`): pieces of road (`src/ui/pieces.ts`: bridge / tunnel / cut /
  embankment runs, earthwork pieces under 120 m merged), dragged stretches, bends, pins, height points, crossed
  roads, houses; violations as banners with fix buttons (wall of the needed height over the needed km,
  buy out, stop keeping, back to Auto, bridge it, unpin). Violations carry a structured `target`
  (`src/core/checks.ts`) so the list and the chip select the right thing.
- **Score:** the change of the last edit (a drag counts once); the best design is only offered for designs the
  player let go of, not positions half-way through a drag.
- **Profile:** click selects, the line drags to pin, short tooltip inside the panel, the map's view as a light
  blue window.
- **Keys:** relief moved from E to <kbd>R</kbd> and "Automatic" on a stretch from C to <kbd>A</kbd>, so the
  stretch keys A / B / T / E never collide with map views.
- **Noise:** band at the top floor of the tallest dwelling within ±40 m on that side (from the evaluated
  receivers, no extra spatial queries: the evaluation's town lap is unchanged), houses in their own level,
  cross-section in the house's card with a live wall-height preview, one-line legend.
- **Copy:** the before/after table above is applied. Crossing and footprint wording comes from the shared
  vocabulary in `src/core/terms.ts` (crossing-sanity); the inspector uses its outcome labels and choice texts.
  The jargon guard (`tests/player-text.test.ts`) now scans every `src/ui` module plus the map's labels and
  tips, and also bans the words players tripped over here: receiver / LAeq, retained / blocking / keep-wall,
  dwelling, object IDs (`#123`), station.
- **Drags:** every drag (bend, road → new bend, radius grip, line → pin, pin, height point, the radius
  slider) is an uncommitted edit and goes through the fast preview; `node scripts/drag-perf.mjs --gpu --mode
  bend|road|radius|pin|vpi --check` passes in all modes (three rounds).
- **Checks:** `npm run smoke` (new interaction model) and `node scripts/playtest.mjs` (the three personas,
  ~70 checks) replace `ux.mjs` and `build-tools.mjs`; `layout.mjs`, `curves.mjs`, `noise-view.mjs` pass.

Screenshots: before the rethink in `docs/screenshots/rethink-before/`, after it the README's gallery 60–71
and the noise views 28–29.
