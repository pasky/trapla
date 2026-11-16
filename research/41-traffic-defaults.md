# Traffic a rebuilt or new road starts with

Snapshot: 2026-11-16. Follows [40-traffic-census.md](40-traffic-census.md) (the ŘSD CSD 2025 layer and its
fields). Used by `src/core/data/traffic.ts`, `src/core/traffic-census.ts`, `pipeline/build_traffic.py`.

The player is never asked to invent a road's traffic. A rebuilt stretch starts with **the census count of
its own section**; a road the census did not count, and a road built with Build → Road, start with **the
average road of their class**, labelled as an estimate in the road's card. The fields stay editable.

## 1. Class averages (the estimate)

Source: Sazmová, L. (Ipsos), Bartoš, L., Trnka, P. (EDIP), Jahoda, J. (ŘSD): *Celostátní sčítání dopravy
2025: metodika a výsledky projektu*, Silniční obzor 9/2026 (ročník 87), pp. 12–18,
<https://www.edip.cz/files/aktualne/2026-10-31-silnicni-obzor-csd-2025/silnicni-obzor-2026-09-csd-2025.pdf>
(read 2026-11-16). Field work 1 April – 23 October 2025; roads opened after 30 October 2025 are not in
the results. "The average traffic is the traffic performance divided by the length of the network" (§6),
so it covers the whole class, counted and uncounted roads alike.

Tab. 4, average traffic by category and class, vehicles/24 h:

| Category | CSD 2025 | (tab. 6: CSD 2020) | (CSD 2016) |
|---|---:|---:|---:|
| Motorways, class I | 38 958 | | |
| Motorways, class II | 28 042 | | |
| Motorways, all | 34 442 | 30 724 | 29 056 |
| Class I roads | **9 613** | 9 087 | 8 506 |
| Class II roads | **3 036** | 2 887 | 2 612 |
| Class III roads | **736** | 723 | 673 |

Tab. 7 traffic performance 2025, million vehicle-km/24 h: motorways 51.8, class I 55.0, class II 44.7,
class III 25.1 (so 25.1 M ÷ 736 ≈ 34 100 km of class III roads: the whole network).

The game uses the three bold values (`CLASS_TRAFFIC`). **GAME PRIOR:** the class average is sourced;
assuming it for one particular road is the game's estimate, and the card says so.

Known bias, not corrected: the census counts only selected class III roads (1 678 counted sections,
5 482 km, length-weighted mean 2 080 vehicles/24 h in the Geoportal layer). Subtracting their performance
from tab. 7 leaves (25.1 M − 5 482 km × 2 080) ÷ (34 100 − 5 482) km ≈ 480 vehicles/24 h for the uncounted
class III roads. That is our own derivation (it mixes the article's network length with the layer's
section lengths), so the published 736 is used; an uncounted class III road is on average somewhat
quieter than the game assumes (≈ 1.9 dB less noise at 480 than at 736).

## 2. Heavy share by class

The article gives vans by class (7.8 % on class I and II, 7.5 % on class III) but no heavy share by class.
Computed from the Geoportal layer (research/40) by `pipeline/fetch_census.py` → `national-classes.json`:
sum of `TV` (heavy vehicles) ÷ sum of `SV` over every counted section (`SV > 0`) of the class
(`PKOD_TR_K`: 1 motorway, 2 class I, 3 class II, 4 class III), 8 877 sections, fetched 2026-11-16:

| Class | sections | counted | counted km | heavy share |
|---|---:|---:|---:|---:|
| Motorways | 336 | 313 | 1 513 | 18.3 % |
| I | 2 214 | 2 138 | 5 587 | **10.3 %** |
| II | 4 353 | 4 197 | 14 376 | **7.5 %** |
| III | 1 974 | 1 678 | 5 482 | **6.4 %** |

Cross-check with the article: motorways 6 800 heavy of 34 400 = 19.8 % (network average; the layer's
section-sum gives 18.3 %). In CSD 2025 vans (`DOD`) are counted separately and are not in `TV`, which fits
the noise model's split into light and heavy vehicles (research/11).

## 3. Matching a mapped road to its census section

- **Coordinates.** The layer's lines are EPSG:5514; pack metres are EPSG:5514 minus the play area's
  south-west corner (`meta.json` `origin` = scenario `bbox5514[0..1]`). Verified on every mapped way that
  carries a counted road number (distance of the way's middle to the nearest section of that number):

  | Pack | ≤ 5 m | ≤ 15 m | ≤ 50 m | ≤ 200 m | ≤ 1 km | more |
  |---|---:|---:|---:|---:|---:|---:|
  | D3 | 342 | 10 | 2 | 12 | 17 | 24 |
  | D11 | 552 | 6 | 7 | 12 | 41 | 23 |

  The far ones are real: other parts of a class III road of which the census counted one stretch
  (III/1027: 20 ways), or a stretch shared by two numbers that the census files under the other one.
- **Rule** (`censusSection`): same road number (any of the way's numbers, `ref` split at `;`), section
  line within `CENSUS_MATCH` = 50 m (PROVISIONAL, from the table above) of the middle of the rebuilt
  stretch; the nearest such section. `vehicles = 0` means not counted → the class average.
- **Road numbers keep their leading zeros.** III/00315 (a branch of I/3 near Jílové) is not II/315; the
  first version of the fetch script turned `00315` into `315` and `01412` into `1412` (research/40's
  tables were corrected). OSM writes `00315` too.
- Suffixed labels (`105 H`, `43 H`, `16 L`) are separate census sections whose meaning was not verified;
  they match no mapped road number and are ignored.
- D3: of 433 rebuildable stretches 170 start with a census count, 263 with the class average. III/1057
  (the owner's case) is not in the census → 736 vehicles/24 h, 6.4 % heavy, labelled.

## 4. Shipping

`uv run --with requests python pipeline/fetch_census.py` (cache: `pipeline/cache/csd/`), then
`uv run python pipeline/build_traffic.py [scenario …]` writes `public/scenarios/<id>/traffic.json`
(`{version, source, year, sections: [{id, road, vehicles, heavy, lines}]}`, local metres, lines simplified
to 1 m; 18–64 kB). `meta.json` is untouched (D11's bytes stay frozen); complete packs get their manifest
and ready marker rewritten, as `build_transport.py` does. Without the file the game uses class averages.
