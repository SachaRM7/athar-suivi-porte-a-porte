# Revue d'architecture de l'etape 7

Date : 2 aout 2026  
Perimetre : parcours terrain mobile local, outbox et compatibilite avec la future synchronisation

## Verdict

**GO pour l'etape 8.** Le parcours local conserve une intention durable avant
le lot local porte + passage, respecte l'auteur et le statut actifs, et laisse
les regles Firestore imposer le lot atomique serveur. Aucun flux de
synchronisation bout en bout n'a ete active pendant cette revue.

## Faux positifs trouves et corriges

1. `IndexedDbOutbox.add` utilisait `put` : un UUID reutilise pouvait remplacer
   silencieusement une intention et sa revision. L'ajout utilise maintenant
   `add` et refuse une cle deja presente.
2. Deux intentions d'une meme porte avec le meme horodatage pouvaient etre
   relues dans l'ordre lexical des UUID. L'outbox ordonne maintenant leur chaine
   par `expectedRevision`, et `SyncLab` choisit explicitement la revision
   maximale pour construire l'intention suivante.
3. L'adaptateur Firestore traitait toute revision serveur differente comme un
   conflit. Seule une revision serveur strictement superieure est maintenant un
   conflit concurrent ; une revision inferieure reste un rejet de securite.
4. Un horodatage ou un identifiant manifestement invalide pouvait echouer avant
   la classification. Les intentions sont controlees avant la construction du
   lot et les statuts absents ou inactifs sont classes `invalid-intent` apres un
   refus des regles.
5. Deux appels de depot successifs etaient presentes comme un lot local. Le
   contrat expose maintenant une seule operation `commitVisitAndDoor`, dont
   l'implementation memoire valide puis applique ensemble le passage et la
   projection de porte.

## Garanties revalidees

- La partition IndexedDB par UID survit a une nouvelle instance et interdit a
  un autre UID de lire ou d'ajouter l'intention.
- Une commande conserve UUID, auteur, note et revision de depart ; un UUID ne
  peut plus etre ecrase.
- Apres conflit ou rejet, les intentions suivantes de la porte restent
  bloquees. Le parcours de l'etape 7 est plus conservateur et refuse une seconde
  saisie locale tant que la premiere est en attente.
- L'auteur actif et le statut actif sont controles localement, puis a nouveau
  par les regles Firestore. Une porte ne change cote serveur qu'avec son passage
  associe dans le meme batch et une revision `N + 1`.
- Les notes sont normalisees, bornees a 280 caracteres et filtrees contre les
  controles non surs. L'interface rappelle de ne pas saisir de donnee sensible.
- Le paquet PMTiles Toulouse et le shell PWA restent rendus hors ligne ; les
  requetes viewport et les budgets cartographiques restent couverts.

## Validations

- `npm run lint` : passe.
- `npm run test:run` : 28 tests dans 11 fichiers passent.
- `npm run test:emulator` : 24 tests dans 5 fichiers passent.
- `npm run verify:build` : passe ; MapLibre reste charge a la demande.
- `npm run test:e2e` : 3 parcours passent, dont le canvas PMTiles hors ligne
  avec 272 entites rendues et le passage terrain local.

## Limites acceptees pour le GO

- L'outbox et le lot memoire ne partagent pas une transaction de stockage :
  l'intention est ecrite d'abord. Si le depot local echoue, elle reste donc
  recuperable et devra etre rapprochee par l'etape de synchronisation.
- La route applicative utilise encore les depots de demonstration. L'adaptateur
  Firestore n'est pas branche au parcours terrain.
- La resolution visuelle des conflits, les indicateurs complets de pending
  writes Firestore et la purge du cache a la deconnexion appartiennent a
  l'etape de synchronisation et devront etre livres avant beta terrain.
- La fermeture Auth libre-service et le test Android physique restent les
  dettes privees deja acceptees ; elles redeviennent bloquantes avant ouverture
  elargie ou beta terrain.

