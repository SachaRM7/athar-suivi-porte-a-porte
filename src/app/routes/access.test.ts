import { describe, expect, it } from 'vitest';
import type { User } from 'firebase/auth';
import type { ApplicationAuthState } from '../providers/auth-context';
import { resolveRouteAccess } from './access';

const activeMember = {
  status: 'active',
  session: {
    user: {} as User,
    member: { id: 'member-a', username: 'member-a', displayName: 'Member A', role: 'member', active: true, createdAt: '2026-07-29T00:00:00.000Z' }
  }
} satisfies ApplicationAuthState;

describe('route access', () => {
  it('redirects anonymous users and blocks inactive users', () => {
    expect(resolveRouteAccess({ status: 'anonymous' })).toBe('login');
    expect(resolveRouteAccess({ status: 'inactive', user: {} as User })).toBe('inactive');
  });

  it('allows an active member but reserves admin routes to admins', () => {
    expect(resolveRouteAccess(activeMember)).toBe('allow');
    expect(resolveRouteAccess(activeMember, 'admin')).toBe('forbidden');
    expect(resolveRouteAccess({ ...activeMember, session: { ...activeMember.session, member: { ...activeMember.session.member, role: 'admin' } } }, 'admin')).toBe('allow');
  });
});
