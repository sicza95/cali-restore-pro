import { projectHref, projectReviewHref, routeHref } from './routes';
import type { AppRoute, ReviewStep, RouteName } from './types';

/**
 * One step of a breadcrumb trail. `route` steps are labelled with the route's name, `project` and
 * `surface` steps with the name of that record, `review` steps with the step's name.
 */
export type Crumb = { href: string } & (
  | { kind: 'route'; name: RouteName }
  | { kind: 'project'; id: string }
  | { kind: 'surface'; id: string }
  | { kind: 'review'; step: ReviewStep }
);

/**
 * The path from the top of the app to `route`, built from the route table. The last step is the
 * current page and the page title; a one-step trail needs no breadcrumbs.
 */
export function routeTrail(route: AppRoute): Crumb[] {
  if (route.name === 'notFound') return [{ kind: 'route', name: 'notFound', href: '' }];
  const top: Crumb = { kind: 'route', name: route.name, href: routeHref(route) };
  if (route.name !== 'projects' || !route.project) return [top];
  const library: Crumb = { kind: 'route', name: 'projects', href: projectHref() };
  const project: Crumb = { kind: 'project', id: route.project, href: projectHref(route.project) };
  if (route.surface)
    return [
      library,
      project,
      { kind: 'surface', id: route.surface, href: projectHref(route.project, route.surface) },
    ];
  if (route.review)
    return [
      library,
      project,
      { kind: 'review', step: route.review, href: projectReviewHref(route.project, route.review) },
    ];
  return [library, project];
}
