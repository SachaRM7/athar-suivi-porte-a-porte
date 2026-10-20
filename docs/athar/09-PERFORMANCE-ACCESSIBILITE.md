# Lot D — performance et finition terrain

Le lot D conserve les droits, la persistance et le respect du « Ne pas déranger » du lot A,
les statistiques officielles du lot B et la préparation hors ligne du lot C. Aucun nouveau
schéma Firestore, index, service externe ou dépendance JavaScript. Aucun déploiement implicite.

## Contrat de lecture

- La liste charge **25 bâtiments par page** via les curseurs existants. Précédente/suivante
  permettent de parcourir une zone de plus de 250 bâtiments. Fermer une fiche conserve la page.
- Les portes de chaque bâtiment sont entièrement lues avant tout calcul de statut, de suivi
  ou toute action groupée. Au maximum **quatre bâtiments** sont lus simultanément, par pages
  de 100 portes. Aucun total partiel n'est présenté comme complet.
- Recherche, tri, filtres, activité et leurs compteurs portent sur **la page affichée** ; ce
  périmètre est indiqué dès que plusieurs pages existent. Les résultats des autres pages
  ne sont pas annoncés absents. Les indicateurs officiels de zone continuent à lire `zoneStats`.
- Le cadrage charge progressivement les bâtiments par pages de 25, jusqu'à 200 bâtiments
  ou 40 pages géographiques. Les pages vides avec un curseur sont traversées. Un cadrage
  incomplet demande de zoomer et représente les emprises encore inconnues en pointillés,
  distinctement du gris « Pas encore fait ». Sous le zoom 16, aucune lecture de portes
  n'est lancée pour la carte.
- Les lectures complètes ont un budget de 10 000 documents ; le dépassement est une erreur
  explicite. Une page déjà en vol peut dépasser le seuil avant détection, au plus quatre
  requêtes de portes simultanées. Le budget empêche de continuer la collecte.
- Une lecture attend au plus 15 secondes ; une page terrain ou un cadrage au plus 30 secondes.
  Le SDK Firestore ne peut pas annuler une requête déjà envoyée : les résultats tardifs sont
  ignorés, les pages suivantes ne sont plus lancées. Un déplacement annule la génération
  précédente et attend 180 ms avant de charger le nouveau cadrage.
- L'historique reste trié chronologiquement après lecture complète bornée (les curseurs
  existants trient par identifiant, pas par date). Il affiche 25 passages, puis un bouton
  pour les précédents ; quatre résolutions d'auteur simultanées au maximum. Une erreur
  d'historique propose de réessayer et ne signifie jamais qu'il a été effacé.

Fichiers : `terrain-reads.ts`, `use-terrain-page.ts`, `read-task.ts`, `WorkspaceMap.tsx`,
`BuildingVisitSheet.tsx`, `terrain-session-repositories.ts`.

## Mémoire et carte

- PMTiles conserve 64 entrées de répertoire ; MapLibre limite son cache à 64 tuiles et
  deux niveaux de zoom. Les suggestions cadastrales et états d'emprises sortis des tuiles
  chargées sont retirés. Au plus 25 prévisualisations de bâtiments posés non enregistrés.
- Les archives sont lues par plages **en ligne et hors ligne**. Le service worker du lot C
  sert les plages depuis son cache. Plus de copie complète de l'archive retenue en JavaScript.
- Une plage est limitée à 8 Mio. Les réponses HTML, plages incohérentes ou tronquées et
  réponses complètes trop grosses d'un serveur ignorant `Range` sont refusées. L'en-tête
  de découverte lit seulement huit octets utiles puis ferme le flux, avec un délai de 5 s.
- Le cache de session conserve au plus 2 000 portes et 1 000 passages. Les intentions
  durables de passage et de profil sont reprojetées depuis les files du lot A après éviction.
  Les structures et historiques distants ne sont jamais supprimés par l'éviction.
