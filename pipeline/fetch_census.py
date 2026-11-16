#!/usr/bin/env python3
"""Fetch ŘSD CSD 2025 census sections for Trapla scenario bounds (EPSG:5514).

Run: uv run --with requests pipeline/fetch_census.py
Raw ArcGIS responses and normalized JSON are cached in pipeline/cache/csd/.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import requests

BASE = "https://geoportal.rsd.cz/arcgis/rest/services/ScitaniDopravy/MapServer/3/query"
HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache" / "csd"
# Every scenario's play area (EPSG:5514), keyed by scenario id; the request adds 1 km on all four sides.
AREAS = {json.loads(p.read_text())["id"]: tuple(json.loads(p.read_text())["bbox5514"])
         for p in sorted((HERE / "scenarios").glob("*.json"))}
# PKOD_TR_K, the layer's basic road class code
CLASSES = {"1": "motorway", "2": "I", "3": "II", "4": "III"}


def road_number(value: object) -> str:
    """Normalize road labels (I/14, silnice 14) to the OSM ref form. Leading zeros are part of a class III
    number (III/00315 branches off I/3; it is not II/315) and are kept, as OSM keeps them."""
    text = str(value or "").strip().upper()
    text = re.sub(r"^(?:DÁLNICE|SILNICE)\s*", "", text)
    text = re.sub(r"^[A-Z]+\s*/\s*", "", text)
    return re.sub(r"\s+", " ", text).strip()


def fetch(name: str, bounds: tuple[int, int, int, int]) -> None:
    xmin, ymin, xmax, ymax = bounds
    bbox = (xmin - 1000, ymin - 1000, xmax + 1000, ymax + 1000)
    params = {
        "f": "json", "where": "1=1", "geometry": ",".join(map(str, bbox)),
        "geometryType": "esriGeometryEnvelope", "inSR": 5514,
        "spatialRel": "esriSpatialRelIntersects", "outFields": "*",
        "returnGeometry": "true", "outSR": 5514, "resultRecordCount": 2000,
    }
    response = requests.get(BASE, params=params, timeout=120)
    response.raise_for_status()
    raw = response.json()
    # ArcGIS reports errors with HTTP 200: never overwrite a good dataset with an empty one
    if "error" in raw or "features" not in raw:
        raise RuntimeError(f"{name}: census service error: {raw.get('error')}")
    (CACHE / f"raw-{name}.json").write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    features = raw.get("features", [])
    if raw.get("exceededTransferLimit"):
        raise RuntimeError(f"{name}: ArcGIS result exceeded record limit; partition bbox before using")
    rows = []
    for feature in features:
        a = feature["attributes"]
        paths = feature.get("geometry", {}).get("paths", [])
        if not paths:
            continue
        rows.append({
            "id": str(a.get("CIS_SU", "")),
            "road": road_number(a.get("PSILNICE")),
            "class": CLASSES.get(str(a.get("PKOD_TR_K")), ""),
            "rpdi": a.get("SV"),
            "heavy": a.get("TV"),
            "year": 2025,
            # every part of a multi-part section (OSM matching takes the nearest of them)
            "lines": paths,
        })
    rows.sort(key=lambda row: (row["road"], row["id"]))
    (CACHE / f"sections-{name}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{name}: {len(rows)} sections -> pipeline/cache/csd/sections-{name}.json")


def national() -> None:
    """Share of heavy vehicles by road class over every counted section of the country (sum TV / sum SV):
    the class estimate for roads the census did not count (research/41)."""
    rows, offset = [], 0
    while True:
        response = requests.get(BASE, params={
            "f": "json", "where": "1=1", "outFields": "CIS_SU,SV,TV,DELKA_SU,PKOD_TR_K", "returnGeometry": "false",
            "orderByFields": "OBJECTID", "resultOffset": offset, "resultRecordCount": 2000}, timeout=120)
        response.raise_for_status()
        raw = response.json()
        if "error" in raw or "features" not in raw:
            raise RuntimeError(f"national: census service error: {raw.get('error')}")
        rows += [f["attributes"] for f in raw["features"]]
        offset += len(raw["features"])
        if not raw.get("exceededTransferLimit") or not raw["features"]:
            break
    summary = {}
    for code, name in CLASSES.items():
        counted = [a for a in rows if a["PKOD_TR_K"] == code and (a["SV"] or 0) > 0]
        total = sum(a["SV"] for a in counted)
        summary[name] = {"sections": sum(a["PKOD_TR_K"] == code for a in rows), "counted": len(counted),
                         "countedKm": round(sum(a["DELKA_SU"] or 0 for a in counted) / 1000),
                         "heavyShare": round(sum(a["TV"] or 0 for a in counted) / total, 4) if total else None}
    (CACHE / "national-classes.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"national: {len(rows)} sections -> pipeline/cache/csd/national-classes.json {summary}")


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for name, bounds in AREAS.items():
        fetch(name, bounds)
        time.sleep(0.2)
    national()


if __name__ == "__main__":
    main()
