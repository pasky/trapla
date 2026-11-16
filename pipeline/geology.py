"""ČGS map priors → estimated excavation profiles (research/10-geology-excavation.md).

Raw ArcGIS pages are cached, ordered by object ID and envelope-keyed. No source data is committed.
"""
from __future__ import annotations

import gzip
import json
import math
import hashlib
import re
from pathlib import Path
import time
import urllib.parse

import numpy as np

GEOCR = "https://mapy.geology.cz/arcgis/rest/services/Geologie/GEOCR50_mobil/MapServer/2"
IG = "https://mapy.geology.cz/arcgis/rest/services/Geohazardy/IG_rajony50/MapServer/1"


def fetch_features(url, name, cache, bounds, http_get, log):
    """ArcGIS envelope query in EPSG:5514, stable pagination, restartable offline cache."""
    envelope = ",".join(str(int(v)) for v in bounds)
    features, seen = [], set()
    offset, last_id = 0, -1
    while True:
        # Keyset pagination: this service occasionally repeats the boundary row with resultOffset.
        path = cache / f"cgs_{name}_{envelope.replace(',', '_')}_after{last_id}.json"
        if path.exists():
            page = json.loads(path.read_text())
        else:
            params = dict(f="json", where=f"objectid > {last_id}", geometry=envelope, geometryType="esriGeometryEnvelope",
                          inSR=5514, outSR=5514, spatialRel="esriSpatialRelIntersects", outFields="*",
                          returnGeometry="true", orderByFields="objectid ASC",
                          resultRecordCount=500)
            log("ČGS fetch", name, offset)
            page = json.loads(http_get(url + "/query?" + urllib.parse.urlencode(params)))
            if "error" in page:
                # Some regions of IG_rajony50 fail spatial+ordered queries (ArcGIS 500),
                # while the same spatial ID query and bounded object-ID fetch succeed.
                id_path = cache / f"cgs_{name}_{envelope.replace(',', '_')}_ids.json"
                if id_path.exists():
                    ids = json.loads(id_path.read_text())
                else:
                    id_params = {k: v for k, v in params.items() if k not in
                                 ("outFields", "returnGeometry", "orderByFields", "resultRecordCount", "outSR")}
                    id_params.update(where="1=1", returnIdsOnly="true")
                    result = json.loads(http_get(url + "/query?" + urllib.parse.urlencode(id_params)))
                    if "objectIds" not in result:
                        raise RuntimeError(f"ČGS {name} ID query failed: {result}")
                    ids = sorted(set(result["objectIds"] or []))
                    if len(ids) > 100_000:
                        raise RuntimeError("geology envelope exceeds bounded feature budget")
                    id_path.write_text(json.dumps(ids))
                pending = [oid for oid in ids if oid > last_id]
                if pending:
                    def id_batch(batch):
                        batch_params = dict(f="json", objectIds=",".join(map(str, batch)),
                                            outFields="*", outSR=5514, returnGeometry="true")
                        result = json.loads(http_get(url + "/query?" + urllib.parse.urlencode(batch_params)))
                        if "error" in result and len(batch) > 1:
                            # IG sometimes fails a combined query whose individual features work.
                            # Bounded divide-and-fetch; never omit a failed polygon.
                            time.sleep(1)
                            middle = len(batch) // 2
                            return id_batch(batch[:middle]) + id_batch(batch[middle:])
                        if "features" not in result:
                            raise RuntimeError(f"ČGS {name}: ID batch failed: {result}")
                        got = {f["attributes"]["objectid"] for f in result["features"]}
                        if got != set(batch):
                            raise RuntimeError(f"ČGS {name}: incomplete ID batch")
                        return result["features"]
                    page = {"features": sorted(id_batch(pending[:100]), key=lambda f: f["attributes"]["objectid"]),
                            "exceededTransferLimit": len(pending) > 100}
                else:
                    page = {"features": []}
            if "error" in page or "features" not in page:
                raise RuntimeError(f"ČGS {name}: {page}")
            path.write_text(json.dumps(page, ensure_ascii=False))
            time.sleep(1)
        batch = page["features"]
        for feature in batch:
            attrs = {k.lower(): v for k, v in feature["attributes"].items()}
            oid = attrs["objectid"]
            if oid in seen:
                raise RuntimeError(f"ČGS {name}: repeated object ID {oid}; pagination failed")
            seen.add(oid)
            features.append(feature)
        if not page.get("exceededTransferLimit", False):
            break
        if not batch:
            raise RuntimeError(f"ČGS {name}: empty truncated page")
        offset += len(batch)
        last_id = max(seen)
    log(f"ČGS {name}: {len(features)} features")
    return features


