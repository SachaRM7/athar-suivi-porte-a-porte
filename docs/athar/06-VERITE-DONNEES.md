# Lot B — vérité des données

Base : `main` après intégration du lot A, `a6bfc67` (PR #1).
Cette spécification complète l'audit initial de `cbbeead` ; elle décrit le schéma actif.
Le premier sous-lot B1 est implémenté sur `lot-b-verite-donnees`. Les sous-lots suivants
restent à réaliser. Aucun déploiement, inventaire cloud ou migration n'est effectué ici.

## Contrat canonique

`workspaces/{workspaceId}` est le seul modèle de l'application :

| Collection | Rôle |
|---|---|
| `buildings` | Identité RNB ou `local_…`, rattachement de zone, position et révision de structure |
| `doors` | Structure active/archivée, révision, résultat et référence du dernier passage |
| `visits` | Historique immuable ; UUID idempotent, auteur, dates, révision et références de correction |
| `zones`, `statuses`, `members` | Configuration et droits du workspace |
| `zoneStats` | Relevé dérivé, réparable ; jamais source de vérité des passages |

Le schéma racine `buildings/{id}/doors/{id}/passages/{id}` et ses champs français sont
historiques. Le lot A ferme leurs accès clients et réserve leurs dérivations aux émulateurs.
Leur existence dans le dépôt ne prouve ni leur présence ni leur absence en production.
Conserver leurs données et les tests de fermeture tant que l'inventaire n'est pas terminé.
Ne jamais déplacer simplement les anciens triggers vers les chemins plats.

| Identifiant workspace | Clé visuelle/historique | Compté avec passage dans un relevé valide | Suivi ordinaire |
|---|---|---|---|
| `unvisited` | `todo` | non | première visite |
| `contacted` | `open` | oui | revisite autorisée |
| `retry` | `away` | oui | revisite autorisée |
| `linked` | `linked` | oui | exclu |
| `do-not-return` | `dnd` | oui | exclu |
| `locked` | `locked` | oui | revisite autorisée |

Un identifiant inconnu n'est ni un contact établi ni une porte visitée par défaut.
Le marqueur sœurs et la composition du foyer ne sont pas des statuts et n'entrent pas
dans les exports statistiques. Les statuts dominants des couleurs ne prouvent aucune
complétude. `coverageState` est une déclaration de coordination, pas un résultat calculé.

## Unités et formules

- **D** : bâtiments détectés uniques du catalogue RNB complet, pour la géométrie et la
  version du référentiel considérées. Aucun comptage des seules tuiles visibles :
  découpage, doublons et simplification de zoom rendent ce dénominateur incomplet.
- **S** : bâtiments du catalogue décrits avec au moins une porte active.
- **V** : bâtiments du catalogue avec au moins une porte active ayant un passage valide.
- **P** : portes actives décrites ; **PV** : ces portes avec passage valide.
- Couverture géographique : **V/D** ; description du référentiel : **S/D** ;
  progression des portes décrites : **PV/P**. Ces trois mesures portent des libellés distincts.
- Les bâtiments locaux hors catalogue sont comptés séparément, sans gonfler V.
  Ne jamais créer de bâtiments Firestore pour matérialiser artificiellement D.
- Un dénominateur inconnu donne « Indisponible ». Un ensemble connu vide n'a pas de
  pourcentage. Un ensemble non vide sans passage donne un vrai 0 %. Les pourcentages
  entiers sont tronqués : 999/1000 donne 99 %, jamais 100 % avant complétude.

Le producteur futur doit prouver la cohérence de `lastVisitId`, de la révision, du statut
et du passage référencé. Il ne doit pas déduire un passage de `currentStatusId != unvisited`
seul, ni choisir une correction à partir de la seule date saisie sur un appareil.

## B1 — Lecture commune et indicateurs honnêtes (implémenté)

Fichiers : `src/domain/workspace/{status-ids,zone-progress,models}.ts`,
`src/infrastructure/firestore/workspace-codecs.ts`,
`src/features/zones/model/zone-progress-label.ts`,
`src/features/map/{components/WorkspaceMap,model/footprints}.tsx|ts`,
`src/features/admin/components/AdminDashboardPage.tsx`,
`src/features/auth/components/LoginPage.tsx`.

Le relevé existant est admis seulement si les compteurs sont des entiers sûrs positifs
ou nuls, tous les statuts sont canoniques et leur somme égale exactement `doorCount`.
Une catégorie omise peut alors valoir zéro ; une somme inférieure au total est invalide.
Ce contrôle prouve la cohérence interne, **pas** la concordance avec l'historique.

Carte, polygones, choix de zone et administration appliquent `zoneDoorProgress`.
La carte n'affiche plus le ratio de bâtiments Firestore touchés comme couverture de zone.
La progression affichée est celle du relevé de portes, avec sa date d'origine et une
mention que les passages récents peuvent manquer. Aucune date de lecture ne remplace
`updatedAt`. Aucun seuil arbitraire ne transforme un vieux relevé en relevé frais.
Sans catalogue complet, la couverture des bâtiments est explicitement indisponible.
Le contrôle admin est renommé « Compteur par statut » : il ne filtre pas les bâtiments.
Un catalogue de libellés incomplet est signalé dans la répartition, sans changer le total
ni la formule fondée sur les identifiants persistés.

Acceptation : mêmes unités et même résultat pour le même relevé ; null/ensemble vide/vrai
zéro distincts ; 3/6 portes donne 50 % même si les deux bâtiments sont touchés ; catalogue
de libellés incomplet sans effet sur la formule ; aucun 100 % fabriqué par des statuts
inconnus, une somme partielle ou l'arrondi. Tests unitaires, codecs et navigateur dédiés.

**Limites assumées de cette première tranche :** les anciens `zoneStats` ne sont pas
reconstruits ; les lectures restent ponctuelles ou issues du cache selon le parcours.
Les compteurs locaux des bâtiments ne sont pas des confirmations serveur. L'activité
du jour, les couleurs dominantes, les races de chargement et le suivi des portes anciennes
restent à corriger dans B5. B1 ne clôture pas l'ensemble du lot B.

## Suite ordonnée et critères de clôture

| Ordre | Sous-lot / fichiers concernés | Acceptation et tests nécessaires |
|---|---|---|
| B2 | Catalogue complet versionné : `scripts/carto/{join_rnb.py,prepare_tile_features.py,build_tiles.sh,validate_pipeline.py}`, modèle de catalogue à ajouter, `src/features/zones/model/zone-geometry.ts`, `docs/athar/03-CARTO.md` | Dédupliquer par RNB avant tuilage ; définir un point de rattachement stable, limites incluses et politique de chevauchement. Conserver empreinte, version, périmètre et indicateur de complétude. Tests : 100 détectés/1 visité = 1 %, RNB multi-emprises, limites/chevauchements, catalogue démo ou absent, bâtiment local, géométrie modifiée. Zoom et déplacement ne changent pas D. |
| B3 | Inventaire et convergence : outils de diagnostic à ajouter sous `scripts/commissioning/`, `src/domain/workspace/models.ts`, codecs, documentation des deux schémas | Inventaire en lecture seule par workspace et chemins historiques : orphelins, références/révisions, statuts, archives, dates manquantes et doublons. Plan de correspondance stable basé sur les chemins complets ; les IDs de porte historiques peuvent se répéter entre bâtiments. Ne pas inventer auteur/date. Mettre les ambiguïtés à part. Tests sur exports synthétiques, simulation répétée identique, aucune écriture par défaut ni champ sensible dans le rapport. Migration réelle séparée, sauvegardée, idempotente et traçable. |
| B4 | Reconstruction et maintien de `zoneStats` : modules Functions dédiés, `functions/index.js`, commande de reconstruction, `models.ts`, codecs, `firestore.indexes.json`, `scripts/ci/{deploy-config,check-backend-contract}.mjs`, `deploy/backend-state.json` | Calculer depuis le canonique validé, uniquement portes actives ; distinguer compteurs de portes, bâtiments et couverture. Métadonnées version de schéma/formule, génération, date de lecture des sources, date de calcul, version catalogue, empreinte de zone, état de complétude et anomalies. Recalcul idempotent à l'état courant, jamais incréments aveugles par événement. Doublons, événements désordonnés et générations concurrentes ne doivent pas écraser un résultat plus récent. |
| B5 | Consommateurs et rafraîchissement : dépôts de lecture, `terrain-session-repositories.ts`, `WorkspaceMap.tsx`, `MapPage.tsx`, `AdminDashboardPage.tsx`, `LoginPage.tsx`, `building-{detail,staleness}.ts`, `terrain-session.ts`, `footprints.ts` | Même mesure et même génération partout ; provenance serveur/cache/local explicite. Abonnement ou invalidation après visite, structure, archivage, déplacement et changement de zone ; annulation des lectures périmées. Portes rattachées hors bbox prises en compte. Une date absente avec `lastVisitId` signifie « date inconnue », pas « jamais vu ». Une porte éligible ancienne reste proposée même si une autre est récente ; DND/linked restent exclus. Renommer l'activité reconstituée, ne pas l'appeler durée de sortie réelle. Tests changements rapides de zone, cache incomplet, réseau coupé, échec de lecture, correction, portes archivées, contributions locales puis acquittées. |
| B6 | Retrait maîtrisé de l'historique : anciens seeds/derivations, tests historiques, `docs/athar/02-DATA-MODEL.md`, procédure de recette/reconstruction | Après inventaire et convergence vérifiés seulement : retirer les outils opérationnels obsolètes, garder les refus d'accès et les fixtures utiles. Tests de non-régression A, audit après reconstruction sans écart, recette sur données représentatives. Retour arrière par version de projection sans effacer les nouveaux passages. Publication séparée de l'intégration du code. |

Pour B4, les zones bornées peuvent être reconstruites dans une transaction cohérente.
Pour les zones dépassant le budget, paginer avec une stratégie de lecture cohérente et
une génération isolée ; ne jamais publier une somme de pages lues à des états différents.
L'ancienne génération reste identifiable pendant la reconstruction. Une limite atteinte
ou un échec donne « incomplet/indisponible », jamais un relevé partiel publié comme complet.
Les triggers doivent couvrir visites/portes, structures, déplacements entre deux zones,
archives et géométrie ; le catalogue doit invalider les générations qui en dépendent.

Tests B4 : reprise après interruption, doublon d'événement, ordre inversé, deux rebuilds
concurrents, écriture pendant le scan, déplacement (ancienne et nouvelle zones), correction
de passage, suppression structurelle et archivage. Comparer la projection au recomptage
indépendant. Vérifier les limites de lecture sur une zone supérieure aux seuils actuels.

## Dépendances et protection du lot A

- Ne pas réintroduire de repli mémoire dans les files, modifier l'ordre « durable puis
  affiché », ni mêler intentions locales et visites acceptées dans les statistiques serveur.
- Réutiliser `follow-up.ts` et la confirmation DND ; ne pas ouvrir les règles pour écrire
  `zoneStats` depuis le client. Conserver les refus pour comptes suspendus et schéma racine.
- Les exports Functions de B4 doivent être ajoutés explicitement au contrat de publication
  de A. L'empreinte actuelle ne couvre que `index.js` et `runtime-mode.js` : l'étendre à
  tous les modules de production ajoutés, sans réexporter les fonctions d'inscription.
- `WorkspaceMap.tsx` et les tests terrain sont partagés avec A : conserver la suppression
  de la boucle `idle`, la validation PMTiles et le scénario à deux appareils en CI.
- Ne pas confondre fusion du code et validation de la production : aucune modification
  des Functions/règles réellement en ligne n'est attestée par ces changements.

## Validation de B1

Sous Node 22.23.3 : lint et build de production vérifié réussis, **203 tests unitaires**,
**79 tests Firestore/Auth** et **9 parcours navigateur émulateurs** réussis.
Le nouveau parcours compare carte, administration et choix de zone sur le même relevé
à 50 %, puis supprime ce relevé et vérifie « indisponible » sur les trois écrans.
Il vérifie également qu'un statut absent du catalogue ne transforme pas 50 % en 100 %.
La recette laboratoire valide ses 19 parcours existants ; le nouveau cas de progression
mobile est validé séparément après retrait d'une attente de sept tuiles propre au cadrage
desktop. La progression ne dépend pas du nombre de tuiles visibles.
Les réserves du lot A sur la production et les appareils physiques restent applicables.
