# Lot B — vérité des données

Base : `main` après intégration du lot A, `a6bfc67` (PR #1).
Cette spécification complète l'audit initial de `cbbeead` ; elle décrit le schéma actif.
Le code du lot B est implémenté sur `lot-b-verite-donnees` : lectures communes, catalogue,
diagnostic, reconstruction serveur et rafraîchissement des consommateurs. Les commandes
opérationnelles sont livrées et testées sur émulateurs. Aucun déploiement, inventaire cloud,
import de catalogue réel ou migration de données historiques n'est effectué dans ce lot.
La suppression des données et outils historiques dépend de l'inventaire réel et reste interdite.

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

Le producteur `functions/stats-core.js` vérifie la cohérence de `lastVisitId`, de la révision, du statut
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

**État au commit B1 (dépassé par les sous-lots ci-dessous) :** les anciens `zoneStats` ne sont pas
reconstruits ; les lectures restent ponctuelles ou issues du cache selon le parcours.
Les compteurs locaux des bâtiments ne sont pas des confirmations serveur. L'activité
du jour, les couleurs dominantes, les races de chargement et le suivi des portes anciennes
restent à corriger dans B5. B1 ne clôture pas l'ensemble du lot B.

## Découpage de référence et critères de recette

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


## Implémentation B2–B6

### Catalogue et couverture (B2)

`scripts/carto/catalogue.mjs` transforme le GeoJSONL **avant tuilage** en catalogue.
Il déduplique les RNB multi-emprises et choisit comme ancrage le sommet extrême ouest,
puis sud à égalité. Le point appartient à l'emprise ; il est déterministe quel que soit
l'ordre des emprises. Il peut différer du centre visuel des tuiles. Les points sur la
limite sont inclus. Une emprise dans deux zones appartient aux deux dénominateurs :
**ne pas additionner les couvertures des zones pour calculer un total communal**.

La complétude porte sur la source résidentielle filtrée annoncée, pas sur tous les
bâtiments existant réellement. Elle exige un périmètre explicitement déclaré, une
source complète et une zone entièrement contenue dans ce périmètre. Un extrait de
laboratoire n'est pas complet. Le hash protège les données, la géométrie de zone et
la version ; une modification de polygone rend le catalogue de cette zone inutilisable
jusqu'à régénération. Les bâtiments hors catalogue restent comptés séparément.

`build_tiles.sh` peut produire cet artefact via `ATHAR_CATALOGUE_EXTENT` et
`ATHAR_CATALOGUE_COMPLETE=true`. Sans déclaration, aucune couverture totale n'est inventée.
Le catalogue n'a aucun besoin de documents `buildings` pour les emprises non décrites.

### Convergence et diagnostic (B3/B6)

`data-audit.mjs` analyse un export logique `{path,data}[]`, retourne les anomalies,
les références hachées et un plan stable basé sur les **chemins complets** historiques.
Toutes les correspondances historiques restent en quarantaine : auteur, date, ordre des
révisions, identité RNB et rattachement de zone ne sont jamais inventés. L'outil signale
les orphelins, statuts inconnus, révisions ambiguës, historiques incomplets, corrections
invalides et dates de porte manquantes, y compris sur les portes archivées.

`inventory-data.mjs` lit le canonique à un instantané cohérent et parcourt les sous-collections
racines, même si un parent a été supprimé. Il n'écrit qu'un rapport expurgé ; aucune note,
composition de foyer ou marqueur sensible n'est exporté. Le parcours historique est un
inventaire diagnostique, pas une sauvegarde transactionnelle. Il ne permet jamais à lui
seul de supprimer l'historique. `seed:wp2`, les dérivations locales et les tests historiques
restent des fixtures explicitement réservées à l'émulateur. Leurs accès production restent
fermés par A. Une suppression aveugle de ces chemins ferait courir un risque de perte de
passages ; elle n'est donc pas une condition artificielle pour intégrer le code B.

### Reconstruction et maintien (B4)

- `stats-core.js` : calcul pur ; preuve par passage référencé, statut, auteur présent,
  date, acquittement serveur, révision maximale unique et chaîne complète. Les corrections
  suivent les révisions, jamais l'horloge du téléphone. Les portes archivées ne comptent pas.
- `stats-rebuild.js` : pages de 400 documents dans **une transaction en lecture seule**, à
  un `readTime` obtenu du serveur. Zones, structures, portes, visites et catalogue ont le
  même instantané. Le résultat est publié atomiquement avec génération, versions, dates,
  empreinte géométrique et état de complétude. Un compare-and-set sur `sourceReadTime`
  empêche tout retour à une génération plus ancienne, y compris après événements désordonnés.
- `stats-triggers.js` : changements de portes, passages, bâtiments, zones et manifestes
  de catalogue. Un événement déjà couvert par le dernier instantané est ignoré. Les seuls
  changements de profil sensible n'invalident pas les statistiques. Les erreurs transitoires
  sont rejouées. Les déplacements reconstruisent toutes les zones, ancienne et nouvelle.
- `rebuildZoneStats` : callable réservée à un administrateur actif avec rôle admin vérifié.
  `stats:rebuild` fournit aussi un diagnostic sans écriture par défaut et une réparation
  explicite avec confirmation du projet sur la ligne de commande.

**Budget explicite :** 50 000 documents lus et 250 zones par workspace/reconstruction.
Cela inclut l'historique et les fragments du catalogue. Le catalogue est aussi borné à
250 000 identités chargées et la publication à 500 écritures atomiques. Le dépassement ou une interruption
invalide les anciens relevés (`incomplete`) sans publier une somme partielle ; l'erreur de
budget n'est pas rejouée indéfiniment. Un nouveau rebuild répare l'état. La pagination
est vérifiée au-delà des anciennes limites de 250. Pour un workspace dépassant ce budget,
il faudra partitionner les reconstructions par zone avec le même contrat de lecture ;
augmenter arbitrairement le plafond ou additionner des pages non cohérentes est interdit.
Le scan complet privilégie la correction pour le volume actuel ; son coût doit être mesuré
avant une montée en charge. Il ne constitue pas un calcul incrémental à coût constant.

Sources SDK : [transactions Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions),
[options Node de transaction](https://github.com/googleapis/nodejs-firestore/blob/main/types/firestore.d.ts),
[livraison des événements](https://firebase.google.com/docs/functions/firestore-events).

### Écrans et sémantique (B5)

Carte, polygones, choix de zone et administration lisent la même génération. Les abonnements
Firestore se désabonnent au changement de zone/démontage et répercutent visites, archives,
reconstructions et suppressions. Les lectures du cache sont identifiées. Le relevé ancien
sans métadonnées B est explicitement non reconstruit ; sa date n'est jamais remplacée par
la date de lecture. Une projection invalide ne donne pas zéro.

La liste terrain charge les portes par bâtiment, même hors bbox. Les réponses de la zone
précédente sont ignorées. Les compteurs terrain sont décrits comme des portes chargées,
avec d'éventuels passages locaux en attente ; ils ne deviennent pas des acquittements
serveur. Le retour de fiche recharge la zone. Une ancienne porte éligible reste proposée
même si sa voisine est récente ; DND/linked restent exclus. Une référence sans date donne
« date inconnue ». « Pas encore fait » inclut un bâtiment partiellement visité s'il conserve
des premières visites à faire. L'activité du jour est explicitement celle de la zone,
tous auteurs, d'après les derniers passages connus. La durée inférée n'est plus affichée
comme durée d'une sortie. Un statut inconnu ne devient pas « Contact établi ».

### Contrat de publication et retour arrière (B6)

Le contrat de A inclut explicitement les cinq triggers et `rebuildZoneStats`. L'empreinte
Functions comprend tous les modules JavaScript de production et le lockfile. L'inscription
publique et les dérivations racines restent exclues de la production. Aucun index composite
nouveau n'est nécessaire : le scanner pagine par identifiant de document, sans filtre composé.
`deploy/backend-state.json` conserve ses valeurs inconnues jusqu'à une publication attestée.

Avant toute opération réelle : vérifier le projet, conserver une sauvegarde complète
chiffrée des données, exécuter le diagnostic, examiner les quarantaines et simuler le rebuild.
Le rapport expurgé n'est pas une sauvegarde. La migration des archives ne doit pas être
couplée au déploiement de l'interface. Après publication autorisée des Functions, lancer une
reconstruction initiale : les triggers ne rejouent pas spontanément tout le stock préexistant.
Comparer son résultat au diagnostic et contrôler ses anomalies.

En cas de retour arrière : suspendre/retirer les nouveaux triggers si nécessaire,
conserver les passages nouveaux, corriger ou restaurer le producteur puis **recalculer**
une génération à partir du canonique. Ne jamais restaurer un ancien instantané des portes
sur les nouveaux passages ; ne jamais réactiver le schéma racine. L'interface doit garder
les contrôles de complétude et les dates de relevé durant cette opération.

## Commandes opérateur (non exécutées en production)

```bash
# Diagnostic local d'un export logique ; sortie sans champs sensibles.
npm run audit:data -- --input export.json --workspace main --output diagnostic.json
# Inventaire réel, uniquement lecture ; nécessite une identité cloud déjà autorisée.
node scripts/commissioning/inventory-data.mjs --project PROJET --workspace main --output diagnostic.json
# Catalogue indépendant des tuiles ; --complete uniquement sur une source complète vérifiée.
node scripts/carto/catalogue.mjs --input batiments_avec_rnb.geojsonl --output catalogue.json --extent 1.3,43.5,1.6,43.8 --complete
# Simulation puis activation explicite d'un catalogue (fragments avant manifeste).
npm run stats:rebuild -- --project PROJET --workspace main --catalogue catalogue.json
npm run stats:rebuild -- --project PROJET --workspace main --catalogue catalogue.json --apply --confirm-project PROJET
# Simulation puis publication atomique des statistiques.
npm run stats:rebuild -- --project PROJET --workspace main
npm run stats:rebuild -- --project PROJET --workspace main --apply --confirm-project PROJET
```

Les générations de catalogue sont conservées ; ne pas effacer leurs fragments tant qu'un
manifeste peut les référencer. Un changement de catalogue ou de géométrie déclenche la
reconstruction ; tant que le catalogue ne correspond plus à la géométrie, seule la
progression des portes est exploitable et la couverture géographique est indisponible.

## Recette de l'implémentation complète

Sous Node 22 : lint, typage et build de production vérifié ; **210 tests unitaires**, **14
contrôles Functions**, **4 tests catalogue/diagnostic**, **6 contrôles de configuration**, **84
tests Firestore/Auth** et **10 parcours navigateur sur émulateurs** réussis. La reconstruction
est testée à 900 portes, avec écriture entre les pages, publication concurrente, génération
retardée, interruption, réparation, archivage et suppression de zone. Le navigateur vérifie
l'actualisation automatique après passage et archivage sans rechargement. La recette du
lot A conserve le conflit réel à deux appareils et la purge à la déconnexion.

Les tests Functions sont exécutés avant les fixtures de charge qui alimentent la file
sérielle de l'émulateur. Tous les tests sont conservés, sans allongement de leurs délais.
La vérification d'interface mobile a été effectuée sur la carte de laboratoire ; les
appareils physiques et la configuration de production restent hors de cette recette.
