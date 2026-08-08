#!/usr/bin/env python3
"""Associe chaque emprise filtrée au RNB recouvrant la plus grande surface."""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

import geopandas as gpd
from shapely import wkt


def rnb_geometries(csv_path: Path) -> gpd.GeoDataFrame:
    rows: list[dict[str, object]] = []
    with csv_path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle, delimiter=";"):
            shape = row.get("shape", "")
            if not shape:
                continue
            rows.append({"rnb_id": row["rnb_id"], "geometry": wkt.loads(shape.removeprefix("SRID=4326;"))})
    return gpd.GeoDataFrame(rows, crs="EPSG:4326")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--buildings", required=True, type=Path)
    parser.add_argument("--rnb", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    buildings = gpd.read_file(args.buildings).to_crs("EPSG:2154")
    buildings = buildings[buildings.geometry.area >= 40].copy()
    # La livraison IGN porte déjà parfois l'ID RNB. Il est prioritaire : la
    # jointure spatiale ne traite que les emprises non renseignées.
    source_ids = buildings.get("identifiants_rnb", "").fillna("").astype(str)
    buildings["rnb_id"] = source_ids.str.extract(r"([A-Z0-9]{12})", expand=False)
    missing = buildings["rnb_id"].isna()
    if missing.any():
        rnb = rnb_geometries(args.rnb).to_crs("EPSG:2154")
        candidates = gpd.sjoin(buildings.loc[missing, ["cleabs", "geometry"]], rnb[["rnb_id", "geometry"]], how="left", predicate="intersects")
        candidates["overlap"] = candidates.apply(lambda row: row.geometry.intersection(rnb.loc[row["index_right"], "geometry"]).area if row["index_right"] == row["index_right"] else 0, axis=1)
        best = candidates.sort_values("overlap", ascending=False).drop_duplicates("cleabs").set_index("cleabs")["rnb_id"]
        buildings.loc[missing, "rnb_id"] = buildings.loc[missing, "cleabs"].map(best)
    # Une emprise sans identifiant stable ne doit jamais sortir dans le tuileset.
    buildings = buildings[buildings["rnb_id"].notna()].copy()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    buildings.to_crs("EPSG:4326").to_file(args.output, driver="GeoJSONSeq")


if __name__ == "__main__":
    main()
