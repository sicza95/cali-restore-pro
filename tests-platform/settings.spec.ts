import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { account, capabilities: [], csrfToken: 'fixture' } }),
  );
  await page.route('**/api/v1/account/deletion-preflight', (route) =>
    route.fulfill({ json: { eligible: false, reason: 'project_continuity_unavailable' } }),
  );
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto('/settings/preferences');
  await page.getByLabel('Theme').selectOption('dark');
  await page.getByLabel('Reduce transparency').check();
  await page.getByLabel('Report language').selectOption('hu');
  await expect(page.getByLabel('Allow optional crash and performance reports')).not.toBeChecked();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveAttribute('data-transparency', 'opaque');
  await expect(page.getByLabel('Report language')).toHaveValue('hu');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('preferences-portrait-dark.png'), fullPage: true });
  await page.getByRole('link', { name: 'Account profile' }).click();
  await page.getByRole('button', { name: 'Check deletion eligibility' }).click();
  await expect(page.getByText(/Deletion is unavailable/)).toBeVisible();
  account = operator;
  await page.goto('/settings/preferences');
  await expect(page.getByLabel('Theme')).toHaveValue('system');
  await expect(page.getByLabel('Report language')).toHaveValue('en');
});

test('administration submits a confirmed grant and reloads the server values', async ({
  page,
}, info) => {
  let quota = 0;
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
  await page.route('**/api/v1/auth/confirm', (route) =>
    route.fulfill({ json: { csrfToken: 'rotated' } }),
  );
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
  await expect(save).toBeDisabled();
  await page.getByLabel('Current password').fill('synthetic browser password');
  await page.getByRole('button', { name: 'Confirm password' }).click();
  await page.getByLabel('Allow server features').check();
  await page.getByLabel('Hosting quota (MiB)').fill('128');
  await page.getByLabel('I confirm this security change.').check();
  await save.click();
  await expect(page.getByText('Signed-in sessions: 1 · Hosting quota (MiB): 128')).toBeAttached();
  await page.getByText(member.email).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('admin-landscape-light.png'), fullPage: true });
});
