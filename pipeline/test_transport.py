import gzip
import json
import tempfile
import unittest
from pathlib import Path
import numpy as np
from transport import build, clipped_stations
from vectors import chaikin, thin


class TransportTests(unittest.TestCase):
    def test_clipped_closed_way_keeps_canonical_station_at_closing_node(self):
        xy = np.asarray([[0., 0.], [10., 0.], [10., 10.], [0., 0.]])
        s = clipped_stations(xy, xy)
        self.assertGreater(s[-1], s[-2])
        smooth = chaikin(np.column_stack([s, s]))[:, 0]
        kept = thin(chaikin(xy), indices=True)
        self.assertTrue(np.all(np.diff(smooth[kept]) >= 0))

    def test_sources_preserve_identity_unknown_rail_and_own_render_interval(self):
        road = {"type": "way", "id": 7, "nodes": [1, 2], "xy": [[0., 0.], [10., 0.]],
                "tags": {"highway": "primary", "bridge": "yes", "layer": "1"}}
        rail = {"type": "way", "id": 8, "nodes": [3, 4], "xy": [[0., 0.], [10., 0.]],
                "tags": {"railway": "rail", "tracks": "2"}}
        rendered = [{"osmWayId": "7", "layer": "primary", "polylineIndex": 0,
                     "sourceS": [2., 8.], "xy": [[2., 0.], [8., 0.]]},
                    {"osmWayId": "8", "layer": "rail", "polylineIndex": 0,
                     "sourceS": [0., 10.], "xy": rail["xy"]}]
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            (out / "vector.bin.gz").write_bytes(gzip.compress(b"unchanged legacy vectors", mtime=0))
            meta = build(out, [road, rail], lambda e: e["xy"], rendered, [7], lambda _: None)
            data = json.loads(gzip.decompress((out / meta["file"]).read_bytes()))
            second = build(out, [road, rail], lambda e: e["xy"], rendered, [7], lambda _: None)
        self.assertEqual(meta["fingerprint"], second["fingerprint"])
        a, b = data["sources"]
        self.assertEqual(a["elevation"], "unknown")
        self.assertEqual(b["elevation"], "terrain")
        self.assertNotIn("gauge", b["tags"])
        self.assertNotIn("electrified", b["tags"])
        self.assertEqual(b["tags"]["tracks"], "2")
        self.assertNotEqual(a["nodes"], b["nodes"])
        self.assertEqual(a["legacyNetIndex"], 0)
        self.assertEqual(a["render"][0]["s0"], 2)
        self.assertEqual(a["render"][0]["correspondence"][-1], {"sourceS": 8., "renderS": 6.})
        self.assertEqual([f["id"] for f in data["renderFeatures"]], ["primary:0", "rail:0"])

    def test_node_geometry_mismatch_fails_instead_of_guessing_connectivity(self):
        first = {"type": "way", "id": 1, "nodes": [1, 2], "xy": [[0., 0.], [10., 0.]], "tags": {"highway": "track"}}
        second = {**first, "id": 2, "xy": [[1., 0.], [10., 0.]]}
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "conflicting coordinates"):
                build(Path(directory), [first, second], lambda e: e["xy"], [], [], lambda _: None)


if __name__ == "__main__":
    unittest.main()
