"""Bounded-grid terrain catchments for mapped waterways (not a discharge model).

Local coordinates are metres east/north from the scenario's southwest corner;
terrain rows run north to south. Areas include the sampled cell. A truncated
area is only the known in-domain contribution, not a complete catchment.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import gzip
import hashlib
import heapq
import json
from itertools import count
import math
from pathlib import Path
import re

import numpy as np
from PIL import Image, ImageDraw

CELL = 25.0
BURN_DEPTH = 5.0
METHOD = ("DMR 5G mean-resampled 25m (any nodata block excluded); OSM waterways burned 5m; "
          "priority-flood depression fill + steepest D8, flood-parent flat routing; "
          "25m maximum nearby same-reach burned-cell upstream area (prefer non-junction cells); boundary/nodata contributions "
          "propagate truncated=true (known area only); unsampled points=0,truncated=true")
KINDS = {"stream", "river", "ditch", "drain", "canal"}
# Fixed order makes both flood ties and D8 ties deterministic.
NEIGHBORS = tuple((dr, dc, math.hypot(dr, dc))
                  for dr in (-1, 0, 1) for dc in (-1, 0, 1) if dr or dc)


@dataclass
class FlowGrid:
    filled: np.ndarray
    downstream: np.ndarray  # flat index, -1 at outlets and nodata
    catchment_km2: np.ndarray
    truncated: np.ndarray


def resample_terrain(heights: np.ndarray, source_cell: float, cell: float = CELL) -> np.ndarray:
    """Mean blocks without bridging even partial nodata (not display-filled DEM)."""
    factor = int(round(cell / source_cell))
    if factor < 1 or not math.isclose(factor * source_cell, cell):
        raise ValueError("hydrology cell must be an integer multiple of terrain cell")
    ny, nx = heights.shape
    if ny % factor or nx % factor:
        raise ValueError("terrain dimensions must be divisible by hydrology resampling factor")
    # NaNs naturally propagate through the mean, preserving the Polish data edge.
    return heights.reshape(ny // factor, factor, nx // factor, factor).mean(axis=(1, 3))


def flow_grid(heights: np.ndarray, cell: float = CELL, burned: np.ndarray | None = None,
              burn_depth: float = BURN_DEPTH) -> FlowGrid:
    """Priority flood, acyclic D8 routing, and upstream area/uncertainty propagation.

    O(cells) arrays/heap/queue; no point x cell or cell x cell products. Valid
    outer-edge and nodata-adjacent cells are open outlets and uncertainty seeds.
    On flats, flood parents provide an outlet-directed route, not arbitrary ties.
    """
    if heights.ndim != 2 or not heights.size or cell <= 0:
        raise ValueError("expected nonempty 2D terrain and positive cell size")
    ny, nx = heights.shape
    filled = np.asarray(heights, dtype=np.float64).copy()
    valid = np.isfinite(filled)
    if burned is not None:
        filled[valid & burned] -= burn_depth
    boundary = np.zeros_like(valid)
    boundary[0, :] = boundary[-1, :] = True
    boundary[:, 0] = boundary[:, -1] = True
    for dr, dc, _ in NEIGHBORS:
        r0, r1 = max(0, -dr), min(ny, ny - dr)
        c0, c1 = max(0, -dc), min(nx, nx - dc)
        boundary[r0:r1, c0:c1] |= ~valid[r0 + dr:r1 + dr, c0 + dc:c1 + dc]
    boundary &= valid
    visited = boundary.copy()
    parent = np.full(ny * nx, -1, dtype=np.int32)
    z = filled.ravel()
    sequence = count()
    heap = [(float(z[i]), next(sequence), int(i)) for i in np.flatnonzero(boundary)]
    heapq.heapify(heap)
    while heap:
        elevation, _, i = heapq.heappop(heap)
        r, c = divmod(i, nx)
        for dr, dc, _ in NEIGHBORS:
            rr, cc = r + dr, c + dc
            if 0 <= rr < ny and 0 <= cc < nx and valid[rr, cc] and not visited[rr, cc]:
                j = rr * nx + cc
                visited[rr, cc] = True
                parent[j] = i
                z[j] = max(float(z[j]), elevation)
                # FIFO elevation ties spread across filled flats rather than
                # preferring raster-index meanders toward the northwest.
                heapq.heappush(heap, (float(z[j]), next(sequence), j))

    downstream = parent.copy()
    # Strict downhill always wins; otherwise the flood parent drains a flat.
    # Boundary seeds without a downhill neighbor remain open outlets.
    for i in np.flatnonzero(valid):
        i = int(i)
        r, c = divmod(i, nx)
        best_slope = 0.0
        for dr, dc, distance in NEIGHBORS:
            rr, cc = r + dr, c + dc
            if 0 <= rr < ny and 0 <= cc < nx and valid[rr, cc]:
                j = rr * nx + cc
                slope = (z[i] - z[j]) / distance
                if slope > best_slope:
                    best_slope = slope
                    downstream[i] = j
    indegree = np.zeros(ny * nx, dtype=np.int32)
    receivers = downstream[downstream >= 0]
    np.add.at(indegree, receivers, 1)
    area = valid.ravel().astype(np.float64) * (cell * cell / 1e6)
    truncated = boundary.ravel().copy()
    queue = deque(int(i) for i in np.flatnonzero(valid.ravel() & (indegree == 0)))
    processed = 0
    while queue:
        i = queue.popleft()
        processed += 1
        j = downstream[i]
        if j >= 0:
            area[j] += area[i]
            truncated[j] |= truncated[i]
            indegree[j] -= 1
            if indegree[j] == 0:
                queue.append(int(j))
    if processed != int(valid.sum()):
        raise RuntimeError("cycle in hydrology flow routing")
    truncated[~valid.ravel()] = True
    return FlowGrid(filled, downstream.reshape(ny, nx), area.reshape(ny, nx),
                    truncated.reshape(ny, nx))


def densify(points: np.ndarray, spacing: float = CELL) -> np.ndarray:
    """Keep original vertices, subdividing every segment to at most spacing metres."""
    points = np.asarray(points, dtype=np.float64)
    if len(points) < 2:
        return points.copy()
    out = [points[0]]
    for a, b in zip(points[:-1], points[1:]):
        steps = max(1, math.ceil(float(np.linalg.norm(b - a)) / spacing))
        out.extend(a + (b - a) * (k / steps) for k in range(1, steps + 1))
    return np.asarray(out)


def tagged_width(value) -> float | None:
    """Parse a single physical OSM width; do not invent widths for untagged ways."""
    if value is None:
        return None
    match = re.fullmatch(r"\s*(\d+(?:[.,]\d+)?)\s*(m|cm|ft|feet|')?\s*", str(value), re.I)
    if not match:
        return None
    width = float(match[1].replace(",", "."))
    unit = (match[2] or "m").lower()
    width *= {"m": 1, "cm": 0.01, "ft": 0.3048, "feet": 0.3048, "'": 0.3048}[unit]
    return width if math.isfinite(width) and width > 0 else None


def fetch_waterways(cache_path, overpass) -> list[dict]:
    """Reuse the historic line cache; supplement its missing ditch/drain query.

    The presence of one drainage way is not proof a legacy query covered them.
    A separate versioned cache records that the full drainage query was made.
    """
    # Freeze one independent snapshot, including when bootstrapped from legacy
    # caches. A later overlay build creating osm_lines must not switch sources.
    snapshot = cache_path("watercourses_v1")
    if snapshot.exists():
        elements = json.loads(snapshot.read_text())["elements"]
        by_id = {el["id"]: el for el in elements
                 if el.get("type") == "way" and el.get("tags", {}).get("waterway") in KINDS}
        return [by_id[i] for i in sorted(by_id)]
    cached = cache_path("lines")
    elements = json.loads(cached.read_text())["elements"] if cached.exists() else []
    waterways = [el for el in elements
                 if el.get("type") == "way" and el.get("tags", {}).get("waterway") in KINDS]
    if waterways:
        extra = overpass("drainage_v1", 'way["waterway"~"^(ditch|drain)$"];')["elements"]
    else:
        extra = overpass("watercourses_v1", 'way["waterway"~"^(river|stream|canal|ditch|drain)$"];')["elements"]
    by_id = {el["id"]: el for el in waterways + extra
             if el.get("type") == "way" and el.get("tags", {}).get("waterway") in KINDS}
    result = [by_id[i] for i in sorted(by_id)]
    snapshot.write_text(json.dumps({"elements": result}, separators=(",", ":")))
    return result


def line_cells(points: np.ndarray, shape: tuple[int, int], cell: float = CELL) -> set[int]:
    """Rasterize one reach in its clipped bounding box, using floor consistently.

    The temporary image is at most grid-sized; the retained cell IDs are only
    the reach's line pixels. No per-reach full-grid masks are retained.
    """
    ny, nx = shape
    pixels = [(math.floor(x / cell), math.floor(ny - y / cell)) for x, y in points]
    if len(pixels) < 2:
        return set()
    left = max(0, min(x for x, _ in pixels))
    top = max(0, min(y for _, y in pixels))
    right = min(nx - 1, max(x for x, _ in pixels))
    bottom = min(ny - 1, max(y for _, y in pixels))
    if left > right or top > bottom:
        return set()
    image = Image.new("1", (right - left + 1, bottom - top + 1))
    ImageDraw.Draw(image).line([(x - left, y - top) for x, y in pixels], fill=1, width=1)
    rows, cols = np.nonzero(np.asarray(image))
    return set(((rows + top) * nx + cols + left).tolist())


def sample_catchments(points: np.ndarray, flow: FlowGrid, burned: np.ndarray,
                      cell: float = CELL, reach_cells: set[int] | None = None, owners: np.ndarray | None = None
                      ) -> tuple[list[float], list[bool]]:
    """Snap to the largest upstream area on a burned cell centre within one cell.

    The max is a local downstream proxy, not a monotonic assumption about OSM
    digitization direction. A point in nodata/outside cannot borrow a complete
    area from a neighboring valid cell. Missing samples remain explicit.
    """
    ny, nx = burned.shape
    areas, flags = [], []
    for x, y in points:
        r, c = math.floor(ny - y / cell), math.floor(x / cell)
        if not (0 <= r < ny and 0 <= c < nx) or not np.isfinite(flow.filled[r, c]):
            areas.append(0.0)
            flags.append(True)
            continue
        candidates = []
        for rr in range(max(0, r - 1), min(ny, r + 2)):
            for cc in range(max(0, c - 1), min(nx, c + 2)):
                if (burned[rr, cc] and np.isfinite(flow.filled[rr, cc]) and
                        (reach_cells is None or rr * nx + cc in reach_cells) and
                        math.hypot((cc + 0.5) * cell - x, (ny - rr - 0.5) * cell - y) <= cell):
                    candidates.append((rr, cc))
        if not candidates:
            areas.append(0.0)
            flags.append(True)
            continue
        # A tributary owns its junction pixel too, but that pixel carries main-stem flow.
        # Prefer unshared cells when available; an exact unresolved junction stays conservative.
        exclusive = [rc for rc in candidates if owners is not None and owners[rc] == 1]
        rr, cc = max(exclusive or candidates, key=lambda rc: flow.catchment_km2[rc])
        areas.append(round(float(flow.catchment_km2[rr, cc]), 6))
        # Snapping must not turn a boundary/nodata-adjacent point into a claim
        # of completeness by choosing a nearby interior cell with a larger area.
        flags.append(bool(flow.truncated[r, c]) or
                     any(bool(flow.truncated[rc]) for rc in candidates))
    return areas, flags


def build(heights: np.ndarray, source_cell: float, elements: list[dict], way_xy,
          out: Path, log=print) -> dict:
    """Write watercourses independently of the categorical land-cover raster."""
    terrain = resample_terrain(heights, source_cell)
    ny, nx = terrain.shape
    burned = np.zeros((ny, nx), dtype=bool)
    reaches = []
    for el in elements:
        tags = el.get("tags", {})
        kind = tags.get("waterway")
        if kind not in KINDS:
            continue
        points = way_xy(el)
        if len(points) < 2 or not np.isfinite(points).all():
            continue
        cells = line_cells(points, (ny, nx))
        if cells:
            burned.ravel()[list(cells)] = True
        reaches.append({"id": int(el["id"]), "kind": "ditch" if kind == "drain" else kind,
                        "width": tagged_width(tags.get("width")), "points": densify(points),
                        "_cells": cells})
    log(f"hydrology: {nx}x{ny} cells, {len(reaches)} mapped reaches, {burned.sum()} burned cells")
    flow = flow_grid(terrain, burned=burned)
    owners = np.zeros((ny, nx), dtype=np.uint16)
    for reach in reaches:
        if reach["_cells"]:
            owners.ravel()[list(reach["_cells"])] += 1
    for reach in reaches:
        reach["catchmentKm2"], reach["truncated"] = sample_catchments(
            reach["points"], flow, burned, reach_cells=reach.pop("_cells"), owners=owners)
        reach["points"] = np.round(reach["points"], 3).tolist()
    pack = {"version": 1, "method": METHOD, "reaches": reaches}
    filename = "watercourses.json.gz"
    out.mkdir(parents=True, exist_ok=True)
    packed = gzip.compress(
        json.dumps(pack, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode(),
        compresslevel=9, mtime=0)
    (out / filename).write_bytes(packed)
    total = sum(len(reach["points"]) for reach in reaches)
    uncertain = sum(sum(reach["truncated"]) for reach in reaches)
    log(f"hydrology: {total} points, {uncertain} boundary/nodata-truncated or unsampled")
    return {"file": filename, "version": 1, "method": METHOD,
            "sha256": hashlib.sha256(packed).hexdigest()}
