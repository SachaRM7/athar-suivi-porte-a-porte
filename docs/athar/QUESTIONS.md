# Athar — questions ouvertes

Questions rencontrées en cours d'implémentation. Une entrée par question, la plus récente en haut.
Une question résolue est déplacée dans « Tranchées » avec la décision.

---

### 2026-08-08 — La liste des bâtiments est empilée au lieu de flotter (WP8)

`04-SCREENS.md` §1 place la liste, ses filtres et son pied dans le **panneau gauche flottant**
(top 74, bottom 16, largeur 352) posé au-dessus d'une carte plein cadre. `WorkspaceMap.tsx` empile
au contraire en-tête, outils, propriétés de zone et liste dans une grille verticale, la carte venant
en dernier.

Tant que la liste tenait en une rangée de pastilles, l'écart restait cosmétique. La colonne
d'ancienneté de WP8 y ajoute une bande de filtres et de tri, et la carte descend de ~100 px : sur un
écran de 800 px, son bas passe sous la ligne de flottaison. J'ai compacté la bande et plafonné la
liste à deux lignes défilantes, et j'ai desserré le seuil `mapBounds.y` de 350 à 400 px dans
`tests/workspace-map.spec.ts` — la garde de hauteur (`> 400 px`) est inchangée.

C'est un pansement. Le vrai correctif est de faire flotter le panneau au-dessus de la carte comme le
prescrit `04-SCREENS.md`, ce qui rend le budget vertical sans objet et restaure le principe 1
(« la carte est le produit »). Hors périmètre de WP8 : cela touche la coquille de WP1 et les huit
tests e2e de carte. À traiter dans un lot de mise en conformité de l'écran terrain.

### 2026-08-08 — Deux schémas Firestore parallèles, et un seul est branché

Le dépôt porte deux modèles côte à côte, ce que les règles assument déjà en commentaire :

- `buildings/{id}/doors/{id}/passages/{id}` — le modèle WP2 spécifié, noms de champs français.
  Ses règles, ses index et ses Functions (`deriveAtharPassage`, `deriveAtharSistersMarker`) existent,
  mais seuls `scripts/seed.ts` et les tests d'émulateur y écrivent.
- `workspaces/main/{buildings,doors,visits}` — noms anglais, plat. C'est ce que l'application lit et
  écrit réellement, de WP3 à WP7.

Conséquence pour la clôture de WP4 : le marqueur est écrit sur `workspaces/…/doors`, sinon l'anneau
rose ne s'allumerait jamais. La dérivation du bâtiment se fait donc côté client, là où WP7 dérive
déjà le statut dominant, et non par la Cloud Function — celle-ci ne voit pas ces documents.

Question : à quel lot rattache-t-on la convergence des deux schémas ? Tant qu'elle n'est pas faite,
chaque champ métier nouveau doit être écrit deux fois ou choisir un camp.

### 2026-08-08 — WP4 · Le champ `foyer` reste éphémère

Même trou que le marqueur, même fiche : `foyer` (`femme` / `homme` / `couple` / `famille`) est saisi
dans la fiche porte et perdu à la fermeture. Il est resté hors du correctif de clôture, qui ne
portait que sur le marqueur.

Il est au moins aussi sensible : c'est lui qui dit « femme seule » à une adresse précise. Le chemin
d'écriture existe désormais — la mutation dédiée du marqueur transporterait le champ sans rien
changer à sa forme. Question : l'ajouter à cette mutation, ou attendre un lot « attributs de porte » ?

---

## Tranchées

### 2026-08-08 — `FirestoreBuildingStructureGateway` écrivait `sisters` : confirmé sur le terrain, corrigé

L'hypothèse était juste, et le symptôme est apparu en préversion : « Missing or insufficient permissions »
au clic sur « Créer 12 portes », aucune porte écrite, le bâtiment restant « non décrit ».

Deux défauts sur le même chemin, pas un seul :

1. `const { id, location, ...doorData } = door` laissait passer `sisters`, absent du `hasOnly` de
   `validDoor()`. Corrigé en sérialisant `aConfierAuxSoeurs`, comme `toFirestoreSeedDocuments`.
2. `batch.update(..., { ...update })` étalait `doorId` dans le document. Ce n'est pas un champ mais
   l'identité du document : la règle de mise à jour, qui n'autorise que
   `floor, label, sortOrder, active, updatedAt`, refusait la clé. Corrigé par déstructuration.

Les tests couvraient déjà les deux cas ; personne ne les avait exécutés. Preuve faite dans les deux
sens : `building-structure.integration.test.ts` échoue 2/6 en `PERMISSION_DENIED` sans le correctif,
passe 6/6 avec. La suite utilise le projet `athar-structure`, isolé de `athar-local` — la crainte
d'effacer les données de pilote qui avait fait reporter la vérification était infondée.

Aucune donnée à réparer : `writeBatch` est atomique, donc le `structureRevision` du bâtiment n'a pas
avancé lors des tentatives refusées. Une nouvelle tentative repart d'un état propre.

### 2026-08-08 — WP4 · Persister le marqueur « à confier aux sœurs » avant de poursuivre WP7

