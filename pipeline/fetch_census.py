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
# Supplied bounds are EPSG:5514; request adds 1 km on all four sides.
AREAS = {
    "d11": (-637500, -1011500, -620000, -989000),
    "d3": (-746000, -1079000, -733000, -1060000),
    "d35": (-601500, -1097000, -581000, -1090000),
    "nova-paka": (-667500, -1016000, -652500, -1001000),
}
CACHE = Path(__file__).resolve().parent / "cache" / "csd"


def road_number(value: object) -> str:
    """Normalize road labels (I/14, silnice 14) to the OSM ref form."""
    text = str(value or "").strip().upper()
    text = re.sub(r"^(?:DÁLNICE|SILNICE)\s*", "", text)
    text = re.sub(r"^[A-Z]+\s*/\s*", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return str(int(text)) if text.isdigit() else text


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
            "rpdi": a.get("SV"),
            "heavy": a.get("TV"),
            "year": 2025,
            # every part of a multi-part section (OSM matching takes the nearest of them)
            "lines": paths,
        })
    rows.sort(key=lambda row: (row["road"], row["id"]))
    (CACHE / f"sections-{name}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{name}: {len(rows)} sections -> pipeline/cache/csd/sections-{name}.json")


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for name, bounds in AREAS.items():
        fetch(name, bounds)
        time.sleep(0.2)


if __name__ == "__main__":
    main()
