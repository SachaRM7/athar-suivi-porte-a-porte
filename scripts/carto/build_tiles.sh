#!/usr/bin/env bash
# Génère une archive PMTiles valide à partir du résultat de join_rnb.py.
set -euo pipefail

input="${1:-data/carto-work/batiments_avec_rnb.geojsonl}"
output="${2:-public/tiles/batiments-31.pmtiles}"

command -v tippecanoe >/dev/null || { echo "tippecanoe est requis." >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 est requis." >&2; exit 1; }
pmtiles_bin="$(command -v pmtiles || true)"
if [[ -z "$pmtiles_bin" && -x "$HOME/.local/bin/pmtiles" ]]; then
  pmtiles_bin="$HOME/.local/bin/pmtiles"
fi
[[ -n "$pmtiles_bin" ]] || { echo "pmtiles est requis (voir scripts/carto/README.md)." >&2; exit 1; }

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
mkdir -p "$(dirname "$output")"

# Tippecanoe de cette installation écrit un conteneur MBTiles ; l'extension
# doit donc rester .mbtiles jusqu'à la conversion explicite par pmtiles.
python3 scripts/carto/prepare_tile_features.py \
  --input "$input" \
  --output "$workdir/batiments-pour-tuiles.geojsonl"

tippecanoe \
  -o "$workdir/batiments-31.mbtiles" \
  --minimum-zoom=16 \
  --maximum-zoom=16 \
  --drop-densest-as-needed \
  --layer=batiments \
  --use-attribute-for-id=tile_id \
  "$workdir/batiments-pour-tuiles.geojsonl"

"$pmtiles_bin" convert "$workdir/batiments-31.mbtiles" "$workdir/batiments-31.pmtiles"
"$pmtiles_bin" verify "$workdir/batiments-31.pmtiles"
mv -f "$workdir/batiments-31.pmtiles" "$output"

echo "PMTiles valide : $output"