def classify(a):
    """Dominant lithology first (not any occurrence in a list of subordinate interbeds)."""
    rock = (a.get("hor_karto") or "").lower()
    age = (a.get("utvar") or "").upper()
    genesis = (a.get("geneze") or "").lower()
    if "antropogenní" in genesis:
        return "fill"
    if "rašelin" in rock:
        return "peat"
    if "sediment nezpevněný" in (a.get("hor_typ") or ""):
        if "deluvio" in genesis or "proluvi" in genesis:
            return "mixed"
        if "deluvi" in genesis:
            return "slope" if "kamen" in rock or "blok" in rock else "loam"
        if "nivní" in rock:
            return "alluvium"
        if "fluvi" in genesis:
            return "gravel"
        return "loam"
    if "tuf" in rock and rock.startswith(("ryolit", "tuf")):
        return "tuff"
    if rock.startswith(("andez", "bazalt", "trach", "ryolit", "alkalický", "amfibolit", "zelená")):
        return "igneous"
    if "fylit" in rock or "svor" in rock:
        return "phyllite"
    if rock.startswith(("rula", "krystalická břidlice")):
        return "gneiss"
    if rock.startswith("krystalický vápenec"):
        return "carbonate"
    if rock.startswith(("kvarcit", "metalydit", "erlan", "břidlice, porfyroid", "pískovec,droba")):
        return "hard"
    if rock.startswith(("dacit", "limburgit", "nef. bazanit", "ol. sodalitit", "olivinický",
                        "pyroxenické andezity", "subvulk. bazalt")):
        return "igneous"
    if rock.startswith("metarkóza"):
        return "hard"
    if age in ("KŘÍDA", "TRIAS"):
        return "cret_sand" if "pískovce" in rock[:35] else "marl"
    if age in ("PERM", "KARBON"):
        # First named material, not first comma: commas also separate colour adjectives,
        # and subordinate interbeds can occur before any comma ("pískovce s vložkami ...").
        material = re.search(r"aleuropelit|aleoropelit|jílovc|prachovc|slínovc|pískovc|arkóz|arkoz|slepenc|brekci", rock)
        if not material:
            if rock.startswith(("droby", "valounové droby")):
                return "hard"
            if "břidlice" in rock:
                return "phyllite"
            if rock.startswith(("granit", "granodiorit")):  # Variscan intrusions dated to these periods
                return "igneous"
            return "unknown"
        first = material.group()
        fine = first in ("aleuropelit", "aleoropelit", "jílovc", "prachovc", "slínovc")
        if age == "KARBON":
            return "carb_mixed" if fine else "carb_sand"
        if fine:
            return "perm_fine"
        return "perm_congl" if first in ("slepenc", "brekci") else "perm_sand"
    # Additional Posázaví / Moravian map descriptions. These are broad lithology groups,
    # NOT measured excavation classes. Existing D11 matches above remain unchanged.
    if any(word in rock for word in ("granit", "granodiorit", "diorit", "tonalit", "trondhjemit",
                                     "gabro", "aplit", "pegmatit", "lamprofyr", "melilitit")):
        return "igneous"
    if rock.startswith(("dacit", "metaandez", "metabaz", "metadacit", "bazický metatuf")):
        return "igneous"
    if any(word in rock for word in ("rohovc", "metapískov", "metakvarc", "metadrob", "metakonglomer")) \
            or rock.startswith(("droby", "silicity", "slepence")):
        return "hard"
    if rock.startswith(("jílovité břidlice", "prachovce, břidlice")):
        return "phyllite"
    if "metatuf" in rock:
        return "tuff"
    if "ortorula" in rock:
        return "gneiss"
    if rock.startswith(("dolomitický vápenec", "karbonát sladkovodní", "vápence", "vložky kryst. vápence")):
        return "carbonate"
    if rock.startswith(("serpentinit", "arkózovité pískovce", "střídání slepenců", "valounové droby")):
        return "hard"
    if rock.startswith(("břidlice, prachovce", "jílovité a prachovité břidlice", "metaprachovce")):
        return "phyllite"
    # Moldanubian descriptions of the southern D3 sections (paragneiss, migmatite, dyke rocks).
    if "pararul" in rock or "migmatit" in rock:
        return "gneiss"
    if rock.startswith("porfyr"):
        return "igneous"
    if rock.startswith("žilný křemen"):
        return "hard"
    if "pyroxenit" in rock:
        return "igneous"
    if rock.startswith("leptynit"):
        return "hard"
    if rock.startswith(("vápenec", "krystalické vápence")):
        return "carbonate"
    # Barrandian descriptions at the Prague end (0301).
    if rock.startswith(("křemenný pískovec", "střídání drob")):
        return "hard"
    if "jílovité břidlice" in rock:
        return "phyllite"
    return "unknown"


