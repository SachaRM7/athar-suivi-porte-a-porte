# Etat de passation

Derniere mise a jour : 6 aout 2026
Etape terminee : phase A de mise en service privee, locale et lecture seule
Verdict : **GO pour le sas B de configuration de projet, sous autorisation explicite ; NO-GO pour les sas C, D et E**
Prochaine etape : obtenir l'autorisation explicite du sas B pour Auth/domaines et la decision Functions/facturation, puis s'arreter avant toute ecriture backend, Function ou promotion live

## Acquis

- La route terrain authentifiee n'utilise plus `demoWorkspace`. Elle compose
  les depots Firestore pagines, une projection locale mutable et l'outbox
  IndexedDB du seul UID courant.
- Statuts, zones, batiments du viewport et portes du batiment sont hydrates et
  valides aux frontieres. Les pages geohash vides avec curseur suivant sont
  traversees ; une emprise obsolete est annulee ou ignoree.
- Une recharge sur appareil approuve reconstruit les portes depuis Firestore ou
  son cache, puis reapplique les UUID et revisions en attente. Une revision
  locale plus recente n'est pas ecrasee par un snapshot serveur ancien.
- Succes et conflit rapprochent la porte confirmee ; un rejet relit seulement
  la porte concernee. Un conflit reconstruit reste visible meme si la selection
  React de la porte a ete perdue au rechargement.
- Les regles Firestore reservent maintenant toute mutation structurelle a un
  administrateur actif. Les membres actifs conservent le batch passage + porte.
- Le gateway structurel accepte au plus 450 mutations, mise a jour du batiment
  comprise, et refuse 451 avant creation du batch.
- La fixture `pilote-minimal` contient trois comptes techniques, un batiment et
  une porte sans donnee personnelle reelle. Les donnees de pagination ajoutees
  par le seed restent des fixtures de regression separees.
- Le runtime racine et Functions est aligne sur Node 22.23.2 via `package.json`,
  `.nvmrc`, `.node-version` et les lockfiles ; Firebase Emulator confirme le
  runtime hote Node 22.
- Les mesures et decisions de l'etape sont dans `docs/resultats-etape-11.md`.
- La revue a separe le seed pilote minimal des donnees de charge, reserve la
  lecture des portes archivees aux administrateurs et corrige la propagation
  ciblee des snapshots serveur vers la feuille batiment.
- Apres abandon d'un conflit, la chaine locale est retiree puis seule la porte
  serveur est relue. Le statut, l'UUID et la revision optimistes ne peuvent plus
  rester affiches comme une projection fantome.
- `docs/revue-architecture-etape-11.md` consigne les controles, corrections et
  la preuve Android finale. Le shell, PMTiles, Carmes, le batiment, la porte et
  l'UUID en attente survivent au rechargement coupe sur un Xiaomi 14T.
- La preuve Android a revele que `npm run dev:local` utilisait Vite en mode
  developpement et desinscrivait donc le service worker. Le lanceur construit
  maintenant l'application avec la configuration emulateur puis la sert par
  `vite preview` sur 5174. Une regression interdit le retour a `vite dev`.
- L'intention Android `dc284a47-71af-48aa-9860-cbbc6d131348` reste seule dans
  l'outbox de `member-b` apres rechargement, puis devient le passage serveur et
  le `lastVisitId` de la porte en revision 1 apres reprise.
- `docs/cadrage-mise-en-service-privee.md` separe cinq autorisations : A pour
  la preparation locale et la lecture seule, B pour Auth/facturation, C pour
  backend/donnees, D pour Hosting preview et E pour la promotion live.
- Le blocage initial Node 24 a ete leve pendant la phase A : Cloud Functions
  cible Node 22 et les regressions ont ete rejouees sous Node 22.23.2.
- Firebase Hosting, la specification d'index cloud, le bootstrap du premier
  administrateur et le manifeste de donnees pilote doivent encore etre
  prepares localement. Aucun de ces changements n'a ete execute dans le cloud.
- La phase A a prepare Hosting `dist`, rewrite SPA et en-tetes PWA sans
  deploiement. Le candidat d'index est distinct et non reference par
  `firebase.json`, ce qui interdit tout ecrasement accidentel d'index cloud.
