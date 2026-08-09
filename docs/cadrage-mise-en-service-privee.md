# Cadrage du lot de mise en service privee

Date : 6 aout 2026  
Projet cible : `athar-dev31`  
Perimetre : une zone ultra-reduite, trois a cinq comptes connus, sans
statistiques avancees, export produit ni fonctions hors pilote.

## Decision

Le lot est **pret pour une preparation locale et un inventaire cloud en lecture
seule**. Aucune ecriture ou aucun deploiement dans `athar-dev31` n'est autorise
par ce cadrage.

L'execution est divisee en cinq autorisations independantes :

1. **A - preparation locale et lecture seule** : code de deploiement, runtime,
   inventaire et sauvegardes logiques sans mutation cloud ;
2. **B - configuration de projet** : Auth, domaines, facturation et alertes ;
3. **C - backend et donnees** : regles, index prouves, comptes, membres,
   donnees pilote et, si autorise, Functions ;
4. **D - Hosting preview** : publication sur un canal temporaire et tests ;
5. **E - promotion live** : publication du preview valide sur le canal live.

Une autorisation ne vaut jamais pour la suivante. Chaque demande doit nommer
le projet, les ressources modifiees, les commandes exactes et le retour
arriere prevu.

## Constats du depot

| Surface | Etat actuel | Action avant mise en service |
|---|---|---|
| Projet CLI | `.firebaserc` pointe par defaut vers `athar-local` | Conserver ce garde-fou et utiliser `--project athar-dev31` explicitement pour toute lecture cloud |
| Auth Web | Identifiant technique transforme en adresse `@auth.athar.invalid` | Verifier Email/Password, les actions utilisateur et les domaines autorises |
| Membres | L'acces exige `workspaces/main/members/{uid}` actif | Faire correspondre exactement chaque UID Auth a un document membre |
| Administrateur | `createMember` exige le claim `admin` et le document membre admin actif | Prevoir un bootstrap unique, audite et reversible du premier administrateur |
| Regles | Suite emulateur verte ; `firebase.json` reference `firestore.rules` | Sauvegarder la version cloud, comparer puis deployer uniquement la version validee |
| Index | Aucun `firestore.indexes.json` n'est versionne | Inventorier les index cloud et n'ajouter que ceux prouves par les requetes retenues |
| Functions | `createMember` est le seul export ; la preuve locale interroge son refus anonyme | Garder `createMember` bornee et choisir explicitement si elle entre dans le pilote |
| Runtime | Racine et Functions declarent Node 22 | Validation sous Node 22 requise avant toute Function |
| Hosting | Aucune section Hosting dans `firebase.json` | Ajouter Firebase Hosting statique pour `dist`, rewrite SPA et en-tetes PWA |
| PWA | Service worker, manifest et PMTiles de 20 607 579 octets sont prouves | Construire a la racine, verifier le scope, le cache, les requetes Range et le mode avion |
| Environnement | La configuration Web est presente localement et ignoree par Git | Fournir les valeurs publiques au build sans commettre de fichier peuple |
| Donnees | La fixture locale contient des UIDs et un mot de passe de test | Ne jamais la copier telle quelle dans le cloud ; utiliser un manifeste pilote distinct |

La documentation Firebase actuelle liste Node 22 et Node 20 comme runtimes
Cloud Functions pris en charge. Le decalage initial Node 24 a ete leve pendant
la phase A : racine, Functions, `.nvmrc` et `.node-version` sont maintenant
sur Node 22 et les validations ont ete rejouees avant toute autorisation
Functions.

Sources officielles utiles :

- <https://firebase.google.com/docs/functions/manage-functions> ;
- <https://firebase.google.com/docs/auth/users#disable_user_actions> ;
- <https://firebase.google.com/docs/hosting/full-config> ;
- <https://firebase.google.com/docs/hosting/test-preview-deploy> ;
- <https://firebase.google.com/docs/firestore/manage-data/export-import> ;
- <https://firebase.google.com/docs/projects/billing/firebase-pricing-plans>.

