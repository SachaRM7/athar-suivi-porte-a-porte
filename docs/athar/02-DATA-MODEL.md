# Athar — modèle de données

> **Schéma actif :** `workspaces/{workspaceId}/{buildings,doors,visits,…}`.
> Le [contrat canonique et le plan du lot B](06-VERITE-DONNEES.md) font référence pour
> l'application actuelle. Les collections racines et dérivations françaises décrites
> ci-dessous constituent la spécification historique WP2 ; leurs accès clients sont
> fermés depuis le lot A. Elles ne doivent pas servir à implémenter les projections du workspace.

## Décision structurante

Un bâtiment détecté sur la carte **n'a aucun document en base** tant que personne n'y est allé.
La couche cartographique (PMTiles, cf. `03-CARTO.md`) est la référence en lecture seule ; Firestore ne contient
que ce qui a été fait. Le gris « pas encore fait » est l'absence d'enregistrement, pas une donnée stockée.

Sans cette règle, créer une zone de quartier écrirait des milliers de documents pour des bâtiments où personne
n'ira jamais. Avec elle, le coût suit l'activité réelle.

## Clé d'ancrage

L'identifiant d'un bâtiment est son **ID-RNB** (Référentiel National des Bâtiments), pas des coordonnées.
Il est stable dans le temps, ce qui garantit que les passages restent accrochés au bon immeuble même si la
géométrie est corrigée en amont, et que deux frères qui pointent le même bâtiment tombent sur le même document.

Pour les bâtiments absents du RNB (construction récente, erreur de référentiel), on génère un id local
préfixé `local_` et on stocke le point saisi manuellement.

## Collections

```
zones/{zoneId}
  nom, couleur, polygon: { type: 'Polygon', vertices: GeoPoint[] }, createdBy, createdAt
  stats: { batimentsDetectes, batimentsTouches, portesFaites, portesTotal, majAt }

buildings/{rnbId}            # créé au premier passage seulement
  zoneId, rnbId, adresse, complement            # « Bâtiment C »
  point: GeoPoint                                # centroïde, pour tri par distance
  source: 'rnb' | 'local'
  niveaux: number                                # RDC compris
  createdBy, createdAt
  # champs dérivés, recalculés par Cloud Function :
  derived: { statut, dernierPassageAt, portesTotal, portesFaites, aConfierAuxSoeurs }

buildings/{rnbId}/doors/{doorId}
  etage: number                                  # 0 = RDC
  numero: string                                 # « 12 », « 101 »
  ordre: number                                  # position dans l'étage
  foyer: 'femme'|'homme'|'couple'|'famille'|null
  aConfierAuxSoeurs: boolean
  derived: { statut, dernierPassageAt }

buildings/{rnbId}/doors/{doorId}/passages/{passageId}   # append-only
  statut: 'open'|'away'|'linked'|'dnd'|'locked'
  note: string|null
  auteurUid, auteurNom
  at: Timestamp
```

Firestore interdit les tableaux imbriqués d'un `coordinates` GeoJSON brut. `polygon.vertices` contient donc
l'anneau extérieur fermé sous forme de `GeoPoint[]`. Le codec cartographique doit reconstruire le GeoJSON à la lecture.
Les trous et multipolygones ne sont pas nécessaires aux zones WP0 → WP8 ; leur ajout demandera un encodage dédié.

## Règles de dérivation

- `door.derived.statut` = statut du passage le plus récent. Jamais écrit à la main.
- `door.derived.dernierPassageAt` = `at` du passage le plus récent.
- `building.derived.statut` = statut dominant selon la priorité `linked > open > away > locked > dnd`,
  et `todo` si aucune porte n'a de passage.
- `building.derived.aConfierAuxSoeurs` = vrai si **au moins une** porte porte le marqueur.
- Recalcul par Cloud Function `onCreate` sur `passages`, et `onWrite` sur `doors` pour le marqueur.

