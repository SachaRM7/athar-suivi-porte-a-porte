# Audit UI / UX — Athar

Date : 2026-10-21 · Base : `main` à `0fc2119` (après lot E).
Périmètre : tous les écrans livrés (connexion, carte terrain desktop/mobile, fiche bâtiment, fiche porte,
dialogue de structure, préparation hors ligne, sorties, pilotage, membres, réglages), comparés à
`00-BRIEF.md`, `01-DESIGN-SYSTEM.md` et `04-SCREENS.md`.

Ce document liste et priorise. Les cinq points P0 (§1) ont été corrigés ensuite, voir
« Suivi » en fin de document. Chaque entrée donne le constat, l'endroit dans
le code, l'effet sur l'usage et une piste.

Gravité :
- **P0** — bloque un parcours ou expose à une perte de travail ;
- **P1** — ralentit ou trompe l'utilisateur sur le terrain ;
- **P2** — incohérence visible, coût de compréhension ;
- **P3** — finition, dette.

---

## 1. Parcours bloqués ou dangereux (P0)

### 1.1 Impossible de saisir l'adresse d'un bâtiment
- Un bâtiment ouvert depuis une emprise s'appelle `Bâtiment <ID-RNB>` ; un bâtiment posé à la main
  s'appelle `Bâtiment posé manuellement` (`WorkspaceMap.tsx:452`, `:558`).
- Aucun champ ne permet ensuite de saisir l'adresse : la fiche bâtiment n'en propose pas, et
  `BuildingCreationSheet.tsx` (qui en avait un) n'est plus importé nulle part.
- Effet : la liste, la recherche « Adresse d'un bâtiment suivi » et le dialogue « Marquer une porte »
  affichent des identifiants illisibles ou dix fois la même étiquette. Choisir « le bâtiment devant
  lequel tu te trouves » devient impossible. `QUESTIONS.md` (WP7) prévoyait pourtant que
  « dès que l'adresse est saisie dans la fiche, elle remplace l'étiquette ».
- Piste : champ « Adresse » éditable dans l'en-tête de la fiche bâtiment, proposé dès la
  description de la structure (une ligne de plus dans le dialogue de structure).

### 1.2 « Structure » sur un bâtiment déjà décrit remplace toutes les portes sans prévenir
- Le dialogue de structure ouvert sur un bâtiment décrit propose toujours « Créer N portes »
  (`BuildingVisitSheet.tsx`, rendu du `structure-panel`). Toutes les cibles portent un `newDoorId` :
  `buildBuildingStructureDiff` archive donc **toutes** les portes existantes et en crée de nouvelles
  (`building-structure.ts:116`, `:169`).
- Aucun avertissement, pour tout membre (`canEditStructure` vaut toujours `true`). Le libellé dit
  « Créer », l'effet est « archiver 18 portes et leur suivi, créer 16 portes vierges ».
- Effet : un frère qui veut « vérifier la structure » efface d'un geste la coupe et les couleurs
  du bâtiment (l'historique reste en base, mais n'est plus rattaché à une porte visible).
- Piste : sur un bâtiment décrit, ouvrir le mode « Modifier » plutôt que le dialogue de création ;
  à défaut, libeller le bouton par son effet réel (« Remplacer 18 portes par 16 ») et confirmer.

### 1.3 Les membres ne peuvent pas ajouter un bâtiment absent du référentiel
- « Ajouter un bâtiment » n'existe que dans la barre d'Édition (`WorkspaceMap.tsx:973`), or la
  bascule Terrain/Édition n'est rendue que pour `canEditZones` (admin). `canCreateBuildings` est
  pourtant passé à `true` pour tous (`MapPage.tsx`).
- `04-SCREENS.md` §2 prévoit un bouton pointillé « Ajouter un bâtiment » en fin de liste, en mode
  Terrain. Il n'existe pas.
- Piste : remettre ce bouton en fin de liste (mode Terrain) ; la pose d'un bâtiment n'est pas une
  action de zone.

### 1.4 La note de passage arrive trop tard dans la fiche porte
- Ordre de la fiche : résultats → foyer → sœurs → historique → « + note courte ».
  Toucher un résultat enregistre **et ferme** la fiche (`applyStatus` → `setOpenPaletteDoorId(null)`).
