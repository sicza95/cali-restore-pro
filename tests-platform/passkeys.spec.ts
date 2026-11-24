import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// PRIV-03 (#121): an optional passkey is a sign-in factor only. Chromium's CDP
// virtual authenticator stands in for a platform authenticator with user
// verification; physical iPad/Safari passkeys remain a separate qualification.
test('passkey registration, discoverable sign-in and removal beside password sign-in', async ({
  page,
  request,
}, info) => {
  const origin = process.env.SMOKE_ORIGIN ?? 'http://127.0.0.1:8080';
  const mailOrigin = process.env.MAIL_SMOKE_ORIGIN ?? 'http://127.0.0.1:8025';
  test.skip(
    process.env.IDENTITY_SMOKE_DISPOSABLE !== '1',
    'Requires an explicitly disposable stack and development mail sink',
  );
  test.skip(
    new URL(origin).hostname !== 'localhost',
    'Browsers refuse passkeys on IP-address origins; run the stack with APP_ORIGIN=http://localhost:<port>',
  );
  test.setTimeout(120000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const email = `passkey-${crypto.randomUUID()}@example.test`;
  const password = 'synthetic passkey browser password';
  const mailLink = async (route: string) => {
    let link = '';
    await expect
      .poll(
        async () => {
          const data = (await (await request.get(`${mailOrigin}/api/v1/messages`)).json()) as {
            messages: { ID: string; To: { Address: string }[] }[];
          };
          for (const message of data.messages.filter((m) =>
            m.To.some((to) => to.Address === email),
          )) {
            const body = (await (
              await request.get(`${mailOrigin}/api/v1/message/${message.ID}`)
            ).json()) as { Text: string };
            link =
              body.Text.match(new RegExp(`https?://[^\\s]+${route}#token=[\\w-]{43}`))?.[0] ?? '';
            if (link) return true;
          }
          return false;
        },
        { timeout: 45000, intervals: [1000] },
      )
      .toBe(true);
    return link;
  };
  const passwordSignIn = async () => {
    await page.goto('/login');
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/security$/);
  };
  // The Passkeys option of the Security tab, opened.
  const passkeys = async (p: Page) => {
    const row = p.locator('details#passkeys');
    if (!(await row.evaluate((el) => (el as HTMLDetailsElement).open)))
      await p.locator('[data-control-id="account.security.passkeys"]').click();
    return row;
  };
  const confirmDialog = page.getByRole('dialog', { name: 'Confirm it’s you' });
  const signedInAs = async () =>
    ((await (await page.request.get('/api/v1/auth/me')).json()) as { account?: { email: string } })
      .account?.email;

  // The mailed link goes straight to the password step; the first password signs in.
  await page.goto('/register');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByLabel('Digit 1 / 6', { exact: true })).toBeVisible();
  await page.goto(await mailLink('/verify-email'));
  await page.getByLabel('Full name', { exact: true }).fill('Passkey Person');
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Repeat password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto('/settings/security');
  const section = await passkeys(page);
  await expect(section.getByText('No passkeys yet.')).toBeVisible();
  // Setting the first password just now counts as a confirmation, and the name starts as the
  // platform, so one click adds the passkey without "Confirm it's you".
  await expect(section.getByLabel('Passkey name', { exact: true })).not.toHaveValue('');
  await section.getByLabel('Passkey name', { exact: true }).fill('Studio iPad');
  await section.getByRole('button', { name: 'Add passkey', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Passkey added.' })).toBeVisible();
  await expect(confirmDialog).toBeHidden();
  await expect(section.getByText('Studio iPad')).toBeVisible();
  await expect(section.getByText('Not used yet')).toBeVisible();
  const stored = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  expect(stored.credentials).toHaveLength(1);
  expect(stored.credentials[0].isResidentCredential).toBe(true);
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(viewport);
    await section.scrollIntoViewIfNeeded();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`passkeys-${viewport.width}.png`) });
  }

  // Discoverable sign-in: no email is typed, the authenticator picks the account.
  const passkeySignIn = async () => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/security$/);
    await expect.poll(signedInAs).toBe(email);
  };
  await passkeySignIn();
  await expect((await passkeys(page)).getByText('Last used')).toBeVisible();
  // A passkey session is not a recent confirmation: the server asks for one.
  const { csrfToken } = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    csrfToken: string;
  };
  const begin = await page.request.post('/api/v1/auth/passkeys/register/options', {
    headers: { Origin: origin, 'X-CSRF-Token': csrfToken },
    data: {},
  });
  expect(begin.status()).toBe(403);
  expect(await begin.json()).toEqual({ error: 'credential_confirmation_required' });
  // So adding one asks "Confirm it's you" as its last step. A passkey confirms; this
  // authenticator already holds the account's passkey, so the new ceremony is then refused.
  await (await passkeys(page)).getByRole('button', { name: 'Add passkey', exact: true }).click();
  await expect(confirmDialog).toBeVisible();
  // The dialog fades in; check contrast once it is fully shown.
  await confirmDialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('confirm-identity.png') });
  await confirmDialog.getByRole('button', { name: 'Use a passkey instead', exact: true }).click();
  await expect(confirmDialog).toBeHidden();
  await expect(page.getByRole('alert')).toContainText(
    'This passkey is already added to your account.',
  );

  // From a new passkey session, removing asks again; this time the password confirms.
  await passkeySignIn();
  await (
    await passkeys(page)
  )
    .getByRole('button', { name: 'Remove passkey: Studio iPad', exact: true })
    .click();
  await confirmDialog
    .getByLabel('Current password', { exact: true })
    .fill('not the password at all');
  await confirmDialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(confirmDialog.getByRole('alert')).toHaveText(
    'That password is not right. Try again.',
  );
  await confirmDialog.getByLabel('Current password', { exact: true }).fill(password);
  await confirmDialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(confirmDialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Passkey removed.' })).toBeVisible();
  await expect((await passkeys(page)).getByText('No passkeys yet.')).toBeVisible();

  // The authenticator still holds the credential, but the server no longer accepts it.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The passkey could not be verified.');
  await expect(page).toHaveURL(/\/login$/);
  await passwordSignIn();
  await expect.poll(signedInAs).toBe(email);

  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByRole('combobox').selectOption('hu');
  await expect(
    page.getByRole('button', { name: 'Bejelentkezés azonosítókulccsal', exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('login-passkey-hu.png') });
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
});
