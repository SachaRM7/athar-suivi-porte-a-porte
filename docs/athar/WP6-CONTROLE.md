# WP6 — contrôle de la chaîne cartographique

Source contrôlée : `data/carto-work/batiments_avec_rnb.geojsonl`.

## Contrôles globaux

- Emprises avec ID-RNB : **543,436 / 543,436**.
- ID-RNB invalides : **0**.
- Usages exclus encore présents : **0**.
- Constructions légères encore présentes : **0**.
- Couverture de la zone `carmes` : **652 emprises**.
- Archive PMTiles : **43,197,509 octets**, vérification réussie.
- Couche MVT : **543,436 emprises**, zoom **16–16**, champs `cleabs, hauteur, nombre_d_etages, nombre_de_logements, rnb_id, usage_1`.
- Bornes : `0.380019,42.700167,2.109365,43.966458`.

## Échantillon déterministe de 20 emprises dans les zones utilisées

| ID-RNB | Clé BD TOPO | Nature | Usage 1 / 2 | Emprise | Étages | Logements | Centre WGS84 | Verdict |
|---|---|---|---|---:|---:|---:|---|---|
| TF6NBN3WVSJT | BATIMENT0000000347907591 | Indifférenciée | Résidentiel / sans valeur | 58 m² | 2.0 | 4.0 | 43.608124, 1.449792 | Conforme |
| H8P2YFB8GRTS | BATIMENT0000000347907537 | Indifférenciée | Résidentiel / Annexe | 985 m² | 6.0 | 51.0 | 43.608363, 1.449004 | Conforme |
| A1GATQ7RWJD3 | BATIMENT0000000347907445 | Indifférenciée | Résidentiel / Annexe | 163 m² | 2.0 | 3.0 | 43.608736, 1.448789 | Conforme |
| KXFFFHEXXJ4Z | BATIMENT0000000347893568 | Indifférenciée | Résidentiel / Commercial et services | 71 m² | 5.0 | 4.0 | 43.606496, 1.444906 | Conforme |
| E5WXSS1AT6S3 | BATIMENT0000000347893636 | Indifférenciée | Résidentiel / Commercial et services | 146 m² | 5.0 | 12.0 | 43.606427, 1.447598 | Conforme |
| WTTCDFH53JTQ | BATIMENT0000000347893726 | Indifférenciée | Indifférencié / sans valeur | 802 m² | — | — | 43.605070, 1.451416 | Conforme |
| WFKP82YN2SAF | BATIMENT0000000347907441 | Indifférenciée | Résidentiel / sans valeur | 125 m² | 2.0 | 1.0 | 43.608680, 1.443272 | Conforme |
| 1NXADCJXW411 | BATIMENT0000000347894299 | Indifférenciée | Indifférencié / sans valeur | 318 m² | — | — | 43.608072, 1.445187 | Conforme |
| BGMMZMA6FW85 | BATIMENT0000000347893517 | Indifférenciée | Résidentiel / Commercial et services | 59 m² | 5.0 | 0.0 | 43.605729, 1.442287 | Conforme |
| 6DS19WKN17WY | BATIMENT0000000347893549 | Indifférenciée | Indifférencié / sans valeur | 175 m² | — | — | 43.605837, 1.444957 | Conforme |
| D3Q1YGWD6WAQ | BATIMENT0000000347907437 | Indifférenciée | Résidentiel / Commercial et services | 2306 m² | 4.0 | 34.0 | 43.608509, 1.448333 | Conforme |
| 7MNG3Q2KSW9A | BATIMENT0000000347893996 | Indifférenciée | Résidentiel / Commercial et services | 194 m² | 5.0 | 9.0 | 43.607076, 1.448983 | Conforme |
| 6EW4JPH6C987 | BATIMENT0000000347907860 | Indifférenciée | Résidentiel / Commercial et services | 110 m² | 3.0 | 2.0 | 43.608843, 1.448106 | Conforme |
| 2H48SEPRX32Z | BATIMENT0000000347910819 | Indifférenciée | Indifférencié / sans valeur | 65 m² | — | — | 43.607996, 1.445351 | Conforme |
| 33YXAXDZN6XR | BATIMENT0000000347907861 | Indifférenciée | Résidentiel / Annexe | 109 m² | 3.0 | 2.0 | 43.608858, 1.449342 | Conforme |
| XFYR8YF3PXVP | BATIMENT0000000347907458 | Indifférenciée | Indifférencié / sans valeur | 669 m² | — | — | 43.608656, 1.444447 | Conforme |
| 813BNQDFVJM3 | BATIMENT0000000347893588 | Indifférenciée | Résidentiel / Commercial et services | 316 m² | 5.0 | 10.0 | 43.605537, 1.444276 | Conforme |
| 2GTMT2SR6766 | BATIMENT0000000347893795 | Indifférenciée | Résidentiel / Annexe | 82 m² | 4.0 | 3.0 | 43.606325, 1.451123 | Conforme |
| ACESHQ2CDWBC | BATIMENT0000000347893334 | Indifférenciée | Indifférencié / sans valeur | 71 m² | — | — | 43.604106, 1.451470 | Conforme |
| G8NSJDJ8NVM2 | BATIMENT0000000347894302 | Indifférenciée | Indifférencié / sans valeur | 136 m² | — | — | 43.607388, 1.447313 | Conforme |

Relecture des 20 lignes : **13** bâtiments ont un usage principal résidentiel ; les autres sont indifférenciés. **7** bâtiments mixtes portent « Commercial et services » en usage secondaire : ils restent volontairement présents puisque leur usage principal est résidentiel. Aucune ligne n'est une annexe, un garage de moins de 40 m² ou un bâtiment principalement commercial.

Le verdict « Conforme » signifie : ID-RNB valide, usage non exclu et construction non légère. Le seuil de 40 m² est appliqué en Lambert-93 dans `join_rnb.py`, avant cette validation.

**Résultat : VALIDE.**
