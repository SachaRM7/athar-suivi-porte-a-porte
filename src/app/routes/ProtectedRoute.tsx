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
  if (access === 'loading') return <AccessState title="Verification en cours" message="Athar verifie la session et l'acces au workspace." />;
  if (access === 'unconfigured') return <AccessState title="Configuration requise" message="La configuration Firebase de cet environnement est absente." />;
  if (access === 'unregistered') return <Redirect to="/login" />;
  if (access === 'inactive') return <AccessState canSignOut title="Acces suspendu" message="Ce compte ne dispose plus d'un acces actif au workspace." />;
  if (access === 'forbidden') return <AccessState title="Acces reserve" message="Cette route est reservee aux administrateurs actifs." />;
  return <AccessState canSignOut title="Verification impossible" message={state.status === 'error' ? state.message : 'La session ne peut pas etre verifiee.'} />;
}
