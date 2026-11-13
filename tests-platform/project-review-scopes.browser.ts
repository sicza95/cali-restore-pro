import { expect, test } from '@playwright/test';
import { reportControls } from '../src/ui/account-access/project-review/report-controls';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';

test('encrypted invitation grants separate assessment, summary and full estimates', async ({
  page,
}) => {
  const ids = {
    project: crypto.randomUUID(),
    invitation: crypto.randomUUID(),
    sender: owner,
    recipient: other,
  };
  let estimateScope: 'none' | 'estimate-summary' | 'estimate-full' = 'none';
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: { id: other, email: 'recipient@example.test', state: 'active', role: 'member' },
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.goto('/login');
  const fixture = await page.evaluate(async (ids) => {
    const vaultPath = '/src/platform/vault/vault.ts';
    const sharingPath = '/src/platform/projects/fixture-sharing.ts';
    const { LocalVault } = (await import(
      vaultPath
    )) as typeof import('../src/platform/vault/vault');
    const { localSharingKey, sealScope, sealProjectSnapshot, sharingFingerprint } = (await import(
      sharingPath
    )) as typeof import('../src/platform/projects/fixture-sharing');
    const snapshotsPath = '/src/platform/estimates/snapshots.ts';
    const { snapshot, summary } = (await import(
      snapshotsPath
    )) as typeof import('../src/platform/estimates/snapshots');
    const issued = snapshot(
      {
        schema: 1,
        project: ids.project,
        revision: 2,
        currency: 'EUR',
        priceCurrency: 'EUR',
        objects: [{ id: 'wall', name: 'Wall', surfaces: ['plaster'] }],
        selected: ['wall'],
        phases: [
          {
            id: 'clean',
            name: 'Private cleaning phase',
            archived: false,
            surface: 'plaster',
            scope: 'cleaning-mask',
            measurement: 'missing',
            mode: 'time',
            time: '20',
            productivity: {},
            multiplier: '1',
            price: 'hourly',
            rate: { hourly: '62.50' },
            material: '0',
            units: 'm²',
          },
        ],
        extras: [],
        adjustments: [],
        tax: { enabled: false, rate: '0' },
        assumptions: 'Private assumptions',
      },
      1,
      true,
    );
    const sender = new LocalVault(ids.sender, () => undefined);
    const recipient = new LocalVault(ids.recipient, () => undefined);
    try {
      await sender.create('aa'.repeat(32), false);
      await recipient.create('bb'.repeat(32), true);
      const source = await localSharingKey(sender);
      const target = await localSharingKey(recipient);
      const shared = { senderId: ids.sender, senderKey: source.publicKey };
      const [assessment, scopedSummary, full, code] = await Promise.all([
        sealProjectSnapshot(source.pair, target.publicKey, ids, {
          name: 'Shared chapel',
          revision: 2,
          objects: [{ name: 'Wall', surfaces: [{ name: 'Plaster', units: 'metric' }] }],
        }),
        sealScope(source.pair, target.publicKey, ids, 'estimate-summary', summary(issued, 3)),
        sealScope(source.pair, target.publicKey, ids, 'estimate-full', {
          schema: 1,
          scope: 'estimate-full',
          snapshot: issued,
        }),
        sharingFingerprint(source.publicKey),
      ]);
      return {
        assessment: { ...assessment, ...shared },
        summary: { ...scopedSummary, ...shared },
        full: { ...full, ...shared },
        code,
      };
    } finally {
      sender.close();
      recipient.close();
    }
  }, ids);

  const sent: string[] = [];
  await page.route('**/api/v1/invitations', (route) =>
    route.fulfill({
      json: {
        invitations: [
          {
            id: ids.invitation,
            projectId: ids.project,
            state: 'active',
            coOwner: false,
            estimateScope,
            shareHistory: false,
          },
        ],
      },
    }),
  );
  await page.route('**/api/v1/invitations/' + ids.invitation + '/**', (route) => {
    const path = new URL(route.request().url()).pathname.split('/').at(-1);
    if (path === 'checkpoints') return route.fulfill({ json: { checkpointIds: [] } });
    if (path === 'content') return route.fulfill({ json: fixture.assessment });
    if (path === estimateScope) {
      sent.push(path);
      return route.fulfill({ json: path === 'estimate-summary' ? fixture.summary : fixture.full });
    }
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  });

  await page.goto('/invitations');
  await expect(page.getByText('Shared chapel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  const code = page.getByLabel('Verified owner fingerprint');
  expect(reportControls.some(({ id }) => id === 'estimate.scope.projection')).toBe(true);
  const projection = page.locator('[data-control-id="estimate.scope.projection"]');
  await expect(page.getByRole('button', { name: /estimate .*sample/i })).toHaveCount(0);
  await code.fill(fixture.code);
  await page.getByRole('button', { name: 'Open shared content' }).click();
  await expect(page.getByRole('heading', { name: 'Shared chapel' })).toBeVisible();
  await expect(projection).toHaveCount(0);
  await expect(page.locator('[data-control-id="estimate.finance.snapshot"]')).toHaveCount(0);
  estimateScope = 'estimate-summary';
  await page.getByRole('button', { name: 'Refresh invitations' }).click();
  const summary = page.getByRole('button', { name: 'Estimate summary sample' });
  await expect(page.getByRole('button', { name: 'Full estimate sample' })).toHaveCount(0);
  await code.fill('0'.repeat(64));
  await summary.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(projection).toHaveCount(0);
  await code.fill(fixture.code);
  await summary.click();
  await expect(projection).toContainText('1250.00');
  await projection.getByRole('button', { name: 'Preview draft' }).click();
  const draft = page.getByRole('dialog');
  await expect(draft).toContainText('1250.00');
  await expect(draft).toContainText('Earlier estimate version');
  await expect(draft).not.toContainText('Private cleaning phase');
  await expect(draft).not.toContainText('62.50');
  await expect(draft).not.toContainText('Materials');
  await draft.getByRole('button', { name: 'Cancel preview' }).click();
  await expect(projection).not.toContainText('62.50 EUR/h');
  await expect(projection).not.toContainText('20 h');
  await expect(page.locator('[data-control-id="estimate.finance.snapshot"]')).toHaveCount(0);
  estimateScope = 'estimate-full';
  await page.getByRole('button', { name: 'Refresh invitations' }).click();
  await expect(projection).toHaveCount(0);
  await code.fill(fixture.code);
  await page.getByRole('button', { name: 'Full estimate sample' }).click();
  await projection.getByRole('button', { name: 'Preview draft' }).click();
  await expect(draft).toContainText('1250.00');
  await expect(draft).toContainText('Private cleaning phase');
  await expect(draft).toContainText('Freshness was not recorded');
  await expect(draft).toContainText('62.50 EUR/h');
  await draft.getByRole('button', { name: 'Cancel preview' }).click();
  await expect(page.locator('[data-control-id="estimate.finance.snapshot"]')).toHaveCount(0);
  expect(sent).toEqual(['estimate-summary', 'estimate-summary', 'estimate-full']);
  await page.goto('/projects/' + ids.project + '/reports');
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await expect(
    page.getByText('This project or surface is unavailable on this device.'),
  ).toBeVisible();
  await expect(page.locator('[data-control-id="report.review.preview"]')).toHaveCount(0);
});