- Effet : pour qu'une note accompagne le passage, il faut descendre sous l'historique, déplier la
  note, l'écrire, remonter, puis toucher le résultat. En pratique la note est oubliée ou saisie
  après coup, donc perdue (elle est remise à zéro à chaque ouverture).
- Piste : note optionnelle juste sous la grille de résultats, ou bien enregistrement du résultat
  sans fermer la fiche, avec un bouton « Ajouter une note à ce passage » dans le message de
  confirmation.

### 1.5 Les retours d'action sont invisibles sur la plupart des téléphones
- Tous les messages de la carte (`setMessage`) passent par `.terrain-status`, masqué quand
  `max-height: 700px` sur mobile (`terrain-shell.css:950`). Avec les barres de Safari ou Chrome,
  la plupart des téléphones courants ont une hauteur utile inférieure à 700 px.
- Messages ainsi perdus : précision GPS ou refus de localisation, « Touche l'emprise du bâtiment
  sur la carte… » (après « Choisir une emprise »), refus de suppression d'une zone, pose annulée,
  « Bâtiment indisponible », « Emprises indisponibles ».
- Piste : un seul canal de retour (toast au-dessus de la sheet, éphémère), jamais masqué ;
  « Choisir une emprise » doit afficher le bandeau `.hint` comme la pose manuelle.

---

## 2. Compréhension : le vocabulaire technique déborde sur le terrain (P1)

L'utilisateur type est « debout dans la rue, téléphone dans une main, en plein soleil ». Le panneau
terrain lui présente aujourd'hui des notions d'implémentation.

| Où | Texte affiché | Ce que l'utilisateur doit comprendre |
|---|---|---|
| Chip de zone | « Relevé : 12/40 portes décrites avec passage » | « 12 portes faites sur 40 » |
| Ligne de bâtiment | « 3/8 portes chargées avec passage » | « 3/8 » |
| Sous la trace | « Derniers passages connus, tous auteurs · peut inclure des passages en attente sur cet appareil » | rien, c'est une précaution d'ingénieur |
| Bas de liste | « Relevé du … Les nouveaux passages peuvent ne pas encore être comptés. Couverture des bâtiments indisponible : catalogue complet requis. Relevé serveur · historique vérifié. Les passages en attente sur cet appareil sont exclus. » | rien |
| Compteur | « 25 bâtiment(s) sur cette page · 12 chargés à l'écran » | « 25 bâtiments » |
| Pied | « Portes décrites · relevé » | « Couverture de la zone » (libellé prévu par `04-SCREENS.md`) |
| Pagination | « Recherche, filtres, tri et activité sur cette page de bâtiments. » | qu'il faut changer de page pour chercher |
| Carte | « Fond Toulouse local prêt. » | rien |
| Zone enregistrée | « 3 batiment(s) rattache(s) par point-dans-polygone » | « 3 bâtiments dans la zone » |
| Pilotage | « Projection de compteurs invalide », « ancien relevé non reconstruit », « Batiments lus / documents lus », « Lecture bornee a la zone » | — |
| Structure | « Plan manuel (etage \| porte \| ID ou new:ID) », boutons « Conserver door-3f2a… » | outil de développeur exposé |

Pistes :
- Une seule phrase de fraîcheur, courte, en info-bulle ou derrière un « ? » : « Compté il y a 4 min ».
- Garder les mentions d'intégrité (cache, projection, catalogue) pour le pilotage, et seulement en
  cas d'anomalie.
- Retirer « Ajustement manuel » et la résolution d'ambiguïtés par ID de l'interface terrain, ou
  les réserver au coordinateur derrière un libellé clair.

### 2.1 Trois mesures de progression qui ne disent pas la même chose
- Chip de zone et barre de pied : portes **décrites** ayant un passage (`zoneStats`).
- Liste et compteurs : bâtiments de la **page** chargée.
- Ligne « couverture » : bâtiments du **catalogue** (souvent « indisponible »).
- Écran de connexion et pilotage : encore une autre combinaison.
- Effet : un même zoom affiche 30 % dans la chip, une barre presque vide, et « couverture
  indisponible ». Personne ne sait laquelle croire.
