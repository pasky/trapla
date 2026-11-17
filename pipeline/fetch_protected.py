#!/usr/bin/env python3
"""Fetch the nature protection areas of every scenario's play area from AOPK ČR open data (EPSG:5514).

Run: uv run python pipeline/fetch_protected.py [scenario-id ...]   (stdlib only; default: every scenario)
Writes pipeline/cache/protected/raw-<id>-L<layer>.json (the ArcGIS responses, polygons simplified by the
service to 1 m). pipeline/build_protected.py turns them into each pack's `protected.json`.

Layers of https://gis.nature.cz/arcgis/rest/services/Aplikace/Opendata/MapServer (licence CC BY 4.0,
"© AOPK ČR"):
  0 large protected areas (CHKO, NP) and a national park's protection zone (KAT "OP")
  1 their zones (CHKO I–IV, NP A–D)
  2 small protected areas (NPR, PR, NPP, PP)
  3 protection zones of the small ones (OP_TYP "ZAK" = the statutory 50 m, "VYH" = declared)
  6 Natura 2000 sites of community importance (EVL)
  7 Natura 2000 bird areas (PO)
research/75 has what each one forbids (zákon 114/1992 Sb.).
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

SERVICE = "https://gis.nature.cz/arcgis/rest/services/Aplikace/Opendata/MapServer"
LAYERS = (0, 1, 2, 3, 6, 7)
HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache" / "protected"
MAX_BYTES = 40_000_000


def query(layer: int, bbox: tuple[float, float, float, float]) -> dict:
    params = {
        "where": "1=1", "geometry": ",".join(str(int(v)) for v in bbox), "geometryType": "esriGeometryEnvelope",
        "inSR": 5514, "spatialRel": "esriSpatialRelIntersects", "outFields": "*", "returnGeometry": "true",
        "outSR": 5514, "maxAllowableOffset": 1, "geometryPrecision": 1, "f": "json",
    }
    with urllib.request.urlopen(f"{SERVICE}/{layer}/query?{urllib.parse.urlencode(params)}", timeout=300) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError(f"layer {layer}: unexpectedly large response; inspect the service before retrying")
    data = json.loads(raw)
    # ArcGIS reports errors with HTTP 200: never overwrite a good cache with an empty or partial one
    if "error" in data or "features" not in data:
        raise RuntimeError(f"layer {layer}: service error: {str(data)[:300]}")
    if data.get("exceededTransferLimit"):
        raise RuntimeError(f"layer {layer}: result exceeded the record limit; split the area before using it")
    return data


def fetch(sid: str) -> None:
    scenario = json.loads((HERE / "scenarios" / f"{sid}.json").read_text())
    bbox = tuple(scenario["bbox5514"])
    CACHE.mkdir(parents=True, exist_ok=True)
    for layer in LAYERS:
        data = query(layer, bbox)
        path = CACHE / f"raw-{sid}-L{layer}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        names = sorted({f["attributes"].get("NAZEV", "") for f in data["features"]})
        print(f"{sid} L{layer}: {len(data['features'])} features {names[:6]}{' …' if len(names) > 6 else ''}")


def main() -> None:
    ids = [a for a in sys.argv[1:] if not a.startswith("-")] or sorted(p.stem for p in (HERE / "scenarios").glob("*.json"))
    for sid in ids:
        fetch(sid)


if __name__ == "__main__":
    main()
