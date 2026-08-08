from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from prepare_tile_features import TILE_PROPERTIES, tile_id_for
from validate_pipeline import parse_zone

ROOT = Path(__file__).resolve().parents[2]


class CartographyPipelineTest(unittest.TestCase):
    def test_tile_id_is_stable_and_javascript_safe(self) -> None:
        first = tile_id_for("TF6NBN3WVSJT")
        self.assertEqual(first, tile_id_for("TF6NBN3WVSJT"))
        self.assertGreater(first, 0)
        self.assertLessEqual(first, (1 << 53) - 1)

    def test_tile_preparation_removes_unpublished_properties(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory, "source.geojsonl")
            target = Path(directory, "target.geojsonl")
            feature = {
                "type": "Feature",
                "properties": {
                    "rnb_id": "TF6NBN3WVSJT",
                    "cleabs": "BATIMENT0000000000000001",
                    "usage_1": "Résidentiel",
                    "private_debug_field": "à supprimer",
                },
                "geometry": {"type": "Polygon", "coordinates": []},
            }
            source.write_text(json.dumps(feature) + "\n", encoding="utf-8")
            subprocess.run(
                [sys.executable, str(ROOT / "scripts/carto/prepare_tile_features.py"), "--input", str(source), "--output", str(target)],
                check=True,
                capture_output=True,
                text=True,
            )
            properties = json.loads(target.read_text(encoding="utf-8"))["properties"]
            self.assertNotIn("private_debug_field", properties)
            self.assertEqual(set(properties) - {"tile_id"}, set(TILE_PROPERTIES) & set(feature["properties"]))

    def test_zone_parser_rejects_inverted_bounds(self) -> None:
        zone = parse_zone("carmes=1.4418,43.6039,1.4518,43.6089")
        self.assertTrue(zone.contains(1.4454, 43.6058))
        with self.assertRaises(Exception):
            parse_zone("carmes=2,44,1,43")


if __name__ == "__main__":
    unittest.main()
