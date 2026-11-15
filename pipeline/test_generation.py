"""Standalone writers may only touch one verified coherent pack generation."""
import json
import tempfile
import unittest
from pathlib import Path

import generation

SCENARIO = {"id": "x", "requireComplete": True}
INPUTS = {"osm_x_lines.json": "a" * 64}


class GenerationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.out = Path(self.directory.name)
        for name in ("height.i16.gz", "vector.bin.gz", "meta.json"):
            (self.out / name).write_bytes(name.encode())
        generation.publish(self.out, SCENARIO, INPUTS)

    def tearDown(self):
        self.directory.cleanup()

    def test_coherent_generation_verifies(self):
        self.assertEqual(generation.verify(self.out, SCENARIO, INPUTS)["inputs"], INPUTS)

    def test_incomplete_or_mixed_packs_are_never_recertified(self):
        (self.out / "ready.json").unlink()  # e.g. a failed full build: terrain may be absent
        with self.assertRaisesRegex(RuntimeError, "not a ready pack"):
            generation.verify(self.out, SCENARIO, INPUTS)
        generation.publish(self.out, SCENARIO, INPUTS)
        (self.out / "vector.bin.gz").write_bytes(b"newer generation")
        with self.assertRaisesRegex(RuntimeError, "mixed generation"):
            generation.verify(self.out, SCENARIO, INPUTS)
        generation.publish(self.out, SCENARIO, INPUTS)
        (self.out / "height.i16.gz").unlink()
        with self.assertRaisesRegex(RuntimeError, "mixed generation"):
            generation.verify(self.out, SCENARIO, INPUTS)

    def test_changed_config_or_inputs_require_full_build(self):
        with self.assertRaisesRegex(RuntimeError, "config"):
            generation.verify(self.out, {**SCENARIO, "baselineExcludeWayIds": [1]}, INPUTS)
        with self.assertRaisesRegex(RuntimeError, "inputs"):
            generation.verify(self.out, SCENARIO, {"osm_x_lines.json": "b" * 64})
        (self.out / "ready.json").write_text(json.dumps({"id": "other", "ready": True}))
        with self.assertRaisesRegex(RuntimeError, "not a ready pack"):
            generation.verify(self.out, SCENARIO, INPUTS)


if __name__ == "__main__":
    unittest.main()
