"""Reference extraction and baseline exclusion regressions, independent of network services."""
import unittest
import numpy as np
from reference import chain_reference, endpoint, baseline


def way(wid, nodes, xy, **tags):
    return {"type": "way", "id": wid, "nodes": nodes,
            "geometry": [{"lon": x, "lat": y} for x, y in xy],
            "tags": {"ref": "D3", "highway": "proposed", "proposed": "motorway", **tags}}


class ReferenceTests(unittest.TestCase):
    def setUp(self):
        self.a = way(10, [1, 2], [(0, 0), (10, 0)])
        self.b = way(20, [3, 2], [(20, 0), (10, 0)], bridge="yes")
        self.cfg = {"ref": "D3", "highway": "motorway", "startNode": 1, "lengthRangeM": [19, 21]}
        self.project = lambda x, y: (x, y)

    def test_proposed_reverse_orientation_and_structure_segments(self):
        pts, kinds, ids = chain_reference([self.b, self.a], self.cfg, self.project)
        np.testing.assert_array_equal(pts, [[0, 0], [10, 0], [20, 0]])
        self.assertEqual(kinds, [0, 1])
        self.assertEqual(ids, [10, 20])
        np.testing.assert_array_equal(endpoint({"alongOfficial": 15}, pts, [0, 10, 20], self.project), [15, 0])
        with self.assertRaisesRegex(ValueError, "outside"):
            endpoint({"alongOfficial": 21}, pts, [0, 10, 20], self.project)

    def test_branch_requires_explicit_manifest(self):
        branch = way(30, [2, 4], [(10, 0), (10, 10)])
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            chain_reference([self.a, self.b, branch], self.cfg, self.project)
        pts, _, _ = chain_reference([self.a, self.b, branch], {**self.cfg, "wayIds": [10, 20]}, self.project)
        self.assertEqual(len(pts), 3)

    def test_xy_contact_without_shared_node_is_not_connectivity(self):
        self.b["nodes"] = [3, 9]
        with self.assertRaisesRegex(ValueError, "disconnected"):
            chain_reference([self.a, self.b], self.cfg, self.project)

    def test_disconnected_cycle_is_not_silently_ignored(self):
        cycle = [way(30, [4, 5], [(30, 0), (40, 0)]),
                 way(40, [5, 6], [(40, 0), (40, 10)]),
                 way(50, [6, 4], [(40, 10), (30, 0)])]
        with self.assertRaisesRegex(ValueError, "disconnected"):
            chain_reference([self.a, self.b, *cycle], self.cfg, self.project)

    def test_missing_manifest_way_and_inconsistent_shared_coordinate(self):
        with self.assertRaisesRegex(ValueError, "missing"):
            chain_reference([self.a], {**self.cfg, "wayIds": [10, 20]}, self.project)
        self.b["geometry"][-1]["lon"] = 10.1
        with self.assertRaisesRegex(ValueError, "inconsistent"):
            chain_reference([self.a, self.b], self.cfg, self.project)

    def test_absent_reference_requires_fixed_endpoints(self):
        empty = np.empty((0, 2))
        np.testing.assert_array_equal(endpoint({"latlon": [5, 7]}, empty, [0], self.project), [7, 5])
        with self.assertRaisesRegex(ValueError, "outside"):
            endpoint({"alongOfficial": 0}, empty, [0], self.project)

    def test_baseline_preserves_branches_and_other_types_without_mutation(self):
        data = {"elements": [self.a, self.b, {"type": "node", "id": 10}]}
        filtered = baseline(data, [10])
        self.assertEqual(filtered["elements"], [self.b, {"type": "node", "id": 10}])
        self.assertEqual(len(data["elements"]), 3)
        self.assertIs(baseline(data, []), data)


if __name__ == "__main__":
    unittest.main()