## A. Controles en lecture seule

La phase A peut consulter l'etat, mais ne doit lancer aucune commande `deploy`,
`delete`, `clone`, `channel:deploy`, `auth:import`, import Firestore ou PATCH
d'API.

Controles reproductibles :

```powershell
npx firebase projects:list
npx firebase apps:list WEB --project athar-dev31
npx firebase functions:list --project athar-dev31
npx firebase hosting:sites:list --project athar-dev31
npx firebase firestore:indexes --project athar-dev31 --database '(default)'
```

Completer par des lectures console ou API non mutantes :

- compte CLI et projet actif ;
- Web App utilisee, identifiants publics et projet associe ;
- edition, emplacement et mode de la base Firestore ;
- regles actives et index existants ;
- fonctions, regions, runtimes, revisions et variables deja deployes ;
- sites Hosting, canaux, domaines et derniere release live ;
- fournisseur Email/Password, actions de creation/suppression utilisateur et
  domaines Auth autorises ;
- plan de facturation, budget et destinataires d'alertes, sans les modifier ;
- liste Auth, claims et documents `members` sous forme redactee ;
- compte par collection sous `workspaces/main`, sans lire ni journaliser le
  contenu des notes.

Le rapport ne conserve ni mot de passe, ni jeton, ni cle de service, ni note.
Les cles Web Firebase et l'ID d'application sont des parametres publics de
build, pas des secrets, mais ils ne doivent pas etre repetes dans les rapports.

## B. Ecritures de configuration

Ces actions exigent une autorisation **B** distincte :

1. confirmer ou activer Email/Password ;
2. desactiver la creation et la suppression de comptes par les utilisateurs
   finaux si le controle Firebase est disponible, puis rejouer la preuve
   `accounts:signUp` et `accounts:delete` qui doit retourner
   `ADMIN_RESTRICTED_OPERATION` ;
3. autoriser uniquement les domaines effectivement utilises : domaine preview,
   `athar-dev31.web.app`, `athar-dev31.firebaseapp.com` et, temporairement,
   l'ancien domaine GitHub Pages s'il reste necessaire ;
4. retirer l'ancien domaine apres la promotion live et validation ;
5. si Functions est retenu, lier explicitement un compte de facturation Blaze
   et creer avant le deploiement un budget et des alertes. Une alerte ne bloque
   pas les depenses ; elle ne constitue pas un plafond.

App Check reste accepte hors de ce pilote familial. Il devient bloquant avant
ouverture a des utilisateurs non connus. L'activer sans phase de mesure est
interdit, car une enforcement prematuree pourrait refuser les appareils
legitimes et le parcours hors ligne.

## C. Ecritures backend et donnees

Ces actions exigent une autorisation **C** nommant chaque ressource.

### Regles et index

- sauvegarder localement la regle cloud active et son identifiant de release ;
- comparer avec `firestore.rules` et rejouer les 48 tests emulateur ;
- deployer les regles seules, avec `--project athar-dev31` et une cible
  `--only` explicite ;
- sauvegarder la sortie JSON de `firestore:indexes` ;
- fusionner les index existants dans un fichier versionne ;
- ne deployer aucun index composite tant qu'une requete cloud bornee n'a pas
  prouve sa necessite. Les requetes actuelles utilisent des index mono-champ et
  `__name__`, donc aucun nouvel index composite n'est attendu.

Une liste d'index vide ne doit jamais ecraser aveuglement un projet contenant
des index existants.

### Auth et membres

Etat cible : trois a cinq comptes techniques connus, dont exactement un
administrateur initial.

- les identifiants restent au format `username@auth.athar.invalid` en interne ;
- les mots de passe temporaires sont uniques, remis par un canal separe, absents
  du depot, des commandes historisees et des rapports ;
- chaque compte Auth a exactement un document
  `workspaces/main/members/{uid}` avec `username`, `displayName`, `role`,
  `active` et `createdAt` ;
