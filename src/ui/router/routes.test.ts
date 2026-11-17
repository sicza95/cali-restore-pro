import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountPaths, publicRouteNames, reviewSteps } from './constants';
import {
  followLink,
  parseRoute,
  projectHref,
  projectReviewHref,
  routeHref,
  routeKey,
  signInDestination,
  signInLink,
} from './routes';
import type { AppRoute } from './types';

const project = '00000000-0000-4000-8000-000000000001';
const surface = '00000000-0000-4000-8000-000000000002';

describe('parseRoute', () => {
  it('maps every URL that exists today', () => {
    const table: [string, AppRoute][] = [
      ['/', { name: 'login' }],
      ['/login', { name: 'login' }],
      ['/register', { name: 'register' }],
      ['/recover-deleted-account', { name: 'recover-deleted-account' }],
      ['/forgot-password', { name: 'forgot-password' }],
      ['/reset-password', { name: 'reset-password' }],
      ['/verify-email', { name: 'verify-email' }],
      ['/confirm-email', { name: 'confirm-email' }],
      ['/invitations', { name: 'invitations' }],
      ['/settings/account', { name: 'profile' }],
      ['/settings/security', { name: 'security' }],
      ['/settings/preferences', { name: 'preferences' }],
      ['/settings/libraries', { name: 'libraries' }],
      ['/unlock', { name: 'unlock' }],
      ['/devices/approve', { name: 'devices/approve' }],
      ['/admin', { name: 'admin' }],
      ['/offline-originals', { name: 'offline' }],
    ];
    for (const [path, route] of table) expect(parseRoute(path), path).toEqual(route);
  });

  it('reads project, surface and review step from project paths', () => {
    expect(parseRoute('/projects')).toMatchObject({ name: 'projects', project: undefined });
    expect(parseRoute('/projects/' + project)).toEqual({
      name: 'projects',
      project,
      surface: undefined,
      review: undefined,
    });
    expect(parseRoute(`/projects/${project}/surfaces/${surface}`)).toMatchObject({
      name: 'projects',
      project,
      surface,
    });
    for (const step of reviewSteps)
      expect(parseRoute(`/projects/${project}/${step}`)).toMatchObject({ project, review: step });
  });

  it('ignores trailing slashes', () => {
    expect(parseRoute('/login/')).toEqual({ name: 'login' });
    expect(parseRoute('/settings/security//')).toEqual({ name: 'security' });
    expect(parseRoute('/offline-originals/')).toEqual({ name: 'offline' });
    expect(parseRoute(`/projects/${project}/`)).toMatchObject({ name: 'projects', project });
  });

  it('sends unknown, malformed and partial paths to notFound', () => {
    for (const path of [
      '/nope',
      '/projects/east-chapel',
      `/projects/${project}/surfaces/north-wall`,
      `/projects/${project}/surfaces`,
      `/projects/${project}/drawings`,
      '/projects/ABCDEF00-0000-4000-8000-000000000001',
      '/settings',
      '/settings/security/extra',
      '/Login',
    ])
      expect(parseRoute(path), path).toEqual({ name: 'notFound' });
  });
});

describe('hrefs', () => {
  it('builds project links', () => {
    expect(projectHref()).toBe('/projects');
    expect(projectHref(project)).toBe('/projects/' + project);
    expect(projectHref(project, surface)).toBe(`/projects/${project}/surfaces/${surface}`);
    expect(projectReviewHref(project, 'reports')).toBe(`/projects/${project}/reports`);
  });

  it('round-trips every route through routeHref', () => {
    const routes: Exclude<AppRoute, { name: 'notFound' }>[] = [
      { name: 'login' },
      { name: 'offline' },
      ...publicRouteNames.map((name) => ({ name })),
      ...Object.keys(accountPaths).map((name) => ({ name }) as AppRoute & { name: 'admin' }),
      { name: 'projects', project },
      { name: 'projects', project, surface },
      ...reviewSteps.map((review) => ({ name: 'projects' as const, project, review })),
    ];
    for (const route of routes) {
      const parsed = parseRoute(routeHref(route));
      expect(routeKey(parsed), routeHref(route)).toBe(routeKey(route));
      expect(parsed.name).toBe(route.name);
    }
    expect(routeHref({ name: 'security' })).toBe('/settings/security');
    expect(routeKey({ name: 'notFound' })).toBe('notFound');
  });
});

describe('sign-in deep links', () => {
  it('keeps project paths and destination names in next', () => {
    const deep = projectReviewHref(project, 'estimates');
    expect(signInLink('projects', deep)).toBe('/login?next=' + encodeURIComponent(deep));
    expect(signInLink('projects', '/projects/east-chapel')).toBe('/login?next=projects');
    expect(signInLink('devices/approve', '/devices/approve')).toBe('/login?next=devices%2Fapprove');
    expect(signInLink('security')).toBe('/login?next=security');
  });

  it('follows only known destinations and project paths after sign-in', () => {
    for (const [name, path] of Object.entries(accountPaths))
      expect(signInDestination(name)).toBe(path);
    const deep = `/projects/${project}/surfaces/${surface}`;
    expect(signInDestination(deep)).toBe(deep);
    for (const next of [
      null,
      '',
      'https://example.test/projects',
      '//example.test',
      '/settings/security',
      '/projects/east-chapel',
      'toString',
      '__proto__',
    ])
      expect(signInDestination(next), String(next)).toBe('/settings/security');
  });
});

describe('followLink', () => {
  afterEach(() => vi.unstubAllGlobals());
  const click = (init: Partial<MouseEvent>, link: Partial<HTMLAnchorElement> = {}) => {
    vi.stubGlobal('location', { origin: 'https://app.test' });
    let prevented = false;
    const event = {
      button: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...init,
      currentTarget: {
        pathname: '/projects/' + project,
        search: '',
        hash: '',
        target: '',
        origin: 'https://app.test',
        hasAttribute: () => false,
        ...link,
      },
      preventDefault: () => (prevented = true),
    } as unknown as MouseEvent & { currentTarget: HTMLAnchorElement };
    const visited: string[] = [];
    followLink(event, (href) => visited.push(href));
    return { prevented, visited };
  };

  it('navigates in the app on a plain left click', () => {
    expect(click({})).toEqual({ prevented: true, visited: ['/projects/' + project] });
  });

  it('leaves modified and non-primary clicks to the browser', () => {
    for (const init of [
      { button: 1 },
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
    ])
      expect(click(init)).toEqual({ prevented: false, visited: [] });
  });

  it('preserves return queries and section fragments', () => {
    expect(click({}, { pathname: '/login', search: '?next=profile', hash: '#help' })).toEqual({
      prevented: true,
      visited: ['/login?next=profile#help'],
    });
  });

  it('leaves external, download, new-tab, unknown and already handled links alone', () => {
    for (const link of [
      { origin: 'https://other.test' },
      { target: '_blank' },
      { hasAttribute: () => true },
      { pathname: '/api/v1/status' },
    ])
      expect(click({}, link)).toEqual({ prevented: false, visited: [] });
    expect(click({ defaultPrevented: true })).toEqual({ prevented: false, visited: [] });
  });
});
