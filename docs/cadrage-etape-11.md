# Cadrage de l'etape 11

Date : 6 aout 2026  
Objectif produit : rendre Athar testable par un petit groupe familial sur une
zone geographique ultra-reduite, sans statistiques avancees, export ni
deploiement cloud pendant l'etape.

## Decision

L'etape 11 est le lot **branchement terrain Firestore pour pilote prive**.
Elle remplace les donnees de demonstration de la route authentifiee par une
projection locale hydratee depuis Firestore, tout en conservant l'outbox et la
synchronisation deja prouvees.

Le perimetre de reference du jeu pilote est volontairement petit :

- un workspace ;
- une zone preparee ;
- au plus 25 batiments et 250 portes pour la fixture d'acceptation ;
- trois a cinq comptes connus ;
- un administrateur pour la structure, les autres comptes pour le terrain.

Ces nombres bornent la preuve pilote, pas le modele de donnees. Les budgets et
la pagination de l'etape 10 restent obligatoires.

## Dettes bloquantes avant beta privee

### 1. Lecture terrain encore en demonstration

`MapPage` construit actuellement `createMemoryWorkspaceRepositories` avec
`demoWorkspace`. Les statuts envoyes par l'outbox peuvent atteindre Firestore,
mais un rechargement reconstruit l'ecran depuis la demonstration. Ce melange
est le principal blocage du pilote.

L'etape 11 doit composer un depot de session terrain qui :

- hydrate statuts, zones, batiments du viewport et portes du batiment depuis
  les depots Firestore valides de l'etape 10 ;
- conserve une projection locale mutable pour le retour immediat et le mode
  hors ligne ;
- recharge l'etat serveur apres synchronisation et conflit ;
- ne remplace jamais une intention locale encore en attente par une projection
  serveur plus ancienne ;
- ne charge jamais toutes les portes du workspace ;
- distingue chargement initial, cache disponible, hors ligne sans donnees
  preparees et document serveur invalide.

### 2. Reconstruction apres rechargement ou interruption

L'outbox survit deja au rechargement, mais le depot metier local repart de la
fixture. L'hydratation doit partir de Firestore ou du cache persistant approuve,
puis rapprocher les intentions du seul UID courant. Un UUID deja confirme est
retire ; une intention encore en attente reste visible et rejouable ; un vrai
conflit conserve l'etat serveur et la commande utilisateur.

### 3. Politique d'edition structurelle

Pour le pilote, la decision est explicite : **seul un administrateur actif peut
modifier la structure d'un batiment**. L'interface applique deja cette
politique ; les regles Firestore et leurs tests doivent etre alignes. Les
passages terrain des membres actifs restent inchanges.

### 4. Taille des regenerations

Une operation structurelle ne doit jamais atteindre silencieusement la limite
de 500 ecritures Firestore. Pour le pilote, l'interface et le gateway refusent
avant envoi tout diff depassant 450 mutations de documents, avec un message
explicite. Le decoupage de tres grands batiments reste hors de ce lot.

### 5. Runtime reproductible avant mise en service

Les Functions declarent Node 22 alors que les preuves locales utilisent Node
24. L'etape 11 doit fournir une commande de validation utilisant la version
declaree par les Functions, ou aligner explicitement la version declaree sur le
runtime retenu. Aucun deploiement n'est effectue dans ce lot.

## Dettes acceptees temporairement

- **Auth libre-service Firebase reel** : accepte pour ce pilote prive. Un compte
  sans document membre actif n'accede a aucune donnee. Cette dette redevient
  bloquante avant ouverture a des personnes non connues.
- **Administration des membres incomplete** : creation privilegiee disponible ;
  activation, desactivation et reinitialisation peuvent rester des operations
  manuelles encadrees pour trois a cinq comptes.
- **Edition de zone et reindexation cloud** : la zone pilote est preparee avant
  la sortie. L'edition en production reste desactivee ; aucune reindexation
  asynchrone n'est necessaire pendant le test.
- **Purge Firestore multi-onglets** : le pilote impose un seul onglet Athar par
  appareil et des appareils personnels ou approuves. L'outbox est deja
  serialisee entre onglets. La fermeture forte de tous les caches reste requise
  avant usage sur appareil partage.
