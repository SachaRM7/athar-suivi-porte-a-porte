# Resultats etape 12 — inscription et administrateur initial (local)

Statut : implementation locale, sans deploiement ni mutation cloud.

## Frontieres de confiance

- Le navigateur cree uniquement son utilisateur Firebase Auth avec l'adresse technique deterministe, puis appelle `registerMember` authentifiee.
- `registerMember` epingle `main`, exige des champs texte, refuse les champs superflus et les identites incoherentes, puis cree transactionnellement un profil actif `member` au schema canonique exact (`uid`, `username`, `displayName`, `workspaceId`, `role`, `active`, `createdAt`). Un retry du meme profil est idempotent uniquement si le document existant respecte exactement ce schema; un profil different, incomplet ou enrichi est refuse sans reparation silencieuse.
- Les clients ne peuvent pas creer, supprimer ou promouvoir `members`; ils ne peuvent ni lire ni ecrire `setup`.
- `claimInitialAdmin` compare SHA-256 avec `timingSafeEqual`, puis dans une seule transaction lit/consomme `admin-bootstrap`, cree `initial-admin` et promeut le membre. Le marqueur bloque toute autre UID.
- Le code de production est hors depot et hors Firestore en clair. Son exigence operationnelle minimale est 128 bits aleatoires. Les fixtures d emulateur generent seulement un code local ephemere et n ecrivent que son hash.

## Recuperation et risque

Un utilisateur Auth sans document membre est affiche comme profil a finaliser et peut reappeler `registerMember` sans recreer le compte. Si Firestore est promu mais que le claim Auth echoue, le meme UID peut reessayer la callable avec le meme code pour reparer le claim; le client rafraichit alors son ID token.

L inscription ouverte cree volontairement des membres actifs. C est le plus grand risque residuel avant ouverture publique : sans App Check, CAPTCHA, verification email ou invitation, elle ouvre l abus de creation de comptes et l acces aux donnees du workspace. Aucune de ces contre-mesures n a ete ajoutee.

## Verification locale (7 aout 2026)

- Sous `C:\Users\SachaRbone\AppData\Local\Athar\tools\node-v22.23.2-win-x64` : `npm run lint` passe avec Node `v22.23.2`.
- Sous le meme Node : `npm run test:emulator` passe. Functions annonce `Using node@22 from host`, charge `createMember`, `registerMember` et `claimInitialAdmin`; 8 fichiers et 61 tests passent. La couverture inclut les champs d inscription non string, les retries sur documents malformes, deux appels `registerMember` concurrents du meme UID/profil, le refus anonyme de `claimInitialAdmin`, la course a un seul gagnant avec preservation de son claim distinct et la reparation du claim par le meme UID.
- Sous le meme Node : le run final `npm run test:e2e:emulator` passe sur des emulateurs frais avec 4/4 en 55,6 s. Les trois parcours terrain passent; le parcours onboarding rejette le code runtime incorrect, accepte le code runtime correct puis atteint `/admin`.
- Sous le meme Node : `npm run test:run` passe avec 17 fichiers et 56 tests; `npm run verify:build` passe avec TypeScript, Vite et le verificateur de budget.
- `node --check functions/index.js` et `git diff --check` passent.

Le runner Playwright cree les 32 octets par `RandomNumberGenerator`, les encode en hexadecimal minuscule avec `BitConverter`, ne les journalise pas et ne persiste que leur hash. Il ne comporte aucun warm-up callable ni mode de parcours cible. Aucun secret ou code de bootstrap en clair n est consigne ici.
