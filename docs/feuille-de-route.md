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
| 8.5-A | Structure batiment, generation non destructive et revisions independantes | Terra, Medium | Aucun passage ni statut perdu lors d'un ajustement de structure |
| 8.5-B | Vue batiment par etage et saisie terrain a deux taps | Terra, Medium | Parcours mobile rapide, progression et actions groupees testes |
| Revue 8.5 | Audit structure/statut, masse, offline et conflits | Sol, High | Verdict GO ou NO-GO explicite pour l'etape 9 |
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

## Consigne suivante : revue d'architecture de l'etape 8

Modele : **GPT-5 Codex Sol, raisonnement High**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour la revue d'architecture de l'etape 8** :

> Lis `README.md`, `docs/architecture-v1.md`, `docs/etat-projet.md`,
> `docs/resultats-etape-8.md`, les couches Auth, depots, passages, outbox,
> synchronisation, Firebase et les tests d'emulateur existants.
>
> Examine les resultats de l'etape 8 comme une revue d'architecture. Cherche les
> echecs caches concernant le batch porte + passage, la conservation/reprise des
> UUID, les revisions chainees, les conflits concurrents, les refus Firebase,
> Auth, IndexedDB multi-onglets/UID, le cache d'appareil de confiance, la purge
> a la deconnexion, le hors-ligne et la compatibilite avec les futurs depots
> Firestore de lecture.
>
> Corrige seulement la documentation et les petits prototypes si necessaire.
> Reexecute les validations importantes, notamment `npm run test:emulator`,
> `npm run test:e2e:emulator`, PMTiles/pixels, geohash viewport et Auth. Donne
> un verdict explicite GO ou NO-GO pour l'etape 9, mets a jour
> `docs/etat-projet.md`, puis arrete-toi.
>
> Ne commence pas l'etape 9. Ne construis pas le pilotage desktop, les
> statistiques globales ni de deploiement cloud.

## Consigne conditionnelle : etape 8.5-A

Modele : **GPT-5 Codex Terra, raisonnement Medium**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour l'etape 8.5-A** :

> Verifie d'abord que `docs/etat-projet.md` contient un GO explicite pour
> l'etape 8.5-A. Lis `README.md`, `docs/architecture-v1.md`,
> `docs/etat-projet.md`, `docs/revue-architecture-etape-8.md`, le modele
> workspace, les invariants, depots, regles Firestore, passages, outbox et tests
> d'emulateur existants.
>
> Realise uniquement l'etape 8.5-A : formalise la structure des batiments et
> implemente le generateur/diff non destructif de portes. Ajoute
> `buildings.structureRevision` pour la concurrence de structure et conserve
> `doors.revision` exclusivement pour les statuts et passages. Ces deux
> revisions ne doivent jamais se gouverner, s'incrementer ou s'invalider
> mutuellement.
>
> Une regeneration doit preserver l'ID, la revision, le statut, le dernier
> passage et tout l'historique des portes existantes qui correspondent. Elle
> ajoute uniquement les portes manquantes avec `unvisited` et revision 0, et
> archive les portes disparues avec `active: false` sans suppression physique.
> L'identite primaire reste l'ID opaque ; `sortOrder` n'est jamais une identite.
> Sans ID, une correspondance par etage + libelle normalise peut etre proposee,
> mais tout renommage ambigu doit demander une decision explicite. Une porte
> reactivee conserve son historique ; une nouvelle porte physique reutilisant
> un emplacement exige un nouvel ID explicite.
>
> Les operations de structure doivent utiliser des mises a jour de champs
> ciblees et ne jamais reecrire les champs de suivi. Etends les types,
> invariants, interfaces de depots, depot de demonstration, codecs, regles
> Firestore et tests d'emulateur utiles. Prouve notamment qu'une correction de
> 10 a 12 portes conserve integralement les 10 portes deja traitees, qu'un
> changement de `sortOrder` ne touche aucun statut et qu'un passage concurrent
> n'est pas invalide par un bump de `structureRevision`.
>
> Ne construis pas encore la vue batiment finale, le selecteur a deux taps, les
> actions groupees, le pilotage desktop, l'etape 9, l'etape 10 ni de deploiement
> cloud. Execute les validations, documente les decisions, mets a jour
> `docs/etat-projet.md`, donne un verdict explicite pour l'etape 8.5-B, puis
> arrete-toi.