- Piste : une seule mesure grand public (« portes faites / portes connues »), les autres dans le
  pilotage.

### 2.2 « Terminé » ne veut pas dire terminé
- Un étage est « terminé » dès que chaque porte a **un** passage, quel qu'il soit
  (`hasRecordedVisit`). Trois « Absent » = étage terminé.
- Lors d'une seconde tournée, tous les étages restent « terminé » et « tout marquer absent »
  n'apparaît plus jamais (`doorsForGroupedAbsence` ne retient que les premières visites).
- Le cas le plus fréquent du porte-à-porte (`04-SCREENS.md` §3) n'est donc couvert qu'une fois
  par bâtiment, à vie.
- Piste : distinguer « fait » (contact, attaché, ne pas déranger) de « à revoir » (absent, bloqué)
  dans le compteur d'étage, et proposer « tout marquer absent » sur les portes à revoir non
  passées aujourd'hui.

### 2.3 « Tout marquer absent » ne marque pas tout
- Le bouton ne touche que les portes jamais visitées, sans le dire, sans compter, sans confirmation.
- Piste : « Marquer 3 portes absent » (nombre exact, comme « Créer 16 portes ») ; prévoir un
  « Annuler » de quelques secondes avant écriture, puisque `passages` est append-only.

### 2.4 « Activité du jour » contre « Sortie du jour »
- La spec titre le panneau « Sortie du jour » + durée, avec la trace des portes marquées pendant la
  sortie. Le code affiche « Activité du jour · zone », mélange les passages de tous les auteurs, et
  n'affiche jamais la durée (`terrainSession().durationLabel` est calculé puis ignoré).
- Depuis le lot E, une « sortie » est aussi une entité (démarrer / rejoindre / terminer) qui n'a
  aucun lien visible avec cette trace.
- Piste : relier la trace à la sortie active du membre quand elle existe ; sinon la titrer
  « Aujourd'hui dans la zone ».

### 2.5 Libellés de la fiche porte
- « Dernier passage jamais vu » / « Dernier passage date inconnue » : concaténation fautive
  (`BuildingVisitSheet.tsx`, `door-detail-subline`). Écrire « Jamais visitée » / « Dernier passage
  il y a 3 mois ».
- « Attaché à l'effort — plus à revisiter » modifie le vocabulaire figé ; « Ne pas déranger », qui
  sort aussi du cycle, ne porte pas la même mention. Mettre l'explication en sous-ligne des deux.
- La grille de résultats n'indique pas le statut actuel de la porte (pas d'`aria-pressed`, pas de
  marque visuelle).
- L'historique affiche la note **ou** le statut, jamais les deux : un passage noté n'a plus de
  libellé, seulement une pastille de couleur (information portée par la seule couleur).

---

## 3. Incohérences d'interface (P1–P2)

### 3.1 La couleur des pastilles de la liste ne porte pas le statut (P1)
- `WorkspaceMap.tsx:929` : la pastille d'un bâtiment est `todo` si aucun passage, `away` (ambre)
  s'il est à revisiter, `linked` (bleu) s'il est sorti du suivi, `open` (vert) sinon.
- Un bâtiment de portes « Ne pas déranger » s'affiche donc en **bleu Attaché**, un bâtiment
  d'« Absent » récents en **vert Contact**. La carte, elle, colore l'emprise par statut dominant :
  le même bâtiment n'a pas la même couleur sur la carte et dans la liste.
- Viole le principe 5. Piste : colorer avec le statut dominant (comme la carte) et porter
  l'ancienneté par la colonne de droite, déjà prévue pour ça.

