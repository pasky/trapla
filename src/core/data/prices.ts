// Unit prices, CZK excl. VAT. SPK CN / OTSKP norms are 2026; research market/contract examples
// remain at their original dates, NOT escalated to 2026. Sources: research/00-feasibility-map.md §3 and
// research/data/spk-cn-2026-oceneni.csv; land: research/07-property-land.md; earthworks:
// research/09-noise-earthworks-urban.md §3. PROVISIONAL marks a placeholder or game heuristic.

/** Bump whenever prices or cost rules change: scores saved under an older model are not comparable.
 * 20: motorway and railway scoring enabled (paired / split D 27.5 corridors: motorway norms, no level
 * junctions, motorway noise source; R1/R2 railways: SPOŽES prices, CNOSSOS train noise); road bills
 * unchanged (eval-regression identical).
 * 21: finite-segment noise (Manuál 2018 §1.10–1.11, §1.19), walls on the cross-section's line, the
 * cheapest automatic wall per house (research/36).
 * 22: valid automatic reroutes (engineered links within the class gradient, culverts, houses bought
 * out, a gentler line along our road), lowered underpasses (research/37), sloped decks over us.
 * 23: railway grade lines on a 0.5 m search grid (12.5 ‰ left the 2 m / 1 m grids too few steps to rise
 * over a crossing); a railway between two points of an existing line joins its track in the stations and
 * rebuilds it where it runs along it; railway ends leave the tracks they join at a turnout's angle; rebuilt
 * railway stretches at their line's own speed and grade; a paired motorway's noise as its two directional
 * sources, a double track's per track; road bills unchanged (eval-regression identical).
 * 24: the structure choice prices the buildings each option demolishes and settles the fill value on
 * the final grade line (By hand from Auto's heights bills the same); piers of a chosen bridge miss
 * what lies below; an automatic bridge whose piers cannot is not chosen; a stream at a bridge's end
 * is spanned; a chimney / silo / shed standing within a demolished building goes with it; a building no
 * one lives in that only the working strip beside our slopes reaches stays behind a retaining wall (research/18 rates)
 * where that wall costs less than buying and demolishing it, and a building the player keeps is walled
 * off wherever a wall can stand.
 * 25: local grade solve (research/39 "Local edits"): the Auto grade line in blocks between long straights
 * (a straight over 4 km, and any block over 5 km: at lines across the A–B axis every 4 km), each with its own
 * mass balance
 * (boundaries from the route within 5 km), nothing placed by the stations, the full gradient outside the
 * last block; separation and strict retries judged per stretch, support lifts within their block (pins
 * kept where the line had them); grade-separated routes retry once to clear crossed roads where no
 * crossing could be built, and deepen a cutting a sag filled in under a bridge over us; retries judged
 * without noise problems.
 * 26: any mapped road can be rebuilt: a rebuilt stretch keeps its old road where its line stays on it
 * (nothing built or billed there), every road is checked against the network as the player edited it
 * (designed roads crossed by the same crossing engine, the lower-ranking road held on the other's deck
 * and credited once), a house two roads take is billed once; single-road bills unchanged.
 * 27: the grade search prices a built-up stretch at town rates (SPK CN urban road, bridge and tunnel rows,
 * the urban other-objects surcharge, building land), as the bill does; a retaining wall too high where the
 * feature begins stands nearer the road where it is low enough; a bank over water no wall can hold back
 * gets a short bridge.
 * 28: crossing remedies as designers choose them: a crossed road meeting ours at under 70° may be laid
 * on a new line square across it (research/44); a road that runs into our earthworks and back out on
 * the same side is moved beside them (and crossings of one way inside our earthworks are one); neighbouring
 * tracks and service roads are joined to one crossing (research/45), reroutes join the target's road where
 * it comes nearest; a reroute's earth slopes take the houses they reach; a dead-end stub left with no room
 * to turn is removed; an automatic crossing with nothing buildable under a high embankment lengthens our bridge.
 * Rebuilt railways keep their old track where unchanged; railway clearance retries use structured
 * diagnostics; an untouched motorway direction follows an inward pull as one paired body.
 * 29: the player's road takes over from our reroutes (planned again clear of it); new railways and motorways
 * are crossed by the line that outranks them, a held road high above the owner's bridge passes over it; a way
 * merged into another's crossing that our earthworks bury is a crossing of its own; an embankment whose slope
 * never meets the hillside is a bridge; railways: a band line missing a clearance is weighed against the
 * wide band's, streams in a cutting and failed reroutes join the separation retry (research/57). Single-road
 * D11 bills unchanged; the Královec railway starter 10.5506 → 10.5857 bn.
 * 30: more projects of several roads are priced: a rebuilt stretch's end meets another road as at a junction
 * also where it stopped short of that road's works (its old road beyond the end, or what is left of it, under
 * them); a closure's detour interacts only with changes within its reach; roads one above the other are
 * compared point by point. reroute-takeover-audit (D11): unpriced 47 → 13 of 292. Single-road bills unchanged.
 * 31: design realism (research/46–54): side slopes as built (VL 1 2022 fills, cuts by ground: sound rock 4:1
 * netted), no unsourced high-earthworks reserve, the "other objects" surcharge without B.6 technology on
 * two-lane roads (29.4 / 48.1 %), ČSN 73 6101:2018 vertical radii and gradients by category; a route ending on
 * a motorway may meet its other carriageway in its end cell; deep culverts become buried bridges, soft ground
 * under fills is treated; design speed per bend and hairpins (ČSN 73 6101:2000 §8.5.7); grade limits by terrain
 * class; an underpass box ends where our slope covers its roof, wing walls beyond.
 * 32: crossings (research/60): a straightened line's new pieces are built like a reroute (within the class
 * gradient, earthworks up to 10 m) instead of lying on the ground; a reroute takes a home only where nothing
 * else can be built; the player's underpass lets the way be lowered, keeps our road on earth over its box, and
 * a player's choice that cannot be built (a straightening, a bridge over us) leaves the rest as Auto had it.
 * D11 frozen bills: direct-90 −11.6 M (km 8.26 track straightened), town-centre −10.2 M (km 10.05 track
 * straightened), direct-80 drawn heights of its straightened legs only.
 * 33: our line raised for a crossing (research/61): a reroute through homes where a box would do at a higher
 * line, and a player's box or bridge our line leaves too little room for, are met by a local lift or a new
 * grade solve with that height, the cheaper that works and adds no problem, only while the regrade costs no
 * more than the crossing's own treatment; a player's choice is no fixed point of the first grade solve; a
 * crossing the player chose owns its way's stretch also where it cannot be built; a player's plain "Cut and
 * reroute" no longer keeps a crossing Auto moves beside ours. D11 frozen: direct-80 4,183 → 4,157 M (km 6.83:
 * an underpass at a re-solved line instead of a street reroute through three homes).
 * 34: tunnels as they are built (research/49, /51): a tunnel goes on as cut and cover (SPK A.3.H, +7.5 %) out to
 * portals where the ground is a structure height (9 m) above the grade, ≥ 12 m per portal, its pit beyond 5 m of
 * cover billed; the grade search's tunnel mode (a deep stretch all tunnel or all open); one 2-lane tube over 500 m
 * gets an escape tunnel (×1.3) or a second tube (NV 264/2009); streams stay over a tunnel 9 m below them; a cutting
 * that never reaches the top of the hillside is a tunnel; the player's method (Mined / Cut and cover); minimum
 * tunnel 100 m. D11 bills unchanged (no tunnels); d3-0304, d35, d35-full and the Královec railway dearer.
 * 35: bridge styles (research/50, data/bridges.ts BRIDGE_STYLES): short spans (≈ 30 m, one span to 60 m over
 * something below), long spans (equal 45–60 m, or one span to 180 m with side spans ≥ 0.56 × it; over 60 m on a deck
 * ≥ 40 m high at most 1.2 × the 30 m-span price, PROVISIONAL), an arch (100–250 m, priced as a 30 m-span viaduct as
 * high as its highest point); Auto takes the cheapest that fits (the grade search and the structure choice see the
 * cheaper of short and long spans), the player may choose another (only that choice: the bridge stays Auto's).
 * A house under a deck ≥ 15 m up and 3 m over its roof stays unless a pier stands on it (research/62). Our bridge
 * over a road the player chose is met through the regrade retry, its price said.
 * 36: a long mined tube costs less per metre (Hessen's length curve, research/64): × 0.957 at 1 km, 0.935 at 2 km,
 * ≥ 0.92; the structure choice weighs the bill's tube rows by the tunnel's length (it took the ≤ 500 m row).
 * 37: a support lift's target moved onto the traced line's point is raised by what the line falls from there to
 * where the height is needed (it fell short on steep grades); side roads our earthworks cover: a dead end with no
 * room to turn round before its junction is cut back to it, an overbridge whose ramps would bury a road beside it
 * is cleared by the grade on every road (the separation retry), a split-off way is judged with that retry.
 * D11 frozen +0–5.5 M (the lifts).
 * 38: a side road whose junction lies on a stretch we rebuild beside our earthworks is re-joined where the new road
 * crosses it (within 25 m of its old junction; the stub between goes): some designs become valid (Nová Paka drags).
 * Frozen bills, starters and the outcome audit unchanged.
 * (No version: a later finish of an evaluation builds again only the crossings near where its road differs from
 * an earlier finish's, crossings-kept.ts. No bill, validity or other field moved on any checked design:
 * docs/evaluate-performance.md.)
 * 39: projects of several roads (playtest sweep 3): a road carried over ours is let off exactly what our road bills
 * for that bridge (it was let off all it built within the ramps' reach); a railway of the project crossing ours follows
 * our crossing's height (ours no longer digs under it as under a mapped railway; the crossing is its deck only); a held
 * line high above the deck set for it passes over on that bridge built higher; a mapped road's own curve built anew
 * is Auto's; a new road that ends nowhere is priced, not valid (it was unpriced). Frozen single-road bills unchanged.
 * 40: two roads change the same old road only where their changes reach each other along it (each its ramps, box or
 * cut piece, a reroute's junction): more projects of several roads are priced. Frozen single-road bills unchanged.
 * 41: playtest sweep 3. A slowed bend keeps the road speed's curve where it fits, a slowed stretch's heights are
 * searched as for the road's speed with its own smaller curves weighed in one more pass (research/66; designs with
 * slowed bends only); a bend is never faster than its road;
 * arches rise to 1/3.5 of their span, a bridge to 3.3 × its arch, the rib's clearance in the search, an arch Auto's
 * only without a lift (research/69); no cut deeper than 30 m, presplit rock faces, rock cut by its kind
 * (research/67); bridge ends in fills on cones, billed and weighed (research/68); a cone never covers what lies under
 * the bridge (a wall, or Auto's bridge goes on). D11 frozen +15 … +745 M (PLAN.md "Playtest sweep 3"), D3 0302
 * 4,935 → 7,045 M.
 * 42: bridge ends, one rule (owner's review of the Královec railway: walls up to 28 m): what a cone would cover that
 * nothing moves aside, anywhere on its ground, closes the end with a wall only on a fill up to 10 m, billed as the wall it
 * is (abutment-cone.ts closedEndWall); above it Auto's bridge goes on, else the cone stands and what it covers is a
 * problem; a minor way under a cone is moved aside by the footprint screen; a fill between two bridges closed off by a
 * wall is bridged where the deck costs less. D11 frozen −78 … +49 M (PLAN.md "Bridge ends: one rule").
 * 43: Auto never squeezes two of its own changes of slope into each other: a support lift whose widened block end
 * would (profile-remedies.ts) fails and the grade solve places its points there instead. Some drags change bill and
 * validity (the owner's Královec drag: NOT VALID → VALID, 9.15 bn); frozen bills, saved designs unchanged
 * (scripts/vc-overlap-audit.ts). */