## Consigne conditionnelle : etape 8.5-B

Modele : **GPT-5 Codex Terra, raisonnement Medium**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour l'etape 8.5-B** :

> Verifie d'abord que `docs/etat-projet.md` contient un GO explicite pour
> l'etape 8.5-B. Lis `README.md`, `docs/architecture-v1.md`,
> `docs/etat-projet.md`, `docs/resultats-etape-8-5-a.md`, le modele workspace,
> les depots, la carte, les passages, l'outbox et les tests existants.
>
> Realise uniquement l'etape 8.5-B : construis la vue detail d'un batiment
> depuis la carte, en modale sur desktop et panneau plein ecran sur mobile.
> Affiche un etage a la fois, avec navigation verticale RDC vers etages hauts,
> progression par etage et progression globale du batiment. Affiche les portes
> actives de l'etage avec leur label et statut, puis implemente le selecteur de
> statut a deux taps et les actions groupees "tout l'etage" et "tout le
> batiment". Toute action de statut doit reutiliser le chemin passage + porte,
> l'auteur, la revision de porte, les regles de membre/statut actif et l'outbox
> IndexedDB existante ; elle ne doit jamais modifier `structureRevision`.
>
> Ajoute seulement l'entree de configuration structurelle necessaire pour
> appeler le diff non destructif deja livre : generation rapide et ajustement
> manuel replie, resolution explicite des ambiguities et affichage des portes
> archivees hors du parcours terrain. Ne reimplemente pas le diff ni les regles.
> Ne commence pas le pilotage desktop, les statistiques globales, l'etape 9,
> l'etape 10 ni de deploiement cloud. Ajoute les tests unitaires, emulateur et
> Playwright mobile/desktop utiles, execute les validations, mets a jour
> `docs/etat-projet.md`, donne un verdict explicite pour la revue 8.5, puis
> arrete-toi.

## Consigne suivante : revue 8.5

Modele : **GPT-5 Codex Sol, raisonnement High**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour la revue 8.5** :

> Lis `README.md`, `docs/architecture-v1.md`, `docs/etat-projet.md`,
> `docs/resultats-etape-8-5-a.md` et les resultats de 8.5-B. Examine
> exclusivement la structure/non-destruction, les revisions independantes,
> actions groupees, conflits, hors-ligne, outbox, regles Firebase et parcours
> mobile. Corrige seulement la documentation et les petits prototypes si
> necessaire, reexecute les validations importantes, donne un verdict explicite
> GO ou NO-GO pour l'etape 9, mets a jour `docs/etat-projet.md`, puis arrete-toi.
> Ne construis pas l'etape 9 ni de deploiement cloud.

## Consigne conditionnelle : etape 9

Modele : **GPT-5 Codex Terra, raisonnement Medium**.

N'utiliser ce prompt que lorsque la revue 8.5 est terminee et que
`docs/etat-projet.md` contient un verdict explicite **GO pour l'etape 9** :

> Verifie d'abord que `docs/etat-projet.md` contient un GO explicite pour
> l'etape 9. Lis ensuite `README.md`, `docs/architecture-v1.md`,
> `docs/etat-projet.md`, `docs/revue-architecture-etape-8.md`,
> `docs/revue-architecture-etape-8-5.md` et les contrats de
> depots, codecs Firestore, couches carte, zones, batiments, portes et passages.
>
> Realise uniquement l'etape 9 : construis le pilotage desktop reserve aux
> administrateurs avec selection de zone, filtres par statut, compteurs simples
> et lecture de l'avancement. Ajoute les depots Firestore de lecture necessaires
> derriere les interfaces existantes, en validant les documents aux frontieres.
> Les requetes doivent rester bornees par zone ou viewport ; ne charge jamais
> toutes les portes et traite `zoneStats` comme une projection reparable, pas
> comme la source de verite.
>
> Preserve sans regression le parcours terrain mobile, le batch porte +
> passage, les UUID et conflits, la partition IndexedDB par UID, la purge a la
> deconnexion, Auth et regles Firebase, PMTiles hors ligne, pixels et budgets
> geohash. Utilise les emulateurs et les donnees de demonstration, sans
> deploiement cloud.
>
> Ne commence pas l'etape 10, l'optimisation de montee en charge, les
> statistiques avancees, l'export ni le durcissement final. Ajoute les tests
> unitaires, emulateur et Playwright desktop utiles, execute toutes les
> validations, mets a jour `docs/etat-projet.md`, donne un verdict explicite
> pour la revue de l'etape 9, puis arrete-toi.

