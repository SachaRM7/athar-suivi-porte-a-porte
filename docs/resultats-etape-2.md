# Resultats de l'etape 2 - Prototypes techniques

Statut : termine, revue d'architecture requise  
Date : 29 juillet 2026

## Ce qui a ete construit

Un laboratoire React/PWA minimal, distinct de la future application, est
disponible par `npm run dev`. Il contient :

- une carte MapLibre centree sur Toulouse, un contour GeoJSON local et un cache
  de tuiles OSM borne a 64 entrees ;
- un service worker ecrit dans le projet, sans plugin PWA tiers ;
- une boite d'envoi et un serveur de test pour la reprise hors ligne et les
  conflits de revision ;
- un adaptateur Firestore a lots atomiques pret a etre branche ;
- le passage identifiant visible vers adresse technique Firebase ;
- une disposition stable de plusieurs logements autour d'un point batiment.

## Preuves par risque

| Risque | Preuve obtenue | Etat |
|---|---|---|
| Fond MapLibre hors ligne | Test Playwright en Chromium avec viewport Pixel 5 : l'application, la carte et le contour local restent visibles apres coupure reseau simulee. Le controle manuel du cache a observe 16 tuiles OSM de la zone de test et le GeoJSON local. | Partiellement valide |
| Ecriture hors ligne puis synchronisation | Test Vitest : une ecriture reste dans la boite d'envoi sans reseau, puis met a jour le serveur de test au retour du reseau. | Valide pour le contrat local |
| Revisions concurrentes | Test Vitest : deux appareils partant de la revision 4 produisent un gagnant en revision 5 et une entree de conflit conservant la saisie rejetee. | Valide pour le contrat local |
| Identifiant technique sans inscription publique | Test Vitest : `Sacha.Admin` devient `sacha.admin@auth.athar.invalid`; les identifiants invalides sont rejetes avant l'appel Firebase. L'adaptateur de connexion utilise `signInWithEmailAndPassword`. | Partiellement valide |
| Plusieurs logements au meme batiment | Deux tests Vitest garantissent un positionnement stable et distinct. Le laboratoire a ete inspecte avec un screenshot Pixel 5. | Valide pour le prototype visuel |

## Mesures

- Tests unitaires apres revue : 3 fichiers, 9 tests, tous passes.
- Test navigateur : 1 parcours Playwright, passe.
- Build de production : passe.
- Bundle JavaScript initial : 1 131,90 kB minifie, 305,05 kB gzip.
- Feuille CSS : 72,51 kB minifie, 11,03 kB gzip.
- GeoJSON local de test : 387 octets.
- Audit des dependances de production : 0 vulnerabilite.

Le bundle est trop important pour etre traite comme acquis. MapLibre explique
l'essentiel ; l'etape 3 devra charger la carte de maniere differee afin que la
connexion et les ecrans non cartographiques ne paient pas ce cout initial.

## Limites non masquees

Les validations suivantes ne sont pas encore des preuves de production :

- Aucun projet Firebase ni Firebase Emulator Suite n'est configure. Le poste ne
  possede pas Java, prerequis de l'emulateur. Les lots Firestore reels et le
  rejet par les regles de securite restent donc a verifier avec Firestore, pas
  seulement avec le serveur de test en memoire.
- L'adaptateur Firebase Auth compile, mais aucune vraie connexion n'a eu lieu.
  Masquer l'inscription dans le client ne suffit pas a la rendre privee : la
  creation de comptes devra passer par une fonction privilegiee et etre testee
  dans l'emulateur.
- Le test mobile emule Chromium sur un viewport Pixel 5. Il ne remplace pas un
  essai en mode avion sur Chrome Android physique.
- Le cache de tuiles est borne et prouve la faisabilite du flux. Il ne constitue
  pas encore un paquet cartographique Toulouse complet ni une politique de
  telechargement de zone pour les sorties terrain.
- La boite d'envoi du laboratoire est en memoire. Elle ne survit pas encore a un
  rechargement, contrairement a l'architecture IndexedDB cible.
- Le test Playwright verifie la presence du composant cartographique, pas les
  pixels rendus. Une carte vide pourrait donc encore produire un faux positif.

## Fichiers importants

- `src/prototype-lab.tsx` : laboratoire visuel.
- `public/sw.js` : cache de l'application et des tuiles.
- `src/prototypes/sync-lab.ts` : boite d'envoi, reprise et conflit.
- `src/prototypes/firestore-gateway.ts` : lot Firestore de production a tester.
- `src/prototypes/firebase-auth-gateway.ts` : connexion par identifiant.
- `tests/pwa-offline.spec.ts` : verification mobile hors ligne simulee.

## Verdict de la revue Sol

**NO-GO provisoire pour l'etape 3.** Le lot apporte un GO de faisabilite locale,
mais pas encore un GO de securite, de persistance ou de synchronisation
Firebase. Les conditions de levee sont detaillees dans
`docs/revue-architecture-etape-2.md`.

