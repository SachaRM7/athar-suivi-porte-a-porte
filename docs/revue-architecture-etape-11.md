# Revue d'architecture de l'etape 11

Date : 6 aout 2026  
Perimetre : branchement terrain Firestore, reconstruction locale, securite et
preuves avant pilote prive, sans deploiement ni ecriture dans `athar-dev31`.

## Verdict

**GO pour le lot de mise en service privee.** La preuve Chrome Android
physique est executee et le dernier critere rouge est leve. Un Xiaomi 14T a
recharge le shell, le fond PMTiles, Carmes, son batiment et sa porte sans acces
aux services locaux, puis a conserve et synchronise le meme UUID apres reprise.

Ce GO ne constitue pas une autorisation de deploiement ou d'ecriture dans
`athar-dev31`. Le lot de mise en service reste une action distincte qui exige
un accord explicite.

## Faux positifs trouves et corriges

1. **Fixture pilote melangee aux donnees de regression.** Le module
   `pilote-minimal` etait minimal, mais sa commande de preparation ajoutait
   toujours 51 batiments de pagination et deux zones techniques. Le seed local
   ne charge maintenant que trois comptes, quatre statuts, une zone, un
   batiment et une porte. Playwright demande explicitement
   `--with-regressions` pour ses donnees de charge.
2. **Rafraichissement cible non rendu dans la feuille batiment.** Apres succes,
   rejet ou conflit, le depot etait rapproche mais la copie React des portes
   pouvait garder un statut optimiste. La synchronisation publie maintenant
   les seuls snapshots de portes touches. La feuille les applique sans relire
   le batiment entier.
3. **Abandon de conflit laissant une projection fantome.** Une chaine locale
   pouvait rester en revision optimiste dans la session apres suppression de
   l'outbox. L'abandon retire d'abord la chaine, puis relit uniquement la porte
   serveur et propage ce snapshot a l'ecran. Un test couvre deux intentions
   dependantes et le retour exact a l'UUID, au statut et a la revision serveur.
4. **Lecture structurelle inutile pour un membre terrain.** L'ouverture d'un
   batiment lisait aussi les portes archivees. Cette lecture reste bornee au
   batiment, mais elle n'est maintenant executee que pour un administrateur
   autorise a configurer la structure.
5. **Avis eleve Functions.** `npm audit fix --omit=dev`, sans `--force`, a mis
   `brace-expansion` a jour dans le lock et supprime l'avis eleve. Aucun paquet
   Firebase direct n'a ete retrograde.
6. **Faux vert du lanceur local hors ligne.** `npm run dev:local` servait Vite
   en mode developpement, ou `main.tsx` desinscrit volontairement le service
   worker. Chrome Android obtenait donc `ERR_CONNECTION_REFUSED` au premier
   rechargement coupe, alors que Playwright testait le build de production. Le
   lanceur pilote construit maintenant l'application avec les variables
   `athar-local`, puis la sert par `vite preview` sur le meme port 5174. Un test
   interdit le retour a `vite dev` dans ce parcours.

## Points controles

- La route authentifiee charge `MapPage`, les depots Firestore pagines et la
  projection de session. Elle n'importe pas `demoWorkspace`. La demonstration
  reste limitee a `/technical-map`, route de laboratoire distincte.
- Les lectures sont bornees par viewport, zone, batiment ou porte. Le depot de
  session traverse un curseur apres une page geohash vide. Il n'expose aucune
  lecture globale de portes ou de passages.
- Le changement d'emprise annule les pages suivantes et ignore les resultats
  deja emis devenus obsoletes. La limite du SDK Web demeure documentee : la
  requete reseau deja partie n'est pas physiquement annulee.
- La persistance Firestore n'est activee que pour un appareil approuve. Une
  recharge hors ligne utilise ce cache et reprojette uniquement l'outbox de
  l'UID courant. Sans cache prepare, l'erreur est explicite et aucun workspace
  de demonstration n'est substitue.
- Les UUID, revisions chainees, conflit visible apres recharge, reapplication,
  rejet classe et reprise reseau sont prouves avec deux clients. Un snapshot
  serveur ancien ne remplace pas une intention locale plus recente.
- La deconnexion d'un appareil non approuve purge l'outbox de l'UID, les caches
  Athar et la persistance Firestore selon la politique pilote a un seul onglet.
- Les regles refusent toute mutation structurelle a un membre et l'acceptent
  pour un administrateur actif. Les passages conservent le batch atomique porte
  + passage et leur axe de revision independant.
- Le budget structurel compte la mutation du batiment et celles des portes :
  450 mutations passent et 451 echouent avant creation du batch.
- Racine, Functions, `.nvmrc` et `.node-version` declarent Node 24. Le poste
  utilise `v24.14.0` et l'emulateur confirme `Using node@24 from host`.
