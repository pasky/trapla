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
        b.build_transport(captured)
        for file in ("transport.json.gz", "transport-meta.json"):
            shutil.copyfile(b.OUT / file, out / file)
    b.OUT = out


if __name__ == "__main__":
    main()
