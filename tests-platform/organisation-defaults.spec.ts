import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type {
  OrganisationDefaults,
  OrganisationDefaultsPatch,
  OrganisationDetail,
} from '../src/platform/api';
import { verifyMeasurementPreferences } from './settings-measurement';
import { verifySettingsDropdowns } from './settings-dropdowns';
import { openSetting } from './app-navigation';
import { preferenceDefaults } from '../src/ui/settings/preferences/utils';

const account = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'member@example.test',
  state: 'active',
  role: 'member',
};
const personalId = '00000000-0000-4000-8000-000000000011';
const teamId = '00000000-0000-4000-8000-000000000012';
const base = (): OrganisationDefaults => ({
  restoration: { units: 'metric', areaUnit: null, currency: 'HUF', reportLanguage: 'en' },
  branding: { studio: '', contact: '', footer: '', accent: preferenceDefaults.accent, logo: '' },
});

test('organisation defaults move out of Settings, isolate Personal, and enforce admin editing', async ({
  page,
}, info) => {
  const personal: OrganisationDetail = {
    id: personalId,
    name: '',
    personal: true,
    role: 'admin',
    memberCount: 1,
    members: [],
    groups: [],
    invitations: [],
    projects: 0,
  };
  const team: OrganisationDetail = { ...personal, id: teamId, name: 'Team', personal: false };
  const organisations = [personal, team];
  let fail = false;
  const writes: { id: string; body: OrganisationDefaultsPatch }[] = [];
  await page.addInitScript(
    ({ account }) => {
      if (!localStorage.getItem('legacy-seeded')) {
        localStorage.setItem(
          `cr-preferences:${account}`,
          JSON.stringify({ studio: 'Personal studio' }),
        );
        localStorage.setItem('legacy-seeded', 'true');
      }
    },
    { account: account.id },
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { account, csrfToken: 'fixture', capabilities: [] } }),
  );
  await page.route('**/api/v1/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/api/v1/auth/passkeys', (route) =>
    route.fulfill({ json: { available: true, passkeys: [] } }),
  );
  await page.route('**/api/v1/events', (route) =>
    route.fulfill({ headers: { 'Content-Type': 'text/event-stream' }, body: 'retry: 600000\n\n' }),
  );
  await page.route('**/api/v1/organisations', (route) =>
    route.fulfill({ json: { organisations, invitations: [] } }),
  );
  await page.route('**/api/v1/organisations/**', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const org = organisations.find((entry) => entry.id === parts[4]);
    if (!org) return route.fulfill({ status: 404, json: { error: 'not_found' } });
    if (route.request().method() === 'GET') return route.fulfill({ json: org });
    if (org.role !== 'admin') return route.fulfill({ status: 403, json: { error: 'forbidden' } });
    if (fail) return route.fulfill({ status: 503, json: { error: 'unavailable' } });
    const body = route.request().postDataJSON() as OrganisationDefaultsPatch;
    writes.push({ id: org.id, body });
    const current = org.defaults ?? (org.personal ? body.initial : undefined) ?? base();
    org.defaults = {
      restoration: { ...current.restoration, ...body.restoration },
      branding: { ...current.branding, ...body.branding },
    };
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/settings/preferences');
  await expect(page.locator('#appearance')).toBeVisible();
  await expect(
    page.locator('#defaults, #report-branding, #measurement, #currency, #report-language'),
  ).toHaveCount(0);
  await page.getByRole('switch', { name: 'Snap drawing points' }).check();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Snap drawing points' })).toBeChecked();
  await page.goto(`/organisations/${personalId}`);
  await expect(page.locator('#defaults')).toBeVisible();
  await expect(page.locator('#snap')).toHaveCount(0);
  await expect(page.locator('#studio summary')).toContainText('Personal studio');
  await verifyMeasurementPreferences(page, info);
  await verifySettingsDropdowns(page, info);
  expect(personal.defaults?.branding.studio).toBe('Personal studio');
  expect(team.defaults).toBeUndefined();
  expect(writes[0].body.initial?.branding.studio).toBe('Personal studio');
  await page.goto(`/organisations/${teamId}`);
  await expect(page.locator('#studio summary')).toContainText('Not set');
  await page.locator('[data-control-id="preferences.currency"]').click();
  await page.getByRole('option', { name: 'EUR', exact: true }).click();
  await expect.poll(() => team.defaults?.restoration.currency).toBe('EUR');
  const studio = await openSetting(page, 'studio');
  await studio.locator('input').fill('Team studio');
  await studio.locator('input').blur();
  await expect.poll(() => team.defaults?.branding.studio).toBe('Team studio');
  await expect(page.locator('#studio summary')).toContainText('Team studio');
  expect(personal.defaults?.branding.studio).toBe('Personal studio');
  fail = true;
  await studio.locator('input').fill('Failed update');
  await studio.locator('input').blur();
  await expect(page.getByRole('alert')).toContainText('could not be saved');
  await expect(studio.locator('input')).toHaveValue('Team studio');
  await page.locator('[data-control-id="app.toast.close"]').click();
  fail = false;
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(viewport);
    for (const section of ['defaults', 'report-branding']) {
      await page.locator(`#${section}`).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`organisation-${section}-${viewport.width}.png`),
      });
    }
  }
  team.role = 'member';
  const before = writes.length;
  await page.reload();
  await expect(page.locator('#defaults')).toBeVisible();
  await expect(page.locator('[data-control-id="preferences.currency"]')).toBeDisabled();
  await openSetting(page, 'measurement');
  await expect(
    page.locator('[data-control-id="preferences.measurement-units.imperial"]'),
  ).toBeDisabled();
  await openSetting(page, 'studio');
  await expect(page.locator('#studio input')).toBeDisabled();
  expect(writes.length).toBe(before);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto('/settings/preferences');
  await expect(page.getByRole('switch', { name: 'Snap drawing points' })).toBeChecked();
});
