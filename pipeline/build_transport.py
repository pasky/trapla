"""Add transport identity to an existing pack without changing its legacy fingerprint.

Use the same uv dependencies as build_pack.py. Regenerate render correspondence in a temporary
folder, require byte-identical legacy net and decompressed vector content, then publish sidecars.
D11 meta.json stays untouched. This is also a migration path for already-built older packs.
"""
import gzip
import json
import shutil
import tempfile
from pathlib import Path
import build_pack as b


def main():
    out = b.OUT
    overlays = json.loads((out / "overlays.json").read_text())
    net = b.road_network(b.cached_osm("lines"))
    if net != overlays.get("net"):
        raise ValueError("cached source network differs from installed pack; rebuild/review before adding identity")
    with tempfile.TemporaryDirectory(prefix="trapla-transport-") as temporary:
        b.OUT = Path(temporary)
        captured = []
        b.build_vectors(captured)
        old = gzip.decompress((out / "vector.bin.gz").read_bytes())
        new = gzip.decompress((b.OUT / "vector.bin.gz").read_bytes())
        if old != new:
            raise ValueError("cached render data differs from installed pack; transport mapping cannot bind")
        transport_meta = b.build_transport(captured)
        complete = b.SCENARIO.get("requireComplete", False)
        if complete:
            (out / "ready.json").unlink(missing_ok=True)
        for file in ("transport.json.gz", "transport-meta.json"):
            shutil.copyfile(b.OUT / file, out / file)
        if complete:
            import hashlib
            meta = json.loads((out / "meta.json").read_text())
            meta["transport"] = transport_meta
            (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False))
            manifest = json.loads((out / "manifest.json").read_text())
            manifest["files"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir())
                                 if p.is_file() and p.name not in ("manifest.json", "ready.json")}
            (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
            (out / "ready.json").write_text(json.dumps({"id": b.SCENARIO["id"], "ready": True}))
    b.OUT = out


if __name__ == "__main__":
    main()
