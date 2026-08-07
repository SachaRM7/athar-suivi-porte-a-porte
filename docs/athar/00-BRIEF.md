# Athar — brief d'implémentation

## Contexte

Athar (أثر, « la trace ») est un outil de coordination du porte-à-porte pour l'effort de tabligh à Toulouse.
Repo : `SachaRM7/athar-suivi-porte-a-porte`.

**Utilisateur type** : un frère debout dans la rue, téléphone dans une main, en plein soleil, entre deux portes.
**Utilisateur secondaire** : un coordinateur qui relit la couverture d'une zone depuis un ordinateur.
**Le job de l'écran principal** : savoir où aller maintenant, et enregistrer ce qui vient de se passer en deux taps.

## Stack existante

React + Vite, Firebase (Auth + Firestore), MapLibre GL JS, PMTiles.

## Référence visuelle

`mockup.html` dans ce dossier est la **maquette de référence**. Ouvre-la dans un navigateur avant d'écrire du code.
Elle contient les deux breakpoints (bascule Desktop / Mobile en haut) et tous les écrans décrits dans `04-SCREENS.md`.
Les valeurs exactes de couleur, de typo et d'espacement sont dans `01-DESIGN-SYSTEM.md` — ce fichier fait foi,
la maquette illustre.

## Principes non négociables

1. **La carte est le produit.** Plein écran, le reste flotte au-dessus. Aucun bandeau fixe ne mange la hauteur.
2. **Fond de carte clair par défaut.** Le sombre est illisible dehors en journée. Option nuit seulement.
3. **Terrain et Édition sont deux modes.** Créer / modifier / supprimer une zone n'existent pas en mode Terrain.
4. **Une seule action primaire par écran.** Sur Terrain : marquer une porte.
5. **La couleur porte le statut**, jamais la décoration.
6. **On n'écrase pas l'historique.** Chaque passage est un enregistrement ajouté, jamais un champ mis à jour.
7. **On ne matérialise pas ce qui n'existe pas.** Un bâtiment détecté mais jamais visité n'a aucun document en base.
8. **Zone du pouce.** Tout ce qui est interactif sur mobile est atteignable en bas de l'écran.

## Vocabulaire figé

Ces libellés sont ceux affichés à l'utilisateur. Ne pas les reformuler.

| Clé | Libellé FR | Sens |
|---|---|---|
| `todo` | Pas encore fait | Aucun passage enregistré |
| `open` | Contact établi | Quelqu'un a ouvert et a échangé |
| `away` | Absent | Personne n'a ouvert |
| `linked` | Attaché à l'effort | **Seul statut qui sort la porte du cycle de suivi** |
| `dnd` | Ne pas déranger | La personne a demandé à ne plus être sollicitée |
| `locked` | Accès bloqué | Interphone, digicode, portail |

Marqueur séparé (booléen, cumulable avec n'importe quel statut) : **À confier aux sœurs**.

Notes de rédaction :
- « Ne pas déranger » et non « Refus ». La personne n'a pas refusé l'islam, elle a demandé la paix.
- Le bouton dit ce qu'il fait : « Créer 16 portes », pas « Générer ». « Enregistrer le passage », pas « Valider ».
- Un état vide est une invitation à agir, pas un constat d'absence de données.

## Méthode de travail attendue

- Lis les fichiers dans l'ordre : `00` → `01` → `02` → `03` → `04`, puis exécute `05-TASKS.md`.
- **Un lot de travail (WP) par session.** Ne pas enchaîner. Chaque WP a des critères d'acceptation à vérifier avant de passer au suivant.
- Ne refactore rien hors du périmètre du WP en cours.
- Si une information manque, écris ta question dans `docs/athar/QUESTIONS.md` et implémente l'hypothèse la plus simple en la signalant par un commentaire `// HYPOTHÈSE:`.
- Commits atomiques, message en français, préfixé par le numéro du WP (ex. `WP3: coupe verticale du bâtiment`).

## Plancher de qualité

- Cibles tactiles ≥ 44 px.
- Focus clavier visible partout.
- `prefers-reduced-motion` respecté.
- Aucun `localStorage` pour des données métier : Firestore fait foi, avec cache hors-ligne Firestore activé.
- L'app doit rester utilisable avec une connexion instable : le porte-à-porte se fait souvent en sous-sol ou en cage d'escalier.