export const COST_MODEL_VERSION = 43;

/** OTSKP 2026 excavation by class: 12273 (I) 183, 12283 (II) 391, 12293 (III) 653 CZK/m³ */
export const EXCAVATION_BY_CLASS = { I: 183, II: 391, III: 653 };
/** SPK CN excavability mix assumed by the norm: 75 % class I, 20 % class II, 5 % class III */
export const EXCAVATION_MIX = { I: 0.75, II: 0.2, III: 0.05 };
// Local excavation profiles come from the ČGS ground grid, not a universal depth rule.
// Estimated lithology-dependent weathering: pipeline/ground_profiles.json, research/10-geology-excavation.md.

export const PRICES = {
  /** weighted excavation price, CZK/m³ (≈ 248) */
  excavation: EXCAVATION_MIX.I * EXCAVATION_BY_CLASS.I + EXCAVATION_MIX.II * EXCAVATION_BY_CLASS.II
    + EXCAVATION_MIX.III * EXCAVATION_BY_CLASS.III,
  /** OTSKP 17110 placing fill (the route's own cut) with compaction, CZK/m³ (90–116; 100 used) */
  fillPlacing: 100,
  /** OTSKP 12273B haulage, CZK per m³·km */
  haulPerM3Km: 19.64,
  /** surplus cut is hauled this far to a tip, km (no landfill fee: OTSKP 014101 is project-specific) */
  surplusHaulKm: 10,
  /** OTSKP 17180 "placing fill from purchased material", CZK/m³: a composite item that includes the
   * placing, so 17110 is not charged on bought fill (research/09 §3) */
  borrowFill: 636,
  /** excavation items include haul ≤ 1 km: only the haul beyond this is charged, m */
  freeHaul: 1000,
  /** OTSKP 12110 topsoil stripping, CZK/m³ */
  topsoil: 83,
  /** PROVISIONAL: topsoil depth stripped over the footprint, m */
  topsoilDepth: 0.3,
  /** SPK CN "other objects" surcharge, rural, two-lane roads: B.1–B.5 + B.7 = 6 + 5 + 6 + 3.7 + 3.7 + 5 %
   * = +29.4 % of construction (SPK průvodní zpráva p. 15: B.6 technology "pouze u dálnic a směrově dělených
   * silnic a u městských komunikací se světelnou signalizací"; research/46 §2) */
  otherObjectsSurcharge: 0.294,
  /** B.6 technology (tolls, SOS, traffic management): +1.2 %, motorways (divided roads) only */
  technologySurcharge: 0.012,
  /** SPK CN A.3.R.2.NE.K bored 2-lane tunnel, rural, up to 500 m: CZK per km */
  tunnelShortPerKm: 1_487_547_000,
  /** SPK CN A.3.R.2.NE.D bored 2-lane tunnel, rural, over 500 m: CZK per km */
  tunnelLongPerKm: 1_549_899_000,
  tunnelLongThreshold: 500,
  /** SPK CN A.3.H.2.NE.K cut-and-cover 2-lane tunnel, rural, up to 500 m: CZK per km (+7.5 % on the bored row;
   * the row includes the pit's earthworks up to 5 m of cover over the structure, research/49 §3, /51 §1.1) */
  cutCoverShortPerKm: 1_598_997_000,
  /** SPK CN A.3.H.2.NE.D cut-and-cover 2-lane tunnel, rural, over 500 m: CZK per km */
  cutCoverLongPerKm: 1_666_020_000,
  /** OTSKP 17411 "zásyp jam a rýh zeminou se zhutněním": backfilling a cut-and-cover pit, CZK/m³ (research/49 §3) */
  pitBackfill: 195.56,
};

