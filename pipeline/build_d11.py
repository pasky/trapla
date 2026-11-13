"""Build the scenario data pack for scenario #1 (D11 Trutnov - Polish border).

Usage (from repo root):
    uv run --with numpy --with tifffile --with pyproj --with pillow --with shapely \
        python pipeline/build_d11.py

Writes public/scenarios/d11/. Raw downloads are cached in pipeline/cache/ so reruns are offline.
See README.md for the pack format.
"""

from __future__ import annotations

import gzip
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
from PIL import Image, ImageDraw, ImageFilter
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache"
OUT = ROOT / "public" / "scenarios" / "d11"
UA = "trapla-pipeline/0.1 (road-design game prototype; https://github.com/pasky; contact pasky@ucw.cz)"

# --- Play area: axis-aligned rectangle in S-JTSK / Krovak East North (EPSG:5514), metres ----------
# Roughly lat 50.50-50.70 N, lon 15.82-16.06 E (the lat/lon box is rotated ~7 deg in Krovak; this
# rectangle is its inner part, 17.5 x 22.5 km).
X_MIN, X_MAX = -637500.0, -620000.0
Y_MIN, Y_MAX = -1011500.0, -989000.0
CELL = 5.0  # metres
NX = int(round((X_MAX - X_MIN) / CELL))  # 3500 columns (west -> east)
NY = int(round((Y_MAX - Y_MIN) / CELL))  # 4500 rows (row 0 = north edge)
NODATA_U16 = 65535
H_QUANT = 0.1  # metres per height unit in the pack

TO_SJTSK = Transformer.from_crs(4326, 5514, always_xy=True)
TO_WGS = Transformer.from_crs(5514, 4326, always_xy=True)

# Endpoint choice (documented in PLAN.md): B = northern end of D11 where OSM switches ref D11 -> S3 at
# the Polish border (first node of the southbound carriageway way 896584498). A = point on the
# southbound carriageway 21.0 km (along the line) south of B, near Trutnov-Poříčí.
B_LATLON = (50.6887, 15.9774)
A_DIST_ALONG = 21000.0


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


def overpass(name: str, body: str) -> dict:
    f = CACHE / f"osm_{name}.json"
    if f.exists():
        return json.loads(f.read_text())
    s, w, n, e = latlon_bbox()
    q = f"[out:json][timeout:240][bbox:{s:.5f},{w:.5f},{n:.5f},{e:.5f}];\n{body}\nout geom qt;"
    last = None
    for attempt in range(6):
        url = OVERPASS[attempt % 2]
        try:
            log("overpass", name, url)
            data = http_get(url, urllib.parse.urlencode({"data": q}).encode(), timeout=400)
            d = json.loads(data)
            f.write_bytes(data)
            time.sleep(3)
            return d
        except Exception as ex:  # 429/5xx: back off and try the other mirror
            last = ex
            log("  failed:", ex)
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


def build_overlays():
    lc = Image.new("L", (NX, NY), LC_NONE)
    d = ImageDraw.Draw(lc)
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

    places = overpass("places", 'node["place"~"^(town|village|hamlet|suburb|city)$"];')
    pout = []
    for el in places["elements"]:
        x, y = to_local(el["lon"], el["lat"])
        if 0 <= x <= X_MAX - X_MIN and 0 <= y <= Y_MAX - Y_MIN:
            pout.append({"name": el.get("tags", {}).get("name", "?"), "kind": el["tags"]["place"],
                         "x": round(float(x), 1), "y": round(float(y), 1)})
    cross = (np.asarray(cross_w, dtype=np.uint8) > 0).astype(np.uint8) << 5
    cross |= (np.asarray(cross_r, dtype=np.uint8) > 0).astype(np.uint8) << 6
    return np.asarray(lc, dtype=np.uint8), cross, bout, pout, roads_out


