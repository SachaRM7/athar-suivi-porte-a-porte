# Athar — questions ouvertes

Questions rencontrées en cours d'implémentation. Une entrée par question, la plus récente en haut.
Une question résolue est déplacée dans « Tranchées » avec la décision.

---

_(aucune)_

---

## Tranchées

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