/**
 * Tunnels as Czech ones are built (research/49 portals, /51 methods). Mining starts at ≈ 6 m of cover over
 * the crown (STRUCTURE_RULES.tunnelMinDepth); from there out to the portal a tunnel is cut and cover: built
 * in an open pit that is backfilled, so the ground is put back over it and only about one structure height
 * of approach cut stays open (D11 Poříčí / Opevnění, Radejčín, Mezno, Valík: 12–50 m per portal, cover
 * 0 m at the portal). Cut and cover is also the method where the ground is too thin to mine (any cover up to
 * 13 m, the Radejčín card); SPK prices its pit up to 5 m of cover, earthworks beyond that are
 * billed (excavation + backfill). Escape provision: NV 264/2009 (tunnels over 500 m) requires emergency
 * exits ≤ 500 m apart above 2,000 veh/day/lane and two tubes above 10,000; for one 2-lane tube that is an
 * escape gallery, ≈ 1.3 × the tube (Hessen Mobil 2006 Fig. 3-6: 121–135 %, research/51 §3).
 */
export const TUNNEL_RULES = {
  /** a tunnel structure's height over the grade, m: the ground is level with its roof here (D11 Poříčí
   * excavation 8.8 m high): the portal stands where the ground is this far above the grade */
  structureHeight: 9,
  /** each portal is at least this much cut and cover, m (one D11 block; typical 12–50 m) */
  portalCutCoverMin: 12,
  /** cut and cover is dug from above with at most this much cover over the structure, m (TKP-D kap. 7 annex,
   * the Radejčín tunnel card: "hloubená část min 0 m, max 13 m"; backfill over the vault 7.0–7.5 m at
   * Prackovice / Radejčín, research/49 §2, §5) */
  cutCoverMaxCover: 13,
  /** SPK's cut-and-cover rows include the pit up to this cover, m: earthworks beyond are billed */
  cutCoverPricedCover: 5,
  /** PROVISIONAL: the pit's side slopes, horizontal per vertical: 1:1 on average over its steep (3:1–5:1,
   * nailed) lower and sloped (1:1.5–1:2) upper faces (research/49 §2) */
  pitSlope: 1,
  /** PROVISIONAL: the structure's walls beside the crown, m each side */
  wallThickness: 1,
  /** PROVISIONAL game rule: the cut in front of a portal is at most this deep, m (the deepest Czech portal pits: D0
   * Komořany 30 m in sand, Mrázovka 27 m rock walls; Hessen Mobil: pre-cuts over ≈ 20 m "only with high effort";
   * research/49 §2). Auto's portals stand where the cut is a structure height deep; the player's may be deeper. */
  maxPortalCut: 30,
  /** NV 264/2009: requirements apply to tunnels over this length, m */
  escapeFromLength: 500,
  /** NV 264/2009 annex 1 §3.6 / §1.2: emergency exits above, two tubes above, veh/day/lane */
  escapeFromLaneTraffic: 2_000,
  twinTubesFromLaneTraffic: 10_000,
  /** one tube with an escape gallery against one tube (Hessen Fig. 3-6: 121–135 %) */
  escapeGalleryFactor: 1.3,
  /** A long mined tube's price per metre against the > 500 m row (SPK has no length step beyond 500 m):
   * f(L) = a + b / L for L > 500 m, through Hessen Mobil 2006 Abb. 3-2 (spec. cost per tube-m: 98.9 % at 500 m,
   * 94.8 % at 1 km, 92.4 % at 2 km, normalised to 500 m; the BASt/Bochum 2019 civil-cost model agrees, ≈ 0.90–0.92
   * at 1.8 km with the equipment share held): 0.957 at 1 km, 0.935 at 2 km. Beyond 2 km no data (ventilation and
   * control-centre steps from 3 km): held at `min` (research/64). */
  lengthFactor: { a: 0.913, b: 43.7, min: 0.92 },
};