- Les outils gardes d'inventaire, backup logique redige, import pilote dry-run,
  bootstrap admin dry-run et retour arriere ecrivent seulement sous
  `.athar-local/commissioning/`, ignore de Git. Ils exigent
  `--project athar-dev31` et ne journalisent ni mot de passe, jeton, cle de
  service ni note.
- L'inventaire cloud non mutant confirme Firestore Native `eur3`,
  Email/Password actif, trois comptes Auth, un membre et aucune donnee de zone,
  batiment, porte ou passage. La liste Functions est refusee par l'API avec
  `PERMISSION_DENIED` ; aucune configuration n'a ete modifiee pour la lever.
- Le preview Hosting `private-pilot` a ete reconstruit et publie le 6 aout 2026
  avec le build `athar-dev31`, sans promotion live ni Function. `/`, `/login`
  et `/sw.js` repondent HTTP 200 ; les routes SPA et le shell sont maintenant
  `no-cache, no-store, must-revalidate` pour eviter un ancien ecran cache.
- Une preview Hosting `private-pilot` est publiee jusqu'au 13 aout avec le
  build Node 22. Le shell et le service worker repondent correctement ; aucun
  regle, index, compte, donnee terrain ou Function n'a ete modifie.

- Le pilotage desktop `/admin` est protege par `ProtectedRoute role="admin"`.
  Un membre terrain est refuse ; le compte local `pilot.admin` permet la preuve
  Playwright et la consultation avec les emulateurs.
- Le tableau selectionne une zone et un statut, affiche progression, compteurs
  simples, horodatage de projection et batiments lus. Il charge uniquement les
  batiments et la projection de la zone selectionnee, jamais toutes les zones
  au montage.
- `WorkspaceReadRepositories` et `createFirestoreWorkspaceReadRepositories`
  isolent les lectures Firestore de l'interface React. Les codecs valident
  notamment `Status`, `ZoneStats` et `Visit` aux frontieres.
- Les lectures demandent `plafond + 1` puis levent `ReadLimitExceededError` au
  depassement : 250 documents de configuration ou de zone, 100 visites par
  porte et 120 documents par plage geohash viewport. Une liste tronquee ne
  peut plus etre presentee comme complete.
- Les depots Firestore de lecture exposent maintenant des pages de 1 a 100
  elements, des curseurs opaques versionnes et lies a leur scope, et des
  metriques par lecture incluant la taille JSON UTF-8. Le pilotage
  affiche 50 batiments a la fois et permet de parcourir les pages suivantes ou
  precedentes sans relire toute la zone.
- La carte annule la lecture viewport precedente lorsqu'une nouvelle emprise
  est demandee. Les plages geohash sont normalisees avant pagination pour
  eviter les doublons inter-plages, puis les faux positifs sont filtres par bbox.
- Le jeu de charge deterministe couvre 300 batiments, 180 portes d'un batiment
  et 150 passages coherents avec la revision de leur porte. Un candidat hors
  bbox prouve le filtrage exact et la non-duplication de la sentinelle. Les
  mesures revues sont dans `docs/revue-architecture-etape-10.md`.
- `zoneStats` est explicitement une projection reparable. Son absence, son type
  invalide ou des compteurs incoherents sont isoles : les compteurs sont
  indisponibles mais les batiments valides restent consultables.
- Zones et statuts sont tries apres validation locale. Un document prive de son
  champ de tri ne peut plus etre omis silencieusement par Firestore ; les
  codecs exigent les types reels sans conversion implicite.
- MapLibre, le parcours terrain, le batch porte + passage, UUID/revisions,
  IndexedDB par UID et la purge deconnexion restent inchanges et passent leurs
  regressions.
- L'etape 11 est bornee au branchement terrain Firestore pour un pilote prive :
  hydratation paginee, projection locale optimiste, reconstruction UID-safe,
  rafraichissement cible apres synchronisation et absence de repli silencieux
  vers `demoWorkspace`.
- Le pilote de reference comporte une zone, au plus 25 batiments, 250 portes et
  trois a cinq comptes connus. Ces nombres bornent la fixture d'acceptation sans
  modifier les budgets generaux de l'etape 10.
- La politique pilote reserve les mutations structurelles aux administrateurs
  actifs et refuse avant batch un diff de plus de 450 mutations.
- Les dettes Auth libre-service, administration manuelle des quelques comptes,
  zone preparee sans reindexation cloud, purge Firestore sous politique un seul
  onglet et `zoneStats` non repare sont acceptees temporairement. Elles sont
  detaillees dans `docs/cadrage-etape-11.md`.

