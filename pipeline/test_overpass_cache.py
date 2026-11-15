"""Overpass cache identity and completeness: hits get the same checks as fetched responses."""
import datetime as dt
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import overpass_cache as oc

BOX = (50.0, 15.0, 50.1, 15.1)
QUERY = oc.canonical_query('way["highway"];', BOX)
OK = json.dumps({"osm3s": {"timestamp_osm_base": "2026-11-15T10:00:00Z"}, "elements": [{"type": "way", "id": 1}]}).encode()


class OverpassCacheTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "osm_x_lines.json"

    def tearDown(self):
        self.directory.cleanup()

    def test_cached_runtime_error_is_rejected_like_a_fetched_one(self):
        timed_out = json.dumps({"elements": [], "remark": "runtime error: Query timed out"}).encode()
        with self.assertRaisesRegex(RuntimeError, "timed out"):
            oc.store(self.path, timed_out, QUERY, "test")
        self.assertFalse(self.path.exists())
        # Even if such bytes were bound by an older/buggy writer, a hit is revalidated.
        self.path.write_bytes(timed_out)
        oc.binding_path(self.path).write_text(json.dumps({"version": oc.VERSION, "fingerprint": oc.fingerprint(QUERY),
                                                          "sha256": hashlib.sha256(timed_out).hexdigest()}))
        with self.assertRaisesRegex(RuntimeError, "timed out"):
            oc.load(self.path, QUERY)

    def test_hit_requires_same_query_bbox_and_bytes(self):
        oc.store(self.path, OK, QUERY, "test")
        self.assertEqual(oc.load(self.path, QUERY)["elements"][0]["id"], 1)
        other_box = oc.canonical_query('way["highway"];', (50.0, 15.0, 50.2, 15.1))
        self.assertIsNone(oc.load(self.path, other_box))
        # Unbound data is kept aside for inspection, never deleted or relabelled.
        self.assertFalse(self.path.exists())
        self.assertTrue(self.path.with_name(self.path.name + ".unbound~").exists())
        oc.store(self.path, OK, QUERY, "test")
        self.path.write_bytes(OK.replace(b'"id": 1', b'"id": 2'))
        self.assertIsNone(oc.load(self.path, QUERY))

    def test_unbound_legacy_cache_needs_its_exact_frozen_bytes(self):
        self.path.write_bytes(OK)
        self.assertEqual(len(oc.load(self.path, QUERY, frozen_sha256=hashlib.sha256(OK).hexdigest())["elements"]), 1)
        self.assertFalse(oc.binding_path(self.path).exists())  # frozen bytes are not rebound
        with self.assertRaisesRegex(RuntimeError, "frozen"):
            oc.load(self.path, QUERY, frozen_sha256="0" * 64)
        self.assertTrue(self.path.exists())

    def test_stale_mirror_snapshot_is_rejected_for_new_packs(self):
        now = dt.datetime(2026, 11, 15, tzinfo=dt.timezone.utc)
        oc.validate(json.loads(OK), max_age_days=30, now=now)
        stale = {"osm3s": {"timestamp_osm_base": "2026-07-24T11:04:51Z"}, "elements": []}
        with self.assertRaisesRegex(RuntimeError, "stale"):
            oc.validate(stale, max_age_days=30, now=now)


if __name__ == "__main__":
    unittest.main()
