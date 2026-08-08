# Athar — questions ouvertes

Questions rencontrées en cours d'implémentation. Une entrée par question, la plus récente en haut.
Une question résolue est déplacée dans « Tranchées » avec la décision.

---

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

### 2026-08-08 — HYPOTHÈSE WP2 · Affectation aux zones par claims Auth

Le modèle WP2 décrit `membreDeZone(zoneId)` sans préciser où vivent les affectations. Les règles racines
utilisent provisoirement les claims Auth `zoneIds: string[]` et `role: 'coordinator'`. Cette hypothèse ne
matérialise aucune donnée métier supplémentaire ; elle devra être remplacée par le modèle d’affectation
explicite lorsqu’il sera spécifié.

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
