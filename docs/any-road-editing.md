# Editing any road — plan and state

Owner request (verbatim): "big UX update to allow changing any road on the map, not just the main one —
i think this might require switching to a bit different basic UX as we do not have a single road anymore",
and "selectable during building so i can reroute a railway when building a highway". Bar: a polished,
cohesive experience, usable end-to-end on D11 and the new scenarios; no foundation presented as done.

## 1. UX decision (replaces the Change road / Apply stub)

**Every road on the map behaves like our road.**

- **Hover** a mapped road: the cursor says it can be dragged. **Click** it: it is selected (one card: name,
  class, the stretch that would be rebuilt highlighted, "Drag it to change its line"). Nothing is created.
- **Drag** it: that stretch becomes a project road at once and bends under the pointer, exactly like our
  road (same gestures, no modifier keys, one undo step for the whole first drag). No Apply, no form first.
- **Which stretch.** From the grab point to the nearest junction on either side (a node where another road
  joins), passing junctions closer than 150 m so a grab next to a junction is not a 20 m stub; at most the
  mapped way. Its two ends are drawn as end handles while it is active; drag them along the old road to
  lengthen or shorten the rebuilt stretch afterwards. Ends stay on the old road (position and height).
- **First edit = explicit conversion.** The map line becomes a designed line of bends at that moment; the
  card says so in plain words and shows how far the new line strays from the old road. The old road is
  still drawn until the change is checked and accepted, so nothing disappears silently.
- **Profile and price follow at once**: Auto heights, by-hand heights, the road's own price (≈ during
  the drag). Where the engine cannot check something yet the card and score say so in plain words
  ("Not checked yet: …"); there is never a green verdict or best score for an unchecked project.
- **Rules by class.** A rebuilt class I road uses S 9.5, class II/III S 7.5, at 70/80/90 km/h (card).
  Local roads, service roads and tracks keep the drag and the line, but say "No design rules for this kind
  of road yet" until sourced local/track policies exist (ČSN 73 6110 / 73 6109, research/20).
- **Traffic** is an explicit card field ("Traffic, vehicles/day"), never copied from the mission. Until it
  is entered, noise is "not checked" for that road and the project stays unpriced, with the field as the fix.
- **Build → Road** (top-left): click where it starts and where it ends. A click on a road joins it there; a
  click on empty ground leaves a free end ("Road ends nowhere / Connect both ends to a road"). The road is
  created straight and bent like any other. Motorway/Railway stay hidden until the mode kernels land.
- **Switching roads**: clicking a road on the map selects it and makes it the one the profile shows. The
  top-left list appears only when the project has two or more roads; with one road there is no dropdown.
- **Missing road links** (a pack without the transport sidecar, D11 today): clicking a mapped road shows
  "This map's roads cannot be changed yet: its road links are missing." Never a silent no-op.

## 2. Pricing (C1, ordered as docs/multi-road-plan.md §9)

1. **(a) Tie-ins.** A road end on an existing ground road is a junction work of the new road: T (Auto) or
   roundabout (choice), priced once (research/08, research/29), using the endpoint-junction zone of
   scenario-declared junctions (S, `ENDPOINT_JUNCTIONS`) so the joined road's rebuilt pavement inside the
   zone is part of the junction, not a conflict. Checks: no at-grade junction on motorways/expressways;
   class-I spacing 1.5 km to existing junctions (research/12), an existing junction rebuilt in place is
   allowed; approach gradient (PROVISIONAL, research/29); sight triangle by host speed (research/29).
   The host's traffic and noise are unchanged and say so. Two roads on the same host stretch interact.
2. **(b) Replacement.** The rebuilt stretch: new-build engineering by the kernel against the network
   WITHOUT its own old stretch (no self-collision); removal of the old pavement where the new line leaves it
   (OTSKP removal + topsoil restoration, research/30); land only beyond the old road; every branch the old
   stretch carried reconnected (link + junction) or reported, never dropped; accepted replacements removed
   from the map, crossings and footprints together. Noise: relocated alignment = new-road limits,
   same-alignment rebuild keeps the existing-road limit (research/30).
3. **(c) Interacting roads.** One owner per shared work, one buy-out per house, combined noise as energy
   sum per receiver height on the noise agent's finite-segment physical sources, limit of the prevailing
   source (research/31), project-level buy-out/wall decision before the ledger. D11 single-road bills
   stay bit-exact (eval-regression through both paths) or come with a reviewed COST_MODEL_VERSION bump.

## 3. Milestones (each committed green; parent merges)

- **E1** Route switching that scales (no dropdown for one road), Build → Road with snapping ends, new
  roads editable and profiled; mapped-road click/drag replaces the Change road stub; missing-links card.
- **E2** Rebuilt stretch evaluated by the kernel without self-collision; end handles along the old road;
  traffic field; local-road/track honesty.
- **E3** C1(a) tie-in pricing → a separate side road joined to the network is priced with our road.
- **E4** C1(b) replacement pricing.
- **E5** C1(c) combined noise / shared works (after the noise agent's source model lands).

Research added for this work: research/29 (tie-in junctions), research/30 (rebuilding a stretch),
research/31 (noise from several roads). Screenshots: next free numbers after the merged galleries.

## 4. State

(Updated as milestones land.)
