# Athar

Athar est une PWA privee de coordination du porte-a-porte, pensee d'abord pour
Toulouse puis pour une montee en charge geographique progressive.

## Etat du projet

- Etape 11 terminee : le parcours terrain authentifie est hydrate depuis les
  depots Firestore pagines et reconstruit l'outbox de l'UID courant.
- Revue de l'etape 11 terminee : **GO pour le lot de mise en service privee**.
  La preuve Chrome Android en mode avion conserve le shell, le fond PMTiles,
  la porte et le meme UUID jusqu'a la reprise. Aucun deploiement ni ecriture
  dans `athar-dev31` n'a ete effectue.
- Cadrage de mise en service termine : **GO uniquement pour la preparation
  locale et l'inventaire cloud en lecture seule**. Toute mutation Auth,
  Firestore, Functions ou Hosting reste soumise a une autorisation distincte.
- Phase A de mise en service terminee : racine, Functions et outillage sont
  maintenant alignes sur Node 22.23.2 ; lint, tests, emulateurs, PWA et build
  sont verts sous cette version. Le projet cloud n'a subi aucune mutation.
- `createMember` est la seule Function candidate ; la sonde locale utilise son
  refus anonyme et `emulatorHealth` n'est plus exportee. L'inventaire cloud
  constate que l'API Functions refuse aujourd'hui la lecture au compte CLI :
  elle ne peut donc pas etre deployee avant une decision explicite au sas B.
- Etape 12 locale : l'inscription identifiant/mot de passe cree un membre actif
  par `registerMember`, et `claimInitialAdmin` consume un code unique cote
  serveur. Aucune ecriture cliente ne peut creer, promouvoir ou lire l'etat de
  bootstrap. Aucun deploiement ni mutation de `athar-dev31` n'a ete realise.
- Cette inscription volontairement ouverte est le principal risque residuel
  avant ouverture publique : sans App Check, CAPTCHA, verification d'email ou
  invitation, elle permet l'abus de creation de comptes et l'acces aux donnees
  de tout membre actif. La decision produit est conservee, pas attenuee dans le
  code.
- `zoneStats` reste une projection reparable : une projection absente ou
  malformee n'empeche plus la consultation des batiments valides de la zone.
- La fermeture Auth stricte reste une dette acceptee pour usage prive. Le
  cadrage demande d'utiliser le controle Firebase officiel s'il est disponible,
  puis de re-prouver le refus de creation et suppression libre-service.
- L'interface visible contient le login, les etats d'acces, la carte
  applicative, le parcours terrain avec synchronisation de passage et le
  pilotage desktop simple. Les statistiques avancees ne sont pas construites.

## Documents de reference

- [Architecture V0 (obsolete)](docs/architecture-v0-obsolete.md)
- [Brief d'implementation Athar](docs/athar/00-BRIEF.md)
- [Feuille de route et modeles Codex](docs/feuille-de-route.md)
- [Etat de passation](docs/etat-projet.md)
- [Resultats de l'etape 2](docs/resultats-etape-2.md)
- [Revue d'architecture de l'etape 2](docs/revue-architecture-etape-2.md)
- [Resultats de l'etape 2B-A](docs/resultats-2b-a.md)
- [Resultats de l'etape 2B-B](docs/resultats-2b-b.md)
- [Resultats de l'etape 2B-C](docs/resultats-2b-c.md)
- [Resultats Auth reel Firebase](docs/resultats-auth-reel.md)
- [Revue Sol du mini-lot 2B](docs/revue-mini-lot-2b.md)
- [Revue d'architecture de l'etape 7](docs/revue-architecture-etape-7.md)
- [Resultats de l'etape 8](docs/resultats-etape-8.md)
- [Revue d'architecture de l'etape 8](docs/revue-architecture-etape-8.md)
- [Resultats de l'etape 8.5-A](docs/resultats-etape-8-5-a.md)
- [Resultats de l'etape 8.5-B](docs/resultats-etape-8-5-b.md)
- [Revue d'architecture du mini-lot 8.5](docs/revue-architecture-etape-8-5.md)
- [Resultats de l'etape 9](docs/resultats-etape-9.md)
- [Revue d'architecture de l'etape 9](docs/revue-architecture-etape-9.md)
- [Resultats de l'etape 10](docs/resultats-etape-10.md)
- [Revue d'architecture de l'etape 10](docs/revue-architecture-etape-10.md)
- [Cadrage de l'etape 11](docs/cadrage-etape-11.md)
- [Resultats de l'etape 11](docs/resultats-etape-11.md)
- [Revue d'architecture de l'etape 11](docs/revue-architecture-etape-11.md)
- [Cadrage du lot de mise en service privee](docs/cadrage-mise-en-service-privee.md)
- [Resultats de la phase A de mise en service](docs/resultats-phase-a-mise-en-service.md)
- [Resultats de l'etape 12](docs/resultats-etape-12.md)

## Acces local fonctionnel

Depuis la racine du projet, une seule commande demarre Auth, Firestore,
Functions, injecte uniquement la fixture `pilote-minimal`, puis lance
l'application :

```powershell
npm run dev:local
```

Ouvrir ensuite <http://127.0.0.1:5174/> et utiliser :

- identifiant : `terrain.b`
- mot de passe : `Temporary-password-123`

Pour verifier le pilotage desktop avec les emulateurs locaux :

- identifiant administrateur local : `pilot.admin`
- mot de passe : `Temporary-password-123`
- route : <http://127.0.0.1:5174/admin>

Le compte est local et recree a chaque demarrage des emulateurs. Il ne
correspond pas aux utilisateurs du projet Firebase cloud `athar-dev31`.
