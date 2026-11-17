"""Add the nature protection areas to an existing pack: `protected.json` (stdlib only).

Usage (from repo root):
    uv run python pipeline/fetch_protected.py [scenario-id ...]   # once: pipeline/cache/protected/raw-*.json
    uv run python pipeline/build_protected.py [scenario-id ...]   # default: every scenario with a built pack

Each area becomes a site: its kind (NPR, PR, NPP, PP, OP, EVL, PO, NP, CHKO), a zone for national parks and
landscape areas, its name and code, and its polygons clipped to the play area, in the pack's local metres
(EPSG:5514 minus the play area's south-west corner), simplified to 1 m. What each kind forbids and how the game
treats it lives in src/core/data/protected.ts (research/75). The sidecar is additive like traffic.json:
meta.json is not touched; a complete (requireComplete) pack's manifest and ready marker are rewritten last.
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
FILE = "protected.json"
SOURCE = "AOPK ČR open data (gis.nature.cz Aplikace/Opendata), CC BY 4.0"
TOLERANCE = 1.0
SMALL = {"NPR", "PR", "NPP", "PP"}


def simplify(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Douglas-Peucker on a closed ring (first point kept), iterative."""
    if len(points) < 4:
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


def clip(ring: list[tuple[float, float]], w: float, h: float) -> list[tuple[float, float]]:
    """Sutherland-Hodgman clip of a ring to the rectangle [0, w] × [0, h]. Rings are filled even-odd by the
    game, so clipping each ring on its own keeps holes holes (a clipped edge runs along the border twice)."""
    def cut(points, inside, cross):
        out = []
        for i, p in enumerate(points):
            q = points[i - 1]
            if inside(p):
                if not inside(q):
                    out.append(cross(q, p))
                out.append(p)
            elif inside(q):
                out.append(cross(q, p))
        return out

    def at_x(x):
        return lambda q, p: (x, q[1] + (p[1] - q[1]) * (x - q[0]) / (p[0] - q[0]))

    def at_y(y):
        return lambda q, p: (q[0] + (p[0] - q[0]) * (y - q[1]) / (p[1] - q[1]), y)

    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    for inside, cross in ((lambda p: p[0] >= 0, at_x(0.0)), (lambda p: p[0] <= w, at_x(w)),
                          (lambda p: p[1] >= 0, at_y(0.0)), (lambda p: p[1] <= h, at_y(h))):
        if not pts:
            break
        pts = cut(pts, inside, cross)
    return pts


def area(ring: list[tuple[float, float]]) -> float:
    return abs(sum(ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1] for i in range(len(ring)))) / 2


def site(layer: int, a: dict) -> dict | None:
    """The game's description of one AOPK feature, or None for one it does not use."""
    kat, name = (a.get("KAT") or "").strip(), (a.get("NAZEV") or "").strip()
    if layer == 0:
        # the national park / landscape area itself comes zone by zone from layer 1; only a park's zone is kept
        return {"kind": "OP", "of": "NP", "name": name, "declared": True} if kat == "OP" else None
    if layer == 1:
        return {"kind": kat, "zone": str(a.get("ZONA") or "").strip(), "name": name} if kat in ("NP", "CHKO") else None
    if layer == 2:
        return {"kind": kat, "name": name, "code": str(a.get("KOD") or "")} if kat in SMALL else None
    if layer == 3:
        return {"kind": "OP", "of": (a.get("KAT_ZCHU") or "").strip(), "name": name,
                "declared": (a.get("OP_TYP") or "") == "VYH"}
    if layer in (6, 7):
        return {"kind": kat, "name": name, "code": a.get("SITECODE") or ""} if kat in ("EVL", "PO") else None
    return None


def sites(scenario: dict) -> list[dict]:
    x0, y0, x1, y1 = scenario["bbox5514"]
    w, h = x1 - x0, y1 - y0
    out = []
    for layer in (2, 3, 6, 7, 1, 0):
        path = CACHE / "protected" / f"raw-{scenario['id']}-L{layer}.json"
        if not path.exists():
            raise FileNotFoundError(f"{path} is missing: run pipeline/fetch_protected.py first")
        for feature in json.loads(path.read_text())["features"]:
            info = site(layer, feature["attributes"])
            if not info:
                continue
            rings = []
            for ring in feature.get("geometry", {}).get("rings", []):
                local = clip([(x - x0, y - y0) for x, y in ring], w, h)
                local = simplify(local + local[:1])[:-1] if len(local) >= 3 else []
                if len(local) >= 3 and area(local) >= 1:
                    rings.append([round(v, 1) for p in local for v in p])
            if rings:
                out.append({**{k: v for k, v in info.items() if v not in ("", None)}, "rings": rings})
    return out


def build(scenario: dict, out: Path) -> dict:
    data = {"version": 1, "source": SOURCE, "sites": sites(scenario)}
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
    kinds = sorted({s["kind"] + (f" {s['zone']}" if s.get("zone") else "") for s in data["sites"]})
    print(f"{sid}: {len(data['sites'])} protected areas {kinds} -> {out / FILE}, {(out / FILE).stat().st_size / 1e3:.0f} kB")


def main() -> None:
    ids = [a for a in sys.argv[1:] if not a.startswith("-")] or sorted(
        p.stem for p in (ROOT / "pipeline" / "scenarios").glob("*.json")
        if (ROOT / "public" / "scenarios" / p.stem / "meta.json").exists())
    for sid in ids:
        publish(sid)


if __name__ == "__main__":
    main()
