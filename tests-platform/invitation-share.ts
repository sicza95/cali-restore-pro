import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { orientedJpeg } from './fixtures/images';
import { enableHostingAndSync } from './invitation-hosting';
import { setupRememberedVault } from './vault-setup';

/** Estimate scopes are shared only from an issued estimate: 20 h at HUF 62.50 per hour. */
async function issueEstimate(project: Page) {
  const control = (id: string) => project.locator(`[data-control-id="${id}"]`);
  const phase = (key: string) => control('estimate.phase.' + key);
  await control('project.review.estimates').click();
  await control('estimate.step.phases').click();
  await phase('newName').fill('Surface cleaning');
  await phase('add').click();
  await phase('scopeSurface').selectOption({ label: 'North wall / Upper plaster' });
  await phase('time').fill('20');
  await phase('rate').fill('62.50');
  await expect(project.locator('[data-estimate-result="total"]')).toHaveText('HUF 1,250');
  await control('estimate.step.issue').click();
  await control('estimate.finance.issue').click();
  await expect(project.getByText('Version saved on this device. Not synced yet.')).toBeVisible();
  await control('project.review.parent').click();
  await expect(project.getByText('shared-plaster.jpg')).toBeVisible();
}

/**
 * The owner creates a project with one original, issues an estimate, invites the recipient and
 * shares a snapshot once the fingerprints are verified (a wrong fingerprint is refused first).
 * Checks that the activation, the sealed content and the estimate scopes reveal no plain project
 * data.
 */
export async function shareFirstSnapshot(project: Page, inbox: Page) {
  const owner = project.request;
  const recipient = inbox.request;
  await project.goto('/projects');
  await setupRememberedVault(project);
  await project.getByLabel('Project name').fill('Synthetic chapel');
  await project.getByRole('button', { name: 'New project' }).click();
  // One object: the full estimate scope must stay within the server's 1536-byte grant limit.
  await project.getByRole('textbox', { name: 'Object', exact: true }).fill('North wall');
  await project.locator('[data-control-id="project.object.rename"]').click();
  await expect(
    project.getByRole('combobox', { name: 'Object', exact: true }).locator('option:checked'),
  ).toHaveText('North wall');
  await project.getByRole('textbox', { name: 'Surface', exact: true }).fill('Upper plaster');
  await project.locator('[data-control-id="project.surface.rename"]').click();
  await expect(project.getByText('Upper plaster · Metric')).toBeVisible();
  await project.getByLabel('Original file', { exact: true }).setInputFiles({
    name: 'shared-plaster.jpg',
    mimeType: 'image/jpeg',
    buffer: orientedJpeg,
  });
  await project.getByRole('button', { name: 'Attach original', exact: true }).click();
  await expect(project.getByText('shared-plaster.jpg')).toBeVisible();
  await issueEstimate(project);
  await project.getByText('Project invitations', { exact: true }).click();
  await enableHostingAndSync(project);
  await project.getByLabel('Recipient email').fill('recipient@example.test');
  await project.getByLabel('Estimate access (sample data)').selectOption('estimate-summary');
  await project.getByRole('button', { name: 'Send invitation' }).click();
  await expect(project.getByText('Awaiting acceptance')).toBeVisible();
  await expect(project.locator('[data-control-id="sharing.resend"]')).toBeDisabled();
  await expect(project.locator('[data-control-id="sharing.cancel"]')).toBeEnabled();
  await project.getByRole('button', { name: 'Show my sharing fingerprint' }).click();
  const ownerCode = await project.locator('.invitation-panel code').innerText();

  await inbox.goto('/invitations');
  await setupRememberedVault(inbox);
  await inbox.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(inbox.getByText('Awaiting secure activation')).toBeVisible();
  const list = await (await recipient.get('/api/v1/invitations')).json();
  const content = '/api/v1/invitations/' + list.invitations[0].id + '/content';
  const scopes = '/api/v1/invitations/' + list.invitations[0].id + '/scopes/';
  expect((await recipient.get(content)).status()).toBe(404);
  expect((await recipient.get(scopes + 'estimate-summary')).status()).toBe(404);
  await inbox.getByRole('button', { name: 'Show my sharing fingerprint' }).click();
  const recipientCode = await inbox.locator('.invitation-panel code').innerText();

  await project.getByRole('button', { name: 'Refresh invitations' }).click();
  await project.getByLabel('Verified recipient fingerprint').fill('0'.repeat(64));
  await project.getByRole('button', { name: 'Share project snapshot' }).click();
  await expect(project.locator('.invitation-panel [role=alert]')).toBeVisible();
  expect((await recipient.get(content)).status()).toBe(404);
  await project.getByLabel('Verified recipient fingerprint').fill(recipientCode);
  await project.getByRole('checkbox', { name: 'Include all attached original files' }).check();
  const upload = project.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/activate'),
  );
  await project.getByRole('button', { name: 'Share project snapshot' }).click();
  await expect(project.getByText('Shared content available')).toBeVisible();
  await expect(project.locator('[data-control-id="sharing.resend"]')).toHaveCount(0);
  await expect(project.locator('[data-control-id="sharing.revoke"]')).toBeEnabled();
  const activation = (await upload).postDataJSON();
  expect(JSON.stringify(activation)).not.toMatch(
    /Synthetic chapel|North wall|Upper plaster|shared-plaster/,
  );
  expect(activation.fileIds).toHaveLength(1);
  const original =
    '/api/v1/invitations/' + list.invitations[0].id + '/files/' + activation.fileIds[0];
  expect((await owner.get(content)).status()).toBe(404);
  const sealed = await (await recipient.get(content)).json();
  expect(sealed.format).toBe('project-v1');
  expect(JSON.stringify(sealed)).not.toMatch(/Synthetic chapel|North wall|Upper plaster/);
  const summary = await recipient.get(scopes + 'estimate-summary');
  expect(summary.status()).toBe(200);
  expect(await summary.text()).not.toMatch(/1,?250|Surface cleaning/);
  expect((await recipient.get(scopes + 'estimate-full')).status()).toBe(404);
  expect((await recipient.get(scopes + 'history')).status()).toBe(404);
  expect((await owner.get(scopes + 'estimate-summary')).status()).toBe(404);
  return { ownerCode, recipientCode, list, content, scopes, activation, original };
}
