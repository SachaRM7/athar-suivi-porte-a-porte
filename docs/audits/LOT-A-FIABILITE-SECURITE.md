# Lot A — fiabilité, sécurité et cohérence des accès

Date : 20 octobre 2026 · Branche : `lot-a-fiabilite-securite` · Base : `main` @ `cbbeead`

Aucun déploiement, aucune écriture dans `athar-dev31`, aucune modification de compte, de
secret, de règle ou de Function en ligne n'a été faite. Tout a été validé localement et sur
émulateurs Firebase (projet `athar-local`).

## 1. État initial (constaté sur `main` @ `cbbeead`)

| # | Fichier | Comportement exact |
|---|---|---|
| I1 | `src/infrastructure/outbox/indexeddb-outbox.ts` | Une erreur IndexedDB (`AbortError`, `QuotaExceededError`, `InvalidStateError`, « Internal error »…) basculait **silencieusement et définitivement** l'instance vers une `MemoryOutbox`. Le passage s'affichait enregistré et disparaissait au rechargement. |
| I2 | `src/features/visits/model/record-local-visit.ts` | `recordLocalVisits` (« tout marquer absent ») projetait d'abord les passages à l'écran, puis ajoutait les intentions **une par une** : un échec au milieu laissait des portes affichées « Absent » sans intention durable. |
| I3 | `src/features/visits/model/mark-door-for-sisters.ts` | Composition du foyer / marqueur projetés **avant** l'écriture durable. |
| I4 | `src/domain/sync/door-marker-outbox.ts` | `markSynced(doorId)` effaçait une modification faite pendant l'envoi de la précédente (même porte) : perte silencieuse. |
| I5 | `src/features/visits/model/record-local-visit.ts` | Deuxième passage hors ligne sur une même porte refusé avec un message anglais (« A local visit is already waiting… »), alors que la synchronisation sait chaîner les révisions. |
| I6 | `src/infrastructure/firestore/firestore-rest-door-writes.ts` (chemin réel de production) | Aucune classification d'erreur : réseau coupé (`TypeError`), 503, session expirée, refus de sécurité remontaient en exception brute, interrompaient la passe et laissaient une promesse rejetée non traitée ; l'interface restait sur « changements en attente ». |
| I7 | `firestore-rest-*.ts` | URL `https://firestore.googleapis.com` en dur : en recette émulateur, les écritures REST partaient vers le cloud. |
| I8 | `src/features/visits/model/use-field-visit-sync.ts` | Un profil de porte refusé levait une erreur **avant** l'envoi des passages : un marqueur bloquait toute la synchronisation. « A jour » affiché alors que des profils attendaient. |
| I9 | `FirestoreDoorGateway` | Session fermée pendant une passe → rejet définitif `author-mismatch` d'intentions légitimes, sans résolution possible. |
| I10 | `src/app/providers/AuthProvider.tsx` | Déconnexion d'un appareil non approuvé : purge **sans avertissement** des passages non synchronisés ; purge partielle non signalée (exception, pas de rechargement, données restées sur l'appareil). |
| I11 | `src/infrastructure/firebase/client.ts` | Cache Firestore persistant pour tous, contrairement à la politique documentée (« mémoire par défaut, persistant sur appareil de confiance »). Dans Chromium headless, ce cache bloque indéfiniment les lectures serveur. |
| I12 | `building-staleness.ts`, `WorkspaceMap.tsx`, docs | « Pas vu > 3 mois », le tri et la pastille ambre comptaient les portes « Ne pas déranger » : un immeuble entièrement « Ne pas déranger » remontait comme à revisiter après 90 jours. Docs : « Attaché à l'effort, seul statut qui sort la porte du cycle ». |
| I13 | `BuildingVisitSheet.tsx` | Changer le statut d'une porte « Ne pas déranger » se faisait en un tap, sans confirmation. |
| I14 | `functions/index.js` | `registerMember` (inscription libre → membre actif) et `claimInitialAdmin` exportés **sauf** si `ATHAR_FUNCTIONS_MODE=production` : une variable absente en production ouvrait l'inscription. |
| I15 | `firestore.rules` | Schéma racine historique (`/zones`, `/buildings/**/doors/**/passages`) autorisé sur le seul claim Auth `role` : un compte suspendu dans le workspace mais gardant un claim (`claimInitialAdmin` pose `role: admin`) lisait et écrivait encore par ce chemin, y compris suppression. |
| I16 | `firestore.rules` | Tout membre actif pouvait déplacer un bâtiment ou changer sa zone (`location`, `geohash`, `zoneId`), opération non exposée aux membres par l'interface. |
| I17 | `src/app/App.tsx` | `/_ds`, `/technical-lab`, `/technical-map` accessibles sans authentification en production ; modules embarqués dans le build. |
| I18 | `src/app/routes/navigation.ts` | Une URL inconnue ouverte directement donnait un **écran blanc** (le `Redirect` enfant naviguait avant l'abonnement `popstate` du parent). |
| I19 | `WorkspaceMap.tsx` | `public/tiles/` est ignoré par Git, donc absent des builds CI ; Firebase Hosting répond `index.html` (200) pour `/tiles/batiments-31.pmtiles`. La page HTML était prise pour une archive (« Wrong magic number ») et **toute l'initialisation de la carte s'arrêtait** : aucune zone, aucun bâtiment. |
| I20 | `.github/workflows/deploy.yml` | Publication sur `lint` + tests unitaires seulement : ni typage, ni règles, ni Functions, ni émulateurs, ni contrôle de configuration (projet, émulateurs, laboratoires), ni vérification du bundle. |
| I21 | `scripts/verify-build.mjs` | Ne vérifiait que le chunk `OfflineMap`… qui n'appartient qu'au laboratoire. |
| I22 | `tests/workspace-map.spec.ts`, `tests/field-sync-emulator.spec.ts` | Désalignés de l'interface (libellés, choix de zone, sélecteur ambigu) : rouges sur `main` avant ce lot. |
| I23 | `BuildingVisitSheet.tsx` | Après un changement de marqueur sœurs ou de composition, la tuile perdait l'anneau rose et la fiche rouverte montrait l'ancienne valeur (état de la fiche non mis à jour). Reproduit sur `main` (2 parcours e2e rouges). |

## 2. Corrections réalisées

### A1 — Persistance hors ligne — commits `e0b9f38`, `c85c981`

- **Cause racine** : un repli mémoire « pour ne pas bloquer le terrain » transformait une panne de stockage en faux succès ; l'ordre projection → stockage était inversé à deux endroits ; le chemin REST n'avait pas de classification d'erreurs.
- **Modifications**
  - `indexeddb-outbox.ts` réécrit : plus de repli mémoire ; toute panne → `LocalStorageUnavailableError` ; résolution uniquement sur `oncomplete`, durabilité `strict` ; `addMany` en une transaction ; purge d'un UID atomique (passages + profils) ; `countUnsyncedLocalWrites`.
  - Ordre « durable puis affiché » : `recordLocalVisit`, `recordLocalVisits`, `updateDoorProfile`.
  - Passages consécutifs sur une porte : chaîne de révisions, contrôle de cohérence de la projection.
  - `markSynced(doorId, commandId)` ne retire que l'intention envoyée.
  - REST : `NetworkUnavailableError(reason)` (`offline`, `session`, `server`) garde l'intention ; refus de sécurité diagnostiqués (membre suspendu, statut désactivé, sécurité) ; réponse perdue reconnue par UUID + révision (pas de doublon) ; origine émulateur.
  - Session fermée ou autre compte pendant la passe : report, jamais d'envoi sous un autre nom, jamais de rejet définitif.
  - Cinq états (`field-sync-status.ts`) : *À jour* (confirmé serveur), *n changements en attente* (durable sur l'appareil), *Hors ligne / Reconnexion nécessaire / Synchronisation impossible pour le moment* (reporté, réessai automatique 30 s), *Conflit à résoudre / Passage refusé* (décision humaine), *Stockage de l'appareil indisponible*. Plus d'UUID ni de révision affichés ; conflit en français avec le libellé du statut serveur.
  - Marqueurs envoyés **après** les passages ; un échec de profil ne bloque plus les passages.
  - Déconnexion (`sign-out-policy.ts`, `GuardedSignOut.tsx`) : appareil de confiance → rien n'est effacé, la file reste sous l'UID ; appareil non approuvé → décompte, dialogue « Des saisies ne sont pas encore envoyées » (Synchroniser d'abord / Rester connecté / Effacer et me déconnecter) ; file illisible = risque, jamais « rien à perdre ». Purge : chaque étape tentée, rapport rendu, purge incomplète signalée sur l'écran de connexion et reprise au démarrage **sans session** seulement.
  - Cache Firestore persistant réservé à l'appareil de confiance (politique documentée).
  - Anomalie I19 : vérification des octets magiques PMTiles ; liste de zone illisible affichée.
- **Tests ajoutés** : `indexeddb-outbox.test.ts` (ouverture impossible, quota plein au milieu puis reprise sans doublon, groupe atomique, rechargement multi-portes chaînées, profil modifié pendant l'envoi, décompte avant déconnexion), `record-local-visit.test.ts` (aucune projection si stockage refusé, groupe non projeté, chaîne), `sync-service.test.ts` (passe reportée sans perte ni réordonnancement, statut serveur plus récent jamais écrasé), `firestore-rest-door-writes.test.ts` (réseau, 503, session, membre suspendu, conflit, réponse perdue, émulateur), `field-sync-status.test.ts`, `sign-out-policy.test.ts`, `device-storage.test.ts` (purge partielle), `footprint-archive.test.ts`, émulateur `firestore-gateway` (autre auteur / session fermée), e2e `field-sync-emulator` (avertissement, « Rester connecté » conserve, confirmation purge).
- **Résultat** : vert (voir §5), sauf le parcours e2e « deux clients » (voir limites).
- **Limites résiduelles** : purge multi-onglets — un autre onglet ouvert peut écrire après la purge (aucune perte, mais donnée laissée sur l'appareil) ; les passages en attente ne sont pas réaffichés dans l'historique de la fiche après rechargement (la porte, si) ; saturation réelle et fermeture de PWA à vérifier sur téléphone.

### A2 — « Ne pas déranger » — commits `8c217f4`, `122aeac`

- **Cause racine** : règle « seul `linked` sort du cycle » écrite dans la spécification et reproduite dans l'ancienneté ; pas de fonction métier commune.
- **Modifications** : `domain/workspace/follow-up.ts` (résultat / éligibilité / exclusion, dérivés du statut courant, sans champ Firestore) ; `buildingFollowUp` calcule l'ancienneté sur les seules portes encore dans le cycle ; filtre, tri, pastille et libellé (« sorti du suivi ») l'utilisent ; « tout marquer absent » passe par `doorsForGroupedAbsence` ; `recordLocalVisits` refuse une porte exclue ; correction d'un « Ne pas déranger » : confirmation explicite portant sur la porte **et** le statut choisi, nouveau passage, historique intact. Docs alignées : `AGENTS.md`, `00-BRIEF.md`, `02-DATA-MODEL.md` (section « Cycle de suivi »), `04-SCREENS.md`.
- **Tests** : `follow-up.test.ts`, `building-staleness.test.ts` (« Ne pas déranger » non suggéré après 90 j, immeuble tout exclu, immeuble mixte, pas de statut dominant, statuts ordinaires), `record-local-visit.test.ts` (action groupée refusée, correction sans effacement).
- **Limites** : la confirmation de correction n'a pas de parcours e2e dédié (testée par la règle et le modèle).

### A3 — Authentification et permissions — commit `acecc3f`

- **Cause racine** : sécurité d'inscription conditionnée par une variable à poser en production ; règles historiques fondées sur un claim seul.
- **Modifications** : `functions/runtime-mode.js` — inscription, amorçage et dérivations historiques exportés **uniquement** si `FUNCTIONS_EMULATOR=true` (posé par l'émulateur, jamais par le cloud) et sans `ATHAR_FUNCTIONS_MODE=production` ; garde d'exécution dans chaque callable. `firestore.rules` : schéma racine fermé à tout client (données conservées, Admin SDK non concerné) ; déplacement / changement de zone d'un bâtiment réservé à l'administrateur actif ; tous les droits viennent du document membre actif du workspace.
- **Tests** : `functions/test/exports.test.js` (production sans variable, variable mal orthographiée, émulateur, émulateur en mode production, garde) ; `tests/emulator/permissions-matrix.rules.test.ts` ; `athar-wp2.rules.test.ts` réécrit pour prouver la fermeture ; tests existants `auth-functions` (inscription locale, création par admin, refus par membre, admin suspendu, amorçage unique et idempotent) verts.

#### Matrice de permissions (imposée par `firestore.rules` + Functions)

| Opération | Anonyme | Authentifié sans profil | Suspendu (même avec claim admin) | Membre actif | Admin actif |
|---|---|---|---|---|---|
| Lire son propre profil membre | — | oui (état d'accès) | oui | oui | oui |
| Lire bâtiments, portes, passages, zones, statuts | non | non | non | oui | oui |
| Enregistrer un passage (lot passage + porte, sous son UID) | non | non | non | oui | oui |
| Composition du foyer, marqueur sœurs | non | non | non | **oui** | oui |
| Créer un bâtiment, décrire / ajouter des portes | non | non | non | oui | oui |
| Archiver une porte jamais visitée | non | non | non | oui | oui |
| Archiver une porte visitée, supprimer porte / bâtiment | non | non | non | non | oui |
| Déplacer un bâtiment, changer sa zone, adresse | non | non | non | non | oui |
| Créer / modifier / supprimer une zone ; modifier un statut | non | non | non | non | oui |
| Modifier ou supprimer un passage | non | non | non | non | non |
| Écrire un membre, `setup`, `zoneStats` | non | non | non | non | non (Admin SDK / Functions) |
| Schéma racine `/zones`, `/buildings/**` | non | non | non | non | non |
| `createMember` | non | non | non | non | oui (claim + profil actif) |
| `registerMember`, `claimInitialAdmin` | émulateur uniquement | | | | |

#### A3.4 — Vérifier les Functions réellement en ligne (lecture seule, non exécuté)

Retirer une Function du code **ne la supprime pas** du cloud. Avant toute ouverture :

```
npm run inventory:cloud:read                     # outil gardé existant, lecture seule
npx firebase functions:list --project athar-dev31
gcloud functions list --project athar-dev31 --format="table(name,state,environment)"
```

L'inventaire du 6 août recevait `PERMISSION_DENIED` sur l'API Functions : le propriétaire du
projet doit faire la lecture. Si `registerMember`, `claimInitialAdmin`, `deriveAtharPassage`,
`deriveAtharSistersMarker` ou `emulatorHealth` apparaissent, les supprimer **après autorisation** :

```
npx firebase functions:delete registerMember claimInitialAdmin --project athar-dev31 --region us-central1
```

### A4 — Routes techniques — commits `a28ba93`

- **Modifications** : constante de compilation `__ATHAR_TECHNICAL_ROUTES__` (vrai en `vite` dev et en `vite build --mode lab`) ; en production un alias remplace `TechnicalRoutes.tsx` par un stub : aucun module de laboratoire n'est émis. `npm run build:lab` → `dist-lab/` (Playwright, jamais déployé). Écran blanc des routes inconnues corrigé (I18). Lien « Laboratoire technique » retiré de `MemberHome`.
- **Tests** : `verify-build.mjs` (modules et chaînes de laboratoire absents en production, présents en recette) ; e2e `production-routes-emulator.spec.ts` : accès direct, actualisation, anonyme, connecté, aucune ressource de lab chargée.

### A5 — Mise en production — commit `a28ba93`

- `npm run build:deploy` = `check-deploy-config.mjs` (4 variables Web présentes, projet = `.firebaserc`/`ATHAR_EXPECTED_PROJECT_ID`, pas d'émulateur, pas de laboratoire, pas de clé de recette, Functions de production = `createMember` seulement ; valeurs jamais imprimées) → build → `verify-build.mjs --deploy` (laboratoires absents, toutes les ressources précachées par `sw.js` présentes, manifeste et icônes, MapLibre différé, projet attendu présent, aucune trace `athar-local`) → `check-backend-contract.mjs` (callables appelées par le frontend ⊂ Functions de production, hors `claimInitialAdmin` réservé à l'émulateur ; écart règles/Functions vs `deploy/backend-state.json` signalé ; écrit `dist/athar-release.json`).
- Workflow : job `verifier` sur les poussées sur `main` et les PR (lint, `tsc -b`, unitaires, Functions, scripts CI, règles + Auth + Functions sur émulateurs, build vérifié, e2e critiques émulateur). Depuis la validation d'intégration, `publier` exige un lancement manuel sur `main` avec `publish=true`, après succès de `verifier` → `build:deploy` → Hosting seul. Aucune publication de règles ni de Functions.
- Commandes Linux : `test:emulator:ci`, `test:e2e:emulator:ci`, `test:functions`, `typecheck` (les scripts PowerShell restent pour Windows).

#### Cohérence des versions (A5.3)

`dist/athar-release.json` (servi avec le site) donne commit, empreinte SHA-256 de `firestore.rules`
et des Functions, Functions de production et callables utilisées. `deploy/backend-state.json`
déclare ce qui est publié ; il vaut `null` (inconnu) aujourd'hui. Après chaque publication
autorisée de règles ou de Functions, y recopier les empreintes de `athar-release.json`.

#### Procédure de déploiement et de retour arrière

1. PR → `verifier` vert → fusion sur `main` sans publication. Lorsqu'une publication est autorisée : lancer manuellement le workflow sur `main` avec `publish` coché ; `verifier` doit réussir avant `publier` (Hosting seul).
2. Règles (autorisation explicite) : `npx firebase deploy --only firestore:rules --project athar-dev31`, puis mettre à jour `deploy/backend-state.json`. **Les règles de ce lot sont rétrocompatibles avec le frontend actuel** ; les publier ferme le schéma historique et la mobilité des bâtiments.
3. Functions (autorisation explicite) : `npx firebase deploy --only functions:createMember --project athar-dev31`, puis A3.4.
4. Retour arrière Hosting : console Firebase → Hosting → historique → « Restaurer », ou `npx firebase hosting:clone athar-dev31:live@<version> athar-dev31:live`. Règles : redéployer `firestore.rules` du commit précédent. Functions : redéployer la version précédente (aucune donnée n'est migrée par ce lot).

## 3. Décisions d'architecture

- **Persistance locale** : la file IndexedDB d'Athar est la seule garantie « enregistré sur l'appareil ». Aucune donnée métier en mémoire volatile présentée comme sauvegardée ; `MemoryOutbox` reste pour les tests et `/technical-map`.
- **Cache Firestore** : persistant seulement sur appareil de confiance. Conséquence assumée : sur un appareil non approuvé, un rechargement **hors ligne** n'affiche plus la zone (message explicite) ; les passages en file survivent et repartent. Retour arrière possible en une ligne dans `client.ts` si le propriétaire préfère l'ancien comportement ; à décider sur appareil réel.
- **Inscription privée** : production = `createMember` par un administrateur actif ; premier administrateur amorcé hors bande (Admin SDK, `scripts/commissioning/plan-bootstrap-admin.mjs`). Inscription et amorçage par callable : émulateur seulement.
- **Coexistence des schémas** : `/workspaces/{id}/…` est le seul schéma client. Le schéma racine WP2 est fermé aux clients, ses données conservées, aucune migration.
- **Composition des foyers et marqueur sœurs** : inchangés (catégories, activation automatique sur « Femme seule », désactivation manuelle, lecture par tout membre actif).

## 4. Risques résiduels

**Résolus** : I1–I23 sauf ci-dessous.

**Partiellement résolus**
- Parcours e2e « deux clients, conflit réel » : le second client (appareil de confiance, cache persistant) ne charge pas dans Chromium headless sans GPU — blocage préexistant sur `main`. Le conflit est prouvé par `tests/emulator/firestore-gateway.integration.test.ts` et les tests unitaires ; le parcours est exclu de la barrière CI (`ATHAR_E2E_SKIP_CONFLICT`).
- Parcours Playwright de laboratoire (carte MapLibre) : très lents ici (rendu logiciel) ; voir §5.
- Purge multi-onglets (dette pilote déjà acceptée).

**À vérifier sur appareil réel**
- Mode avion, fermeture complète de la PWA, réouverture ; saturation de stockage réelle ; navigation privée.
- Cache persistant sur appareil de confiance (blocage observé en headless) et rechargement hors ligne sur appareil non approuvé.
- Mise à jour du service worker pendant une saisie.

**Actions nécessitant une autorisation cloud**
- Inventaire et éventuelle suppression des Functions `registerMember` / `claimInitialAdmin` en ligne (A3.4).
- Publication des nouvelles règles Firestore.
- Renseigner `deploy/backend-state.json` après publication.
- La fusion sur `main` exécute uniquement la validation. Hosting exige désormais un lancement manuel avec `publish=true`.

## 5. État des tests (commandes réellement exécutées, Linux, Node 22.22.0, Java 21)

Base `main` avant le lot : lint vert, 143 tests unitaires verts, 76 tests émulateur verts ;
Playwright : navigateur à pointer (`PLAYWRIGHT_CHROMIUM_EXECUTABLE`), puis 7 parcours lab rouges
et les parcours @emulator rouges (I19, I22, I23).

Fin de lot (commit `1aa7a3b`) :

| Commande | Résultat |
|---|---|
| `npm run lint` | succès |
| `npm run typecheck` | succès |
| `npm run test:run` | 35 fichiers, **185 tests** passés |
| `npm run test:functions` | 5/5 (exports production / émulateur) |
| `npm run test:ci-scripts` | 6/6 (gardes de déploiement) |
| `npm run test:commissioning` | succès |
| `npm run verify:build` | succès : 18 scripts, 18 ressources PWA, laboratoires absents |
| `npm run build:lab` + `node scripts/verify-build.mjs --lab` | succès : laboratoires présents |
| `npm run build:deploy` (config simulée athar-dev31) | succès ; refus vérifiés pour émulateurs activés et mauvais projet |
| `npm run test:emulator:ci` | 11 fichiers, **79 tests** passés (règles, matrice, schéma historique fermé, Auth, Functions, dérivations, structure, pagination) |
| `ATHAR_E2E_SKIP_CONFLICT=true npm run test:e2e:emulator:ci` | **7/7** : invitation sans inscription, 4 parcours routes techniques, purge de déconnexion avec avertissement, pilotage admin |
| `npx playwright test tests/field-sync-emulator.spec.ts -g "two terrain"` | **échec** : second client « appareil de confiance » (cache Firestore persistant) ne charge pas dans Chromium headless ; identique sur `main`. Conflit prouvé par `firestore-gateway.integration.test.ts`. |
| `npx playwright test --grep-invert @emulator` (dist-lab, `--timeout 300000`) | 16/19 au premier passage ; les 3 échecs (sélecteur ambigu, I23 ×2) corrigés puis **3/3** au second passage. Parcours très lents ici (rendu MapLibre logiciel, 4 CPU, pas de GPU). |

Scénarios de résistance : 1 (coupure, rechargement) — tests IndexedDB + e2e purge ; device réel à
faire. 2 (stockage indisponible) — vert. 3 (concurrence) — vert en intégration émulateur, e2e
bloqué par l'environnement. 4 (confidentialité) — vert. 5 (permissions métier) — vert. 6 (sortie
du cycle) — vert. 7 (production) — vert.

## 6. État Git

Branche `lot-a-fiabilite-securite`, issue de `main` @ `cbbeead`, 75 fichiers, +2442 / −538 :

```
1aa7a3b LOT-A: le marqueur sœurs et la composition restent visibles après saisie
122aeac LOT-A: A2 — la correction d'un « Ne pas déranger » confirme le statut choisi
a28ba93 LOT-A: A4/A5 — laboratoires hors production et publication contrôlée
acecc3f LOT-A: A3 — accès privé imposé par les fonctions et les règles
8c217f4 LOT-A: A2 — « Ne pas déranger » sort la porte du cycle de suivi
c85c981 LOT-A: la carte ne s'arrête plus sur une archive d'emprises absente
e0b9f38 LOT-A: A1 — aucune sauvegarde présentée comme durable sans l'être
```

plus le commit de documentation de clôture. Aucune migration de données n'est nécessaire.

## 7. Verdict

| Sous-lot | État |
|---|---|
| A1 — Persistance hors ligne | corrigé (vérifications appareil réel à faire) |
| A2 — Ne pas déranger | corrigé |
| A3 — Authentification et permissions | corrigé côté code ; publication des règles et nettoyage des Functions en ligne en attente d'autorisation |
| A4 — Routes techniques | corrigé |
| A5 — Mise en production | corrigé |

**GO pour le lot B**, sous réserve de ne pas ouvrir l'accès élargi avant : (1) l'inventaire des
Functions en ligne et la suppression éventuelle de `registerMember` / `claimInitialAdmin`,
(2) la publication autorisée des nouvelles règles, (3) les vérifications sur téléphone réel.