- Une panne cartographique laisse la liste accessible. Réessayer recrée aussi les caches
  PMTiles pour oublier une première promesse rejetée. La perte du contexte WebGL signale
  le problème. Un échec du module différé présente un écran de récupération.

Ces bornes limitent des objets et des lectures, pas une quantité garantie de RAM : le
rendu GPU, le moteur du navigateur et le cache Firestore ont leur propre consommation.

## Localisation et accessibilité

« Ma position » demande une seule position, sans haute précision forcée, et accepte un
relevé datant de moins de 30 secondes. Le suivi est libéré après succès, refus, erreur,
12 secondes sans réponse, passage en arrière-plan ou fermeture de la carte. Aucune demande
GPS à l'ouverture. La précision est annoncée ; les suggestions restent centrées sur la carte.

Les dialogues partagent une pile de focus : Tab reste dans la fiche active, Échap ferme
seulement la fiche supérieure, le focus retourne au déclencheur et le reste est `inert`.
Les fiches bâtiment, porte, structure et réglages utilisent ce contrat. La suppression
d'une zone vide emploie le dialogue commun. Les actions terrain visent 44 px, les focus
sont visibles, les fenêtres défilent, les encoches sont prises en compte et le texte suit
la taille préférée du navigateur. Les jetons typographiques passent de px à rem sans changer
leur taille nominale à 16 px. Les mouvements respectent la réduction des animations.

## Recette automatisée

- Tests unitaires : 301 bâtiments paginés, 301 portes dans un bâtiment, concurrence,
  annulation, dépassement, absence inconnue, éviction avec intentions durables, délais,
  demandes GPS et réponses PMTiles invalides/offline.
- Playwright laboratoire : parcours terrain existants, structure, marqueur, carte et PWA.
- `npm run test:e2e:mobile` : Chromium/Pixel 5 et WebKit/iPhone 13, focus imbriqué,
  restitution, GPS explicite, écran de 320 px avec texte 200 %, panne cartographique et reprise.
- `npm run test:e2e:emulator:ci` : régressions authentifiées A/B/C puis zone de 276 bâtiments
  sur les deux moteurs, dernière page, retour de fiche et navigation précédente.
- CI : lint, typage, unités, Functions, règles/intégration, outils B, gardes de build,
  build production, laboratoire et les deux moteurs mobiles. La publication reste manuelle.

## Recette sur téléphones physiques — à réaliser avant extension du pilote

L'émulation ne prouve pas le comportement d'iOS/Android réel, de VoiceOver/TalkBack, de la
batterie ou de l'éviction mémoire par le système. Ne pas marquer cette recette effectuée
sur la seule base de Playwright.

1. iPhone Safari et PWA installée, puis Android Chrome et PWA : ouvrir une zone, atteindre
   une page tardive, ouvrir bâtiment/porte, marquer, fermer et retrouver la page.
2. VoiceOver/TalkBack : annonce des titres et statuts, ordre de lecture, aucune fuite dans
   l'arrière-plan, fermeture et restitution du focus ; clavier externe Tab/Échap.
3. Texte système agrandi, écran étroit, orientation et clavier affiché : toutes les actions
   restent accessibles au défilement, sans contenu masqué par l'encoche ou le clavier.
4. Préparer une zone, couper le réseau, fermer de force puis relancer : bâtiments, carte,
   passages durables et synchronisation au retour réseau selon les garanties du lot C.
5. Refuser puis autoriser la position, passer en arrière-plan pendant la recherche : pas
   de suivi persistant. Comparer l'indicateur GPS et la batterie sur une sortie réelle.
6. Déplacer/zoomer la carte pendant 10 minutes, changer de zone et ouvrir des fiches :
   surveiller mémoire et rechargements système ; mesurer les lectures et les temps sur
   un appareil modeste. Ajuster les budgets seulement à partir de ces observations.
