#!/usr/bin/env bash
# Génère l'échantillon d'emprises versionné dans le dépôt.
#
# Le tuileset réel (public/tiles/batiments-31.pmtiles, 72 Mo) est hors Git : sans lui,
# la carte n'aurait aucune emprise à afficher en développement ni en test. Cet échantillon
# couvre la zone de démonstration « Carmes » avec les trois cas du lot WP7 :
# emprise suivie, emprise détectée sans document, emprise hors zone.
set -euo pipefail

input="${1:-scripts/carto/fixture_carmes.geojsonl}"
output="${2:-public/fixtures/batiments-carmes.pmtiles}"

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

python3 scripts/carto/prepare_tile_features.py \
  --input "$input" \
  --output "$workdir/fixture-pour-tuiles.geojsonl"

# Mêmes réglages que build_tiles.sh : l'échantillon doit se comporter comme le tuileset réel.
tippecanoe \
  -o "$workdir/batiments-carmes.mbtiles" \
  --minimum-zoom=16 \
  --maximum-zoom=16 \
  --drop-densest-as-needed \
  --layer=batiments \
  --use-attribute-for-id=tile_id \
  "$workdir/fixture-pour-tuiles.geojsonl"

"$pmtiles_bin" convert "$workdir/batiments-carmes.mbtiles" "$workdir/batiments-carmes.pmtiles"
"$pmtiles_bin" verify "$workdir/batiments-carmes.pmtiles"
mv -f "$workdir/batiments-carmes.pmtiles" "$output"

echo "Échantillon PMTiles valide : $output"