- Decision produit post-revue : un mini-lot 8.5 est intercale avant le pilotage
  desktop pour stabiliser la structure des batiments et la saisie par etage.
- `buildings.structureRevision` est implemente pour la seule concurrence de
  structure. `doors.revision` reste reservee au statut et aux passages : les
  deux axes ne s'incrementent, ne se gouvernent et ne s'invalident jamais.
- `buildBuildingStructureDiff` applique une regeneration non destructive : les
  portes correspondantes gardent ID, statut, revision, dernier passage et
  historique ; les manquantes sont `unvisited` revision 0 ; les disparues sont
  archivees `active: false`. `sortOrder` n'est jamais une identite.
- Sans ID explicite, la reconciliation par etage + libelle normalise refuse les
  doublons ambigus. Une reactivation conserve l'historique ; une nouvelle porte
  physique exige un nouvel ID explicite.
- Le depot de demonstration et `FirestoreBuildingStructureGateway` n'ecrivent
  que les champs structurels. Les regles Firebase exigent le bump atomique de
  `structureRevision` pour chaque creation ou mutation structurelle de porte,
  tout en acceptant un passage concurrent avec sa propre `doors.revision`.
- La carte ouvre un detail de batiment: modal contraint sur desktop, plein ecran
  sur mobile, barre d'etages RDC vers le haut, progression par etage et
  couverture globale. Les portes archivees sont exclues du parcours terrain.
- Correctif UX post-revue : la vue mobile n'expose plus les portes comme des
  lignes de formulaire. Chaque porte est une grande tuile coloree en grille de
  trois colonnes ; le premier tap ouvre une feuille basse et le second applique
  l'un des quatre statuts. La note reste repliee et les revisions techniques ne
  sont plus affichees dans le geste terrain principal.
- L'ajout de portes d'un etage utilise une tuile `Ajouter` puis une feuille a
  deux champs (quantite et premier numero). La configuration complete et le
  plan manuel restent derriere le menu administrateur et reutilisent toujours
  le diff non destructif 8.5-A.
- La saisie terrain est a deux taps: porte puis bouton couleur. Elle reutilise
  strictement `recordLocalVisit`, donc passage, UUID, revision, auteur, statut
  actif et outbox IndexedDB. La porte reste selectionnee apres ecriture afin que
  conflit et rejet soient encore visibles dans la vue.
- Les actions "Tout l'etage" et "Tout le batiment" creent un passage individuel
  par porte et ne touchent jamais `structureRevision`. Elles peuvent etre
  partiellement appliquees si une porte est refusee.
- L'edition de structure, admin et repliee, appelle uniquement le diff 8.5-A:
  generation rapide, plan manuel avec IDs historiques, choix explicite en cas
  d'ambiguite et affichage des archives.
- La revue a corrige les IDs de previsualisation multiples, la reinjection du
  choix d'ambiguite, le rejet d'une porte assignee deux fois et le cas
  `newDoorId` pour une nouvelle porte physique face a une archive homonyme.
- Une mutation structurelle locale est bloquee si elle toucherait une porte
  ayant encore une intention dans l'outbox de l'utilisateur courant.
- Un passage mis hors ligne avant archivage reste acceptable ensuite par les
  regles, avance `doors.revision` et laisse la porte `active: false`.

- La connexion visible utilise uniquement l'identifiant technique et le mot de
  passe ; aucune operation d'inscription n'est exposee dans l'application.
- `AuthProvider` observe Firebase Auth puis le document
  `workspaces/{workspaceId}/members/{uid}`. Une session n'est active que si ce
  document existe, est valide et porte `active: true`.
- Les gardes distinguent chargement, environnement non configure, utilisateur
  anonyme, membre inactif, erreur, membre actif et administrateur actif.
- Les routes minimales sont `/login`, `/`, `/admin/members` et
  `/technical-lab`. Le laboratoire reste separe pour les regressions PWA et ne
  contient aucune donnee metier reelle.
- La route admin appelle la Callable Function `createMember`; elle ne cree
  jamais de compte Auth ni de document membre directement depuis le client.
- `createMember` exige le double verrou : claim Auth `admin` et membre
  Firestore actif avec role `admin`. Les champs recus, le nom affiche et le mot
  de passe temporaire sont bornes.
