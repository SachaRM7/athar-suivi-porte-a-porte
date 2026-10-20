# Lot E — pilotage et industrialisation

## Périmètre livré

Le lot E prolonge les lots A à D sans changer la formule de couverture, le cycle
« Ne pas déranger », les révisions des portes ni la durabilité IndexedDB.

- `/admin/members` : création, liste paginée par 25, suspension/réactivation,
  promotion/rétrogradation, remplacement du mot de passe, dernière connexion Auth
  et dernier passage reçu. Une date absente est indisponible, jamais inventée.
- `/outings` : démarrer une sortie dans une zone, rejoindre une équipe, quitter sa
  participation, terminer la sortie et consulter son bilan. Accessible depuis la
  carte, les réglages et le pilotage. Le responsable ou un administrateur termine
  la sortie ; le responsable ne peut pas l'abandonner sans la terminer.
- `/admin` : couverture canonique B, bâtiments suivis/décrits/visités, données à
  compléter, accès aux bilans, pagination sans réafficher une ancienne page sous
  un nouveau curseur, délai de lecture et action de reprise.
- CI : scénarios d'accès et de sorties en émulateurs, reprise hors ligne dans le
  navigateur, contrôles de publication et recette mobile Chromium/WebKit.

## Données canoniques et garanties

Tous les chemins restent sous `workspaces/{workspaceId}`.

| Chemin | Propriétaire de l'écriture | Contrat |
|---|---|---|
| `members/{uid}.activeOuting` | Callable | `{id, zoneId, title}` ou null ; au plus une participation active par compte |
| `outings/{id}` | Callable | titre/zone/responsable/début immuables, fin et participants contrôlés |
| `visits/{uuid}.outingId` | batch passage + porte | optionnel, immuable, auteur participant et zone identique imposés par les règles |
| `members/{uid}.lastActivityAt` | trigger | maximum des dates de création Firestore des passages, jamais l'horloge cliente |
| `memberAudit/{uuid}` | Callable | auteur, cible, action, dates, résultat ; aucun mot de passe |
| `memberManagement/{uid}` | Callable | verrou temporaire d'une modification Auth/Firestore, invisible au client |

Une sortie contient les participants avec leur nom affiché à l'inscription et leurs
bornes de participation. Pas de traces GPS, de notes de foyer ni de marqueurs sensibles
supplémentaires. Pas de reconstruction automatique des anciennes « activités du jour »
en sorties : les anciennes visites sans rattachement restent inchangées.

Le rattachement est capturé **avant** l'écriture durable du passage, y compris pour
« Tout marquer absent ». Il survit au rechargement et à la réapplication d'un conflit.
Les visites d'une autre zone restent sans sortie. Démarrer/rejoindre/quitter/clôturer
exige une confirmation serveur ; ce choix évite d'inventer des participations hors ligne.
Une erreur réseau peut suivre une action effectivement acceptée : actualiser permet de
retrouver la décision. Le démarrage utilise un UUID stable pour son rejeu dans l'écran.

La clôture vide les sélections actives des participants dans la même transaction.
Un appareil hors ligne peut encore rattacher un passage à la sortie qu'il connaît :
les règles acceptent sa réception tardive sans perdre la saisie. Le bilan le classe
selon sa date déclarée `occurredAt` :

- date entre arrivée du participant et départ/clôture : incluse, même si synchronisée
  après la fin ; ces réceptions tardives sont aussi dénombrées séparément ;
- date hors période, auteur absent ou date invalide : exclue du total et signalée ;
- passage annulé : exclu ; plusieurs passages sur une porte sont plusieurs
  interventions, mais une seule porte distincte.

Ces dates restent déclarées par les appareils : une mauvaise horloge est visible comme
une anomalie de période, pas corrigée silencieusement. Les compteurs par statut sont
ceux des **passages**, et non le statut courant des portes ou une couverture géographique.

`getOutingReport` lit sortie et visites dans une transaction de lecture cohérente,
recalcule le résultat à chaque demande, et affiche la date serveur. La réception tardive
et la dernière activité utilisent `DocumentSnapshot.createTime`, non une date fournie
par un client. Aucun compteur
incrémental irréparable ni nouvel agrégat à migrer. Budget : 10 000 visites/sortie ;
au dépassement, bilan indisponible avec erreur explicite, jamais total tronqué.
Sorties : pages de 25, curseur `(startedAt DESC, documentId DESC)`, dates de départ à la
milliseconde. Participants : 50 maximum. Une participation quittée ne se rouvre pas ;
une nouvelle sortie est nécessaire. Hypothèses consignées dans `QUESTIONS.md`.

## Administration et droits

Les Callables vérifient le document membre actif et son rôle, sans dépendre d'un ancien
claim Auth. `createMember` suit désormais cette même autorité : une promotion prend
immédiatement effet. Les mutations directes des profils, sorties et journaux restent
interdites par les règles, y compris aux administrateurs.

Un administrateur ne modifie pas son propre accès. Les transactions relisent l'auteur
et la cible ; deux administrateurs se rétrogradant simultanément ne peuvent retirer
le dernier accès. Les opérations sur une cible sont sérialisées par un verrou de cinq
minutes. Une panne d'exécution peut laisser ce verrou jusqu'à son expiration ; aucun
secret n'y est stocké. Chaque tentative a son événement de journal, avec résultat.

Suspendre retire d'abord `active`, donc l'accès Firestore immédiatement, puis désactive
Auth et révoque les jetons de renouvellement. Réactiver active Auth avant de rétablir le
profil. Une promotion est publiée dans Firestore seulement après réussite Auth et
nouvelle vérification de l'auteur. Les échecs sont explicites, restent traçables et
peuvent être repris par la même action. Un compte Auth supprimé hors de ce parcours est
signalé ; aucune suppression de membre ni d'historique n'est proposée.