## Consigne suivante : revue d'architecture de l'etape 9

Modele : **GPT-5 Codex Sol, raisonnement High**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour la revue d'architecture de l'etape 9** :

> Lis `README.md`, `docs/architecture-v1.md`, `docs/etat-projet.md`,
> `docs/resultats-etape-9.md`, les contrats de depots, les codecs Firestore,
> le pilotage admin, les couches Auth et les tests d'emulateur existants.
>
> Examine exclusivement les resultats de l'etape 9 comme une revue
> d'architecture. Cherche les echecs caches concernant les gardes de role,
> `zoneStats` obsolete ou malforme, les bornes zone/viewport, les requetes
> Firestore non indexees ou globales, les documents invalides, les donnees
> sensibles dans le pilotage, et les regressions terrain/offline/IndexedDB,
> batch porte + passage, UUID, conflits, Auth, regles, PMTiles et geohash.
>
> Corrige seulement la documentation et les petits prototypes si necessaire.
> Reexecute les validations importantes. Donne un verdict explicite GO ou NO-GO
> pour l'etape 10, mets a jour `docs/etat-projet.md`, puis arrete-toi.
>
> Ne commence pas l'etape 10, l'optimisation de montee en charge, les
> statistiques avancees, l'export, le durcissement final ni de deploiement
> cloud.

## Consigne conditionnelle : etape 10

Modele : **GPT-5 Codex Terra, raisonnement Medium**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour l'etape 10** :

> Verifie d'abord que `docs/etat-projet.md` contient un GO explicite pour
> l'etape 10. Lis `README.md`, `docs/architecture-v1.md`,
> `docs/etat-projet.md`, `docs/resultats-etape-9.md`,
> `docs/revue-architecture-etape-9.md`, les depots Firestore de lecture, les
> requetes geohash, le pilotage admin, la carte et les tests de charge existants.
>
> Realise uniquement l'etape 10 : mesure et borne la montee en charge des
> lectures par zone, batiment, porte et viewport. Ajoute les curseurs ou la
> pagination necessaires derriere les contrats existants, sans jamais retomber
> sur une lecture globale. Gere explicitement depassement de budget, pages
> partielles, annulation des requetes devenues obsoletes et dedoublonnage des
> plages geohash. Cree de grands jeux generes reproductibles et consigne pour
> chaque parcours le nombre de documents lus, plages, doublons, faux positifs,
> latence et taille des reponses. Ajoute uniquement les index Firestore prouves
> necessaires par les requetes retenues et teste leur comportement contre les
> emulateurs.
>
> Preserve le pilotage admin, le parcours terrain mobile, le batch porte +
> passage, UUID/revisions/conflits, IndexedDB par UID, purge deconnexion, Auth,
> regles Firebase, PMTiles hors ligne, pixels et reprise reseau. `zoneStats`
> reste une projection reparable et ne devient jamais la source de verite.
>
> Ne commence pas les statistiques avancees, l'export, le durcissement final,
> l'etape 11 ni de deploiement cloud. Ajoute les tests unitaires, emulateur et
> Playwright utiles, execute toutes les validations, mets a jour
> `docs/etat-projet.md`, donne un verdict explicite pour la revue de l'etape 10,
> puis arrete-toi.

## Consigne suivante : revue d'architecture de l'etape 10

Modele : **GPT-5 Codex Sol, raisonnement Medium**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour la revue d'architecture de l'etape 10** :

