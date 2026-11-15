"""Published-pack generation identity: manifest of files/inputs, ready marker written last."""
from __future__ import annotations

import contextlib
import fcntl
import hashlib
import json
from pathlib import Path


@contextlib.contextmanager
def lock(out: Path):
    """Serialize every writer of one pack directory (full build, graph sidecars, vectors)."""
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out.parent / f".{out.name}.lock", "w") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError(f"another build is writing {out}; wait for it to finish") from None
        yield


def files(out: Path) -> dict:
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir())
            if p.is_file() and p.name not in ("manifest.json", "ready.json")}


def verify(out: Path, scenario: dict, inputs: dict) -> dict:
    """A complete pack is only modified in place when it is one verified, coherent generation:
    ready marker for this id, manifest for the current config, every published file and every
    recorded cache input byte-identical. Otherwise the caller must rebuild the whole pack."""
    ready, manifest = out / "ready.json", out / "manifest.json"
    if not ready.exists() or json.loads(ready.read_text()) != {"id": scenario["id"], "ready": True}:
        raise RuntimeError(f"{out} is not a ready pack; run the full build instead")
    recorded = json.loads(manifest.read_text()) if manifest.exists() else {}
    if recorded.get("config") != scenario:
        raise RuntimeError("scenario config changed since the pack was built; run the full build")
    if recorded.get("files") != files(out):
        raise RuntimeError("pack files differ from their manifest (mixed generation); run the full build")
    if recorded.get("inputs") != inputs:
        raise RuntimeError("cached inputs differ from the pack's manifest; run the full build")
    return recorded


def publish(out: Path, scenario: dict, inputs: dict) -> None:
    """Rewrite the manifest for the present files, then the ready marker last."""
    manifest = {"config": scenario, "files": files(out), "inputs": inputs}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    (out / "ready.json").write_text(json.dumps({"id": scenario["id"], "ready": True}))
