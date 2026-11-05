import { expect, test } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

const first = '10000000-0000-4000-8000-000000000001';
const second = '20000000-0000-4000-8000-000000000002';
const sample = 'Synthetic plaster test – not a project';
const vault = (page: Page) => page.getByRole('region', { name: 'Local content vault' });
const button = (page: Page, name: string) => vault(page).getByRole('button', { name, exact: true });

async function session(page: Page, account: () => string = () => first) {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { account: { id: account(), email: 'synthetic@example.test' }, csrfToken: 'fixture' },
    }),
  );
  await page.route('**/api/v1/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { ready: true } }));
  await page.goto('/settings/security');
}

async function setup(page: Page, remember: boolean) {
  if (remember) await vault(page).getByLabel('Remember this browser').check();
  await button(page, 'Set up vault').click();
  const key = await vault(page)
    .getByRole('textbox', { name: 'Recovery key', exact: true })
    .inputValue();
  await vault(page).getByLabel('I saved the recovery key').check();
  await button(page, 'Set up vault').click();
  await vault(page).getByLabel('Sample text').fill(sample);
  await button(page, 'Save encrypted text').click();
  await expect(vault(page).getByText('Saved on this browser')).toBeVisible();
  return key;
}

async function downloaded(page: Page, action: () => Promise<void>) {
  const result = page.waitForEvent('download');
  await action();
  const file: Download = await result;
  return readFile((await file.path())!);
}

async function restore(page: Page, key: string, file: Buffer) {
  const region = vault(page);
  const details = region.locator('details').filter({ hasText: 'Restore from recovery file' });
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  await details.getByLabel('Recovery key').fill(key);
  await details.getByLabel('Encrypted file').setInputFiles({
    name: 'snapshot.json',
    mimeType: 'application/json',
    buffer: file,
  });
  await details.getByRole('button', { name: 'Restore from recovery file' }).click();
}

test('committed ciphertext survives reload and restores only with the right account and key', async ({
  page,
  browser,
}, info) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await session(page);
  const key = await setup(page, true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('vault-landscape.png'), fullPage: true });
  const file = await downloaded(page, () => button(page, 'Download recovery file').click());
  expect(file.toString()).not.toContain(sample);
  expect(file.toString()).not.toContain(key);
  expect(
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const req = indexedDB.open('calirestore-vault');
        req.onsuccess = () => resolve(req.result);
      });
      const rows = await new Promise<unknown[]>((resolve) => {
        const req = db.transaction('accounts').objectStore('accounts').getAll();
        req.onsuccess = () => resolve(req.result as unknown[]);
      });
      db.close();
      return JSON.stringify(rows);
    }),
  ).not.toContain(sample);

  await page.reload();
  await expect(vault(page).getByText('Vault locked')).toBeVisible();
  await button(page, 'Unlock on this remembered browser').click();
  await expect(vault(page).getByLabel('Sample text')).toHaveValue(sample);
  await button(page, 'Lock vault').click();
  await expect(vault(page).getByLabel('Sample text')).toHaveCount(0);
  await button(page, 'Unlock on this remembered browser').click();
  const otherTab = await page.context().newPage();
  await session(otherTab);
  await button(otherTab, 'Unlock on this remembered browser').click();
  await expect(vault(otherTab).getByLabel('Sample text')).toHaveValue(sample);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(vault(otherTab)).toHaveCount(0);
  await expect(vault(page)).toHaveCount(0);

  const fresh = await browser.newContext({
    viewport: { width: 834, height: 1194 },
    colorScheme: 'dark',
  });
  const target = await fresh.newPage();
  let active = second;
  await session(target, () => active);
  await restore(target, key, file);
  await expect(vault(target).getByRole('alert')).toBeVisible();
  active = first;
  await target.reload();
  await restore(target, 'ab'.repeat(32), file);
  await expect(vault(target).getByRole('alert')).toBeVisible();
  const envelope = JSON.parse(file.toString()) as { ciphertext: string };
  envelope.ciphertext = (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1);
  await restore(target, key, Buffer.from(JSON.stringify(envelope)));
  await expect(vault(target).getByRole('alert')).toBeVisible();
  await restore(target, key, file);
  await expect(vault(target).getByLabel('Sample text')).toHaveValue(sample);
  await target.reload();
  await expect(button(target, 'Unlock on this remembered browser')).toHaveCount(0);
  await expect(vault(target).getByText('Vault locked')).toBeVisible();
  await target.screenshot({ path: info.outputPath('vault-portrait.png'), fullPage: true });
  await vault(target).getByLabel('Recovery key').fill(key);
  await button(target, 'Unlock with recovery key').click();
  await expect(vault(target).getByLabel('Sample text')).toHaveValue(sample);
  active = second;
  await target.reload();
  await expect(vault(target).getByText('No vault on this browser')).toBeVisible();
  await fresh.close();
});

