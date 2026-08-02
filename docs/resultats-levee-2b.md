# Resultats du lot de levee 2B

Date : 29 juillet 2026  
Perimetre : uniquement les trois conditions rouges de la revue 2B

## 1. Fermeture Auth reelle

La partie locale reste verte : la creation Admin SDK et la fonction callable
privilegiee passent dans Firebase Emulator Suite. L'Auth Emulator ne reproduit
pas le reglage console qui interdit la creation et la suppression libre-service.

Le projet Firebase de developpement `athar-dev31` est maintenant disponible et a
ete teste sans deploiement applicatif. La creation privilegiee admin/OAuth
fonctionne, mais `accounts:signUp` par cle Web et `accounts:delete` par
utilisateur connecte retournent 200.

Resultat : **non leve**. La fermeture libre-service est un echec reel, pas
seulement une limite de l'emulateur. Voir `docs/resultats-auth-reel.md`.

## 2. Paquet Toulouse hors ligne

Le micro-fond PNG a ete remplace par un extrait vectoriel PMTiles reel produit a
partir du build quotidien Protomaps du 28 juillet 2026 :

- source : `https://build.protomaps.com/20260728.pmtiles` ;
- emprise : `1.35,43.52,1.52,43.68` ;
- fichier : `public/fixtures/toulouse.pmtiles` ;
- volume : **20 607 579 octets (19,65 Mio)** ;
- SHA-256 : `D9DF7A44B53AD1DAB7F048E5577E796F83858FAEE54293E5D9D6DE44D3AFB887` ;
- 517 tuiles adressees, zooms 0 a 15, MVT gzip ;
- donnees OpenStreetMap sous ODbL, attribution OpenStreetMap et Protomaps visible.

Le service worker prepare explicitement le paquet, le conserve dans Cache
Storage et sert correctement les requetes partielles hors ligne. La preuve
Playwright recharge ensuite la PWA avec le reseau coupe sur un viewport Pixel 5.
Mesures du canvas :

| Mesure | Resultat |
|---|---:|
| Octets MVT de la tuile centrale decompressee | 145 580 |
| Entites MapLibre rendues | 272 |
| Couleurs significatives (au moins 100 pixels) | 256 |
| Pixels de la couleur dominante | 278 962 / 892 707 (31,25 %) |

Un echec cache a ete corrige : `maplibre-gl: latest` installait la version 6.0,
dont le protocole de tuiles dans les workers ne fonctionnait pas avec
`pmtiles@4.4.1`. MapLibre est epingle a **5.24.0** et la source est ajoutee apres
le chargement du style. Les couches de texte sont exclues pour ne demander ni
glyphes ni sprites externes.

Resultat local : **leve**. Resultat appareil : **non leve**, car aucun binaire
`adb` ni appareil Android n'est detecte. Le test Chrome Android physique en mode
avion reste obligatoire pour rendre la condition 6 entierement verte.

## 3. Budget geohash Firestore

Le viewport est subdivise en 6 x 6 cellules avant calcul des bornes geohash. Les
plages identiques sont dedupliquees. Un test d'integration charge 10 000 portes
distinctes dans Firestore Emulator et execute les vraies requetes
`orderBy/startAt/endAt` sous les regles de securite.

| Mesure | Resultat |
|---|---:|
| Plages / requetes Firestore | 30 |
| Documents retournes | 812 |
| Documents uniques | 812 |
| Doublons | 0 |
| Portes utiles dans le viewport | 504 |
| Faux positifs filtres | 308 |
| Faux negatifs | 0 |
| Surlecture par rapport aux resultats utiles | 61,11 % |

Le precedent prototype retournait 5 390 candidats pour 504 portes utiles. La
nouvelle mesure reduit les lectures candidates de **84,94 %** et fixe un budget
reproductible de 812 lectures pour ce mouvement de carte.

Resultat : **leve pour le socle V1**. Le nombre de requetes et le budget devront
etre surveilles avec les viewports reels, mais il n'y a plus de faux positif de
preuve ni de simulation memoire.

## Validations executees

```powershell
npm run test:run
npm run test:emulator
npm run build
npm run test:e2e
npm audit --omit=dev
```

- tests unitaires : 13 tests passes dans 5 fichiers ;
- emulateurs Auth, Firestore et Functions : 14 tests passes dans 4 fichiers ;
- Playwright hors ligne : 1 parcours passe avec mesures du canvas ;
- build : passe ;
- audit des dependances de production : 0 vulnerabilite.
