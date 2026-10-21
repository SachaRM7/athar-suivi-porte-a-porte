# Déploiement sur Cloudflare Workers

Alternative à Firebase Hosting (`.github/workflows/deploy.yml`). Firebase reste le backend :
Auth, Firestore et Functions ne bougent pas. Seul le site est servi par Cloudflare.

## Ce que fait le dépôt

- `wrangler.jsonc` : Worker `athar-suivi-porte-a-porte`, assets statiques de `dist/`,
  application monopage (`not_found_handling`), `/index.html` servi tel quel (`html_handling: none`,
  nécessaire au service worker hors ligne).
- `worker/index.ts` : sert les archives `.pmtiles` avec lecture par plages (206). Le fond de carte
  `fixtures/toulouse.pmtiles` (44,6 Mo) dépasse la limite de 25 Mio d'un asset : il vit dans le
  bucket R2 `athar-cartes`. Ordre de lecture d'une archive : R2, puis asset statique (échantillon des
  Carmes), puis relais depuis `MAP_FALLBACK_ORIGIN` (`wrangler.jsonc`, l'hébergement Firebase qui
  sert déjà `tiles/batiments-31.pmtiles`). Jamais de repli sur `index.html` : une réponse HTML vaut
  absence. Téléverser une archive dans R2 la rend indépendante de Firebase Hosting.
- `public/.assetsignore` : exclut de l'envoi les archives servies par R2.
- `public/_headers` : mêmes en-têtes que `firebase.json`.

## Une fois, dans le tableau de bord Cloudflare

1. **R2 → Create bucket** : `athar-cartes`.
2. Dans ce bucket, **Upload** le fichier `public/fixtures/toulouse.pmtiles` sous la clé exacte
   `fixtures/toulouse.pmtiles` (créer le dossier `fixtures`). Le tuileset départemental va sous
   `tiles/batiments-31.pmtiles` : le récupérer sur https://athar-dev31.web.app/tiles/batiments-31.pmtiles.

   Le relais depuis Firebase Hosting ne remplace pas cet envoi : les requêtes sortantes d'un Worker
   acceptent toujours gzip/br, et Firebase applique alors la plage au flux compressé (servi en
   `text/html`). L'en-tête `X-Athar-Archive` de la réponse 404 l'indique (`origin 206 text/html`).
3. **Workers & Pages → Create → Import a repository** : `SachaRM7/athar-suivi-porte-a-porte`.

| Champ | Valeur |
|---|---|
| Project name | `athar-suivi-porte-a-porte` (doit égaler `name` de `wrangler.jsonc`) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Path | `/` |

Variables de build (Advanced settings), lues par Vite au moment du build :

| Nom | Valeur |
|---|---|
| `NODE_VERSION` | `22` |
| `VITE_FIREBASE_API_KEY` | console Firebase → Paramètres du projet → Vos applications |
| `VITE_FIREBASE_AUTH_DOMAIN` | même écran (en général `athar-dev31.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | `athar-dev31` |
| `VITE_FIREBASE_APP_ID` | même écran que la clé |
| `VITE_WORKSPACE_ID` | `main` |
| `VITE_BASE_PATH` | `/` |
| `VITE_USE_FIREBASE_EMULATORS` | `false` |

La configuration Web Firebase est publique : inutile de chiffrer ces valeurs.

## Après le premier déploiement

- **Firebase → Authentication → Settings → Authorized domains** : ajouter le domaine
  `athar-suivi-porte-a-porte.<sous-domaine>.workers.dev` (ou le domaine personnalisé).
- Si la clé d'API est restreinte par référent HTTP (Google Cloud → Identifiants), y ajouter ce domaine.
- Contrôle : `/fixtures/toulouse.pmtiles` avec `Range: bytes=0-6` doit répondre `206` et `PMTiles`.

## Limites

Le déploiement Cloudflare ne passe pas par les gardes du workflow GitHub (`build:deploy`,
contrat backend, recette émulateurs). Ne déployer que depuis `main` après un contrôle vert.
