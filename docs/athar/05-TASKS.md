# Athar — lots de travail

**Un lot par session.** Vérifier les critères d'acceptation avant de passer au suivant.
Ne rien refactorer hors périmètre. Commits préfixés `WPn:`.

---

## WP0 — Fondations visuelles

Installer les jetons de `01-DESIGN-SYSTEM.md` dans une feuille globale, charger les trois familles de police,
créer les primitives partagées : `Chip`, `Stepper`, `Sheet`, `Dialog`, `StatusDot`, `MicroLabel`, `TraceBar`.

**Acceptation** — une page de démonstration `/_ds` affiche chaque primitive dans tous ses états ; aucune couleur
en dur hors des jetons ; le safran n'apparaît que sur l'action primaire ; focus clavier visible partout.

---

## WP1 — Coquille terrain et modes

Carte plein cadre, chrome flottant, bascule Terrain/Édition, panneau desktop et sheet mobile avec ses trois
hauteurs. Aucune donnée réelle : jeu de test en dur.

**Acceptation** — sur mobile la carte occupe tout l'écran, la sheet monte et descend, le FAB suit ; en mode
Terrain aucune action de zone n'est visible ; la barre d'édition n'apparaît qu'en mode Édition.

---

## WP2 — Modèle Firestore et règles

Créer les collections de `02-DATA-MODEL.md`, les index, les règles de sécurité, les Cloud Functions de
dérivation, et un script de peuplement `scripts/seed.ts` avec une zone de test.

**Acceptation** — `passages` refuse toute mise à jour et toute suppression, y compris par son auteur ;
créer un passage met à jour `door.derived` puis `building.derived` ; les tests de règles passent.

---

## WP3 — Vue bâtiment en coupe

Coupe verticale, étiquettes `RDC / 1er / 2ème`, ligne de sol, cases de porte colorées par statut, anneau rose
du marqueur, action « tout marquer absent » par étage.

**Acceptation** — l'ordre visuel va du dernier étage vers le RDC ; un étage complet affiche « terminé » ;
« tout marquer absent » crée un passage par porte non faite, en une écriture groupée.

---

## WP4 — Fiche porte et passages

Sheet de détail, grille de résultats, chips de composition du foyer avec activation automatique du marqueur,
interrupteur sœurs, historique daté.

**Acceptation** — enregistrer un résultat crée un document dans `passages` et ne modifie jamais les précédents ;
l'historique affiche auteur et date ; `foyer` et le marqueur n'apparaissent nulle part dans les listes.

---

## WP5 — Dialogue de structure et édition

Steppers avec gloses, trois schémas de numérotation, aperçu vivant, création groupée. Mode modification :
ajout et suppression de portes et d'étages, confirmation en case pour les portes avec historique.

**Acceptation** — l'aperçu se met à jour à chaque changement de réglage ; le bouton annonce le nombre exact de
portes à créer ; une porte avec passages ne peut pas être supprimée en un seul clic.

---

## WP6 — Chaîne cartographique

Suivre `03-CARTO.md` : inspection du schéma BD TOPO (**consigner les noms de champs réels dans ce fichier**),
filtrage, jointure RNB, génération PMTiles, script documenté dans `scripts/carto/README.md`.

**Acceptation** — le tuileset couvre les zones de Toulouse utilisées ; un échantillon de 20 bâtiments vérifiés
à la main montre que garages et locaux commerciaux sont bien écartés ; chaque emprise porte un `rnb_id`.

---

## WP7 — Carte vivante

Couches MapLibre dans l'ordre prescrit, `feature-state` alimenté depuis Firestore, appui sur emprise ouvrant
la vue bâtiment, mode pose manuelle avec bandeau de consigne.

**Acceptation** — un bâtiment sans document s'affiche en gris bordé et ouvre l'état vide ; l'appui dans le vide
ne crée rien ; en dessous du zoom 16 seules la zone et sa progression agrégée sont visibles.

---

## WP8 — Ancienneté et pré-remplissage

Colonne d'ancienneté dans la liste, seuil d'alerte à 90 jours, filtre « Pas vu > 3 mois », tri par ancienneté,
pré-remplissage du dialogue de structure depuis les attributs BD TOPO avec mention « à confirmer ».

**Acceptation** — un bâtiment jamais visité affiche « jamais vu » ; au-delà de 90 jours la mention passe en
ambre ; le pré-remplissage n'est jamais appliqué sans validation humaine.

---

## Hors périmètre pour l'instant

Calque de parcours d'une sortie (relecture coordinateur), niveaux en sous-sol, export CSV,
notifications de relance. À rouvrir seulement avec des données de sorties réelles.
