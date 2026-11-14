import { createCipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { build } from 'vite';

const recipient = 'a1000000-0000-4000-8000-000000000000';
const sender = 'a2000000-0000-4000-8000-000000000000';
const project = 'b1000000-0000-4000-8000-000000000000';
const invitation = 'c1000000-0000-4000-8000-000000000000';
const id = 'd1000000-0000-4000-8000-000000000000';
const name = 'synthetic-plaster.bin';
const path = `/api/v1/invitations/${invitation}/files/${id}`;

test('an interrupted pin can retry; a completed pin works offline until revocation is learned', async ({
  page: onlinePage,
  context,
}, info) => {
  let page = onlinePage;
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
  await context.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { account: { id: recipient, email: 'recipient@example.test' }, csrfToken: 'test' },
    }),
  );
  await context.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await context.route('**/api/v1/invitations', (route) =>
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
  await context.route('**' + path + '**', (route) => {
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
  const bundle = await build({
    configFile: false,
    worker: { format: 'es' },
    logLevel: 'silent',
    build: {
      write: false,
      lib: { entry: 'tests-platform/fixtures/offline-grant.ts', formats: ['es'] },
    },
  });
  if (!Array.isArray(bundle)) throw new Error('Expected bundled grant fixture');
  const script = bundle[0].output.find((file) => file.type === 'chunk');
  if (!script) throw new Error('Missing grant fixture');
  await context.route('**/__offline-grant.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: script.code }),
  );
  const origin = 'http://127.0.0.1:4186';
  await page.goto(origin + '/invitations');
  const grant = await page.evaluate(
    async (input) => {
      const fixture = '/__offline-grant.js';
      const { createGrant } = (await import(fixture)) as typeof import('./fixtures/offline-grant');
      return createGrant(input);
    },
    { recipient, sender, invitation, project, original: { id, name, key: key.toString('base64') } },
  );
  await context.route('**/api/v1/invitations/' + invitation + '/content', (route) =>
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
  const shelf = () => page.getByRole('region', { name: 'Offline originals' });
  await pin.click();
  await expect(
    page.getByRole('region', { name: 'Shared originals' }).getByRole('alert'),
  ).toBeVisible();
  await expect(shelf().getByText(name)).toHaveCount(0);
  interrupt = false;
  await pin.click();
  await expect(shelf().getByText(name)).toBeVisible();
  await expect(page.getByText('Available offline', { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state),
    )
    .toBe('activated');
  const offlinePath = '/offline-originals';
  await expect(page.getByRole('link', { name: 'Offline originals' })).toHaveAttribute(
    'href',
    offlinePath,
  );
  await page.close();
  page = await context.newPage();
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  const shell = await page.goto(origin + offlinePath);
  expect(shell?.fromServiceWorker()).toBe(true);
  // Chromium headless shell can reset the page's connectivity signal on a
  // service-worker navigation. Reapply it to the loaded page before unlocking.
  const session = await context.newCDPSession(page);
  const showOffline = (offline: boolean) =>
    session.send('Network.overrideNetworkState', {
      offline,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  await showOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(page.getByText('Vault locked', { exact: true })).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);
  const recovery = page.getByLabel('Recovery key', { exact: true });
  const unlockWithKey = page.getByRole('button', { name: 'Unlock with recovery key' });
  await recovery.fill('ff'.repeat(32));
  await unlockWithKey.click();
  await expect(page.getByRole('alert')).toContainText('The vault action failed');
  await expect(page.getByText(name)).toHaveCount(0);
  await recovery.fill('aa'.repeat(32));
  await unlockWithKey.click();
  await expect(shelf().getByText(name)).toBeVisible();
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
  await expect(page.getByText(name)).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await expect(shelf().getByText(name)).toBeVisible();
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.screenshot({ path: info.outputPath('pins-landscape.png'), fullPage: true });
  await page.setViewportSize({ width: 834, height: 1194 });
  const before = requests;
  revoked = true;
  await shelf().getByRole('button', { name: 'Prepare a copy' }).click();
  const prepared = shelf().getByRole('link', { name: 'Download prepared copy' });
  await expect(prepared).toBeVisible();
  const [file] = await Promise.all([page.waitForEvent('download'), prepared.click()]);
  expect(file.suggestedFilename()).toBe(name);
  expect(await readFile(await file.path())).toEqual(source);
  expect(requests).toBe(before);
  await page.screenshot({ path: info.outputPath('pins-portrait.png'), fullPage: true });

  const denial = page.waitForResponse(
    (response) => response.url().endsWith(path) && response.status() === 404,
  );
  await context.setOffline(false);
  await showOffline(false);
  await denial;
  await expect(shelf().getByText(name)).toHaveCount(0);
  await expect(shelf().getByRole('link', { name: 'Download prepared copy' })).toHaveCount(0);
  await expect(shelf().getByRole('status')).toHaveText(
    'Removed offline copies you can no longer access.',
  );
  await context.setOffline(true);
  await unlock();
  await expect(shelf().getByText('No originals are pinned on this browser.')).toBeVisible();
  await expect(shelf().getByRole('button', { name: 'Prepare a copy' })).toHaveCount(0);
});
