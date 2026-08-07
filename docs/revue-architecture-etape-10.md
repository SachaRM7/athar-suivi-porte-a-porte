# Revue d'architecture de l'etape 10

Date : 4 aout 2026  
Perimetre : curseurs, pagination, budgets de lecture, geohash, annulation,
index Firestore, mesures de charge et regressions existantes.

## Verdict

**GO pour l'etape 11.** La revue a trouve un defaut reel de frontiere entre
sentinelle et faux positif viewport. Il est corrige et couvert contre
regression. Les autres ecarts de preuve ont ete fermes sans elargir le produit.

## Echecs caches trouves et corriges

1. **Sentinelle viewport rendue deux fois.** La requete lit `pageSize + 1` pour
   detecter une page suivante. Si un faux positif apparaissait parmi les
   `pageSize` premiers documents, la sentinelle pouvait entrer dans les
   resultats visibles puis etre relue a la page suivante. Le depot ne filtre et
   ne rend maintenant que les documents effectivement consommes ; la
   sentinelle reste exclusivement un indicateur de continuation.
2. **Curseurs non lies a leur requete.** Un curseur de zone pouvait etre
   presente a une autre zone, et un curseur viewport a une nouvelle emprise.
   Les curseurs sont maintenant versionnes et lies a leur collection et a leur
   scope exact : zone, batiment, porte ou bbox. Tout reutilisation hors scope
   echoue avant lecture.
3. **Curseur memoire inconnu.** Le depot de demonstration revenait a la
   premiere page lorsque l'ID du curseur n'existait pas. Il refuse maintenant
   explicitement ce curseur, comme le depot Firestore.
4. **Taille de reponse absente.** `ReadMetrics.responseBytes` mesure maintenant
   la taille UTF-8 du JSON domaine retourne par page. Il s'agit d'une mesure de
   payload decode reproductible, pas d'une estimation de facturation ou du
   protocole Firestore sur le fil.
5. **Jeu de charge incoherent.** Les 150 passages de la porte cible n'etaient
   pas refletes dans sa projection. La porte porte maintenant la revision 150
   et `lastVisitId = load-visit-149`. Un candidat geohash hors bbox est aussi
   injecte pour prouver le filtrage exact.

## Resultats mesures apres correction

Mesures Firestore Emulator, poste local, 4 aout 2026 :

| Parcours | Pages/plages | Documents retournes par Firestore | Resultats | Taille JSON | Doublons | Faux positifs |
|---|---:|---:|---:|---:|---:|---:|
| 300 batiments d'une zone | 6 pages | 305 | 300 | 66 730 o | 0 | 0 |
| 180 portes d'un batiment | 4 pages | 183 | 180 | 52 348 o | 0 | 0 |
| 150 passages d'une porte | 3 pages | 152 | 150 | 36 345 o | 0 | 0 |
| Viewport batiments | 23 | 303 | 299 | 66 543 o | 0 | 1 |
| Viewport portes | 26 | 485 | 478 | 141 137 o | 0 | 1 |

`documentsRead` compte les documents effectivement retournes par l'emulateur,
y compris les sentinelles. Ce compteur est utile pour comparer les requetes,
mais ne pretend pas reproduire la facture cloud : minimums de facturation,
lectures d'index et octets du protocole ne sont pas exposes par cette preuve.

La preuve geohash en memoire sur 10 000 portes conserve 20 plages, 812
candidats uniques, 504 correspondances et 308 faux positifs. Les plages sont
fusionnees avant requete ; le test Firestore prouve en plus que la pagination
n'introduit aucun doublon autour d'un faux positif.

## Index et bornes

- Aucun index composite n'est requis par les requetes retenues dans Firestore
  Emulator. Aucun fichier d'index vide ou speculatif n'est donc ajoute.
- Les pages acceptent de 1 a 100 elements. `pageSize + 1` borne la sentinelle a
  une lecture supplementaire par requete.
- Les lectures restent limitees a une zone, un batiment, une porte ou une seule
  plage geohash par page. Aucun contrat n'expose une collection globale de
  portes ou de passages.
- `zoneStats` reste un document unitaire reparable. Son absence ou son rejet ne
  bloque pas la page de batiments et il ne devient pas source de verite.

## Annulation et limites residuelles

- Le SDK Web Firestore ne recoit pas directement l'`AbortSignal`. Une requete
  deja emise peut finir sur le reseau, mais son resultat est ignore apres
  changement d'emprise. Les pages suivantes ne sont pas lancees et le cout
  reste borne par la requete en cours.
- Une plage ne contenant que des faux positifs peut produire une page vide avec
  un curseur suivant. Ce comportement est exact ; l'ergonomie pourra precharger
  une page supplementaire sans modifier le contrat.
- La carte terrain utilise encore le depot de demonstration. Le branchement
  lecture Firestore temps reel n'a pas ete ajoute pendant cette revue.
- L'absence d'index composite est prouvee contre l'emulateur, pas contre un
  projet cloud deploye. Aucun deploiement n'a ete effectue.

## Validations rejouees

- `npm run lint` : succes.
- `npm run test:run` : 14 fichiers, 47 tests.
- `npm run build` : succes, MapLibre reste differe.
- `npm run test:emulator` : 7 fichiers, 47 tests.
- preuve de charge Firestore ciblee : 4 tests, incluant scopes de curseur,
  budget maximal, sentinelle, faux positif et tailles.
- `npm run test:e2e` : 4 parcours, dont PMTiles offline et rendu pixels.
- `npm run test:e2e:emulator` : 3 parcours, dont deux clients en conflit,
  reprise reseau, purge locale et garde/pagination administrateur.

L'avertissement local Node 24 / Functions Node 22 reste une dette d'outillage
connue et n'a pas masque d'echec fonctionnel.
