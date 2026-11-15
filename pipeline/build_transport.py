"""Add transport identity to an existing pack without changing its legacy fingerprint.

Use the same uv dependencies as build_pack.py. Regenerate render correspondence in a temporary
folder, require byte-identical legacy net and decompressed vector content, then publish sidecars.
D11 meta.json stays untouched. This is also a migration path for already-built older packs.

A complete (requireComplete) pack is touched only when it is one verified coherent generation
(ready marker, manifest config/files/inputs all match). Its ready marker is removed before any
write and rewritten last; a failure leaves it not ready, never recertified.
"""
import gzip
import json
import shutil
import tempfile
from pathlib import Path
import build_pack as b


def main():
    out = b.OUT
    complete = b.SCENARIO.get("requireComplete", False)
    manifest = b.verify_published_generation() if complete else None
    overlays = json.loads((out / "overlays.json").read_text())
    net = b.road_network(b.cached_osm("lines"))
    if net != overlays.get("net"):
        raise ValueError("cached source network differs from installed pack; rebuild/review before adding identity")
    with tempfile.TemporaryDirectory(prefix="trapla-transport-") as temporary:
        b.OUT = Path(temporary)
        try:
            captured = []
            b.build_vectors(captured)
            old = gzip.decompress((out / "vector.bin.gz").read_bytes())
            new = gzip.decompress((b.OUT / "vector.bin.gz").read_bytes())
            if old != new:
                raise ValueError("cached render data differs from installed pack; transport mapping cannot bind")
            transport_meta = b.build_transport(captured)
        finally:
            b.OUT = out
        if complete:
            (out / "ready.json").unlink()
        for file in ("transport.json.gz", "transport-meta.json"):
            shutil.copyfile(Path(temporary) / file, out / file)
    if complete:
        meta = json.loads((out / "meta.json").read_text())
        meta["transport"] = transport_meta
        (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False))
        b.publish_manifest(manifest["inputs"])


if __name__ == "__main__":
    main()