### 3.2 Couleur de zone libre et verte par défaut (P2)
- `DEFAULT_ZONE_COLOR = '#16835F'` est quasi identique à `--st-open` (#1F7A5A) ; le sélecteur
  `type="color"` accepte n'importe quelle couleur, y compris celles des statuts.
- Piste : palette fermée de couleurs de zone, hors teintes de statut.

### 3.3 Le tutoiement et le vouvoiement coexistent, parfois sur le même écran (P2)
- Pose manuelle : le bandeau dit « Touche la carte à l'emplacement exact du bâtiment » pendant que
  la ligne d'état dit « Touchez la carte a l emplacement exact du batiment ».
- Vouvoiement aussi dans « Choisissez une zone avant de poser un bâtiment », « Tracez le contour,
  puis renseignez… », « Ajustez le contour… ». Le reste de l'application tutoie.

### 3.4 Accents manquants et pluriels « (s) » (P2)
- Sans accents : `WorkspaceMap.tsx` (« Pose annulee. Rien n a ete cree. », « Zone enregistree »,
  « Edition de », « Aucun polygone valide a enregistrer », « mise a jour »),
  `InitialAdminSettings.tsx` (« Reglages », « Administration activee », « Code d activation »,
  bouton de fermeture « X »), `AdminDashboardPage.tsx` (« Se deconnecter », « Batiments lus »,
  « Precedents », « Terrain non assigne », « Lecture bornee a la zone », « donnees »),
  libellés ARIA (« Detail du batiment », « Configurer le batiment », « Premier numero »).
- Pluriels paresseux : « bâtiment(s) », « passage(s) », « changement(s) en attente »,
  « ajoutée(s) / ajustée(s) / archivée(s) ». Le code sait accorder ailleurs (`plural()`).

### 3.5 Deux libellés pour le même état de synchronisation (P2)
- Le panneau affiche « Synchronisé » (`FieldSyncNotice.tsx`), la fiche bâtiment « À jour »
  (`summarizeFieldSync`). Hors ligne sans attente : « Hors ligne » avec ◷, le même symbole que
  « en attente ».

### 3.6 Le même pictogramme fait deux choses (P1)
- Sur mobile, l'icône « ≡ » bascule Terrain/Édition pour un admin, mais agrandit la liste pour un
  membre (`WorkspaceMap.tsx:868`). Aucun indicateur visible du mode courant sur mobile (la bascule
  segmentée est masquée).
- Piste : icône et libellé distincts pour le mode ; badge « Édition » visible tant que le mode est
  actif.

### 3.7 Une corbeille, deux opérations (P2)
- L'icône corbeille de la fiche bâtiment vide d'abord la structure, puis, au second usage, retire le
  bâtiment (`resetStructure`). Le geste ne dit pas lequel des deux il fera.

### 3.8 Bouton de confirmation mal libellé (P1)
- `OutingsPage.tsx:114` : le dialogue « Quitter la sortie » propose « **Confirmer la fin** ». Un
  participant croit terminer la sortie de toute l'équipe.

### 3.9 Pilotage : deux contrôles pour la même chose (P2)
- Le sélecteur « Compteur à afficher » et la rangée de boutons de statut font la même action ; une
  note doit préciser que « le choix du compteur ne filtre pas les bâtiments ». Si un réglage a
  besoin d'une note pour dire ce qu'il ne fait pas, il est en trop.
- « Ouvrir la zone » sur chaque ligne de bâtiment ouvre la zone, pas le bâtiment.

---

## 4. Deux générations de design coexistent (P2)

`01-DESIGN-SYSTEM.md` écarte explicitement « le fond crème + serif à fort contraste ». Il reste
pourtant dans `src/styles.css` :

- `:root { background: #f4f1e8; font-family: Georgia… }` : fond crème et serif par défaut ;
- Sorties, Pilotage, Membres et la carte de déconnexion utilisent `.admin-shell`, `.admin-form`,
  `.primary-action` (`#143d36`), `.dashboard-*` : couleurs en dur, Georgia 18 px dans les champs,
  titres 36–44 px hors échelle ;
- la fiche bâtiment a deux jeux de règles (`styles.css:197` ancien, `:268` nouveau) qui se
  surchargent ; `door-row-label` est encore déclaré en Georgia ;
- `.trusted-device-control { accent-color: #17664f }` hors jetons.

Effet : en passant de la carte à « Sorties terrain », l'utilisateur change d'application. Les
écrans d'administration ne sont pas non plus pensés pour le téléphone, alors que « Démarrer ou
rejoindre une sortie » se fait sur le terrain.

Piste : lot dédié de mise en conformité des écrans secondaires (jetons, typo, primitives `Dialog`,
`Chip`, boutons `ds-button`), puis suppression des règles mortes.

---

## 5. Navigation et orientation (P1–P2)

- **Sorties et Pilotage sont cachés.** Avatar → « Réglages » → lien. Trois gestes et un nom
  trompeur (ce ne sont pas des réglages). Piste : les placer directement dans le menu du compte.
- **Le panneau envoie hors de la carte.** « Démarrer ou rejoindre une sortie » quitte la carte pour
  une page de bureau. Sur le terrain, démarrer une sortie devrait être une sheet.
- **Démarrer une sortie exige un nom.** Pré-remplir « Sortie du 21/10 · Carmes ».
- **Menu de zone vide pour un membre** : « Passe en mode Édition pour en dessiner une » — un membre
  n'a pas ce mode. Écrire « Demande à ton coordinateur de tracer une zone ».
- **Écrans sans issue** : « Accès réservé », « Configuration requise », « Vérification
  impossible » n'offrent ni « Retour à la carte » ni « Réessayer » (`ProtectedRoute.tsx`,
  `AccessState.tsx`).
