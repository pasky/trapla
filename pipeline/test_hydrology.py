"""Run: uv run --with numpy --with pillow python -m unittest discover -s pipeline -p 'test_hydrology.py'."""
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from hydrology import (build, densify, fetch_waterways, flow_grid, resample_terrain,
                       sample_catchments, tagged_width)


class HydrologyTests(unittest.TestCase):
    def assert_conserved(self, flow, valid, cell):
        outlets = valid & (flow.downstream < 0)
        self.assertAlmostEqual(float(flow.catchment_km2[outlets].sum()),
                               int(valid.sum()) * cell * cell / 1e6)

    def test_plane_known_d8_area_and_border_propagation(self):
        h = np.repeat(np.arange(5, 0, -1)[:, None], 5, axis=1)
        flow = flow_grid(h, cell=100)
        np.testing.assert_allclose(flow.catchment_km2[:, 2], [0.01, 0.02, 0.03, 0.04, 0.05])
        np.testing.assert_array_equal(flow.downstream[:-1, 2], [7, 12, 17, 22])
        self.assertTrue(flow.truncated[:, 2].all())  # top-edge contribution travels south
        self.assert_conserved(flow, np.isfinite(h), 100)

    def test_depression_fills_to_spill_and_drains_without_cycles(self):
        h = np.array([[5, 5, 5, 5, 5], [5, 4, 3, 4, 5], [5, 3, 0, 3, 5],
                      [5, 4, 3, 4, 5], [5, 5, 2, 5, 5]], dtype=float)
        flow = flow_grid(h, cell=1)
        self.assertEqual(flow.filled[2, 2], 3)
        self.assertEqual(flow.downstream[2, 2], 17)
        self.assertAlmostEqual(flow.catchment_km2[4, 2], 25e-6)
        self.assert_conserved(flow, np.isfinite(h), 1)

    def test_flats_and_disconnected_nodata_islands_conserve_area(self):
        h = np.zeros((7, 7))
        h[:, 3] = np.nan
        flow = flow_grid(h)
        self.assert_conserved(flow, np.isfinite(h), 25)
        self.assertTrue(flow.truncated[:, 3].all())
        self.assertTrue((flow.downstream[:, 3] == -1).all())
        self.assertTrue((flow.catchment_km2[:, 3] == 0).all())
        empty = flow_grid(np.full((3, 3), np.nan))
        self.assertTrue(empty.truncated.all())
        self.assertEqual(empty.catchment_km2.sum(), 0)

    def test_nodata_uncertainty_propagates_but_interior_basin_is_complete(self):
        h = np.full((5, 5), 10.0)
        h[0, :] = h[-1, :] = h[:, 0] = h[:, -1] = 0
        h[2, 2], h[2, 3] = 9, 1
        complete = flow_grid(h)
        self.assertFalse(complete.truncated[2, 2])
        self.assertFalse(complete.truncated[2, 3])
        h[1, 1] = np.nan  # diagonal neighbor of contributing [2,2], not of [2,3]
        clipped = flow_grid(h)
        self.assertTrue(clipped.truncated[2, 2])
        self.assertTrue(clipped.truncated[2, 3])
        self.assert_conserved(clipped, np.isfinite(h), 25)

    def test_burn_attracts_flow_without_changing_source(self):
        h = np.tile(np.arange(5, 0, -1)[:, None], (1, 5)).astype(float)
        burned = np.zeros_like(h, dtype=bool)
        burned[:, 2] = True
        plain = flow_grid(h)
        channel = flow_grid(h, burned=burned)
        self.assertGreater(channel.catchment_km2[4, 2], plain.catchment_km2[4, 2])
        self.assertEqual(h[0, 2], 5)
        self.assertEqual(channel.filled[0, 2], 0)
        self.assert_conserved(channel, np.isfinite(h), 25)

    def test_resample_keeps_partial_polish_nodata_not_display_fill(self):
        h = np.arange(16, dtype=float).reshape(4, 4)
        h[0, 0] = np.nan
        result = resample_terrain(h, 5, 10)
        self.assertTrue(np.isnan(result[0, 0]))
        np.testing.assert_allclose(result[1], [10.5, 12.5])
        with self.assertRaises(ValueError):
            resample_terrain(h, 5, 11)

    def test_sampling_snaps_downstream_only_near_burn_and_marks_unknown(self):
        h = np.tile(np.arange(5, 0, -1)[:, None], (1, 5)).astype(float)
        h[2, 3] = np.nan
        burned = np.zeros_like(h, dtype=bool)
        burned[:, 2] = True
        flow = flow_grid(h, burned=burned)
        # Exact centre: next downstream centre is 25m away and carries more area.
        points = np.array([[62.5, 62.5], [87.5, 62.5], [-1, 62.5], [12.5, 62.5]])
        areas, flags = sample_catchments(points, flow, burned)
        self.assertAlmostEqual(areas[0], flow.catchment_km2[3, 2])
        self.assertEqual(areas[1:], [0, 0, 0])
        self.assertEqual(flags[1:], [True, True, True])
        self.assertTrue(flags[0])
        # A larger complete snap target must not erase the point-cell warning,
        # nor uncertainty on a smaller plausible burned candidate nearby.
        flow.truncated[:] = False
        flow.truncated[2, 1] = True
        self.assertEqual(sample_catchments(np.array([[49, 62.5]]), flow, burned)[1], [True])
        flow.truncated[:] = False
        flow.truncated[1, 2] = True
        self.assertEqual(sample_catchments(points[:1], flow, burned)[1], [True])

    def test_densification_and_width_parsing(self):
        points = densify(np.array([[0, 0], [0, 70], [30, 70]]))
        self.assertLessEqual(np.linalg.norm(np.diff(points, axis=0), axis=1).max(), 25)
        np.testing.assert_array_equal(points[[0, 3, -1]], [[0, 0], [0, 70], [30, 70]])
        for value, expected in [("2.5 m", 2.5), ("80 cm", 0.8), ("10 ft", 3.048),
                                ("1,5", 1.5), (None, None), ("3;5", None), ("-1", None)]:
            self.assertEqual(tagged_width(value), expected)

    def test_legacy_waterway_cache_supplemented_even_if_one_ditch_exists(self):
        stream = {"id": 1, "type": "way", "tags": {"waterway": "stream"}}
        ditch = {"id": 2, "type": "way", "tags": {"waterway": "ditch"}}
        drain = {"id": 3, "type": "way", "tags": {"waterway": "drain"}}
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            (cache / "osm_lines.json").write_text(json.dumps({"elements": [stream, ditch]}))
            calls = []
            def overpass(name, query):
                calls.append((name, query))
                return {"elements": [ditch, drain]}
            self.assertEqual(fetch_waterways(cache, overpass), [stream, ditch, drain])
            self.assertEqual(len(calls), 1)
            self.assertIn("ditch|drain", calls[0][1])
            (cache / "osm_lines.json").write_text('{"elements":[]}')
            fetch_waterways(cache, overpass)
            self.assertIn("river|stream|canal|ditch|drain", calls[-1][1])

    def test_pack_roundtrip_preserves_identity_and_parallel_point_arrays(self):
        h = np.tile(np.arange(25, 0, -1)[:, None], (1, 25)).astype(float)
        elements = [{"id": 123, "tags": {"waterway": "drain", "width": "80 cm"}},
                    {"id": 456, "tags": {"waterway": "stream"}}]
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            descriptor = build(h, 5, elements, lambda el: np.array([[62.5, 112.5], [62.5, -5]]),
                               out, log=lambda *args: None)
            packed = (out / descriptor["file"]).read_bytes()
            self.assertEqual(descriptor["sha256"], hashlib.sha256(packed).hexdigest())
            pack = json.loads(gzip.decompress(packed))
        first, second = pack["reaches"]
        self.assertEqual((first["id"], first["kind"], first["width"]), (123, "ditch", 0.8))
        self.assertEqual(second["id"], 456)
        self.assertIsNone(second["width"])
        for reach in pack["reaches"]:
            self.assertEqual(len(reach["points"]), len(reach["catchmentKm2"]))
            self.assertEqual(len(reach["points"]), len(reach["truncated"]))
            self.assertTrue(reach["truncated"][-1])
            self.assertEqual(reach["catchmentKm2"][-1], 0)
            self.assertGreater(max(reach["catchmentKm2"]), 0)


if __name__ == "__main__":
    unittest.main()