## Ancienneté

C'est l'axe de lecture principal : puisque toute porte reste dans le cycle de suivi sauf `linked`
et `dnd`, la question utile n'est pas « quoi » mais « depuis quand ».

### Cycle de suivi (lot A2)

Trois notions distinctes, dérivées du statut courant sans champ stocké
(`src/domain/workspace/follow-up.ts`, seule source de vérité) :

| Notion | Règle |
|---|---|
| Résultat du dernier passage | `currentStatusId`, fait historique, jamais réécrit |
| Éligibilité à une suggestion | `unvisited` → première visite ; `contacted`, `retry`, `locked` → revisite |
| Exclusion du suivi ordinaire | `linked` (lien établi) et `do-not-return` (« Ne pas déranger ») |

- « Pas vu > 3 mois » et le tri par ancienneté ne regardent que les portes encore dans le cycle :
  un immeuble dont toutes les portes sont exclues n'est jamais proposé ; un immeuble mixte reste
  proposé par ses portes éligibles. Le statut dominant n'intervient pas.
- « Absent » et « Accès bloqué » ne deviennent jamais définitifs, et « Ne pas déranger » n'est
  jamais converti en « Absent ».
- « Tout marquer absent » n'écrit que sur les portes jamais visitées ; une porte exclue n'est
  jamais touchée par une action groupée (refus aussi au niveau du modèle).
- Corriger un « Ne pas déranger » saisi par erreur exige une confirmation explicite et ajoute un
  passage : l'ancien reste dans l'historique, avec son auteur et sa date.

Affichage : `aujourd'hui` · `hier` · `il y a N j` (< 30) · `il y a N mois` · `jamais vu`.
Seuil d'alerte visuelle : 90 jours.

## Index Firestore requis

- `buildings` : `zoneId` ASC + `derived.dernierPassageAt` ASC
- `buildings` : `zoneId` ASC + `derived.statut` ASC
- `buildings` : `zoneId` ASC + `derived.aConfierAuxSoeurs` ASC
- collection group `passages` : `auteurUid` ASC + `at` DESC (barre de trace de la sortie du jour)

## Données sensibles

`foyer` et `aConfierAuxSoeurs` sont plus sensibles que le reste : noter « femme seule » à une adresse précise
dans une base partagée engage une responsabilité. Traitement :

- Ces deux champs ne sont **pas exposés dans les listes de bâtiments** ni dans les exports.
- Sur la carte, seul l'anneau rose au niveau du bâtiment est visible ; la composition du foyer n'est lisible
  qu'en ouvrant la fiche de la porte concernée.
- Aucun export CSV ne les inclut.

## Règles de sécurité — esquisse

```
match /zones/{z} {
  allow read: if signedIn() && membreDeZone(z);
  allow write: if signedIn() && estCoordinateur();
}
match /buildings/{b} {
  allow read: if signedIn() && membreDeZone(resource.data.zoneId);
  allow create, update: if signedIn() && membreDeZone(request.resource.data.zoneId);
  allow delete: if estCoordinateur();

  match /doors/{d} {
    allow read, create, update: if signedIn() && membreDeZone(zoneDuBatiment(b));
    allow delete: if estCoordinateur();

    match /passages/{p} {
      allow read: if signedIn() && membreDeZone(zoneDuBatiment(b));
      allow create: if signedIn() && request.resource.data.auteurUid == request.auth.uid;
      allow update, delete: if false;   // append-only, sans exception
    }
  }
}
```

`passages` est immuable par conception : c'est ce qui rend l'historique digne de confiance.
Une correction se fait en ajoutant un passage, pas en modifiant le précédent.

## Suppression d'une porte

Supprimer une porte qui a des passages efface le travail de frères. L'interface demande confirmation
explicite dans ce cas (cf. `04-SCREENS.md`), et l'opération est réservée au coordinateur.
Une porte sans passage se supprime sans friction.
