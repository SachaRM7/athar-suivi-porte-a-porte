import { lazy, Suspense, type ReactElement } from 'react';
import { AdminMembersPage } from '../features/admin/components/AdminMembersPage';
import { LoginPage } from '../features/auth/components/LoginPage';
import { TECHNICAL_PATHS, TECHNICAL_ROUTES_ENABLED } from './config/technical-routes';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { usePathname } from './routes/navigation';
import { Redirect } from './routes/router';

const MapPage = lazy(async () => ({ default: (await import('../features/map/components/MapPage')).MapPage }));
const AdminDashboardPage = lazy(async () => ({ default: (await import('../features/admin/components/AdminDashboardPage')).AdminDashboardPage }));
// Constante de compilation : en production, ni ce module ni les laboratoires ne sont émis.
const TechnicalRoutes = TECHNICAL_ROUTES_ENABLED
  ? lazy(async () => ({ default: (await import('./TechnicalRoutes')).TechnicalRoutes }))
  : null;

function RouteFallback(): ReactElement {
  return <div className="workspace-map-loading" aria-label="Chargement" />;
}

export function App(): ReactElement {
  const pathname = usePathname();
  if (pathname === '/login') return <LoginPage />;
  if (TechnicalRoutes && (TECHNICAL_PATHS as readonly string[]).includes(pathname)) {
    return <Suspense fallback={<RouteFallback />}><TechnicalRoutes pathname={pathname} /></Suspense>;
  }
  if (pathname === '/') return <ProtectedRoute><Suspense fallback={<RouteFallback />}><MapPage /></Suspense></ProtectedRoute>;
  if (pathname === '/admin') return <ProtectedRoute role="admin"><Suspense fallback={<RouteFallback />}><AdminDashboardPage /></Suspense></ProtectedRoute>;
  if (pathname === '/admin/members') return <ProtectedRoute role="admin"><AdminMembersPage /></ProtectedRoute>;
  // Route inconnue, laboratoire compris en production : retour à la carte, donc à la connexion.
  return <Redirect to="/" />;
}