/**
 * Value of a m³ of fill material used for decisions (auto-profile, bridge vs embankment), CZK/m³.
 * The auto-profile searches [lo, hi] for the value at which its grade line neither buys fill nor tips
 * a surplus; `start` (PROVISIONAL, typical for the D11 terrain) is where the search begins and what
 * manual profiles use. Bounds: a m³ of surplus cut costs its haul to a tip (≈ −196); a m³ of fill
 * bought instead of placed from the route's own cut costs borrowFill − fillPlacing (536), since
 * decisions add fillPlacing to every m³ of fill.
 */
export const MATERIAL_VALUE = {
  start: 200,
  lo: -PRICES.surplusHaulKm * PRICES.haulPerM3Km,
  hi: PRICES.borrowFill - PRICES.fillPlacing,
  /** m³ of imbalance per m of route tolerated */
  tolerancePerM: 1.5,
};

/** Earthworks the SFDI road norm already includes per km (research/00 §3.1) */
export const NORM_EARTHWORK_ALLOWANCE = {
  // One direction of a split motorway: 60 % of the motorway allowance, like its 60 % norm (SPK p. 7).
  // Field tracks: 6,000 m³/km (SPK 2026 report p. 7, "polní cesty"). Local roads: the report states no volume,
  // only "běžné zemní práce … bez výrazných výkopů či násypů"; PROVISIONAL the field-track 6,000, the smallest
  // volume it gives for any road (research/42).
  cutPerKm: { motorway: 70_000, 'motorway-carriageway': 0.6 * 70_000, I: 40_000, II: 20_000, local: 6_000, track: 6_000 } as Record<string, number>,
  fillShareOfCut: 0.85,
  /** share of cut that is unsuitable: hauled to a tip ≤ 10 km and replaced from a borrow pit (norm
   * assumption; applied identically to the allowance and to the player's design) */
  unsuitableShare: 0.15,
  /** PROVISIONAL: footprint width beyond the crown assumed for the norm's topsoil allowance, m */
  topsoilExtraWidth: 12,
};

