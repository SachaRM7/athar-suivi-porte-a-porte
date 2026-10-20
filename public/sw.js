const BUILD_VERSION = '__ATHAR_BUILD_VERSION__';
const SHELL_CACHE = `athar-shell-${BUILD_VERSION}`;
const MAP_CACHE = 'athar-maps-v1';
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const withBasePath = (path) => `${BASE_PATH}${path}` || '/';
const UI_FONTS = [
  '/fonts/ui/space-grotesk-600.woff2', '/fonts/ui/ibm-plex-sans-400.woff2',
  '/fonts/ui/ibm-plex-sans-500.woff2', '/fonts/ui/ibm-plex-sans-600.woff2',
  '/fonts/ui/ibm-plex-mono-500.woff2', '/fonts/ui/ibm-plex-mono-600.woff2',
  '/fonts/ui/noto-kufi-arabic-600.woff2'
];
const SHELL_ASSETS = [...new Set([
  '/', '/index.html',
  '/manifest.webmanifest', '/icons/athar-mark.svg', '/icons/athar-180.png',
  '/icons/athar-192.png', '/icons/athar-512.png', ...UI_FONTS,
  /* __ATHAR_LAZY_ASSETS__ */
])].map(withBasePath);
const BASEMAP = withBasePath('/fixtures/toulouse.pmtiles');
const FOOTPRINTS = [withBasePath('/tiles/batiments-31.pmtiles'), withBasePath('/fixtures/batiments-carmes.pmtiles')];
const MAP_FONTS = ['Regular', 'Medium', 'Italic'].map(weight => withBasePath(`/fonts/Noto%20Sans%20${weight}/0-255.pbf`));
const ALLOWED_MAP_ASSETS = [BASEMAP, ...FOOTPRINTS, ...MAP_FONTS];
// Invalidation prevents an in-flight preparation from recreating caches after sign-out.
let purgeGeneration = 0;
let preparation = null;

async function cacheAsset(cache, path, generation) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok || response.status === 206) throw new Error('Téléchargement incomplet. Réessaie avec du réseau.');
  if (path.endsWith('.pmtiles')) await archiveInfo(response.clone());
  else if (!path.endsWith('.html') && path !== withBasePath('/') && /text\/html/i.test(response.headers.get('content-type') ?? '')) {
    throw new Error('Une ressource de l’application est absente.');
  }
  if (generation !== purgeGeneration) throw new Error('Préparation annulée.');
  await cache.put(path, response);
  if (generation !== purgeGeneration) { await cache.delete(path); throw new Error('Préparation annulée.'); }
}

/** Validate magic, format, declared section lengths and geographic bounds, not HTTP 200. */
async function archiveInfo(response) {
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.slice(0, 127).arrayBuffer());
  if (bytes.length < 127 || new TextDecoder().decode(bytes.slice(0, 7)) !== 'PMTiles' || bytes[7] !== 3) {
    throw new Error('Archive cartographique absente ou invalide.');
  }
  const view = new DataView(bytes.buffer);
  for (const [offset, length] of [[8, 16], [24, 32], [40, 48], [56, 64]]) {
    const end = view.getBigUint64(offset, true) + view.getBigUint64(length, true);
    if (end > BigInt(blob.size)) throw new Error('Archive cartographique incomplète.');
  }
  return { bytes: blob.size, west: view.getInt32(102, true) / 1e7, south: view.getInt32(106, true) / 1e7, east: view.getInt32(110, true) / 1e7, north: view.getInt32(114, true) / 1e7 };
}

async function inspectAssets() {
  const shell = await caches.open(SHELL_CACHE);
  const missing = (await Promise.all(SHELL_ASSETS.map(async path => (await shell.match(path)) ? null : path))).filter(Boolean);
  const maps = await caches.open(MAP_CACHE);
  const archives = {};
  for (const path of [BASEMAP, ...FOOTPRINTS]) {
    const response = await maps.match(path);
    if (response) {
      try { archives[path] = await archiveInfo(response); } catch { /* Invalid cached bytes never count as prepared. */ }
    }
  }
  const fonts = (await Promise.all(MAP_FONTS.map(path => maps.match(path)))).every(Boolean);
  return { version: BUILD_VERSION, shell: missing.length === 0, fonts, archives };
}

