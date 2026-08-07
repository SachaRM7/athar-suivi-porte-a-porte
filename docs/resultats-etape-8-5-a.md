# Resultats de l'etape 8.5-A

Date : 3 aout 2026

## Objet livre

Le modele de structure des batiments est maintenant explicite et independant du
suivi terrain :

- `buildings.structureRevision` est la seule revision de concurrence des changements de structure ;
- `doors.revision` reste reservee au statut courant et a la chaine des passages ;
- une mise a jour structurelle ne peut modifier que `floor`, `label`, `sortOrder`, `active` et `updatedAt` ; elle ne reecrit jamais le statut, la revision, le dernier passage ni l'auteur ;
- un passage conserve son lot atomique porte + passage et n'alterne jamais la revision structurelle du batiment.

`buildBuildingStructureDiff` accepte un plan de portes et produit seulement les
creations, mises a jour structurelles ciblees et archivages requis. Le depot de
demonstration applique le meme contrat, et `FirestoreBuildingStructureGateway`
applique le diff dans un unique batch Firestore.

## Regles de reconciliation

- L'identite est toujours l'ID opaque de la porte. `sortOrder` est seulement un ordre d'affichage.
- Un plan qui fournit `existingDoorId` conserve cette porte, meme en cas de changement de libelle, d'etage ou d'ordre.
- Sans ID, la correspondance de compatibilite est `floor` + libelle normalise (NFKC, espaces normalises, insensible a la casse). Plusieurs candidats rendent le diff ambigu et aucune ecriture n'est produite : une decision explicite est requise.
- Les portes correspondantes gardent leur ID, statut, `revision`, `lastVisitId` et historique. Les portes absentes du plan sont archivees par `active: false`, sans suppression physique.
- Une porte archivee qui correspond de nouveau est reactivee avec le meme historique. Une nouvelle porte physique a un emplacement ancien doit recevoir un nouvel ID explicite.
- Les portes nouvelles commencent a `unvisited`, `revision: 0`, `lastVisitId: null` et `active: true`.

## Regles Firestore

Les regles imposent le schema `structureRevision`, `sortOrder` et `active`.
Creer ou modifier structurellement une porte exige, dans le meme batch, un
increment exact de `buildings.structureRevision`. Les mises a jour de passage
restent autorisees avec leur seule progression de `doors.revision`, y compris
dans un batch qui contient aussi une mise a jour structurelle d'un autre
document porte.

La passerelle encode les positions creees en `GeoPoint` et ne copie pas l'ID de
domaine dans le document Firestore. Ces deux frontieres sont couvertes par la
preuve emulee : une position TypeScript ordinaire ou une cle `id` supplementaire
sont refusees par le schema de regles.

## Preuves executees

- `npx tsc -b --pretty false` : passe.
- `npm run lint` : passe sans avertissement.
- `npm run test:run` : 40 tests dans 12 fichiers passent, dont le diff 10 vers 12, `sortOrder` sans modification de suivi, reactivation et ambiguite de renommage.
- `npm run test:emulator` : 36 tests dans 6 fichiers passent. Le nouveau lot prouve contre les regles que les 10 portes deja traitees restent intactes apres extension a 12, qu'une ecriture structurelle isolee est refusee et qu'un passage concurrent reste valide avec son propre `doors.revision`.
- `npm run test:e2e:emulator` : 2 parcours passent avec deux clients, hors-ligne, reprise, conflit reel et purge deconnexion.
- `npm run test:e2e` : 3 parcours passent, dont PWA/PMTiles hors ligne avec 272 entites rendues et edition de zone.
- `npm run verify:build` : passe ; MapLibre reste charge dans un chunk differe.

## Limites assumees

- Aucune vue de structure, vue par etage, action groupee ou selecteur a deux taps n'a ete construite. C'est l'objet exclusif de 8.5-B.
- Les mutations de structure sont actuellement une passerelle Firestore explicite, pas une intention de l'outbox terrain. Leur mise hors-ligne devra etre decidee separement si l'edition de structure devient un besoin terrain.
- Le batch Firestore est borne par sa limite native de 500 ecritures. La future interface devra prevoir un decoupage ou une limite produit avant de permettre de tres grandes regenerations.

## Verdict

**GO pour l'etape 8.5-B.** Les revisions structurelles et terrain sont
independantes dans le domaine, les depots et les regles. La correction de 10 a
12 portes ne perd aucun travail deja saisi, et la compatibilite avec les
regressions de synchronisation, Auth, PMTiles et geohash reste prouvee.
