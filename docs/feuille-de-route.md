# Feuille de route et modeles Codex

Cette feuille de route est volontairement decoupee en lots fermes. A la fin de
chaque lot, Codex met a jour `docs/etat-projet.md`, execute les validations du
lot, puis s'arrete. C'est le moment de changer de modele et d'ouvrir la consigne
du lot suivant.

Les niveaux de raisonnement indiques sont des plafonds de depart. On augmente
seulement face a un blocage reel.

| Etape | Livrable | Modele conseille | Validation de sortie |
|---:|---|---|---|
| 1 | Architecture V1 et risques | Sol, Medium | Documents valides et prochaine experience identifiee |
| 2 | Prototypes hors ligne, conflit, auth et logements superposes | Terra, Medium ; revue Sol, Medium | Les cinq preuves de l'architecture passent |
| 2B-A | Emulateurs Firebase, Auth privee et regles Firestore | Terra, Medium | Matrice de securite et flux Admin SDK testes localement |
| 2B-B | Outbox IndexedDB et classification des conflits | Terra, Medium | Rechargement, changement d'utilisateur et rejets serveur testes |
| 2B-C | Fond offline autorise et test geohash | Terra, Medium | Paquet Toulouse mesure, rendu offline et budget de lectures consignes |
| Revue 2B | Audit des sept conditions de levee | Sol, Medium | Verdict GO ou NO-GO explicite pour l'etape 3 |
| 3 | Socle React/TypeScript/PWA, qualite et emulateurs | Terra, Medium | Build, lint, tests et PWA locale fonctionnent |
| 4 | Modele Firestore, depots et donnees de demonstration | Terra, Medium | Tests de domaine et requetes viewport passent |
| 5 | Authentification, fonctions admin et regles Firestore | Sol, Medium ou High | Matrice d'autorisation testee dans les emulateurs |
| 6 | Carte, zones et rattachement des batiments | Terra, Medium | Dessin, edition, geohash et point-dans-polygone testes |
| 7 | Parcours mobile logements et passages | Terra, Medium | Action en un geste, tailles tactiles et vrai mobile verifies |
| 8 | Synchronisation et conflits de bout en bout | Sol, Medium ou High | Mode avion, reprise reseau et conflit testes sur deux clients |
| 9 | Pilotage desktop, filtres et compteurs | Terra, Medium | Vue par zone et filtres coherents avec les donnees |
| 10 | Performance et montee en charge | Terra, Medium ; audit Sol, Medium | Aucun chargement global, budget de lectures mesure |
| 11 | Durcissement et recette V1 | Luna pour cas repetitifs ; Sol pour audit final | Securite, accessibilite, PWA et parcours critiques valides |

## Regle de passation entre modeles

Chaque fin d'etape doit laisser :

- la liste exacte des fichiers modifies ;
- les commandes de validation et leur resultat ;
- les decisions prises et les compromis encore ouverts ;
- les anomalies connues ;
- une seule prochaine action clairement formulee ;
- un prompt de reprise pret a etre donne au modele suivant.

Une nouvelle etape ne doit pas melanger une refonte de l'etape precedente avec
son propre objectif. Si une preuve echoue, on reste dans le lot courant.

## Prochaine consigne : etape 2B-A

Modele : **Terra, raisonnement Medium**.

Prompt de reprise :

> Lis `README.md`, `docs/architecture-v1.md`, `docs/etat-projet.md` et
> `docs/revue-architecture-etape-2.md`. Realise uniquement l'etape 2B-A : rends
> Firebase Emulator Suite operationnelle pour Auth, Firestore et Functions,
> sans deploiement cloud. Implemente les regles minimales couvrant membres
> actifs, roles, auteur, champs autorises, passage immuable, revision et lot
> atomique porte + passage. Prouve aussi que la creation/suppression par un
> utilisateur final est desactivee et que la creation par Admin SDK fonctionne.
> Ajoute les tests d'emulateur, documente les commandes et resultats, mets a jour
> `docs/etat-projet.md`, puis arrete-toi. Ne commence ni 2B-B ni l'etape 3.

## Consigne suivante : etape 2B-B

Modele : **Terra, raisonnement Medium**.

N'utiliser ce prompt que lorsque 2B-A est valide :

> Lis les documents de reference et l'etat de passation. Realise uniquement
> l'etape 2B-B : remplace `MemoryOutbox` dans la preuve navigateur par une boite
> IndexedDB partitionnee par UID. Elle doit survivre au rechargement, ne jamais
> etre envoyee par un autre utilisateur, conserver les UUID et revisions, et
> bloquer les intentions dependantes apres conflit. Branche l'adaptateur sur les
> emulateurs Firebase et classe distinctement conflit de revision, membre
> inactif, auteur different et donnee invalide. Ajoute les tests unitaires et
> Playwright necessaires, mets a jour `docs/etat-projet.md`, puis arrete-toi. Ne
> commence ni 2B-C ni l'etape 3.

## Consigne suivante : etape 2B-C

Modele : **Terra, raisonnement Medium**.

N'utiliser ce prompt que lorsque 2B-B est valide :

> Lis les documents de reference et l'etat de passation. Realise uniquement
> l'etape 2B-C : remplace la preuve offline basee sur le serveur standard OSM par
> une source locale ou un fournisseur autorisant explicitement l'offline. Cree
> un paquet de test Toulouse, mesure son volume et verifie le canvas hors ligne
> par pixels ou comparaison d'image. Ajoute un test de requetes viewport geohash
> sur un grand jeu genere et consigne plages, doublons, faux positifs et lectures.
> Ne souscris a aucun service payant et ne deploie rien sans accord explicite.
> Mets a jour `docs/etat-projet.md`, puis arrete-toi pour revue Sol. Ne commence
> pas l'etape 3.