> Lis `README.md`, `docs/architecture-v1.md`, `docs/etat-projet.md`,
> `docs/resultats-etape-10.md`, les contrats de depots de lecture, les
> requetes Firestore/geohash, le pilotage admin, la carte et les tests de
> charge existants.
>
> Examine exclusivement les resultats de l'etape 10 comme une revue
> d'architecture. Cherche les echecs caches concernant les curseurs opaques,
> les pages partielles et leurs sentinelles, les budgets de lecture, les
> annulations d'emprises devenues obsoletes, le dedoublonnage de plages geohash,
> les faux positifs bbox, les lectures globales, les index Firestore absents ou
> injustifies, `zoneStats`, et la validite des mesures de charge generees.
>
> Preserve et reexecute les regressions utiles du terrain mobile, batch porte
> + passage, UUID/revisions/conflits, outbox IndexedDB par UID, purge de
> deconnexion, Auth, regles Firebase, PMTiles hors ligne, pixels et reprise
> reseau. Corrige seulement la documentation et les petits prototypes si
> necessaire.
>
> Donne un verdict explicite GO ou NO-GO pour l'etape 11, mets a jour
> `docs/etat-projet.md`, puis arrete-toi. Ne commence pas l'etape 11, les
> statistiques avancees, l'export, le durcissement final ni de deploiement
> cloud.

## Consigne suivante : cadrage de l'etape 11

Modele : **GPT-5 Codex Sol, raisonnement Medium**.

La revue 10 donne un GO technique, mais le perimetre de l'etape 11 n'est pas
encore defini dans l'architecture. Utiliser ce prompt avant toute implementation
de l'etape 11 :

> Verifie que `docs/etat-projet.md` contient un verdict explicite **GO pour
> l'etape 11**. Lis `README.md`, `docs/architecture-v1.md`,
> `docs/etat-projet.md`, `docs/revue-architecture-etape-10.md` et les anomalies
> ouvertes.
>
> Realise uniquement le cadrage de l'etape 11. Classe chaque dette restante en
> trois categories : bloquante avant beta privee, acceptee temporairement, ou
> hors V1. Propose un perimetre unique et borne pour l'etape 11, ses criteres de
> sortie mesurables, les regressions a conserver et le modele Codex recommande
> pour l'implementation. Porte une attention particuliere aux lectures terrain
> encore en demonstration, a la purge multi-onglets, aux regenerations de plus
> de 500 ecritures, au role d'edition structurelle, a l'alignement Node et a la
> dette Auth reelle deja acceptee pour usage prive.
>
> Corrige uniquement la documentation et la feuille de route. Ne modifie aucun
> prototype, ne commence pas l'etape 11, les statistiques avancees, l'export,
> le durcissement final ni de deploiement cloud. Mets a jour
> `docs/etat-projet.md` avec la prochaine action unique, puis arrete-toi.

## Consigne conditionnelle : implementation de l'etape 11

Modele : **GPT-5 Codex Terra, raisonnement High**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour l'implementation de l'etape 11** :

> Verifie d'abord le GO dans `docs/etat-projet.md`. Lis `README.md`,
> `docs/architecture-v1.md`, `docs/etat-projet.md`,
> `docs/cadrage-etape-11.md`, `docs/revue-architecture-etape-10.md`, puis les
> couches Auth, carte, batiments, portes, depots, outbox, synchronisation,
> Firestore et regles existantes.
>
> Realise uniquement l'etape 11 telle que bornee dans
> `docs/cadrage-etape-11.md` : remplace les donnees de demonstration de la
> route terrain authentifiee par une projection locale hydratee depuis les
> depots Firestore pagines. Hydrate statuts, zones, batiments du viewport et
> portes du batiment sans lecture globale. Traverse correctement les pages
> geohash vides avec curseur suivant, annule ou ignore les emprises obsoletes et
> ne retombe jamais silencieusement sur `demoWorkspace` en cas d'erreur.
>
> Au rechargement, reconstruis l'etat depuis Firestore ou son cache approuve,
> puis rapproche uniquement l'outbox de l'UID courant. Une intention en attente
> doit rester visible et conserver son UUID ; un succes, rejet ou conflit doit
> rafraichir seulement la porte concernee sans ecraser une intention locale plus
> recente. Preserve le batch atomique passage + porte, revisions chainees,
> reappliquer/abandonner et purge deconnexion.
>
> Aligne les regles structurelles sur la politique pilote : seul un
> administrateur actif modifie la structure. Refuse avant batch tout diff de
> plus de 450 mutations. Ajoute la fixture emulateur `pilote-minimal`, une
> preparation locale reproductible sans donnee personnelle et aligne le runtime
> de test sur la version Node declaree par les Functions.
>
> Ajoute les tests unitaires, emulateur et Playwright necessaires : aucun objet
> demo sur la route authentifiee, rechargement en ligne/hors ligne, reprise UUID,
> deux UID, conflit concurrent, document invalide, page geohash vide, role
> structurel et bornes 450/451. Reexecute toutes les regressions Auth, regles,
> IndexedDB, PMTiles/pixels, geohash, pilotage admin et synchronisation.
>
> Ne deploie rien et n'ecris rien dans `athar-dev31`. Ne commence pas la revue
> de l'etape 11, la mise en service, les statistiques avancees, l'export ni les
> fonctions hors pilote. Documente les resultats, mets a jour
> `docs/etat-projet.md`, donne un verdict explicite pour la revue de l'etape 11,
> puis arrete-toi.

