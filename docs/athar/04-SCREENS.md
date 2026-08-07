# Athar — écrans

Référence visuelle : `mockup.html`.

## 1. Écran terrain — desktop

Carte plein cadre. Tout le reste flotte au-dessus.

- **Barre haute** (top 16, left/right 16) : wordmark · chip de zone · espace · bascule Terrain/Édition · avatar.
- **Panneau gauche** (top 74, bottom 16, largeur 352) : carte flottante arrondie, ombre portée. Contient :
  - en-tête : « Sortie du jour » + durée, **barre de trace**, champ de recherche ;
  - filtres : Tous · Pas encore fait · Pas vu > 3 mois · Sœurs · Bloqués ;
  - liste des bâtiments ;
  - pied : « Couverture de la zone » + barre segmentée par statut.
- **Légende** en bas, à droite du panneau.
- **FAB** en bas à droite : recentrer (fantôme) + « Marquer une porte » (safran).
- **Mode Édition** : une barre flottante apparaît en bas au centre (Nouvelle zone · Redessiner · Ajouter un
  bâtiment · Supprimer), la légende se masque. Ces actions **n'existent pas** en mode Terrain.

## 2. Écran terrain — mobile

Carte plein écran, sheet en bas.

- **Barre haute** : chip de zone extensible · recherche · menu.
- **FAB** : recentrer, positionné juste au-dessus de la sheet, remonte avec elle.
- **Sheet**, trois hauteurs : `peek` (306) · `building` (620) · `detail` (392).
  La poignée bascule entre `peek` et `full` ; elle est inerte quand une sous-vue est ouverte.
- Contenu `peek` : « Sortie du jour », barre de trace, filtres, liste, puis un bouton pointillé
  « Ajouter un bâtiment » en fin de liste.

## 3. Vue bâtiment — coupe verticale

**C'est l'écran qui remplace la grille de cartes de l'app actuelle.** Un immeuble est vertical : on l'affiche
empilé, pas à plat.

- Étages du haut vers le bas, RDC en dernier, puis une **bande hachurée** et la mention « Rue · entrée principale ».
- Étiquettes : `RDC`, `1er`, `2ème`, `3ème`… (jamais `R+1`).
- Un filet vertical traverse la colonne d'étiquettes — c'est le trait de coupe.
- Chaque étage : étiquette, en-tête (`N portes` · `faites/total`), grille de cases de porte
  (`repeat(auto-fill, minmax(52px,1fr))`, gouttière 7px), plus une case « + » en fin de rangée.
- Un étage incomplet propose **« tout marquer absent »**. C'est le cas le plus fréquent du porte-à-porte et
  le vrai point de friction : trois portes sur cinq ne répondent pas, les saisir une par une décourage.
  Un étage complet affiche « terminé ».
- En-tête de la vue : retour vers la zone, adresse en mono, sous-ligne, boutons « Modifier » et « Structure »,
  barre de progression et compteur `11 / 18`.

Le gain à préserver : on voit d'un coup d'œil que le 2ème est presque bouclé et que personne n'est monté au 3ème.

## 4. Fiche porte

Ouverte au tap sur une case. Sheet `detail`.

- Retour vers le bâtiment, titre `Porte 12 · 1er` en mono 17px, sous-ligne descriptive.
- **Résultat du passage** : grille 2×2 (Contact établi · Absent · Attaché à l'effort · Ne pas déranger)
  + une ligne pleine largeur « Accès bloqué (interphone / code) ».
  `Attaché à l'effort` est mis en avant : c'est le seul qui sort la porte du cycle.
- **Composition du foyer** : chips Femme seule · Homme seul · Couple · Famille · Non renseigné.
  Choisir « Femme seule » **active automatiquement** le marqueur sœurs, avec la mention
  « Activé automatiquement — tu peux le désactiver ». L'outil tire la conséquence sans retirer la décision.
- **Marqueur « À confier aux sœurs »** : interrupteur pleine largeur, bordure rose quand actif.
  Cumulable avec n'importe quel statut — ce n'est pas un statut.
- **Historique des passages** : les derniers passages datés, avec pastille de résultat et auteur.
  Trois « absent » d'affilée n'ont pas le même sens qu'un seul : il faut changer d'horaire, pas insister.

## 5. Dialogue de structure

Ouvert depuis « Structure », ou depuis l'état vide.

Champs :
1. **Étages au-dessus du rez-de-chaussée** — stepper, glose « étages · RDC compris = N niveaux ».
   La confusion étages/niveaux est la première source d'erreur : la glose la lève.
2. **Portes par étage** — stepper, glose « modifiable étage par étage ».
3. **Numérotation** — trois schémas : `01, 02 · 11, 12` · `101, 102 · 201` · `1 à N, en suite`.
4. **Aperçu vivant** — la structure se dessine pendant le réglage, avec les numéros réels et la ligne de sol.
   C'est le cœur de l'écran : on valide parce que ça ressemble à l'immeuble qu'on a devant soi.
5. Bouton primaire libellé par son effet : **« Créer 16 portes »**.

Si la BD TOPO fournit `nombre_d_etages` et `nombre_de_logements`, pré-remplir les steppers et afficher
« suggestion d'après le cadastre — à confirmer ».

## 6. Mode modification des portes

Activé par « Modifier » dans l'en-tête du bâtiment. Le bouton devient « Terminer ».

- Un `×` rouge en coin de chaque porte.
- Chaque étage : « + porte » et « supprimer l'étage ».
- En haut de la pile : « + Ajouter un étage au-dessus ».
- En bas, barre collante explicative + bouton « Terminé ».
- **Suppression** : une porte sans passage disparaît au premier clic. Une porte avec historique bascule la case
  en confirmation dans la case elle-même (« Supprimer l'historique ? » + ✓ / ×). Supprimer une porte visitée
  efface le travail de frères ; ce n'est pas la même opération que corriger une faute de saisie.

## 7. États vides

**Bâtiment non décrit** — icône, titre, puis :
« Aucun étage ni porte enregistré. Décris la structure une fois — tout le suivi viendra s'y accrocher. »
Action primaire « Décrire le bâtiment », action secondaire **« C'est un pavillon — une seule porte »**.

Ce raccourci n'est pas cosmétique : une grande partie du bâti des zones est pavillonnaire, et faire passer
un frère par un formulaire à trois réglages pour une maison individuelle est absurde.

Tant qu'un bâtiment n'a pas de structure, **la barre de progression et le pied de panneau disparaissent**.
Une jauge à zéro dit « tu n'as rien fait » ; la vraie situation est « il n'y a rien à faire tant que ce n'est
pas décrit ». Deux messages très différents pour qui découvre l'outil.