- Les SDK Firebase sont charges a la demande. Le bundle initial est limite a
  210,14 ko minifie (66,12 ko gzip), contre environ 803 ko avant decoupage.
- React Router a ete retire : les versions disponibles avaient des avis de
  securite production qui se chevauchaient. Les quatre routes utilisent une
  petite couche History API testee, sans dependance supplementaire.
- Le service worker sert `app.js` et `app.css` en network-first avec repli cache,
  ce qui evite qu'un nouveau build reste bloque sur un ancien shell. Les chunks
  immuables restent cache-first.
- La route protegee `/` affiche maintenant la carte applicative Toulouse. Elle
  lit les zones et les batiments visibles par les contrats de depots, et non
  directement depuis React ou Firestore.
- MapLibre, PMTiles et Terra Draw sont charges seulement lorsque la carte est
  ouverte. Le bundle initial reste a 209,49 ko minifie (66,09 ko gzip) ; le
  moteur MapLibre reste dans son chunk differe de 1 084,21 ko minifie.
- Correctif post-revue navigateur : les routes `MapPage` et `MapPreview` sont
  maintenant chargees par `React.lazy` depuis `App.tsx`. La page `/login` ne
  tire donc plus la demo geographique ni `geofire-common` avant ouverture de la
  carte, ce qui evite un ecran blanc cause par un cache Vite `Outdated Optimize
  Dep` dans la navigation integree Codex.
- Les zones sont rendues en GeoJSON, les batiments visibles en points, et
  l'emprise de la carte appelle `BuildingRepository.listByViewport`.
- Un administrateur peut dessiner une zone ou modifier son polygone avec Terra
  Draw. L'enregistrement recalcule la bbox, ferme le polygone et mesure les
  batiments rattaches par point-dans-polygone, avec recalcul de leur geohash.
- Le depot memoire de demonstration est mutable pour rendre cette edition
  testable localement. La route `/technical-map` est une preuve locale de
  regression, separee de la route authentifiee et sans donnees Firebase.
- Depuis la carte applicative, un batiment visible peut etre selectionne par
  marqueur ou par la liste issue de l'emprise courante. Une feuille terrain
  mobile affiche ses portes, leur statut courant, leur revision et le nombre
  d'intentions locales en attente.
- `recordLocalVisit` cree un passage local et met a jour la porte via l'unique
  operation de depot `commitVisitAndDoor` : statut courant, `revision + 1`, `lastVisitId`, passage
  `syncedAt: null` et intention outbox portant la revision de depart.
- Le parcours terrain refuse localement un auteur inactif, un statut inactif,
  une note invalide et une nouvelle intention sur une porte qui porte deja un
  conflit ou un rejet. La route authentifiee utilise `IndexedDbOutbox`
  partitionnee par UID ; la route `/technical-map` conserve une outbox memoire
  de regression.
- La route authentifiee construit `FirestoreDoorGateway` avec le Firestore de
  l'environnement et relance `SyncLab` au chargement, a la reprise reseau,
  apres une saisie et par commande explicite.
- L'auteur est controle contre `auth.currentUser.uid` au moment de chaque
  envoi. Une session fermee ou remplacee ne peut pas vider l'outbox d'un autre
  UID.
- Une intention conserve UUID et revision jusqu'a l'accuse serveur du batch
  atomique passage + porte. Les etats visibles sont `A jour`, `Hors ligne`,
  changements en attente, conflit a resoudre et ecriture rejetee.
- Seule une revision serveur avancee est reappliquable. Membre inactif, auteur
  different, statut/donnee invalide et refus de securite restent des rejets.
- Reappliquer recale une chaine dans une transaction IndexedDB unique et garde
  ses UUID. Abandonner supprime explicitement le conflit et ses dependances.
- Un batch deja accepte juste avant un arret client est reconnu par UUID,
  `lastVisitId` et revision, puis retire sans faux conflit.
- La reprise d'un UUID deja accepte reste reconnue si son statut est desactive
  apres l'acceptation. A l'inverse, un statut inactif avant acceptation reste
  `invalid-intent`, meme si la porte a aussi avance.
- Le cache Firestore est memoire par defaut ; `Appareil de confiance` active le
  cache persistant apres rechargement. Une deconnexion non approuvee purge
  l'outbox du seul UID, les caches PWA Athar et la persistance IndexedDB
  Firestore. La carte expose maintenant directement la commande deconnexion.