- La fixture `pilote-minimal` est separee du jeu de charge et ne contient
  aucune donnee personnelle reelle.

## Preuve Android physique

Appareil : Xiaomi 14T, Chrome Android, ecran physique 1220 x 2712. Les captures
de page font 1220 x 2441 pixels, hors interface native de Chrome.

1. Le compte local `terrain.b` est connecte a `athar-local` et l'appareil est
   marque approuve. Le service worker controle la page et le message
   `PREPARE_TOULOUSE_MAP` confirme la mise en cache du paquet PMTiles.
2. Le mode avion Android est active (`airplane_mode_on=1`). Le Wi-Fi est
   conserve uniquement pour le canal ADB sans fil, le cable USB etant
   instable. `adb reverse --list` est vide : Chrome ne peut atteindre ni 5174,
   ni Auth 9199, ni Firestore 8180. L'etat reseau de Chrome est force a
   `offline` par CDP pendant les gestes afin que `navigator.onLine=false`.
3. Apres rechargement, le shell Athar, Carmes, `1 rue du Pilote`, la porte 02
   et le fond PMTiles sont visibles. La capture carte contient 6 729 couleurs
   opaques distinctes et 430 couleurs presentes sur au moins 100 pixels.
4. Le statut `A revenir` cree hors ligne l'intention
   `dc284a47-71af-48aa-9860-cbbc6d131348`, auteur `member-b`, porte
   `pilot-door-002`, revision attendue 0, etat `pending`. Firestore conserve a
   ce moment la porte `unvisited` revision 0 et aucun passage de cet UUID.
5. Apres rechargement toujours coupe, IndexedDB contient exactement le meme
   UUID, toujours `pending`, avec le seul auteur `member-b`. L'ecran affiche
   la porte `A revenir` et `1 changement(s) en attente`.
6. Apres retour reseau (`airplane_mode_on=0`) et synchronisation explicite,
   l'outbox est vide et l'ecran affiche `A jour`. Firestore contient un batch
   coherent : porte `retry`, revision 1, `lastVisitId` egal au meme UUID ;
   passage du meme ID, auteur `member-b`, statut `retry`, `doorRevision=1`.

Captures conservees sous `docs/evidence/android-etape-11/` : carte en mode
avion apres rechargement, batiment/porte, passage en attente, passage conserve
apres rechargement et etat confirme apres reprise.

## Audit Functions

Apres correction compatible, `functions/npm audit --omit=dev` signale 7 avis
moderes, 0 eleve et 0 critique. Ils proviennent de `uuid` sous
`@google-cloud/storage`, `gaxios`, `retry-request` et `teeny-request`, tires
transitivement par `firebase-admin` et `firebase-functions`.

`npm outdated --json` ne trouve aucune version directe plus recente. La seule
correction npm restante exige `--force` et propose un retour a
`firebase-admin@10.3.0`, incompatible avec l'objectif de maintenance. Les deux
Functions du pilote utilisent Auth et Firestore, pas Storage ni les variantes
UUID concernees par l'avis. Les 7 avis moderes sont donc acceptes
temporairement pour le pilote prive ; aucun downgrade force n'est applique. Ils
devront etre reaudites avant un deploiement ulterieur ou a la prochaine version
compatible de la chaine Firebase.

## Validations rejouees

| Commande | Resultat |
|---|---|
| `npm run lint` | succes |
| `npm run test:run` | 17 fichiers, 56 tests passes |
| `npm run verify:build` | succes ; MapLibre reste dans un chunk differe |
| `npm run test:emulator` | 7 fichiers, 48 tests passes sous Node 24 |
| `npm run test:e2e:emulator` | 3 parcours passes : deux clients, offline/reprise, conflit, purge UID et admin |
| `npm run test:e2e` | 4 parcours passes ; PMTiles hors ligne, 272 entites rendues et verification pixel |
| `npm run dev:local` | HTTP 200 ; seed controle par Admin SDK : 1 zone, 1 batiment, 1 porte, 3 membres |
| `npm audit --omit=dev` | application racine : 0 avis de production |
| `functions/npm audit --omit=dev` | 7 moderes, 0 eleve, 0 critique |
| `adb devices -l` | Xiaomi 14T visible et autorise ; association ADB sans fil utilisee pour les captures |
| preuve Android | UUID conserve puis confirme ; porte revision 0 vers 1 ; outbox 1 vers 0 |

## Decision de suite

Le critere Android est leve. La prochaine action peut etre le cadrage borne du
lot de mise en service privee. Aucun deploiement, aucune ecriture dans
`athar-dev31` et aucune fonction hors pilote ne sont autorises par cette revue.
