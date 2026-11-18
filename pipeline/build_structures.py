"""Add the mapped road bridges and tunnels to an existing pack: `structures.json` (stdlib only).

Usage (from repo root):
    uv run python pipeline/build_structures.py [scenario-id ...]   # default: every scenario with a built pack

The crossing network (`overlays.json` `net`, build_pack.py road_network) leaves out every way tagged bridge,
tunnel or covered, so a road of ours crossing one met a 30–100 m gap in that road: no crossing, nothing built
or billed, the road drawn flat across our works. This sidecar carries those ways, from the pack's own
transport graph (`transport.json.gz`, the same OSM snapshot as the net: its sources without a legacy net way),
in the net's format (class index, then x0, y0, x1, y1, … in local metres, simplified to 1 m and rounded to
metres like the net, so they meet the ways either side at the same points). The game adds them after the net's
ways (src/core/roadnet.ts) and works out each one's level from the ground at its ends (src/core/mapped-
structures.ts). It is additive like protected.json: overlays.json and its object-data identity are not touched;
a complete (requireComplete) pack's manifest and ready marker are rewritten last.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import sys
from pathlib import Path

import generation

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache"
FILE = "structures.json"
# build_pack.py NET_CLASSES (the order of the net's class list)
NET_CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
               "living_street", "service", "track"]
TOLERANCE = 1.0


def simplify(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Douglas-Peucker on an open polyline (both ends kept), iterative; shapely's simplify(1.0) as in road_network."""
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


def structures(out: Path, meta: dict) -> dict:
    graph = json.loads(gzip.decompress((out / "transport.json.gz").read_bytes()))
    w, h = meta["nx"] * meta["cell"], meta["ny"] * meta["cell"]
    ways, kinds, osm = [], [], []
    for s in graph["sources"]:
        if s["kind"] != "road" or "legacyNetIndex" in s or s.get("elevation") == "terrain":
            continue
        hw = s["tags"].get("highway", "").replace("_link", "")
        if hw not in NET_CLASSES:
            continue
        xy = s["xy"]
        points = [(xy[i], xy[i + 1]) for i in range(0, len(xy), 2)]
        xs, ys = [p[0] for p in points], [p[1] for p in points]
        if len(points) < 2 or max(xs) < 0 or min(xs) > w or max(ys) < 0 or min(ys) > h:
            continue
        line = [int(round(v)) for p in simplify(points) for v in p]
        if len(line) < 4 or (len(line) == 4 and line[:2] == line[2:]):
            continue
        kind = "bridge" if s.get("bridge") else "tunnel" if s.get("tunnel") else "covered"
        ways.append([NET_CLASSES.index(hw)] + line)
        kinds.append(kind)
        osm.append(s["osmWayId"])
    fingerprint = json.loads((out / "transport-meta.json").read_text())["fingerprint"]
    return {"version": 1, "transport": fingerprint, "cls": NET_CLASSES, "ways": ways, "kind": kinds, "osm": osm}


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
            (out / "ready.json").unlink()
        data = structures(out, meta)
        (out / FILE).write_text(json.dumps(data, separators=(",", ":")))
        if complete:
            generation.publish(out, scenario, manifest["inputs"])
    count = {k: data["kind"].count(k) for k in sorted(set(data["kind"]))}
    print(f"{sid}: {len(data['ways'])} mapped road structures {count} -> {out / FILE}, {(out / FILE).stat().st_size / 1e3:.0f} kB")


def main() -> None:
    ids = [a for a in sys.argv[1:] if not a.startswith("-")] or sorted(
        p.stem for p in (ROOT / "pipeline" / "scenarios").glob("*.json")
        if (ROOT / "public" / "scenarios" / p.stem / "meta.json").exists())
    for sid in ids:
        publish(sid)


if __name__ == "__main__":
    main()
