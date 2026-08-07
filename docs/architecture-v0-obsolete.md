# Architecture V1 d'Athar

Statut : decision d'architecture de reference  
Date : 29 juillet 2026  
Perimetre initial : Toulouse

## 1. But et limites de la V1

La V1 doit permettre a un membre authentifie de preparer une zone, retrouver
un batiment, mettre a jour le statut d'un logement sans reseau, puis voir la
saisie se synchroniser. Un administrateur doit pouvoir gerer les zones, les
statuts et les acces, et consulter l'avancement par zone.

Inclus :

- authentification privee par identifiant et mot de passe ;
- roles administrateur et membre ;
- carte de Toulouse, geolocalisation et zones dessinees ;
- batiments/adresses et logements rattaches ;
- statuts configurables, historique des passages et notes courtes ;
- filtres par statut et zone ;
- saisie hors ligne, suivi de synchronisation et resolution de conflit ;
- vue mobile terrain et vue desktop de pilotage ;
- compteurs simples par zone.

Hors V1 : vue 3D, export haute resolution, statistiques avancees, import BAN ou
cadastre, gestion de plusieurs organisations et deploiement national.

## 2. Decisions structurantes

### Stack retenue

| Besoin | Choix V1 | Motif |
|---|---|---|
| Application | React + TypeScript + Vite, sous forme de PWA | Socle simple, rapide et installable |
| Carte | MapLibre GL JS | Rendu vectoriel performant, sans verrouillage du moteur cartographique |
| Fond de carte | PMTiles auto-heberge ou fournisseur autorisant explicitement l'offline | Le serveur standard OSM interdit le prechargement et l'usage hors ligne |
| Dessin de zones | Terra Draw ou plugin MapLibre equivalent, valide par prototype | Edition GeoJSON et integration MapLibre |
| Geometrie | GeoJSON + Turf pour point-dans-polygone et simplification | Formats et operations standards |
| Donnees | Cloud Firestore | Cache web persistant, ecritures hors ligne et resynchronisation |
| Authentification | Firebase Authentication + callable Functions | Inscription publique decidee, finalisation membre et promotion admin controlees cote serveur |
| Backend cible | Firebase Cloud Functions | Creation de comptes, compteurs et operations d'administration |
| Validation | Zod aux frontieres de l'application | Eviter que des documents mal formes entrent dans le domaine |
| Tests | Vitest, Testing Library, Playwright et Firebase Emulator Suite | Tests unitaires, parcours et regles de securite |

Le projet Firebase devra probablement utiliser la facturation a l'usage pour
deployer les fonctions privilegiees, meme si la consommation reelle reste dans
les quotas gratuits. Un budget et des alertes doivent etre configures avant le
premier deploiement.

### Representation des batiments et logements

Un batiment possede un point geographique unique. Ses logements ne pretendent
pas avoir chacun une position GPS differente : ils partagent le point du
batiment et sont ordonnes par etage et libelle.

Sur la carte, un batiment montre une synthese coloree des statuts. Un appui
ouvre une feuille mobile ou un panneau desktop contenant les logements, chacun
avec sa couleur et son action en un geste. Cette representation evite
l'empilement illisible de plusieurs marqueurs au meme endroit tout en conservant
le logement comme unite de suivi.

### Structure du batiment et revisions independantes

La structure et le suivi terrain sont deux axes de concurrence strictement
independants :

- `buildings.structureRevision` protege uniquement les operations de structure :
  ajout, archivage, reactivation, etage, libelle et ordre d'affichage des portes ;
- `doors.revision` protege uniquement la projection du statut et la chaine des
  passages ;
- une operation de structure ne modifie jamais `doors.revision`,
  `currentStatusId`, `lastVisitId`, les informations du dernier passage ni
  l'historique ;
- un passage ne modifie jamais `buildings.structureRevision` ni les champs de
  structure d'une porte ;
- les ecritures utilisent des mises a jour de champs ciblees. Une regeneration
  ne remplace jamais un document porte complet.

Une regeneration calcule un diff non destructif. Elle preserve l'identifiant et
tous les champs de suivi de chaque porte existante qui correspond au plan cible,
ajoute seulement les portes manquantes avec le statut initial `unvisited` et la
revision `0`, puis passe les portes disparues a `active: false` sans supprimer
leur historique. Une porte archivee qui reapparait peut etre reactivee avec le
meme identifiant et le meme historique ; creer une nouvelle porte physique a la
meme place reste une action explicite.

L'identite primaire d'une porte est son identifiant opaque, jamais `sortOrder`.
Lorsque le generateur ne dispose pas encore d'identifiants, il peut proposer une
correspondance par etage et libelle normalise. `sortOrder` reste librement
modifiable. Un changement de libelle ambigu est presente comme un renommage ou
un ajout/archivage a confirmer ; il n'est jamais devine silencieusement.

