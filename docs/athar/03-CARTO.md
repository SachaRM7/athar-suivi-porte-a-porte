# Athar — chaîne cartographique

## Principe

Deux sources, deux rôles distincts.

- **BD TOPO (IGN)** — fournit les **emprises à dessiner** et les **attributs à filtrer et pré-remplir**
  (usage, nombre d'étages, nombre de logements). Licence ouverte Etalab 2.0.
- **RNB (Référentiel National des Bâtiments)** — fournit l'**identifiant stable** (ID-RNB) qui sert de clé
  en base. Sa géométrie sert à identifier, pas à dessiner : elle n'est pas une emprise de référence.
  Consultation libre et anonyme, tuiles vectorielles utilisables dans MapLibre, exports national et
  départementaux sur data.gouv.fr.

Le rapprochement se fait **une fois, hors ligne**, à la préparation du tuileset. L'app ne fait aucun appel
d'API cartographique au runtime.

## Filtrage résidentiel

La BD TOPO porte sur chaque bâtiment un attribut d'usage dont les valeurs sont :
`Agricole`, `Annexe`, `Commercial et services`, `Indifférencié`, `Industriel`, `Religieux`,
`Résidentiel`, `Sportif`, ou sans valeur.

**Filtrer par exclusion, pas par inclusion.** La catégorie `Indifférencié` contient beaucoup d'habitat mal
qualifié ; une liste blanche sur `Résidentiel` ferait disparaître des immeubles réels. On garde donc
`Résidentiel` + `Indifférencié` + sans valeur, et on écarte :

- usage_1 ∈ {`Annexe`, `Agricole`, `Industriel`, `Commercial et services`, `Sportif`, `Religieux`}
- construction légère = vrai
- emprise au sol < 40 m²

Un faux positif se règle d'un geste sur le terrain ; un immeuble manquant ne se voit jamais.

## Pré-remplissage de la structure

Les attributs `nombre_d_etages` et `nombre_de_logements` viennent des fichiers fonciers MAJIC de la DGFiP,
anonymisés par le Cerema. Le nombre d'étages est calculé comme `max(dnbniv, dniv+1)`.

**Ils sont souvent absents** : non renseignés sur les bâtiments d'usage `Annexe`, sur les constructions
légères, et sur ceux qui n'ont pas pu être appariés au cadastre.

Conséquence pour l'interface : quand les deux valeurs existent, le dialogue de structure s'ouvre pré-rempli
avec la mention « suggestion d'après le cadastre — à confirmer ». Quand elles manquent, il s'ouvre sur les
valeurs par défaut. Ne jamais présenter ces valeurs comme certaines, ne jamais créer les portes sans
confirmation humaine.

## Pipeline

> ⚠️ **Vérifier les noms de champs réels** dans le fichier téléchargé avant d'écrire la requête.
> La nomenclature diffère selon le format de livraison (GPKG / Shapefile) et la version de la BD TOPO.
> Étape obligatoire : `ogrinfo -so` sur la couche bâtiment, et consigner les noms observés dans ce fichier.

```bash
# 1. Récupérer la BD TOPO Haute-Garonne (31) depuis geoservices.ign.fr, couche bâtiment.

# 2. Inspecter le schéma AVANT tout traitement
ogrinfo -so BDTOPO.gpkg batiment

# 3. Filtrer + reprojeter en WGS84 (adapter les noms de champs à l'étape 2)
ogr2ogr -f GeoJSONSeq batiments_filtres.geojsonl BDTOPO.gpkg batiment \
  -t_srs EPSG:4326 \
  -where "usage_1 NOT IN ('Annexe','Agricole','Industriel','Commercial et services','Sportif','Religieux') \
          AND (construction_legere IS NULL OR construction_legere = 'false') \
          AND ST_Area(ST_Transform(geom,2154)) >= 40" \
  -select "cleabs,usage_1,nombre_d_etages,nombre_de_logements,hauteur" \
  -dialect SQLITE

# 4. Rapprochement RNB : jointure spatiale sur l'export départemental 31 du RNB
#    (data.gouv.fr → « Référentiel National des Bâtiments », fichier par département).
#    Règle : intersection de plus grande surface. Une emprise BD TOPO reçoit l'ID-RNB
#    du bâtiment RNB dont la géométrie la recouvre le plus.
#    Écrire ce script en Python (geopandas) : scripts/carto/join_rnb.py

# 5. Générer le tuileset
tippecanoe -o public/tiles/batiments-31.pmtiles \
  --minimum-zoom=14 --maximum-zoom=16 \
  --drop-densest-as-needed \
  --layer=batiments \
  batiments_avec_rnb.geojsonl
```

Contrainte à respecter : **zoom minimal 16** pour l'affichage individuel des bâtiments. Ce n'est pas gênant,
le porte-à-porte se fait de toute façon à l'échelle de la rue. En dessous de 16, on n'affiche que le polygone
de zone et sa progression agrégée.

Le tuileset est un artefact de build, régénéré ponctuellement, versionné hors du dépôt Git (trop volumineux).
Documenter la procédure dans `scripts/carto/README.md`.

## Couches MapLibre

Ordre d'empilement, du bas vers le haut :

1. `fond` — fond clair (tuiles vectorielles standard, style clair).
2. `zone-fill` / `zone-line` — polygone de la zone active, remplissage `--brand` à 4 %, contour pointillé.
3. `batiments-hors-zone` — emprises hors polygone, fill `--foot-out`, sans contour, **non cliquables**.
4. `batiments-todo` — dans la zone, sans document Firestore : fill `--foot-todo`, contour `--foot-todo-line` 1.3px.
5. `batiments-suivis` — dans la zone, avec document : fill couleur de statut à 55 %, contour plein 1.3px.
   La correspondance se fait par `feature-state` alimenté depuis Firestore (clé = ID-RNB).
6. `batiments-soeurs` — contour rose `--st-sisters` 1.6px, décalé de 2.5px, sur les bâtiments marqués.
7. `position` — halo safran 20px à 20 % + point 9px bordé de blanc 3.5px.

## Interaction

**Appui sur une emprise** → ouvre directement la vue bâtiment (coupe verticale). Pas de confirmation :
l'appui sélectionne un bâtiment qui existe déjà, il ne crée rien. Si aucun document Firestore n'existe pour
cet ID-RNB, on affiche l'état vide « Bâtiment non décrit ».

**Appui dans le vide** → ne fait rien. Aucune création accidentelle possible.

**Mode pose manuelle** — accessible depuis « Ajouter un bâtiment » en mode Édition. Sert de rattrapage quand
le référentiel est en retard (quartiers récents) ou faux. Curseur en croix, bandeau de consigne flottant,
`map.on('click')` récupère les coordonnées, crée un bâtiment `source: 'local'` et bascule sur l'état vide.

## Ce qu'on ne fait pas

**Pas de géocodage d'adresse pour placer un bâtiment.** La BAN géocode à l'adresse postale, pas au bâtiment :
plusieurs bâtiments sous un même numéro, voies non nommées, impasses absentes. Le point obtenu serait à
corriger à la main une fois sur deux. L'adresse est une **étiquette** attachée au bâtiment, jamais sa clé
d'identification — ce qui règle au passage le cas de l'impasse sans nom, dont les bâtiments existent quand même
dans le référentiel.
