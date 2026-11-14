"""Run: uv run --with numpy --with shapely python -m unittest discover -s pipeline -p 'test_*.py'."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import numpy as np
from geology import fetch_features, rasterize


def feature(oid, rings):
    return {"attributes": {"objectid": oid}, "geometry": {"rings": rings}}


class GeologyTests(unittest.TestCase):
    def test_keyset_pagination_and_offline_cache(self):
        requests = []

        def get(url):
            q = parse_qs(urlparse(url).query)
            requests.append(q)
            after = int(q["where"][0].split()[-1])
            return json.dumps({"features": [feature(10 if after == -1 else 25, [])],
                               "exceededTransferLimit": after == -1}).encode()

        with tempfile.TemporaryDirectory() as directory, patch("geology.time.sleep"):
            args = ("https://example.invalid/MapServer/2", "test", Path(directory), (0, 0, 100, 100))
            first = fetch_features(*args, get, lambda *a: None)
            second = fetch_features(*args, lambda _: self.fail("cache must be offline"), lambda *a: None)
        self.assertEqual(first, second)
        self.assertEqual([r["where"][0] for r in requests], ["objectid > -1", "objectid > 10"])
        self.assertTrue(all(r["geometry"][0] == "0,0,100,100" and r["inSR"] == ["5514"] for r in requests))

    def test_cell_centres_holes_islands_and_clipping(self):
        outer = [[-10, -10], [110, -10], [110, 110], [-10, 110], [-10, -10]]
        hole = [[20, 20], [80, 20], [80, 80], [20, 80], [20, 20]]
        island = [[30, 30], [45, 30], [45, 45], [30, 45], [30, 30]]
        # Ring order/orientation is deliberately noncanonical; parity must preserve the island.
        a = rasterize([feature(1, [hole, outer, island])], [3], (0, 0, 100, 100), 25)
        np.testing.assert_array_equal(a, [[3, 3, 3, 3], [3, 0, 0, 3], [3, 3, 0, 3], [3, 3, 3, 3]])


if __name__ == "__main__":
    unittest.main()