La vue terrain affiche les portes actives d'un seul etage a la fois et derive sa
progression du statut `unvisited`, sans projection supplementaire. Un geste de
masse est une succession de passages individuels: il conserve donc un UUID, une
revision et une intention de synchronisation par porte. Il n'est pas une
transaction multi-portes et peut etre partiellement applique si une porte est
refusee. L'entree d'edition de structure reste separee et masquee aux membres
dans l'interface. Depuis l'etape 11, les regles serveur appliquent la meme
politique : seul un administrateur actif cree ou modifie la structure d'un
batiment ou d'une porte. Les passages des membres actifs restent inchanges.

Un passage place dans l'outbox avant l'archivage de sa porte reste recevable
apres cet archivage. Le lot modifie uniquement le statut, la revision et le
dernier passage ; il ne reactive jamais la porte. Le client refuse en revanche
de creer une nouvelle intention des qu'il a observe `active: false`.

### Historique et propriete

Une saisie de passage et l'etat courant d'un logement sont deux objets
distincts :

- `visits` est le journal auditable. Chaque entree a un auteur ; un membre ne
  peut corriger ou annuler que les siennes, un administrateur peut tout gerer ;
- `doors` contient une projection legere du dernier statut pour afficher la
  carte sans relire tout l'historique ;
- une correction cree une nouvelle entree liee a l'ancienne ; une suppression
  fonctionnelle est une annulation, jamais un effacement silencieux ;
- le membre peut mettre a jour l'etat partage d'un logement sans modifier la
  saisie d'un autre membre.

La note est liee au passage, pas a la personne rencontree. L'interface doit
rappeler qu'aucune donnee sensible sur les occupants ne doit y etre inscrite.

## 3. Modele Firestore

Toutes les donnees metier vivent sous `workspaces/{workspaceId}` afin de ne pas
fermer la porte a une future separation par organisation.

```text
workspaces/{workspaceId}
  members/{uid}
  statuses/{statusId}
  zones/{zoneId}
  zoneStats/{zoneId}
  buildings/{buildingId}
  doors/{doorId}
  visits/{visitId}
```

Champs principaux :

| Document | Champs importants |
|---|---|
| `members` | `username`, `displayName`, `role`, `active`, `createdAt` |
| `statuses` | `label`, `color`, `order`, `active` |
| `zones` | `name`, `geometry`, `bbox`, `color`, `coverageState`, `assigneeLabel` |
| `zoneStats` | `doorCount`, `countsByStatus`, `updatedAt` |
| `buildings` | `addressLabel`, `location`, `geohash`, `zoneId`, `createdBy`, `structureRevision` |
| `doors` | `buildingId`, `zoneId`, `location`, `geohash`, `floor`, `label`, `sortOrder`, `active`, `currentStatusId`, `revision`, `lastVisitId` |
| `visits` | `doorId`, `statusId`, `note`, `authorId`, `occurredAt`, `syncedAt`, `doorRevision`, `replacesVisitId`, `voidedAt` |

Les identifiants sont opaques. Les noms de collection restent en anglais pour
rester coherents avec l'ecosysteme technique ; les textes d'interface sont en
francais.

Contraintes :

- un polygone de zone est simplifie et limite en nombre de sommets avant
  stockage ;
- dans le domaine, la geometrie de zone reste du GeoJSON. Le codec Firestore
  encode ses sommets comme une liste d'objets `{ latitude, longitude }`, car
  Firestore refuse les tableaux imbriques de `coordinates` ;
- `geohash`, `location` et `zoneId` sont dupliques lorsque cela evite des
  lectures en cascade ;
- la couleur d'un statut est validee au format hexadecimal et son contraste
  est controle dans l'interface ;
- une note est courte, bornee et nettoyee avant affichage ;
- les compteurs sont des projections reparables, jamais la source de verite.

## 4. Synchronisation hors ligne

Firestore est initialise avec son cache persistant multi-onglets. Le service
worker met en cache l'application elle-meme. Un mode "preparer une sortie"
charge explicitement les zones, batiments, logements, statuts et membres utiles
avant la perte du reseau.

Avant chaque ecriture, l'intention utilisateur est aussi placee dans une petite
boite d'envoi IndexedDB propre a Athar. Elle contient l'identifiant du lot, la
revision de depart et les valeurs saisies, mais pas une seconde copie durable de
toute la base. L'intention n'est retiree qu'apres confirmation du serveur. Cette
boite permet de reconstruire une saisie si Firestore la retire de son cache apres
un rejet differe par les regles de securite.