- Les mutations d'etat de l'outbox sont atomiques dans une transaction
  IndexedDB. Une purge concurrente ne peut plus ressusciter une intention et
  deux onglets serialisent reapplication et abandon.

## Regles Firestore

- Les schemas complets sont verifies pour membres, statuts, zones, batiments,
  portes et passages : champs autorises, types, bornes et valeurs enumerees.
- Les documents `members` sont en lecture controlee et sans ecriture client,
  meme pour un administrateur. L'Admin SDK reste l'unique voie d'ecriture.
- Les statuts et zones sont modifiables seulement par un administrateur actif.
- La creation d'un batiment exige une zone existante et un `createdBy`
  correspondant a l'utilisateur connecte.
- La creation d'une porte exige un batiment existant et la meme zone, position
  et geohash que ce batiment.
- Un passage exige un statut actif et conserve le lot atomique porte + passage,
  l'auteur, la revision et l'immutabilite deja prouves en 2B.
- Un passage retarde peut mettre a jour le suivi d'une porte archivee sans
  modifier son champ `active`; le client interdit toujours une nouvelle saisie
  apres observation de l'archive.
- `zoneStats` reste une projection en lecture seule pour les clients.

## Validations apres revue de l'etape 11

- `npm run lint` : succes.
- `npm run test:run` : 17 fichiers, 56 tests passes.
- `npm run verify:build` : succes ; MapLibre reste differe et l'entree est a
  214,73 ko minifiee / 67,37 ko gzip.
- `npm run test:emulator` : 7 fichiers, 48 tests passes. Auth, Functions,
  regles, structure admin, 450/451, geohash, pagination et codecs sont verts ;
  Firebase Emulator confirme `Using node@22 from host`.
- `npm run test:e2e:emulator` : 3 parcours passent avec deux clients,
  perte/reprise reseau, UUID, conflit concurrent, purge UID et pilotage admin.
- `npm run test:e2e` : 4 parcours passent, dont PMTiles hors ligne avec 272
  entites rendues, 268 couleurs significatives et 279929 pixels dominants.
- `npm run dev:local` : HTTP 200 ; le seed controle via Admin SDK Emulator
  contient 1 zone, 1 batiment, 1 porte et 3 membres.
- `npm audit --omit=dev` : application racine, 0 avis de production.
- `functions/npm audit --omit=dev` : 7 moderes, 0 eleve et 0 critique apres la
  mise a jour compatible de `brace-expansion`. Aucun downgrade Firebase force.
- Android physique : Xiaomi 14T et Chrome Android prouvent le rechargement
  shell/PMTiles, l'outbox UUID-safe et le batch confirme apres reprise. Les
  captures sont dans `docs/evidence/android-etape-11/`.

## Fichiers modifies dans les etapes 7 et 8

- Carte : `src/features/map/components/WorkspaceMap.tsx`, `MapPage.tsx` et
  `MapPreview.tsx` pour la selection de batiments visibles et l'injection de
  l'outbox locale.
- Batiments/portes : `src/features/buildings/components/BuildingVisitSheet.tsx`
  affiche portes, statuts, revisions, note et attente outbox.
- Passages : `src/features/visits/model/record-local-visit.ts` et ses tests
  valident l'auteur actif, le statut actif, la revision de depart et le blocage
  des intentions dependantes apres conflit.
- Depots : `commitVisitAndDoor` conserve l'ecriture locale coherente du passage
  et de la projection de porte dans le depot memoire.
- PWA/qualite : `tests/workspace-map.spec.ts` couvre maintenant selection de
  batiment et creation de passage local, tout en conservant edition de zone,
  PMTiles offline et budgets viewport.
- Synchronisation : `use-field-visit-sync.ts`, `FirestoreDoorGateway` et
  `SyncLab` relient l'outbox au batch Firestore et a ses etats UI.
- Preuve navigateur : `tests/field-sync-emulator.spec.ts` et les scripts de
  seed locaux ouvrent deux sessions contre les emulateurs, sans cloud.

## Anomalies et compromis ouverts

1. **Acceptee pour le pilote - Auth reel** : sur `athar-dev31`, la creation et
   la suppression libre-service par API Firebase Auth restent une dette
   acceptee pour le groupe familial connu. Un compte Auth orphelin ne passe ni
   la garde ni les regles sans membre actif. A fermer avant ouverture elargie.
