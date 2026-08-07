# Resultats de l'etape 11

Date : 6 aout 2026  
Perimetre : branchement terrain Firestore pour pilote prive, sans deploiement
ni ecriture dans `athar-dev31`.

## Verdict

**GO pour la revue d'architecture de l'etape 11.** Les criteres logiciels du
lot sont prouves localement. L'essai Android physique et l'audit des
dependances Functions restent des points explicites de la revue ; ils ne sont
pas declares valides par cette implementation.

## Projection terrain

- La route authentifiee compose maintenant les depots Firestore pagines, une
  projection locale de session et l'outbox IndexedDB de l'UID courant. Elle
  n'importe plus `demoWorkspace` et ne retombe jamais dessus en cas d'erreur.
- Statuts, zones, batiments du viewport et portes du batiment sont valides par
  les codecs Firestore. Les portes sont parcourues page par page ; une page
  geohash vide avec curseur suivant ne termine pas prematurement la lecture.
- Les emprises MapLibre restent annulables par `AbortController`. Une reponse
  obsolete ne modifie pas les sources de la carte.
- Le mode `cache-aware` utilise la persistance Firestore seulement sur appareil
  approuve. Hors ligne sans zones ou statuts prepares, l'interface leve une
  erreur explicite au lieu d'afficher un workspace vide ou factice.

## Reconstruction et synchronisation

- Au rechargement, les portes serveur ou cachees sont rapprochees avec les
  seules intentions en attente de l'UID courant. L'UUID devient le
  `lastVisitId` optimiste et les revisions chainees sont rejouees sans modifier
  l'objet serveur.
- Un snapshot serveur plus ancien ne remplace jamais une revision locale plus
  recente. Succes et conflit reconcilient la porte confirmee ; un rejet force
  la relecture de cette seule porte.
- Le test Playwright recharge un client avec Firebase indisponible, retrouve
  le meme UUID et le statut optimiste, puis prouve par l'emulateur la revision
  gagnante du premier client. Le second client passe en conflit, affiche
  l'etat serveur et se reapplique.
- Un conflit ou rejet reconstruit est maintenant visible meme si la selection
  React de la porte a ete perdue pendant le rechargement.
- La purge de deconnexion non approuvee, l'isolation UID, le batch atomique
  passage + porte et la reprise reseau restent inchanges.

## Structure et securite

- Les regles Firestore reservent creation et modification structurelle des
  batiments et portes a un administrateur actif. Le chemin de statut et passage
  reste disponible aux membres actifs.
- `FirestoreBuildingStructureGateway` compte la mise a jour du batiment et
  toutes les mutations de portes. Il accepte 450 mutations et refuse 451 avant
  de creer ou envoyer le batch.
- `structureRevision` et `doors.revision` restent independantes ; les tests de
  structure non destructive et de passage concurrent restent verts.
- Les racines et Functions declarent Node 24 via `package.json`, `.nvmrc` et
  `.node-version`. L'emulateur confirme `Using node@24 from host`.

## Fixture locale

`scripts/fixtures/pilote-minimal.mjs` decrit un workspace, trois comptes
techniques, un batiment et une porte sans donnee personnelle reelle. La
commande reproductible reste :

```powershell
npm run dev:local
```

Le seed Playwright ajoute separement des zones invalides ou de pagination pour
les regressions de l'etape 10. Ces 51 batiments de charge ne font pas partie du
jeu pilote `pilote-minimal`.

## Validations mesurees

| Commande | Resultat |
|---|---|
| `npm run lint` | succes, 0 erreur et 0 avertissement |
| `npm run test:run` | 16 fichiers, 55 tests passes apres revue |
| `npm run verify:build` | succes ; MapLibre reste differe, entree 214,73 ko minifiee / 67,37 ko gzip |
| `npm run test:emulator` | 7 fichiers, 48 tests passes ; Auth, regles, structure, codecs invalides, geohash, pagination et sync |
| `npm run test:e2e` | 4 tests passes ; PMTiles hors ligne, 272 entites, 268 couleurs significatives et 279929 pixels dominants |
| `npm run test:e2e:emulator` | 3 tests passes ; deux UID, recharge cachee, UUID, conflit, purge et pilotage admin |
| `npm audit --omit=dev` | application : 0 vulnerabilite de production |

## Points pour la revue

- L'essai Android physique en mode avion n'a pas ete execute.
- La revue a supprime l'avis eleve avec une mise a jour compatible de
  `brace-expansion`. `functions/npm audit --omit=dev` signale encore 7 avis
  moderes transitifs Firebase/Google ; la seule correction npm restante impose
  un retour majeur de `firebase-admin` et n'est pas appliquee.
- Firebase Tools emet encore son avertissement local sur les emulateurs non
  demarres et une deprecation `url.parse()` provenant de son outillage. Cela ne
  change pas les resultats des tests.
