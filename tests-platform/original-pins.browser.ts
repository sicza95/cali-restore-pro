import { createCipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const recipient = 'a1000000-0000-4000-8000-000000000000';
const sender = 'a2000000-0000-4000-8000-000000000000';
const project = 'b1000000-0000-4000-8000-000000000000';
const invitation = 'c1000000-0000-4000-8000-000000000000';
const id = 'd1000000-0000-4000-8000-000000000000';
const name = 'synthetic-plaster.bin';
const path = `/api/v1/invitations/${invitation}/files/${id}`;

test('an interrupted pin can retry; a completed pin works offline until revocation is learned', async ({
  page,
  context,
}, info) => {
  const source = randomBytes((1 << 20) + 31);
  const key = randomBytes(32);
  const manifest = Buffer.from(JSON.stringify({ v: 1, name, type: '', size: source.length }));
  const parts = [manifest, source.subarray(0, 1 << 20), source.subarray(1 << 20)].map(
    (plain, index) => {
      const iv = Buffer.alloc(12);
      iv.writeUInt32BE(index, 8);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(
        Buffer.from(JSON.stringify(['calirestore-original', 1, sender, project, id, index])),
      );
      return Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
    },
  );

  let revoked = false;
  let interrupt = true;
  let requests = 0;
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { account: { id: recipient, email: 'recipient@example.test' }, csrfToken: 'test' },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/v1/invitations', (route) =>
    route.fulfill({
      json: {
        invitations: [
          {
            id: invitation,
            projectId: project,
            state: 'active',
            coOwner: false,
            estimateScope: 'none',
            shareHistory: false,
          },
        ],
      },
    }),
  );
  await page.route('**' + path + '**', (route) => {
    requests++;
    if (revoked) return route.fulfill({ status: 404 });
    const part = new URL(route.request().url()).pathname.slice(path.length);
    if (!part)
      return route.fulfill({
        json: { sourceBytes: source.length, manifestBytes: parts[0].length },
      });
    if (interrupt && part === '/parts/2') return route.abort('internetdisconnected');
    return route.fulfill({ body: parts[Number(part.split('/').at(-1))] });
  });
  await page.goto('/invitations');
  const grant = await page.evaluate(
    async ({ recipient, sender, invitation, project, original }) => {
      const vaultPath = '/src/platform/vault/vault.ts';
      const sharingPath = '/src/platform/projects/fixture-sharing.ts';
      const { LocalVault } = (await import(
        vaultPath
      )) as typeof import('../src/platform/vault/vault');
      const { localSharingKey, sealProjectSnapshot, sharingFingerprint } = (await import(
        sharingPath
      )) as typeof import('../src/platform/projects/fixture-sharing');
      const receiver = new LocalVault(recipient, () => undefined);
      const owner = new LocalVault(sender, () => undefined);
      await receiver.create('aa'.repeat(32), true);
      await owner.create('bb'.repeat(32), false);
      const from = await localSharingKey(owner);
      const to = await localSharingKey(receiver);
      const envelope = await sealProjectSnapshot(
        from.pair,
        to.publicKey,
        { recipient, sender, invitation, project },
        {
          name: 'Chapel',
          revision: 1,
          objects: [{ name: 'Wall', surfaces: [{ name: 'Plaster', units: 'metric' }] }],
        },
        [original],
      );
      owner.close();
      receiver.close();
      return {
        envelope: { ...envelope, senderId: sender, senderKey: from.publicKey },
        fingerprint: await sharingFingerprint(from.publicKey),
      };
    },
    { recipient, sender, invitation, project, original: { id, name, key: key.toString('base64') } },
  );
  await page.route('**/api/v1/invitations/' + invitation + '/content', (route) =>
    route.fulfill({ json: grant.envelope }),
  );
  const unlock = async () => {
    await page.reload();
    await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  };
  await unlock();
  await page.getByLabel('Verified owner fingerprint').fill(grant.fingerprint);
  await page.getByRole('button', { name: 'Open shared content' }).click();
  const pin = page.getByRole('button', { name: 'Make available offline' });
  const shelf = page.getByRole('region', { name: 'Offline originals' });
  await pin.click();
  await expect(
    page.getByRole('region', { name: 'Shared originals' }).getByRole('alert'),
  ).toBeVisible();
  await expect(shelf.getByText(name)).toHaveCount(0);
  interrupt = false;
  await pin.click();
  await expect(shelf.getByText(name)).toBeVisible();
  await expect(page.getByText('Available offline', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.screenshot({ path: info.outputPath('pins-landscape.png'), fullPage: true });

  // The shelf survives navigation and doesn't need the shared project to be opened again.
  await unlock();
  await expect(shelf.getByText(name)).toBeVisible();
  await page.setViewportSize({ width: 834, height: 1194 });
  await context.setOffline(true);
  const before = requests;
  revoked = true;
  const download = page.waitForEvent('download');
  await shelf.getByRole('button', { name: 'Save a copy' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(name);
  expect(await readFile(await file.path())).toEqual(source);
  expect(requests).toBe(before);
  await page.screenshot({ path: info.outputPath('pins-portrait.png'), fullPage: true });

  const denial = page.waitForResponse(
    (response) => response.url().endsWith(path) && response.status() === 404,
  );
  await context.setOffline(false);
  await denial;
  await expect(shelf.getByText(name)).toHaveCount(0);
  await unlock();
  await expect(page.getByRole('button', { name: 'Show my sharing fingerprint' })).toBeVisible();
  await context.setOffline(true);
  await expect(shelf.getByRole('button', { name: 'Save a copy' })).toHaveCount(0);
});
