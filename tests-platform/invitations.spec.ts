import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { createDecipheriv } from 'node:crypto';
import { captureOriginalKey } from './invitation-crypto';
import { verifyCheckpointGrants } from './invitation-checkpoints';
import { verifyHostingTransfer } from './invitation-hosting';
import {
  pauseOriginalDownload,
  stageOriginalUpload,
  verifyPublicationPaused,
} from './invitation-revocation';
import { verifyScopeEdits } from './invitation-scopes';

const ownerSession = process.env.M06_OWNER_SESSION;
const recipientSession = process.env.M06_RECIPIENT_SESSION;
const remainingSession = process.env.M06_REMAINING_SESSION;

async function setupVault(page: Page) {
  await page.getByLabel(/Remember this browser/).check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
  await page.getByLabel('I saved the recovery key').check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
}

test('project sharing, revocation and accepted hosting transfer preserve ownership', async ({
  browser,
  baseURL,
}, info) => {
  test.skip(
    !ownerSession || !recipientSession || !remainingSession,
    'Requires isolated seeded owner and two recipient sessions',
  );
  test.setTimeout(60_000);
  const owner = await browser.newContext({ baseURL, viewport: { width: 1194, height: 834 } });
  const recipient = await browser.newContext({ baseURL, viewport: { width: 834, height: 1194 } });
  const remaining = await browser.newContext({ baseURL, viewport: { width: 834, height: 1194 } });
  try {
    for (const [context, value] of [
      [owner, ownerSession!],
      [recipient, recipientSession!],
      [remaining, remainingSession!],
    ] as const) {
      await context.addCookies([{ name: 'calirestore_session', value, url: baseURL! }]);
    }
    const project = await owner.newPage();
    const inbox = await recipient.newPage();
    const remainingInbox = await remaining.newPage();
    const oldKey = await captureOriginalKey(inbox);
    await project.goto('/projects');
    await setupVault(project);
    await project.getByLabel('Project name').fill('Synthetic chapel');
    await project.getByRole('button', { name: 'New project' }).click();
    await project.getByLabel('Add object').fill('North wall');
    await project.getByRole('button', { name: 'Add object' }).click();
    await project.getByLabel('Add surface').fill('Upper plaster');
    await project.getByRole('button', { name: 'Add surface' }).click();
    await expect(project.getByText('Upper plaster · Metric')).toBeVisible();
    const originalBytes = Buffer.from('Synthetic original bytes for an encrypted grant.');
    await project.getByLabel('Original file', { exact: true }).setInputFiles({
      name: 'shared-plaster.bin',
      mimeType: 'application/octet-stream',
      buffer: originalBytes,
    });
    await project.getByRole('button', { name: 'Attach original', exact: true }).click();
    await expect(project.getByText('shared-plaster.bin')).toBeVisible();
    await project.getByText('Project invitations', { exact: true }).click();
    await project.getByRole('button', { name: 'Enable hosting' }).click();
    await project.getByLabel('Recipient email').fill('recipient@example.test');
    await project.getByLabel('Estimate access (sample data)').selectOption('estimate-summary');
    await project.getByRole('button', { name: 'Send invitation' }).click();
    await expect(project.getByText('Awaiting acceptance')).toBeVisible();
    await project.getByRole('button', { name: 'Show my sharing fingerprint' }).click();
    const ownerCode = await project.locator('.invitation-panel code').innerText();

    await inbox.goto('/invitations');
    await setupVault(inbox);
    await inbox.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(inbox.getByText('Awaiting secure activation')).toBeVisible();
    const list = await (await recipient.request.get('/api/v1/invitations')).json();
    const content = '/api/v1/invitations/' + list.invitations[0].id + '/content';
    const scopes = '/api/v1/invitations/' + list.invitations[0].id + '/scopes/';
    expect((await recipient.request.get(content)).status()).toBe(404);
    expect((await recipient.request.get(scopes + 'estimate-summary')).status()).toBe(404);
    await inbox.getByRole('button', { name: 'Show my sharing fingerprint' }).click();
    const recipientCode = await inbox.locator('.invitation-panel code').innerText();

    await project.getByRole('button', { name: 'Refresh invitations' }).click();
    await project.getByLabel('Verified recipient fingerprint').fill('0'.repeat(64));
    await project.getByRole('button', { name: 'Share project snapshot' }).click();
    await expect(project.locator('.invitation-panel [role=alert]')).toBeVisible();
    expect((await recipient.request.get(content)).status()).toBe(404);
    await project.getByLabel('Verified recipient fingerprint').fill(recipientCode);
    await project.getByRole('checkbox', { name: 'Include all attached original files' }).check();
    const upload = project.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/activate'),
    );
    await project.getByRole('button', { name: 'Share project snapshot' }).click();
    await expect(project.getByText('Shared content available')).toBeVisible();
    const activation = (await upload).postDataJSON();
    expect(JSON.stringify(activation)).not.toMatch(
      /Synthetic chapel|North wall|Upper plaster|shared-plaster/,
    );
    expect(activation.fileIds).toHaveLength(1);
    const original =
      '/api/v1/invitations/' + list.invitations[0].id + '/files/' + activation.fileIds[0];
    expect((await owner.request.get(content)).status()).toBe(404);
    const sealed = await (await recipient.request.get(content)).json();
    expect(sealed.format).toBe('project-v1');
    expect(JSON.stringify(sealed)).not.toMatch(/Synthetic chapel|North wall|Upper plaster/);
    const summary = await recipient.request.get(scopes + 'estimate-summary');
    expect(summary.status()).toBe(200);
    expect(await summary.text()).not.toContain('1,250 EUR');
    expect((await recipient.request.get(scopes + 'estimate-full')).status()).toBe(404);
    expect((await recipient.request.get(scopes + 'history')).status()).toBe(404);
    expect((await owner.request.get(scopes + 'estimate-summary')).status()).toBe(404);

    await inbox.getByRole('button', { name: 'Refresh invitations' }).click();
    await inbox.getByLabel('Verified owner fingerprint').fill(ownerCode);
    await inbox.getByRole('button', { name: 'Estimate summary sample' }).click();
    await expect(
      inbox.getByRole('region', { name: 'Estimate summary sample' }).getByText('1,250 EUR'),
    ).toBeVisible();
    await expect(inbox.getByRole('button', { name: 'Full estimate sample' })).toHaveCount(0);
    await expect(inbox.getByRole('button', { name: 'History sample' })).toHaveCount(0);
    await inbox.route(
      '**' + content,
      async (route) => {
        const response = await route.fetch();
        const grant = await response.json();
        const bytes = Buffer.from(grant.ciphertext, 'base64');
        bytes[0] ^= 1;
        await route.fulfill({ response, json: { ...grant, ciphertext: bytes.toString('base64') } });
      },
      { times: 1 },
    );
    await inbox.getByRole('button', { name: 'Open shared content' }).click();
    await expect(inbox.locator('.invitation-panel [role=alert]')).toBeVisible();
    await expect(inbox.getByText('Synthetic chapel')).toHaveCount(0);
    await expect(inbox.getByRole('heading', { name: 'Baseline inspection' })).toHaveCount(0);
    await inbox.getByRole('button', { name: 'Open shared content' }).click();
    await expect(inbox.getByText('Synthetic chapel')).toBeVisible();

    await expect(inbox.getByRole('heading', { name: 'North wall' })).toBeVisible();
    await expect(inbox.getByText('Upper plaster · Metric')).toBeVisible();
    await expect(inbox.getByText('shared-plaster.bin')).toBeVisible();
    expect((await owner.request.get(original + '/parts/1')).status()).toBe(404);
    const encryptedPart = await recipient.request.get(original + '/parts/1');
    expect(encryptedPart.status()).toBe(200);
    expect(await encryptedPart.body()).not.toEqual(originalBytes);
    const download = inbox.waitForEvent('download');
    await inbox.getByRole('button', { name: 'Download original' }).click();
    const openedFile = await download;
    expect(openedFile.suggestedFilename()).toBe('shared-plaster.bin');
    expect(await readFile(await openedFile.path())).toEqual(originalBytes);
    expect(Buffer.from(oldKey(), 'base64')).toHaveLength(32);

    await project.getByLabel('Recipient email').fill('remaining@example.test');
    await project.getByLabel('Estimate access (sample data)').selectOption('estimate-full');
    await project.getByRole('checkbox', { name: 'Include a history checkpoint sample' }).check();
    await project.getByRole('button', { name: 'Send invitation' }).click();
    const remainingRow = project
      .getByRole('listitem')
      .filter({ hasText: 'remaining@example.test' });
    await expect(remainingRow.getByText('Awaiting acceptance')).toBeVisible();
    await remainingInbox.goto('/invitations');
    await setupVault(remainingInbox);
    await remainingInbox.getByRole('button', { name: 'Accept invitation' }).click();
    await remainingInbox.getByRole('button', { name: 'Show my sharing fingerprint' }).click();
    const remainingCode = await remainingInbox.locator('.invitation-panel code').innerText();
    await project.getByRole('button', { name: 'Refresh invitations' }).click();
    await remainingRow.getByLabel('Verified recipient fingerprint').fill(remainingCode);
    await remainingRow
      .getByRole('checkbox', { name: 'Include all attached original files' })
      .check();
    await remainingRow.getByRole('button', { name: 'Share project snapshot' }).click();
    await expect(remainingRow.getByText('Shared content available')).toBeVisible();
    const remainingList = await (await remaining.request.get('/api/v1/invitations')).json();
    const remainingScopes = '/api/v1/invitations/' + remainingList.invitations[0].id + '/scopes/';
    expect((await remaining.request.get(remainingScopes + 'estimate-summary')).status()).toBe(404);
    expect((await recipient.request.get(remainingScopes + 'history')).status()).toBe(404);
    const fullEnvelope = await (
      await remaining.request.get(remainingScopes + 'estimate-full')
    ).json();
    await remainingInbox.getByRole('button', { name: 'Refresh invitations' }).click();
    await remainingInbox.getByLabel('Verified owner fingerprint').fill(ownerCode);
    await remainingInbox.getByRole('button', { name: 'Full estimate sample' }).click();
    await expect(
      remainingInbox.getByRole('region', { name: 'Full estimate sample' }).getByText('62.50 EUR/h'),
    ).toBeVisible();
    await remainingInbox.route(
      '**' + remainingScopes + 'history',
      (route) => route.fulfill({ json: { ...fullEnvelope, scope: 'history' } }),
      { times: 1 },
    );
    await remainingInbox.getByRole('button', { name: 'History sample' }).click();
    await expect(remainingInbox.locator('.invitation-panel [role=alert]')).toBeVisible();
    await expect(remainingInbox.getByRole('region', { name: 'History sample' })).toHaveCount(0);
    await remainingInbox.getByRole('button', { name: 'History sample' }).click();
    await expect(
      remainingInbox.getByRole('region', { name: 'History sample' }).getByText('Checkpoint 1'),
    ).toBeVisible();
    await verifyScopeEdits(
      remainingRow,
      remaining.request,
      remainingInbox,
      remainingScopes,
      ownerCode,
      remainingCode,
    );
    const checkpoints = await verifyCheckpointGrants(
      project
        .locator('li')
        .filter({ has: project.getByText('recipient@example.test', { exact: true }) })
        .filter({ has: project.locator('details.scope-editor') })
        .last(),
      remainingRow,
      inbox,
      remainingInbox,
      scopes,
      remainingScopes,
      ownerCode,
      recipientCode,
      remainingCode,
    );
    await project.screenshot({
      path: info.outputPath('checkpoints-landscape.png'),
      fullPage: true,
    });
    await inbox.screenshot({ path: info.outputPath('checkpoints-portrait.png'), fullPage: true });
    const remainingOriginals = '/api/v1/invitations/' + remainingList.invitations[0].id + '/files/';
    expect(
      (
        await remaining.request.get(remainingOriginals + activation.fileIds[0] + '/parts/1')
      ).status(),
    ).toBe(200);
    expect((await new AxeBuilder({ page: project }).analyze()).violations).toEqual([]);
    expect((await new AxeBuilder({ page: inbox }).analyze()).violations).toEqual([]);
    await project.screenshot({ path: info.outputPath('invitation-landscape.png'), fullPage: true });
    await inbox.screenshot({ path: info.outputPath('invitation-portrait.png'), fullPage: true });
    await inbox.getByRole('button', { name: 'Lock vault' }).click();
    await expect(inbox.getByText('Synthetic chapel')).toHaveCount(0);
    await expect(inbox.getByRole('heading', { name: 'Baseline inspection' })).toHaveCount(0);
    await inbox.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
    await inbox.getByLabel('Verified owner fingerprint').fill(ownerCode);
    await inbox.getByRole('button', { name: 'Open shared content' }).click();
    await expect(inbox.getByText('Synthetic chapel')).toBeVisible();
    const revoke =
      '/api/v1/hosted-projects/' +
      list.invitations[0].projectId +
      '/invitations/' +
      list.invitations[0].id +
      '/revoke';
    const session = await (await recipient.request.get('/api/v1/auth/me')).json();
    const unauthorized = await recipient.request.post(revoke, {
      headers: { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken },
      data: {},
    });
    expect(unauthorized.status()).toBe(404);
    expect((await recipient.request.get(content)).status()).toBe(200);

    const projectId = list.invitations[0].projectId;
    const stale = await stageOriginalUpload(owner.request, projectId, baseURL!);
    expect((await stale.finishParts()).status()).toBe(204);
    const finishDownload = await pauseOriginalDownload(inbox, original);
    project.once('dialog', (dialog) => dialog.accept());
    await project
      .getByRole('listitem')
      .filter({ hasText: 'recipient@example.test' })
      .getByRole('button', { name: 'Revoke access' })
      .click();
    await expect(project.getByText('Access revoked')).toBeVisible();
    await finishDownload();
    const verifyResumed = await verifyPublicationPaused(owner.request, projectId, baseURL!, stale);
    expect((await recipient.request.get(content)).status()).toBe(404);
    expect((await recipient.request.get(scopes + 'estimate-summary')).status()).toBe(404);
    expect((await recipient.request.get(checkpoints.revokedWithInvitation)).status()).toBe(404);
    for (const suffix of ['', '/parts/0', '/parts/1']) {
      expect((await recipient.request.get(original + suffix)).status()).toBe(404);
    }
    expect(
      (
        await remaining.request.get(remainingOriginals + activation.fileIds[0] + '/parts/1')
      ).status(),
    ).toBe(200);
    await remainingRow.getByLabel('Verified recipient fingerprint').fill(remainingCode);
    const rotation = project.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/rotate-originals'),
    );
    await remainingRow.getByRole('button', { name: 'Rotate original-file keys' }).click();
    const rotated = (await rotation).postDataJSON();
    const newId = rotated.fileIds[0];
    expect(newId).not.toBe(activation.fileIds[0]);
    await expect(
      remainingRow.getByRole('button', { name: 'Rotate original-file keys' }),
    ).toHaveCount(0);
    expect(
      (
        await remaining.request.get(remainingOriginals + activation.fileIds[0] + '/parts/1')
      ).status(),
    ).toBe(404);
    expect((await recipient.request.get(remainingOriginals + newId + '/parts/1')).status()).toBe(
      404,
    );
    expect((await remaining.request.get(checkpoints.preservedDuringRotation)).status()).toBe(200);
    const rotatedPart = await remaining.request.get(remainingOriginals + newId + '/parts/1');
    expect(rotatedPart.status()).toBe(200);
    await verifyResumed();
    const newCiphertext = await rotatedPart.body();
    const ownerAccount = await (await owner.request.get('/api/v1/auth/me')).json();
    const iv = Buffer.alloc(12);
    iv.writeUInt32BE(1, 8);
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(oldKey(), 'base64'), iv);
    decipher.setAAD(
      Buffer.from(
        JSON.stringify([
          'calirestore-original',
          1,
          ownerAccount.account.id,
          list.invitations[0].projectId,
          newId,
          1,
        ]),
      ),
    );
    decipher.setAuthTag(newCiphertext.subarray(-16));
    decipher.update(newCiphertext.subarray(0, -16));
    expect(() => decipher.final()).toThrow();
    await remainingInbox.getByRole('button', { name: 'Refresh invitations' }).click();
    await remainingInbox.getByLabel('Verified owner fingerprint').fill(ownerCode);
    await remainingInbox.getByRole('button', { name: 'Open shared content' }).click();
    const rotatedDownload = remainingInbox.waitForEvent('download');
    await remainingInbox.getByRole('button', { name: 'Download original' }).click();
    expect(await readFile(await (await rotatedDownload).path())).toEqual(originalBytes);
    await inbox.getByRole('button', { name: 'Download original' }).click();
    await expect(
      inbox.getByRole('region', { name: 'Shared originals' }).getByRole('alert'),
    ).toBeVisible();
    await inbox.getByRole('button', { name: 'Open shared content' }).click();
    await expect(inbox.locator('.invitation-panel [role=alert]')).toBeVisible();
    await expect(inbox.getByText('Synthetic chapel')).toHaveCount(0);
    await inbox.getByRole('button', { name: 'Refresh invitations' }).click();
    await expect(inbox.getByText('No invitations to show.')).toBeVisible();

    const owners = '/api/v1/hosted-projects/' + list.invitations[0].projectId + '/owners';
    const ownerAuth = await (await owner.request.get('/api/v1/auth/me')).json();
    const removeHost = owners + '/' + ownerAuth.account.id + '/remove';
    const mutation = {
      headers: { Origin: baseURL!, 'X-CSRF-Token': ownerAuth.csrfToken },
      data: {},
    };
    const lastOwner = await owner.request.post(removeHost, mutation);
    expect(lastOwner.status()).toBe(409);
    expect(await lastOwner.json()).toEqual({ error: 'last_project_owner' });

    await project.getByLabel('Recipient email').fill('recipient@example.test');
    await project.getByRole('checkbox', { name: /Invite as co-owner/ }).check();
    await project.getByRole('button', { name: 'Send invitation' }).click();
    await expect(project.getByText('Awaiting acceptance')).toBeVisible();
    const renewed = await (await recipient.request.get('/api/v1/invitations')).json();
    expect(renewed.invitations).toHaveLength(1);
    expect(renewed.invitations[0].id).not.toBe(list.invitations[0].id);
    expect((await recipient.request.get(content)).status()).toBe(404);
    await inbox.getByRole('button', { name: 'Refresh invitations' }).click();
    await inbox.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(inbox.getByText('Awaiting secure activation')).toBeVisible();
    expect((await recipient.request.get(owners)).status()).toBe(404);
    await project.getByRole('button', { name: 'Refresh invitations' }).click();
    await project.getByLabel('Verified recipient fingerprint').fill(recipientCode);
    await project.getByRole('button', { name: 'Share project snapshot' }).click();
    const ownerList = project.getByRole('region', { name: 'Project owners' });
    await expect(ownerList.getByText('recipient@example.test')).toBeVisible();
    const host = await owner.request.post(removeHost, mutation);
    expect(host.status()).toBe(409);
    expect(await host.json()).toEqual({ error: 'owner_is_project_host' });

    await inbox.getByRole('button', { name: 'Refresh invitations' }).click();
    await inbox.getByLabel('Verified owner fingerprint').fill(ownerCode);
    await inbox.getByRole('button', { name: 'Open shared content' }).click();
    await inbox.getByText('Project invitations', { exact: true }).click();
    const recipientOwners = inbox.getByRole('region', { name: 'Project owners' });
    await expect(recipientOwners.getByText('owner@example.test')).toBeVisible();
    await verifyHostingTransfer(
      inbox,
      project,
      ownerList,
      recipientOwners,
      owners,
      removeHost,
      ownerAuth.account.id,
      session,
      mutation,
    );
  } finally {
    await owner.close();
    await recipient.close();
    await remaining.close();
  }
});
