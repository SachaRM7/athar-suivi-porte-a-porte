# Athar — questions ouvertes

Questions rencontrées en cours d'implémentation. Une entrée par question, la plus récente en haut.
Une question résolue est déplacée dans « Tranchées » avec la décision.

---

## Q4 — Erreur de lint préexistante dans `WorkspaceMap.tsx`

_Relevée pendant WP0, hors périmètre — non corrigée._

`npm run lint` échoue sur une seule erreur, antérieure à WP0 :

```
src/features/map/components/WorkspaceMap.tsx:124:5
react-hooks/set-state-in-effect — Avoid calling setState() directly within an effect
```

L'effet des lignes 122-126 recopie le nom et la couleur de la zone sélectionnée dans deux états
de brouillon. Le correctif habituel est de dériver ces valeurs au rendu, ou de les remettre à zéro
via une clé de composant plutôt que par un effet.

**Question** — on le corrige dans un lot dédié, ou au moment où WP7 réécrit cette couche carte ?
En attendant, `npm run lint` reste rouge pour cette seule raison, ce qui masquerait une régression
introduite par un lot suivant.

---

## Q3 — Polices servies par Google Fonts

**Contexte** — WP0 charge Space Grotesk, IBM Plex Sans, IBM Plex Mono et Noto Kufi Arabic depuis
`fonts.googleapis.com`, comme `docs/athar/mockup.html`. C'est l'hypothèse la plus simple, signalée
par un commentaire `HYPOTHÈSE:` dans `index.html`.

**Problème** — `00-BRIEF.md` exige que l'application reste utilisable avec une connexion instable :
« le porte-à-porte se fait souvent en sous-sol ou en cage d'escalier ». Une police non chargée
retombe sur la pile système, donc rien ne casse, mais l'interface change d'allure hors ligne — et
le mono, qui est ce qui rend une adresse scannable, n'est plus garanti.

**Question** — auto-héberger les quatre familles dans `public/fonts/` et les déclarer en
`@font-face`, avec mise en cache par le service worker ? Cela ajoute des fichiers binaires au
dépôt mais supprime la dépendance réseau et l'appel à un tiers.

---

## Q2 — La glose du stepper est en 12 px, taille absente de l'échelle

**Contexte** — `01-DESIGN-SYSTEM.md` dit deux choses incompatibles :

- section « Typographie » : « Échelle : 10 / 11.5 / 12.5 / 13.5 / 15 / 17 / 19 px. **Pas d'autres
  tailles.** »
- section « Composants », stepper : « une glose en **12px** `--ink-soft` ».

`docs/athar/mockup.html` utilise bien 12 px.

**Décision provisoire** — WP0 prend `--t-125` (12.5 px), la valeur d'échelle la plus proche, pour ne
pas introduire de taille hors jeton. Marqué `HYPOTHÈSE:` dans `src/design/primitives.css`.

**Question** — on ajoute 12 px à l'échelle, ou on corrige la section « Composants » à 12.5 px ?

---

## Q1 — Jetons du fond de carte sombre

**Contexte** — `00-BRIEF.md:26` autorise une option nuit, et le fond clair reste le défaut.
Mais `01-DESIGN-SYSTEM.md` ne définit **que** la palette claire : `--map-bg`, `--map-road`,
`--map-park`, `--map-water`, `--foot-out`, `--foot-todo`, `--foot-todo-line`.

Aucun équivalent sombre n'existe dans les jetons, alors que `AGENTS.md` interdit d'introduire
une couleur hors des jetons du système de design.

**Question** — quelle palette pour le mode nuit ?

Piste la plus simple : ajouter un bloc `[data-theme="nuit"]` à `01-DESIGN-SYSTEM.md` avec les
sept jetons carte sombres, plus les surfaces et le texte. C'est la spec qui fait foi, donc c'est
là que ça se décide.

**Point d'attention** — les six statuts (`--st-todo` → `--st-locked`) et le safran `--accent`
sont calibrés pour un fond clair. Ils devront être revalidés en contraste sur fond sombre, sinon
le mode nuit casse la règle « la couleur porte le statut ».

**Sous-question** — le mode nuit suit-il `prefers-color-scheme`, ou reste-t-il un réglage
explicite ? Le brief dit « option », ce qui suggère un réglage manuel : un frère qui sort à 14 h
avec son téléphone en thème sombre système ne veut pas une carte illisible.

---

## Tranchées

_(vide)_