- l'administrateur a en plus le claim Auth `role=admin` ;
- le bootstrap enregistre l'etat precedent et echoue si l'UID, l'identifiant ou
  le document membre est ambigu ;
- apres changement de claim, l'administrateur se reconnecte pour renouveler son
  jeton ;
- les comptes locaux `admin-1`, `member-1`, `member-b` et le mot de passe de la
  fixture ne sont jamais reutilises comme donnees cloud par automatisme.

La creation/suppression libre-service reste compatible avec le pilote
uniquement si sa fermeture technique demeure indisponible et si le proprietaire
reconfirme explicitement l'acceptation deja documentee. Elle redevient
bloquante des que l'acces sort du cercle connu.

### Manifeste de donnees pilote

Le manifeste cloud est distinct de `pilote-minimal` et ne contient aucune
donnee sur les occupants :

- workspace `main` ;
- quatre statuts actifs avec les IDs stables `unvisited`, `retry`, `contacted`
  et `do-not-return` ;
- une seule zone reelle preparee, son polygone borne et son bbox ;
- au plus 25 batiments, avec IDs opaques, adresse, point, geohash, `zoneId`,
  `createdBy` et `structureRevision=0` ;
- au plus 250 portes, avec IDs opaques, structure reelle, `active=true`, statut
  `unvisited`, `revision=0` et `lastVisitId=null` ;
- aucun passage initial et aucune note ;
- un `zoneStats` initial coherent peut etre cree, mais reste une projection
  reparable et jamais la source de verite.

L'import est idempotent et fonctionne d'abord en `--dry-run`. Il refuse toute
collection inattendue, tout ecrasement de porte ayant une revision superieure a
zero et tout depassement des bornes 25/250. Il journalise seulement les IDs et
les comptes de documents, jamais les mots de passe ou les notes.

### Functions

`createMember` est la seule Function candidate. La preuve locale de
disponibilite passe par l'appel anonyme volontairement refuse de cette callable ;
elle n'impose donc plus aucun export HTTP supplementaire en production. La
Function reste en `us-central1`
pour conserver le chemin deja teste, exige le double verrou claim admin plus
membre Firestore admin actif, et ne doit recevoir aucun secret de runtime. Son
deploiement exige Node 22 valide, la facturation explicitement acceptee et les
7 avis npm moderes formellement maintenus comme dette pilote.

Sans autorisation de facturation, aucune Function n'est deployee. Les comptes
sont alors prepares manuellement par l'operation privilegiee bornee et la route
d'administration des membres doit etre masquee ou signalee indisponible dans le
build pilote ; elle ne doit pas echouer silencieusement.

## D. Hosting preview et PWA

Firebase Hosting classique est retenu, pas App Hosting : Athar est un build
Vite statique et n'a pas besoin de Cloud Run.

Configuration cible :

- `public: "dist"` et exclusion des fichiers de developpement ;
- rewrite SPA `**` vers `/index.html` ;
- build avec `VITE_BASE_PATH=/`, `VITE_WORKSPACE_ID=main`, configuration Web de
  `athar-dev31` et `VITE_USE_FIREBASE_EMULATORS` absent ou faux ;
- `sw.js`, `index.html`, `manifest.webmanifest` et les entrées versionnées
  `assets/app-*.js` / `assets/app-*.css` revalidées à chaque mise en ligne ;
- PMTiles servi avec un type binaire, requetes Range fonctionnelles et cache
  navigateur borne ;
- en-tetes minimaux `X-Content-Type-Options`, `Referrer-Policy` et interdiction
  d'encadrement, sans politique CSP improvisee qui casserait Firebase ou la
  carte ;
- aucun Analytics, Storage, Messaging ou secret ajoute au build.

La premiere publication se fait uniquement sur un canal preview Firebase
Hosting. Son URL est publique mais l'application reste protegee par Auth et les
regles Firestore. La promotion live exige une autorisation **E** apres les tests
de sortie.

## Sauvegarde et retour arriere

Avant toute ecriture C ou D, creer sous un dossier local ignore et chiffre :