- **Choix de zone à la connexion** marqué « Première ouverture » à chaque passage par `/login`.
- **FAB « Marquer une porte » désactivé sans explication** tant que la liste n'est pas prête ou
  qu'aucune zone n'est choisie.
- **« Marquer une porte » rouvre silencieusement le dernier bâtiment** de la zone. Si on a changé
  de rue, on atterrit dans la mauvaise fiche sans l'avoir demandé. Piste : le proposer en tête du
  dialogue plutôt que l'ouvrir d'office.

---

## 6. Écarts avec `04-SCREENS.md` (P2)

| Spec | Implémentation |
|---|---|
| Panneau : « Sortie du jour » + durée | « Activité du jour », pas de durée |
| Filtres : Tous · Pas encore fait · Pas vu > 3 mois · Sœurs · Bloqués | Trois filtres. « Bloqués » manque (utile pour revenir avec le code). « Sœurs » est en tension avec la règle « jamais dans une liste » d'`AGENTS.md` : à trancher dans `QUESTIONS.md`. |
| Pied : « Couverture de la zone » + barre segmentée par statut | « Portes décrites · relevé », barre unicolore |
| Sheet mobile : bouton pointillé « Ajouter un bâtiment » | absent (cf. 1.3) |
| Mode modification : « + Ajouter un étage au-dessus » en haut, barre collante + « Terminé » | présent, mais « Modifier » devient « Terminer » en haut et « Terminé » en bas : deux libellés pour le même geste |
| Légende : statuts puis marqueur | conforme, mais n'explique ni le pointillé « à vérifier » ni le gris clair « hors zone », que les messages d'alerte citent |
| Tri sur mobile | masqué (`.building-list-sort { display:none }`) |

---

## 7. Accessibilité et confort (P2–P3)

- La fiche porte ne signale pas le statut actuel aux lecteurs d'écran (pas d'`aria-pressed`).
- L'historique porte le statut par la seule couleur quand une note existe (cf. 2.5).
- « Appareil de confiance » est une case dans la fiche bâtiment qui **recharge la page** au clic
  (`window.location.reload()`), et existe aussi dans le dialogue hors ligne. Une seule entrée,
  dans le compte, avec un bouton explicite « Activer et recharger ».
- Bouton « Synchroniser » présent à la fois dans le panneau et dans la fiche bâtiment.
- Le repli de chargement des routes (`App.tsx`) est une `div` vide sans texte.
- Le placeholder de connexion `sacharbone` ressemble à un identifiant réel : préférer un exemple
  neutre (`prenom.nom`).
- La suppression d'une zone utilise le bouton `ds-button--brand` : rien ne la distingue d'une action
  ordinaire.

---

## 8. Dette sans effet direct (P3)

- `MemberHome.tsx` (sans accents, « Etape 5 ») et `BuildingCreationSheet.tsx` ne sont plus montés.
- Le message d'accueil de la fiche (« Choisis une porte pour enregistrer un passage. ») occupe en
  permanence une bande en bas de la fiche.
- L'œuf de Pâques « 10 appuis sur Athar V1.0 » (émulateurs seulement) affiche quand même le bouton
  de version en production, sans effet.

---

## Ordre de traitement proposé

