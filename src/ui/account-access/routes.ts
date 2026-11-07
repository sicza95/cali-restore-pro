import { publicRoutes } from './constants';
import { projectRoute } from './projects/project-route';

export const accountDestinations = {
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

export type AccountDestination = keyof typeof accountDestinations;
export type Route = 'login' | 'notFound' | AccountDestination | (typeof publicRoutes)[number];

export function accountRoute(path: string): Route {
  const normalized = path.replace(/\/+$/, '') || '/';
  if (normalized === '/' || normalized === '/login') return 'login';
  if (projectRoute(normalized)) return 'projects';
  const destination = Object.entries(accountDestinations).find(([, href]) => href === normalized);
  if (destination) return destination[0] as AccountDestination;
  return publicRoutes.find((route) => '/' + route === normalized) ?? 'notFound';
}

export function isAccountDestination(view: Route): view is AccountDestination {
  return Object.hasOwn(accountDestinations, view);
}

export function signInLink(view: AccountDestination, path?: string) {
  return (
    '/login?' +
    new URLSearchParams({ next: view === 'projects' && path && projectRoute(path) ? path : view })
  );
}

export function signInDestination(next: string | null) {
  if (next && projectRoute(next)) return next;
  return next && Object.hasOwn(accountDestinations, next)
    ? accountDestinations[next as AccountDestination]
    : accountDestinations.security;
}