## Consigne conditionnelle : revue d'architecture de l'etape 11

Modele : **GPT-5 Codex Sol, raisonnement High**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour la revue d'architecture de l'etape 11** :

> Lis `README.md`, `docs/architecture-v1.md`, `docs/etat-projet.md`,
> `docs/cadrage-etape-11.md`, `docs/resultats-etape-11.md`, les depots terrain
> Firestore, la projection de session, l'outbox, la synchronisation, les regles
> et les tests unitaires/emulateur/Playwright de l'etape 11.
>
> Examine exclusivement les resultats de l'etape 11 comme une revue
> d'architecture avant pilote prive. Cherche les faux positifs concernant
> l'absence reelle de `demoWorkspace` sur la route authentifiee, les lectures
> globales, les pages geohash vides, l'annulation des emprises, le cache
> approuve, la recharge hors ligne, la conservation UUID, l'isolation entre
> UID, les revisions chainees, le conflit visible apres recharge, le
> rafraichissement cible apres succes/rejet/conflit et la purge deconnexion.
>
> Recontrole aussi que seuls les administrateurs actifs modifient la structure,
> que 450 mutations passent et 451 sont refusees avant batch, que Node 24 est
> coherent entre racine, Functions et emulateurs, et que la fixture
> `pilote-minimal` reste separee des donnees de charge. Analyse les avis
> `npm audit` du sous-projet Functions et propose seulement une correction
> compatible si elle est necessaire avant pilote. Si un appareil Android ADB
> est disponible, execute la preuve mode avion ; sinon consigne-la explicitement
> comme preuve terrain restante sans inventer de resultat.
>
> Corrige seulement la documentation et les petits prototypes si necessaire.
> Reexecute les validations importantes, notamment Auth, regles, IndexedDB,
> PMTiles/pixels, geohash, synchronisation a deux clients et pilotage admin.
> Donne un verdict explicite GO ou NO-GO pour le lot de mise en service privee,
> mets a jour `docs/etat-projet.md`, puis arrete-toi.
>
> Ne commence pas la mise en service, n'ecris rien dans `athar-dev31`, ne
> deploie rien et ne commence pas les statistiques avancees, l'export ou les
> fonctions hors pilote.

## Consigne suivante : levee Android avant mise en service

Modele : **GPT-5 Codex Sol, raisonnement High**.

N'utiliser ce prompt que lorsqu'un appareil Android est connecte, deverrouille
et visible dans `adb devices -l` :

> Verifie que `docs/etat-projet.md` contient un **NO-GO pour le lot de mise en
> service privee** limite a la preuve Android. Lis `README.md`,
> `docs/architecture-v1.md`, `docs/etat-projet.md`,
> `docs/cadrage-etape-11.md` et `docs/revue-architecture-etape-11.md`.
>
> Execute uniquement la preuve Chrome Android physique en mode avion contre
> l'environnement local `athar-local`. Demarre la fixture `pilote-minimal`,
> expose par `adb reverse` les ports strictement necessaires, connecte le compte
> local `terrain.b` et prepare la zone Carmes sur l'appareil approuve. Verifie
> visuellement et par capture que le shell, le fond PMTiles, le batiment et sa
> porte restent affiches apres passage en mode avion et rechargement.
>
> En mode avion, cree un passage et releve son UUID, son statut d'attente et sa
> revision locale. Recharge Chrome et prouve que le meme UUID reste visible,
> sans donnee d'un autre UID. Retablis ensuite le reseau, attends la confirmation
> serveur et verifie dans l'emulateur que le batch passage + porte contient le
> meme UUID, le bon auteur, le bon statut et la revision attendue. N'invente
> aucun resultat si Android ou Chrome ne permet pas une observation.
>
> Ne modifie le code que si un defaut strictement necessaire a cette preuve est
> reproduit, et ajoute alors le test de regression minimal. Mets a jour
> `docs/revue-architecture-etape-11.md` et `docs/etat-projet.md`, puis donne un
> verdict explicite GO ou NO-GO pour le lot de mise en service privee.
>
> Ne commence pas la mise en service, n'ecris rien dans `athar-dev31`, ne
> deploie rien et ne commence pas les statistiques, l'export ou les fonctions
> hors pilote.