- export Auth des metadonnees, claims et UIDs, sans exposer les mots de passe ;
- export logique JSON des documents `workspaces/main`, avec horodatage et
  SHA-256 ;
- copie de la regle active et liste JSON des index ;
- inventaire des Functions et leurs revisions ;
- site, canal et release Hosting live ;
- configuration Auth pertinente et domaines autorises.

Le service d'export Firestore gere exige Blaze, ecrit dans Cloud Storage et
facture des lectures. Pour le petit pilote, un export logique local en lecture
seule est le choix initial. Un export gere n'est lance qu'avec autorisation
explicite de facturation et de creation du bucket.

Retour arriere par surface :

| Surface | Retour arriere |
|---|---|
| Auth config | Restaurer les actions utilisateur et domaines releves avant mutation |
| Comptes | Desactiver d'abord les comptes crees par le lot ; suppression seulement apres validation explicite |
| Claims/membres | Restaurer claims et documents precedents depuis le manifeste de mutation |
| Donnees | Restaurer les documents preexistants et retirer seulement les IDs crees par le lot |
| Regles | Redeployer la regle sauvegardee |
| Index | Restaurer la specification sauvegardee sans suppression aveugle |
| Functions | Redeployer le commit precedent ou supprimer uniquement la nouvelle fonction autorisee |
| Hosting preview | Supprimer le canal temporaire apres constat |
| Hosting live | Re-promouvoir la release precedente, puis verifier service worker et cache sur un appareil propre |

Apres un retour arriere PWA, les appareils pilotes doivent fermer Athar,
recharger la version restauree et refaire la preparation hors ligne. Une outbox
non vide n'est jamais purgee pour faciliter un rollback.

## Sequence courte et reversible

1. **A1 - local** : aligner Node 22, retirer l'export `emulatorHealth`, ajouter
   les configurations Hosting/indexes/environnement et les scripts gardes en
   `--dry-run`.
2. **A2 - lecture seule** : inventorier `athar-dev31`, produire le backup local
   et le manifeste exact des mutations proposees, puis s'arreter.
3. **B - projet** : apres autorisation, fermer Auth si possible, regler les
   domaines et, seulement si Functions est retenu, facturation plus alertes.
4. **C - backend** : apres autorisation, regles, index prouves, bootstrap admin,
   membres, donnees pilote et Function optionnelle.
5. **D - preview** : apres autorisation, deployer Hosting sur un canal
   temporaire et executer les tests desktop/Android.
6. **E - live** : apres autorisation finale, promouvoir la release preview
   validee sans reconstruire un artefact different.

## Resultat de la phase A (6 aout 2026)

- Node `22.23.2` est utilise pour les validations ; `package.json`,
  `functions/package.json`, `.nvmrc`, `.node-version` et les deux lockfiles
  declarent Node 22.
- Les validations sont vertes : lint, 56 tests unitaires, build production,
  48 tests d'emulateur, trois parcours Playwright d'emulateur et quatre
  parcours PWA/carte, dont le rendu PMTiles hors ligne.
- `firebase.json` prepare Hosting statique sur `dist`, le rewrite SPA et les
  en-tetes PWA. `firestore.indexes.candidate.json` reste volontairement hors de
  `firebase.json` : un fichier vide ne peut pas ecraser les index cloud.
- Les scripts de phase A exigent `--project athar-dev31`, restent en dry-run et
  ecrivent leurs sorties uniquement sous `.athar-local/commissioning/`, ignore
  de Git. Ils refusent les collections hors manifeste et les noms de champs
  sensibles.
- L'inventaire lecture seule observe Email/Password actif, trois comptes Auth,
  un membre `main`, aucune donnee pilote dans les collections terrain,
  Firestore Native en `eur3`, et des index lisibles. Les identifiants, domaines
  et contenus sont absents du rapport versionne.
- La lecture Functions reussit ni par CLI ni par API : l'API repond
  `PERMISSION_DENIED`. Cela n'autorise ni activation d'API ni changement IAM ;
  le sas B doit le clarifier avant toute Function. Aucun deploiement n'a eu
  lieu.

