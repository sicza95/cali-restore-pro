import { expect, test, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openSetting, signOutFromMenu } from './app-navigation';

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
  // A sign-up link is checked as soon as it opens; a bad one says so without a button.
  await page.goto('/verify-email#token=' + 'a'.repeat(43));
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByRole('alert')).toContainText('invalid, expired or already used');
  await page.goto('/register');
  await page.getByRole('combobox').selectOption('hu');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fiók létrehozása');
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
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
  // The newest email to recipient that links to route (sign-up and reset mail both carry a code).
  const mailCode = async (recipient: string, route = '/verify-email') => {
    let code = '';
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
            const text = ((await detail.json()) as { Text: string }).Text;
            if (!text.includes(route + '#token=')) continue;
            code = text.match(/code: (\d{6})/)?.[1] ?? '';
            return !!code;
          }
          return false;
        },
        { timeout: 45000, intervals: [1000] },
      )
      .toBe(true);
    return code;
  };
  // Waits for an email to recipient whose text contains every one of the phrases.
  const mailWith = async (recipient: string, ...phrases: string[]) =>
    expect
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
            const text = ((await detail.json()) as { Text: string }).Text;
            if (phrases.every((phrase) => text.includes(phrase))) return true;
          }
          return false;
        },
        { timeout: 45000, intervals: [1000] },
      )
      .toBe(true);
  const signIn = async (value: string, address = email) => {
    await page.goto('/login');
    await page.getByLabel('Email address', { exact: true }).fill(address);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Password', { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/security$/);
    await expect.poll(signedInAs).toBe(address);
  };
  const signedInAs = async () =>
    ((await (await page.request.get('/api/v1/auth/me')).json()) as { account?: { email: string } })
      .account?.email;
  // The Security tab lists its options; each opens in place.
  const option = async (id: 'password' | 'email' | 'sessions') => {
    const row = page.locator(`details#${id}`);
    if (!(await row.evaluate((el) => (el as HTMLDetailsElement).open)))
      await page.locator(`[data-control-id="account.security.${id}"]`).click();
    return row;
  };
  // Toasts fade in; contrast checks wait until they are fully shown.
  const toastsShown = () =>
    page.evaluate(() =>
      Promise.all(
        [...document.querySelectorAll('.toast')]
          .flatMap((toast) => toast.getAnimations())
          .filter((a) => (a as CSSAnimation).animationName === 'toast-in')
          .map((a) => a.finished),
      ),
    );
  // Create account by email alone: a wrong code is refused, the mailed code opens the
  // password step without a button, and the first password signs the person in.
  await page.goto('/register');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const code = await mailCode(email);
  const first = page.getByLabel('Digit 1 / 6', { exact: true });
  await expect(first).toBeFocused();
  await page.keyboard.type(code === '000000' ? '111111' : '000000');
  await expect(page.getByRole('alert')).toContainText('wrong or has expired');
  await expect(first).toBeFocused();
  await page.keyboard.type(code);
  // A new account is named, and may get a photo, together with its first password.
  await expect(page.getByLabel('Full name', { exact: true })).toBeFocused();
  await page.getByLabel('Full name', { exact: true }).fill('  Test   Person ');
  const landscape = await page.evaluate(() => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 600, height: 400 });
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#3a7';
    context.fillRect(0, 0, 600, 400);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'portrait.png',
    mimeType: 'image/png',
    buffer: Buffer.from(landscape, 'base64'),
  });
  await expect(page.locator('.profile-fields img')).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Repeat password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    account: { name: string; photo?: string };
  };
  expect(me.account.name).toBe('Test Person');
  const photo = await page.request.get(me.account.photo!);
  expect(photo.headers()['content-type']).toBe('image/jpeg');
  await mailWith(email, 'Welcome to CaliRestore Pro, Test Person');
  // Settings changes the name and removes the photo, each in its own row; later emails use the
  // new name.
  await page.goto('/settings/account');
  await expect(page.locator('.settings-static').getByText(email, { exact: true })).toBeVisible();
  const name = await openSetting(page, 'name');
  await name.getByLabel('Full name', { exact: true }).fill('Renamed Person');
  await name.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Profile saved.' })).toBeVisible();
  await expect(page.locator('details#name summary')).toContainText('Renamed Person');
  const photoRow = await openSetting(page, 'photo');
  await expect(photoRow.locator('img')).toBeVisible();
  await photoRow.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await photoRow.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(page.locator('details#photo summary')).toContainText('No photo');
  await toastsShown();
  await expect((await openSetting(page, 'photo')).locator('img')).toHaveCount(0);
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(viewport);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`profile-${viewport.width}.png`) });
  }
  // Sign out for real so the later session counts start from the password sign-in.
  await signOutFromMenu(page);
  await expect(page).toHaveURL(/\/login\?next=/);
  await signIn(password);
  await page.goto('/admin');
  await expect(page.getByText('This account has no administration permissions.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  expect((await page.request.get('/api/v1/admin/accounts')).status()).toBe(403);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await page.reload();
  await expect.poll(signedInAs).toBe(email);
  const other = await browser.newContext({ baseURL: origin });
  try {
    const response = await other.request.post('/api/v1/auth/login', {
      headers: { Origin: origin },
      data: { email, password },
    });
    expect(response.ok()).toBe(true);
    // A fresh password sign-in needs no extra confirmation for these changes.
    await (await option('sessions')).getByRole('button', { name: 'Refresh sessions' }).click();
    await expect(page.locator('.session-list li')).toHaveCount(2);
    await page.setViewportSize({ width: 1194, height: 834 });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('security-landscape.png') });
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.screenshot({ path: info.outputPath('security-portrait.png') });
    const change = await option('password');
    await change.getByLabel('New password', { exact: true }).fill(replacement);
    await change.getByRole('button', { name: 'Change password', exact: true }).click();
    await expect(page.getByText('Sign in to open this page.')).toBeVisible();
    expect((await other.request.get('/api/v1/auth/me')).status()).toBe(401);
  } finally {
    await other.close();
  }
  // Can’t sign in: the address carries over from the sign-in page, the code step opens at
  // once, and the mailed code leads to a new password that signs the person in.
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('link', { name: 'Can’t sign in?', exact: true }).click();
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Digit 1 / 6', { exact: true })).toBeFocused();
  await page.keyboard.type(await mailCode(email, '/reset-password'));
  await mailWith(email, 'Hi Renamed Person,', '/reset-password#token=');
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Repeat password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await signOutFromMenu(page);
  await expect(page).toHaveURL(/\/login/);
  await signIn(password);
  const newEmail = `changed-${crypto.randomUUID()}@example.test`;
  const emailChange = await option('email');
  await emailChange.getByLabel('Email address', { exact: true }).fill(newEmail);
  await emailChange.getByRole('button', { name: 'Change email', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'email is queued' })).toBeVisible();
  await expect(page.locator('.settings-static').getByText(email, { exact: true })).toBeVisible();
  await page.goto(await mailLink(newEmail, '/confirm-email'));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Done.' })).toBeVisible();
  await signIn(password, newEmail);
  await (
    await option('sessions')
  )
    .getByRole('button', { name: 'Sign out all sessions', exact: true })
    .click();
  await expect(page.getByText('Sign in to open this page.')).toBeVisible();
  await signIn(password, newEmail);
  await signOutFromMenu(page);
  await expect(page).toHaveURL(/\/login\?next=security$/);
  // Public error assertions never log bearer tokens or mail body content.
  const checkUnauthorized = async (client: APIRequestContext) =>
    expect((await client.get('/api/v1/auth/me')).status()).toBe(401);
  await checkUnauthorized(page.request);
  await signIn(password, newEmail);
  await page.goto('/settings/account');
  await (
    await openSetting(page, 'delete-account')
  )
    .getByRole('button', { name: 'Check deletion eligibility' })
    .click();
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
