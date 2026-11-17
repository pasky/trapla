# Playtest sweep 3 P2s: arches, hairpins, the tunnel card (cost model 40)

Snapshot 2026-11-17 (qa3-realism-fixes agent). Findings in docs/playtest-findings.md "Sweep 3 — main 30d0ad8", P2.

## 1. No bridge could be built as an arch

QA: Arch fitted none of D11 km 7.50–8.39, the D35 viaduct, the D3 Sázava bridge (a 113 m deep V-valley, the
classic arch site) or 0302 after a far edit; the greyed button said only "Does not fit this bridge".

Model 35's arch rule (data/bridges.ts, research/50 §5): one arch of 100–250 m, the bridge 1.8–2.8 × as long, the
rise 1/10–1/5 of the span, springings on the ground, the rib clear of the ground; the longest such arch, then the
most even, and only then the check that its rib also clears what lies below (support-layout depthCheck).

What failed, per bridge (`qa3/_arch.ts`-style scan of every springing pair):
- **D3 0302 Sázava (Auto: 419 m, km 2.63–3.05).** Every arch that springs from the ground rises 0.207–0.65 of its
  span: the valley is too deep and narrow for 1/5. The real bridge is the counter-example: a 237 m RC arch
  ("oblouk má mít rozpětí 237 metrů", [cs.wikipedia Most Sázava](https://cs.wikipedia.org/wiki/Most_S%C3%A1zava);
  251 m in [dalniced3.cz 04/2025](https://www.dalniced3.cz/novinky/z-tisku/most-sazava-podrobny-geotechnicky-pruzkum-pro-budouci-nejvyssi-dalnicni-most-v-cesku))
  in a 787 m bridge, deck 113 m over the river (ŘSD leaflet 0302).
- **D35 viaduct (1,989 m).** Too long for one arch at 2.8 ×: the shortest arch would be 710 m.
- **Short bridges (< 180 m).** Too short for a 100 m arch.
- After the rise, a second failure: the longest arch was chosen before checking its rib over what lies below (the
  river), so where that one failed no other was tried.

**Sources for the new bounds:**
- Rise: "The rise-to-span ratio for arches may vary widely … Most arches would have rise-to-span ratios within the
  range of 1:4.5 to 1:6"; examples: the Cowlitz River Bridge, "a typical true concrete arch", spans 159 m with a
  rise of 45 m (1:3.5); New River Gorge 1:4.6; Wanxian 425 m / 85 m (1:5) (G. F. Fox, *Arch Bridges*, ch. 17 of
  Chen & Duan, *Bridge Engineering Handbook*, CRC 2000, §17.4 and §17.6.1;
  [PDF](http://freeit.free.fr/Bridge%20Engineering%20HandBook/ch17.pdf)). **The rise may now be 1/10–1/3.5** (the
  built range: Trojský 1/10 to Cowlitz 1/3.5); "most" arches lie inside it.
- Bridge length: the D3 Sázava bridge is 787 m with a 237 m arch, **3.3 ×** (ŘSD leaflet 0302 p. 2, research/67
  §1.3). The ratio bound is now 1.8–3.3.
- The rib's clearance over what lies below (the same rule as a deck's, depthCheck) is part of the search: an arch
  that would pass too low over the river is skipped and the next tried.

**Result.** The Sázava bridge on the 0302 starter as Auto had it on model 38 (419 m) took an arch: +648 M against
long spans (the arch's PROVISIONAL price, a 30 m-span viaduct as high as its highest point, research/50 §5, stays).
With research/67's deep-cut rule Auto's line rides higher and its Sázava bridge is 1,678 m: too long for one arch,
which its card says. The D11 direct-80 valley (km 8.41–8.88, 50 m deep) takes an arch for +106 M (shots 294, 295). Auto's choices in
every scenario starter and frozen D11 fixture are unchanged (no bill moves; the cards' arch prices do). A synthetic
case (tests/bridge-styles: an 80 m river on flat ground under a 25 m deck) now takes an arch from bank to bank as
the cheapest.

**The card says why** when none fits (`Run.archMiss`, the furthest a candidate came): too short a bridge, too long
for one arch, a valley too shallow or too deep for its rise, the rib through the valley side, the arch on or too low
over a road, railway or water, its approach spans too long. Shown on the greyed button and under the style row
("No arch: the bridge is too long for one arch: …").

## 2. Hairpins

QA: the Hairpin choice appears only once a bend turns ≥ 150° (by design: "v točce se směr trasy obrací téměř o
180°", MZe TD 2020 §7.7, research/54), and "Bend 2 turns back almost on itself" (170°, no curve built) offered no
hairpin. Now that problem offers **"Make it a hairpin"** (one step: the bend a hairpin and its stretch at the
category's lowest speed) where a hairpin may stand: a road (not a local road or track), on ground steeper than
15 % around the bend (the game rule of research/54 §5), turning at most 179° (HAIRPIN_MAX_DEFLECTION). Its fix text
adds ", or make it a hairpin". (`design-speed.ts hairpinFixes`.)

Not changed: the bend marker sits where the tangents meet (≈ 340 m from a 170° hairpin's arc): it is the bend's
point of intersection, which the drag moves.

## 3. The tunnel card

- After the player's Cut and cover on Auto's tunnel, the card said "Auto: at this depth cheaper than a cut". The
  structure stays Auto's (the method is a choice on it, cost model 35), so Auto stays highlighted; the line now
  reads "Auto’s tunnel, built by cut and cover as you chose."
- The tunnel card offered noise walls (Left / Right 2–6 m). A stretch that is all tunnel has no wall rows.
