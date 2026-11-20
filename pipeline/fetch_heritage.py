#!/usr/bin/env python3
"""Fetch the listed monuments and heritage areas of every scenario's play area from NPÚ's geoportal (EPSG:5514).

Run: uv run python pipeline/fetch_heritage.py [scenario-id ...]   (stdlib only; default: every scenario)
Writes pipeline/cache/heritage/raw-<id>-<layer>.json (the ArcGIS responses, polygons simplified by the service to
1 m). pipeline/build_heritage.py turns them into each pack's `heritage.json` (research/97).

Services of https://geoportal.npu.cz/arcgis/rest/services/Hosted (Národní památkový ústav, the Central List of
Cultural Monuments, ÚSKP; the same records as NPÚ's open data, CC BY 4.0):
  pchu/FeatureServer/0   heritage areas: protection zones (ochranné pásmo, Act 20/1987 §17), reserves and zones
                         (památková rezervace / zóna, §5 and §6), polygons
  kp/FeatureServer/10    listed monuments (kulturní památka), points
  kp/FeatureServer/11    national monuments (národní kulturní památka), points
and the open data's lists of the areas (https://pamatkovykatalog.cz/opendata/npu_opendata_{OP,PR,PZ}.csv, CC BY 4.0:
their names by ÚSKP number, where the geoportal leaves one out).
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

SERVICE = "https://geoportal.npu.cz/arcgis/rest/services/Hosted"
LAYERS = {"areas": "pchu/FeatureServer/0", "kp": "kp/FeatureServer/10", "nkp": "kp/FeatureServer/11"}
FIELDS = {
    "areas": "nazev,typochranynazev,typochranykod,upresnenitypuochrany,rejstrikovecislouskp,urlext,priznakplatny,verejny,fazeochranykod",
    "kp": "nazevprvku,nazevprstavu,pi_druh,rejstrikovecislouskp,obec,hlavniprvek,fazeochranykod,typochranykod,prstavid",
    "nkp": "nazevprvku,nazevprstavu,pi_druh,rejstrikovecislouskp,obec,hlavniprvek,fazeochranykod,typochranykod,prstavid",
}
HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache" / "heritage"
MAX_BYTES = 60_000_000
PAGE = 2000
LISTS = ("OP", "PR", "PZ")


def query(layer: str, bbox: tuple[float, float, float, float], offset: int) -> dict:
    params = {
        "where": "1=1", "geometry": ",".join(str(int(v)) for v in bbox), "geometryType": "esriGeometryEnvelope",
        "inSR": 5514, "spatialRel": "esriSpatialRelIntersects", "outFields": FIELDS[layer], "returnGeometry": "true",
        "outSR": 5514, "maxAllowableOffset": 1, "geometryPrecision": 1, "resultOffset": offset, "resultRecordCount": PAGE,
        "orderByFields": "objectid", "f": "json",
    }
    url = f"{SERVICE}/{LAYERS[layer]}/query?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "trapla-heritage"}), timeout=300) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError(f"{layer}: unexpectedly large response; inspect the service before retrying")
    data = json.loads(raw)
    # ArcGIS reports errors with HTTP 200: never overwrite a good cache with an empty or partial one
    if "error" in data or "features" not in data:
        raise RuntimeError(f"{layer}: service error: {str(data)[:300]}")
    return data


def fetch(sid: str) -> None:
    scenario = json.loads((HERE / "scenarios" / f"{sid}.json").read_text())
    bbox = tuple(scenario["bbox5514"])
    CACHE.mkdir(parents=True, exist_ok=True)
    for layer in LAYERS:
        features, offset = [], 0
        while True:
            data = query(layer, bbox, offset)
            features += data["features"]
            if not data.get("exceededTransferLimit") and len(data["features"]) < PAGE:
                break
            offset += len(data["features"])
        path = CACHE / f"raw-{sid}-{layer}.json"
        path.write_text(json.dumps({"features": features}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{sid} {layer}: {len(features)} features")


def fetch_lists() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for name in LISTS:
        url = f"https://www.pamatkovykatalog.cz/opendata/npu_opendata_{name}.csv"
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "trapla-heritage"}), timeout=300) as response:
            raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES or not raw.startswith("katalogové_číslo".encode()):
            raise ValueError(f"{name}: not the list it should be; inspect {url}")
        (CACHE / f"npu_opendata_{name}.csv").write_bytes(raw)
        print(f"list {name}: {raw.count(10) - 1} rows")


def main() -> None:
    fetch_lists()
    ids = [a for a in sys.argv[1:] if not a.startswith("-")] or sorted(p.stem for p in (HERE / "scenarios").glob("*.json"))
    for sid in ids:
        fetch(sid)


if __name__ == "__main__":
    main()