- **Android physique hors ligne** : transforme en critere de la revue terrain
  finale, pas en developpement supplementaire dans l'etape 11.
- **`zoneStats` non repare automatiquement** : l'interface sait l'isoler et les
  batiments restent lisibles. Une projection absente n'interdit pas le pilote.
- **Page viewport vide sur faux positifs** : comportement exact et curseur
  continuable. Le depot de session doit continuer les pages sans conclure a tort
  que le viewport est termine.
- **Mesures emulateur non assimilables a une facture cloud** : acceptable ; les
  bornes de requete restent la protection operationnelle.

## Hors V1 ou hors pilote

- statistiques avancees et projections analytiques supplementaires ;
- export, sauvegarde automatisee et rapports haute resolution ;
- import BAN/cadastre, reindexation massive et deploiement national ;
- plusieurs organisations ou workspaces selectionnables ;
- decoupage automatique des regenerations de plus de 450 mutations ;
- ecoute temps reel globale : le pilote utilise lectures bornees, reprise et
  rafraichissement cible.

## Livrables bornes de l'etape 11

1. Une composition de depots pour la route authentifiee, avec Firestore comme
   source valide et projection locale comme support optimiste/hors ligne.
2. Une hydratation paginee par zone, viewport et batiment, annulable et capable
   de traverser une page geohash vide avec curseur suivant.
3. Une reconstruction UID-safe au rechargement, sans perte ni ecrasement des
   intentions IndexedDB en attente.
4. Le rafraichissement cible de la porte apres succes, rejet ou resolution de
   conflit.
5. Les regles structurelles reservees aux administrateurs et le plafond de 450
   mutations avant batch.
6. Une fixture emulateur `pilote-minimal` et une commande de preparation locale
   reproductible. Elle ne contient aucune donnee personnelle reelle.
7. Un runtime Node coherent pour les tests Functions.
8. Une documentation de preparation du pilote ; aucune ecriture dans
   `athar-dev31` et aucun deploiement pendant l'etape.

## Criteres de sortie mesurables

- Apres connexion, aucun ID, adresse, statut ou porte de `demoWorkspace`
  n'apparait sur la route authentifiee lorsque Firestore contient la fixture
  pilote.
- Un viewport ne lit que ses plages paginees et un batiment ne lit que ses
  portes ; les budgets de l'etape 10 restent respectes.
- En ligne, un passage met a jour Firestore puis l'ecran recharge confirme le
  meme UUID, statut, auteur et revision.
- Hors ligne, un passage reste visible apres rechargement, puis est confirme au
  retour du reseau sans nouvel UUID.
- Deux clients concurrents produisent toujours un seul gagnant et un conflit
  explicite reapplicable ou abandonnable.
- Changer d'utilisateur ne montre ni projection optimiste ni intention de
  l'UID precedent.
- Un membre actif peut passer une porte mais les regles lui refusent toute
  mutation structurelle ; un administrateur actif peut l'effectuer.
- Un diff de 451 mutations est refuse avant creation du batch ; 450 mutations
  ou moins restent dans le chemin teste.
- Un document invalide est isole et signale sans remplacement silencieux par
  la demonstration.
- Le test Android final ouvre la zone preparee, affiche les portes et enregistre
  au moins un passage en mode avion avant reprise reseau.
- Lint, tests unitaires, emulateurs, Playwright standard/emulateur, PMTiles,
  pixels, Auth, regles, conflits, purge et budgets restent verts.

## Sequence restante vers le pilote

1. Implementation de l'etape 11.
2. Revue d'architecture et essai Android de l'etape 11.
3. Lot de mise en service privee : donnees reelles minimales, configuration
   cloud, deploiement autorise explicitement et test de fumee.

## Modele recommande

Implementation : **GPT-5 Codex Terra, raisonnement High**. Le lot traverse
React, depots, cache local, Firestore, regles et tests a deux clients ; Terra
est justifie ici. La revue suivante utilisera **GPT-5 Codex Sol, raisonnement
High**.

## Verdict de cadrage

**GO pour l'implementation de l'etape 11 dans ce perimetre borne.** Aucun code,
deploiement cloud, statistique avancee, export ou durcissement hors pilote n'a
ete commence pendant ce cadrage.