# ------------------------------------------------------------------------------------------------
# Official line
# ------------------------------------------------------------------------------------------------
def official_line():
    d = json.loads((ROOT / "research" / "data" / "d11-osm-extract.json").read_text())
    ways = []
    for el in d["elements"]:
        t = el.get("tags", {})
        if el["type"] != "way" or t.get("ref") != "D11":
            continue
        if not (t.get("highway") == "motorway" or t.get("construction") == "motorway"):
            continue
        g = el["geometry"]
        ll = np.array([[p["lon"], p["lat"]] for p in g])
        x, y = TO_SJTSK.transform(ll[:, 0], ll[:, 1])
        ways.append({"id": el["id"], "xy": np.stack([x, y], 1), "tags": t})
    bx, by = TO_SJTSK.transform(B_LATLON[1], B_LATLON[0])
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
    # A at A_DIST_ALONG
    i = int(np.searchsorted(cum, A_DIST_ALONG))
    t = (A_DIST_ALONG - cum[i - 1]) / seg[i - 1]
    a = pts[i - 1] + t * (pts[i] - pts[i - 1])
    b = pts[0]
    return pts, kinds, cum, a, b


# ------------------------------------------------------------------------------------------------
# Drape texture: hillshade + hypsometric tint + overlays
# ------------------------------------------------------------------------------------------------
TINT = [  # metres -> rgb
    (250, (122, 158, 104)), (350, (150, 180, 112)), (450, (190, 196, 132)), (550, (214, 202, 150)),
    (650, (204, 178, 134)), (800, (186, 160, 128)), (1000, (196, 186, 176)), (1300, (236, 234, 230)),
]


def hillshade(h: np.ndarray) -> np.ndarray:
    gy, gx = np.gradient(h, CELL)  # gy: along rows (southwards), gx: eastwards
    dzdx = gx
    dzdy = -gy  # northwards
    shade = np.zeros_like(h)
    weights = [(315, 45, 0.55), (270, 50, 0.2), (0, 50, 0.15), (225, 60, 0.1)]
    for az, alt, w in weights:
        azr = math.radians(az)
        altr = math.radians(alt)
        # light direction (east, north, up)
        lx, ly, lz = math.sin(azr) * math.cos(altr), math.cos(azr) * math.cos(altr), math.sin(altr)
        # normal = (-dzdx, -dzdy, 1)/|.|
        n = np.sqrt(dzdx ** 2 + dzdy ** 2 + 1)
        s = (-dzdx * lx - dzdy * ly + lz) / n
        shade += w * np.clip(s, 0, 1)
    return shade


