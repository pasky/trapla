import gzip
import json
import tempfile
import unittest
from pathlib import Path
import numpy as np
from transport import build, clipped_stations, stations
from vectors import chaikin, thin


class TransportTests(unittest.TestCase):
    def test_clipped_closed_way_keeps_canonical_station_at_closing_node(self):
        xy = np.asarray([[0., 0.], [10., 0.], [10., 10.], [0., 0.]])
        s = clipped_stations(xy, xy)
        self.assertGreater(s[-1], s[-2])
        smooth = chaikin(np.column_stack([s, s]))[:, 0]
        kept = thin(chaikin(xy), indices=True)
        self.assertTrue(np.all(np.diff(smooth[kept]) >= 0))

    def test_clipped_endpoints_stay_exactly_inside_canonical_bounds(self):
        random = np.random.default_rng(19)
        for _ in range(32):
            xy = np.cumsum(random.normal(size=(8, 2)) * 100, axis=0) + 12000
            result = clipped_stations(xy, xy)
            self.assertEqual(result[0], 0)
            self.assertEqual(result[-1], stations(xy)[-1])
            self.assertLessEqual(result.max(), stations(xy)[-1])

    def test_self_crossing_parts_keep_source_segment_provenance(self):
        from shapely.geometry import LineString, box
        xy = np.asarray([[0., 0.], [10., 10.], [0., 10.], [10., 0.]])
        total = stations(xy)[-1]
        # Reviewer repro: the final part restarts at the crossing XY that the first pass also visits.
        np.testing.assert_allclose(clipped_stations(xy, np.asarray([[5., 5.], [10., 0.]])),
                                   [total - 50 ** .5, total])
        # Actual overlay output, including the closed middle loop starting/ending at the crossing.
        parts = LineString(xy).intersection(box(-5, -5, 20, 20)).geoms
        intervals = [clipped_stations(xy, np.asarray(p.coords)) for p in parts]
        np.testing.assert_allclose([(s[0], s[-1]) for s in intervals],
                                   [(0, 50 ** .5), (50 ** .5, total - 50 ** .5), (total - 50 ** .5, total)])

    def test_ambiguous_or_unmatched_clipped_part_is_rejected(self):
        from transport import AmbiguousCorrespondence
        # The same segment is traversed twice in the same direction: two equally valid walks.
        xy = np.asarray([[0., 0.], [10., 0.], [10., 5.], [0., 0.], [10., 0.]])
        with self.assertRaises(AmbiguousCorrespondence):
            clipped_stations(xy, np.asarray([[2., 0.], [8., 0.]]))
        with self.assertRaises(AmbiguousCorrespondence):
            clipped_stations(xy, np.asarray([[2., 1.], [8., 1.]]))

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

    def test_node_geometry_mismatch_is_explicitly_unresolved_without_fake_connectivity(self):
        first = {"type": "way", "id": 1, "nodes": [1, 2], "xy": [[0., 0.], [10., 0.]], "tags": {"highway": "track"}}
        second = {**first, "id": 2, "xy": [[.01, 0.], [10., 0.]]}
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            (out / "vector.bin.gz").write_bytes(gzip.compress(b"legacy"))
            meta = build(out, [first, second], lambda e: e["xy"], [], [1, 2], lambda _: None)
            graph = json.loads(gzip.decompress((out / meta["file"]).read_bytes()))
        self.assertEqual(graph["sources"], [])
        self.assertEqual(graph["nodes"], [])
        self.assertEqual([s["reason"] for s in graph["unresolvedSources"]], ["conflicting-snapshots"] * 2)
        self.assertEqual(graph["unresolvedSources"][0]["legacyNetIndices"], [0])
        self.assertNotIn("xy", graph["unresolvedSources"][0])


if __name__ == "__main__":
    unittest.main()
