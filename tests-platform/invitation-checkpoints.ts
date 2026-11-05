import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { checkpointSamples } from '../src/platform/projects/checkpoint-samples';

export async function verifyCheckpointGrants(
  ownerRow: Locator,
  remainingRow: Locator,
  inbox: Page,
  remainingInbox: Page,
  recipientPath: string,
  remainingPath: string,
  ownerCode: string,
  recipientCode: string,
  remainingCode: string,
) {
  const [baseline, followUp, final] = checkpointSamples;
  const recipient = inbox.request;
  const remaining = remainingInbox.request;
  const checkPath = (path: string) => path.replace(/scopes\/$/, 'checkpoints');
  const first = checkPath(recipientPath);
  const second = checkPath(remainingPath);
  const grant = async (row: Locator, code: string, title: string) => {
    const panel = row.locator('details').filter({ hasText: 'Share selected checkpoints' });
    if (!(await panel.evaluate((element: HTMLDetailsElement) => element.open))) {
      await panel.getByText('Share selected checkpoints', { exact: true }).click();
      await panel.getByLabel('Verified recipient fingerprint').fill(code);
    }
    await panel.getByRole('button', { name: 'Share checkpoint: ' + title }).click();
    await expect(
      panel.getByRole('button', { name: 'Remove checkpoint access: ' + title }),
    ).toBeVisible();
    return panel;
  };

  const refresh = async (page: Page) => {
    await page.getByRole('button', { name: 'Refresh invitations' }).click();
    const panel = page
      .locator('details')
      .filter({ has: page.locator('summary', { hasText: /^Shared checkpoints$/ }) });
    await panel.getByText('Shared checkpoints', { exact: true }).click();
    return panel;
  };

  expect(await (await recipient.get(first)).json()).toEqual({ checkpointIds: [] });
  await grant(ownerRow, recipientCode, baseline.title);
  const controls = await grant(remainingRow, remainingCode, followUp.title);
  await grant(remainingRow, remainingCode, final.title);

  expect(await (await recipient.get(first)).json()).toEqual({ checkpointIds: [baseline.id] });
  expect(await (await remaining.get(second)).json()).toEqual({
    checkpointIds: [followUp.id, final.id],
  });
  for (const response of await Promise.all([
    recipient.get(first + '/' + followUp.id),
    remaining.get(second + '/' + baseline.id),
    recipient.get(second + '/' + followUp.id),
    remaining.get(first + '/' + baseline.id),
    recipient.get(second),
  ]))
    expect(response.status()).toBe(404);

  const firstPanel = await refresh(inbox);
  await firstPanel.getByLabel('Verified checkpoint sender fingerprint').fill(ownerCode);
  await expect(firstPanel.getByRole('button', { name: /^Open checkpoint/ })).toHaveCount(1);
  await firstPanel.getByRole('button', { name: 'Open checkpoint 1' }).click();
  await expect(firstPanel.getByRole('heading', { name: baseline.title })).toBeVisible();

  const secondPanel = await refresh(remainingInbox);
  await secondPanel.getByLabel('Verified checkpoint sender fingerprint').fill(ownerCode);
  const envelopeResponse = await remaining.get(second + '/' + followUp.id);
  expect(envelopeResponse.status()).toBe(200);
  const session = await (await recipient.get('/api/v1/auth/me')).json();
  const invitation = second.split('/').at(-2);
  const remainingList = await (await remaining.get('/api/v1/invitations')).json();
  const projectId = remainingList.invitations.find(
    (row: { id: string }) => row.id === invitation,
  ).projectId;
  const ownerPath =
    '/api/v1/hosted-projects/' + projectId + '/invitations/' + invitation + '/checkpoints';
  expect((await recipient.get(ownerPath)).status()).toBe(404);
  expect(
    (
      await recipient.delete(ownerPath + '/' + followUp.id, {
        headers: { Origin: new URL(inbox.url()).origin, 'X-CSRF-Token': session.csrfToken },
      })
    ).status(),
  ).toBe(404);
  const envelope = await envelopeResponse.json();
  expect(envelope).not.toHaveProperty('title');
  const secondButton = secondPanel.getByRole('button', { name: 'Open checkpoint 2' });
  await remainingInbox.route(
    '**' + second + '/' + final.id,
    (route) => route.fulfill({ json: { ...envelope, checkpointId: final.id } }),
    { times: 1 },
  );
  await secondButton.click();
  await expect(secondPanel.getByRole('alert')).toBeVisible();
  await expect(secondPanel.getByRole('heading')).toHaveCount(0);
  await secondButton.click();
  await expect(secondPanel.getByRole('heading', { name: final.title })).toBeVisible();
  await secondPanel.getByRole('button', { name: 'Open checkpoint 1' }).click();
  await expect(secondPanel.getByRole('heading', { name: followUp.title })).toBeVisible();

  await controls
    .getByRole('button', { name: 'Remove checkpoint access: ' + followUp.title })
    .click();
  await expect(
    controls.getByRole('button', { name: 'Share checkpoint: ' + followUp.title }),
  ).toBeVisible();
  expect((await remaining.get(second + '/' + followUp.id)).status()).toBe(404);
  expect((await remaining.get(second + '/' + final.id)).status()).toBe(200);
  expect((await recipient.get(first + '/' + baseline.id)).status()).toBe(200);
  return {
    revokedWithInvitation: first + '/' + baseline.id,
    preservedDuringRotation: second + '/' + final.id,
  };
}
