# Revue d'architecture de l'etape 9

Date : 3 aout 2026  
Perimetre : pilotage administrateur, lectures Firestore et regressions V1,
sans implementation de l'etape 10 ni deploiement cloud.

## Verdict

**GO pour l'etape 10.**

Les defauts de portee et de validation trouves pendant la revue ont ete
corriges dans les petits prototypes. Les requetes du pilotage sont maintenant
limitees a la zone choisie, les plafonds ne peuvent plus tronquer silencieusement
un resultat et une projection `zoneStats` invalide ne bloque plus les donnees
valides de la zone.

## Constats et corrections

### 1. Prechargement inter-zones - corrige

Le tableau lancait une requete de projection et de batiments pour chaque zone
au montage. Chaque requete etait individuellement bornee, mais leur union
revenait a parcourir tous les batiments du workspace. Le montage ne lit
desormais que zones et statuts ; le detail Firestore est charge a la demande
pour le seul `zoneId` selectionne.

### 2. Resultats tronques presentes comme complets - corrige

Un `limit(250)` ne permettait pas de distinguer une zone de 250 batiments d'une
zone plus grande. Toutes les lectures bornees demandent maintenant une
sentinelle supplementaire. Au-dela du budget, elles levent
`ReadLimitExceededError` et l'interface n'affiche pas un total partiel.

### 3. Projections invalides ou incoherentes - corrige

Les codecs refusent les types incorrects, les compteurs negatifs et une somme
`countsByStatus` superieure a `doorCount`. Le tableau isole cette erreur de la
lecture des batiments, affiche les compteurs indisponibles et conserve la liste
de zone. Le pourcentage est en plus borne entre 0 et 100.

### 4. Documents invalides masques par le tri Firestore - corrige

Les requetes de configuration avec `orderBy` excluaient implicitement les
documents sans champ de tri. Zones et statuts sont maintenant lus sous plafond,
valides par codec, puis tries localement. Un statut sans `order` est donc
rejete explicitement.

### 5. Frontieres de codec permissives - corrige

Les conversions `String(...)` et `Number(...)` acceptaient des valeurs de type
incorrect. Les codecs exigent maintenant les types Firestore attendus avant de
construire le domaine, notamment pour batiments, portes, zones, statuts,
visites et membres.

## Securite et confidentialite

- `/admin` reste derriere la garde `role="admin"` ; un membre terrain actif
  obtient `Acces reserve` dans la preuve navigateur.
- Les regles Firestore V1 autorisent les lectures du workspace aux membres
  actifs, conformement a la matrice existante. La garde admin protege donc le
  parcours de pilotage, pas un secret de donnees impose par les regles.
- Le tableau ne lit ni notes ni historique de passages. Il expose uniquement
  libelles de zones, affectation, adresses de batiments, revisions de structure
  et compteurs projetes deja accessibles aux membres actifs.
- `zoneStats` reste en lecture seule client et n'est jamais une source de
  verite pour une mutation metier.

## Requetes et index

- Configuration : collection bornee a 250 + sentinelle, tri local.
- Batiments : filtre simple `zoneId == zone selectionnee`, 250 + sentinelle.
- Portes et visites : filtre simple par batiment ou porte, avec sentinelle.
- Viewport : plages geohash avec `orderBy('geohash')`, dedoublonnage par ID et
  filtre geographique exact.
- Aucun filtre compose ni combinaison filtre + tri n'est utilisee ; aucun index
  composite Firestore n'est donc requis par ces requetes.

## Preuves rejouees

| Commande | Resultat |
|---|---|
| `npm run lint` | Passe. |
| `npm run test:run` | 44 tests dans 13 fichiers passent. |
| `npm run test:emulator` | 43 tests dans 6 fichiers passent. |
| `npm run test:e2e:emulator` | 3 parcours passent, dont role admin, zone valide et projection invalide isolee. |
| `npm run test:e2e` | 4 parcours passent. PMTiles : 272 entites, 268 couleurs significatives sur 892 707 pixels. |
| `npm run verify:build` | Passe ; MapLibre reste dans un chunk differe. |
| `npm audit --omit=dev` | 0 vulnerabilite de production. |

Les regressions couvrent toujours Auth, regles Firestore, batch atomique porte
+ passage, UUID et conflits a deux clients, IndexedDB par UID, purge a la
deconnexion, reprise hors ligne, rendu PMTiles par pixels et budgets geohash.

## Risques residuels acceptes

- Les plafonds echouent maintenant proprement, mais pagination, curseurs et
  mesures de cout sur grands jeux appartiennent a l'etape 10.
- `zoneStats` peut rester obsolete : son horodatage est visible et sa
  reconstruction n'est pas faite par le client.
- La carte terrain conserve encore les depots de demonstration pour ses
  lectures. Son branchement de lecture temps reel reste hors de cette revue.
- La fermeture Auth cloud stricte et la preuve Android physique restent les
  dettes privees deja acceptees ; aucun deploiement n'a ete effectue.

## Condition de suite

L'etape 10 peut commencer sur consigne explicite. Elle devra mesurer les
budgets, ajouter la pagination necessaire et prouver l'absence de chargement
global sans introduire statistiques avancees, export, durcissement final ou
deploiement cloud.
