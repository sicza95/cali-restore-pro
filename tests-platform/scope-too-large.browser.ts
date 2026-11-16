import { expect, test } from '@playwright/test';

const owner = '00000000-0000-4000-8000-000000000001';
const recipient = '00000000-0000-4000-8000-000000000002';
const invitation = '00000000-0000-4000-8000-0000000000a1';

// #88: a full estimate over the server's scope grant limit is refused in the browser, with its
// own message instead of the generic "check your access" one, and nothing is sent.
test('an estimate too large to share shows its own error and sends nothing', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/v1/')) sent.push(request.url());
  });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: { id: owner, email: 'restorer@example.test', state: 'active', role: 'member' },
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.goto('/projects');
  const fixture = await page.evaluate(
    async ({ owner }) => {
      const load = (path: string): Promise<unknown> => import(path);
      const { LocalVault } = (await load(
        '/src/platform/vault/vault.ts',
      )) as typeof import('../src/platform/vault/vault');
      const { localProjects, newProject } = (await load(
        '/src/platform/projects/projects.ts',
      )) as typeof import('../src/platform/projects/projects');
      const { estimateRepository } = (await load(
        '/src/platform/estimates/persistence.ts',
      )) as typeof import('../src/platform/estimates/persistence');
      const { snapshot } = (await load(
        '/src/platform/estimates/snapshots.ts',
      )) as typeof import('../src/platform/estimates/snapshots');
      const { largeEstimate, withLongNames } = (await load(
        '/tests-platform/fixtures/large-estimate.ts',
      )) as typeof import('./fixtures/large-estimate');
      const vault = new LocalVault(owner, () => undefined);
      try {
        await vault.create('ab'.repeat(32), true);
        const project = newProject('Large chapel', 'North wall', 'Upper plaster', 'HUF');
        await localProjects(vault).save(project);
        // The device keeps an estimate in 64 Ki characters, so only three-byte characters take a
        // full scope over the 64 KiB limit: 30 objects named in euro signs seal to about 72 KB.
        const issued = snapshot(withLongNames(largeEstimate(30, 1, 1, project.id), '€'), 1, true);
        await estimateRepository(vault).save(project.id, 0, {
          schema: 1,
          draft: largeEstimate(1, 1, 1, project.id),
          snapshots: [issued],
        });
        const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
          'deriveBits',
        ]);
        const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
        const hex = (value: ArrayBuffer) =>
          Array.from(new Uint8Array(value), (b) => b.toString(16).padStart(2, '0')).join('');
        return {
          id: project.id,
          recipientKey: btoa(String.fromCharCode(...new Uint8Array(raw))),
          fingerprint: hex(await crypto.subtle.digest('SHA-256', raw)),
        };
      } finally {
        vault.close();
      }
    },
    { owner },
  );
  const hosted = '**/api/v1/hosted-projects/' + fixture.id;
  await page.route(hosted + '/invitations', (route) =>
    route.fulfill({
      json: {
        invitations: [
          {
            id: invitation,
            state: 'accepted',
            coOwner: false,
            email: 'recipient@example.test',
            recipientId: recipient,
            recipientKey: fixture.recipientKey,
            estimateScope: 'estimate-full',
            shareHistory: false,
          },
        ],
      },
    }),
  );
  await page.route(hosted + '/owners', (route) =>
    route.fulfill({
      json: {
        owners: [{ id: owner, email: 'restorer@example.test', host: true }],
        hostingTransfer: null,
      },
    }),
  );

  await page.goto('/projects/' + fixture.id);
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await page.locator('[data-control-id="project.collaboration"]').click();
  await page.locator('[data-control-id="sharing.recipient-code"]').fill(fixture.fingerprint);
  await page.locator('[data-control-id="sharing.activate"]').click();
  const alert = page.locator('.invitation-panel [role=alert]');
  await expect(alert).toHaveText(
    'The estimate is too large to share. Choose the estimate summary or no estimate access.',
  );
  await expect(page.locator('[data-control-id="sharing.activate"]')).toBeEnabled();
  await page.getByLabel('App language').selectOption('hu');
  await expect(alert).toHaveText(
    'A becslés túl nagy a megosztáshoz. Válaszd a becslési összesítőt, vagy ne adj hozzáférést a becsléshez.',
  );
  expect(sent).toEqual([]);
  expect(errors).toEqual([]);
});