L'intention contient un identifiant global non previsible et l'UID de son auteur.
Une autre session utilisateur ne peut ni envoyer ni modifier les intentions du
precedent utilisateur. Plusieurs intentions locales pour une meme porte sont
chainees par revision. Si la premiere entre en conflit, toutes les suivantes sur
cette porte restent bloquees jusqu'a resolution.

Une mise a jour de statut utilise un lot atomique :

1. creation d'un document `visit` ;
2. mise a jour de la projection `door` ;
3. passage de `revision` de N a N+1 et liaison par `lastVisitId`.

Les ecritures par lot fonctionnent hors ligne, contrairement aux transactions.
Les regles controlent que la revision augmente exactement de un et que le
passage associe existe dans le meme lot. Si deux appareils modifient hors ligne
la meme porte a partir de la meme revision, le premier lot synchronise est
accepte et le second est place en conflit. L'application conserve la saisie
rejetee dans sa boite d'envoi et propose de la reappliquer ou de l'abandonner
apres avoir affiche l'etat serveur.

Un rejet Firestore par les regles arrive au client comme une erreur generique de
permission. L'adaptateur doit alors relire la porte depuis le serveur et ne
classer l'erreur comme conflit que si la revision a avance. Une session inactive,
un auteur different ou une donnee invalide restent des erreurs de securite et ne
doivent jamais etre proposees comme simple conflit reapplicable.

Etats visibles dans l'interface : `a jour`, `hors ligne`, `N changements en
attente`, `conflit a resoudre`. Une saisie n'est jamais presentee comme
synchronisee tant que Firestore signale des ecritures en attente.

La persistance web stocke des donnees sur l'appareil. Elle n'est activee qu'apres
confirmation qu'il s'agit d'un appareil de confiance ; la deconnexion purge les
donnees locales lorsque le navigateur le permet.

### Fond de carte hors ligne

Le cache Firestore ne met pas les tuiles cartographiques hors ligne. Mapbox GL
JS ne fournit le telechargement hors ligne complet que dans ses SDK mobiles,
pas dans GL JS. La V1 retient donc MapLibre et reserve un prototype obligatoire
pour choisir entre :

- un extrait Toulouse au format PMTiles conserve localement ;
- un cache de tuiles borne par zones preparees.

Le serveur raster standard `tile.openstreetmap.org` est limite au prototype de
consultation interactive. Sa politique interdit les fonctions de prechargement
et l'usage hors ligne. Il ne peut donc pas etre la source du mode "preparer une
sortie". La source V1 devra etre auto-hebergee ou fournir une autorisation
contractuelle explicite pour l'offline.

Le prototype doit fonctionner sur Chrome Android avec mode avion avant que le
developpement cartographique principal commence. Si le stockage complet du fond
est trop lourd, la V1 garantit au minimum les donnees et une carte simplifiee
des zones preparees, avec un message clair lorsque le fond manque.

## 5. Chargement geographique

Le client ne charge jamais toutes les portes.

| Niveau de zoom indicatif | Donnees chargees |
|---|---|
| Vue ville | zones et `zoneStats`, aucun logement |
| Vue quartier | zones, batiments groupes et compteurs |
| Vue rue/batiment | batiments et logements situes dans l'emprise visible |

Les batiments et logements portent un geohash. Une emprise est convertie en un
petit ensemble de plages de geohash ; les faux positifs sont elimines cote
client. Les requetes sont annulees ou ignorees lorsqu'une nouvelle emprise les
rend obsoletes. Les marqueurs sont regroupes dans le moteur de carte aux niveaux
de zoom intermediaires.

Le rattachement initial batiment-zone est calcule localement pour un retour
immediat, puis verifie cote serveur. Une modification de polygone declenche une
reindexation asynchrone des batiments concernes.

## 6. Autorisations

Depuis l'etape 12, l'inscription identifiant/mot de passe est deliberement ouverte : le navigateur cree l'utilisateur Auth avec l'adresse technique `{username}@auth.athar.invalid`, puis appelle `registerMember`. Cette callable authentifiee epingle `workspaceId = main`, valide l'identite email/identifiant et cree transactionnellement le membre actif `role: member`. Un utilisateur Auth sans document membre est un etat distinct, recuperable par une nouvelle finalisation du meme profil ; ce n'est pas un membre inactif.

Le premier administrateur est cree exclusivement par `claimInitialAdmin`. Le code fourni est hache SHA-256 et compare a taille constante au hash provisionne hors bande dans `workspaces/main/setup/admin-bootstrap`. La transaction lit, consomme cet etat, cree le marqueur immutable `initial-admin` et promeut le seul membre selectionne. Les clients ne peuvent jamais lire ni ecrire `setup` ou `members`. Le hash de production est provisionne hors depot; le code clair ne figure ni dans Firestore, ni dans le bundle, ni dans les journaux. Le code doit contenir au minimum 128 bits aleatoires.

Apres la transaction, la Function fusionne le claim Auth `role: admin` aux claims existants. Si cette ecriture Auth echoue, le marqueur et Firestore restent la source de verite : le meme UID peut relancer la callable pour reparer le claim, tandis que tout autre UID est refuse.

Le risque residuel majeur avant ouverture publique est l'inscription ouverte : sans App Check, CAPTCHA, verification email ou invitation, un tiers peut creer des comptes et acceder aux donnees lues par un membre actif. Ces contre-mesures ne font pas partie de cette etape et doivent etre decidees avant une ouverture publique.

L'administrateur peut toujours creer un compte par `createMember`, qui conserve son double verrou : claim Auth `admin` et document membre actif `admin`.
Les fonctions d'administration verifient a la fois le claim Auth `admin` et un
document membre actif avec le role `admin` dans le workspace. Les clients ne
peuvent jamais ecrire directement dans `members`.
Firebase Auth utilise en interne une adresse technique deterministe ; l'ecran
de connexion ne demande que l'identifiant et le mot de passe. La reinitialisation
du mot de passe passe par un administrateur puisqu'aucune adresse personnelle
n'est stockee.

Matrice cible :

| Action | Membre actif | Administrateur |
|---|---:|---:|
| Lire les donnees du workspace | Oui | Oui |
| Creer un passage | Oui, pour soi | Oui |
| Corriger/annuler un passage | Le sien | Tous |
| Changer le statut courant d'un logement | Oui, avec passage associe | Oui |
| Creer ou modifier la structure d'un batiment/logement | Non | Oui |
| Creer/modifier zones et statuts | Non | Oui |
| Gerer les acces | Non | Oui |

Les regles Firestore refusent tout acces d'un membre inactif et valident les
champs modifiables, les types, l'auteur et la coherence des lots atomiques. La
suite de tests des regles est un livrable bloquant, pas une finition.

## 7. Structure applicative cible

```text
src/
  app/              composition, routes, providers
  features/
    auth/
    map/
    zones/
    buildings/
    doors/
    visits/
    admin/
    offline/
  domain/           types et regles metier sans Firebase ni React
  infrastructure/   Firebase, geohash, carte, stockage local
  shared/           composants et utilitaires partages