async function prepareAssets(send) {
  const generation = purgeGeneration;
  const shell = await caches.open(SHELL_CACHE);
  for (const path of SHELL_ASSETS) {
    if (!(await shell.match(path))) await cacheAsset(shell, path, generation);
  }
  send({ step: 'Interface disponible' });
  const maps = await caches.open(MAP_CACHE);
  for (const path of [BASEMAP, ...MAP_FONTS]) {
    // Refresh map resources explicitly; do not trust an older preparation after a map update.
    await cacheAsset(maps, path, generation);
  }
  send({ step: 'Fond de carte disponible' });
  let found = false;
  for (const path of FOOTPRINTS) {
    try { await cacheAsset(maps, path, generation); found = true; break; }
    catch (error) {
      if (generation !== purgeGeneration || error?.name === 'QuotaExceededError') throw error;
      await maps.delete(path);
    }
  }
  send({ step: found ? 'Emprises téléchargées' : 'Emprises indisponibles' });
  if (generation !== purgeGeneration) throw new Error('Préparation annulée.');
  return inspectAssets();
}

self.addEventListener('install', event => {
  const generation = purgeGeneration;
  event.waitUntil(caches.open(SHELL_CACHE).then(async cache => {
    for (const path of SHELL_ASSETS) await cacheAsset(cache, path, generation);
  }).catch(() => undefined));
  // An update waits for existing tabs to close. Their lazy chunks must keep the same shell.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('athar-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('message', event => {
  const send = value => event.ports[0]?.postMessage(value);
  if (event.data?.type === 'PURGE_ATHAR_DATA') {
    purgeGeneration++;
    event.waitUntil((preparation ?? Promise.resolve()).catch(() => undefined).then(() => caches.keys()).then(keys => Promise.all(keys.filter(key => key.startsWith('athar-')).map(key => caches.delete(key)))).then(() => send({ ok: true })));
    return;
  }
  if (event.data?.type === 'CHECK_OFFLINE_ASSETS') {
    event.waitUntil(inspectAssets().then(assets => send({ ok: true, assets })).catch(() => send({ ok: false, error: 'Stockage hors ligne indisponible.' })));
  }
  if (event.data?.type === 'PREPARE_ZONE_ASSETS' || event.data?.type === 'PREPARE_TOULOUSE_MAP') {
    // The historical laboratory protocol expects one terminal response only.
    preparation ??= prepareAssets(event.data.type === 'PREPARE_ZONE_ASSETS' ? send : () => undefined).finally(() => { preparation = null; });
    event.waitUntil(preparation.then(assets => send({ ok: true, assets })).catch(error => send({ ok: false, error: error?.name === 'QuotaExceededError' ? 'Espace insuffisant sur cet appareil. Libère de l’espace puis réessaie.' : 'Préparation interrompue. Vérifie le réseau et l’espace disponible, puis réessaie.' })));
  }
});

async function mapResponse(request, pathname) {
  const cached = await caches.open(MAP_CACHE).then(cache => cache.match(pathname)).catch(() => null);
  if (!cached) return fetch(request);
  if (request.method === 'HEAD') return new Response(null, { headers: cached.headers });
  const range = request.headers.get('range');
  if (!range) return cached;
  const blob = await cached.blob();
  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  const start = match ? Number(match[1]) : NaN;
  const end = match?.[2] ? Math.min(Number(match[2]), blob.size - 1) : blob.size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= blob.size || end < start) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${blob.size}` } });
  }
  const headers = new Headers(cached.headers);
  headers.delete('content-encoding');
  headers.set('accept-ranges', 'bytes');
  headers.set('content-range', `bytes ${start}-${end}/${blob.size}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(blob.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !['GET', 'HEAD'].includes(request.method)) return;
  if (ALLOWED_MAP_ASSETS.includes(url.pathname)) {
    event.respondWith(mapResponse(request, url.pathname));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(SHELL_CACHE)).match(withBasePath('/index.html'))));
    return;
  }
  // Only known build assets are cached. API responses and private routes never enter Cache Storage.
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(SHELL_CACHE).then(async cache => (await cache.match(request, { ignoreVary: true })) ?? fetch(request)));
  }
});
