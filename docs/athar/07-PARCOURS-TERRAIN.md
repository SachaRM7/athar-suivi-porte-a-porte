# Lot C — parcours terrain

Base : `main` après les lots A et B, `bd67c11`. Le lot C conserve les droits,
l’historique immuable, la file durable du lot A et les indicateurs du lot B.
Il ne crée ni « sortie » métier, ni géocodage d’adresse, ni suggestion de contact
pour une porte sortie du suivi. La publication reste une opération séparée.

## C1 — Entrer dans le bâtiment et retrouver une adresse

`WorkspaceMap.tsx` et `field-navigation.ts` :

- « Marquer une porte » reprend le dernier bâtiment choisi dans cette zone s’il
  reste dans le suivi ; avec un seul candidat, il ouvre directement sa fiche.
  Sinon, un dialogue propose les bâtiments suivis autour du centre de la carte.
- La proximité annoncée concerne le centre de la carte, pas une position GPS
  supposée. Le choix reste explicite et n’enregistre aucun passage.
- Les bâtiments dont toutes les portes sont DND/linked ne sont pas proposés.
  Leur consultation manuelle reste possible pour une correction explicite.
- Le dialogue permet aussi de revenir à la carte pour choisir une emprise non
  décrite. Une emprise ne crée toujours aucun document tant qu’elle n’est pas décrite.
- La recherche porte sur les bâtiments suivis de la zone sélectionnée. Elle tolère
  accents, casse, ponctuation et ordre des mots. Un résultat de recherche vide,
  un filtre vide, un chargement et un échec de lecture sont distingués.

Acceptation : le bouton conduit à un choix réel ou à une fiche ; la recherche
« eglise 12 » retrouve « 12 rue de l’Église » ; une recherche sans résultat ne
déclare pas la zone vide. Le dialogue conserve le focus et le rend à sa fermeture.

## C2 — Voir où la saisie est sauvegardée

`FieldSyncNotice.tsx`, `field-sync-status.ts`, `BuildingVisitSheet.tsx` :

- La zone conserve un état de sauvegarde visible après fermeture de la fiche.
  Les symboles et libellés distinguent confirmation serveur, conservation sur
  l’appareil, envoi différé, conflit/refus et panne de stockage.
- Avant lecture de la file, « Vérification des saisies… » remplace toute confirmation
  prématurée. Un profil de foyer en attente compte aussi comme une saisie en attente.
- Une saisie refusée localement reste signalée dans la zone pendant la session,
  même si la file est lisible et vide ; « Reprendre la saisie » retrouve le bâtiment.
  Une lecture de file réussie ne suffit pas à faire disparaître cet échec.
- Un conflit depuis la zone ouvre le bâtiment concerné. La résolution dans la fiche
  ne présente que les intentions des portes de ce bâtiment.
- Les doubles appuis pendant l’enregistrement sont bloqués. La confirmation locale
  vient après la transaction durable ; la synchronisation se poursuit sans bloquer
  le choix suivant.
- Le chargement d’une fiche ne ressemble plus à un bâtiment non décrit. Une réponse
  périmée de bâtiment ou d’historique est ignorée. Un historique illisible ne devient
  pas « aucun passage » ; un auteur non disponible ne s’affiche pas comme un UUID.

Acceptation : perte de réseau → intention durable → retour à la zone avec attente
visible → rechargement → même intention → reconnexion → un seul passage serveur.
Si le premier appel échoue alors que le navigateur annonce déjà le réseau disponible,
une relance automatique reprend après cinq secondes, sans exiger un nouvel événement
de connexion. La file conserve son idempotence ; les erreurs serveur réessaient toutes les
trente secondes, les conflits et refus d’accès restent à résoudre explicitement.
Les règles DND, conflits, déconnexion et purge du lot A restent vérifiées.

## C3 — Préparer et vérifier une zone hors ligne

`ZonePreparationControl.tsx`, `zone-preparation.ts` (modèle et infrastructure),
`public/sw.js`, `scripts/offline-build.ts`, `vite.config.ts` :

1. L’utilisateur déclare un appareil personnel de confiance et recharge si
   nécessaire. Cette préférence ne contourne pas la session authentifiée.
2. La préparation récupère l’interface complète, y compris tous les composants
   différés du manifeste Vite, les polices, le fond Toulouse et les emprises.
