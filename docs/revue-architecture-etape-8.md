# Revue d'architecture de l'etape 8

Date : 3 aout 2026  
Perimetre : synchronisation terrain IndexedDB vers Firestore, sans etape 9 ni deploiement cloud

## Verdict

**GO pour l'etape 9.**

Le batch porte + passage, la reprise UUID, les revisions concurrentes, les
refus Firebase, la partition UID et la purge d'un appareil non approuve sont
maintenant couverts par des preuves distinctes. La revue a trouve plusieurs
faux positifs dans les diagnostics et la purge, corriges sans changer le
perimetre fonctionnel de l'etape 8.

Les dettes Auth reelle, Android physique et purge Firestore avec un second
onglet encore ouvert restent non bloquantes pour construire le pilotage desktop
prive. Elles restent bloquantes avant une beta terrain sur appareil partage ou
une ouverture elargie.

## Defauts trouves et corriges

1. Un compte Auth dont le document `members/{uid}` avait ete supprime produisait
   une erreur de diagnostic au lieu de `inactive-member`. L'absence et la
   desactivation du membre ont maintenant la meme classification non
   reappliquable.
2. Un statut devenu inactif et une revision concurrente pouvaient etre classes
   comme simple conflit. Le diagnostic reconnait d'abord un UUID deja accepte,
   puis classe le statut inactif comme `invalid-intent`, avant d'envisager un
   conflit de revision.
3. L'adaptateur terrain comparait l'auteur a l'UID capture par le composant. Il
   consulte maintenant `auth.currentUser.uid` au moment exact de l'envoi ; une
   session fermee ou remplacee ne peut pas envoyer l'ancienne partition.
4. `markConflict` et `markRejected` lisaient puis reecrivaient IndexedDB dans
   deux transactions. Une purge concurrente pouvait donc ressusciter une
   intention. Chaque mutation d'etat est maintenant atomique dans une seule
   transaction et les decisions concurrentes de deux onglets sont serialisees.
5. La deconnexion supprimait l'outbox et les caches PWA mais pas une ancienne
   persistance Firestore. Elle termine maintenant l'instance, appelle
   `clearIndexedDbPersistence`, puis recharge le shell. Une commande de
   deconnexion a aussi ete ajoutee au parcours carte, ou elle manquait.
6. Les identifiants de documents contenant un chemin et les pannes Firestore
   explicites `unavailable`, `deadline-exceeded` ou `cancelled` sont rejetes ou
   conserves hors ligne avant toute construction de lot invalide.

## Matrice de revue

| Risque examine | Preuve obtenue | Conclusion |
|---|---|---|
| Batch porte + passage | Regles et adaptateur creent `visits/{uuid}` et avancent la porte dans un seul `writeBatch` | Conforme |
| UUID apres interruption | Un second envoi exact reconnait `lastVisitId`, revision et statut, meme si le statut est ensuite desactive | Conforme |
| Revisions chainees | Recalage atomique de la chaine, UUID conserves, dependances bloquees apres le premier conflit | Conforme |
| Deux clients concurrents | Deux navigateurs hors ligne, reprise sequentielle, vrai conflit puis reapplication | Conforme |
| Refus Firebase | Membre absent/inactif, auteur different, statut inactif, donnee invalide et securite restent distincts du conflit | Conforme |
| Auth au moment d'envoyer | L'UID vient de `auth.currentUser`, pas d'une valeur de session capturee | Conforme |
| IndexedDB UID/multi-onglets | Partitions UID, ajout sans ecrasement, mutations atomiques et courses purge/resolution testees | Conforme pour l'outbox |
| Cache d'appareil de confiance | Memoire par defaut, persistance seulement apres accord et rechargement | Conforme |
| Purge deconnexion | E2E : outbox UID vide et base Firestore persistante supprimee apres logout non approuve | Conforme sur un onglet |
| Hors ligne | Intention conservee, aucun retrait avant accuse serveur, reprise reseau testee | Conforme |
| Futurs depots Firestore de lecture | Les contrats `listByViewport`, `listByBuilding`, `get`, `list` et les codecs restent independants de React | Compatible, implementation a faire |

## Validations rejouees

| Commande | Resultat |
|---|---|
| `npm run lint` | Passe sans avertissement. |
| `npm run test:run` | 35 tests dans 11 fichiers passent. |
| `npm run test:emulator` | 32 tests dans 5 fichiers passent, dont Auth, Functions, regles, geohash et diagnostics de synchronisation. |
| `npm run test:e2e:emulator` | 2 parcours passent : conflit a deux clients ; purge outbox UID + persistance Firestore au logout. |
| `npm run test:e2e` | 3 parcours passent ; PMTiles hors ligne rend 272 entites, 268 couleurs significatives sur 892 707 pixels. |
| `npm run verify:build` | Passe ; bundle initial 214,12 ko minifie, 67,14 ko gzip, MapLibre reste differe. |
| `npm audit --omit=dev` | 0 vulnerabilite de production. |

La regression geohash charge 30 plages sur 10 000 portes generees : 812
lectures brutes et uniques, aucun doublon, 504 correspondances, 308 faux
positifs filtres cote client et aucun faux negatif.

## Risques residuels acceptes

1. La purge Firestore a ete prouvee avec un onglet. Un autre onglet encore
   actif peut empecher le navigateur de supprimer immediatement la base ; ce
   cas doit etre ferme avant beta sur appareil partage.
2. L'ecriture de l'intention IndexedDB et le lot du depot local de demonstration
   ne partagent pas une transaction physique. L'outbox est ecrite en premier et
   rend la saisie recuperable, mais le futur depot Firestore de lecture devra
   definir explicitement sa reconstruction apres interruption.
3. `navigator.onLine` ne prouve pas l'accessibilite du serveur. Les erreurs
   reseau Firebase explicites restent en attente, mais Android physique reste
   necessaire avant beta terrain.
4. Les lectures carte, portes et visites utilisent encore le depot de
   demonstration. L'etape 9 peut ajouter les depots Firestore de lecture sans
   modifier les contrats de domaine ni le service de synchronisation.
5. La creation/suppression libre-service Auth reelle sur `athar-dev31` reste la
   dette privee deja acceptee. Les regles bloquent tout compte sans membre actif.
6. Firebase Functions demande Node 22 alors que l'hote local lance Node 24.

## Condition de passage

Le GO technique de cette revue reste acquis. Une decision produit ulterieure du
3 aout 2026 intercale toutefois le mini-lot 8.5 sur la structure des batiments et
la saisie terrain avant le pilotage. L'etape 9 attend donc maintenant un GO
explicite apres la revue 8.5. Elle devra conserver toutes les regressions de
cette revue, ne jamais charger toutes les portes et ne pas transformer les
projections `zoneStats` en source de verite.
