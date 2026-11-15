"""Build the data pack of one scenario, configured by pipeline/scenarios/<id>.json (default: d11).

Usage (from repo root):
    uv run --with numpy --with tifffile --with pyproj --with pillow --with shapely --with mapbox-earcut \
        python pipeline/build_pack.py [scenario-id]        # or: npm run data [-- scenario-id]

Writes public/scenarios/<id>/. Raw downloads are cached in pipeline/cache/ so reruns are offline.
See README.md for the pack format and docs/new-scenario.md for adding a scenario.
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image, ImageDraw
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache"
UA = "trapla-pipeline/0.1 (road-design game prototype; https://github.com/pasky; contact pasky@ucw.cz)"


def load_scenario(sid: str) -> dict:
    return json.loads((ROOT / "pipeline" / "scenarios" / f"{sid}.json").read_text())


# The scenario is the first command-line argument (also when imported by vectors.py stand-alone).
SCENARIO = load_scenario(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "d11")
OUT = ROOT / "public" / "scenarios" / SCENARIO["id"]

# --- Play area: axis-aligned rectangle in S-JTSK / Krovak East North (EPSG:5514), metres ----------
X_MIN, Y_MIN, X_MAX, Y_MAX = (float(v) for v in SCENARIO["bbox5514"])
CELL = float(SCENARIO.get("cell", 5))  # metres
NX = int(round((X_MAX - X_MIN) / CELL))  # 3500 columns (west -> east)
NY = int(round((Y_MAX - Y_MIN) / CELL))  # 4500 rows (row 0 = north edge)
if NX <= 0 or NY <= 0 or NX * NY > SCENARIO.get("maxRasterCells", 15_750_000):
    raise ValueError("scenario raster exceeds its reviewed memory budget")
NODATA_U16 = 65535
H_QUANT = 0.1  # metres per height unit in the pack

TO_SJTSK = Transformer.from_crs(4326, 5514, always_xy=True)
TO_WGS = Transformer.from_crs(5514, 4326, always_xy=True)



def log(*a):
    print(*a, file=sys.stderr, flush=True)


def http_get(url: str, data: bytes | None = None, timeout=300) -> bytes:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


# ------------------------------------------------------------------------------------------------
# Terrain
# ------------------------------------------------------------------------------------------------
def fetch_terrain() -> np.ndarray:
    """Return Float32 heights [NY, NX], row 0 = north, NaN where the service has no data."""
    rows_per_req = 900
    out = np.full((NY, NX), np.nan, dtype=np.float32)
    for r0 in range(0, NY, rows_per_req):
        r1 = min(NY, r0 + rows_per_req)
        ymax = Y_MAX - r0 * CELL
        ymin = Y_MAX - r1 * CELL
        f = CACHE / f"dmr5g_{int(X_MIN)}_{int(ymin)}_{int(X_MAX)}_{int(ymax)}_{NX}x{r1 - r0}.tif"
        if not f.exists():
            params = {
                "bbox": f"{X_MIN},{ymin},{X_MAX},{ymax}",
                "bboxSR": "5514",
                "imageSR": "5514",
                "size": f"{NX},{r1 - r0}",
                "format": "tiff",
                "pixelType": "F32",
                "noData": "-9999",
                "interpolation": "RSP_BilinearInterpolation",
                "f": "image",
            }
            url = ("https://ags.cuzk.gov.cz/arcgis2/rest/services/dmr5g/ImageServer/exportImage?"
                   + urllib.parse.urlencode(params))
            log("fetch", url)
            data = http_get(url)
            if not data[:4] in (b"II*\x00", b"MM\x00*"):
                raise RuntimeError(f"not a TIFF: {data[:300]!r}")
            f.write_bytes(data)
            time.sleep(2)  # be polite
        a = tifffile.imread(f).astype(np.float32)
        if a.ndim == 3:
            a = a[..., 0]
        assert a.shape == (r1 - r0, NX), a.shape
        a[(a < -1000) | (a > 3000)] = np.nan
        out[r0:r1] = a
    return out


def fill_nodata_for_display(h: np.ndarray) -> np.ndarray:
    """Smooth diffusion fill of NaN areas (display only; those cells stay out-of-bounds)."""
    mask = np.isnan(h)
    if not mask.any():
        return h.copy()
    # multigrid-ish: fill on coarse levels then upsample
    def coarse_fill(a: np.ndarray, m: np.ndarray) -> np.ndarray:
        if a.shape[0] <= 8 or a.shape[1] <= 8:
            v = np.nanmean(a) if (~m).any() else 0.0
            b = a.copy()
            b[m] = v
            return b
        ny2, nx2 = (a.shape[0] + 1) // 2, (a.shape[1] + 1) // 2
        pad = np.pad(np.where(m, 0, a), ((0, ny2 * 2 - a.shape[0]), (0, nx2 * 2 - a.shape[1])))
        wpad = np.pad((~m).astype(np.float32), ((0, ny2 * 2 - a.shape[0]), (0, nx2 * 2 - a.shape[1])))
        s = pad.reshape(ny2, 2, nx2, 2).sum(axis=(1, 3))
        w = wpad.reshape(ny2, 2, nx2, 2).sum(axis=(1, 3))
        cm = w == 0
        c = np.where(cm, 0, s / np.maximum(w, 1e-9)).astype(np.float32)
        c = coarse_fill(c, cm)
        up = np.repeat(np.repeat(c, 2, axis=0), 2, axis=1)[: a.shape[0], : a.shape[1]]
        b = np.where(m, up, a)
        # a few smoothing passes inside the hole
        for _ in range(4):
            sm = b.copy()
            sm[1:-1, 1:-1] = 0.25 * (b[:-2, 1:-1] + b[2:, 1:-1] + b[1:-1, :-2] + b[1:-1, 2:])
            b = np.where(m, sm, a)
        return b
    return coarse_fill(np.where(mask, 0, h).astype(np.float32), mask)


# ------------------------------------------------------------------------------------------------
# OSM
# ------------------------------------------------------------------------------------------------
def latlon_bbox():
    xs = [X_MIN, X_MAX, X_MIN, X_MAX]
    ys = [Y_MIN, Y_MIN, Y_MAX, Y_MAX]
    lon, lat = TO_WGS.transform(xs, ys)
    return min(lat) - 0.002, min(lon) - 0.002, max(lat) + 0.002, max(lon) + 0.002


OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]


def osm_cache(name: str) -> Path:
    """Overpass results are keyed by query name only, so each scenario needs its own file pattern."""
    return CACHE / SCENARIO.get("osmCache", "osm_{id}_{name}.json").format(id=SCENARIO["id"], name=name)


def baseline_osm(data: dict) -> dict:
    from reference import baseline
    return baseline(data, SCENARIO.get("baselineExcludeWayIds", []))


def overpass(name: str, body: str, *, reference=False, bounds=None, allow_split=True) -> dict:
    f = osm_cache(name)
    if f.exists():
        data = json.loads(f.read_text())
        return data if reference else baseline_osm(data)
    s, w, n, e = bounds or latlon_bbox()
    seconds = 90 if SCENARIO.get("requireComplete", False) else 240
    q = f"[out:json][timeout:{seconds}][bbox:{s:.5f},{w:.5f},{n:.5f},{e:.5f}];\n{body}\nout geom qt;"
    last = None
    for attempt in range(6):
        url = OVERPASS[attempt % 2]
        try:
            log("overpass", name, url)
            data = http_get(url, urllib.parse.urlencode({"data": q}).encode(), timeout=seconds + 60)
            d = json.loads(data)
            if "remark" in d or "elements" not in d:
                raise RuntimeError(f"incomplete Overpass response: {d.get('remark', 'no elements')}")
            f.write_bytes(data)
            time.sleep(3)
            return d if reference else baseline_osm(d)
        except Exception as ex:  # 429/5xx: back off and try the other mirror
            last = ex
            log("  failed:", ex)
            if attempt == 1 and allow_split and SCENARIO.get("requireComplete", False):
                # Large region queries can exhaust the public service's time allowance. Fetch
                # four bounded tiles, preserving full source geometry/IDs and raw exclusions.
                mid_lat, mid_lon = (s + n) / 2, (w + e) / 2
                merged, snapshots = {}, []
                for i, tile in enumerate(((s, w, mid_lat, mid_lon), (s, mid_lon, mid_lat, e),
                                          (mid_lat, w, n, mid_lon), (mid_lat, mid_lon, n, e))):
                    part = overpass(f"{name}_tile{i}", body, reference=True, bounds=tile, allow_split=False)
                    snapshots.append(part.get("osm3s", {}))
                    for el in part["elements"]:
                        key = (el["type"], el["id"])
                        if key in merged and merged[key] != el:
                            raise RuntimeError(f"OSM changed between tiles: {key}; refresh these query caches")
                        merged[key] = el
                combined = {"elements": list(merged.values()), "tileSnapshots": snapshots, "query": q}
                f.write_text(json.dumps(combined, ensure_ascii=False))
                return combined if reference else baseline_osm(combined)
            time.sleep(20 * (attempt + 1))
    raise RuntimeError(f"overpass {name} failed: {last}")


def to_local(lon, lat):
    x, y = TO_SJTSK.transform(lon, lat)
    return np.asarray(x) - X_MIN, np.asarray(y) - Y_MIN


def way_xy(el) -> np.ndarray:
    g = el.get("geometry") or []
    if not g:
        return np.zeros((0, 2))
    lon = np.array([p["lon"] for p in g])
    lat = np.array([p["lat"] for p in g])
    x, y = to_local(lon, lat)
    return np.stack([x, y], axis=1)


def rings_of(el):
    """Yield (outer_rings, inner_rings) in local coords for a closed way or a multipolygon relation."""
    from shapely.geometry import LineString
    from shapely.ops import polygonize, linemerge

    if el["type"] == "way":
        xy = way_xy(el)
        if len(xy) >= 4:
            return [xy], []
        return [], []
    outers, inners = [], []
    for role, acc in (("outer", outers), ("inner", inners)):
        lines = []
        for m in el.get("members", []):
            if m.get("type") != "way" or m.get("role", "outer") != role or not m.get("geometry"):
                continue
            xy = way_xy(m)
            if len(xy) >= 2:
                lines.append(LineString(xy))
        if not lines:
            continue
        try:
            merged = linemerge(lines)
            for poly in polygonize(merged):
                acc.append(np.asarray(poly.exterior.coords))
        except Exception:
            pass
    return outers, inners


def px(xy: np.ndarray):
    """local metres -> raster pixel coords (PIL, x right, y down)."""
    return [(float(x / CELL), float((Y_MAX - Y_MIN - y) / CELL)) for x, y in xy]


# Land-cover classes (Uint8 raster in the pack)
LC_NONE, LC_FOREST, LC_WATER, LC_BUILDING, LC_ROAD, LC_URBAN, LC_RAIL, LC_STREAM = 0, 1, 2, 3, 4, 5, 6, 7


# --- engine data (cost model inputs): built-up mask, building attributes, road network ---------------
# Extra keys written to overlays.json next to buildings / places / roads (filled by build_overlays).
ENGINE_OVERLAYS: dict = {}
LEGACY_SOURCE_IDS: list[int] = []  # separate from overlays.net: preserve its exact bytes
BUILTUP_BIT = 8  # land-cover byte bit 3: inside OSM landuse residential / commercial / industrial / retail
BUILTUP_TAGS = ("residential", "commercial", "industrial", "retail")
# building kind codes (prices and default levels per kind live in src/core/data/urban.ts)
BK_HOUSE, BK_APARTMENTS, BK_CIVIC, BK_INDUSTRIAL, BK_MINOR = 0, 1, 2, 3, 4
BK_BY_TAG = {
    **{k: BK_HOUSE for k in ("house", "residential", "detached", "semidetached_house", "terrace", "bungalow",
                             "farm", "cabin", "hotel")},
    **{k: BK_APARTMENTS for k in ("apartments", "dormitory")},
    **{k: BK_CIVIC for k in ("civic", "school", "church", "chapel", "kindergarten", "fire_station", "government",
                             "office", "hospital", "public", "transportation", "university", "train_station")},
    **{k: BK_INDUSTRIAL for k in ("industrial", "warehouse", "commercial", "retail", "supermarket", "barn",
                                  "farm_auxiliary", "service", "greenhouse", "manufacture", "kiosk", "stable",
                                  "cowshed", "sty", "hangar")},
    **{k: BK_MINOR for k in ("garage", "garages", "outbuilding", "shed", "roof", "transformer_tower", "bunker",
                             "ruins", "allotment_house", "static_caravan", "carport", "hut", "construction")},
}
ZONE_RES, ZONE_IND, ZONE_FARM = 1, 2, 3


def building_info(el, xy: np.ndarray, zone: int):
    """[area m², tagged levels (0 = none), kind, obb cx, cy, half-length, half-width, angle deg] or None.

    PROVISIONAL classification of untyped buildings (building=yes, 46 % of the area's buildings): < 50 m² →
    minor (garage/shed sized); otherwise by the land-use zone under the centroid (industrial / commercial /
    retail / farmyard → industrial), an address or a residential zone → house; outside any zone: house below
    300 m², industrial (barn/hall) above. Anything under 30 m² is minor whatever its tag.
    """
    from shapely.geometry import Polygon

    t = el.get("tags", {})
    try:
        poly = Polygon(xy)
        if not poly.is_valid:
            poly = poly.buffer(0)
        area = float(poly.area)
        rect = poly.minimum_rotated_rectangle
        rc = np.asarray(rect.exterior.coords)[:4]
    except Exception:
        return None
    if area <= 0 or len(rc) < 4:
        return None
    e0, e1 = rc[1] - rc[0], rc[2] - rc[1]
    l0, l1 = float(np.hypot(*e0)), float(np.hypot(*e1))
    if l0 < l1:
        e0, l0, l1 = e1, l1, l0
    ang = math.degrees(math.atan2(e0[1], e0[0])) % 180.0
    c = rc.mean(axis=0)
    tag = t.get("building", "yes")
    kind = BK_BY_TAG.get(tag)
    if kind is None:  # "yes" and rare values
        if area < 50:
            kind = BK_MINOR
        elif zone in (ZONE_IND, ZONE_FARM):
            kind = BK_INDUSTRIAL
        elif zone == ZONE_RES or "addr:housenumber" in t or "building:flats" in t:
            kind = BK_APARTMENTS if "building:flats" in t else BK_HOUSE
        else:
            kind = BK_HOUSE if area < 300 else BK_INDUSTRIAL
    if area < 30:
        kind = BK_MINOR
    try:
        levels = max(0, min(40, int(round(float(t.get("building:levels", "0").split(";")[0])))))
    except ValueError:
        levels = 0
    return [round(area, 1), levels, kind, round(float(c[0]), 1), round(float(c[1]), 1),
            round(l0 / 2, 1), round(l1 / 2, 1), round(ang, 1)]


def paint_feature(img, outers, inners, value: int):
    """Paint one polygon feature into a mask image: each outer ring minus the holes that lie in it.

    A hole only removes what its own outer ring would have painted — not other features, and not an
    island (another outer ring of the same multipolygon) lying inside the hole.
    """
    from shapely.geometry import Polygon

    outers = [r for r in outers if len(r) >= 3]
    inners = [r for r in inners if len(r) >= 3]
    if not outers:
        return
    if not inners:
        d = ImageDraw.Draw(img)
        for r in outers:
            d.polygon(px(r), fill=value)
        return
    # assign each hole to the smallest outer ring containing it
    holes = [[] for _ in outers]
    try:
        polys = [Polygon(r) for r in outers]
        for hole in inners:
            pt = Polygon(hole).representative_point()
            inside = [i for i, p in enumerate(polys) if p.contains(pt)]
            if inside:
                holes[min(inside, key=lambda i: polys[i].area)].append(hole)
    except Exception:  # invalid geometry: paint the outers without holes
        holes = [[] for _ in outers]
    for ring, own in zip(outers, holes):
        pts = px(ring)
        x0, y0 = max(0, int(min(p[0] for p in pts))), max(0, int(min(p[1] for p in pts)))
        x1, y1 = min(NX, int(max(p[0] for p in pts)) + 2), min(NY, int(max(p[1] for p in pts)) + 2)
        if x1 <= x0 or y1 <= y0:
            continue
        tmp = Image.new("L", (x1 - x0, y1 - y0), 0)
        dt = ImageDraw.Draw(tmp)
        dt.polygon([(x - x0, y - y0) for x, y in pts], fill=255)
        for hole in own:
            dt.polygon([(x - x0, y - y0) for x, y in px(hole)], fill=0)
        img.paste(value, (x0, y0), tmp)


# existing road network for crossings: class order = index in the exported "cls" list
NET_CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
               "living_street", "service", "track"]


def road_network(lines: dict) -> dict:
    """Existing roads as simplified integer-metre polylines [classIndex, x0, y0, x1, y1, ...].

    Ways tagged bridge / tunnel / covered are left out (crossing them at ground level is free: the DMR 5G
    ground under an existing bridge is the valley floor). Tracks and service roads come from a second
    Overpass query (cached as osm_roads2.json).
    """
    from shapely.geometry import LineString

    extra = overpass("roads2", 'way["highway"~"^(service|track|living_street|secondary_link|tertiary_link)$"];')
    ways = []
    LEGACY_SOURCE_IDS.clear()
    w, h = X_MAX - X_MIN, Y_MAX - Y_MIN
    for el in lines["elements"] + extra["elements"]:
        t = el.get("tags", {})
        if "highway" not in t or t.get("bridge", "no") != "no" or t.get("tunnel", "no") != "no" \
                or t.get("covered", "no") != "no":
            continue
        hw = t["highway"].replace("_link", "")
        if hw not in NET_CLASSES:
            continue
        xy = way_xy(el)
        if len(xy) < 2:
            continue
        if xy[:, 0].max() < 0 or xy[:, 0].min() > w or xy[:, 1].max() < 0 or xy[:, 1].min() > h:
            continue
        s = np.asarray(LineString(xy).simplify(1.0).coords)
        ways.append([NET_CLASSES.index(hw)] + [int(round(float(v))) for v in s.reshape(-1)])
        LEGACY_SOURCE_IDS.append(el["id"])
    return {"cls": NET_CLASSES, "ways": ways}


def build_overlays():
    lc = Image.new("L", (NX, NY), LC_NONE)
    d = ImageDraw.Draw(lc)
    # built-up mask (land-cover bit 3) and land-use zone under buildings (classification of building=yes)
    built = Image.new("L", (NX, NY), 0)
    zone = Image.new("L", (NX, NY), 0)
    # separate must-bridge mask (rivers, water areas, railways) so that roads painted over a river in
    # the categorical raster cannot erase a crossing
    cross_w = Image.new("L", (NX, NY), 0)
    dc = ImageDraw.Draw(cross_w)
    cross_r = Image.new("L", (NX, NY), 0)
    dr = ImageDraw.Draw(cross_r)
    cover = overpass("cover", """(
  way["landuse"~"^(forest|residential|industrial|commercial|retail|farmyard)$"];
  relation["landuse"~"^(forest|residential|industrial|commercial|retail)$"];
  way["natural"~"^(wood|water)$"];
  relation["natural"~"^(wood|water)$"];
  way["waterway"="riverbank"];
);""")
    urban_tags = ("residential", "industrial", "commercial", "retail", "farmyard")

    def cls(tags):
        if tags.get("natural") == "water" or tags.get("waterway") == "riverbank":
            return LC_WATER
        if tags.get("landuse") == "forest" or tags.get("natural") == "wood":
            return LC_FOREST
        if tags.get("landuse") in urban_tags:
            return LC_URBAN
        return None

    # draw order: urban, forest, water
    for want in (LC_URBAN, LC_FOREST, LC_WATER):
        for el in cover["elements"]:
            if cls(el.get("tags", {})) != want:
                continue
            outers, inners = rings_of(el)
            for r in outers:
                if len(r) >= 3:
                    d.polygon(px(r), fill=want)
                    if want == LC_WATER:
                        dc.polygon(px(r), fill=1)
            for r in inners:
                if len(r) >= 3:
                    d.polygon(px(r), fill=LC_NONE)
                    if want == LC_WATER:
                        dc.polygon(px(r), fill=0)  # islands are not crossings
            if want == LC_URBAN:
                lu = el.get("tags", {}).get("landuse")
                if lu in BUILTUP_TAGS:
                    paint_feature(built, outers, inners, 1)
                paint_feature(zone, outers, inners,
                              ZONE_RES if lu == "residential" else ZONE_FARM if lu == "farmyard" else ZONE_IND)

    # draw order matters: later classes win (roads/rail over streams over cover)
    lines = overpass("lines", """(
  way["waterway"~"^(river|stream|canal)$"];
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link)$"];
  way["railway"="rail"];
);""")
    road_w = {"motorway": 4, "trunk": 4, "primary": 3, "secondary": 3, "tertiary": 2,
              "unclassified": 1, "residential": 1}
    roads_out = []
    for el in lines["elements"]:
        t = el.get("tags", {})
        xy = way_xy(el)
        if len(xy) < 2:
            continue
        if "waterway" in t:
            # rivers (and water areas) force a bridge in the game; streams get culverts (in the norm)
            if t["waterway"] == "river":
                d.line(px(xy), fill=LC_WATER, width=3)
                dc.line(px(xy), fill=1, width=3)
            else:
                d.line(px(xy), fill=LC_STREAM, width=1)
        elif t.get("railway") == "rail":
            d.line(px(xy), fill=LC_RAIL, width=1)
            dr.line(px(xy), fill=1, width=2)
        else:
            hw = t["highway"].replace("_link", "")
            d.line(px(xy), fill=LC_ROAD, width=road_w.get(hw, 1))
            if hw in ("motorway", "trunk", "primary", "secondary"):
                roads_out.append({"ref": t.get("ref", ""), "cls": hw,
                                  "xy": np.round(xy[::1], 1).tolist()})

    ENGINE_OVERLAYS["net"] = road_network(lines)
    zone_a = np.asarray(zone, dtype=np.uint8)
    binfo = ENGINE_OVERLAYS.setdefault("binfo", [])
    binfo.clear()

    blds = overpass("buildings", 'way["building"];')
    bout = []
    for el in blds["elements"]:
        xy = way_xy(el)
        if len(xy) < 3:
            continue
        d.polygon(px(xy), fill=LC_BUILDING)
        cx, cy = xy[:-1, 0].mean(), xy[:-1, 1].mean()
        rad = float(np.max(np.hypot(xy[:, 0] - cx, xy[:, 1] - cy)))
        if 0 <= cx <= X_MAX - X_MIN and 0 <= cy <= Y_MAX - Y_MIN:
            bout.append([round(float(cx), 1), round(float(cy), 1), round(rad, 1)])
            zr, zc = min(NY - 1, int((Y_MAX - Y_MIN - cy) / CELL)), min(NX - 1, int(cx / CELL))
            # parallel to `buildings`; None (unusable geometry) → the engine falls back to the circle
            binfo.append(building_info(el, xy, int(zone_a[zr, zc])))

    places = overpass("places", 'node["place"~"^(town|village|hamlet|suburb|city)$"];')
    pout = []
    for el in places["elements"]:
        x, y = to_local(el["lon"], el["lat"])
        if 0 <= x <= X_MAX - X_MIN and 0 <= y <= Y_MAX - Y_MIN:
            pout.append({"name": el.get("tags", {}).get("name", "?"), "kind": el["tags"]["place"],
                         "x": round(float(x), 1), "y": round(float(y), 1)})
    cross = (np.asarray(cross_w, dtype=np.uint8) > 0).astype(np.uint8) << 5
    cross |= (np.asarray(cross_r, dtype=np.uint8) > 0).astype(np.uint8) << 6
    cross |= (np.asarray(built, dtype=np.uint8) > 0).astype(np.uint8) * BUILTUP_BIT
    return np.asarray(lc, dtype=np.uint8), cross, bout, pout, roads_out


# ------------------------------------------------------------------------------------------------
# Official line
# ------------------------------------------------------------------------------------------------
def official_line():
    """The official line: a chain of OSM ways (scenario "official"), and the endpoints A / B on it."""
    cfg = SCENARIO.get("official")
    if cfg is None or cfg.get("strategy") == "strict":
        from reference import chain_reference, endpoint
        if cfg is None:
            pts, kinds = np.empty((0, 2)), []
        else:
            data = overpass("reference", cfg["query"], reference=True)
            pts, kinds, ids = chain_reference(data["elements"], cfg, TO_SJTSK.transform)
            log(f"official reference ways: {ids}")
        cum = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]) if len(pts) else np.array([0.])
        log(f"official line: {len(pts)} points, {cum[-1]:.0f} m")
        a = endpoint(SCENARIO["A"], pts, cum, TO_SJTSK.transform)
        b = endpoint(SCENARIO["B"], pts, cum, TO_SJTSK.transform)
        for name, point in (("A", a), ("B", b)):
            if not (X_MIN < point[0] < X_MAX and Y_MIN < point[1] < Y_MAX):
                raise ValueError(f"endpoint {name} outside play area")
        return pts, kinds, cum, a, b
    d = json.loads((ROOT / cfg["extract"]).read_text())
    ways = []
    for el in d["elements"]:
        t = el.get("tags", {})
        if el["type"] != "way" or t.get("ref") != cfg["ref"]:
            continue
        if not (t.get("highway") == cfg["highway"] or t.get("construction") == cfg["highway"]):
            continue
        g = el["geometry"]
        ll = np.array([[p["lon"], p["lat"]] for p in g])
        x, y = TO_SJTSK.transform(ll[:, 0], ll[:, 1])
        ways.append({"id": el["id"], "xy": np.stack([x, y], 1), "tags": t})
    bx, by = TO_SJTSK.transform(cfg["startNear"][1], cfg["startNear"][0])
    start = min(ways, key=lambda w: math.hypot(w["xy"][0, 0] - bx, w["xy"][0, 1] - by))
    chain = [start]
    used = {start["id"]}
    while True:
        cur = chain[-1]
        end = cur["xy"][-1]
        hdg = cur["xy"][-1] - cur["xy"][-2]
        cands = []
        for w in ways:
            if w["id"] in used:
                continue
            dd = math.hypot(*(w["xy"][0] - end))
            if dd < 5.0:
                h2 = w["xy"][1] - w["xy"][0]
                cosang = float(np.dot(hdg, h2) / (np.linalg.norm(hdg) * np.linalg.norm(h2) + 1e-9))
                cands.append((-cosang, w))
        if not cands:
            break
        cands.sort(key=lambda c: c[0])
        nxt = cands[0][1]
        chain.append(nxt)
        used.add(nxt["id"])
    pts = [chain[0]["xy"][0]]
    kinds = []  # per segment: 0 normal, 1 bridge, 2 tunnel
    for w in chain:
        k = 1 if w["tags"].get("bridge") else 2 if w["tags"].get("tunnel") else 0
        for p in w["xy"][1:]:
            pts.append(p)
            kinds.append(k)
    pts = np.array(pts)
    seg = np.hypot(*np.diff(pts, axis=0).T)
    cum = np.concatenate([[0], np.cumsum(seg)])
    log(f"official line chain: {len(chain)} ways, {cum[-1]:.0f} m")

    def endpoint(e: dict):
        """{"alongOfficial": metres from the chain start} or {"latlon": [lat, lon]}, EPSG:5514"""
        if "latlon" in e:
            return np.array(TO_SJTSK.transform(e["latlon"][1], e["latlon"][0]))
        s = float(e["alongOfficial"])
        if s <= 0:
            return pts[0]
        i = int(np.searchsorted(cum, s))
        t = (s - cum[i - 1]) / seg[i - 1]
        return pts[i - 1] + t * (pts[i] - pts[i - 1])

    return pts, kinds, cum, endpoint(SCENARIO["A"]), endpoint(SCENARIO["B"])


# ------------------------------------------------------------------------------------------------
# Vector render data (pipeline/vectors.py): the browser shades the relief from the height grid and
# rasterises land cover / roads / buildings from vectors, so no drape texture is baked any more.
# ------------------------------------------------------------------------------------------------
def cached_osm(name: str) -> dict:
    """Raw Overpass result fetched earlier by build_overlays()."""
    f = osm_cache(name)
    if not f.exists():
        raise RuntimeError(f"{f} missing: run the full pipeline (npm run data) first")
    return baseline_osm(json.loads(f.read_text()))


def extra_cover() -> list:
    """Render-only OSM extras (not used by the game rules): fields / meadows / parks, minor ways."""
    cover2 = overpass("cover2", """(
  way["landuse"~"^(meadow|farmland|grass|orchard|cemetery|allotments|village_green|recreation_ground|reservoir|basin)$"];
  relation["landuse"~"^(meadow|farmland|grass|orchard)$"];
  way["leisure"~"^(park|garden|pitch|golf_course|playground)$"];
  way["natural"~"^(grassland|heath|scrub)$"];
);""")
    return [cover2["elements"]]


def extra_lines() -> list:
    """Tracks and service roads: the same Overpass result road_network() uses for crossings."""
    return [cached_osm("roads2")["elements"]]


def build_vectors(transport_lines=None) -> dict:
    import vectors
    return vectors.build(OUT, cached_osm, way_xy, rings_of, X_MAX - X_MIN, Y_MAX - Y_MIN,
                         extra_polys=extra_cover(), extra_lines=extra_lines(), transport_lines=transport_lines)


def build_transport(render_lines):
    import transport
    elements = cached_osm("lines")["elements"] + cached_osm("roads2")["elements"]
    return transport.build(OUT, elements, way_xy, render_lines, LEGACY_SOURCE_IDS, log)


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    if SCENARIO.get("requireComplete", False):
        # A failed rebuild may leave mixed old/new files. Never advertise that as playable.
        (OUT / "ready.json").unlink(missing_ok=True)
    # Resolve references before expensive raster work; bad manifests must fail early.
    pts, kinds, cum, a, b = official_line()
    h = fetch_terrain()
    # Hydrology uses raw DMR nodata, never the display fill or painted land cover.
    import hydrology
    watercourses = hydrology.build(h, CELL, hydrology.fetch_waterways(osm_cache, overpass),
                                   way_xy, OUT, log)
    oob = np.isnan(h)
    import geology
    ground = geology.build(CACHE, OUT, (X_MIN, Y_MIN, X_MAX, Y_MAX), http_get, log, oob,
                           profile_overrides=SCENARIO.get("groundProfileOverrides"))
    log(f"terrain {NX}x{NY}, nodata {oob.mean() * 100:.1f} %, range {np.nanmin(h):.1f}..{np.nanmax(h):.1f}")
    h_disp = fill_nodata_for_display(h)

    hmin = float(np.floor(np.nanmin(h_disp)) - 1)
    q = np.round((h_disp - hmin) / H_QUANT)
    assert q.max() < NODATA_U16
    q = q.astype(np.uint16)
    # Pack heights for display everywhere; out-of-bounds is a separate mask in the land-cover byte
    # (bit 7) so the renderer has a smooth surface while the game still forbids building there.
    # Row-wise delta coding (int16, wraps) + gzip.
    dq = np.diff(q.astype(np.int32), axis=1, prepend=0).astype(np.int16)
    (OUT / "height.i16.gz").write_bytes(gzip.compress(dq.tobytes(), 9))

    try:
        lc, cross, buildings, places, roads = build_overlays()
        have_osm = True
    except Exception as ex:  # legacy fallback only; new published packs require complete data
        if SCENARIO.get("requireComplete", False):
            raise
        log("OSM overlays failed:", ex)
        lc, cross, buildings, places, roads = np.zeros((NY, NX), np.uint8), np.zeros((NY, NX), np.uint8), [], [], []
        have_osm = False
    lc_pack = lc | cross | (oob.astype(np.uint8) << 7)
    (OUT / "landcover.u8.gz").write_bytes(gzip.compress(lc_pack.tobytes(), 9))

    for stale in list(OUT.glob("tex_*.jpg")) + [OUT / "overview.jpg"]:  # baked drape of older packs
        stale.unlink(missing_ok=True)
    transport_lines = [] if SCENARIO.get("requireComplete", False) else None
    try:
        vector = build_vectors(transport_lines) if have_osm else None
    except Exception as ex:  # legacy fallback only
        if SCENARIO.get("requireComplete", False):
            raise
        log("vector render data failed:", ex)
        vector = None

    transport_meta = build_transport(transport_lines) if transport_lines is not None and vector else None
    loc = lambda p: [round(float(p[0] - X_MIN), 1), round(float(p[1] - Y_MIN), 1)]
    a_lon, a_lat = TO_WGS.transform(a[0], a[1])
    b_lon, b_lat = TO_WGS.transform(b[0], b[1])
    # thin the official line to ~10 m spacing for display
    keep = [0] if len(pts) else []
    for i in range(1, len(pts)):
        if math.hypot(*(pts[i] - pts[keep[-1]])) > 10 or i == len(pts) - 1:
            keep.append(i)
    meta = {
        "id": SCENARIO["id"],
        "name": SCENARIO["name"],
        "crs": "EPSG:5514",
        "origin": [X_MIN, Y_MIN],
        "comment": "local x = EPSG:5514 x - origin[0] (east), local y = EPSG:5514 y - origin[1] (north)",
        "cell": CELL, "nx": NX, "ny": NY,
        "gridNote": "row 0 is the north edge; sample (col,row) centre = (origin.x+(col+0.5)*cell, origin.y+height-(row+0.5)*cell)",
        "heights": {"file": "height.i16.gz", "encoding": "gzip(int16 row-wise delta of uint16 q); h = base + q*scale",
                    "base": hmin, "scale": H_QUANT},
        "landcover": {"file": "landcover.u8.gz", "classes": {"0": "none", "1": "forest", "2": "water",
                      "3": "building", "4": "road", "5": "urban", "6": "rail", "7": "stream"}, "classMask": 7, "builtUpBit": BUILTUP_BIT, "riverCrossingBit": 32, "railCrossingBit": 64, "oobBit": 128},
        "vector": vector,
        "ground": ground,
        "watercourses": watercourses,
        # optional view layer, streamed by the browser per view (public ČÚZK view service, CORS enabled)
        "orthophoto": {"export": "https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/MapServer/export",
                       "sr": 5514, "attribution": "© ČÚZK, Ortofoto ČR, CC BY 4.0"},
        "A": {"xy": loc(a), "latlon": [round(a_lat, 6), round(a_lon, 6)],
              "note": SCENARIO["A"]["note"]},
        "B": {"xy": loc(b), "latlon": [round(b_lat, 6), round(b_lon, 6)],
              "note": SCENARIO["B"]["note"]},
        "official": {"xy": [loc(pts[i]) for i in keep], "lengthM": round(float(cum[-1]), 1),
                     "kinds": [int(max(kinds[keep[j - 1]:keep[j]] or [0])) for j in range(1, len(keep))]},
        "attribution": ["© ČÚZK, DMR 5G, CC BY 4.0", "© OpenStreetMap contributors, ODbL", "© ČGS, GEOCR50 + IG rajony 1:50 000"],
        "haveOsm": have_osm,
    }
    if (SCENARIO.get("official") or {}).get("publishedProjectLengthM"):
        meta["official"]["publishedProjectLengthM"] = SCENARIO["official"]["publishedProjectLengthM"]
    if transport_meta:
        meta["transport"] = transport_meta
    if SCENARIO.get("baselineNote"):
        meta["baselineNote"] = SCENARIO["baselineNote"]
    if SCENARIO.get("sources"):
        meta["sources"] = SCENARIO["sources"]
    meta_path = OUT / "meta.json"
    # Frozen legacy pack fingerprints include formatting bytes. Do not rewrite equal metadata.
    if not meta_path.exists() or json.loads(meta_path.read_text()) != meta:
        meta_path.write_text(json.dumps(meta, ensure_ascii=False))
    (OUT / "overlays.json").write_text(json.dumps(
        {"buildings": buildings, "places": places, "roads": roads, **ENGINE_OVERLAYS}, ensure_ascii=False, separators=(",", ":")))
    if SCENARIO.get("requireComplete", False):
        # Separate manifest leaves legacy D11 metadata/fingerprint semantics untouched.
        manifest = {"config": SCENARIO, "files": {}, "inputs": {}}
        for path in sorted(OUT.iterdir()):
            if path.is_file() and path.name not in ("manifest.json", "ready.json"):
                manifest["files"][path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(CACHE.glob(f"osm_{SCENARIO['id']}_*.json")):
            manifest["inputs"][path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
        # Written last; the picker requires this for new packs (legacy D11 is unchanged).
        (OUT / "ready.json").write_text(json.dumps({"id": SCENARIO["id"], "ready": True}))
    tot = sum(p.stat().st_size for p in OUT.iterdir())
    log(f"pack written to {OUT}: {tot / 1e6:.1f} MB; A={meta['A']} B={meta['B']}; "
        f"{len(buildings)} buildings, {len(places)} places")


if __name__ == "__main__":
    main()
