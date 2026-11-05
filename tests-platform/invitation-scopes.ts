import { expect } from '@playwright/test';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

export async function verifyScopeEdits(
  ownerRow: Locator,
  recipient: APIRequestContext,
  inbox: Page,
  scopePath: string,
  ownerCode: string,
  recipientCode: string,
) {
  const assessmentPath = scopePath.replace(/scopes\/$/, 'content');
  const assessment = await (await recipient.get(assessmentPath)).json();
  const history = await (await recipient.get(scopePath + 'history')).json();

  await ownerRow.getByText('Change sharing scopes', { exact: true }).click();
  await ownerRow.getByLabel('Estimate access (sample data)').selectOption('none');
  await ownerRow.getByRole('button', { name: 'Save sharing scopes' }).click();
  await expect(ownerRow.getByText('Assessment · History sample', { exact: true })).toBeVisible();
  expect((await recipient.get(scopePath + 'estimate-full')).status()).toBe(404);
  expect((await recipient.get(scopePath + 'estimate-summary')).status()).toBe(404);
  expect(await (await recipient.get(assessmentPath)).json()).toEqual(assessment);
  expect(await (await recipient.get(scopePath + 'history')).json()).toEqual(history);

  await inbox.getByRole('button', { name: 'Refresh invitations' }).click();
  await expect(inbox.getByRole('button', { name: 'Full estimate sample' })).toHaveCount(0);
  await inbox.getByLabel('Verified owner fingerprint').fill(ownerCode);
  await inbox.getByRole('button', { name: 'History sample' }).click();
  await expect(
    inbox.getByRole('region', { name: 'History sample' }).getByText('Checkpoint 1'),
  ).toBeVisible();
  await inbox.getByRole('button', { name: 'Open shared content' }).click();
  await expect(inbox.getByRole('heading', { name: 'Synthetic chapel' })).toBeVisible();

  await ownerRow.getByText('Change sharing scopes', { exact: true }).click();
  await ownerRow.getByLabel('Estimate access (sample data)').selectOption('estimate-summary');
  await ownerRow.getByLabel('Verified recipient fingerprint').fill(recipientCode);
  await ownerRow.getByRole('button', { name: 'Save sharing scopes' }).click();
  await expect(
    ownerRow.getByText('Assessment · Estimate summary sample · History sample'),
  ).toBeVisible();
  expect((await recipient.get(scopePath + 'estimate-summary')).status()).toBe(200);
  expect((await recipient.get(scopePath + 'estimate-full')).status()).toBe(404);
  expect(await (await recipient.get(scopePath + 'history')).json()).toEqual(history);
  await inbox.getByRole('button', { name: 'Refresh invitations' }).click();
  await inbox.getByLabel('Verified owner fingerprint').fill(ownerCode);
  await inbox.getByRole('button', { name: 'Estimate summary sample' }).click();
  await expect(inbox.getByRole('region', { name: 'Estimate summary sample' })).toBeVisible();
}
