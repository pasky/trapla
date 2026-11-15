"""Overpass response cache bound to its exact query; hits are validated like fresh responses.

A cache file is only reused when a sidecar binding names the same canonical query (body + bbox +
output mode) and the cached bytes' SHA-256, or when its bytes match an explicitly frozen legacy
hash (D11's original caches predate bindings; their bytes are not relabelled or rewritten).
Everything else is treated as unbound: moved aside (never deleted) and fetched again.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from pathlib import Path

VERSION = 1


def canonical_query(body: str, bounds) -> str:
    """Query identity without server-side timeout, which does not change the requested data."""
    s, w, n, e = bounds
    return f"[out:json][bbox:{s:.5f},{w:.5f},{n:.5f},{e:.5f}];\n{body}\nout geom qt;"


def fingerprint(query: str) -> str:
    return hashlib.sha256(query.encode()).hexdigest()


def validate(data, *, max_age_days=None, now=None) -> dict:
    """Same completeness check for fetched responses and cache hits. Raises on incomplete data."""
    if not isinstance(data, dict) or not isinstance(data.get("elements"), list):
        raise RuntimeError("incomplete Overpass response: no element list")
    if "remark" in data:
        # Overpass reports runtime errors (timeouts, memory) as a remark next to partial elements.
        raise RuntimeError(f"incomplete Overpass response: {data['remark']}")
    if max_age_days is not None:
        stamp = snapshot(data)
        if stamp is None:
            raise RuntimeError("Overpass response has no snapshot timestamp")
        age = (now or dt.datetime.now(dt.timezone.utc)) - dt.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        if age > dt.timedelta(days=max_age_days):
            raise RuntimeError(f"stale Overpass snapshot {stamp} (mirror lagging by {age.days} days)")
    return data


def snapshot(data: dict):
    stamp = data.get("osm3s", {}).get("timestamp_osm_base")
    if stamp is None and data.get("tileSnapshots"):
        stamps = [t.get("timestamp_osm_base") for t in data["tileSnapshots"]]
        stamp = min(stamps) if all(stamps) else None
    return stamp


def binding_path(path: Path) -> Path:
    return path.with_name(path.stem + ".query.json")


class FrozenInputError(RuntimeError):
    """A frozen legacy input is missing or changed. Never fetched, moved or rewritten."""


def write_atomic(path: Path, data: bytes) -> None:
    temporary = path.with_name(path.name + ".partial")
    temporary.write_bytes(data)
    os.replace(temporary, path)


def read_record(path: Path) -> dict:
    """A sidecar record; missing or malformed (e.g. interrupted) records count as absent."""
    try:
        record = json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError, UnicodeDecodeError):
        return {}
    return record if isinstance(record, dict) else {}


def load_frozen(path: Path, frozen_sha256: str) -> dict:
    """Frozen identity is authoritative and checked first, independently of any binding."""
    if not path.exists():
        raise FrozenInputError(f"{path.name} (frozen legacy input) is missing; restore it, do not refetch")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != frozen_sha256:
        raise FrozenInputError(f"{path.name} differs from its frozen legacy bytes; restore it, do not refetch")
    return validate(json.loads(raw))


def load(path: Path, query: str, *, frozen_sha256=None):
    """Return validated cached data, or None when absent/unbound (moved aside, never deleted)."""
    if frozen_sha256 is not None:
        return load_frozen(path, frozen_sha256)
    if not path.exists():
        return None
    raw = path.read_bytes()
    sidecar = binding_path(path)
    binding = read_record(sidecar)
    if not (binding.get("version") == VERSION and binding.get("fingerprint") == fingerprint(query)
            and binding.get("sha256") == hashlib.sha256(raw).hexdigest()):
        for stale in (path, sidecar):
            if stale.exists():
                stale.rename(stale.with_name(stale.name + ".unbound~"))
        return None
    return validate(json.loads(raw))


def store(path: Path, raw: bytes, query: str, endpoint: str) -> None:
    """Write data first, then its binding: an interrupted write leaves an unbound (refetched) cache."""
    data = validate(json.loads(raw))
    binding_path(path).unlink(missing_ok=True)
    write_atomic(path, raw)
    write_atomic(binding_path(path), json.dumps({
        "version": VERSION, "fingerprint": fingerprint(query), "query": query, "endpoint": endpoint,
        "sha256": hashlib.sha256(raw).hexdigest(), "snapshot": snapshot(data)}, ensure_ascii=False, indent=1).encode())
