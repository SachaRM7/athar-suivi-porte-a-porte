# AGENTS.md — Athar

Outil de coordination du porte-à-porte pour l'effort de tabligh à Toulouse.
أثر signifie « la trace » : ce que l'outil enregistre, ce sont les passages qu'on laisse derrière soi.

## À lire avant d'écrire du code

La spécification complète vit dans `docs/athar/`. Ne commence aucune tâche sans avoir lu ce qui la concerne.

| Fichier | Contenu |
|---|---|
| `docs/athar/00-BRIEF.md` | Contexte, principes, vocabulaire, méthode |
| `docs/athar/01-DESIGN-SYSTEM.md` | Jetons, typographie, composants |
| `docs/athar/02-DATA-MODEL.md` | Firestore, dérivations, règles de sécurité |
| `docs/athar/03-CARTO.md` | BD TOPO, RNB, PMTiles, couches MapLibre |
| `docs/athar/04-SCREENS.md` | Chaque écran, écran par écran |
| `docs/athar/05-TASKS.md` | Lots de travail ordonnés (WP0 → WP8) |
| `docs/athar/mockup.html` | **Maquette de référence** — ouvrir dans un navigateur |

## Stack

React + Vite · Firebase (Auth + Firestore) · MapLibre GL JS · PMTiles.
Développement sous Windows.

Node 22 requis (`.nvmrc`, `engines`). Vérification : `npm run check:node22`.

| But | Commande |
|---|---|
| Lancer en développement | `npm run dev` (Vite, http://localhost:5174) |
| Lancer avec les émulateurs Firebase | `npm run dev:local` (PowerShell) |
| Construire | `npm run build` (`tsc -b && vite build`) |
| Vérifier le bundle produit | `npm run verify:build` |
| Prévisualiser le build | `npm run preview` (port 5274) |
| Linter | `npm run lint` (ESLint sur tout le dépôt) |
| Tests unitaires (veille) | `npm test` |
| Tests unitaires (une passe) | `npm run test:run` |
| Tests end-to-end | `npm run test:e2e` (Playwright, hors `@emulator`) |
| Tests d'intégration Firestore | `npm run test:emulator` (PowerShell, démarre les émulateurs) |
| Tests e2e sur émulateurs | `npm run test:e2e:emulator` (PowerShell) |
| Régénérer le fond de carte Toulouse | `npm run map:generate:toulouse` (PowerShell) |

Avant de clore un lot : `npm run lint`, `npm run test:run`, `npm run build`.

## Règle de session

**Un lot de travail par session.** Prendre le premier WP non terminé de `05-TASKS.md`, l'exécuter, vérifier
ses critères d'acceptation, s'arrêter. Ne pas enchaîner sur le suivant sans qu'on te le demande.

Ne refactore rien hors du périmètre du lot en cours. Si tu vois un problème ailleurs, note-le dans
`docs/athar/QUESTIONS.md` au lieu de le corriger.

Si une information manque : implémente l'hypothèse la plus simple, marque-la d'un commentaire
`// HYPOTHÈSE:` et consigne la question dans `docs/athar/QUESTIONS.md`.

Commits atomiques, message en français, préfixé du lot : `WP3: coupe verticale du bâtiment`.

## Principes non négociables

1. La carte est le produit — plein écran, le chrome flotte au-dessus, aucun bandeau fixe.
2. Fond de carte clair par défaut. Le sombre est illisible dehors ; option nuit seulement.
3. Terrain et Édition sont deux modes. Créer / modifier / supprimer une zone n'existent pas en mode Terrain.
4. Une seule action primaire par écran.
5. La couleur porte le statut, jamais la décoration. Le safran `#E0A106` n'est utilisé que pour l'action
   primaire et la position GPS — nulle part ailleurs.
6. **On n'écrase jamais l'historique.** Un passage est un document ajouté dans `passages`, immuable.
   Une correction se fait en ajoutant un passage, pas en modifiant le précédent.
7. **On ne matérialise pas ce qui n'existe pas.** Un bâtiment détecté sur la carte mais jamais visité n'a
   aucun document Firestore. Le gris « pas encore fait » est l'absence d'enregistrement.
8. Zone du pouce — sur mobile, tout ce qui est interactif est atteignable en bas de l'écran. Cibles ≥ 44 px.

## Vocabulaire figé

Libellés affichés à l'utilisateur. Ne pas les reformuler, ne pas les traduire, ne pas les abréger.

| Clé | Libellé | Sens |
|---|---|---|
| `todo` | Pas encore fait | Aucun passage enregistré |
| `open` | Contact établi | Quelqu'un a ouvert et a échangé |
| `away` | Absent | Personne n'a ouvert |
| `linked` | Attaché à l'effort | Seul statut qui sort la porte du cycle de suivi |
| `dnd` | Ne pas déranger | La personne a demandé à ne plus être sollicitée |
| `locked` | Accès bloqué | Interphone, digicode, portail |

« À confier aux sœurs » est un **marqueur booléen séparé**, cumulable avec n'importe quel statut.
Ce n'est pas un septième statut et il ne doit jamais être présenté comme tel.

Étages : `RDC`, `1er`, `2ème`, `3ème`… jamais `R+1`.

## Rédaction

- Un bouton dit ce qu'il fait : « Créer 16 portes », pas « Générer ». « Enregistrer le passage », pas « Valider ».
- Un état vide est une invitation à agir, pas un constat d'absence de données.
- Une erreur explique ce qui s'est passé et comment le réparer. Elle ne s'excuse pas.
- Pas de majuscules de titre : phrase normale.

## Données sensibles

La composition du foyer et le marqueur « à confier aux sœurs » engagent une responsabilité particulière :
noter « femme seule » à une adresse précise dans une base partagée n'est pas anodin.

- Ces champs n'apparaissent **jamais** dans une liste de bâtiments, ni dans un export.
- Sur la carte, seul l'anneau rose au niveau du bâtiment est visible.
- La composition n'est lisible qu'en ouvrant la fiche de la porte concernée.

## Ce qu'il ne faut pas faire

- Ne pas utiliser `localStorage` pour des données métier — Firestore fait foi, cache hors-ligne activé.
- Ne pas géocoder une adresse pour placer un bâtiment. L'ancrage est l'ID-RNB, l'adresse est une étiquette.
- Ne pas ajouter de dépendance sans la justifier dans le message de commit.
- Ne pas introduire de couleur, de taille de police ou de rayon hors des jetons de `01-DESIGN-SYSTEM.md`.
- Ne pas construire les fonctionnalités listées « hors périmètre » en fin de `05-TASKS.md`.