## Revue de levee du NO-GO

Modele : **Sol, raisonnement Medium**.

Apres 2B-A, 2B-B et 2B-C, utiliser :

> Examine les resultats complets du mini-lot 2B et les sept conditions de
> `docs/revue-architecture-etape-2.md`. Reexecute les validations importantes et
> cherche les faux positifs concernant Firebase, IndexedDB, conflits, Auth,
> rendu cartographique offline et geohash. Corrige seulement la documentation
> et les petits prototypes si necessaire. Donne un verdict explicite GO ou NO-GO
> pour l'etape 3, mets a jour `docs/etat-projet.md`, puis arrete-toi.

## Consigne conditionnelle : etape 3

Modele : **Terra, raisonnement Medium**.

Ce prompt est interdit tant que `docs/etat-projet.md` ne contient pas un verdict
explicite **GO pour l'etape 3** :

> Verifie d'abord que `docs/etat-projet.md` contient un GO explicite pour
> l'etape 3. Si ce GO manque, arrete-toi sans modifier le code. Sinon, lis
> `README.md`, `docs/architecture-v1.md`, `docs/etat-projet.md` et les rapports
> des etapes 2/2B. Realise uniquement l'etape 3 : transforme le laboratoire en
> socle React/TypeScript/PWA maintenable, organise selon la structure cible de
> l'architecture, avec configuration des environnements, lint, tests, emulateurs
> et chargement differe de MapLibre. Preserve les preuves 2B sous forme de tests
> de regression. Ne construis encore aucun parcours metier complet des etapes
> 4 a 9. Execute toutes les validations, mets a jour `docs/etat-projet.md`, puis
> arrete-toi avant l'etape 4.

## Dette Auth avant ouverture elargie

Modele : **Sol, raisonnement Medium**.

Le test Android physique est suspendu et non bloquant jusqu'a la beta terrain.
Le GO etape 3 est accorde conditionnellement malgre Auth reel sur `athar-dev31`,
car l'usage reste prive et les regles Firestore bloquent les comptes Auth
orphelins sans document `members/{uid}` actif.

Prompt a utiliser avant ouverture plus large ou beta terrain :

> Lis `README.md`, `docs/architecture-v1.md`, `docs/etat-projet.md`,
> `docs/revue-mini-lot-2b.md` et `docs/resultats-auth-reel.md`. Realise
> uniquement le lot de decision Auth : determine le mecanisme minimal qui ferme
> vraiment la creation et la suppression libre-service Firebase Auth, sans
> deploiement applicatif non autorise et sans service payant non approuve.
> Implemente seulement le petit prototype ou la documentation necessaire,
> reexecute `npm run prove:firebase-auth-real`, donne un verdict GO ou NO-GO
> explicite pour l'ouverture elargie, mets a jour `docs/etat-projet.md`, puis
> arrete-toi.

## Consigne suivante : etape 4

Modele : **Terra, raisonnement Medium**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour l'etape 4** :

> Lis `README.md`, `docs/architecture-v1.md`, `docs/etat-projet.md` et la
> structure de `src/`. Realise uniquement l'etape 4 : formalise le modele
> Firestore applicatif, les types et invariants de domaine, les interfaces de
> depots et un jeu de donnees local de demonstration. Ajoute les tests de
> domaine et de requetes viewport utiles. Utilise le socle et les emulateurs
> existants, sans construire l'authentification complete, la carte editable,
> les parcours de visites, la synchronisation complete ou le pilotage desktop.
> Execute les validations, mets a jour `docs/etat-projet.md`, puis arrete-toi
> avant l'etape 5.

## Consigne suivante : etape 5

Modele : **Sol, raisonnement Medium ou High**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour l'etape 5** :

> Lis `README.md`, `docs/architecture-v1.md`, `docs/etat-projet.md` et le
> modele sous `src/domain/workspace/`. Realise uniquement l'etape 5 : branche
> l'authentification Firebase par identifiant technique au socle applicatif,
> ajoute les providers et gardes de route minimaux, puis utilise les fonctions
> privilegiees existantes pour l'administration des membres. Etends les regles
> Firestore et leurs tests au modele complet de l'etape 4. Ne commence pas la
> carte editable, les zones interactives, les parcours de logement/passage, la
> synchronisation bout en bout ni le pilotage desktop. Execute les validations,
> mets a jour `docs/etat-projet.md`, puis arrete-toi avant l'etape 6.

## Consigne suivante : etape 6

Modele : **Terra, raisonnement Medium**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour l'etape 6** :

> Lis `README.md`, `docs/architecture-v1.md`, `docs/etat-projet.md` et les
> couches carte, geographie et depots existantes. Realise uniquement l'etape 6 :
> construis la carte applicative avec MapLibre charge a la demande, affiche les
> zones et batiments depuis les depots, puis ajoute le dessin et l'edition de
> zones ainsi que le rattachement point-dans-polygone et geohash. Preserve le
> paquet PMTiles, le rendu hors ligne et les budgets viewport comme regressions.
> Ne commence pas le parcours mobile des logements/passages, la synchronisation
> bout en bout ni le pilotage desktop. Execute les validations, mets a jour
> `docs/etat-projet.md`, puis arrete-toi avant l'etape 7.
