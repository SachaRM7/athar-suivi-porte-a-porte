# Athar — système de design

Registre visuel : **relevé de terrain**. Instrument technique, pas application décorative.
Ce qui est explicitement écarté : le fond crème + serif à fort contraste + accent terracotta (illisible dehors, et devenu générique).

## Jetons

```css
:root{
  /* surfaces */
  --paper:#FCFCFB;      /* cartes flottantes, panneaux, sheets */
  --sunk:#EEF1ED;       /* champs, pieds de panneau, aplats internes */
  --hairline:#DCE1DC;   /* filets, bordures */

  /* texte */
  --ink:#14181A;
  --ink-soft:#5C6663;
  --ink-faint:#9AA29E;

  /* marque */
  --brand:#16324F;      /* bleu d'encre — chrome, boutons primaires sombres */
  --brand-lift:#23517D; /* liens, retours */
  --accent:#E0A106;     /* safran — UNIQUEMENT l'action primaire et la position GPS */

  /* statuts */
  --st-todo:#8B948F;
  --st-open:#1F7A5A;
  --st-away:#C87A0A;
  --st-linked:#2456A6;
  --st-dnd:#A93B2E;
  --st-locked:#6B5AA8;

  /* marqueur */
  --st-sisters:#C25B7C;

  /* carte */
  --map-bg:#E9ECE5;
  --map-road:#FBFCFA;
  --map-park:#D6E2CE;
  --map-water:#C6D8E1;
  --foot-out:#DEE3DB;      /* bâtiment hors zone, inerte */
  --foot-todo:#CDD3CD;     /* détecté dans la zone, aucun passage */
  --foot-todo-line:#B4BCB4;

  --shadow:0 1px 2px rgba(20,24,26,.06), 0 8px 24px -8px rgba(20,24,26,.18);
  --shadow-lg:0 2px 4px rgba(20,24,26,.06), 0 20px 48px -12px rgba(20,24,26,.28);
  --r:14px;
}
```

**Règle du safran** : `--accent` n'apparaît que sur le bouton d'action primaire et le point « ma position ».
S'il apparaît ailleurs, c'est une erreur.

**Règle des statuts** : une couleur de statut ne sert jamais à autre chose qu'à un statut.

## Typographie

| Rôle | Police | Usage |
|---|---|---|
| Identité / titres | **Space Grotesk** 600 | wordmark, titres de dialogue, noms de zone |
| Interface | **IBM Plex Sans** 400/500/600 | corps, boutons, libellés |
| Donnée | **IBM Plex Mono** 500/600 | adresses, numéros de porte, compteurs, dates, distances, micro-libellés |

Une adresse **est** une donnée : toujours en mono. C'est ce qui la rend scannable.

Micro-libellé (`.microlabel`) : Plex Mono 10px, `letter-spacing:.12em`, majuscules, `--ink-soft`.

Échelle : 10 / 11.5 / 12.5 / 13.5 / 15 / 17 / 19 px. Pas d'autres tailles.

Le wordmark associe أثر (Noto Kufi Arabic 600, `--brand`) et ATHAR (Space Grotesk 600, interlettrage .14em), séparés par un filet vertical.

## Élément signature : la barre de trace

Une bande de traits verticaux, un par porte marquée pendant la sortie en cours. Hauteur et couleur selon le résultat.
Placée en haut du panneau (desktop) et de la bottom sheet (mobile).

Hauteurs : `linked` 26 px · `open` 21 px · `again`/n-a 17 px · `away` 13 px · `locked` 11 px · `dnd` 10 px.
Largeur de trait 4 px, gouttière 2 px, coin 1 px. Une pause de sortie s'affiche par un vide de 9 px.

C'est le seul endroit où l'interface se permet de l'audace. Tout le reste reste discipliné.

## Composants

**Chip de zone** — pastille arrondie flottante : anneau de progression 30 px (dasharray sur `--brand`) avec le pourcentage au centre en mono 9.5px, puis nom de zone en Space Grotesk 14px et sous-ligne mono 10.5px « 148 bât. · 92 faits », puis chevron.

**Bascule de mode** — deux segments dans une pastille, l'actif en `--brand` plein.

**Filtres** — pastilles horizontales scrollables, actif en `--ink` plein. Chaque filtre porte une pastille de couleur et son compteur en mono.

**Ligne de bâtiment** (`.bitem`) — pastille de statut 9 px avec halo blanc 3 px, adresse en mono 13px tronquée, méta 11.5px `type · statut · marqueur · note`, colonne droite alignée à droite : distance en mono 11px puis ancienneté en mono 10.5px. L'ancienneté passe en `--st-away` au-delà de 90 jours, en `--ink-faint` si jamais vue.

**Case de porte** (`.door`) — ratio 1/.86, rayon 10px, bordure 1.5px à `rgba(statut,.45)`, fond `rgba(statut,.10)`, numéro en mono 13px 600, barre pleine 3px en bas à la couleur du statut. Marqueur sœurs : `outline:2px solid var(--st-sisters); outline-offset:2px`.

**FAB** — primaire en `--accent` avec texte `#20180A`, secondaire en `--paper` circulaire 46px.

**Bottom sheet** — rayon 22px en haut, poignée 38×4px, trois hauteurs : `peek` 306px, `detail` 392px, `building`/`full` 620px. Transition `.3s cubic-bezier(.2,.8,.2,1)`.

**Dialogue** — centré sur desktop (max 400px, rayon 16px), en sheet sur mobile (rayon 20px en haut). Fond `rgba(10,14,16,.42)` + `backdrop-filter: blur(2px)`.

**Stepper** — bordure 1.5px, boutons 46×46 sur `--sunk`, valeur centrale en mono 15px 600 suivie d'une glose en 12px `--ink-soft` qui explique la conséquence du réglage (ex. « étages · RDC compris = 4 niveaux »).

**Bandeau de consigne** (`.hint`) — pastille `--brand` flottante en haut de carte pendant un mode de pose, avec un bouton Annuler intégré.

## Légende

Deux registres séparés par un filet : d'abord les six statuts, puis en dessous le marqueur sœurs (anneau rose vide, pas un disque plein). Ne jamais présenter le marqueur comme un septième statut.
