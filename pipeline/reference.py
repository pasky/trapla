"""Strict OSM reference chains. Coordinates supplied by the caller are projected metres.

New packs use explicit way IDs or an unambiguous node-connected chain. OSM way direction is
not route direction. Nearby XY alone never joins disconnected carriageways. Legacy D11 keeps
its original extractor so its display points and pack fingerprints do not drift.
"""
from __future__ import annotations

import numpy as np


def chain_reference(elements, cfg, project):
    """Return projected points, segment kinds and ordered way IDs; fail instead of guessing.

    `wayIds` limits the chain to a reviewed manifest, not an order. `startNode` fixes orientation;
    otherwise `startNear` must uniquely select an open chain end within `endpointToleranceM`.
    All selected ways must be used. Branches, cycles, missing nodes and gaps are errors.
    """
    selected = cfg.get("wayIds")
    wanted = set(selected) if selected is not None else None
    if selected is not None and (not selected or len(wanted) != len(selected)):
        raise ValueError("reference wayIds must be nonempty and unique")
    ways = {}
    for el in elements:
        tags = el.get("tags", {})
        if el.get("type") != "way":
            continue
        if wanted is not None:
            if el["id"] not in wanted:
                continue
        elif tags.get("ref") != cfg["ref"] or cfg["highway"] not in (
                tags.get("highway"), tags.get("construction"), tags.get("proposed")):
            continue
        nodes, geometry = el.get("nodes", []), el.get("geometry", [])
        if len(nodes) < 2 or len(nodes) != len(geometry) or len(set(nodes)) != len(nodes):
            raise ValueError(f"reference way {el['id']}: missing nodes/geometry or loop")
        node_range = cfg.get("wayNodeRanges", {}).get(str(el["id"]))
        if node_range is not None:
            if len(node_range) != 2 or node_range[0] == node_range[1] or any(n not in nodes for n in node_range):
                raise ValueError(f"reference way {el['id']}: invalid node range")
            lo, hi = sorted(nodes.index(n) for n in node_range)
            nodes, geometry = nodes[lo:hi + 1], geometry[lo:hi + 1]
        xy = np.asarray([project(p["lon"], p["lat"]) for p in geometry], dtype=float)
        if not np.isfinite(xy).all() or np.any(np.linalg.norm(np.diff(xy, axis=0), axis=1) <= 0):
            raise ValueError(f"reference way {el['id']}: invalid or duplicate coordinates")
        if el["id"] in ways:
            raise ValueError(f"duplicate reference way {el['id']}")
        ways[el["id"]] = (nodes, xy, tags)
    if not ways or wanted is not None and set(ways) != wanted:
        raise ValueError(f"reference ways missing: {sorted((wanted or set()) - set(ways))}")
    ends = {}
    for wid, (nodes, xy, _) in ways.items():
        for i in (0, -1):
            ends.setdefault(nodes[i], []).append((wid, i, xy[i]))
    if any(len(v) > 2 for v in ends.values()):
        raise ValueError("ambiguous reference branch; select one continuous wayIds manifest")
    tips = [(node, entries[0][2]) for node, entries in ends.items() if len(entries) == 1]
    if len(tips) != 2:
        raise ValueError("reference is disconnected or closed; expected exactly two ends")
    if "startNode" in cfg:
        start = cfg["startNode"]
        if start not in {node for node, _ in tips}:
            raise ValueError("reference startNode is not a chain end")
    else:
        target = np.asarray(project(cfg["startNear"][1], cfg["startNear"][0]))
        choices = sorted((float(np.linalg.norm(xy - target)), node) for node, xy in tips)
        tolerance = cfg.get("endpointToleranceM", 100)
        if choices[0][0] > tolerance or abs(choices[1][0] - choices[0][0]) < 1:
            raise ValueError("reference startNear is distant or ambiguous; specify startNode")
        start = choices[0][1]
    used, ordered, points, kinds = set(), [], [], []
    node = start
    while True:
        candidates = [entry for entry in ends[node] if entry[0] not in used]
        if not candidates:
            break
        if len(candidates) != 1:
            raise ValueError("ambiguous reference continuation")
        wid, i, _ = candidates[0]
        nodes, xy, tags = ways[wid]
        if i == -1:
            nodes, xy = nodes[::-1], xy[::-1]
        if points and np.linalg.norm(points[-1] - xy[0]) > 0.05:
            raise ValueError(f"inconsistent coordinates at reference node {node}")
        kind = 1 if tags.get("bridge", "no") != "no" else 2 if tags.get("tunnel", "no") != "no" else 0
        points.extend(xy if not points else xy[1:])
        kinds.extend([kind] * (len(xy) - 1))
        used.add(wid)
        ordered.append(wid)
        node = nodes[-1]
    if len(used) != len(ways):
        raise ValueError("disconnected reference ways remain")
    # Endpoint degrees cannot see interior revisits such as [1,2,3] + [3,4,2,5]: the
    # assembled route itself must be a simple node path.
    assembled = [start]
    for wid in ordered:
        nodes = ways[wid][0]
        assembled.extend(nodes[1:] if nodes[0] == assembled[-1] else nodes[-2::-1])
    if len(set(assembled)) != len(assembled):
        raise ValueError("reference revisits a node; the assembled chain is not a simple path")
    pts = np.asarray(points)
    length = float(np.linalg.norm(np.diff(pts, axis=0), axis=1).sum())
    if "lengthRangeM" in cfg and not cfg["lengthRangeM"][0] <= length <= cfg["lengthRangeM"][1]:
        raise ValueError(f"reference length {length:.1f} outside reviewed range {cfg['lengthRangeM']}")
    return pts, kinds, ordered


def endpoint(spec, pts, cumulative, project):
    if "latlon" in spec:
        return np.asarray(project(spec["latlon"][1], spec["latlon"][0]))
    distance = float(spec["alongOfficial"])
    if not len(pts) or not np.isfinite(distance) or not 0 <= distance <= cumulative[-1]:
        raise ValueError("endpoint outside available reference")
    if distance == 0:
        return pts[0]
    i = int(np.searchsorted(cumulative, distance))
    fraction = (distance - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1])
    return pts[i - 1] + fraction * (pts[i] - pts[i - 1])


def baseline(data, excluded_way_ids):
    """Filter before any network/raster/render derivation, never erase overlapping pixels."""
    excluded = set(excluded_way_ids)
    if not excluded:
        return data
    return {**data, "elements": [el for el in data["elements"]
                               if not (el.get("type") == "way" and el["id"] in excluded)]}
