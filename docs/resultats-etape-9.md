# Resultats de l'etape 9

Date : 3 aout 2026  
Perimetre : pilotage desktop administrateur et lectures Firestore bornees, sans
etape 10 ni deploiement cloud.

## Livraisons

- Route admin protegee : `/admin` est accessible aux seuls membres actifs de
  role `admin`. Un membre terrain recu par la meme garde obtient l'etat
  "Acces reserve".
- Tableau desktop : selection d'une zone, filtre de statut, taux de portes
  traitees, compteurs simples et liste des batiments de la zone.
- `zoneStats` est affiche comme une projection de lecture reparable. Aucune
  ecriture, correction ou decision metier ne depend de cette projection.
- `WorkspaceReadRepositories` separe les lectures de configuration, zone,
  batiment, porte et viewport des interfaces d'ecriture existantes.
- `createFirestoreWorkspaceReadRepositories` valide chaque document lu avec
  les codecs de domaine. Les statuts, batiments, portes, zones, visites et
  `zoneStats` malformes sont rejetes a la frontiere Firestore.

## Bornes de lecture

| Lecture | Borne appliquee |
|---|---|
| Configuration (zones, statuts, membres) | 250 documents |
| Batiments d'une zone | filtre `zoneId` et 250 documents |
| Portes d'un batiment | filtre `buildingId` et 250 documents |
| Visites d'une porte | filtre `doorId` et 100 documents |
| Batiments ou portes viewport | plages geohash, 120 documents par plage, dedoublonnage puis filtre geographique |

Le tableau ne lit aucun document `doors` pour afficher ses compteurs : il lit
seulement `zoneStats/{zoneId}`. Les listes de portes restent disponibles par
batiment ou viewport derriere le depot, jamais par une requete globale.

## Preuves ajoutees

- Test d'emulateur : lecture des zones, statuts, projection, batiments d'une
  zone et portes viewport depuis Firestore ; rejet explicite d'un `zoneStats`
  malforme.
- Playwright emulator : membre terrain refuse sur `/admin`; administrateur
  `sacha.admin` lit Carmes, ses compteurs et applique le filtre `unvisited`.
- Les trois parcours de synchronisation existants couvrent toujours conflit a
  deux clients, UUID, reprise hors ligne et purge deconnexion.

## Validations executees

| Commande | Resultat |
|---|---|
| `npm run lint` | Passe. |
| `npm run test:run` | 44 tests dans 13 fichiers passent. |
| `npm run test:emulator` | 40 tests dans 6 fichiers passent. |
| `npm run test:e2e` | 4 parcours passent ; PMTiles/pixels : 272 entites, 268 couleurs significatives sur 892 707 pixels. |
| `npm run test:e2e:emulator` | 3 parcours passent : conflit a deux clients, purge locale et pilotage admin. |
| `npm run verify:build` | Passe. `AdminDashboardPage` est un chunk differe de 8,32 ko minifie ; MapLibre reste differe. |
| `npm audit --omit=dev` | 0 vulnerabilite de production. |

## Limites conservees

- La carte et le parcours terrain conservent le depot de demonstration ; ils
  ne sont pas rebranches sur les lectures Firestore pendant cette etape.
- `zoneStats` peut etre obsolete ou absent. Le tableau le signale comme
  projection indisponible et ne tente pas de le reparer dans le client.
- La pagination au-dela des plafonds par zone, par batiment ou par plage
  geohash appartient a l'etape 10. Les plafonds evitent ici une lecture globale
  silencieuse, mais ne constituent pas encore une strategie de montee en charge.
- Aucun deploiement cloud, export, statistique avancee ou durcissement final
  n'a ete commence.

## Corrections de la revue

- Le tableau ne precharge plus les projections et batiments de toutes les
  zones. Il lit la configuration, puis uniquement `zoneStats/{zoneId}` et les
  batiments de la zone selectionnee.
- Chaque plafond est interroge avec une sentinelle `maximum + 1`. Un
  depassement leve `ReadLimitExceededError` au lieu de retourner une liste
  incomplete presentee comme exhaustive.
- Une projection absente ou invalide est isolee : les compteurs affichent leur
  indisponibilite, tandis que les batiments valides restent consultables.
- Les lectures de zones et statuts ne trient plus cote Firestore. Le tri local
  garantit qu'un document auquel il manque le champ de tri est lu puis rejete
  par le codec, au lieu d'etre silencieusement omis par `orderBy`.
- Les codecs refusent desormais les conversions implicites de chaines, nombres
  et booleens. Ils rejettent aussi une projection dont la somme des statuts
  depasse `doorCount`.
- Les requetes actuelles reposent uniquement sur un filtre simple ou un
  `orderBy` simple de geohash ; aucun index composite n'est necessaire a ce
  stade.

## Verdict de sortie

**GO pour l'etape 10.** La revue a ferme les lectures inter-zones, les
troncatures silencieuses et les faux positifs de validation. Le pilotage reste
protege par role et ne modifie ni le parcours terrain ni la synchronisation.