functions/          operations privilegiees et projections
tests/              parcours et fixtures transverses
```

Les composants React ne lisent pas Firestore directement. Chaque fonctionnalite
passe par un depot type qui peut etre remplace par une implementation en memoire
dans les tests. Les regles metier de statut, revision et conflit restent dans
`domain` et sont testables sans navigateur.

## 8. Qualite et exploitation

- environnement local avec Firebase Emulator Suite ;
- projets Firebase distincts pour developpement et production ;
- alias Firebase local conserve par defaut et projet cloud toujours nomme par
  `--project` dans les commandes de lecture ou de deploiement ;
- runtime local et Functions aligne sur Node 22, version effectivement prise
  en charge par Cloud Functions, avant le premier deploiement ;
- variables publiques de configuration separees, aucun secret dans le client ;
- App Check avant ouverture a un groupe elargi ;
- journal d'erreurs sans contenu des notes ;
- budget cloud et alertes actives ;
- sauvegarde/export administratif periodique avant le changement d'echelle ;
- tests en mode avion sur un vrai telephone Android, en plus de Playwright.

La mise en service suit des autorisations separees pour la configuration du
projet, les regles et donnees, le Hosting preview puis la promotion live. Un GO
d'architecture ou de test ne vaut jamais autorisation implicite d'ecriture dans
le projet Firebase.

## 9. Risques a lever avant le socle applicatif

L'etape suivante est un lot de prototypes jetables ou minimaux. Elle doit
prouver :

1. l'affichage d'un fond MapLibre prepare en mode avion sur Chrome Android ;
2. une ecriture Firestore hors ligne puis sa synchronisation ;
3. le rejet controlable de deux revisions concurrentes ;
4. la connexion par identifiant technique sans inscription publique ;
5. le rendu ergonomique de plusieurs logements rattaches au meme batiment.

La construction de l'interface complete ne commence qu'apres ce feu vert.

## 10. Sources techniques

- [Persistance hors ligne Firestore](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Transactions et ecritures par lot Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Geo-requetes par geohash](https://firebase.google.com/docs/firestore/solutions/geoqueries)
- [Authentification Firebase par mot de passe](https://firebase.google.com/docs/auth/web/password-auth)
- [PMTiles avec MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/examples/pmtiles-source-and-protocol/)
- [Capacites hors ligne des SDK Mapbox](https://docs.mapbox.com/playground/offline-estimator/)
- [Politique des tuiles standard OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/)
- [Desactiver la creation de comptes par les utilisateurs](https://firebase.google.com/docs/auth/users#user_self-service)
