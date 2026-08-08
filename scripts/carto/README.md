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

`join_rnb.py` fait l’intersection de plus grande surface entre les emprises filtrées et `shape` du RNB,
et produit un `rnb_id` pour chaque emprise. Installer son environnement hors du dépôt :

```powershell
python -m venv .athar-local/carto-venv
& .athar-local/carto-venv/Scripts/pip.exe install -r scripts/carto/requirements.txt
& .athar-local/carto-venv/Scripts/python.exe scripts/carto/join_rnb.py `
  --buildings data/carto-work/batiments_filtres.geojsonl `
  --rnb data/carto-work/RNB_31.csv `
  --output data/carto-work/batiments_avec_rnb.geojsonl
```

Les emprises de moins de 40 m² sont supprimées en Lambert-93. Les propriétés de sortie sont volontairement
réduites aux champs utiles à Athar ; `prepare_tile_features.py` applique une seconde liste blanche avant MVT.

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

## 5. Contrôle avant publication

Le contrôle parcourt toute la sortie, refuse les ID-RNB invalides, les usages exclus et les constructions
légères, vérifie que chaque zone demandée contient des emprises, puis produit un échantillon déterministe de 20
bâtiments à relire :

```powershell
python scripts/carto/validate_pipeline.py `
  --input data/carto-work/batiments_avec_rnb.geojsonl `
  --zone carmes=1.4418,43.6039,1.4518,43.6089 `
  --sample-size 20 `
  --pmtiles public/tiles/batiments-31.pmtiles `
  --pmtiles-command tools/pmtiles/pmtiles.exe `
  --report docs/athar/WP6-CONTROLE.md
```

Pour la livraison du 15 juin 2026 : **543 436** emprises jointes, PMTiles valide de **43 197 509 octets**,
bornes `(0.380019,42.700167)–(2.109365,43.966458)`, zoom 16. Le rapport versionné porte le contrôle des 20
emprises de la zone de démonstration.

## 6. Échantillon versionné

Le tuileset départemental pèse 43,2 Mo et reste hors de Git. Sans lui, la carte n'aurait aucune emprise en
développement ni en test. `scripts/carto/fixture_carmes.geojsonl` décrit sept emprises autour de la zone de
démonstration « Carmes » — une suivie, plusieurs détectées sans document, une hors zone — et se compile avec les
mêmes réglages que le tuileset réel :

```bash
bash scripts/carto/build_fixture_tiles.sh
```

La sortie `public/fixtures/batiments-carmes.pmtiles` (2 Ko) est versionnée. `MapPreview` (route
`/technical-map`) ne consomme qu'elle ; l'écran terrain essaie d'abord le tuileset départemental.
