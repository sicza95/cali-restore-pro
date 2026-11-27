import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  accountNavigationControls,
  menuControl,
  signOutControl,
} from '../src/ui/account-access/navigation-controls';
import { openAccountMenu, openSetting } from './app-navigation';

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
  await expect(page.locator(byId('app.nav.account-menu'))).toBeVisible();
  await expect(page.locator(byId('app.nav.profile'))).toHaveCount(0);
  await expect(page.locator(byId('app.nav.security'))).toHaveCount(0);
  await expect(page.locator(byId('app.nav.preferences'))).toHaveCount(0);
  await expect(page.locator(byId('app.nav.admin'))).toHaveAttribute('aria-current', 'page');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('admin-landscape-en-light.png') });

  // Settings opens from the account menu's Profile; Appearance is a section of the same page.
  await openAccountMenu(page);
  await page.locator(byId('app.menu.profile')).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  // The theme lives in the account menu, as a submenu, and applies at once.
  await openAccountMenu(page);
  await page.locator(byId('app.menu.theme')).click();
  await expect(page.locator(byId('app.menu.theme.system'))).toHaveAttribute('aria-checked', 'true');
  await page.locator(byId('app.menu.theme.dark')).click();
  await expect(page.locator(byId('app.menu.theme'))).toContainText('Dark');
  await page.keyboard.press('Escape');
  await expect(page.locator('details#theme summary')).toContainText('Dark');
  await page.getByRole('switch', { name: 'Reduce transparency' }).check();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  // Language from the Appearance section.
  await (
    await openSetting(page, 'language')
  )
    .getByRole('radio', { name: 'Magyar', exact: true })
    .check();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beállítások');
  await page.locator(byId('app.nav.libraries')).click();
  await expect(page.locator(byId('app.nav.libraries'))).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beállítások');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveAttribute('data-transparency', 'opaque');
  for (const viewport of [{ width: 834, height: 1194 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`settings-${viewport.width}-hu-dark.png`) });
  }

  // The account menu works from the keyboard: open on Enter, arrows move, Escape returns.
  const avatar = page.locator(byId('app.nav.account-menu'));
  await avatar.focus();
  await avatar.press('Enter');
  await expect(page.locator('#account-menu')).toBeVisible();
  await expect(page.locator(byId('app.menu.theme'))).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(byId('app.menu.language'))).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator(byId(signOutControl.id))).toBeFocused();
  // The menu fades in; check contrast once it is fully shown.
  await page
    .locator('#account-menu')
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('account-menu-834-hu-dark.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#account-menu')).toHaveCount(0);
  await expect(avatar).toBeFocused();

  // The sidebar stays pinned until switched off; then it floats in at the left edge.
  const toggle = page.locator(byId(menuControl.id));
  const preferences = page.locator(byId('app.nav.libraries'));
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(preferences).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(preferences).toHaveCount(0);
  await page.mouse.move(400, 600);
  await page.mouse.move(4, 600);
  await expect(page.locator('.app-sidebar[data-floating]')).toBeVisible();
  await expect(preferences).toBeVisible();
  await page.screenshot({ path: info.outputPath('sidebar-floating-834.png') });
  await page.mouse.move(600, 600);
  await expect(preferences).toHaveCount(0);
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
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
  await page.route('**/api/v1/auth/passkeys', (route) =>
    route.fulfill({ json: { available: true, passkeys: [] } }),
  );
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
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Password', { exact: true }).fill('synthetic browser password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  };

  await page.goto('/invitations');
  await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
  await submit();
  await expect(page).toHaveURL(/\/invitations$/);

  await page.goto('/login?next=https%3A%2F%2Fexample.test');
  await submit();
  await expect(page).toHaveURL(/\/settings\/security$/);
  await page.goto('/settings/unknown');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
});
