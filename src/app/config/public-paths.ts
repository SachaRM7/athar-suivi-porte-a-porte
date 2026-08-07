const rawBaseUrl = import.meta.env.BASE_URL || '/';
export const appBasePath = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

export function withBasePath(path: `/${string}`): string {
  return `${appBasePath}${path}` || '/';
}

export function withoutBasePath(pathname: string): string {
  if (!appBasePath) return pathname || '/';
  if (pathname === appBasePath) return '/';
  if (pathname.startsWith(`${appBasePath}/`)) return pathname.slice(appBasePath.length) || '/';
  return pathname || '/';
}