## Consigne suivante : cadrage du lot de mise en service privee

Modele : **GPT-5 Codex Sol, raisonnement High**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour le lot de mise en service privee** :

> Verifie d'abord le GO dans `docs/etat-projet.md`. Lis `README.md`,
> `docs/architecture-v1.md`, `docs/etat-projet.md`,
> `docs/cadrage-etape-11.md`, `docs/revue-architecture-etape-11.md` et les
> preuves sous `docs/evidence/android-etape-11/`.
>
> Realise uniquement le cadrage documentaire du lot de mise en service privee
> sur `athar-dev31`. Inventorie les actions exactes necessaires pour Auth,
> membres, fixture pilote, regles et index Firestore, Functions, Hosting/PWA,
> domaines autorises, secrets et configuration d'environnement. Separe
> clairement les controles en lecture seule, les ecritures de donnees et les
> deploiements. Chaque ecriture ou deploiement doit rester soumis a une
> autorisation explicite ulterieure.
>
> Definis une sequence courte et reversible, les sauvegardes ou exports
> prealables, le plan de retour arriere, les comptes et donnees minimales de la
> zone pilote, ainsi que des criteres de sortie mesurables sur desktop et
> Android. Preserve les bornes de lecture, l'absence de donnees personnelles
> dans les fixtures, le parcours hors ligne, l'isolation UID, le batch porte +
> passage, les revisions et la politique d'administration existante.
>
> Classe les dettes acceptees qui restent compatibles avec le pilote et les
> conditions qui imposeraient un arret. Propose le modele Codex et le prompt
> exacts pour executer le lot apres autorisation. Corrige uniquement la
> documentation et la feuille de route, puis mets a jour
> `docs/etat-projet.md` avec la prochaine action unique.
>
> N'ecris rien dans `athar-dev31`, ne deploie rien, ne cree ni ne modifie aucun
> compte cloud et ne commence pas les statistiques avancees, l'export ou les
> fonctions hors pilote. Arrete-toi apres le cadrage.

## Consigne suivante : phase A de mise en service privee

Modele : **GPT-5 Codex Terra, raisonnement High**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour la phase A locale et lecture seule**. Cette consigne
n'autorise aucune mutation cloud.