## Criteres de sortie mesurables

### Desktop

- connexion avec l'administrateur et un membre ; membre refuse sur `/admin` ;
- une zone seulement, au plus 25 batiments et 250 portes ;
- aucune donnee `demoWorkspace`, aucun compte ou mot de passe local ;
- requetes bornees, pagination et budgets de l'etape 10 inchanges ;
- un passage confirme avec meme UUID, auteur, statut et revision ;
- deux clients concurrents : un gagnant et un conflit explicite ;
- document invalide isole, aucune lecture globale, `zoneStats` non autoritaire ;
- URL directe `/login`, `/admin` et rechargement SPA sans 404 ;
- aucune erreur console bloquante et aucun secret dans les assets `dist`.

### Android

- installation ou ouverture depuis le domaine preview puis live ;
- appareil approuve, zone et PMTiles prepares ;
- rechargement en mode avion avec shell, fond, batiment et porte visibles ;
- passage hors ligne visible avec UUID et revision apres rechargement ;
- reprise reseau : meme UUID confirme et outbox vide ;
- deconnexion sur appareil non approuve : donnees locales applicables purgees ;
- aucun melange entre deux UID.

### Exploitation

- regles et tests emulateur verts sous Node 22 ;
- backup et retour arriere executes en simulation ;
- plan Blaze et alertes verifies avant Function, ou aucune Function deployee ;
- release preview identifiee et promotion live issue de cette meme release ;
- ancien site GitHub Pages clairement marque comme retire ou temporaire.

## Dettes acceptees pendant le pilote

- Auth libre-service uniquement sous l'acceptation explicite du cercle prive si
  le nouveau controle Firebase ne peut pas etre applique ;
- App Check non enforce pour trois a cinq utilisateurs connus ;
- un seul onglet Athar et appareil personnel ou approuve ;
- `zoneStats` non repare automatiquement ;
- administration manuelle des comptes si Functions/facturation ne sont pas
  autorisees ;
- 7 avis npm moderes transitifs Functions, sans avis eleve ou critique ;
- aucune reindexation asynchrone de zone et aucune regeneration superieure a
  450 mutations.

## Conditions d'arret

Le lot s'arrete immediatement si :

- le projet observe n'est pas exactement `athar-dev31` ;
- Node 22 n'est pas aligne et toutes les regressions ne sont pas vertes ;
- des donnees, fonctions, regles ou releases inconnues ne sont pas sauvegardees ;
- le bootstrap admin trouve un UID, claim ou membre ambigu ;
- une commande propose une ecriture non presente dans le manifeste autorise ;
- la facturation ou les alertes requises pour Functions ne sont pas approuvees ;
- les regles, Auth ou un index refusent un parcours attendu ;
- le preview montre une lecture globale, une donnee demo, un secret ou une
  donnee d'un autre UID ;
- le test Android offline/reprise perd l'UUID, la porte ou le fond PMTiles ;
- le plan de retour arriere n'est pas executable avant la promotion live.

## Hors lot

- statistiques avancees, export utilisateur et rapports ;
- import BAN/cadastre, reindexation massive et multi-workspace ;
- App Check enforce, CI/CD automatique et ouverture publique ;
- fonctions de projection ou d'administration autres que `createMember` ;
- sauvegardes gerees recurrentes, PITR et restauration automatisee ;
- deploiement national ou augmentation des bornes pilote.

## Modele recommande

La phase A traverse runtime Node, Firebase CLI, scripts de sauvegarde, Auth,
Firestore, Functions, Hosting et PWA. Modele recommande : **GPT-5 Codex Terra,
raisonnement High**. Il doit s'arreter apres preparation locale et inventaire
lecture seule, avant la premiere mutation cloud.

## Verdict apres phase A

**GO pour le sas B de configuration de projet, sous autorisation explicite.
NO-GO pour les sas C, D et E tant que leur autorisation correspondante n'est
pas donnee explicitement.**
