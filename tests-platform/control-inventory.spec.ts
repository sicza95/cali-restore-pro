import { expect, test } from '@playwright/test';
import { applicationControls } from '../src/ui/account-access/application-controls';
import {
  accountDestinations,
  accountRoute,
  signInDestination,
} from '../src/ui/account-access/routes';
import { publicRoutes } from '../src/ui/account-access/constants';
import { projectHref, projectReviewHref } from '../src/ui/account-access/projects/project-route';
import { toolRailRegistry } from '../src/ui/controls/tool-rail/constants';

test('application and Storybook control contracts are unique and populated', () => {
  const all = [...applicationControls, ...toolRailRegistry];
  expect(new Set(all.map(({ id }) => id)).size).toBe(all.length);
  for (const control of all) {
    expect(control.id).toMatch(/^[a-z][\w-]*(?:\.[\w-]+)+$/);
    expect(control.owner).toMatch(/^M-\d{2}$/);
    for (const value of [
      control.labelKey,
      control.helpKey,
      control.command,
      control.permission,
      control.prerequisite,
      control.valueSource,
      control.composition,
      ...Object.values(control.unavailable),
    ]) {
      expect(value.trim(), control.id).not.toBe('');
    }
  }
});

test('documented account and project entries use the canonical matcher', () => {
  for (const [route, path] of Object.entries(accountDestinations))
    expect(accountRoute(path)).toBe(route);
  for (const route of publicRoutes) expect(accountRoute('/' + route)).toBe(route);
  expect(accountRoute('/login')).toBe('login');
  expect(accountRoute('/')).toBe('login');

  const project = '00000000-0000-4000-8000-000000000001';
  const surface = '00000000-0000-4000-8000-000000000002';
  const paths = [
    projectHref(),
    projectHref(project),
    projectHref(project, surface),
    ...(['estimates', 'reports', 'outputs'] as const).map((key) => projectReviewHref(project, key)),
  ];
  for (const path of paths) {
    expect(accountRoute(path)).toBe('projects');
    expect(signInDestination(path)).toBe(path);
  }
  for (const path of ['/projects/east-chapel', projectHref(project) + '/surfaces/north-wall']) {
    expect(accountRoute(path)).toBe('notFound');
    expect(signInDestination(path)).toBe(accountDestinations.security);
  }
});