/** Land outside built-up areas (research/07). Act 416/2009 §3b(1a): non-building land is bought at 8×
 * the price set by an expert appraisal, which §3b(2) sets at the usual (market) price. */
export const LAND = {
  /** 8 × 40 CZK/m²: Czech farmland trades mostly at 30–55 CZK/m² (2024–25; low confidence locally).
   * Forest at the same 320 incl. standing timber is a PROVISIONAL research-informed estimate,
   * NOT a sourced combined land+timber valuation (forest land alone 8–50 CZK/m²). */
  perM2: 8 * 40,
  /** PROVISIONAL research-informed estimate per m² forest footprint: PUPFL removal levy ≈ 20
   * (0–50, statutory formula is site-specific) + clearing ≈ 30 (15–40); neither is a sourced
   * local rate (research/07 §4). */
  forestExtraPerM2: 50,
};

/**
 * Side slopes of fills and cuts, horizontal : vertical (research/48 §1). Fills: MD ČR VL 1 (2022) sheet
 * 32-01, bands measured from the toe up: up to 3 m 1:2.5; above it 1:1.5 on fills up to 6 m high; on higher
 * fills 3–6 m 1:1.75 and above 6 m 1:1.5; no benches (the 1995 counterweight berm is optional). Cuts by the
 * ground the face stands in (the ČGS weathering profile, research/10): soil and weathered rock as soils
 * (VL 2 1995 sheet 301.04 note 2): not steeper than 1:2 in cuts up to 2 m deep, else 1:1.75, a 1 m bench every
 * 6 m of height (I/27 Klatovy EIA: 1 m bench in cuts over 6 m; the repeat every 6 m PROVISIONAL); sound rock
 * (class III) 4:1 with 1 m benches every 5 m (II/157 Srubec 2025 permit: 4:1 with 1.0 m benches; VL 2 sheet
 * 301.07: 5 m between benches), its face presplit and netted (OTSKP 12892 2,360.50 + 289941 2,513.47 CZK/m²; that
 * every steep rock face is netted is PROVISIONAL, SPOŽES F16 all-in remediation is 4,300); rock by its kind below. Railway formations use the same shapes
 * (PROVISIONAL: no SŽ slope source researched). Not modelled: stepped ground under fills on slopes over 10 %
 * (OTSKP 12673), counterweight berms, landslide-prone flysch at 1:2.5.
 */
