/**
 * Worker Cloudflare d'Athar. Tout le site est servi en assets statiques (`dist/`), sauf les
 * archives PMTiles trop lourdes pour un asset (limite de 25 Mio par fichier) : elles vivent
 * dans le bucket R2 lié en `MAPS`, sous le même chemin que dans `public/`
 * (`fixtures/toulouse.pmtiles`, `tiles/batiments-31.pmtiles`). Une archive absente de R2 et des
 * assets est relayée depuis `MAP_FALLBACK_ORIGIN` (l'hébergement Firebase, qui la sert déjà) : rien
 * à téléverser à la main. Cf. `docs/athar/DEPLOIEMENT-CLOUDFLARE.md`.
 */
import { contentRange, type R2Range } from './r2-range';

type R2Object = {
  size: number;
  httpEtag: string;
  range?: R2Range;
  body?: ReadableStream;
};

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  MAPS: {
    get(key: string, options?: { range?: Headers }): Promise<R2Object | null>;
    head(key: string): Promise<R2Object | null>;
  };
  /** Origine qui sert aussi les archives, sans barre finale (ex. `https://athar-dev31.web.app`). */
  MAP_FALLBACK_ORIGIN?: string;
};

const MAP_CACHE = 'public, max-age=86400, must-revalidate';

function mapHeaders(object: R2Object): Headers {
  return new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': MAP_CACHE,
    'Content-Type': 'application/octet-stream',
    ETag: object.httpEtag,
    'X-Content-Type-Options': 'nosniff'
  });
}

const MISSING_ARCHIVE = () => new Response('Archive cartographique absente.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

/**
 * Relaie la lecture vers l'origine de repli en transmettant la plage. Une réponse HTML (page de
 * l'application monopage pour un chemin inconnu) n'est jamais une archive : elle vaut absence.
 */
async function serveFromOrigin(request: Request, env: Env, key: string): Promise<Response> {
  const origin = env.MAP_FALLBACK_ORIGIN?.replace(/\/+$/, '');
  if (!origin) return MISSING_ARCHIVE();
  const range = request.headers.get('Range');
  const upstream = await fetch(`${origin}/${key}`, { method: request.method, headers: range ? { Range: range } : {} });
  if (![200, 206, 416].includes(upstream.status) || (upstream.headers.get('Content-Type') ?? '').includes('text/html')) return MISSING_ARCHIVE();
  const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Cache-Control': MAP_CACHE, 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  for (const name of ['Content-Length', 'Content-Range', 'ETag']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
}

/**
 * Archive absente de R2 : on retombe sur l'asset statique (échantillon des Carmes, moins de
 * 25 Mio), en honorant la plage demandée. Jamais de repli sur `index.html` : une page HTML 200
 * n'est pas une archive PMTiles.
 */
async function serveSmallArchive(request: Request, env: Env, key: string): Promise<Response> {
  const asset = await env.ASSETS.fetch(new Request(request.url, { method: 'GET' }));
  if (!asset.ok || (asset.headers.get('Content-Type') ?? '').includes('text/html')) return serveFromOrigin(request, env, key);
  const bytes = new Uint8Array(await asset.arrayBuffer());
  const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Cache-Control': MAP_CACHE, 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') ?? '');
  if (!match || (!match[1] && !match[2])) {
    headers.set('Content-Length', String(bytes.length));
    return new Response(request.method === 'HEAD' ? null : bytes, { headers });
  }
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
  if (start >= bytes.length || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
  headers.set('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

async function serveMap(request: Request, env: Env, key: string): Promise<Response> {
  if (request.method === 'HEAD') {
    const object = await env.MAPS.head(key);
    if (!object) return serveSmallArchive(request, env, key);
    const headers = mapHeaders(object);
    headers.set('Content-Length', String(object.size));
    return new Response(null, { headers });
  }
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  let object: R2Object | null;
  try {
    object = await env.MAPS.get(key, { range: request.headers });
  } catch {
    // Plage invalide : réponse explicite plutôt qu'un fichier complet que PMTiles refuserait.
    const head = await env.MAPS.head(key);
    return new Response(null, { status: 416, headers: head ? { 'Content-Range': `bytes */${head.size}` } : {} });
  }
  if (!object?.body) return serveSmallArchive(request, env, key);
  const headers = mapHeaders(object);
  const partial = request.headers.has('Range') ? contentRange(object.range, object.size) : null;
  if (partial) {
    headers.set('Content-Range', partial.header);
    headers.set('Content-Length', String(partial.length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const key = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
    if (key.endsWith('.pmtiles')) return serveMap(request, env, key);
    return env.ASSETS.fetch(request);
  }
};
