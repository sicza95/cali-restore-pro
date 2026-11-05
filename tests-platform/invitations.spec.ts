import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ownerSession = process.env.M06_OWNER_SESSION;
const recipientSession = process.env.M06_RECIPIENT_SESSION;

async function setupVault(page: Page) {
  await page.getByLabel(/Remember this browser/).check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
  await page.getByLabel('I saved the recovery key').check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
}

test('verified recipient opens an activated assessment sample', async ({
  browser,
  baseURL,
}, info) => {
  test.skip(
    !ownerSession || !recipientSession,
    'Requires isolated seeded owner and recipient sessions',
  );
  const owner = await browser.newContext({ baseURL, viewport: { width: 1194, height: 834 } });
  const recipient = await browser.newContext({ baseURL, viewport: { width: 834, height: 1194 } });
  try {
    for (const [context, value] of [
      [owner, ownerSession!],
      [recipient, recipientSession!],
    ] as const) {
      await context.addCookies([{ name: 'calirestore_session', value, url: baseURL! }]);
    }
    const project = await owner.newPage();
    const inbox = await recipient.newPage();
    await project.goto('/projects');
    await setupVault(project);
    await project.getByLabel('Project name').fill('Synthetic chapel');
    await project.getByRole('button', { name: 'New project' }).click();
    await project.getByText('Project invitations', { exact: true }).click();
    await project.getByRole('button', { name: 'Enable hosting' }).click();
    await project.getByLabel('Recipient email').fill('recipient@example.test');
    await project.getByRole('button', { name: 'Send invitation' }).click();
    await expect(project.getByText('Awaiting acceptance')).toBeVisible();
    await project.getByRole('button', { name: 'Show my sharing fingerprint' }).click();
    const ownerCode = await project.locator('.invitation-panel code').innerText();

    await inbox.goto('/invitations');
    await setupVault(inbox);
    await inbox.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(inbox.getByText('Awaiting secure activation')).toBeVisible();
    const list = await (await recipient.request.get('/api/v1/invitations')).json();
    const fixture = '/api/v1/invitations/' + list.invitations[0].id + '/fixture';
    expect((await recipient.request.get(fixture)).status()).toBe(404);
    await inbox.getByRole('button', { name: 'Show my sharing fingerprint' }).click();
    const recipientCode = await inbox.locator('.invitation-panel code').innerText();

    await project.getByRole('button', { name: 'Refresh invitations' }).click();
    await project.getByLabel('Verified recipient fingerprint').fill('0'.repeat(64));
    await project.getByRole('button', { name: 'Activate sample access' }).click();
    await expect(project.locator('.invitation-panel [role=alert]')).toBeVisible();
    expect((await recipient.request.get(fixture)).status()).toBe(404);
    await project.getByLabel('Verified recipient fingerprint').fill(recipientCode);
    await project.getByRole('button', { name: 'Activate sample access' }).click();
    await expect(project.getByText('Assessment sample available')).toBeVisible();
    expect((await owner.request.get(fixture)).status()).toBe(404);

    await inbox.getByRole('button', { name: 'Refresh invitations' }).click();
    await inbox.getByLabel('Verified owner fingerprint').fill(ownerCode);
    await inbox.route(
      '**' + fixture,
      async (route) => {
        const response = await route.fetch();
        const grant = await response.json();
        const bytes = Buffer.from(grant.ciphertext, 'base64');
        bytes[0] ^= 1;
        await route.fulfill({ response, json: { ...grant, ciphertext: bytes.toString('base64') } });
      },
      { times: 1 },
    );
    await inbox.getByRole('button', { name: 'Open assessment sample' }).click();
    await expect(inbox.locator('.invitation-panel [role=alert]')).toBeVisible();
    await expect(inbox.getByText('Synthetic assessment: surface condition recorded.')).toHaveCount(
      0,
    );
    await inbox.getByRole('button', { name: 'Open assessment sample' }).click();
    await expect(
      inbox.getByText('Synthetic assessment: surface condition recorded.'),
    ).toBeVisible();
    expect((await new AxeBuilder({ page: project }).analyze()).violations).toEqual([]);
    expect((await new AxeBuilder({ page: inbox }).analyze()).violations).toEqual([]);
    await project.screenshot({ path: info.outputPath('invitation-landscape.png'), fullPage: true });
    await inbox.screenshot({ path: info.outputPath('invitation-portrait.png'), fullPage: true });
    await inbox.getByRole('button', { name: 'Lock vault' }).click();
    await expect(inbox.getByText('Synthetic assessment: surface condition recorded.')).toHaveCount(
      0,
    );
    await inbox.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
    await inbox.getByLabel('Verified owner fingerprint').fill(ownerCode);
    await inbox.getByRole('button', { name: 'Open assessment sample' }).click();
    await expect(
      inbox.getByText('Synthetic assessment: surface condition recorded.'),
    ).toBeVisible();
  } finally {
    await owner.close();
    await recipient.close();
  }
});
