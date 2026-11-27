import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openAccountMenu, openSetting } from './app-navigation';

const member = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'member@example.test',
  state: 'active',
  role: 'member',
};
const operator = {
  ...member,
  id: '00000000-0000-4000-8000-000000000002',
  email: 'operator@example.test',
  role: 'superuser',
};

test('settings survive reload and stay isolated by account', async ({ page }, info) => {
  let account = member;
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/v1/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/api/v1/auth/passkeys', (route) =>
    route.fulfill({ json: { available: true, passkeys: [] } }),
  );
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { account, capabilities: [], csrfToken: 'fixture' } }),
  );
  await page.route('**/api/v1/account/deletion-preflight', (route) =>
    route.fulfill({ json: { eligible: false, reason: 'hosted_projects_require_continuity' } }),
  );
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto('/settings/preferences');
  const settingsRows = page.locator(
    '.settings-page .settings-option > summary, .settings-page .settings-toggle-row, .settings-page .settings-select-trigger',
  );
  await expect(settingsRows.first()).toBeVisible();
  expect(await settingsRows.count()).toBeGreaterThan(10);
  expect(
    await settingsRows.evaluateAll((rows) =>
      rows.every((row) => row.querySelector('.settings-option-icon .cr-icon')),
    ),
  ).toBe(true);
  await expect(page.locator('.settings-static .settings-option-icon')).toHaveCount(0);
  // The theme is chosen in the account menu and applies at once.
  await openAccountMenu(page);
  await page.locator('[data-control-id="app.menu.theme"]').click();
  await page.locator('[data-control-id="app.menu.theme.dark"]').click();
  await page.keyboard.press('Escape');
  // Each setting is its own row and is saved as soon as it changes.
  await page.getByRole('switch', { name: 'Reduce transparency' }).check();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await expect(
    page.locator('#defaults, #report-branding, #measurement, #currency, #report-language'),
  ).toHaveCount(0);
  await page.getByRole('switch', { name: 'Snap drawing points' }).check();
  await expect(
    page.getByRole('switch', { name: 'Allow optional crash and performance reports' }),
  ).not.toBeChecked();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveAttribute('data-transparency', 'opaque');
  await expect(page.getByRole('switch', { name: 'Snap drawing points' })).toBeChecked();
  expect(
    await page.locator('.settings-toggle-row').evaluateAll((rows) =>
      rows.every((row) => {
        const title = row.querySelector('.settings-option-text')!.getBoundingClientRect();
        const toggle = row.querySelector('.cr-switch-track')!.getBoundingClientRect();
        return title.right < toggle.left;
      }),
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => {
    document.querySelector('.account-content')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: info.outputPath('preferences-portrait-dark.png'), fullPage: true });
  await page.evaluate(() => document.fonts.ready);
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(viewport);
    for (const section of ['appearance', 'drawing-preferences']) {
      await page.locator('#' + section).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`settings-icons-${section}-${viewport.width}.png`),
      });
    }
  }
  await (
    await openSetting(page, 'delete-account')
  )
    .getByRole('button', { name: 'Check deletion eligibility' })
    .click();
  await expect(page.getByText(/Transfer hosting and resolve last-owner projects/)).toBeVisible();
  account = operator;
  await page.goto('/settings/preferences');
  await expect(page.locator('body')).not.toHaveAttribute('data-theme', 'dark');
  await openAccountMenu(page);
  await expect(page.locator('[data-control-id="app.menu.theme"]')).toContainText('Follow device');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('switch', { name: 'Snap drawing points' })).not.toBeChecked();
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator('#profile').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`settings-icons-profile-${viewport.width}.png`),
    });
  }
});

test('administration submits a confirmed grant and reloads the server values', async ({
  page,
}, info) => {
  let quota = 0;
  // The first try is refused for want of a recent confirmation; "Confirm it's you" then retries.
  let confirmedOnce = false;
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: operator,
        capabilities: ['accounts.view', 'accounts.entitlements', 'operations.view'],
        csrfToken: quota ? 'rotated' : 'fixture',
      },
    }),
  );
  await page.route('**/api/v1/auth/confirm', (route) => {
    confirmedOnce = true;
    return route.fulfill({ json: { csrfToken: 'rotated' } });
  });
  await page.route('**/api/v1/admin/accounts?**', (route) =>
    route.fulfill({
      json: {
        accounts: [
          { ...member, quotaMiB: quota, serverFeatures: quota > 0, sessions: 1, permissions: 0 },
        ],
        next: '',
      },
    }),
  );
  await page.route('**/api/v1/admin/operations', (route) =>
    route.fulfill({ json: { mail: { pending: 0, sent: 2, failed: 0 }, audit: [], jobs: [] } }),
  );
  await page.route('**/api/v1/admin/accounts/*/controls', (route) => {
    if (!confirmedOnce)
      return route.fulfill({ status: 403, json: { error: 'credential_confirmation_required' } });
    expect(route.request().headers()['x-csrf-token']).toBe('rotated');
    expect(route.request().postDataJSON()).toEqual({
      confirm: true,
      entitlement: { serverFeatures: true, quotaMiB: 128 },
    });
    quota = 128;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/admin');
  await page.getByText(member.email).click();
  const save = page.getByRole('button', { name: 'Save feature grant and quota' });
  await page.getByLabel('Allow server features').check();
  await page.getByLabel('Hosting quota (MiB)').fill('128');
  await page.getByLabel('I confirm this security change.').check();
  await save.click();
  const dialog = page.getByRole('dialog', { name: 'Confirm it’s you' });
  await dialog.getByLabel('Current password').fill('synthetic browser password');
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Signed-in sessions: 1 · Hosting quota (MiB): 128')).toBeAttached();
  await page.getByText(member.email).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('admin-landscape-light.png'), fullPage: true });
});

test('a superuser explicitly confirms forced deletion after a blocked preflight', async ({
  page,
}, info) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: operator,
        capabilities: ['accounts.view', 'roles.manage'],
        csrfToken: 'fixture',
      },
    }),
  );
  await page.route('**/api/v1/admin/accounts?**', (route) =>
    route.fulfill({
      json: {
        accounts: [{ ...member, quotaMiB: 0, serverFeatures: false, sessions: 1, permissions: 0 }],
        next: '',
      },
    }),
  );
  await page.route('**/api/v1/admin/accounts/*/deletion-preflight', (route) =>
    route.fulfill({
      json: { eligible: false, reason: 'hosted_projects_require_continuity', forceEligible: true },
    }),
  );
  await page.route('**/api/v1/admin/accounts/*/deletion', (route) => {
    expect(route.request().postDataJSON()).toEqual({ confirm: true, force: true, purge: false });
    return route.fulfill({
      json: {
        id: member.id,
        recoverUntil: '2026-12-06T18:00:00Z',
        backupExpiresAt: '2027-02-04T18:00:00Z',
      },
    });
  });
  await page.goto('/admin');
  await page.getByText(member.email).click();
  await page.getByRole('button', { name: 'Check deletion eligibility' }).click();
  await expect(page.getByText(/Sole-owner projects are frozen/)).toBeVisible();
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByText(/Sole-owner projects are frozen/).scrollIntoViewIfNeeded();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    await page.screenshot({ path: info.outputPath(`forced-deletion-${viewport.width}.png`) });
  }
  const submit = page.getByRole('button', { name: 'Force account deletion' });
  await submit.click();
  await expect(page.getByText(/Live recovery deadline/)).toHaveCount(0);
  await page.getByLabel('I confirm forced deletion.').check();
  await submit.click();
  await expect(page.getByText(/Live recovery deadline/)).toBeVisible();
});
