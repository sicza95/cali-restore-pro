import { expect, test, type Page } from '@playwright/test';
import { showAppNavigation } from './app-navigation';

const account = { id: 'account-navigation', email: 'navigation@example.test' };
const marker = 'same-document';
const mark = (page: Page) =>
  page.locator('html').evaluate((el, value) => {
    el.setAttribute('data-navigation-marker', value);
  }, marker);
const sameDocument = (page: Page) =>
  expect(page.locator('html')).toHaveAttribute('data-navigation-marker', marker);
const visit = async (page: Page, name: string) => {
  await showAppNavigation(page);
  await page.locator('#app-navigation').getByRole('link', { name, exact: true }).click();
};

test('account and app links, inline security, drawer and history retain the document', async ({
  page,
}) => {
  let sessions = 0;
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { account, csrfToken: 'fixture' } }),
  );
  await page.route('**/api/v1/auth/sessions', (route) => {
    sessions++;
    return route.fulfill({ json: { sessions: [] } });
  });
  await page.route('**/api/v1/auth/confirm', (route) =>
    route.fulfill({ json: { csrfToken: 'confirmed' } }),
  );
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/projects');
  await expect(page.getByText('No vault on this browser')).toBeVisible();
  await mark(page);
  await visit(page, 'Account profile');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Account profile');
  await page.getByRole('main').getByRole('link', { name: 'Account security' }).click();
  await expect(page.getByLabel('Current password')).toBeVisible();
  await expect.poll(() => sessions).toBe(1);
  await page.getByLabel('Current password').fill('synthetic password');
  await page.getByRole('button', { name: 'Confirm password', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 834, height: 1194 });
  await visit(page, 'Preferences');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preferences');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText(/Password confirmed\./)).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel('Current password')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeDisabled();
  await expect.poll(() => sessions).toBe(2);
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preferences');
  await visit(page, 'Projects');
  await expect(page.getByText('No vault on this browser')).toBeVisible();
  await visit(page, 'Offline originals');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Offline originals');
  await page.getByRole('link').click();
  await expect(page).toHaveURL(/\/invitations$/);
  await sameDocument(page);
});

test('sign-in keeps next and returns to a project deep link without loading another document', async ({
  page,
}) => {
  let signedIn = false;
  await page.route('**/api/v1/auth/me', (route) =>
    signedIn
      ? route.fulfill({ json: { account, csrfToken: 'fixture' } })
      : route.fulfill({ status: 401, json: { error: 'authentication_required' } }),
  );
  await page.route('**/api/v1/auth/login', (route) => {
    signedIn = true;
    return route.fulfill({ json: {} });
  });
  const deep = '/projects/00000000-0000-4000-8000-000000000045/reports';
  await page.goto(deep);
  await expect(page.getByText('Sign in to open this page.')).toBeVisible();
  await mark(page);
  await page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/login\\?next=' + encodeURIComponent(deep)));
  await page.getByLabel('Email address', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(deep + '$'));
  await expect(page.getByText('No vault on this browser')).toBeVisible();
  await sameDocument(page);
});

test('Back and Forward recheck expired sessions and fail closed when the check is unavailable', async ({
  page,
}) => {
  let state = 'signed-in';
  await page.route('**/api/v1/auth/me', (route) =>
    state === 'signed-in'
      ? route.fulfill({ json: { account } })
      : route.fulfill({
          status: state === 'expired' ? 401 : 503,
          json: { error: state === 'expired' ? 'authentication_required' : 'unavailable' },
        }),
  );
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/settings/account');
  await expect(page.getByText(account.email, { exact: true })).toBeVisible();
  await mark(page);
  await visit(page, 'Preferences');
  await expect(page.getByLabel('Theme')).toBeVisible();
  state = 'expired';
  await page.goBack();
  await expect(page.getByText('Sign in to open this page.')).toBeVisible();
  await expect(page.getByText(account.email, { exact: true })).toHaveCount(0);
  state = 'unavailable';
  await page.goForward();
  await expect(page.locator('[data-control-id="app.session.retry"]')).toBeVisible();
  await expect(page.getByLabel('Theme')).toHaveCount(0);
  await sameDocument(page);
});

