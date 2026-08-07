# Resultats de l'etape 10

Date : 3 aout 2026  
Perimetre : lecture paginee et mesuree, sans statistiques avancees, export,
durcissement final, etape 11 ni deploiement cloud.

## Livraisons

- `ReadPage`, `ReadRequest` et des curseurs opaques communs aux depots de
  lecture. Une page contient ses elements, le curseur suivant et ses metriques.
- Pagination Firestore par zone, batiment et porte, avec une taille par defaut
  de 50 et une borne stricte de 100 documents utiles par page.
- Pagination par plage geohash pour batiments et portes viewport. Chaque page
  ne lit qu'une plage ; elle filtre l'emprise exacte avant de rendre ses
  elements.
- `ReadAbortedError` et `AbortSignal` : un changement d'emprise de carte
  invalide la lecture precedente. Les resultats devenus obsoletes ne peuvent
  plus remplacer les marqueurs recents.
- Le pilotage admin affiche une seule page de 50 batiments, le nombre de
  documents lus et les commandes `Precedents` / `Suivants`.
- Les plages geohash qui se chevauchent sont fusionnees avant lecture. Cela
  supprime les doublons entre plages et conserve les faux positifs seulement
  comme candidats a filtrer par bbox.

## Index Firestore

Aucun index composite n'a ete ajoute. Les nouvelles requetes utilisent un
filtre d'egalite unique (`zoneId`, `buildingId` ou `doorId`) puis
`orderBy(documentId())`, ou `geohash` puis `documentId()` pour une plage. Elles
passent dans Firestore Emulator sans demande d'index. Ajouter un index avant
qu'une requete le necessite augmenterait seulement le cout d'ecriture et la
surface d'exploitation.

## Jeu de charge reproductible

`generateLoadWorkspace()` cree de facon deterministe :

- 300 batiments dans une zone Toulouse ;
- 180 portes dans un batiment cible ;
- 150 passages sur une porte cible ;
- des positions geohash reproductibles, statuts, membre, zone et projection
  valides.

Commande ciblee contre un emulateur deja lance :

```powershell
npm run test:load:emulator
```

La validation complete `npm run test:emulator` lance aussi cette preuve dans un
emulateur propre.

## Mesures observees

Mesures Firestore Emulator du 3 aout 2026. La latence est indicative d'un poste
local ; les nombres de documents et de plages sont les budgets significatifs.

| Parcours | Pages / plages | Documents lus | Resultats | Doublons | Faux positifs | Latence cumulee |
|---|---:|---:|---:|---:|---:|---:|
| 300 batiments d'une zone, pages de 50 | 6 pages | 305 | 300 | 0 | 0 | 346 ms |
| 180 portes d'un batiment, pages de 50 | 4 pages | 183 | 180 | 0 | 0 | 145 ms |
| 150 passages d'une porte, pages de 50 | 3 pages | 152 | 150 | 0 | 0 | 101 ms |
| Viewport charge, batiments | 23 plages/pages | 303 | 300 | 0 | 0 | 509 ms |
| Viewport charge, portes | 26 plages/pages | 485 | 479 | 0 | 0 | 535 ms |
| Toulouse generee, 10 000 portes | 20 plages | 812 | 504 | 0 | 308 | preuve geohash |

Rectificatif de la revue du 4 aout 2026 : ces mesures initiales ne contenaient
pas de taille de reponse et le jeu Firestore ne forcait aucun faux positif. La
revue a aussi trouve puis corrige un doublon possible entre sentinelle et page
suivante. Les mesures apres correction, avec tailles UTF-8 et faux positifs
Firestore reels, font foi dans `docs/revue-architecture-etape-10.md`.

La sentinelle `pageSize + 1` explique les lectures supplementaires sur les
pages intermediaires. Aucun parcours ne lit une collection globale.

## Preuves ajoutees

- Tests unitaires : generation deterministe, taille du jeu de charge,
  normalisation de plages geohash et annulation avant lecture.
- Tests emulator : curseurs de zone, batiment, porte et viewport ; unicite des
  IDs retournes ; budgets de lecture ; filtrage bbox ; Auth, Functions et
  regles existantes.
- Playwright emulator : un administrateur lit 50 des 51 batiments d'une zone,
  puis passe a la derniere page. Le membre terrain reste refuse sur `/admin`.
- Les regressions conservent le batch porte + passage, UUID, conflits, outbox
  par UID, purge, PMTiles offline, pixels et viewport geohash.

## Limites conservees

- La carte terrain utilise encore le depot de demonstration ; son annulation
  est prouvee par contrat et par composant, mais ses lectures Firestore temps
  reel restent hors V1 livree.
- Une page viewport peut etre vide si une plage ne contient que des faux
  positifs. Le curseur avance explicitement et le client ne presente pas cela
  comme une fin d'emprise.
- Le tri de pagination est stable par ID opaque pour ne pas imposer d'index
  composite. Un futur tri alphabetique ou chronologique devra justifier son
  index et son cout.
- `zoneStats` reste une projection reparable, sans ecriture client et sans
  role de source de verite.

## Verdict de sortie

**GO pour la revue d'architecture de l'etape 10.** Les lectures sont paginees,
bornees, mesurables et annulables sans regression des parcours terrain ou de
leurs garanties de synchronisation.
