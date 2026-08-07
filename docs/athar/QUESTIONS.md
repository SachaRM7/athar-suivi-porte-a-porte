# Athar — questions ouvertes

Questions rencontrées en cours d'implémentation. Une entrée par question, la plus récente en haut.
Une question résolue est déplacée dans « Tranchées » avec la décision.

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
