import { expect, test, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('auth routes, localization, missing and invalid links remain accessible', async ({
  page,
}, info) => {
  for (const route of [
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/confirm-email',
  ]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.goto('/verify-email#token=' + 'a'.repeat(43));
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('invalid, expired or already used');
  await page.goto('/register');
  await page.getByRole('combobox').selectOption('hu');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fiók létrehozása');
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`register-hu-${viewport.width}.png`) });
  }
});

test('real registration, mail, verification, sessions and credential recovery', async ({
  page,
  request,
  browser,
}, info) => {
  test.skip(
    process.env.IDENTITY_SMOKE_DISPOSABLE !== '1',
    'Requires an explicitly disposable stack and development mail sink',
  );
  test.setTimeout(150000);
  const origin = process.env.SMOKE_ORIGIN ?? 'http://127.0.0.1:8080';
  const mailOrigin = process.env.MAIL_SMOKE_ORIGIN ?? 'http://127.0.0.1:8025';
  for (const value of [origin, mailOrigin]) {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname))
      throw new Error('Loopback targets required');
  }
  const email = `browser-${crypto.randomUUID()}@example.test`;
  const password = 'synthetic browser password for testing';
  const replacement = 'replacement synthetic browser password';
  const mailLink = async (recipient: string, route: string) => {
    let link = '';
    await expect
      .poll(
        async () => {
          const response = await request.get(`${mailOrigin}/api/v1/messages`);
          const data = (await response.json()) as {
            messages: { ID: string; To: { Address: string }[] }[];
          };
          for (const message of data.messages.filter((item) =>
            item.To.some((to) => to.Address === recipient),
          )) {
            const detail = await request.get(`${mailOrigin}/api/v1/message/${message.ID}`);
            const body = (await detail.json()) as { Text: string };
            const match = body.Text.match(
              new RegExp(`https?://[^\\s]+${route}#token=[A-Za-z0-9_-]{43}`),
            );
            if (match) {
              link = match[0];
              return true;
            }
          }
          return false;
        },
        { timeout: 45000, intervals: [1000] },
      )
      .toBe(true);
    return link;
  };
  const signIn = async (value: string, address = email) => {
    await page.goto('/login');
    await page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Sign in', exact: true }) })
      .getByLabel('Email address', { exact: true })
      .fill(address);
    await page.getByLabel('Password', { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/security$/);
    await expect(page.getByText(address, { exact: true })).toBeVisible();
  };
  const confirmPassword = async (value: string) => {
    await page.getByLabel('Current password', { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Confirm password', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Password confirmed.' })).toBeVisible();
  };
  await page.goto('/register');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'email is queued' })).toBeVisible();
  await page.goto(await mailLink(email, '/verify-email'));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Done.' })).toBeVisible();
  await signIn(password);
  await page.goto('/admin');
  await expect(page.getByText('This account has no administration permissions.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  expect((await page.request.get('/api/v1/admin/accounts')).status()).toBe(403);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Account security');
  await page.reload();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  const other = await browser.newContext({ baseURL: origin });
  try {
    const response = await other.request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email, password },
    });
    expect(response.ok()).toBe(true);
    await page.getByRole('button', { name: 'Refresh sessions' }).click();
    await expect(page.locator('.session-list li')).toHaveCount(2);
    await confirmPassword(password);
    await page.setViewportSize({ width: 1194, height: 834 });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('security-landscape.png') });
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.screenshot({ path: info.outputPath('security-portrait.png') });
    const change = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Change password', exact: true }) });
    await change.getByLabel('New password', { exact: true }).fill(replacement);
    await change.getByRole('checkbox').check();
    await change.getByRole('button', { name: 'Change password', exact: true }).click();
    await expect(page.getByText('Sign in to open this page.')).toBeVisible();
    expect((await other.request.get('/api/v1/auth/me')).status()).toBe(401);
  } finally {
    await other.close();
  }
  await page.goto('/forgot-password');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'email is queued' })).toBeVisible();
  await page.goto(await mailLink(email, '/reset-password'));
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Done.' })).toBeVisible();
  await signIn(password);
  await confirmPassword(password);
  const newEmail = `changed-${crypto.randomUUID()}@example.test`;
  const emailChange = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Change email', exact: true }) });
  await emailChange.getByLabel('Email address', { exact: true }).fill(newEmail);
  await emailChange.getByRole('checkbox').check();
  await emailChange.getByRole('button', { name: 'Change email', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'email is queued' })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.goto(await mailLink(newEmail, '/confirm-email'));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Done.' })).toBeVisible();
  await signIn(password, newEmail);
  await confirmPassword(password);
  const sessionPanel = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Signed-in sessions', exact: true }) });
  await sessionPanel.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Sign out all sessions', exact: true }).click();
  await expect(page.getByText('Sign in to open this page.')).toBeVisible();
  await signIn(password, newEmail);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Sign in to open this page.')).toBeVisible();
  // Public error assertions never log bearer tokens or mail body content.
  const checkUnauthorized = async (client: APIRequestContext) =>
    expect((await client.get('/api/v1/auth/me')).status()).toBe(401);
  await checkUnauthorized(page.request);
  await signIn(password, newEmail);
  await confirmPassword(password);
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Check deletion eligibility' }).click();
  await page.getByLabel('I resolved pending work and confirm deletion.').check();
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: info.outputPath(`deletion-${viewport.width}.png`) });
  }
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page.getByText(/Live recovery deadline/)).toBeVisible();
  await checkUnauthorized(page.request);
  await page.getByRole('link', { name: 'Recover a deleted account' }).click();
  await page.getByLabel('Email address', { exact: true }).fill(newEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Done.' })).toBeVisible();
  await signIn(password, newEmail);
});
