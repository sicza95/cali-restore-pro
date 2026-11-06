import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  accountNavigationControls,
  languageControl,
  menuControl,
  signOutControl,
} from '../src/ui/account-access/navigation-controls';

const account = { id: 'm08-navigation', email: 'member@example.test' };
const byId = (id: string) => '[data-control-id="' + id + '"]';

test('navigation registry, capability changes, language, theme and Back', async ({
  page,
}, info) => {
  let capabilities = ['operations.view'];
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { account, capabilities } }),
  );
  await page.route('**/api/v1/admin/operations', (route) =>
    route.fulfill({ json: { mail: { pending: 0, sent: 0, failed: 0 }, audit: [], jobs: [] } }),
  );
  let accountReads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/admin/accounts') accountReads++;
  });

  await page.setViewportSize({ width: 1194, height: 834 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Mail queue' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toHaveCount(0);
  for (const control of accountNavigationControls) {
    const link = page.locator(byId(control.id));
    if (control.labelKey === 'login' || control.labelKey === 'register')
      await expect(link).toHaveCount(0);
    else await expect(link).toHaveAttribute('href', control.href);
  }
  await expect(page.locator(byId(signOutControl.id))).toBeVisible();
  await expect(page.locator(byId('app.nav.admin'))).toHaveAttribute('aria-current', 'page');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('admin-landscape-en-light.png') });

  await page.locator(byId('app.nav.preferences')).click();
  await page.getByLabel('Theme').selectOption('dark');
  await page.getByLabel('Reduce transparency').check();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible();
  await page.locator(byId(languageControl.id)).selectOption('hu');
  await page.locator(byId('app.nav.profile')).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fiókprofil');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beállítások');
  await expect(page.locator(byId('app.nav.preferences'))).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveAttribute('data-transparency', 'opaque');
  for (const viewport of [
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`preferences-${viewport.width}-hu-dark.png`) });
  }

  const menu = page.locator(byId(menuControl.id));
  const preferences = page.locator(byId('app.nav.preferences'));
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(preferences).toBeHidden();
  await menu.focus();
  await menu.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(preferences).toBeVisible();

  capabilities = [];
  await page.goBack();
  await expect(
    page.getByText('A fiók nem rendelkezik adminisztrációs jogosultsággal.'),
  ).toBeVisible();
  await expect(page.locator(byId('app.nav.admin'))).toHaveCount(0);
  expect(accountReads).toBe(0);
});

test('protected direct entries return through sign-in using only allowlisted destinations', async ({
  page,
}) => {
  let signedIn = false;
  await page.route('**/api/v1/auth/me', (route) =>
    signedIn
      ? route.fulfill({ json: { account, capabilities: [] } })
      : route.fulfill({ status: 401, json: { error: 'authentication_required' } }),
  );
  await page.route('**/api/v1/auth/login', (route) => {
    signedIn = true;
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/v1/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  for (const control of accountNavigationControls.filter(
    ({ labelKey }) => !['login', 'register', 'offline'].includes(labelKey),
  )) {
    await page.goto(control.href);
    await expect(page.getByText('Sign in to open this page.')).toBeVisible();
    await expect(page.locator(byId(control.id))).toHaveCount(0);
    await expect(page.locator(byId(signOutControl.id))).toHaveCount(0);
  }
  const submit = async () => {
    await page.getByLabel('Email address').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill('synthetic browser password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  };

  await page.goto('/devices/approve');
  await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
  await submit();
  await expect(page).toHaveURL(/\/devices\/approve$/);
  await expect(page.getByText('No vault on this browser')).toBeVisible();
  await expect(page.getByRole('link', { name: /Set up or restore a vault/ })).toHaveAttribute(
    'href',
    '/settings/security',
  );

  await page.goto('/login?next=https%3A%2F%2Fexample.test');
  await submit();
  await expect(page).toHaveURL(/\/settings\/security$/);
  await page.goto('/settings/unknown');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
});