def drape(h_disp: np.ndarray, oob: np.ndarray, lc: np.ndarray) -> np.ndarray:
    shade = hillshade(h_disp)
    shade = shade / max(1e-6, np.percentile(shade, 99.5))
    elev = [e for e, _ in TINT]
    rgb = np.zeros(h_disp.shape + (3,), dtype=np.float32)
    for c in range(3):
        rgb[..., c] = np.interp(h_disp, elev, [col[c] for _, col in TINT])
    def blend(mask, col, a):
        for c in range(3):
            rgb[..., c] = np.where(mask, rgb[..., c] * (1 - a) + col[c] * a, rgb[..., c])
    blend(lc == LC_URBAN, (205, 190, 185), 0.45)
    blend(lc == LC_FOREST, (58, 104, 58), 0.62)
    blend(lc == LC_WATER, (80, 140, 200), 0.85)
    blend(lc == LC_STREAM, (90, 150, 205), 0.7)
    blend(lc == LC_RAIL, (90, 80, 90), 0.8)
    blend(lc == LC_ROAD, (252, 246, 230), 0.9)
    shade_f = (0.35 + 0.8 * shade)[..., None]
    out = rgb * shade_f
    # buildings drawn after shading so they read clearly
    bm = lc == LC_BUILDING
    for c, v in enumerate((150, 70, 60)):
        out[..., c] = np.where(bm, v * (0.7 + 0.3 * shade), out[..., c])
    # out of bounds: desaturate and darken + hatch
    grey = out.mean(axis=2, keepdims=True)
    yy, xx = np.mgrid[0:h_disp.shape[0], 0:h_disp.shape[1]]
    hatch = ((xx + yy) % 24) < 2
    oobc = grey * 0.55 + 40
    oobc = np.where(hatch[..., None], oobc * 0.75, oobc)
    out = np.where(oob[..., None], oobc, out)
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    h = fetch_terrain()
    oob = np.isnan(h)
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

    pts, kinds, cum, a, b = official_line()
    try:
        lc, cross, buildings, places, roads = build_overlays()
        have_osm = True
    except Exception as ex:  # overlays are optional; core game works without
        log("OSM overlays failed:", ex)
        lc, cross, buildings, places, roads = np.zeros((NY, NX), np.uint8), np.zeros((NY, NX), np.uint8), [], [], []
        have_osm = False
    lc_pack = lc | cross | (oob.astype(np.uint8) << 7)
    (OUT / "landcover.u8.gz").write_bytes(gzip.compress(lc_pack.tobytes(), 9))

    img = Image.fromarray(drape(h_disp, oob, lc))
    tile = 1024
    tiles = []
    for ty in range(0, NY, tile):
        for tx in range(0, NX, tile):
            t = img.crop((tx, ty, min(NX, tx + tile), min(NY, ty + tile)))
            name = f"tex_{ty // tile}_{tx // tile}.jpg"
            t.save(OUT / name, quality=86, optimize=True)
            tiles.append({"file": name, "col0": tx, "row0": ty, "w": t.width, "h": t.height})
    img.resize((NX // 8, NY // 8), Image.LANCZOS).save(OUT / "overview.jpg", quality=85)

    loc = lambda p: [round(float(p[0] - X_MIN), 1), round(float(p[1] - Y_MIN), 1)]
    a_lon, a_lat = TO_WGS.transform(a[0], a[1])
    b_lon, b_lat = TO_WGS.transform(b[0], b[1])
    # thin the official line to ~10 m spacing for display
    keep = [0]
    for i in range(1, len(pts)):
        if math.hypot(*(pts[i] - pts[keep[-1]])) > 10 or i == len(pts) - 1:
            keep.append(i)
    meta = {
        "id": "d11",
        "name": "Trutnov → Polish border",
        "crs": "EPSG:5514",
        "origin": [X_MIN, Y_MIN],
        "comment": "local x = EPSG:5514 x - origin[0] (east), local y = EPSG:5514 y - origin[1] (north)",
        "cell": CELL, "nx": NX, "ny": NY,
        "gridNote": "row 0 is the north edge; sample (col,row) centre = (origin.x+(col+0.5)*cell, origin.y+height-(row+0.5)*cell)",
        "heights": {"file": "height.i16.gz", "encoding": "gzip(int16 row-wise delta of uint16 q); h = base + q*scale",
                    "base": hmin, "scale": H_QUANT},
        "landcover": {"file": "landcover.u8.gz", "classes": {"0": "none", "1": "forest", "2": "water",
                      "3": "building", "4": "road", "5": "urban", "6": "rail", "7": "stream"}, "classMask": 7, "riverCrossingBit": 32, "railCrossingBit": 64, "oobBit": 128},
        "texture": {"tiles": tiles, "tile": tile},
        "overview": "overview.jpg",
        "A": {"xy": loc(a), "latlon": [round(a_lat, 6), round(a_lon, 6)],
              "note": f"on official D11 (southbound carriageway) {A_DIST_ALONG / 1000:.1f} km south of B"},
        "B": {"xy": loc(b), "latlon": [round(b_lat, 6), round(b_lon, 6)],
              "note": "northern end of D11 at the Polish border (OSM ref changes D11 -> S3)"},
        "official": {"xy": [loc(pts[i]) for i in keep], "lengthM": round(float(cum[-1]), 1),
                     "kinds": [int(max(kinds[keep[j - 1]:keep[j]] or [0])) for j in range(1, len(keep))]},
        "attribution": ["© ČÚZK, DMR 5G, CC BY 4.0", "© OpenStreetMap contributors, ODbL"],
        "haveOsm": have_osm,
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False))
    (OUT / "overlays.json").write_text(json.dumps(
        {"buildings": buildings, "places": places, "roads": roads}, ensure_ascii=False, separators=(",", ":")))
    tot = sum(p.stat().st_size for p in OUT.iterdir())
    log(f"pack written to {OUT}: {tot / 1e6:.1f} MB; A={meta['A']} B={meta['B']}; "
        f"{len(buildings)} buildings, {len(places)} places")


if __name__ == "__main__":
    main()
