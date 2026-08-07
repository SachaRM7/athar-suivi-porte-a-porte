# Resultats de l'etape 8.5-B

> Mise a jour UX du 3 aout 2026 : sur mobile, la vue terrain utilise desormais
> une grille de grandes portes colorees, un rail vertical d'etages et une
> feuille basse de statut en deux taps. Les formulaires de structure et les
> informations techniques sont retires du parcours principal ; l'ajout rapide
> d'un etage passe par une feuille dediee sans changer le diff non destructif.

Date : 3 aout 2026

## Parcours livre

La selection d'un batiment depuis la carte ouvre maintenant son detail :

- panneau contraint a 480 px au plus sur desktop, avec fond modal ; plein ecran sur mobile ;
- barre verticale d'etages, RDC en bas, progression par etage et couverture globale du batiment ;
- seules les portes actives sont presentes dans le parcours terrain, triees par `sortOrder`; les archives restent visibles dans la section structure ;
- un premier tap ouvre la palette de statut de la porte, le second cree le passage local et la projection de porte via `recordLocalVisit` ;
- les actions groupees appliquent le meme chemin, une porte apres l'autre. Elles conservent donc un passage, un UUID, une revision et une intention outbox par porte. Elles ne modifient jamais `structureRevision`.

La porte concernee reste selectionnee apres le second tap. Un conflit ou rejet
provenant de la synchronisation reste ainsi visible et resoluble dans le detail,
sans garder la palette de saisie ouverte.

## Edition de structure

L'edition est reservee a l'administrateur et repliee par defaut. Elle fournit :

- une generation rapide etage/portes/premier numero ;
- un plan manuel dont les lignes peuvent porter l'ID historique ;
- une previsualisation qui bloque tout renommage ambigu et demande de choisir explicitement la porte historique ;
- la liste des portes archivees, hors du parcours terrain.

La vue appelle uniquement `applyBuildingStructure`, donc le diff non destructif
de 8.5-A reste l'unique implementation de reconciliation. Aucun champ de suivi
de porte n'est reecrit par l'interface.

## Preuves executees

- `npx tsc -b --pretty false`, `npm run lint` et `npm run test:run` : passent, avec 41 tests dans 13 fichiers.
- `npm run test:e2e` : 4 tests passent. Le parcours mobile couvre etage, deux taps, action de masse, ajout manuel non destructif, PMTiles et pixels. Un test distinct prouve la largeur contrainte du dialogue desktop.
- `npm run test:emulator` : 36 tests dans 6 fichiers passent. Le test structurel utilise son propre projet emule afin que les nettoyages d'autres fichiers ne puissent pas introduire une course artificielle.
- `npm run test:e2e:emulator` : 2 tests passent avec deux sessions terrain, hors ligne, conflit de revision, reapplique et purge deconnexion.
- `npm run verify:build` : passe ; MapLibre reste differe. Le moteur de carte conserve son avertissement de chunk de 1,08 Mo minifie, deja connu et hors du bundle initial.

## Limites assumees

- Une action de masse est une suite de passages individuels, pas une transaction multi-portes. Si une porte est refusee, les precedentes restent des passages valides et le message indique le nombre effectivement applique.
- L'edition structurelle utilise le depot de demonstration dans le parcours actuel. La passerelle Firestore structurelle existe et est testee, mais son branchement a la carte reelle reste a planifier avec les futurs depots de lecture, sans activer une synchronisation de structure hors ligne.

## Verdict

**GO pour la revue 8.5.** La vue n'introduit pas de nouvelle ecriture de
statut: elle reutilise les invariants, l'outbox, les UUID et les conflits deja
prouves. La revue devra examiner les actions de masse partielles, la resolution
d'ambiguite et les limites de l'edition structurelle avant toute ouverture de
l'etape 9.