export const SIDE_SLOPES = {
  fillToe: 2.5, fillToeHeight: 3, fillMiddle: 1.75, fillUpper: 1.5, fillUpperFrom: 6,
  /** The standard profile holds for fills up to 10 m (VL 2 1995 sheet 302.02 "V = 6,00–10,00"; ČSN 73 6133:1998
   * "1:1,5 – 6,0 m až 10,0 m"); a higher soil fill is designed individually (VL 1 2022 note 1). Game assumption
   * for that design (research/52): the part above 6 m at 1:1.8 (Adam, Grundbau-Taschenbuch tab. 4: 1:1.5–1.8 above
   * 10 m, 1:1.8–2 for silty/clayey sands), reached linearly between 10 and 15 m so the shape has no step. Not
   * modelled: rock fill at 1:1.5 at any height (the route's cut is pooled), counterweight berms on weak ground. */
  fillStandardTo: 10, fillHighUpper: 1.8, fillHighBlend: 5,
  cutShallow: 2, cutShallowDepth: 2, cutSoil: 1.75, cutRock: 0.25,
  soilBenchEvery: 6, rockBenchEvery: 5, benchWidth: 1,
  /** Rock below the weathered layer by what it is (pipeline/ground_profiles.json keys; research/67, decision 3): rock that
   * weathers fast is cut like soil ("Sklony svahů v poloskalních a rychle zvětrávajících horninách se navrhují jako
   * svahy v zeminách", VL 2 1995 sheet 301.04 note 2; FGSV M Fels via Grundbau-Taschenbuch 2.1: "verwitterungsanfällige
   * Gesteine … weniger als 1:1,5"; claystones, siltstones and marlstones named by BAW 2017; marl on D11 1108 / D35):
   * Permian siltstone / claystone and Cretaceous marlstone. Interbedded claystone sequences and phyllites (Brandecker
   * group D, Grundbau-Taschenbuch 2.1 Bild 16) at 5:4 faces; Cretaceous sandstone (group C) at 2:1. Medium
   * confidence; the others (gneiss, quartzite, limestone, igneous, the Permian and Carboniferous sandstones and
   * conglomerates) keep 4:1 (group A/B; II/157). Fault zones (D3 Luka at 1:1.25) are beyond a rock-type rule. */
  rockByGround: { perm_fine: 'soil', marl: 'soil', carb_mixed: 0.8, phyllite: 0.8, cret_sand: 0.5 } as Readonly<Record<string, number | 'soil'>>,
  /** A rock face steeper than this (1:n, n below it) is blasted to a controlled face and netted: presplit OTSKP 12892
   * (class III, "v [m2] požadované výsledné plochy"), recommended by TKP 4 (2026) art. 52 ("vhodné zvážit a eventuálně
   * použít technologii řízeného výlomu"), research/67 decision 2; faces of 2:1 and flatter are dug, not netted. */
  rockFaceSteepest: 0.5,
  rockFacePerM2: 2_513.47 + 2_360.50,
};