3. Les données viennent explicitement du serveur, sans repli sur le cache :
   membre courant, zones, statuts, bâtiments de la zone, structure des bâtiments,
   historique des portes actives et profils de leurs auteurs.
4. Les requêtes paginent par identifiant et incluent les portes rattachées aux
   bâtiments même hors bbox. Les structures de plus de 250 portes sont également
   relues par pages. Budgets de préparation : 10 000 documents et 2 500 requêtes
   logiques ; dépassement explicite, aucun succès partiel.
5. Chaque ensemble téléchargé est relu depuis le cache et comparé par nombre et
   empreinte. Une collection vide vérifiée est distincte d’une collection manquante.
6. Un reçu lié au projet/workspace/UID/zone conserve les périmètres des requêtes et
   leurs empreintes, pas une seconde copie des foyers ou des notes. Les données
   métier restent dans le cache Firestore ; les intentions dans la file de A.
7. L’application recontrôle les ressources et reçus à l’ouverture et lors du retour
   sur la page ou de la perte de réseau. La date de téléchargement reste visible.

Le succès exige interface, glyphes, fond et emprises couvrant la bbox de la zone,
ainsi que les données relisibles. L’archive départementale doit être réellement
présente ; une page HTML 200 de Firebase Hosting n’est jamais acceptée comme PMTiles.
Les sections déclarées de l’archive doivent tenir dans le fichier téléchargé.
L’échantillon des Carmes est toujours annoncé comme partiel, même si sa bbox
contient la zone. Les emprises sont servies par plages hors ligne, comme le fond.

Le format PMTiles et son emprise ne prouvent pas la qualité exhaustive du référentiel.
La recette du pipeline cartographique et le catalogue complet de B restent nécessaires
pour une couverture géographique officielle. C n’invente ni ne publie cet artefact.

Les noms JS/CSS portent une empreinte et le shell est versionné par build. Une mise
à jour attend la fermeture des onglets existants ; le document et le service worker
doivent annoncer la même version avant la préparation. Une
nouvelle version, un fichier différé manquant, un cache incomplet, une interruption
ou un quota dépassé rendent la préparation indisponible ou partielle. Une préparation
interrompue n’est jamais enregistrée comme terminée. Le téléchargement ne touche pas
aux intentions de passage.

La demande de conservation du stockage est explicite ; un refus du navigateur est
signalé. Elle ne garantit pas que l’utilisateur, le système ou une réinstallation ne
supprimera jamais les données. La reprise suppose une session préexistante et un
profil membre encore disponible ; on ne peut pas créer une première connexion sans
réseau. Les modifications et suspensions distantes ne sont connues qu’après reconnexion.
Voir [persistance Firestore](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
et [conservation du stockage](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist).

## C4 — Protection des limites A/B et validation

Un refus de permission ou d’authentification ne déclenche pas de repli sur le cache.
Les nouveaux reçus et archives portent le préfixe `athar-` et sont couverts par la
purge existante. Une préparation cartographique interrompue par une purge ne recrée
pas ensuite ses caches. Les réponses d’API et les routes privées ne sont pas ajoutées
au Cache Storage ; seul le shell statique connu et les ressources cartographiques le sont.

Tests :

- Unités : recherche et choix de bâtiment, exclusions DND/linked, état initial de la
  synchronisation, empreintes stables, manque/changement de données, zone vide vérifiée,
  interruption, refus serveur, budgets, limites géographiques et archive de démonstration.
- Service worker : HTML à la place d’une archive, fichier tronqué, plages invalides,
  composant différé absent, stockage plein, purge pendant préparation.
- Navigateur authentifié sur émulateurs : choix/recherche/enregistrement, conservation
  visible dans la zone, fermeture puis nouvelle page sans réseau, archives lisibles,
  passage conservé après rechargement puis envoyé une seule fois, refus du téléchargement
  sur appareil non approuvé, quota cartographique et échec d’écriture locale réessayable.
- Recette A/B : droits, DND, conflit entre deux appareils, purge de déconnexion,
  actualisation des statistiques, cohérence carte/admin et laboratoires privés.

Les archives de recette navigateur sont temporaires dans `dist/`, avec un petit
périmètre connu ; elles ne deviennent jamais un fichier de production. La recette
sur iPhone/Android physiques, les performances GPS et la pagination visuelle progressive
relèvent du lot D. Ce document ne prétend pas les avoir validées.
