import { useEffect, useState } from 'react';
import { withBasePath, withoutBasePath } from '../config/public-paths';

export function navigate(path: string, replace = false): void {
  const browserPath = path.startsWith('/') ? withBasePath(path as `/${string}`) : path;
  if (replace) window.history.replaceState(null, '', browserPath);
  else window.history.pushState(null, '', browserPath);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePathname(): string {
  const [pathname, setPathname] = useState(withoutBasePath(window.location.pathname));
  useEffect(() => {
    const update = () => setPathname(withoutBasePath(window.location.pathname));
    window.addEventListener('popstate', update);
    // Les effets enfants passent avant celui-ci : un `Redirect` monté au premier rendu a pu
    // naviguer avant l'abonnement. Sans cette relecture, l'URL changeait mais l'écran restait
    // blanc (route inconnue ouverte directement, laboratoire en production compris).
    update();
    return () => window.removeEventListener('popstate', update);
  }, []);
  return pathname;
}