1. **Débloquer le terrain** : adresse éditable (1.1), garde-fou de structure (1.2), « Ajouter un
   bâtiment » en mode Terrain (1.3), note avant le résultat (1.4), canal de retour visible (1.5).
2. **Rendre lisible** : pastilles de liste par statut (3.1), une seule mesure de progression (2.1),
   suppression du jargon du panneau (2), libellés de la fiche porte (2.5), « Confirmer la fin » (3.8).
3. **Revisites** : sémantique « terminé » / « tout marquer absent » sur une seconde tournée (2.2, 2.3).
4. **Uniformiser** : écrans secondaires sur les jetons (4), tutoiement et accents (3.3, 3.4),
   navigation du compte (5).
5. **Nettoyer** : écarts de spec restants (6), dette (8).

---

## Suivi

**2026-10-21 — P0 corrigés** (branche `audit-ux`) :

- 1.1 — L'adresse se saisit dans l'en-tête de la fiche. Tout membre la saisit avant la création du
  document (elle part avec lui) ; ensuite, le coordinateur seul, selon les règles actuelles
  (question ouverte dans `QUESTIONS.md`). Une étiquette de repli invite à la saisir.
- 1.2 — Le dialogue de structure conserve les portes déjà décrites au même étage sous le même numéro.
  Le bouton annonce l'effet réel (« Créer 16 portes », « Ajouter 2 portes », « Retirer 3 portes ») ;
  retirer des portes demande une confirmation qui les nomme, et retirer une porte visitée reste
  réservé au coordinateur.
- 1.3 — « + Ajouter un bâtiment absent de la carte » en fin de liste, en mode Terrain.
- 1.4 — « + note pour ce passage » est placé au-dessus des résultats.
- 1.5 — La ligne d'état n'est plus masquée sur les écrans courts et passe au-dessus des boutons
  flottants ; « Choisir une emprise sur la carte » affiche un bandeau de consigne avec « Annuler ».
  Les messages de la carte sont tutoyés et accentués ; « Fond Toulouse local prêt. » ne s'affiche plus.

**2026-10-21 — P1 traités** (branche `audit-ux`) :

- §2 / 2.1 — Une seule mesure grand public, « 3/6 portes visitées », dans la chip, la liste et le
  pied « Couverture de la zone », désormais segmenté par statut. Provenance, catalogue et
  précautions de cache quittent le panneau terrain (le pilotage les garde) ; il reste une phrase de
  fraîcheur. « Ajustement manuel » est réservé au coordinateur ; les ambiguïtés se tranchent sur
  le numéro, l'étage et le statut, plus sur un identifiant.
- 2.2 / 2.3 — Un étage d'« Absent » ou d'« Accès bloqué » affiche « N à revoir », plus « terminé ».
  « Marquer 2 portes absentes » annonce son effet et nomme les portes avant d'écrire. La règle
  « portes jamais visitées seulement » (`02-DATA-MODEL.md`) est conservée : question ouverte.
- 2.4 — « Aujourd'hui dans la zone » : la décision B5 interdit de présenter l'activité reconstituée
  comme une durée de sortie. Pas de durée affichée.
- 2.5 — Sous-ligne « Contact établi · dernier passage il y a 10 j » ou « Jamais visitée » ;
  résultat actuel signalé (`aria-pressed` et mention visible) ; « Attaché à l'effort » retrouve son
  libellé figé, « sort du suivi » en sous-ligne, comme pour « Ne pas déranger » ; l'historique
  affiche toujours le statut, puis la note.
- 3.1 — La pastille d'un bâtiment porte son statut dominant, comme son emprise, avec le libellé en
  toutes lettres.
- 3.6 — Mobile : crayon pour passer en Édition, coche pour revenir, liste pour le membre ; la barre
  d'édition affiche « Mode Édition ».
- 3.8 — « Quitter la sortie » / « Terminer la sortie » selon l'action.
- §5 — Sorties et Pilotage dans le menu du compte ; menu de zone vide adapté au membre ; écrans
  d'accès avec « Réessayer » ou « Retour à la carte » ; « Marquer une porte » explique pourquoi il ne
  peut pas agir au lieu d'être grisé. La réouverture du dernier bâtiment est conservée : c'est un
  critère d'acceptation du lot C (C1). Voir `QUESTIONS.md`.
