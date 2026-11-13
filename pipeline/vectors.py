"""Vector render data for the scenario pack: land-cover polygons (triangulated), existing roads /
railways / waterways (polylines) and building footprints (rings + roof triangles + height).

The browser rasterises these on the GPU into anti-aliased land-cover textures at whatever resolution
the camera needs and extrudes the buildings, so nothing here is baked at the 5 m grid.

Stand-alone (uses the Overpass cache of build_d11.py, writes only vector.bin.gz):
    uv run --with numpy --with tifffile --with pyproj --with pillow --with shapely --with mapbox-earcut \
        python pipeline/vectors.py

File format (vector.bin.gz, little endian): b"TRVX", u32 version, u32 json length, JSON header padded
to 4 bytes, then the payload. The header lists typed arrays as {"type", "offset", "length"} (offset in
bytes from the payload start, length in elements). Coordinates are local metres (x east, y north), the
same frame as overlays.json and the game.
"""

from __future__ import annotations

import gzip
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np

VERSION = 1
CHUNK = 2500.0  # metres; polygons are split into chunks of this size for culling
MARGIN = 30.0  # keep geometry this far outside the play rectangle


def log(*a):
    print(*a, file=sys.stderr, flush=True)


class Payload:
    def __init__(self):
        self.parts: list[bytes] = []
        self.size = 0

    def add(self, arr: np.ndarray, typ: str) -> dict:
        dt = {"f32": "<f4", "u32": "<u4", "u16": "<u2", "u8": "u1"}[typ]
        b = np.ascontiguousarray(arr, dtype=dt).tobytes()
        ref = {"type": typ, "offset": self.size, "length": int(arr.size)}
        pad = (-len(b)) % 4
        self.parts.append(b + b"\0" * pad)
        self.size += len(b) + pad
        return ref


def chaikin(xy: np.ndarray, iters: int = 2) -> np.ndarray:
    """Corner-cutting smoothing that keeps the end points (waterways and rails are mapped coarsely)."""
    for _ in range(iters):
        if len(xy) < 3:
            return xy
        a, b = xy[:-1], xy[1:]
        q = 0.75 * a + 0.25 * b
        r = 0.25 * a + 0.75 * b
        out = np.empty((2 * len(a) + 2, 2), dtype=xy.dtype)
        out[0] = xy[0]
        out[1:-1:2] = q
        out[2:-1:2] = r
        out[-1] = xy[-1]
        xy = out
    return xy


def thin(xy: np.ndarray, min_d: float = 0.4) -> np.ndarray:
    """Drop points closer than min_d to the previous kept one (degenerate segments break the joins)."""
    if len(xy) < 2:
        return xy
    keep = [0]
    for i in range(1, len(xy)):
        if math.hypot(xy[i, 0] - xy[keep[-1], 0], xy[i, 1] - xy[keep[-1], 1]) >= min_d or i == len(xy) - 1:
            keep.append(i)
    out = xy[keep]
    if len(out) >= 2 and math.hypot(*(out[-1] - out[-2])) < 1e-3:
        out = out[:-1]
    return out


