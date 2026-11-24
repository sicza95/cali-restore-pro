import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import type {
  OrganisationDetail,
  OrganisationGroup,
  OrganisationOverview,
} from '../src/platform/api';
import { showAppNavigation } from './app-navigation';

const account = { id: '00000000-0000-4000-8000-0000000000a1', email: 'anna@example.test' };
const personalId = '00000000-0000-4000-8000-0000000000b1';
const acmeId = '00000000-0000-4000-8000-0000000000b2';
const byId = (id: string) => `[data-control-id="${id}"]`;
const sections = (level: 'none' | 'read' | 'write') =>
  Object.fromEntries(
    [
      'core',
      'client',
      'assessment',
      'photos',
      'scope-of-work',
      'pricing',
      'pricing-summary',
      'internal-notes',
      'admin',
    ].map((s) => [s, s === 'pricing-summary' && level === 'write' ? 'read' : level]),
  );

/**
 * An in-memory organisations API: the server's own rules are covered by the Go tests, so this
 * spec checks only what the screens send and show.
 */
function fakeServer() {
  const groups: OrganisationGroup[] = [
    {
      id: '00000000-0000-4000-8000-0000000000c1',
      name: 'Estimator',
      sections: sections('read'),
      actions: ['estimate.publish'],
      allProjects: false,
    },
  ];
  const detail: OrganisationDetail = {
    id: acmeId,
    name: 'Acme Restoration',
    personal: false,
    role: 'admin',
    memberCount: 1,
    members: [
      { id: account.id, name: 'Anna Kovács', email: account.email, role: 'admin', groups: [] },
    ],
    groups,
    invitations: [],
    projects: 0,
  };
  const overview: OrganisationOverview = {
    organisations: [{ id: personalId, name: '', personal: true, role: 'admin', memberCount: 1 }],
    invitations: [
      {
        id: '00000000-0000-4000-8000-0000000000d1',
        organisation: '00000000-0000-4000-8000-0000000000b9',
        name: 'Brown Builders',
        role: 'member',
        invitedBy: 'Bea Brown',
        expiresAt: '2026-12-08T10:00:00Z',
      },
    ],
  };
  const sent: { method: string; path: string; body: unknown }[] = [];
  const handle = async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const body = request.postDataJSON() as Record<string, unknown> | null;
    sent.push({ method: request.method(), path, body });
    if (path === '/organisations' && request.method() === 'POST') {
      overview.organisations.push({ ...detail, name: String(body?.name) });
      detail.name = String(body?.name);
      return route.fulfill({ json: { id: acmeId } });
    }
    if (path === '/organisations') return route.fulfill({ json: overview });
    if (path === `/organisations/${acmeId}` && request.method() === 'GET')
      return route.fulfill({ json: detail });
    if (path === `/organisations/${acmeId}/invitations`) {
      detail.invitations.push({
        id: '00000000-0000-4000-8000-0000000000e1',
        email: String(body?.email),
        role: 'member',
        groups: (body?.groups as string[]) ?? [],
        expiresAt: '2026-12-08T10:00:00Z',
      });
      return route.fulfill({ json: { ok: true } });
    }
    if (path.endsWith('/decline')) {
      overview.invitations = [];
      return route.fulfill({ json: { ok: true } });
    }
    if (path.startsWith(`/organisations/${acmeId}/groups/`)) {
      Object.assign(groups[0], body);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  };
  return { handle, sent };
}

async function signedIn(page: Page) {
  const server = fakeServer();
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { account: { ...account, name: 'Anna Kovács' }, csrfToken: 'fixture' },
    }),
  );
  await page.route('**/api/v1/organisation*/**', server.handle);
  await page.route('**/api/v1/organisations', server.handle);
  // The live stream sends one notice, then stays quiet (a long retry keeps it from reconnecting).
  let streams = 0;
  await page.route('**/api/v1/events', (route) => {
    streams++;
    const notice = { kind: 'invited', organisation: 'x', name: 'Brown Builders', who: 'Bea Brown' };
    return route.fulfill({
      headers: { 'Content-Type': 'text/event-stream' },
      body: `retry: 600000

event: organisations
data: ${JSON.stringify(notice)}

`,
    });
  });
  return Object.assign(server, { streams: () => streams });
}