test('trusted-device approval copies committed work and forget requires deliberate discard', async ({
  page,
  browser,
}) => {
  await session(page);
  await setup(page, true);
  const peer = await browser.newContext();
  const target = await peer.newPage();
  await session(target);
  await vault(target).locator('summary').filter({ hasText: 'Request device approval' }).click();
  await button(target, 'Request device approval').click();
  const code = await vault(target).getByLabel('Pairing code').inputValue();
  const newRecovery = await vault(target)
    .getByLabel('Recovery key', { exact: true })
    .first()
    .inputValue();
  const approval = vault(page)
    .locator('details')
    .filter({ hasText: 'Download device approval file' });
  await approval.locator('summary').click();
  await approval.getByLabel('Pairing code').fill(code);
  const file = await downloaded(page, () => button(page, 'Download device approval file').click());
  const receive = vault(target).locator('details').filter({ hasText: 'Open device approval file' });
  await receive.getByLabel('Encrypted file').setInputFiles({
    name: 'approval.json',
    mimeType: 'application/json',
    buffer: file,
  });
  await expect(button(target, 'Open device approval file')).toBeDisabled();
  await vault(target).getByLabel('I saved the recovery key').check();
  await button(target, 'Open device approval file').click();
  await expect(vault(target).getByLabel('Sample text')).toHaveValue(sample);
  await target.reload();
  await vault(target).getByLabel('Recovery key').fill(newRecovery);
  await button(target, 'Unlock with recovery key').click();
  await expect(vault(target).getByLabel('Sample text')).toHaveValue(sample);
  await vault(page).locator('summary').filter({ hasText: 'Forget this browser' }).click();
  await expect(button(page, 'Forget this browser')).toBeDisabled();
  await vault(page).getByLabel('I agree to discard').check();
  await button(page, 'Forget this browser').click();
  await expect(vault(page).getByText('No vault on this browser')).toBeVisible();
  await page.reload();
  await expect(vault(page).getByText('No vault on this browser')).toBeVisible();
  await expect(vault(target).getByLabel('Sample text')).toHaveValue(sample);
  await peer.close();
});

test('an interrupted save leaves the previous transaction readable', async ({ page }) => {
  await session(page);
  await setup(page, true);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      const request = put.apply(this, args);
      request.addEventListener('success', () => this.transaction.abort(), { once: true });
      return request;
    };
  });
  await vault(page).getByLabel('Sample text').fill('This transaction must not survive');
  await button(page, 'Save encrypted text').click();
  await expect(vault(page).getByRole('alert')).toBeVisible();
  await page.reload();
  await button(page, 'Unlock on this remembered browser').click();
  await expect(vault(page).getByLabel('Sample text')).toHaveValue(sample);
});

test('reads an independent AES-GCM and HKDF test vector', async ({ page }) => {
  await session(page);
  const file = await readFile(new URL('./fixtures/vault-v1.json', import.meta.url));
  await restore(page, '01'.repeat(32), file);
  await expect(vault(page).getByLabel('Sample text')).toHaveValue('vault vector v1');
});

test('a stale tab cannot overwrite a newer committed save', async ({ page, context }) => {
  await session(page);
  await setup(page, true);
  const stale = await context.newPage();
  await session(stale);
  await button(stale, 'Unlock on this remembered browser').click();
  await expect(vault(stale).getByLabel('Sample text')).toHaveValue(sample);
  await vault(page).getByLabel('Sample text').fill('Newer committed copy');
  await button(page, 'Save encrypted text').click();
  await expect(vault(page).getByText('Saved on this browser')).toBeVisible();
  await vault(stale).getByLabel('Sample text').fill('Stale conflicting copy');
  await button(stale, 'Save encrypted text').click();
  await expect(vault(stale).getByRole('alert')).toBeVisible();
  await button(stale, 'Lock vault').click();
  await expect(vault(page).getByText('Vault locked')).toBeVisible();
  await button(stale, 'Unlock on this remembered browser').click();
  await expect(vault(stale).getByLabel('Sample text')).toHaveValue('Newer committed copy');
});
