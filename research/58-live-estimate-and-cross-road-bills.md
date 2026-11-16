# 58 — Where a total change comes from: a rebuilt side road, and the live ≈ price (2026-11-16)

Two P2s of the final QA sweep (docs/playtest-findings.md, "Final sweep — main e24df59"): a change of the
project total nobody explained, and a live drag price ≈ 0.9 bn off the settled one on the whole D3. Both
measured in Node on the browser's own projects (scratch scripts; the browser checks are in
`scripts/p2-scene.mjs`).

## The −17 M when III/1057 is rebuilt (D3 motorway)

Repro: the owner's steps, but III/1057 grabbed 25 m north of our bridge and pulled ≈ 40 px east, 20 px
north at 800 m camera distance. Project total 14.2199 → 14.2057 bn (−14.2 M; QA −17 M with its own pull):

| line | change |
|---|---|
| Road III/1057 (new) | +9.8 M own bill (+0.4 M removing 225 m of the old road) |
| our motorway | −24.4 M: bridges −35.4 M, embankment and borrow +10.9 M, road base +4.8 M, other objects −5.8 M |

Mechanism: the old road crossed under our bridge at km 11.764, 44 m from its end (bridge km 11.578–11.808);
the new line crosses at km 11.725, so the bridge ends at km 11.778 (30 m shorter, still 53 m past the road)
and the 30 m become embankment. The grade line is unchanged (0.00 m everywhere). This is what designers do
(a side road moved towards the middle of a span shortens the bridge); it is not a bug and no number is tuned.
The pull the owner scene uses (40 m east from 120 m away) leaves the bridge as it was: +5.0 M (road +2.6 M,
motorway +2.3 M).

What was missing was the explanation. The score now says, after any edit that moved more than one road's
bill, which and by how much, with the bill line that moved most where that is most of the change:
"Our motorway −24 M (bridges −35 M) · Road III/1057 +10 M" (`ui/project-issues.ts` `billChangeText`, from
`cost.alone` per line and the bill groups of `ui/costgroups.ts`).

## The live ≈ price vs the settled one (whole D3)

Browser repro (`?scenario=d3-full`, start view, a 60 px pull at km 30): previews ≈ 37.00 → 39.96 bn while
moving, settled 39.25 bn. Node, the same base design, a new bend at the given km and offset, preview with the
full result's material and structure value as the browser posts them (windowed: edited stretch ± 1.5 km):

| edit | settled | preview | inside the window | outside it |
|---|---|---|---|---|
| km 30, +150 m | 38.654 | 38.025 (−1.6 %) | +48 M | −677 M (tunnel km 24.9–25.4 longer, buildings, haul) |
| km 30, −150 m | 38.164 | 37.265 (−2.4 %) | −173 M | −725 M (same tunnel) |
| km 30, +400 m | 37.751 | 37.664 (−0.2 %) | −144 M | +56 M |
| km 30, −400 m | 38.446 | 37.296 (−3.0 %) | −396 M | −753 M |
| km 24.5, +300 m | 36.767 | 36.573 (−0.5 %) | −226 M | +32 M |
| km 40, +300 m | 38.651 | 37.211 (−3.7 %) | −238 M | −1,202 M (haul −314, borrow −520, bridges −511 along the route) |

- **Outside the window** (most of the gap): the full evaluation changes the line beyond the dragged stretch:
  grade blocks re-solved up to 5 km away (model 25, `BLOCK_WINDOW`), a new structure value
  (183 → 236–254 after every edit above) that re-chooses bridges and tunnels along the whole route, the
  per-block mass balance (haul, borrow). A preview cannot know these without doing the full evaluation.
- **Inside the window**: the preview's quick model (one material value, no clearance retries, no retaining
  walls, no noise, crossings without ramps) prices bridges 0.1–0.4 bn lower.
- **Wider windows are worse**, not better: with a 5 km margin (12 km windows) −0.8 … −5.0 %, 7 km −1.1 …
  −5.5 %, because the quick model's own bias grows with the stretch it prices (whole-route preview of the
  unchanged design: 35.98 vs 37.35 bn, −3.6 %: noise walls −515 M, bridges −500 M, tunnels −327 M, crossing
  works −295 M, earthworks +545 M).

So no window size narrows it, and making the preview do the full engine's far work would break the drag
budgets. The fix is to say it: while a drag's ≈ price shows, the line under the score reads "≈ Quick estimate:
noise, walls and knock-on changes are counted when you pause." (tooltip: what is left out where the road moved,
and that changes further along come with the full count, a few per cent on a long road). The levers that
would narrow it belong to the engine's own locality (AGENTS.md "Open items": an anchored station grid, a
local structure value).