La réinitialisation remplace le mot de passe Auth et révoque les jetons de renouvellement.
Les jetons ID déjà émis peuvent rester valables jusqu'à leur expiration (au plus une
heure) tant que le membre reste actif ; pour couper l'accès immédiatement, suspendre
le membre. Le mot de passe n'est pas envoyé par email (les identifiants utilisent un
email technique), ni écrit dans Firestore ou le journal. L'administrateur le transmet
au titulaire par le canal habituel. Aucun message externe n'est envoyé automatiquement.

Les copies déjà téléchargées sur un téléphone déconnecté ne peuvent être effacées à
distance : c'est la limite existante du cache autorisé au lot A, pas une promesse de
révocation des fichiers locaux.

## Files locales et pilotage

Le coordinateur voit la file IndexedDB **de son compte sur cet appareil** : passages
en attente, conflits, refus, profils en attente. Une erreur de lecture affiche
« indisponible ». Les autres téléphones ne transmettent pas leur file ni des notes
sensibles au tableau ; leur état est explicitement inconnu. Les bilans serveur ne
prétendent jamais inclure leurs passages non reçus. Le lien vers la carte permet la
synchronisation et la résolution avec le parcours A/C existant.

## Publication contrôlée

**Aucune publication n'est déclenchée par une poussée ou une fusion.** Toute PR/main
exécute les tests et le contrat des exports de production. Le workflow manuel sur main
exige `publish=true`. Le job `publier` utilise l'environnement GitHub `production` ;
ses protections éventuelles se configurent dans GitHub. Le workflow ne crée pas de règle
obligatoire d'approbation si cet environnement n'en possède pas.

`publish_backend=false` publie uniquement Hosting, **si le backend actif est compatible**.
`publish_backend=true` autorise explicitement règles, index et Functions avant Hosting.
Le script ne doit être lancé que par ce workflow ; il refuse toute autre origine.

1. Installation verrouillée, build de production, vérification PWA/routes/configuration.
2. Manifeste `dist/athar-release.json` : commit, projet, empreintes règles, index,
   sources/dépendances Functions, surface d'exports et Callables utilisées.
3. Si backend demandé : reçu `deployment/backend` marqué `deploying`, puis
   `firebase deploy --only firestore:rules,firestore:indexes,functions --non-interactive`.
   Sans `--force` : aucune suppression de Function/index historique n'est autorisée.
4. Inspection réelle : règles actives via Rules API, inventaire v2 des Functions
   (noms, état ACTIVE, révisions), index déclarés présents et READY. Inventaire paginé
   au-delà du budget, permission manquante, erreur réseau ou index en construction : arrêt.
5. Écriture du reçu vérifié après réussite. Avant Hosting, nouvelle comparaison du reçu,
   du manifeste et de l'état actif. Un reçu absent, inconnu ou en cours bloque Hosting.
6. Publication Hosting ; conservation du manifeste comme artefact GitHub pendant 90 jours.

Le compte de service doit appartenir à `athar-dev31` et disposer des droits de publication
et d'inspection nécessaires (Hosting, Functions, Rules, index, lecture/écriture du reçu
Firestore, et impersonation du compte d'exécution si requise). Les droits réellement
configurés n'ont pas été inspectés ici. Sa clé ne va ni dans un artefact ni dans les logs :
fichier temporaire mode 0600, supprimé en fin de processus. La CI n'emploie aucun secret
cloud pendant les tests.

Le reçu associe la révision Functions observée à l'empreinte du paquet publié par ce
workflow. Toute modification de Functions extérieure au workflow invalide cette révision.
Le contrôle des règles relit leur contenu actif. `deploy/backend-state.json`, ancien état
manuel du lot A, reste seulement informatif ; il n'autorise plus une publication.
Les seuls champs du reçu sont des identifiants/empreintes de version, pas des données métier.

**Échec et reprise.** Firebase ne fournit pas de transaction atomique entre les services.
Un échec backend laisse l'ancien frontend et un reçu non vérifié ; corriger puis relancer
avec backend autorisé. Des index nouvellement créés peuvent demander un deuxième lancement
après leur construction : ne pas contourner le contrôle READY. Un échec Hosting laisse le
backend validé ; relancer pour le même commit. Les changements E sont additifs pour les
anciens clients. Pour revenir à une version précédente : créer un revert revu sur main,
exécuter toute la CI, publier explicitement le backend compatible puis Hosting. Ne pas
supprimer sorties, visites ou profils comme moyen de retour arrière. Garder les artefacts
et journaux du lancement pour établir ce qui a effectivement été publié.

## Validation et limites de preuve

Tests unitaires : association de sortie, conflit conservant l'UUID et le rattachement,
statistiques distinctes, réception tardive, périodes, absence de données sensibles.
Tests de publication : état inconnu/partiel, dérive de règles/Functions, index non prêts,
projet incorrect, arrêt avant Hosting et ordre backend → vérification → reçu → Hosting.
Émulateurs : refus des comptes non autorisés, pagination, rôles, suspension, réactivation,
mot de passe, concurrence, journal, idempotence des sorties, bornes de participation,
liaison de visite autorisée seulement au participant dans sa zone, immutabilité.
Navigateur : administration complète et session suspendue, sortie à deux comptes,
passage hors ligne, rechargement, clôture à distance, synchronisation tardive et bilan.
Mobile : navigation, texte agrandi, absence de débordement, dialogue et restitution du
focus sur Chromium et WebKit. Les tests A/B/C/D restent obligatoires dans la même CI.

La publication cloud et la recette sur téléphones physiques ne sont **pas exécutées**
par le lot de code. Aucun inventaire, migration, reconstruction de statistiques ou
modification de données de production n'a été réalisé.
