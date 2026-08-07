# Revue d'architecture du mini-lot 8.5

Date : 3 aout 2026

## Verdict

**GO pour l'etape 9.** La revue a trouve quatre faux positifs dans les petits
prototypes, tous corriges et couverts par des preuves. Aucun ne subsiste comme
risque bloquant pour le pilotage desktop.

## Corrections issues de la revue

1. La previsualisation de structure reutilisait un ID factice constant et
   echouait lorsqu'elle devait creer plusieurs portes. Les IDs de previsualisation
   sont maintenant uniques.
2. Le bouton de resolution d'un libelle ambigu ne reinjectait pas l'ID choisi
   dans le plan manuel. La correspondance utilise maintenant etage + libelle
   normalise.
3. Le contrat ne pouvait pas distinguer une reactivation d'une nouvelle porte
   physique au meme emplacement. `DoorStructureTarget.newDoorId` force desormais
   une nouvelle identite, tandis que l'ancienne porte reste archivee avec son
   historique.
4. Une meme porte pouvait etre assignee deux fois dans un plan. Le diff refuse
   maintenant cette incoherence avant toute mutation.
5. Une edition structurelle locale qui toucherait une porte avec intention
   outbox est bloquee jusqu'a synchronisation ou resolution.
6. Un passage cree hors ligne avant l'archivage de sa porte et envoye apres cet
   archivage etait refuse par les regles. Les regles acceptent maintenant le lot
   passage + statut sans reactiver la porte ; `active` reste `false`. Le client
   continue d'interdire toute nouvelle saisie apres avoir observe l'archive.

## Conditions examinees

| Condition | Resultat | Preuve |
|---|---|---|
| Regeneration non destructive | Passe | 10 vers 12, reactivation et remplacement physique explicite |
| Revisions independantes | Passe | bump structure, passage concurrent et passage retarde apres archivage |
| Actions groupees | Passe | un UUID, une revision et une intention par porte ; resultat partiel explicite |
| Conflits et outbox | Passe | porte concernee conservee pour la resolution, dependances bloquees, UID partitionne |
| Hors-ligne | Passe | PMTiles/pixels, intentions persistantes, reprise reseau et deux clients |
| Regles Firebase | Passe | champs cibles, lots atomiques, auteur/membre/statut et archives couvertes |
| Parcours mobile/desktop | Passe | deux taps, etages, progression et dialogue desktop borne |

## Autorisation structurelle

L'entree d'edition visible est reservee aux administrateurs. Cette restriction
UI n'est pas une frontiere serveur : la matrice V1 et les regles Firestore
autorisent encore un membre actif a creer ou modifier un batiment et ses portes.
Ce choix reste acceptable pour l'usage prive actuel, mais doit etre tranche puis
aligne entre interface, passerelle et regles avant une ouverture elargie.

## Limites non bloquantes

- Une action groupee est volontairement une suite de passages, pas une
  transaction multi-portes. Une interruption peut donc laisser un resultat
  partiel, affiche comme tel.
- Le verrou structure/outbox local ne voit que la partition de l'utilisateur
  courant. La regle de passage sur porte archivee preserve cependant le travail
  hors ligne d'un autre appareil sans reactiver la porte.
- La carte authentifiee lit encore les donnees de demonstration. L'etape 9 doit
  brancher les lectures Firestore derriere les depots sans charger toutes les
  portes.
- Le batch structurel reste limite a 500 ecritures et la preuve Android physique
  reste reportee a la beta terrain.

## Validations finales

- `npm run lint` : passe.
- `npm run test:run` : 44 tests dans 13 fichiers passent.
- `npm run test:emulator` : 38 tests dans 6 fichiers passent.
- `npm run test:e2e` : 4 parcours passent, PMTiles/pixels inclus.
- `npm run test:e2e:emulator` : 2 parcours passent avec deux clients.
- `npm run verify:build` : passe, MapLibre reste differe.
- `npm audit --omit=dev` : 0 vulnerabilite de production.

Aucun pilotage desktop, aucune statistique globale, aucune etape 9 et aucun
deploiement cloud n'ont ete commences pendant cette revue.
