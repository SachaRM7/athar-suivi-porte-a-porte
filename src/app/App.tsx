import { lazy, Suspense, type ReactElement } from 'react';
import { AdminMembersPage } from '../features/admin/components/AdminMembersPage';
import { LoginPage } from '../features/auth/components/LoginPage';
import { TechnicalLab } from '../features/lab/TechnicalLab';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { usePathname } from './routes/navigation';
import { Redirect } from './routes/router';

const MapPage = lazy(async () => ({ default: (await import('../features/map/components/MapPage')).MapPage }));
const MapPreview = lazy(async () => ({ default: (await import('../features/map/components/MapPreview')).MapPreview }));

function RouteFallback(): ReactElement {
  return <div className="workspace-map-loading" aria-label="Chargement" />;
}

export function App(): ReactElement {
  const pathname = usePathname();
  if (pathname === '/login') return <LoginPage />;
  if (pathname === '/technical-lab') return <TechnicalLab />;
  if (pathname === '/technical-map') return <Suspense fallback={<RouteFallback />}><MapPreview /></Suspense>;
  if (pathname === '/') return <ProtectedRoute><Suspense fallback={<RouteFallback />}><MapPage /></Suspense></ProtectedRoute>;
  if (pathname === '/admin/members') return <ProtectedRoute role="admin"><AdminMembersPage /></ProtectedRoute>;
  return <Redirect to="/" />;
}
