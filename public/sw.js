const SHELL_CACHE = 'athar-shell-v15';
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const withBasePath = (path) => `${BASE_PATH}${path}` || '/';

/*
 * Les polices d'interface font partie du shell, pas des embellissements : sans elles,
 * la lecture mono des adresses — ce qui les rend scannables — disparait hors ligne.
 * Seules les graisses prescrites par 01-DESIGN-SYSTEM.md sont precachees (158 Ko).
 */
const UI_FONTS = [
  '/fonts/ui/space-grotesk-600.woff2',
  '/fonts/ui/ibm-plex-sans-400.woff2',
  '/fonts/ui/ibm-plex-sans-500.woff2',
  '/fonts/ui/ibm-plex-sans-600.woff2',
  '/fonts/ui/ibm-plex-mono-500.woff2',
  '/fonts/ui/ibm-plex-mono-600.woff2',
  '/fonts/ui/noto-kufi-arabic-600.woff2'
].map(withBasePath);

const SHELL_ASSETS = [
  withBasePath('/'),
  withBasePath('/index.html'),
  withBasePath('/assets/app-v15.js'),
  withBasePath('/assets/app-v15.css'),
  withBasePath('/manifest.webmanifest'),
  withBasePath('/icons/athar-mark.svg'),
  withBasePath('/icons/athar-180.png'),
  withBasePath('/icons/athar-192.png'),
  withBasePath('/icons/athar-512.png'),
  ...UI_FONTS
];

self.addEventListener('install', (event) => {
  // Une saturation du stockage hors ligne ne doit jamais empêcher la nouvelle
  // version de s'installer : le réseau reste alors la source de repli.
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PURGE_ATHAR_DATA') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('athar-')).map((key) => caches.delete(key))
    )));
    return;
  }
  if (event.data?.type !== 'PREPARE_TOULOUSE_MAP') return;
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE),
      fetch(withBasePath('/fixtures/toulouse.pmtiles'), { cache: 'no-store' }),
      fetch(withBasePath('/fonts/Noto%20Sans%20Regular/0-255.pbf'), { cache: 'no-store' }),
      fetch(withBasePath('/fonts/Noto%20Sans%20Medium/0-255.pbf'), { cache: 'no-store' }),
      fetch(withBasePath('/fonts/Noto%20Sans%20Italic/0-255.pbf'), { cache: 'no-store' })
    ])
      .then(async ([cache, response, regular, medium, italic]) => {
        if (!response.ok) throw new Error(`PMTiles download failed: ${response.status}`);
        for (const font of [regular, medium, italic]) {
          if (!font.ok) throw new Error(`Map font download failed: ${font.status}`);
        }
        await Promise.all([
          cache.put(withBasePath('/fixtures/toulouse.pmtiles'), response),
          cache.put(withBasePath('/fonts/Noto%20Sans%20Regular/0-255.pbf'), regular),
          cache.put(withBasePath('/fonts/Noto%20Sans%20Medium/0-255.pbf'), medium),
          cache.put(withBasePath('/fonts/Noto%20Sans%20Italic/0-255.pbf'), italic)
        ]);
      })
      .then(() => event.ports[0]?.postMessage({ ok: true }))
      .catch((error) => event.ports[0]?.postMessage({ ok: false, error: String(error) }))
  );
});

async function matchShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  return cache.match(request, { ignoreVary: true });
}

async function cacheShellResponse(request) {
  try {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      await cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  } catch {
    return fetch(request);
  }
}

async function refreshShellResponse(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await caches.open(SHELL_CACHE)
        .then((cache) => cache.put(request, response.clone()))
        .catch(() => undefined);
    }
    return response;
  } catch {
    return matchShell(request)
      .then((cached) => cached ?? Response.error())
      .catch(() => Response.error());
  }
}

async function matchPmtilesRange(request) {
  let cache;
  try {
    cache = await caches.open(SHELL_CACHE);
  } catch {
    return fetch(request);
  }
  const cached = await cache.match(withBasePath('/fixtures/toulouse.pmtiles'));
  if (!cached) return fetch(request);
  const range = request.headers.get('range');
  if (!range) return cached;
  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!match) return new Response(null, { status: 416 });
  const buffer = await cached.arrayBuffer();
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : buffer.byteLength - 1;
  const headers = new Headers(cached.headers);
  headers.set('accept-ranges', 'bytes');
  headers.set('content-range', `bytes ${start}-${end}/${buffer.byteLength}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(buffer.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (url.pathname === withBasePath('/fixtures/toulouse.pmtiles')) {
    event.respondWith(matchPmtilesRange(request));
    return;
  }

  /*
   * Les autres archives PMTiles (emprises WP6, echantillon de demonstration) sont lues par
   * plages d'octets. Une reponse 206 ne peut pas entrer dans le Cache Storage : la mettre en
   * cache leve, et la requete d'emprise echouerait. On passe donc directement au reseau.
   */
  if (url.pathname.endsWith('.pmtiles') || request.headers.has('range')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => matchShell(withBasePath('/index.html'))));
    return;
  }

  if (url.pathname === withBasePath('/assets/app-v15.js') || url.pathname === withBasePath('/assets/app-v15.css')) {
    event.respondWith(refreshShellResponse(request));
    return;
  }

  event.respondWith(cacheShellResponse(request));
});
