import { describe, expect, it } from 'vitest';
import { routeTrail } from './breadcrumbs';
import { accountPaths } from './constants';
import { parseRoute } from './routes';

const project = '00000000-0000-4000-8000-000000000001';
const surface = '00000000-0000-4000-8000-000000000002';

describe('routeTrail', () => {
  it('gives top-level destinations a one-step trail', () => {
    for (const [name, href] of Object.entries(accountPaths))
      expect(routeTrail(parseRoute(href))).toEqual([{ kind: 'route', name, href }]);
    expect(routeTrail(parseRoute('/login'))).toEqual([
      { kind: 'route', name: 'login', href: '/login' },
    ]);
    expect(routeTrail(parseRoute('/nowhere'))).toEqual([
      { kind: 'route', name: 'notFound', href: '' },
    ]);
  });

  it('walks the project hierarchy', () => {
    const library = { kind: 'route', name: 'projects', href: '/projects' };
    const parent = { kind: 'project', id: project, href: '/projects/' + project };
    expect(routeTrail(parseRoute('/projects/' + project))).toEqual([library, parent]);
    expect(routeTrail(parseRoute(`/projects/${project}/surfaces/${surface}`))).toEqual([
      library,
      parent,
      { kind: 'surface', id: surface, href: `/projects/${project}/surfaces/${surface}` },
    ]);
    for (const step of ['estimates', 'reports', 'outputs'] as const)
      expect(routeTrail(parseRoute(`/projects/${project}/${step}`))).toEqual([
        library,
        parent,
        { kind: 'review', step, href: `/projects/${project}/${step}` },
      ]);
  });

  it('links every step but the last to a page that parses back to it', () => {
    const trail = routeTrail(parseRoute(`/projects/${project}/surfaces/${surface}`));
    for (const crumb of trail) expect(routeTrail(parseRoute(crumb.href)).at(-1)).toEqual(crumb);
  });
});
