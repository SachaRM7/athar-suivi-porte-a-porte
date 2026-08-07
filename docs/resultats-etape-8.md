# Resultats de l'etape 8

Date : 3 aout 2026  
Perimetre : synchronisation des passages terrain IndexedDB vers Firestore, sans deploiement cloud

## Livrable

La route terrain synchronise maintenant les intentions `IndexedDbOutbox` de
l'utilisateur connecte vers `FirestoreDoorGateway`. Une intention ecrit dans un
batch unique le passage `visits/{uuid}` et la projection `doors/{doorId}` ; elle
reste en outbox jusqu'a l'accuse de reception serveur.

- L'interface affiche `A jour`, `Hors ligne`, `N changement(s) en attente`,
  `Conflit a resoudre` ou un rejet explicite.
- Le retour reseau relance la file. Deux demandes de flush simultanees sont
  coalescees, donc un UUID n'est jamais envoye deux fois en parallele.
- Une revision serveur plus recente produit le seul conflit reappliquable. Les
  rejets `inactive-member`, `author-mismatch`, `invalid-intent` et `security`
  restent des rejets et ne proposent pas de reappliquer.
- Reappliquer conserve le UUID et recale la revision de l'intention conflictuelle
  puis de ses dependances. Abandonner supprime explicitement cette chaine, jamais
  une intention sans rapport.
- Un batch deja accepte juste avant un arret client est reconnu au redemarrage
  par `lastVisitId == UUID` et `revision == revision attendue + 1` : il est
  confirme puis retire de l'outbox, sans faux conflit.

## Stockage local

- L'outbox reste partitionnee par UID. Les recalages et abandons de chaine sont
  executes dans une transaction IndexedDB unique.
- Par defaut, Firestore utilise un cache memoire. Cocher `Appareil de confiance`
  puis recharger active le cache persistant multi-onglets.
- A la deconnexion sur appareil non approuve, l'outbox du seul UID concerne et
  les caches PWA `athar-*` sont purges. Les donnees d'un autre UID ne sont pas
  effacees par cette operation.

## Commandes et resultats

| Commande | Resultat |
|---|---|
| `npm run lint` | Passe sans avertissement. |
| `npm run test:run` | 33 tests dans 11 fichiers passent. |
| `npm run test:emulator` | 28 tests dans 5 fichiers passent : Auth, Functions, regles, batch porte + passage, classifications, reprise UUID. |
| `npm run test:e2e` | 3 parcours passent : gardes, PMTiles hors ligne (272 entites rendues) et parcours terrain local. |
| `npm run test:e2e:emulator` | 1 parcours passe avec deux navigateurs : saisies hors ligne, reprise, conflit concurrent Firestore, reapplique. |
| `npm run verify:build` | Passe. Bundle initial : 213,49 ko minifie, 66,89 ko gzip ; MapLibre reste differe (1 084,21 ko minifie). |

La commande navigateur emulee alimente uniquement `athar-local`, reconstruit le
client avec des variables locales temporaires et arrete les emulateurs en fin de
test. Elle ne touche jamais `athar-dev31`.

## Limites a examiner pendant la revue

- La carte et les lectures terrain utilisent encore le depot de demonstration ;
  l'etape 8 synchronise les passages vers Firestore mais ne transforme pas encore
  toutes les lectures de carte en depots Firestore temps reel.
- `navigator.onLine` est un indicateur navigateur. Une coupure non detectee
  laisse Firestore attendre son accuse serveur, ce qui conserve correctement
  l'intention mais doit etre observe sur Android physique avant beta terrain.
- La fermeture Auth libre-service et le test Android physique restent les dettes
  privees deja acceptees. Aucun deploiement cloud ni pilotage desktop n'a ete
  commence.
