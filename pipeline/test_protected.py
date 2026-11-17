"""Protected-area sidecar: clipping, simplification and the AOPK feature mapping, independent of network services."""
import json
import tempfile
import unittest
from pathlib import Path

import build_protected as bp


class ProtectedTests(unittest.TestCase):
    def test_clip_to_the_play_area(self):
        # a square sticking out of the 100 × 100 area on the east side
        ring = [(50, 20), (150, 20), (150, 80), (50, 80), (50, 20)]
        out = bp.clip(ring, 100, 100)
        self.assertEqual(sorted(set(out)), [(50, 20), (50, 80), (100, 20), (100, 80)])
        self.assertAlmostEqual(bp.area(out), 50 * 60)
        self.assertEqual(bp.clip([(200, 0), (300, 0), (300, 50)], 100, 100), [])

    def test_simplify_keeps_corners_drops_collinear(self):
        ring = [(0, 0), (5, 0.2), (10, 0), (10, 10), (0, 10), (0, 0)]
        self.assertEqual(bp.simplify(ring), [(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)])

    def test_feature_mapping(self):
        self.assertIsNone(bp.site(0, {"KAT": "CHKO", "NAZEV": "Broumovsko"}))  # the area comes zone by zone
        self.assertEqual(bp.site(0, {"KAT": "OP", "NAZEV": "Krkonošský národní park"}),
                         {"kind": "OP", "of": "NP", "name": "Krkonošský národní park", "declared": True})
        self.assertEqual(bp.site(1, {"KAT": "CHKO", "NAZEV": "Broumovsko", "ZONA": "III"}),
                         {"kind": "CHKO", "zone": "III", "name": "Broumovsko"})
        self.assertEqual(bp.site(2, {"KAT": "PP", "NAZEV": "Pod skálou", "KOD": 1234}),
                         {"kind": "PP", "name": "Pod skálou", "code": "1234"})
        self.assertEqual(bp.site(3, {"KAT": "OP", "NAZEV": "Pod skálou", "KAT_ZCHU": "PP", "OP_TYP": "ZAK"})["declared"], False)
        self.assertEqual(bp.site(6, {"KAT": "EVL", "NAZEV": "Hřebečovský hřbet", "SITECODE": "CZ0530020"})["code"], "CZ0530020")

    def test_sites_local_metres_and_holes(self):
        scenario = {"id": "t", "bbox5514": [-1000, -2000, -900, -1900]}
        with tempfile.TemporaryDirectory() as tmp:
            old = bp.CACHE
            bp.CACHE = Path(tmp)
            try:
                (Path(tmp) / "protected").mkdir()
                outer = [[-990, -1990], [-910, -1990], [-910, -1910], [-990, -1910], [-990, -1990]]
                hole = [[-960, -1960], [-940, -1960], [-940, -1940], [-960, -1940], [-960, -1960]]
                for layer in bp_layers():
                    feats = [{"attributes": {"KAT": "PP", "NAZEV": "X", "KOD": 1}, "geometry": {"rings": [outer, hole]}}] if layer == 2 else []
                    (Path(tmp) / "protected" / f"raw-t-L{layer}.json").write_text(json.dumps({"features": feats}))
                out = bp.sites(scenario)
            finally:
                bp.CACHE = old
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["kind"], "PP")
        self.assertEqual(len(out[0]["rings"]), 2)
        self.assertEqual(out[0]["rings"][0][:2], [10.0, 10.0])


def bp_layers():
    return (0, 1, 2, 3, 6, 7)


if __name__ == "__main__":
    unittest.main()
