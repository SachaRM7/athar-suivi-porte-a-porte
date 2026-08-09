import type { PropsWithChildren, ReactElement } from 'react';
import type { MemberRole } from '../../domain/workspace/models';
import { AccessState } from '../../features/auth/components/AccessState';
import { useAuth } from '../providers/auth-context';
import { resolveRouteAccess } from './access';
import { Redirect } from './router';

export function ProtectedRoute({ children, role }: PropsWithChildren<{ role?: MemberRole }>): ReactElement {
  const { state } = useAuth();
  const access = resolveRouteAccess(state, role);
  if (access === 'allow') return <>{children}</>;
  if (access === 'login') return <Redirect to="/login" />;
  if (access === 'loading') return <AccessState title="Vérification en cours" message="Athar vérifie la session et l’accès au workspace." />;
  if (access === 'unconfigured') return <AccessState title="Configuration requise" message="La configuration Firebase de cet environnement est absente." />;
  if (access === 'unregistered') return <Redirect to="/login" />;
  if (access === 'inactive') return <AccessState canSignOut title="Accès suspendu" message="Ce compte ne dispose plus d’un accès actif au workspace." />;
  if (access === 'forbidden') return <AccessState title="Accès réservé" message="Cette route est réservée aux administrateurs actifs." />;
  return <AccessState canSignOut title="Vérification impossible" message={state.status === 'error' ? state.message : 'La session ne peut pas être vérifiée.'} />;
}
