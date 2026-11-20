"""How large the protection zones NPÚ has declared round monuments are, by the monument's kind (research/102 "Round 5"):
the basis of the twists' setting rings (src/core/data/twists.ts SETTING_RING). Stdlib only.

Run: uv run python pipeline/heritage_zone_sizes.py [--fetch]
  --fetch: every protection zone in force (pchu/FeatureServer/0, typochranykod OP) from NPÚ's geoportal into
           pipeline/cache/heritage/raw-national-op.json (EPSG:5514, simplified by the service to 5 m), else the cached one.
A zone's size is its equivalent radius √(area / π); its kind is the first kind word of its name (build_heritage.kind_of)
after the legal opening ("Ochranné pásmo …"), else "other" (towns, villages, sets of monuments).
"""
from __future__ import annotations

import json
import math
import re
import statistics
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from build_heritage import CACHE, kind_of

URL = "https://geoportal.npu.cz/arcgis/rest/services/Hosted/pchu/FeatureServer/0/query"
FILE = CACHE / "heritage" / "raw-national-op.json"


def fetch() -> None:
    out, offset = [], 0
    while True:
        params = {"where": "typochranykod='OP'", "outFields": "nazev,rejstrikovecislouskp,priznakplatny,verejny", "returnGeometry": "true",
                  "outSR": 5514, "maxAllowableOffset": 5, "geometryPrecision": 0, "resultOffset": offset, "resultRecordCount": 1000,
                  "orderByFields": "objectid", "f": "json"}
        req = urllib.request.Request(f"{URL}?{urllib.parse.urlencode(params)}", headers={"User-Agent": "trapla-heritage"})
        data = json.loads(urllib.request.urlopen(req, timeout=300).read())
        if "error" in data or "features" not in data:
            raise RuntimeError(f"service error: {str(data)[:300]}")
        out += data["features"]
        if len(data["features"]) < 1000 and not data.get("exceededTransferLimit"):
            break
        offset += len(data["features"])
    FILE.write_text(json.dumps({"features": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(out)} protection zones -> {FILE}")


def area(rings: list) -> float:
    return abs(sum(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r))) / 2 for r in rings))


def main() -> None:
    if "--fetch" in sys.argv or not FILE.exists():
        fetch()
    # (one zone in several features: its parts summed, by ÚSKP number)
    zones: dict[str, list] = {}
    for f in json.loads(FILE.read_text())["features"]:
        a = f["attributes"]
        if a.get("priznakplatny") != "P":
            continue
        z = zones.setdefault(str(a.get("rejstrikovecislouskp")), [a.get("nazev") or "", 0.0])
        z[0] = z[0] or a.get("nazev") or ""
        z[1] += area(f.get("geometry", {}).get("rings", []))
    by: dict[str, list[float]] = {}
    for name, a in zones.values():
        subject = re.sub(r"(?i)^.*?ochrann\w* (památkov\w* )?pásm\w*\s*", "", name)
        by.setdefault(kind_of(subject) or "other", []).append(math.sqrt(a / math.pi))
    print(f"{len(zones)} protection zones in force\nkind        zones  p25  median  p75   max   (equivalent radius, m)")
    for kind, rs in sorted(by.items()):
        rs.sort()
        q = lambda p: rs[min(len(rs) - 1, int(p * len(rs)))]
        print(f"{kind:10} {len(rs):6} {q(.25):5.0f} {statistics.median(rs):6.0f} {q(.75):5.0f} {rs[-1]:6.0f}")


if __name__ == "__main__":
    main()
