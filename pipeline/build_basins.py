"""Add the sea each place drains to to an existing pack: `basins.json` (research/100).

Usage (from repo root):
    uv run --with pyshp --with shapely python pipeline/build_basins.py [scenario-id ...]   # default: every built pack

The official 1st-order river basins of Czechia (VÚV TGM, DIBAVOD A10 "hydrologické členění – povodí I. řádu":
Labe → North Sea, Odra → Baltic, Morava / Dunaj → Black Sea; S-JTSK), clipped to the pack's extent with a margin,
in local metres, simplified to 5 m. Where one basin covers the whole pack, the file says only that (no rings): the
game then knows that nothing on this map crosses the main European watershed. Additive like structures.json; a
complete (requireComplete) pack's manifest and ready marker are rewritten last. Poland is not in DIBAVOD: a point
outside every basin drains "somewhere not mapped", and the game says nothing there.
"""
from __future__ import annotations

import hashlib
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

import generation

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache"
SOURCE = "https://www.dibavod.cz/data/download/dib_A10_Povodi_I.zip"
ZIP = "dib_A10_Povodi_I.zip"
FILE = "basins.json"
# RAD_I: the 1st-order basin (DIBAVOD A10 attribute)
SEAS = {1: ("north", "Elbe"), 2: ("baltic", "Oder"), 4: ("black", "Danube")}
MARGIN, TOLERANCE = 2000.0, 5.0


def source_zip() -> Path:
    path = CACHE / ZIP
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(SOURCE, timeout=120) as r:
            path.write_bytes(r.read())
    return path


def basins(meta: dict) -> dict:
    import shapefile
    from shapely.geometry import box, shape
    with zipfile.ZipFile(source_zip()) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".shp"))[:-4]
        sf = shapefile.Reader(shp=io.BytesIO(z.read(name + ".shp")), shx=io.BytesIO(z.read(name + ".shx")),
                              dbf=io.BytesIO(z.read(name + ".dbf")))
        fields = [f[0] for f in sf.fields[1:]]
        records = [(dict(zip(fields, rec)), shp) for rec, shp in zip(sf.records(), sf.shapes())]
    x0, y0 = meta["origin"]
    w, h = meta["nx"] * meta["cell"], meta["ny"] * meta["cell"]
    extent = box(x0 - MARGIN, y0 - MARGIN, x0 + w + MARGIN, y0 + h + MARGIN)
    out = []
    for rec, shp in records:
        sea = SEAS.get(int(rec["RAD_I"]))
        part = shape(shp.__geo_interface__).intersection(extent)
        if sea is None or part.is_empty:
            continue
        part = part.simplify(TOLERANCE)
        rings = []
        for poly in getattr(part, "geoms", [part]):
            if poly.geom_type != "Polygon":
                continue
            for ring in [poly.exterior, *poly.interiors]:
                rings.append([round(v - o, 1) for x, y in ring.coords for v, o in ((x, x0), (y, y0))])
        out.append({"sea": sea[0], "river": sea[1], "rings": rings})
    covered = len(out) == 1 and next(shape(shp.__geo_interface__) for rec, shp in records
                                     if SEAS.get(int(rec["RAD_I"]), ("",))[0] == out[0]["sea"]).contains(extent)
    if covered:
        out[0]["rings"] = []  # one basin under the whole map (and its margin): nothing on it crosses a divide
    digest = hashlib.sha256(source_zip().read_bytes()).hexdigest()
    # (bound to the pack's extent: a rebuilt pack of another extent ignores a file left from before)
    return {"version": 1, "source": "VÚV TGM, DIBAVOD A10 (povodí I. řádu)", "sha256": digest,
            "origin": meta["origin"], "size": [w, h], "basins": out}


def publish(sid: str) -> None:
    scenario = json.loads((ROOT / "pipeline" / "scenarios" / f"{sid}.json").read_text())
    out = ROOT / "public" / "scenarios" / scenario["id"]
    meta = json.loads((out / "meta.json").read_text())
    with generation.lock(out):
        complete = scenario.get("requireComplete", False)
        if complete:
            recorded = json.loads((out / "manifest.json").read_text()).get("inputs", {})
            inputs = {name: hashlib.sha256((CACHE / name).read_bytes()).hexdigest() if (CACHE / name).exists() else None
                      for name in recorded}
            manifest = generation.verify(out, scenario, inputs)
        data = basins(meta)  # (before the ready marker goes: a failed download leaves the pack playable)
        if complete:
            (out / "ready.json").unlink()
        (out / FILE).write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
        if complete:
            generation.publish(out, scenario, manifest["inputs"])
    print(f"{sid}: {', '.join(b['sea'] for b in data['basins']) or 'no basin'} -> {out / FILE}, {(out / FILE).stat().st_size / 1e3:.0f} kB")


def main() -> None:
    ids = [a for a in sys.argv[1:] if not a.startswith("-")] or sorted(
        p.stem for p in (ROOT / "pipeline" / "scenarios").glob("*.json")
        if (ROOT / "public" / "scenarios" / p.stem / "meta.json").exists())
    for sid in ids:
        publish(sid)


if __name__ == "__main__":
    main()
