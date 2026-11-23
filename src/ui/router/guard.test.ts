import { describe, expect, it } from 'vitest';
import { routeAccess } from './constants';
import { routeGuard } from './guard';
import type { RouteName, SessionState } from './types';

const session = (state: Partial<SessionState>): SessionState => ({
  loaded: true,
  signedIn: true,
  unavailable: false,
  canAdmin: false,
  ...state,
});
const names = Object.keys(routeAccess) as RouteName[];
const byAccess = (access: string) => names.filter((name) => routeAccess[name] === access);

describe('routeGuard', () => {
  it('always opens public and standalone routes', () => {
    const states = [
      session({ loaded: false, signedIn: false }),
      session({ signedIn: false, unavailable: true }),
      session({ signedIn: false }),
      session({}),
    ];
    for (const name of [...byAccess('public'), ...byAccess('open')])
      for (const state of states) expect(routeGuard(name, state), name).toBe('allow');
  });

  it('waits for the session check before deciding a protected route', () => {
    for (const name of [...byAccess('signed-in'), 'admin' as const])
      expect(routeGuard(name, session({ loaded: false, signedIn: false }))).toBe('loading');
  });

  it('asks to sign in, or to retry when the session check failed', () => {
    for (const name of [...byAccess('signed-in'), 'admin' as const]) {
      expect(routeGuard(name, session({ signedIn: false }))).toBe('signIn');
      expect(routeGuard(name, session({ signedIn: false, unavailable: true }))).toBe('retry');
    }
  });

  it('opens signed-in routes to any account and admin only with a capability', () => {
    for (const name of byAccess('signed-in')) expect(routeGuard(name, session({}))).toBe('allow');
    expect(routeGuard('admin', session({}))).toBe('forbidden');
    expect(routeGuard('admin', session({ canAdmin: true }))).toBe('allow');
  });

  it('protects every account destination', () => {
    expect(byAccess('admin')).toEqual(['admin']);
    expect(byAccess('open')).toEqual(['offline']);
    expect(byAccess('signed-in').sort()).toEqual(
      ['projects', 'invitations', 'profile', 'security', 'preferences', 'libraries'].sort(),
    );
  });
});