test('public inline links reset forms and never reuse an email token on history traversal', async ({
  page,
}) => {
  const token = 'a'.repeat(43);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'authentication_required' } }),
  );
  await page.route('**/api/v1/auth/verify-email', (route) => {
    expect(route.request().postDataJSON()).toEqual({ token });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/verify-email#token=' + token);
  await expect(page).toHaveURL(/\/verify-email$/);
  await mark(page);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Done.' })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('secret to discard');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reset access');
  await page.goBack();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.goBack();
  await expect(page.getByText('Open the link from your email to continue.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
  await sameDocument(page);
});

test('a delayed password confirmation cannot enable controls after leaving and returning', async ({
  page,
}) => {
  let confirming = false;
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { account, csrfToken: 'fixture' } }),
  );
  await page.route('**/api/v1/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/api/v1/auth/confirm', async (route) => {
    confirming = true;
    await pending;
    await route.fulfill({ json: { csrfToken: 'confirmed' } });
  });
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/settings/security');
  await page.getByLabel('Current password').fill('synthetic password');
  await page.getByRole('button', { name: 'Confirm password', exact: true }).click();
  await expect.poll(() => confirming).toBe(true);
  await visit(page, 'Preferences');
  await expect(page.getByLabel('Theme')).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Current password')).toHaveValue('');
  release();
  await expect(page.getByRole('button', { name: 'Confirm password', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeDisabled();
  await expect(page.getByText(/Password confirmed\./)).toHaveCount(0);
});

test('an email fragment opened on the same page is consumed once across history and hash events', async ({
  page,
}) => {
  const token = 'b'.repeat(43);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'authentication_required' } }),
  );
  await page.route('**/api/v1/auth/verify-email', (route) => {
    expect(route.request().postDataJSON()).toEqual({ token });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/verify-email');
  await expect(page.getByText('Open the link from your email to continue.')).toBeVisible();
  await mark(page);
  await page.goto('/verify-email#token=' + token);
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Done.' })).toBeVisible();
  await sameDocument(page);
});

test('a delayed admin authentication failure cannot sign out a different account', async ({
  page,
}) => {
  const other = { id: 'account-b', email: 'other@example.test' };
  let current: typeof account | undefined = account;
  let requested = false;
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/auth/me', (route) =>
    current
      ? route.fulfill({
          json: { account: current, csrfToken: 'fixture', capabilities: ['operations.view'] },
        })
      : route.fulfill({ status: 401, json: { error: 'authentication_required' } }),
  );
  await page.route('**/api/v1/admin/operations', async (route) => {
    if (requested) {
      await route.fulfill({
        json: { mail: { pending: 0, sent: 0, failed: 0 }, audit: [], jobs: [] },
      });
      return;
    }
    requested = true;
    await pending;
    await route.fulfill({ status: 401, json: { error: 'authentication_required' } });
  });
  await page.route('**/api/v1/auth/logout', (route) => {
    current = undefined;
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/v1/auth/login', (route) => {
    current = other;
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/v1/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/admin');
  await expect.poll(() => requested).toBe(true);
  await page.locator('[data-control-id="app.nav.sign-out"]').click();
  await expect(page.getByText('Sign in to open this page.')).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('Email address', { exact: true }).fill(other.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await visit(page, 'Account profile');
  await expect(page.getByText(other.email, { exact: true })).toBeVisible();
  const response = page.waitForResponse(
    (response) => response.url().endsWith('/admin/operations') && response.status() === 401,
  );
  release();
  await response;
  await expect(page.getByText(other.email, { exact: true })).toBeVisible();
  await expect(page.getByText('Sign in to open this page.')).toHaveCount(0);
});

test('a delayed failure after navigation does not show an error or clear the session', async ({
  page,
}) => {
  let requested = false;
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { account, csrfToken: 'fixture' } }),
  );
  await page.route('**/api/v1/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/api/v1/auth/confirm', async (route) => {
    requested = true;
    await pending;
    await route.fulfill({ status: 401, json: { error: 'authentication_required' } });
  });
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/settings/security');
  await page.getByLabel('Current password').fill('synthetic password');
  await page.getByRole('button', { name: 'Confirm password', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await visit(page, 'Account profile');
  await expect(page.getByText(account.email, { exact: true })).toBeVisible();
  const response = page.waitForResponse((response) => response.url().endsWith('/auth/confirm'));
  release();
  await response;
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(account.email, { exact: true })).toBeVisible();
});

test('a delayed response cannot replace the CSRF token of a refreshed session', async ({
  page,
}) => {
  let requested = false;
  let token = '';
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { account, csrfToken: 'current' } }),
  );
  await page.route('**/api/v1/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/api/v1/auth/confirm', async (route) => {
    if (!requested) {
      requested = true;
      await pending;
      await route.fulfill({ json: { csrfToken: 'stale' } });
    } else {
      token = route.request().headers()['x-csrf-token'];
      await route.fulfill({ json: {} });
    }
  });
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/settings/security');
  await page.getByLabel('Current password').fill('synthetic password');
  await page.getByRole('button', { name: 'Confirm password', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await visit(page, 'Preferences');
  await expect(page.getByLabel('Theme')).toBeVisible();
  await visit(page, 'Account security');
  await expect(page.getByLabel('Current password')).toBeVisible();
  const response = page.waitForResponse((response) => response.url().endsWith('/auth/confirm'));
  release();
  await response;
  await page.getByLabel('Current password').fill('synthetic password');
  await page.getByRole('button', { name: 'Confirm password', exact: true }).click();
  await expect.poll(() => token).toBe('current');
});