/**
 * Subgrade treatment under fills on soft cohesive ground (research/48 §5, /52): VL 1 2022 sheet 32-01 note 1
 * asks high fills for bearing capacity / settlement checks and "popřípadě úpravy podloží"; D11 1107 treated the
 * subgrade under every fill over 3 m on its fine clayey soils. The SPK road norm leaves out "zlepšování
 * podloží" (research/46 §2), so it is billed: OTSKP 215662 hydraulic binder ≤ 1.5 %, ≤ 0.5 m deep, 226.28 CZK/m²
 * over the fill's footprint (the binder share PROVISIONAL: the middle of the 1–2 % items). Ground: the
 * Quaternary loams, floodplain, peat, mixed slope/stream deposits and made ground of the ČGS profiles
 * (pipeline/ground_profiles.json keys; PROVISIONAL which count as soft). Vertical drains, consolidation
 * time and counterweight berms are not priced (no source).
 */
export const SUBGRADE = { fromHeight: 3, perM2: 226.28, grounds: ['loam', 'alluvium', 'peat', 'mixed', 'fill'] as readonly string[] };

/** Structure selection parameters (game rules, not norm values) */
export const STRUCTURE_RULES = {
  /** a bridge is only considered where the grade is at least this high above ground, m */
  bridgeMinHeight: 4,
  /** mining starts where the ground is this far above the grade: ≈ 6 m of cover over an 8 m crown (Czech mined
   * portals 5.5–8.5 m, research/49 §1); shallower, a tunnel is cut and cover */
  tunnelMinDepth: 14,
  minBridgeLength: 30,
  /** TKP-D kap. 7: a road tunnel is longer than 100 m (shorter covered sections are underpasses); research/49 §5.
   * 150 → 100 m changed no outcome of the audits (outcome-audit, every scenario pack) */
  minTunnelLength: 100,
  /** a tunnel's portal: where the ground is a structure height over the grade (TUNNEL_RULES) */
  portalDepth: TUNNEL_RULES.structureHeight,
  /** Sourced game rule (research/67, decision 1): Auto builds no road or motorway cut deeper than this, m: a tunnel. The D3
   * EIA (2010, printed p. 23): "zářezy v kratších úsecích hloubky 20-30 m, zde jsou však navrženy tunely" and its
   * tunnel table gives "náhrada hlubokého zářezu" as the first purpose of every 0302–0303 tunnel; Hessen Mobil
   * (Heft 52, 2006, §4.1.1): "Die wirtschaftliche Grenze für eine Einschnittslösung liegt erfahrungsgemäß bei ca.
   * 30 m Tiefe"; the deepest Czech motorway cut, the D1 Lensedelský zářez, is 38 m (ČVUT FD 12PPOK). The upper end
   * of the D3 range. The player may still paint a deeper cut. Railways: not applied (no railway source). */
  deepCut: 30,
  /** cut and cover at each portal at least, m */
  portalCutCoverMin: TUNNEL_RULES.portalCutCoverMin,
  /** grade must be at least this far above a river / railway the road crosses, m (deck + clearance) */
  riverClearance: 3,
  railClearance: 7.5,
  /** earthwork gaps shorter than this between two bridges / tunnels are merged into the structure */
  bridgeGapMerge: 60,
  tunnelGapMerge: 150,
};
