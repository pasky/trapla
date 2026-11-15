"""Additive editable transport graph; never changes legacy net or its scoring identity.

Canonical geometry uses full OSM way/node identities. Render correspondence is captured while
vectors.py builds the *unchanged* legacy binary, carrying source metres through smoothing.
Missing rail operation tags remain missing/unknown. No guessed neighbouring-track grouping.
"""
from __future__ import annotations
import gzip
import hashlib
import json
import math
import numpy as np

# Nominal style widths in render/landcover.ts, including the 0.45 m casing per side where
# present. The renderer also expands minPx when masking; these are not engineering widths.
WIDTHS = {"motorway": 11.9, "primary": 9.9, "secondary": 8.9, "tertiary": 7.9, "minor": 6.4,
          "service": 3.4, "track": 2.6, "rail": 3, "rail_side": 1.8}
TAGS = ("highway", "railway", "name", "ref", "lanes", "tracks", "gauge", "electrified",
        "voltage", "frequency", "maxspeed", "oneway", "service", "usage", "covered")


def stations(xy):
    return np.concatenate([[0.], np.cumsum(np.linalg.norm(np.diff(xy, axis=0), axis=1))])


def clipped_stations(original, clipped):
    """Map exact clipped vertices to source metres, monotonically, including closed ways.

    Streaming point/segment scan (no point×segment array). A shared crossing position can occur
    at several source metres; choose the first forward occurrence, never connect sources by XY.
    """
    cumulative = stations(original)
    previous = -1e-7
    result = []
    for point in clipped:
        candidates = []
        for i, (a, b) in enumerate(zip(original, original[1:])):
            delta = b - a
            length2 = float(np.dot(delta, delta))
            if length2 == 0:
                continue
            t = max(0., min(1., float(np.dot(point - a, delta)) / length2))
            distance = float(np.linalg.norm(point - (a + t * delta)))
            # Use canonical cumulative values at vertices; independently taking sqrt can
            # otherwise put the final render interval a few ulps beyond the source end.
            s = float(cumulative[i] if np.array_equal(point, a) else cumulative[i + 1]
                      if np.array_equal(point, b) else cumulative[i] + t * (cumulative[i + 1] - cumulative[i]))
            s = min(float(cumulative[-1]), max(0., s))
            if distance < 1e-5 and s >= previous - 1e-7:
                candidates.append(s)
        if not candidates:
            raise ValueError("render clipping lost monotone source correspondence")
        previous = min(candidates)
        result.append(previous)
    return np.asarray(result)


def build(out, elements, project, render_lines, legacy_ids, log=print):
    sources, nodes, render_features = {}, {}, []
    node_sources, conflicting_nodes, conflicting_sources = {}, set(), set()
    legacy = {}
    for i, wid in enumerate(legacy_ids):
        legacy.setdefault(str(wid), []).append(i)
    for el in elements:
        tags = el.get("tags", {})
        if el.get("type") != "way" or not (tags.get("highway") in
                ("motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
                 "living_street", "service", "track", "motorway_link", "trunk_link", "primary_link",
                 "secondary_link", "tertiary_link") or tags.get("railway") == "rail"):
            continue
        wid, sid = str(el["id"]), f"osm:way:{el['id']}"
        xy = np.asarray(project(el), dtype=float)
        node_ids = [f"osm:node:{node}" for node in el.get("nodes", [])]
        if len(xy) < 2 or len(node_ids) != len(xy) or not np.isfinite(xy).all():
            raise ValueError(f"transport source {sid} has incomplete geometry/node identities")
        bridge = tags.get("bridge", "no") != "no"
        tunnel = tags.get("tunnel", "no") != "no"
        covered = tags.get("covered", "no") != "no"
        try:
            layer = int(tags.get("layer", "0"))
        except ValueError:
            # Contract currently needs numeric layer; never drape malformed structure data.
            raise ValueError(f"transport source {sid} has invalid layer {tags.get('layer')}")
        source = {"id": sid, "osmWayId": wid, "kind": "railway" if tags.get("railway") == "rail" else "road",
                  "nodes": node_ids, "xy": xy.reshape(-1).tolist(), "stations": stations(xy).tolist(),
                  "layer": layer, "bridge": bridge, "tunnel": tunnel,
                  "elevation": "unknown" if bridge or tunnel or covered or layer != 0 else "terrain",
                  "tags": {key: tags[key] for key in TAGS if key in tags}, "render": []}
        if wid in legacy:
            source["legacyNetIndex"] = legacy[wid][0]
        if sid in sources and source != sources[sid]:
            conflicting_sources.add(sid)
        else:
            sources[sid] = source
        for node, point in zip(node_ids, xy.tolist()):
            node_sources.setdefault(node, set()).add(sid)
            if node in nodes and nodes[node] != point:
                conflicting_nodes.add(node)
            else:
                nodes[node] = point
    for node in conflicting_nodes:
        conflicting_sources.update(node_sources[node])
    unresolved = {}
    for sid in sorted(conflicting_sources):
        source = sources.pop(sid)
        item = {"id": sid, "osmWayId": source["osmWayId"], "kind": source["kind"],
                "reason": "conflicting-snapshots", "renderFeatureIds": []}
        if source["osmWayId"] in legacy:
            item["legacyNetIndices"] = legacy[source["osmWayId"]]
        unresolved[sid] = item
    used_nodes = {node for source in sources.values() for node in source["nodes"]}
    nodes = {node: point for node, point in nodes.items() if node in used_nodes}
    for line in render_lines:
        sid = f"osm:way:{line['osmWayId']}"
        if sid not in sources and sid not in unresolved:
            raise ValueError(f"rendered transport source absent from graph: {sid}")
        fid = f"{line['layer']}:{line['polylineIndex']}"
        render_features.append({"id": fid, "layer": line["layer"], "polylineIndex": line["polylineIndex"]})
        if sid in unresolved:
            # Visible/pickable but not promotable: no invented canonical geometry/connectivity.
            unresolved[sid]["renderFeatureIds"].append(fid)
            continue
        rendered_s = stations(np.asarray(line["xy"]))
        source_s = line["sourceS"]
        if len(source_s) != len(rendered_s) or any(b < a - 1e-6 for a, b in zip(source_s, source_s[1:])):
            raise ValueError(f"nonmonotone render correspondence for {sid}")
        sources[sid]["render"].append({"featureId": fid, "sourceId": sid,
            "s0": source_s[0], "s1": source_s[-1], "width": WIDTHS[line["layer"]],
            "correspondence": [{"sourceS": s, "renderS": float(r)} for s, r in zip(source_s, rendered_s)]})
    vector = gzip.decompress((out / "vector.bin.gz").read_bytes())
    data = {"version": 1, "vectorData": hashlib.sha256(vector).hexdigest(), "renderFeatures": render_features,
            "nodes": [{"id": key, "xy": value} for key, value in sorted(nodes.items())],
            "sources": [sources[key] for key in sorted(sources)]}
    if unresolved:
        data["unresolvedSources"] = list(unresolved.values())
    raw = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()
    file = "transport.json.gz"
    (out / file).write_bytes(gzip.compress(raw, 9, mtime=0))
    meta = {"file": file, "version": 1, "fingerprint": hashlib.sha256(raw).hexdigest()}
    (out / "transport-meta.json").write_text(json.dumps(meta))
    log(f"transport: {len(sources)} sources, {len(nodes)} nodes, {len(render_features)} render features, "
        f"{len(unresolved)} unresolved sources; {len(raw)/1e6:.1f} MB raw")
    return meta
