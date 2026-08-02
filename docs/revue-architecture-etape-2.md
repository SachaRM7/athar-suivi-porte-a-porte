# Revue d'architecture de l'etape 2

Date : 29 juillet 2026  
Verdict : **NO-GO provisoire pour l'etape 3**

## Constats bloquants

### P0 - La preuve Firestore n'est pas une preuve Firestore

La reprise et les conflits sont verifies contre `MemoryDoorGateway`. Aucun
fichier de regles, aucun emulateur et aucune persistance Firestore web ne sont
executes. L'adaptateur reel ne sait pas encore distinguer un conflit de revision
d'un rejet de securite : dans les deux cas, Firestore peut renvoyer une erreur de
permission. Construire le socle sur cette simulation figerait un contrat non
verifie.

### P0 - La boite d'envoi disparait au rechargement

`MemoryOutbox` perd toutes les intentions si le navigateur ferme l'onglet,
recharge la page ou est termine par Android. C'est precisement le scenario
terrain que l'architecture cherche a couvrir. La boite IndexedDB doit etre
implementee, partitionnee par UID et testee avec rechargement avant le socle V1.

### P0 - Le fond de carte actuel ne peut pas devenir le mode hors ligne

Le laboratoire utilise `tile.openstreetmap.org`. Sa politique autorise la
consultation interactive et le cache conforme aux en-tetes, mais interdit le
prechargement et l'usage hors ligne. Athar doit choisir PMTiles auto-heberge ou
un fournisseur qui autorise explicitement le telechargement de zones. Le cache
actuel de 64 tuiles ne couvre qu'un voisinage minuscule et n'expire pas selon les
en-tetes du fournisseur.

## Constats majeurs

### P1 - Le test cartographique peut passer avec une carte vide

Playwright verifie le shell, le conteneur MapLibre et le GeoJSON en cache. Il ne
controle ni les pixels du canvas apres coupure, ni la couverture des tuiles, ni
la taille du paquet. Une verification de pixels ou une comparaison d'image est
requise, puis un test sur Chrome Android physique.

### P1 - La fermeture de l'inscription etait seulement implicite

L'absence de bouton d'inscription ne bloque pas l'API Firebase. L'architecture
est corrigee : les actions de creation/suppression par les utilisateurs finaux
doivent etre desactivees dans Firebase Authentication, et les comptes crees par
Admin SDK. Cette configuration et son erreur `admin-restricted-operation`
doivent etre testees.

### P1 - Deux erreurs de causalite existaient dans le prototype

Les identifiants `visit-1` entraient en collision entre appareils. De plus, une
seconde ecriture locale pouvait etre envoyee apres le conflit de la premiere et
ecraser indirectement l'etat distant. Le petit prototype est corrige : UUID par
defaut, UID auteur dans l'intention, revisions locales chainees et blocage des
intentions dependantes. Deux tests de regression ont ete ajoutes.

## Montee en charge

Le modele mentionnait un geohash sur les logements sans le declarer dans leurs
champs. La documentation est corrigee. Restent non mesures : nombre de plages
geohash par viewport, faux positifs, deduplication, limites de lectures,
strategie de chargement des zones visibles et contention des compteurs de zone.

Le bundle cartographique pese environ 1,13 Mo minifie. Le chargement differe de
MapLibre est obligatoire avant la V1, mais ce poids seul ne bloque pas le mini-lot
2B.

## Conditions de levee du NO-GO

Le mini-lot 2B doit produire toutes les preuves suivantes :

1. Firebase Emulator Suite operationnelle avec Auth, Firestore et Functions.
2. Regles testees pour roles, auteur, champs autorises, creation immuable du
   passage, revision et coherence atomique `door` + `visit`.
3. Adaptateur classant correctement conflit, session inactive, auteur different
   et donnee invalide apres un rejet serveur.
4. Boite IndexedDB survivant au rechargement, partitionnee par UID, avec chaine
   de revisions et blocage des dependances.
5. Creation de compte utilisateur final desactivee et creation Admin SDK testee.
6. Source cartographique compatible offline choisie, volume Toulouse mesure et
   rendu hors ligne verifie par pixels puis sur Chrome Android.
7. Test de viewport geohash sur un jeu genere suffisamment grand, avec nombre de
   lectures et doublons consignes.

Une fois ces sept conditions vertes, une courte revue Sol peut prononcer le GO
pour l'etape 3.

## Sources de decision

- [Persistance et dernier ecrivain Firestore](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Desactivation des actions utilisateur Firebase Auth](https://firebase.google.com/docs/auth/users#user_self-service)
- [Creation de comptes avec Admin SDK](https://firebase.google.com/docs/auth/admin/manage-users#create_a_user)
- [Politique des tuiles standard OSM](https://operations.osmfoundation.org/policies/tiles/)

