"""Add the streams' and rivers' names to an existing pack: `water-names.json` (stdlib only).

Usage (from repo root):
    uv run python pipeline/build_water_names.py [scenario-id ...]   # default: every built pack

The pack's watercourses (`watercourses.json.gz`, hydrology.py) keep each reach's OSM way id but not its name; the
names are in the same OSM snapshot the reaches were built from (pipeline/cache/osm_<id>_watercourses_v1.json, the
legacy D11 pack's without the id). This sidecar maps the reach ids of the pack to their `name` tags, for the printed
bridge card's plan (src/ui/bridge-print.ts). A pack whose snapshot is not cached gets none (no names printed).
Additive like structures.json; a complete (requireComplete) pack's manifest and ready marker are rewritten last.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import sys
from pathlib import Path

import generation

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache"
FILE = "water-names.json"


def snapshot(sid: str) -> Path | None:
    for name in (f"osm_{sid}_watercourses_v1.json", "osm_watercourses_v1.json" if sid == "d11" else None):
        if name and (CACHE / name).exists():
            return CACHE / name
    return None


def names(out: Path, source: Path) -> dict:
    reaches = json.loads(gzip.decompress((out / "watercourses.json.gz").read_bytes()))["reaches"]
    data = json.loads(source.read_text())
    elements = data["elements"] if isinstance(data, dict) else data
    tagged = {el["id"]: el["tags"]["name"] for el in elements
              if el.get("type") == "way" and el.get("tags", {}).get("name")}
    ids = {r["id"] for r in reaches}
    return {"version": 1, "names": {str(i): tagged[i] for i in sorted(ids) if i in tagged}}


def publish(sid: str) -> None:
    scenario = json.loads((ROOT / "pipeline" / "scenarios" / f"{sid}.json").read_text())
    out = ROOT / "public" / "scenarios" / scenario["id"]
    source = snapshot(sid)
    if source is None or not (out / "watercourses.json.gz").exists():
        print(f"{sid}: no cached watercourse snapshot, no names")
        return
    with generation.lock(out):
        complete = scenario.get("requireComplete", False)
        if complete:
            recorded = json.loads((out / "manifest.json").read_text()).get("inputs", {})
            inputs = {name: hashlib.sha256((CACHE / name).read_bytes()).hexdigest() if (CACHE / name).exists() else None
                      for name in recorded}
            manifest = generation.verify(out, scenario, inputs)
            (out / "ready.json").unlink()
        data = names(out, source)
        (out / FILE).write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
        if complete:
            generation.publish(out, scenario, manifest["inputs"])
    print(f"{sid}: {len(data['names'])} named reaches -> {out / FILE}")


def main() -> None:
    ids = [a for a in sys.argv[1:] if not a.startswith("-")] or sorted(
        p.stem for p in (ROOT / "pipeline" / "scenarios").glob("*.json")
        if (ROOT / "public" / "scenarios" / p.stem / "meta.json").exists())
    for sid in ids:
        try:
            publish(sid)
        except RuntimeError as error:
            print(f"{sid}: {error}")


if __name__ == "__main__":
    main()