2. **Levee - Android physique** : la preuve Chrome Android en mode avion est
   executee sur Xiaomi 14T. Le Wi-Fi n'a servi qu'au canal ADB sans fil, sans
   tunnel applicatif pendant la coupure ; Chrome etait force hors ligne par CDP.
3. **Acceptee pour le pilote - administration** : l'etape 5 cree les membres mais ne fournit pas encore
   leur liste, activation, desactivation ou reinitialisation de mot de passe.
   Ces commandes devront rester des operations privilegiees.
4. **Acceptee pour le pilote - edition de zones** : la zone ultra-reduite est
   preparee avant la sortie. L'ecriture Firestore reelle du polygone et la
   reindexation asynchrone restent desactivees.
5. **Acceptee sous politique pilote - purge multi-onglets** : la suppression de
   la persistance est prouvee sur un onglet. Le pilote impose un seul onglet et
   un appareil personnel ou approuve. A fermer avant appareil partage.
6. **Acceptee pour le pilote - projections** : `zoneStats` est lisible mais non repare par le
   client. Les lectures sont maintenant paginees et mesurees ; l'aggregation et
   les statistiques avancees restent hors perimetre. Les plafonds de page
   echouent explicitement au lieu de tronquer silencieusement.
7. **Acceptee - semantique des mesures** : `documentsRead` est le nombre de documents
    retournes par Firestore Emulator, sentinelles comprises, et
    `responseBytes` la taille du JSON domaine decode. Ces valeurs comparent les
    requetes mais ne representent ni les octets du protocole ni une facture
    cloud exacte.
8. **Acceptee temporairement - dependances Functions** : l'application a 0 avis
   de production. Le sous-projet Functions conserve 7 avis moderes transitifs,
   sans avis eleve ou critique. La seule correction restante propose un retour
   majeur de `firebase-admin` ; elle n'est pas compatible et n'est pas forcee.
9. **Levee - runtime** : le depot et les validations declarent et utilisent
   Node 22.23.2, runtime compatible Cloud Functions.
10. **Bloquante avant Functions** : l'inventaire lecture seule recoit
    `PERMISSION_DENIED` de l'API Functions. Le sas B doit decider si Functions
    entre dans le pilote et, dans ce cas, faire verifier l'acces, l'API et la
    facturation par le proprietaire du projet avant tout deploiement.

## Verdict

**GO pour le sas B de configuration de projet**, a condition d'une autorisation
explicite qui nomme Auth/domaines et tranche Functions/facturation. Node 22,
les regressions, les outils gardes, l'inventaire et les simulations de backup/
retour arriere sont verts.

**NO-GO pour les sas C, D et E.** Aucun compte, membre, regle, index, donnee,
Function, preview Hosting ou promotion live ne peut etre modifie sans son
autorisation explicite propre.

## Prochaine action unique

Obtenir l'autorisation explicite du **sas B** et executer son prompt avec
**GPT-5 Codex Terra, raisonnement High**. Le lot B doit modifier seulement la
configuration Auth/domaines explicitement listee et verifier, sans deployer,
si Functions/facturation sont retenues. Il doit s'arreter avant regles,
index, comptes, donnees, Function et Hosting.
# Addendum etape 12 — inscription et administrateur initial

L implementation locale ajoute `registerMember` et `claimInitialAdmin` sous
Functions. L inscription ouverte cree un membre actif dans `main`; les ecritures
directes de membres, ainsi que tout acces client a `setup`, sont refuses. Le
bootstrap est un hash SHA-256 provisionne hors bande (code minimal : 128 bits
aleatoires) et la promotion est transactionnelle, avec reprise du claim Auth par
le meme UID. Aucun deploiement ou ecriture dans `athar-dev31` n a ete effectue.

Verification finale locale sous Node 22.23.2 : lint, 58 tests emulateur
(Functions annonce Node 22), deux runs consecutifs de 4 parcours Playwright,
56 tests unitaires et le build/budget passent. Le parcours onboarding couvre le
code runtime faux, le code correct et l acces administrateur; la concurrence d
inscription couvre deux requetes du meme UID/profil et un seul document membre
actif.

La stabilisation E2E finale attend explicitement les portes rendues
asynchronement dans le parcours de conflit; deux runs complets consecutifs ont
confirme les quatre parcours sans modifier les assertions fonctionnelles.
