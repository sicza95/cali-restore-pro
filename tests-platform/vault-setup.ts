import type { Page } from '@playwright/test';

export async function setupRememberedVault(page: Page) {
  await page.getByLabel(/Remember this browser/).check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
  await page.getByLabel('I saved the recovery key').check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
}