> Verifie d'abord le GO limite a la phase A dans `docs/etat-projet.md`. Lis
> `README.md`, `docs/architecture-v1.md`, `docs/etat-projet.md`,
> `docs/cadrage-mise-en-service-privee.md`,
> `docs/revue-architecture-etape-11.md`, `firebase.json`, `.firebaserc`, les
> configurations d'environnement, `functions/`, les scripts de fixture et les
> tests Auth, Firestore, synchronisation et PWA.
>
> Realise uniquement la phase A du cadrage de mise en service privee. Aligne la
> racine, Functions, `.nvmrc` et `.node-version` sur Node 22, puis reexecute
> toutes les validations sous cette version. Empeche `emulatorHealth` d'etre
> exportee en production sans casser sa preuve locale. Prepare sans deployer la
> configuration Firebase Hosting statique pour `dist`, le rewrite SPA, les
> en-tetes PWA, le build racine `athar-dev31` et la gestion prudente des index.
>
> Ajoute les outils locaux gardes necessaires pour : inventaire cloud en lecture
> seule, backup logique redige, manifeste de donnees pilote distinct de
> `pilote-minimal`, dry-run d'import idempotent, bootstrap auditable du premier
> administrateur et manifeste de retour arriere. Tous les outils doivent exiger
> le projet exact `athar-dev31`, etre en dry-run par defaut, refuser les
> collections inattendues et ne jamais afficher mot de passe, jeton, cle de
> service ou note. Ne mets aucun secret ni mot de passe dans le depot.
>
> Execute uniquement les controles cloud non mutants listes dans le cadrage :
> projet, Web App, Functions, sites Hosting, index, configuration Auth lue,
> domaines, Firestore et comptes/documents sous forme redactee. Sauvegarde les
> resultats sensibles uniquement dans un dossier local ignore par Git. Ne lance
> aucune commande `deploy`, `delete`, `clone`, `channel:deploy`, import, PATCH
> d'API, creation de compte, ecriture Firestore, changement Auth, liaison de
> facturation ou creation de budget.
>
> A la fin, documente les validations Node 22, l'inventaire reel, le backup et
> la liste exacte des mutations proposees pour les sas B, C, D et E. Mets a
> jour `docs/etat-projet.md`, donne un verdict explicite GO ou NO-GO pour le sas
> B, propose le modele et le prompt de relance, puis arrete-toi avant la premiere
> mutation cloud.
>
> Ne commence pas les statistiques avancees, l'export produit, App Check
> enforce, la CI/CD, les fonctions hors pilote ni la promotion live.

## Consigne suivante : sas B de configuration de projet

Modele : **GPT-5 Codex Terra, raisonnement High**.

N'utiliser ce prompt que lorsque `docs/etat-projet.md` contient un verdict
explicite **GO pour le sas B** et que le proprietaire donne une autorisation B
precise. Cette autorisation doit lister les modifications Auth/domaines
acceptees et choisir explicitement l'une des deux options Functions :
`hors pilote` ou `verification acces + facturation`, sans deployement.

> Verifie le GO du sas B dans `docs/etat-projet.md`, puis lis `README.md`,
> `docs/architecture-v1.md`, `docs/etat-projet.md`,
> `docs/cadrage-mise-en-service-privee.md`,
> `docs/resultats-phase-a-mise-en-service.md`, `firebase.json`, `.firebaserc`
> et les scripts sous `scripts/commissioning/`.
>
> Realise uniquement le sas B autorise pour `athar-dev31`. Avant chaque mutation,
> affiche la ressource, la valeur actuelle redigee, la valeur cible, la commande
> exacte et le retour arriere, puis n'execute que ce qui est nomme dans
> l'autorisation utilisateur. Pour Auth, ne modifie que Email/Password, les
> actions de creation/suppression libre-service et les domaines explicitement
> choisis. Conserve les domaines existants non vises. Reprouve ensuite les
> refus Auth attendus sans journaliser de mot de passe ni jeton.
>
> Si l'option Functions est `verification acces + facturation`, fais seulement
> les controles et les actions de projet explicitement autorisees pour resoudre
> le `PERMISSION_DENIED`, verifier API, plan Blaze et alertes. Ne deploie aucune
> Function. Si l'option est `hors pilote`, n'active rien et documente que les
> comptes seront administres manuellement pendant le pilote.
>
> Utilise les outils gardes et le projet exact. Sauvegarde les etats precedents
> sous `.athar-local/commissioning/`, sans secrets, notes ni donnees brutes.
> Ne touche pas aux regles, index, comptes, membres, donnees pilote, Functions,
> Hosting preview ou Hosting live. Mets a jour les documents, donne un verdict
> explicite GO ou NO-GO pour le sas C, puis arrete-toi.
# Etape 12 — realisee localement, gate cloud non ouvert

Inscription publique consciente du risque, finalisation idempotente du membre,
bootstrap administrateur a usage unique exclusivement par callable Functions et
recuperation du claim Auth sont implementes et couverts en emulateur. Avant toute
ouverture publique, traiter le risque majeur d abus/acces lie a l inscription
ouverte; App Check, CAPTCHA, verification email et invitation restent hors lot.
Validation locale terminee sous Node 22.23.2 : lint, emulateurs, deux runs E2E
consecutifs a 4/4, tests unitaires et build sont verts; le gate cloud reste
ferme.
