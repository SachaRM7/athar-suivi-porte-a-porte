# Chaîne cartographique — WP6

Entrées (ignorées par Git) :

- `data/bdtopo_31/.../BDT_3-5_GPKG_LAMB93_D031-ED2026-06-15.gpkg` ;
- `data/RNB_31.csv.zip`.

## 1. Inspection obligatoire

```powershell
& 'C:\Program Files\QGIS 4.2.0\bin\ogrinfo.exe' -ro -so <fichier.gpkg> batiment
```

Les champs réellement observés sont consignés dans `docs/athar/03-CARTO.md`. Ne pas modifier les requêtes sans
répéter cette inspection sur une nouvelle livraison.

## 2. Préparation

`prepare.ps1` extrait le RNB et filtre les emprises BD TOPO non résidentielles. Il projette la sortie en WGS84,
en conservant `cleabs`, `identifiants_rnb`, `nombre_d_etages`, `nombre_de_logements` et `hauteur`.
Le seuil d'emprise de 40 m² est appliqué par `join_rnb.py` après reprojection en Lambert-93 : le pilote SQLite
livré avec certaines installations GDAL/QGIS ne charge pas `ST_Area`.

## 3. Rapprochement RNB

`join_rnb.py` doit faire l’intersection de plus grande surface entre les emprises filtrées et `shape` du RNB,
et produire un `rnb_id` pour chaque emprise. Il nécessite `geopandas` et `shapely`.

## 4. Tuiles

`tippecanoe` produit d'abord un conteneur **MBTiles**. Il faut ensuite le convertir avec l'outil officiel
`pmtiles` : renommer un fichier SQLite en `.pmtiles` ne le convertit pas. Installer l'outil une fois dans WSL :

```bash
mkdir -p "$HOME/.local/bin"
curl -L https://github.com/protomaps/go-pmtiles/releases/download/v1.31.2/go-pmtiles_1.31.2_Linux_x86_64.tar.gz \
  | tar -xz -C "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
```

Puis générer et vérifier l'archive valide :

```bash
bash scripts/carto/build_tiles.sh
```

Le script produit `public/tiles/batiments-31.pmtiles`, hors Git, avec un zoom d'affichage individuel minimal de
16, garde `rnb_id` dans les propriétés et lui dérive un identifiant MVT numérique stable (`tile_id`), puis lance
`pmtiles verify` avant de remplacer l'archive. Vérifier manuellement 20 emprises avant de publier : garages et
locaux commerciaux doivent être écartés.

## 5. Échantillon versionné

Le tuileset départemental pèse 72 Mo et reste hors de Git. Sans lui, la carte n'aurait aucune emprise en
développement ni en test. `scripts/carto/fixture_carmes.geojsonl` décrit sept emprises autour de la zone de
démonstration « Carmes » — une suivie, plusieurs détectées sans document, une hors zone — et se compile avec les
mêmes réglages que le tuileset réel :

```bash
bash scripts/carto/build_fixture_tiles.sh
```

La sortie `public/fixtures/batiments-carmes.pmtiles` (2 Ko) est versionnée. `MapPreview` (route
`/technical-map`) ne consomme qu'elle ; l'écran terrain essaie d'abord le tuileset départemental.
