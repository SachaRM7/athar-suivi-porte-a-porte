# Etat de passation

Derniere mise a jour : 29 juillet 2026  
Etape terminee : etape 6 - carte applicative, zones et rattachement geographique  
Verdict : **GO pour l'etape 7**  
Prochaine etape : revue puis realisation uniquement de l'etape 7

## Acquis

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
- `zoneStats` reste une projection en lecture seule pour les clients.

## Validations de l'etape 6

- `npm run lint` : passe sans avertissement.
- `npm run test:run` : 23 tests passent dans 10 fichiers, notamment le
  rattachement point-dans-polygone, bbox, fermeture de polygone et geohash.
- `npm run test:emulator` : 22 tests passent dans 5 fichiers. Sont notamment
  prouves la session technique active, la creation admin, le refus du membre
  ordinaire, le refus de l'admin inactif et la matrice Firestore complete.
- `npm run verify:build` : passe ; le laboratoire conserve MapLibre dans
  `assets/chunk-OfflineMap-B8rH6chS.js`, et la carte applicative est dans
  `assets/chunk-WorkspaceMap-CO-Cnv4M.js` avec le moteur MapLibre separe.
- `npm run test:e2e` : 3 tests passent en serie : gardes sans configuration,
  regression PWA/PMTiles hors ligne avec 272 entites rendues et edition de zone
  applicative avec 2 batiments rattaches.
- `npm audit --omit=dev` : 0 vulnerabilite de production apres retrait de
  React Router.
- Serveur local : `http://127.0.0.1:5174` repond.
- Verification navigateur integre Codex : `/login` rend de nouveau l'etat
  visible "Configuration requise", sans erreur console.

## Fichiers modifies dans l'etape 6

- Carte : `src/features/map/components/WorkspaceMap.tsx`, `MapPage.tsx` et
  `MapPreview.tsx`; route racine raccordee dans `src/app/App.tsx`.
- Zones : `src/features/zones/model/zone-geometry.ts` et ses tests, avec Turf
  pour le point-dans-polygone et GeoFire pour le geohash.
- Depots : `BuildingRepository.listByViewport`, `ZoneRepository.save` et leur
  implementation memoire sous `src/infrastructure/memory/`.
- PWA/qualite : regression Playwright de carte dans
  `tests/workspace-map.spec.ts`, paquet PMTiles et test hors ligne conserves.
- Dependances : `terra-draw`, son adaptateur MapLibre et les modules Turf
  minimaux ; aucune souscription ni aucun deploiement cloud.

## Anomalies et compromis ouverts

1. **Auth reel** : sur `athar-dev31`, la creation et la suppression
   libre-service par API Firebase Auth restent une dette acceptee pour usage
   prive. Un compte Auth orphelin ne passe toutefois ni la garde applicative ni
   les regles Firestore sans membre actif. A fermer avant ouverture elargie ou
   beta terrain.
2. **Android physique** : la preuve Chrome Android en mode avion reste suspendue
   jusqu'a la beta terrain.
3. **Emulateurs** : Firebase CLI utilise Node 24 de l'hote alors que les
   Functions declarent Node 22. A aligner avant le premier deploiement.
4. **Administration** : l'etape 5 cree les membres mais ne fournit pas encore
   leur liste, activation, desactivation ou reinitialisation de mot de passe.
   Ces commandes devront rester des operations privilegiees.
5. **Edition de zones** : la preuve persiste le polygone dans le depot memoire
   de demonstration. L'ecriture Firestore reelle et la reindexation asynchrone
   des batiments restent volontairement hors perimetre, avec la synchronisation
   bout en bout.

## Verdict

**GO pour l'etape 7.** La carte applicative, le fond PMTiles local, les zones,
les batiments visibles, le dessin et l'edition locale de polygones sont
operationnels et testes. Aucun parcours mobile de logements/passages, aucune
synchronisation bout en bout et aucune vue de pilotage desktop n'a ete commence.

## Prochaine action unique

Formuler puis executer uniquement l'etape 7. Ne pas lancer de synchronisation
bout en bout ni de pilotage desktop sans consigne explicite. Conserver les
regressions PMTiles hors ligne, pixels et budgets viewport.
