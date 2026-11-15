import type { RouteAccess, RouteName } from './types';

export const reviewSteps = ['estimates', 'reports', 'outputs'] as const;

export const publicRouteNames = [
  'recover-deleted-account',
  'register',
  'forgot-password',
  'reset-password',
  'verify-email',
  'confirm-email',
] as const;

/** Signed-in destinations and their canonical paths. `projects` also owns its sub-paths. */
export const accountPaths = {
  projects: '/projects',
  invitations: '/invitations',
  profile: '/settings/account',
  security: '/settings/security',
  preferences: '/settings/preferences',
  libraries: '/settings/libraries',
  unlock: '/unlock',
  'devices/approve': '/devices/approve',
  admin: '/admin',
} as const;

export const loginPath = '/login';
export const offlinePath = '/offline-originals';

/** Who may open each route. `routeGuard` reads this table. */
export const routeAccess: Record<RouteName, RouteAccess> = {
  login: 'public',
  notFound: 'public',
  offline: 'open',
  'recover-deleted-account': 'public',
  register: 'public',
  'forgot-password': 'public',
  'reset-password': 'public',
  'verify-email': 'public',
  'confirm-email': 'public',
  projects: 'signed-in',
  invitations: 'signed-in',
  profile: 'signed-in',
  security: 'signed-in',
  preferences: 'signed-in',
  libraries: 'signed-in',
  unlock: 'signed-in',
  'devices/approve': 'signed-in',
  admin: 'admin',
};