IG_PROFILES = {"An": "fill", "D": "mixed", "Dk": "slope", "Ft": "gravel", "Fn": "alluvium",
               "P": "mixed", "Nk": "gravel", "Ss": "carb_sand", "Sf": "carb_mixed", "Sj": "perm_fine",
               "Mv": "gneiss", "Mn": "phyllite", "Sv": "carbonate", "Vl": "igneous", "Ih": "igneous", "Vk": "tuff"}


def polygon_of(feature):
    """Esri rings use even/odd nesting (multipart, holes, islands), independent of ring order."""
    from shapely.geometry import Polygon
    from shapely import make_valid
    shape = Polygon()
    for ring in feature["geometry"]["rings"]:
        if len(ring) >= 4:
            shape = shape.symmetric_difference(make_valid(Polygon(ring)))
    return shape


def rasterize(features, ids, bounds, cell):
    """Cell-centre membership, bounded to each polygon's clipped bbox; at most 630k points."""
    from shapely import contains_xy
    xmin, ymin, xmax, ymax = bounds
    nx, ny = round((xmax - xmin) / cell), round((ymax - ymin) / cell)
    raster = np.zeros((ny, nx), np.uint8)
    for feature, value in zip(features, ids):
        if not value:
            continue
        poly = polygon_of(feature)
        if poly.is_empty:
            continue
        x0, y0, x1, y1 = poly.bounds
        c0, c1 = max(0, math.floor((x0 - xmin) / cell)), min(nx, math.ceil((x1 - xmin) / cell))
        r0, r1 = max(0, math.floor((ymax - y1) / cell)), min(ny, math.ceil((ymax - y0) / cell))
        if c0 >= c1 or r0 >= r1:
            continue
        xs = xmin + (np.arange(c0, c1) + .5) * cell
        ys = ymax - (np.arange(r0, r1) + .5) * cell
        mask = contains_xy(poly, xs[None, :], ys[:, None])
        raster[r0:r1, c0:c1][mask] = value
    return raster


def build(cache, out, bounds, http_get, log, terrain_oob, profile_overrides=None):
    """25 m categorical grid aligned to the 5 m terrain. GEOCR50 wins, IG fills map gaps."""
    table = json.loads(Path(__file__).with_name("ground_profiles.json").read_text())
    # Regional priors must not silently inherit the fitted D11 excavation shares.
    for key, value in (profile_overrides or {}).items():
        if key not in table or not 0 <= value["classIto"] <= value["classIIto"]:
            raise ValueError(f"invalid regional ground profile: {key}")
        table[key] = {**table[key], **value}
    geo = fetch_features(GEOCR, "geocr50", cache, bounds, http_get, log)
    ig = fetch_features(IG, "ig50", cache, bounds, http_get, log)
    for f in ig:
        a = f["attributes"]
        code = a["rajon_kod"]
        if code in IG_PROFILES:
            table[f"ig_{code}"] = {**table[IG_PROFILES[code]], "name": f"IG {code}: {a['nazev']}"}
    keys = list(table)
    profiles = [{"key": key, **value} for key, value in table.items()]
    ids = {key: i for i, key in enumerate(keys)}
    cell = 25
    geo_keys = [classify(f["attributes"]) for f in geo]
    unknown = sorted({f["attributes"]["hor_karto"] for f, key in zip(geo, geo_keys) if key == "unknown"})
    log("ČGS unmapped lithologies:", unknown)
    grid = rasterize(geo, [ids[k] for k in geo_keys], bounds, cell)
    fallback = rasterize(ig, [ids.get(f"ig_{f['attributes']['rajon_kod']}", 0) for f in ig], bounds, cell)
    gaps = grid == 0
    grid[gaps] = fallback[gaps]
    (out / "ground.u8.gz").write_bytes(gzip.compress(grid.tobytes(), 9))
    # Count only centres with usable terrain, separately from Poland (not mapped by ČGS).
    playable = ~terrain_oob[2::5, 2::5]
    counts = np.bincount(grid[playable], minlength=len(keys))
    log("ČGS ground cells (playable centres):", dict(zip(keys, counts.tolist())))
    return {"file": "ground.u8.gz", "cell": cell, "nx": grid.shape[1], "ny": grid.shape[0],
            "profiles": profiles, "model": 1,
            "fingerprint": hashlib.sha256(grid.tobytes() + json.dumps(profiles, sort_keys=True).encode()).hexdigest(),
            "source": "© ČGS, GEOCR50 + IG rajony 1:50 000",
            "note": "25 m cell centres, row 0 north; estimated weathering depths, not measured stratigraphy; 0 = norm mix",
            "sources": [GEOCR, IG], "playableCellCounts": counts.tolist()}
