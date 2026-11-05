import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export async function verifyHostingTransfer(
  inbox: Page,
  ownerPage: Page,
  ownerList: Locator,
  recipientOwners: Locator,
  owners: string,
  removeHost: string,
  ownerAccountId: string,
  session: { account: { id: string }; csrfToken: string },
  mutation: { headers: { Origin: string; 'X-CSRF-Token': string }; data: object },
) {
  const owner = ownerPage.request;
  const recipient = inbox.request;
  const projectPath = owners.slice(0, -'/owners'.length);
  const file = projectPath + '/files/5c39da35-dea3-4049-9d7e-ff4a3e4119db';
  const reservation = { sourceBytes: 600000, manifestBytes: 32 };
  expect((await owner.put(file, { ...mutation, data: reservation })).status()).toBe(200);

  await ownerList.getByRole('button', { name: 'Offer hosting transfer' }).click();
  await expect(ownerList.getByText(/Awaiting hosting acceptance/)).toBeVisible();
  const pending = await (await owner.get(owners)).json();
  expect(pending.owners.find((row: { host: boolean }) => row.host).id).toBe(ownerAccountId);
  const accept = projectPath + '/hosting-transfer/' + pending.hostingTransfer.id + '/accept';
  expect((await owner.post(accept, mutation)).status()).toBe(404);
  const stillHost = await owner.post(removeHost, mutation);
  expect(await stillHost.json()).toEqual({ error: 'owner_is_project_host' });

  await inbox
    .locator('details.invitation-panel')
    .getByRole('button', { name: 'Refresh invitations' })
    .click();
  inbox.once('dialog', (dialog) => dialog.accept());
  await recipientOwners.getByRole('button', { name: 'Accept hosting transfer' }).click();
  await expect(
    recipientOwners.getByRole('button', { name: 'Accept hosting transfer' }),
  ).toHaveCount(0);
  const accepted = await (await recipient.get(owners)).json();
  expect(accepted.hostingTransfer).toBeNull();
  expect(accepted.owners.find((row: { host: boolean }) => row.host).id).toBe(session.account.id);
  expect((await owner.put(file, { ...mutation, data: reservation })).status()).toBe(404);
  const recipientMutation = {
    headers: { Origin: mutation.headers.Origin, 'X-CSRF-Token': session.csrfToken },
    data: reservation,
  };
  expect((await recipient.put(file, recipientMutation)).status()).toBe(200);
  const excess = await recipient.put(
    projectPath + '/files/8419bb28-4783-4f90-b994-be8203832be0',
    recipientMutation,
  );
  expect(await excess.json()).toEqual({ error: 'storage_quota_exceeded' });

  inbox.once('dialog', (dialog) => dialog.accept());
  await recipientOwners.getByRole('button', { name: 'Remove co-owner' }).click();
  await expect(recipientOwners.getByText('owner@example.test')).toHaveCount(0);
  expect((await owner.get(owners)).status()).toBe(404);
  const finalOwners = await (await recipient.get(owners)).json();
  expect(finalOwners.owners).toEqual([
    { id: session.account.id, email: 'recipient@example.test', host: true },
  ]);
}
