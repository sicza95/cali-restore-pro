import { routeAccess } from './constants';
import type { GuardResult, RouteName, SessionState } from './types';

/** Decides what a route shows for the current session, before the screen itself renders. */
export function routeGuard(route: RouteName, session: SessionState): GuardResult {
  const access = routeAccess[route];
  if (access === 'public' || access === 'open') return 'allow';
  if (!session.loaded) return 'loading';
  if (!session.signedIn) return session.unavailable ? 'retry' : 'signIn';
  if (access === 'admin' && !session.canAdmin) return 'forbidden';
  return 'allow';
}
