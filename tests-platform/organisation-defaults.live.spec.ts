import { expect, test } from '@playwright/test';
import type { OrganisationOverview } from '../src/platform/api';
import { openSetting } from './app-navigation';
import { createProjectViaBrowser, inspect, runItemAction } from './project-browser';

test('real organisation defaults persist across browsers and feed project inheritance', async ({
  browser,
  baseURL,
}) => {
  test.skip(
    process.env.IDENTITY_SMOKE_DISPOSABLE !== '1' || !process.env.M06_OWNER_SESSION,
    'Requires synthetic sessions on an explicitly disposable stack',
  );
  test.setTimeout(90000);
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
    throw new Error('Loopback target required');
  const owner = await browser.newContext({ baseURL });
  const second = await browser.newContext({ baseURL });
  try {
    for (const context of [owner, second])
      await context.addCookies([
        { name: 'calirestore_session', value: process.env.M06_OWNER_SESSION!, url: baseURL },
      ]);
    const session = (await (await owner.request.get('/api/v1/auth/me')).json()) as {
      csrfToken: string;
    };
    const headers = { Origin: baseURL, 'X-CSRF-Token': session.csrfToken };
    const created = await owner.request.post('/api/v1/organisations', {
      headers,
      data: { name: 'Defaults test organisation', language: 'en' },
    });
    expect(created.status()).toBe(200);
    const { id } = (await created.json()) as { id: string };
    const page = await owner.newPage();
    await page.goto(`/organisations/${id}`);
    const measurement = await openSetting(page, 'measurement');
    await measurement.getByRole('radio', { name: 'Imperial', exact: true }).check();
    await expect(page.locator('.org-defaults')).toHaveAttribute('aria-busy', 'false');
    await page.locator('[data-control-id="preferences.currency"]').click();
    await page.getByRole('option', { name: 'EUR', exact: true }).click();
    await expect(page.locator('.org-defaults')).toHaveAttribute('aria-busy', 'false');
    const studio = await openSetting(page, 'studio');
    await studio.locator('input').fill('Organisation studio');
    await studio.locator('input').blur();
    await expect(page.locator('.org-defaults')).toHaveAttribute('aria-busy', 'false');
    const another = await second.newPage();
    await another.goto(`/organisations/${id}`);
    await expect(another.locator('#currency .settings-select-trigger')).toContainText('EUR');
    await expect(another.locator('#studio summary')).toContainText('Organisation studio');
    const overview = (await (
      await second.request.get('/api/v1/organisations')
    ).json()) as OrganisationOverview;
    expect(overview.organisations.find((org) => org.id === id)?.defaults?.restoration.units).toBe(
      'imperial',
    );
    const personal = overview.organisations.find((org) => org.personal)!;
    await another.goto(`/organisations/${personal.id}`);
    await expect(another.locator('#studio summary')).not.toContainText('Organisation studio');
    await page.locator('[data-control-id="org.select"]').click();
    await createProjectViaBrowser(page, 'Organisation defaults project');
    await page.goto('/projects');
    await inspect(page, 'Organisation defaults project');
    await runItemAction(page, 'manage');
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('[data-control-id$=".restoration.units"]')).toHaveValue('imperial');
    await expect(dialog.locator('[data-control-id$=".restoration.currency"]')).toHaveValue('EUR');
    await expect(dialog.locator('[data-control-id$=".branding.studio"]')).toHaveValue(
      'Organisation studio',
    );
    await expect(dialog.getByText('Inherited from Organisation').first()).toBeVisible();
    const invalid = await owner.request.patch(`/api/v1/organisations/${id}/defaults`, {
      headers,
      data: { restoration: { snap: true } },
    });
    expect(invalid.status()).toBe(400);
  } finally {
    await owner.close();
    await second.close();
  }
});
