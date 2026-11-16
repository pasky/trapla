"""Add the traffic census to an existing pack: `traffic.json`, the ŘSD CSD 2025 sections of its area.

Usage (from repo root; stdlib only):
    uv run --with requests python pipeline/fetch_census.py      # once: pipeline/cache/csd/sections-<id>.json
    uv run python pipeline/build_traffic.py [scenario-id ...]   # default: every scenario with a built pack

The game pre-fills a rebuilt road's traffic from the nearest counted section of the same road number
(research/40, research/41). The sidecar is additive: meta.json is not touched (D11's bytes stay frozen),
the game looks for `traffic.json` itself and falls back to a labelled class estimate without it.
A complete (requireComplete) pack is only touched when it is one verified generation; its ready marker
is removed before the write and its manifest and marker are rewritten last, like build_transport.py.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import generation

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache"
FILE = "traffic.json"
SOURCE = "ŘSD, Celostátní sčítání dopravy 2025 (Geoportal, ScitaniDopravy/MapServer/3)"
# Line simplification, m: far below the matching distance, keeps the sidecar small.
TOLERANCE = 1.0


def simplify(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Douglas-Peucker, iterative."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = points[a], points[b]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)
        worst, at = 0.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs((px - ax) * dy - (py - ay) * dx) / length if length else math.hypot(px - ax, py - ay)
            if d > worst:
                worst, at = d, i
        if worst > TOLERANCE:
            keep[at] = True
            stack += [(a, at), (at, b)]
    return [p for p, k in zip(points, keep) if k]


def sections(scenario: dict) -> list[dict]:
    """Census sections in the pack's local metres (EPSG:5514 minus the play area's south-west corner)."""
    source = CACHE / "csd" / f"sections-{scenario['id']}.json"
    if not source.exists():
        raise FileNotFoundError(f"{source} is missing: run pipeline/fetch_census.py first")
    x0, y0 = scenario["bbox5514"][:2]
    out = []
    for row in json.loads(source.read_text()):
        lines = []
        for part in row["lines"]:
            local = simplify([(x - x0, y - y0) for x, y in part])
            if len(local) > 1:
                lines.append([round(v, 1) for p in local for v in p])
        if not lines or not row["road"]:
            continue
        # vehicles 0 = the section was not counted (never "no traffic"); heavy = heavy vehicles a day (TV)
        out.append({"id": row["id"], "road": row["road"], "vehicles": int(row["rpdi"] or 0),
                    "heavy": int(row["heavy"] or 0), "lines": lines})
    return out


def build(scenario: dict, out: Path) -> dict:
    data = {"version": 1, "source": SOURCE, "year": 2025, "sections": sections(scenario)}
    (out / FILE).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    return data


def publish(sid: str) -> None:
    scenario = json.loads((ROOT / "pipeline" / "scenarios" / f"{sid}.json").read_text())
    out = ROOT / "public" / "scenarios" / scenario["id"]
    meta = json.loads((out / "meta.json").read_text())
    if [float(v) for v in meta["origin"]] != [float(v) for v in scenario["bbox5514"][:2]]:
        raise ValueError(f"{sid}: pack origin {meta['origin']} differs from the scenario's play area")
    with generation.lock(out):
        complete = scenario.get("requireComplete", False)
        if complete:
            recorded = json.loads((out / "manifest.json").read_text()).get("inputs", {})
            inputs = {name: hashlib.sha256((CACHE / name).read_bytes()).hexdigest() if (CACHE / name).exists() else None
                      for name in recorded}
            manifest = generation.verify(out, scenario, inputs)
            (out / "ready.json").unlink()
        data = build(scenario, out)
        if complete:
            generation.publish(out, scenario, manifest["inputs"])
    counted = sum(s["vehicles"] > 0 for s in data["sections"])
    print(f"{sid}: {len(data['sections'])} census sections ({counted} counted) -> {out / FILE}, "
          f"{(out / FILE).stat().st_size / 1e3:.0f} kB")


def main() -> None:
    ids = [a for a in sys.argv[1:] if not a.startswith("-")] or sorted(
        p.stem for p in (ROOT / "pipeline" / "scenarios").glob("*.json")
        if (ROOT / "public" / "scenarios" / p.stem / "meta.json").exists())
    for sid in ids:
        publish(sid)


if __name__ == "__main__":
    main()