Le rattacher à un correctif de clôture de WP4, à faire avant toute mise en service de la couche
`batiments-soeurs`. C'est une donnée métier sensible de la porte, pas un état visuel de WP7 : elle doit
être écrite dans `doors/{doorId}.aConfierAuxSoeurs`, transportée par une mutation hors-ligne dédiée et
déclencher la dérivation du bâtiment. Elle ne doit jamais modifier un `passage`. Le schéma Firestore,
les règles et les Functions existent déjà ; le trou est dans le modèle, les codecs et l'écriture cliente.

### 2026-08-08 — WP7 · Étiquette d'une emprise sans document

Conserver `Bâtiment <ID-RNB>` comme étiquette de repli tant que le bâtiment n'a pas été décrit. Ne pas
géocoder, ne pas inventer d'adresse et ne pas créer de document Firestore à l'ouverture. Dès que l'adresse
est saisie et enregistrée dans la fiche, elle remplace naturellement cette étiquette.

### 2026-08-08 — WP2 · Aucune affectation aux zones : pas de restriction territoriale

La question était de savoir où vivent les affectations de zone que supposait `membreDeZone(zoneId)`.
Réponse : nulle part, parce qu'il n'y en a pas. **Tout membre peut agir sur n'importe quelle porte,
partout.** Une zone découpe et mesure le travail ; elle ne borne aucun droit.

La protection repose sur l'immutabilité de `passages`, pas sur un périmètre géographique. Un frère qui se
trompe de bâtiment ajoute un passage de trop, il n'efface rien, et l'erreur reste lisible avec son auteur
et sa date. Une frontière n'aurait rien empêché de tel et aurait bloqué en pleine rue le frère qui dépanne
sur la zone d'à côté.

Appliqué : `membreDeZone()` est remplacée par `estMembre()` dans `firestore.rules`, `estMembre()` et
`estCoordinateur()` lisent le custom claim `role` valant `'admin'` ou `'member'`, `02-DATA-MODEL.md` porte
la section « Modèle d'accès » et l'esquisse corrigée, et `tests/emulator/athar-wp2.rules.test.ts` vérifie
qu'un membre agit hors de toute zone d'affectation et qu'un compte sans claim `role` ne lit rien.

### 2026-08-08 — Clôture de WP0 · Les quatre décisions sont appliquées

Q1 — aucun jeton sombre, aucun `prefers-color-scheme` : `tokens.css` ne définit que le thème clair.
Q2 — la glose du stepper reste sur `--t-125` ; aucun jeton 12 px n'a été ajouté.
Q3 — les 7 fichiers WOFF2 sont dans `public/fonts/ui/` (158 Ko), déclarés par `src/design/fonts.css`,
précachés par le service worker (`athar-shell-v10`), et plus aucun appel à Google Fonts n'existe.
Q4 — `WorkspaceMap.tsx` dérive les brouillons de zone au rendu ; `npm run lint` est vert.
Cohérence — la maquette applique « Ne pas déranger », `1er`, les filtres de `04-SCREENS.md` et le
safran sur `.btn-primary`. Ses parcours n'ont pas bougé.

### 2026-08-08 — Cohérence · La spécification prévaut sur les écarts de la maquette

L'inspection visuelle de `mockup.html` montre encore « Refus », `R+1`, les filtres « À faire » / « À revoir »
et des boutons `.btn-primary` bleu d'encre. Ces écarts ne rouvrent pas les décisions : appliquer le vocabulaire
figé (`dnd` / « Ne pas déranger », `1er`), les filtres de `04-SCREENS.md` et le safran pour l'unique action
primaire. La maquette illustre la composition ; `00-BRIEF.md` et `01-DESIGN-SYSTEM.md` font foi. Corriger la
maquette dans le mini-correctif de clôture avant WP1, sans modifier ses parcours.

### 2026-08-08 — Q4 · Corriger le lint avant WP1

Ne pas attendre WP7. Un lint rouge pendant plusieurs lots masquerait les régressions nouvelles. Corriger
`WorkspaceMap.tsx` dans un mini-correctif de clôture avant WP1, en initialisant les brouillons de zone lors de
la sélection ou de l'entrée en édition plutôt qu'avec un `setState` synchrone dans un effet. Le comportement
fonctionnel doit rester identique, puis `lint`, `test:run` et `build` doivent repasser au vert.

### 2026-08-08 — Q3 · Auto-héberger les polices

Oui. L'identité typographique et la lecture mono des adresses font partie du fonctionnement hors ligne, pas
d'un embellissement facultatif. Héberger uniquement les graisses prescrites en WOFF2 dans `public/fonts/`,
les déclarer en `@font-face`, les intégrer au shell du service worker et supprimer les appels Google Fonts.
Cette clôture de WP0 doit être faite avant WP1.

### 2026-08-08 — Q2 · Conserver la glose à 12.5 px

La règle d'échelle prévaut sur l'écart de 0.5 px de la maquette. La glose utilise `--t-125`; la section
« Composants » de `01-DESIGN-SYSTEM.md` est corrigée à 12.5 px. Ne pas ajouter de jeton 12 px.

### 2026-08-08 — Q1 · Pas de mode nuit dans WP0 → WP8

Ne pas inventer une palette sombre avant de la valider sur le terrain : elle toucherait la carte, les surfaces,
les textes et les six statuts. Le thème clair reste l'unique thème des lots actuels. Le mode nuit passe hors
périmètre et, s'il est rouvert dans un lot dédié, sera un réglage manuel — jamais `prefers-color-scheme` — avec
validation de contraste et d'usage en conditions nocturnes.