test('organisation switcher, organisations page, groups, invitations and projects per organisation', async ({
  page,
}, info) => {
  const server = await signedIn(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/projects');

  // The top bar: the organisation as a link, then the person's name, then their photo.
  const switcher = page.locator(byId('app.nav.organisation'));
  await expect(switcher).toHaveText('Personal');
  await expect(page.getByText('Bea Brown invited you to join Brown Builders.')).toBeVisible();
  await expect(page.locator(byId('app.nav.account-menu'))).toContainText('Anna Kovács');
  const bar = await page
    .locator('.app-bar-end')
    .evaluate((el) =>
      [...el.querySelectorAll('.org-switcher-name, .account-menu-name, .profile-avatar')].map(
        (node) => node.getBoundingClientRect().left,
      ),
    );
  expect(bar).toEqual([...bar].sort((a, b) => a - b));
  // A link, not a bordered button.
  expect(await switcher.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px');

  // A project made now belongs to the personal organisation.
  await page.getByLabel('Project name').fill('Smith house');
  await page.locator(byId('projects.create')).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

  // The sidebar has Organisations and Settings.
  await showAppNavigation(page);
  await expect(page.locator(byId('app.nav.settings'))).toHaveAttribute('href', '/settings/account');
  await page.locator(byId('app.nav.organisations')).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Organisations');
  await expect(page.locator(byId('app.nav.organisations'))).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Brown Builders', { exact: true })).toBeVisible();
  // A live notice: a toast says who invited you, and the sidebar counts invitations waiting.
  // Chrome reconnects once after the mocked stream ends; the real stream stays open.
  expect(server.streams()).toBeGreaterThan(0);
  await expect(page.locator(byId('app.nav.organisations'))).toContainText('1');
  await expect(page.locator(byId('app.nav.organisations'))).toHaveAccessibleName(
    /^Organisations.*1 invitation waiting$/,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('organisations-1194.png') });
  await page.locator(byId('org.invitation.decline')).click();
  await expect(page.getByText('Invitation declined.')).toBeVisible();
  await expect(page.getByText('No invitations waiting.')).toBeVisible();

  // Create an organisation: it opens, and the top bar switches to it.
  await page.locator(byId('org.create.open')).click();
  await page.locator(byId('org.create.name')).fill('Acme Restoration');
  await page.locator(byId('org.create')).click();
  await expect(page).toHaveURL(`/organisations/${acmeId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Acme Restoration');
  await expect(switcher).toHaveText('Acme Restoration');
  expect(server.sent.find((r) => r.method === 'POST' && r.path === '/organisations')?.body).toEqual(
    {
      name: 'Acme Restoration',
      language: 'en',
    },
  );

  // Invite someone with a group.
  await page.locator(byId('org.invite.open')).click();
  await page.locator(byId('org.invite.email')).fill('bob@example.test');
  await page.locator('#invite').getByLabel('Estimator').check();
  await page.locator(byId('org.invite.send')).click();
  await expect(page.getByText('Waiting for an answer')).toBeVisible();
  expect(server.sent.find((r) => r.path.endsWith('/invitations'))?.body).toEqual({
    email: 'bob@example.test',
    role: 'member',
    groups: ['00000000-0000-4000-8000-0000000000c1'],
  });

  // A group: one level per part of a project; reading pricing also reads the quote summary.
  const estimator = page.locator('#group-00000000-0000-4000-8000-0000000000c1');
  await estimator.locator(byId('org.group.open')).click();
  await estimator.locator(byId('org.group.section.pricing')).selectOption('write');
  await estimator.locator(byId('org.group.action.project.export')).check();
  await estimator.locator(byId('org.group.save')).click();
  await expect(page.getByText('Group saved.')).toBeVisible();
  const saved = server.sent.find((r) => r.method === 'PUT')?.body as OrganisationGroup;
  expect(saved.sections.pricing).toBe('write');
  expect(saved.actions).toEqual(['estimate.publish', 'project.export']);
  await expect(
    estimator.locator(byId('org.group.section.pricing-summary')).locator('option'),
  ).toHaveCount(2);
  // The toast fades in; close it so the contrast check sees the page.
  await page.locator(byId('app.toast.close')).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // The project list follows the organisation chosen in the top bar.
  await page.locator(byId('app.nav.projects')).click();
  await expect(page.getByText('Smith house')).toHaveCount(0);
  await switcher.click();
  await expect(page.locator('#organisation-menu')).toBeVisible();
  await expect(
    page.locator(byId('app.nav.organisation.choice')).filter({ hasText: 'Acme Restoration' }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.locator(byId('app.nav.organisation.choice')).filter({ hasText: 'Personal' }).click();
  await expect(switcher).toHaveText('Personal');
  await expect(page.getByText('Smith house')).toBeVisible();
  await expect(switcher).toBeFocused();

  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto(`/organisations/${acmeId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Acme Restoration');
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 834);
  await page.screenshot({ path: info.outputPath('organisation-834.png'), fullPage: true });
});
