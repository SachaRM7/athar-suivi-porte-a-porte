import type { ApplicationAuthState } from '../providers/auth-context';
import type { MemberRole } from '../../domain/workspace/models';

export type RouteAccess = 'allow' | 'loading' | 'unconfigured' | 'login' | 'unregistered' | 'inactive' | 'error' | 'forbidden';

export function resolveRouteAccess(state: ApplicationAuthState, requiredRole?: MemberRole): RouteAccess {
  if (state.status === 'loading') return 'loading';
  if (state.status === 'unconfigured') return 'unconfigured';
  if (state.status === 'anonymous') return 'login';
  if (state.status === 'unregistered') return 'unregistered';
  if (state.status === 'inactive') return 'inactive';
  if (state.status === 'error') return 'error';
  if (requiredRole && state.session.member.role !== requiredRole) return 'forbidden';
  return 'allow';
}
