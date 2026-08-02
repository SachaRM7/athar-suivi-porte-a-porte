const SHELL_CACHE = 'athar-shell-v6';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/assets/app.js',
  '/assets/app.css',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
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
  if (event.data?.type !== 'PREPARE_TOULOUSE_MAP') return;
  event.waitUntil(
    Promise.all([caches.open(SHELL_CACHE), fetch('/fixtures/toulouse.pmtiles', { cache: 'no-store' })])
      .then(([cache, response]) => {
        if (!response.ok) throw new Error(`PMTiles download failed: ${response.status}`);
        return cache.put('/fixtures/toulouse.pmtiles', response);
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
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && request.method === 'GET') {
    await cache.put(request, response.clone());
  }
  return response;
}

async function refreshShellResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return cache.match(request, { ignoreVary: true });
  }
}

async function matchPmtilesRange(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match('/fixtures/toulouse.pmtiles');
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

  if (url.pathname === '/fixtures/toulouse.pmtiles') {
    event.respondWith(matchPmtilesRange(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => matchShell('/index.html')));
    return;
  }

  if (url.pathname === '/assets/app.js' || url.pathname === '/assets/app.css') {
    event.respondWith(refreshShellResponse(request));
    return;
  }

  event.respondWith(cacheShellResponse(request));
});
