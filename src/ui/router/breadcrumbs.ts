import { objectHref, organisationHref, projectHref, projectReviewHref, routeHref } from './routes';
import type { AppRoute, ReviewStep, RouteName } from './types';

/**
 * One step of a breadcrumb trail. `route` steps are labelled with the route's name, `project` and
 * `surface` steps with the name of that record, `review` steps with the step's name.
 */
export type Crumb = { href: string } & (
  | { kind: 'route'; name: RouteName }
  | { kind: 'project'; id: string }
  | { kind: 'organisation'; id: string }
  | { kind: 'object'; id: string }
  | { kind: 'surface'; id: string }
  | { kind: 'review'; step: ReviewStep }
);

/**
 * The path from the top of the app to `route`, built from the route table. The last step is the
 * current page and the page title; a one-step trail needs no breadcrumbs. A surface URL does not
 * name its object, so `objectOf` supplies it from the open project when known; without it the
 * trail skips the object step rather than guessing.
 */
export function routeTrail(
  route: AppRoute,
  objectOf?: (surface: string) => string | undefined,
): Crumb[] {
  if (route.name === 'notFound') return [{ kind: 'route', name: 'notFound', href: '' }];
  if (route.name === 'organisations' && route.organisation)
    return [
      { kind: 'route', name: 'organisations', href: organisationHref() },
      { kind: 'organisation', id: route.organisation, href: organisationHref(route.organisation) },
    ];
  const top: Crumb = { kind: 'route', name: route.name, href: routeHref(route) };
  if (route.name !== 'projects' || !route.project) return [top];
  const library: Crumb = { kind: 'route', name: 'projects', href: projectHref() };
  const project: Crumb = { kind: 'project', id: route.project, href: projectHref(route.project) };
  if (route.object)
    return [
      library,
      project,
      { kind: 'object', id: route.object, href: objectHref(route.project, route.object) },
    ];
  if (route.surface) {
    const object = objectOf?.(route.surface);
    return [
      library,
      project,
      ...(object
        ? [{ kind: 'object', id: object, href: objectHref(route.project, object) } as const]
        : []),
      { kind: 'surface', id: route.surface, href: projectHref(route.project, route.surface) },
    ];
  }
  if (route.review)
    return [
      library,
      project,
      { kind: 'review', step: route.review, href: projectReviewHref(route.project, route.review) },
    ];
  return [library, project];
}
