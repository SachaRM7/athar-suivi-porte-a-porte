# Courte revue Sol apres lot de levee 2B

Date : 29 juillet 2026  
Verdict : **GO conditionnel pour l'etape 3**

## Revue des trois conditions rouges

### Auth reel : DETTE ACCEPTEE

Le projet Firebase de developpement `athar-dev31` est maintenant disponible et
a ete teste sans deploiement applicatif. La creation privilegiee OAuth/admin
fonctionne (`projects/{id}/accounts` retourne 200). En revanche, la creation
libre-service par cle Web fonctionne aussi (`accounts:signUp` retourne 200) et
la suppression par utilisateur connecte fonctionne (`accounts:delete` retourne
200). La condition de fermeture Auth stricte n'est donc pas levee. Decision
produit du 29 juillet 2026 : cette dette est acceptee pour l'etape 3, car
l'application reste privee, non diffusee hors cercle de confiance, et les regles
Firestore exigent toujours un document `members/{uid}` actif pour acceder aux
donnees metier.

### Toulouse hors ligne : SUSPENDU

La partie navigateur est maintenant solide : paquet PMTiles Toulouse de
20 607 579 octets, lecture partielle depuis Cache Storage, rechargement reseau
coupe, 272 entites rendues et comparaison de pixels concluante. En revanche,
aucun `adb` ni appareil Android physique n'est disponible pour l'essai Chrome en
mode avion. Sur demande produit du 29 juillet 2026, cette preuve Android est
mise en suspens et ne bloque plus le passage a l'etape 3. Elle reste a refaire
avant une beta terrain.

### Budget geohash : VERT

Les requetes sont executees contre Firestore Emulator sur 10 000 positions
distinctes : 30 plages, 812 lectures candidates, 504 portes utiles, 308 faux
positifs, aucun doublon et aucun faux negatif. Le faux budget simule precedent
est remplace par une mesure Firestore reproductible.

## Matrice des sept conditions

| # | Condition | Etat | Preuve ou manque |
|---:|---|---|---|
| 1 | Emulateurs Auth, Firestore, Functions | VERT | Suite locale operationnelle |
| 2 | Regles roles, auteur, champs, immutabilite, revision, lot | VERT | Tests de regles passes |
| 3 | Classification des rejets serveur | VERT | Quatre classes testees |
| 4 | IndexedDB durable, UID, chaine et blocage | VERT | Unitaires et rechargement navigateur |
| 5 | Libre-service Auth desactive, Admin SDK actif | DETTE ACCEPTEE | Admin reel vert ; creation/suppression client Web passent mais restent sans acces metier sans membre actif |
| 6 | Fond Toulouse offline, volume et Android | SUSPENDU | PMTiles et pixels verts, Android physique reporte et non bloquant |
| 7 | Viewport geohash et budget de lectures | VERT | 30 requetes, 812 lectures, 504 utiles, 0 faux negatif |

Six conditions sur sept sont vertes ou suspendues, et la condition Auth stricte
est acceptee comme dette bornee. **L'etape 3 peut commencer avec un GO
conditionnel.**

## Prochaine revue autorisee

1. Realiser uniquement l'etape 3 selon `docs/feuille-de-route.md`.
2. Garder l'essai Android physique en suspens jusqu'a la preparation beta
   terrain.
3. Reprendre la fermeture Auth stricte avant ouverture plus large ou beta
   terrain.
