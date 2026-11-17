import { accountPaths, loginPath, offlinePath, publicRouteNames, reviewSteps } from './constants';
import type {
  AccountDestination,
  AppRoute,
  ProjectLocation,
  PublicRouteName,
  ReviewStep,
  RouteName,
} from './types';

const uuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const projectPattern = new RegExp(
  `^/projects(?:/(${uuid})(?:/surfaces/(${uuid})|/(${reviewSteps.join('|')}))?)?/*$`,
);

export function normalizePath(path: string) {
  return path.replace(/\/+$/, '') || '/';
}

/** The project part of a path, or `undefined` when the path is not a project route. */
export function projectLocation(path: string): ProjectLocation | undefined {
  const match = projectPattern.exec(path);
  return match
    ? { project: match[1], surface: match[2], review: match[3] as ReviewStep | undefined }
    : undefined;
}

export function isAccountDestination(name: RouteName): name is AccountDestination {
  return Object.hasOwn(accountPaths, name);
}

function isPublicRoute(name: string): name is PublicRouteName {
  return (publicRouteNames as readonly string[]).includes(name);
}

export function parseRoute(path: string): AppRoute {
  const normalized = normalizePath(path);
  if (normalized === '/' || normalized === loginPath) return { name: 'login' };
  if (normalized === offlinePath) return { name: 'offline' };
  const project = projectLocation(normalized);
  if (project) return { name: 'projects', ...project };
  const destination = Object.entries(accountPaths).find(([, href]) => href === normalized);
  if (destination) return { name: destination[0] } as AppRoute;
  const name = normalized.slice(1);
  return isPublicRoute(name) ? { name } : { name: 'notFound' };
}

export function projectHref(project?: string, surface?: string) {
  if (!project) return accountPaths.projects;
  return accountPaths.projects + '/' + project + (surface ? '/surfaces/' + surface : '');
}

export function projectReviewHref(project: string, step: ReviewStep) {
  return projectHref(project) + '/' + step;
}

/** The canonical path of a route; `parseRoute(routeHref(route))` gives the route back. */
export function routeHref(route: Exclude<AppRoute, { name: 'notFound' }>): string {
  if (route.name === 'projects')
    return route.project && route.review
      ? projectReviewHref(route.project, route.review)
      : projectHref(route.project, route.surface);
  if (route.name === 'login') return loginPath;
  if (route.name === 'offline') return offlinePath;
  if (isAccountDestination(route.name)) return accountPaths[route.name];
  return '/' + route.name;
}

/** A stable key for comparing two routes. */
export function routeKey(route: AppRoute) {
  return route.name === 'notFound' ? 'notFound' : routeHref(route);
}

/** Sign-in link that returns to a protected destination, keeping a project deep link. */
export function signInLink(destination: AccountDestination, path?: string) {
  const next = destination === 'projects' && path && projectLocation(path) ? path : destination;
  return loginPath + '?' + new URLSearchParams({ next });
}

/** Where to go after signing in. Only known destinations and project paths are followed. */
export function signInDestination(next: string | null) {
  if (next && projectLocation(next)) return next;
  return next && Object.hasOwn(accountPaths, next)
    ? accountPaths[next as AccountDestination]
    : accountPaths.security;
}

/** Hands plain left clicks on an in-app link to `navigate`; modified clicks keep browser behaviour. */
export function followLink(
  event: MouseEvent,
  navigate: (href: string) => void,
  anchor = event.currentTarget as HTMLAnchorElement,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    anchor.hasAttribute('download') ||
    (anchor.target && anchor.target !== '_self') ||
    anchor.origin !== location.origin ||
    parseRoute(anchor.pathname).name === 'notFound'
  )
    return;
  event.preventDefault();
  navigate(anchor.pathname + anchor.search + anchor.hash);
}
