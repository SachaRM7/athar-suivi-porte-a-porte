#!/usr/bin/env python3
"""Ajoute un identifiant numérique stable, requis par le format MVT."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

MAX_SAFE_INTEGER = (1 << 53) - 1
TILE_PROPERTIES = (
    "rnb_id",
    "cleabs",
    "usage_1",
    "nombre_d_etages",
    "nombre_de_logements",
    "hauteur",
)


def tile_id_for(rnb_id: str) -> int:
    """Produit un entier JavaScript exact et stable à partir de l'ID-RNB."""
    digest = hashlib.blake2b(rnb_id.encode("utf-8"), digest_size=8).digest()
    return max(1, int.from_bytes(digest, "big") & MAX_SAFE_INTEGER)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    seen: dict[int, str] = {}
    count = 0
    with args.input.open(encoding="utf-8") as source, args.output.open("w", encoding="utf-8") as target:
        for line in source:
            feature = json.loads(line)
            source_properties = feature.setdefault("properties", {})
            properties = {key: source_properties[key] for key in TILE_PROPERTIES if key in source_properties}
            rnb_id = properties.get("rnb_id")
            if not isinstance(rnb_id, str) or not rnb_id:
                raise ValueError(f"Emprise sans rnb_id à la ligne {count + 1}")
            tile_id = tile_id_for(rnb_id)
            previous = seen.setdefault(tile_id, rnb_id)
            if previous != rnb_id:
                raise ValueError(f"Collision d'identifiant entre {previous} et {rnb_id}")
            properties["tile_id"] = tile_id
            feature["properties"] = properties
            target.write(json.dumps(feature, ensure_ascii=False, separators=(",", ":")) + "\n")
            count += 1
    print(f"{count} emprises préparées avec un identifiant MVT numérique.")


if __name__ == "__main__":
    main()