def polygons_of(el, rings_of):
    """shapely geometry of a closed way / multipolygon relation in local coordinates (or None)."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    outers, inners = rings_of(el)
    ps = [Polygon(r).buffer(0) for r in outers if len(r) >= 4]
    ps = [p for p in ps if not p.is_empty]
    if not ps:
        return None
    g = unary_union(ps)
    hs = [Polygon(r).buffer(0) for r in inners if len(r) >= 4]
    hs = [h for h in hs if not h.is_empty]
    if hs:
        g = g.difference(unary_union(hs))
    return None if g.is_empty else g


def triangulate(geom):
    """earcut all polygons of a (multi)polygon → (verts [n,2] float64, tris [m,3] uint32)."""
    import mapbox_earcut as earcut

    polys = [geom] if geom.geom_type == "Polygon" else [g for g in getattr(geom, "geoms", []) if g.geom_type == "Polygon"]
    vs, ts, base = [], [], 0
    for p in polys:
        rings = [np.asarray(p.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in p.interiors]
        rings = [r for r in rings if len(r) >= 3]
        if not rings:
            continue
        v = np.concatenate(rings).astype(np.float64)
        ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
        t = earcut.triangulate_float64(v, ends).reshape(-1, 3)
        if len(t) == 0:
            continue
        vs.append(v)
        ts.append(t.astype(np.uint32) + base)
        base += len(v)
    if not vs:
        return np.zeros((0, 2)), np.zeros((0, 3), np.uint32)
    return np.concatenate(vs), np.concatenate(ts)


def chunked(verts: np.ndarray, tris: np.ndarray, width: float, height: float):
    """Split triangles by centroid into CHUNK-sized grid cells; returns (verts, idx, chunk table)."""
    ncx = max(1, math.ceil(width / CHUNK))
    ncy = max(1, math.ceil(height / CHUNK))
    cen = verts[tris].mean(axis=1)
    cx = np.clip((cen[:, 0] // CHUNK).astype(np.int64), 0, ncx - 1)
    cy = np.clip((cen[:, 1] // CHUNK).astype(np.int64), 0, ncy - 1)
    key = cy * ncx + cx
    out_v, out_i, table = [], [], []
    v_off = i_off = 0
    for k in np.unique(key):
        t = tris[key == k]
        used, inv = np.unique(t.ravel(), return_inverse=True)
        out_v.append(verts[used])
        out_i.append(inv.astype(np.uint32))
        table.append([v_off, int(len(used)), i_off, int(inv.size)])
        v_off += len(used)
        i_off += inv.size
    if not out_v:
        return np.zeros((0, 2)), np.zeros(0, np.uint32), []
    return np.concatenate(out_v), np.concatenate(out_i), table


# OSM tag -> polygon layer (draw order is decided by the renderer's style table)
URBAN = ("residential", "industrial", "commercial", "retail", "farmyard")
GRASS_LANDUSE = ("meadow", "grass", "village_green", "recreation_ground", "cemetery", "allotments", "orchard")
GRASS_LEISURE = ("park", "garden", "pitch", "golf_course", "playground")
GRASS_NATURAL = ("grassland", "heath", "scrub")


def poly_layer(tags: dict) -> str | None:
    lu, nat, lei = tags.get("landuse"), tags.get("natural"), tags.get("leisure")
    if nat == "water" or tags.get("waterway") == "riverbank" or lu in ("reservoir", "basin"):
        return "water"
    if lu == "forest" or nat == "wood":
        return "forest"
    if lu in URBAN:
        return "urban"
    if lu == "farmland":
        return "farmland"
    if lu in GRASS_LANDUSE or lei in GRASS_LEISURE or nat in GRASS_NATURAL:
        return "grass"
    return None


ROAD_LAYER = {
    "motorway": "motorway", "trunk": "motorway", "motorway_link": "primary", "trunk_link": "primary",
    "primary": "primary", "primary_link": "secondary", "secondary": "secondary", "secondary_link": "tertiary",
    "tertiary": "tertiary", "tertiary_link": "minor", "unclassified": "minor", "residential": "minor",
    "living_street": "minor", "service": "service", "track": "track",
}


def line_layer(tags: dict) -> str | None:
    if tags.get("tunnel") in ("yes", "culvert") and "waterway" not in tags:
        return None  # road / rail tunnels are not visible on the surface
    ww = tags.get("waterway")
    if ww == "river":
        return "river"
    if ww in ("stream", "canal", "ditch", "drain"):
        return "stream"
    if tags.get("railway") == "rail":
        return "rail_side" if tags.get("service") in ("yard", "spur", "siding", "crossover") else "rail"
    return ROAD_LAYER.get(tags.get("highway", ""))


def building_height(tags: dict, area: float) -> float:
    def num(s):
        try:
            return float(str(s).replace(",", ".").split()[0])
        except (ValueError, IndexError):
            return None

    h = num(tags.get("height")) if "height" in tags else None
    if h and 2 <= h <= 120:
        return h
    lv = num(tags.get("building:levels")) if "building:levels" in tags else None
    if lv and 0 < lv <= 30:
        return 3.0 * lv + 1.5
    b = tags.get("building", "yes")
    if b in ("garage", "garages", "shed", "outbuilding", "roof", "carport", "hut", "transformer_tower", "bunker", "farm_auxiliary", "greenhouse"):
        return 3.0
    if b in ("apartments", "hotel", "dormitory"):
        return 14.0
    if b in ("church", "cathedral"):
        return 16.0
    if b in ("industrial", "warehouse", "retail", "commercial", "school", "civic", "hospital", "barn"):
        return 8.5
    if b in ("house", "detached", "residential", "semidetached_house", "terrace"):
        return 6.5
    return 3.0 if area < 45 else 6.5 if area < 500 else 8.5


def build(out_dir: Path, osm, way_xy, rings_of, width: float, height: float, extra_polys=None, extra_lines=None) -> dict:
    """Write vector.bin.gz. `osm(name)` returns a cached Overpass result ("cover", "lines", "buildings");
    `extra_*` are optional lists of further Overpass element lists."""
    import mapbox_earcut as earcut
    from shapely.geometry import LineString, Polygon, box
    from shapely.ops import unary_union

    clip = box(-MARGIN, -MARGIN, width + MARGIN, height + MARGIN)
    pay = Payload()
    header: dict = {"version": VERSION, "chunk": CHUNK, "polys": [], "lines": []}

    # ---- land-cover polygons: dissolved per layer, clipped, triangulated ----
    geoms: dict[str, list] = {}
    elements = list(osm("cover")["elements"])
    for more in extra_polys or []:
        elements += more
    for el in elements:
        name = poly_layer(el.get("tags", {}))
        if not name:
            continue
        g = polygons_of(el, rings_of)
        if g is not None:
            geoms.setdefault(name, []).append(g)
    for name, gs in geoms.items():
        u = unary_union(gs).intersection(clip).simplify(0.25)
        v, t = triangulate(u)
        v, i, table = chunked(v, t, width, height)
        header["polys"].append({"name": name, "verts": pay.add(v, "f32"), "idx": pay.add(i, "u32"), "chunks": table})
        log(f"  polys {name}: {len(gs)} features, {len(v)} verts, {len(i) // 3} tris, {len(table)} chunks")

    # ---- lines ----
    lines: dict[str, list[np.ndarray]] = {}
    elements = list(osm("lines")["elements"])
    for more in extra_lines or []:
        elements += more
    for el in elements:
        name = line_layer(el.get("tags", {}))
        xy = way_xy(el)
        if not name or len(xy) < 2:
            continue
        g = LineString(xy).intersection(clip)
        parts = [g] if g.geom_type == "LineString" else [p for p in getattr(g, "geoms", []) if p.geom_type == "LineString"]
        for p in parts:
            a = np.asarray(p.coords, dtype=np.float64)
            if name in ("river", "stream", "rail", "rail_side"):
                a = chaikin(a)
            a = thin(a)
            if len(a) >= 2:
                lines.setdefault(name, []).append(a)
    for name, ls in lines.items():
        starts = np.concatenate([[0], np.cumsum([len(a) for a in ls])])
        header["lines"].append({"name": name, "verts": pay.add(np.concatenate(ls), "f32"), "starts": pay.add(starts, "u32")})
        log(f"  lines {name}: {len(ls)} polylines, {int(starts[-1])} verts")

    # ---- buildings: counter-clockwise ring (no closing point), roof triangles, height ----
    bv, bs, bt, bts, bh = [], [0], [], [0], []
    for el in osm("buildings")["elements"]:
        xy = way_xy(el)
        if len(xy) < 4:
            continue
        ring = thin(xy[:-1] if np.allclose(xy[0], xy[-1]) else xy, 0.05)
        if len(ring) < 3 or len(ring) > 60000:
            continue
        p = Polygon(ring)
        if not p.is_valid or p.area < 4 or not clip.contains(p.centroid):
            continue
        if not p.exterior.is_ccw:
            ring = ring[::-1]
        t = earcut.triangulate_float64(np.ascontiguousarray(ring), np.array([len(ring)], dtype=np.uint32))
        if len(t) < 3:
            continue
        bv.append(ring)
        bs.append(bs[-1] + len(ring))
        bt.append(t.astype(np.uint16))
        bts.append(bts[-1] + len(t))
        bh.append(min(255, round(building_height(el.get("tags", {}), p.area) * 2)))
    header["buildings"] = {
        "count": len(bh), "heightScale": 0.5,
        "verts": pay.add(np.concatenate(bv), "f32"), "starts": pay.add(np.array(bs), "u32"),
        "tris": pay.add(np.concatenate(bt), "u16"), "triStarts": pay.add(np.array(bts), "u32"),
        "heights": pay.add(np.array(bh), "u8"),
    }
    log(f"  buildings: {len(bh)}, {bs[-1]} verts, {bts[-1] // 3} roof tris")

    hj = json.dumps(header, separators=(",", ":")).encode()
    hj += b" " * ((-len(hj)) % 4)
    raw = b"TRVX" + struct.pack("<II", VERSION, len(hj)) + hj + b"".join(pay.parts)
    f = out_dir / "vector.bin.gz"
    f.write_bytes(gzip.compress(raw, 9))
    log(f"  vector.bin.gz: {len(raw) / 1e6:.1f} MB raw, {f.stat().st_size / 1e6:.2f} MB gzip")
    return {"file": "vector.bin.gz", "version": VERSION}


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_d11 as b

    b.OUT.mkdir(parents=True, exist_ok=True)
    b.build_vectors()
