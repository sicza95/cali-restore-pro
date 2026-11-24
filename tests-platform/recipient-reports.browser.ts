import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { chooseLanguage } from './app-navigation';

const owner = '00000000-0000-4000-8000-000000000031';
const recipient = '00000000-0000-4000-8000-000000000032';
const withEstimate = '00000000-0000-4000-8000-0000000000e1';
const assessmentOnly = '00000000-0000-4000-8000-0000000000e2';
const label = 'Recipient draft from shared content. Not issued by the project owner.';
type Load = (path: string) => Promise<unknown>;

async function signIn(context: BrowserContext, account: string) {
  await context.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { account: { id: account, email: account + '@example.test', state: 'active' } },
    }),
  );
  await context.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  const page = await context.newPage();
  await page.goto('/projects');
  return page;
}

/** The recipient's remembered vault and its sharing public key. */
function recipientKey(page: Page) {
  return page.evaluate(async (account) => {
    const load: Load = (path) => import(path);
    const { LocalVault } = (await load(
      '/src/platform/vault/vault.ts',
    )) as typeof import('../src/platform/vault/vault');
    const { localSharingKey } = (await load(
      '/src/platform/projects/fixture-sharing.ts',
    )) as typeof import('../src/platform/projects/fixture-sharing');
    const vault = new LocalVault(account, () => undefined);
    try {
      await vault.openWithoutKey();
      return (await localSharingKey(vault)).publicKey;
    } finally {
      vault.close();
    }
  }, recipient);
}

/** The owner's project with an issued estimate, sealed to the recipient for two grants. */
function ownerGrants(page: Page, recipientKey: string) {
  return page.evaluate(
    async ({ owner, recipient, recipientKey, grants }) => {
      const load: Load = (path) => import(path);
      const { LocalVault } = (await load(
        '/src/platform/vault/vault.ts',
      )) as typeof import('../src/platform/vault/vault');
      const sharing = (await load(
        '/src/platform/projects/fixture-sharing.ts',
      )) as typeof import('../src/platform/projects/fixture-sharing');
      const { localProjects, newProject } = (await load(
        '/src/platform/projects/projects.ts',
      )) as typeof import('../src/platform/projects/projects');
      const { projectSnapshot } = (await load(
        '/src/platform/projects/shared-project.ts',
      )) as typeof import('../src/platform/projects/shared-project');
      const { estimateRepository } = (await load(
        '/src/platform/estimates/persistence.ts',
      )) as typeof import('../src/platform/estimates/persistence');
      const { scopeContent } = (await load(
        '/src/platform/estimates/scopes.ts',
      )) as typeof import('../src/platform/estimates/scopes');
      const { snapshot } = (await load(
        '/src/platform/estimates/snapshots.ts',
      )) as typeof import('../src/platform/estimates/snapshots');
      const { largeEstimate } = (await load(
        '/tests-platform/fixtures/large-estimate.ts',
      )) as typeof import('./fixtures/large-estimate');
      const vault = new LocalVault(owner, () => undefined);
      try {
        await vault.openWithoutKey();
        const project = newProject('Synthetic chapel', 'North wall', 'Upper plaster', 'HUF');
        const saved = await localProjects(vault).save(project);
        const input = largeEstimate(1, 1, 1, project.id);
        await estimateRepository(vault).save(project.id, 0, {
          schema: 1,
          draft: input,
          snapshots: [snapshot(input, 1, true)],
        });
        const key = await sharing.localSharingKey(vault);
        const shared = projectSnapshot(saved);
        const envelopes: Record<string, unknown> = {};
        for (const invitation of grants) {
          const context = { project: project.id, invitation, sender: owner, recipient };
          envelopes[invitation + '/content'] = await sharing.sealProjectSnapshot(
            key.pair,
            recipientKey,
            context,
            shared,
          );
        }
        const context = { project: project.id, invitation: grants[0], sender: owner, recipient };
        envelopes[grants[0] + '/scopes/estimate-full'] = await sharing.sealScope(
          key.pair,
          recipientKey,
          context,
          'estimate-full',
          await scopeContent(vault, project.id, 'estimate-full'),
        );
        return {
          project: project.id,
          envelopes,
          senderKey: key.publicKey,
          fingerprint: await sharing.sharingFingerprint(key.publicKey),
          ownerReports: (await vault.recipientReports().list()).length,
        };
      } finally {
        vault.close();
      }
    },
    { owner, recipient, recipientKey, grants: [withEstimate, assessmentOnly] },
  );
}

async function download(page: Page, row: ReturnType<Page['locator']>) {
  const file = page.waitForEvent('download');
  await row.locator('[data-control-id="recipient-report.download"]').click();
  const saved = await file;
  return { name: saved.suggestedFilename(), bytes: await readFile(await saved.path()) };
}

// #55, ADR 0008: a recipient writes their own report from what their grants share, keeps it in
// their own vault, exports it labelled as a recipient draft, and keeps it after revocation.
test('a recipient authors, exports and keeps their own report within their grants', async ({
  browser,
}, info) => {
  test.setTimeout(90_000);
  const ownerContext = await browser.newContext({ viewport: { width: 1194, height: 834 } });
  const recipientContext = await browser.newContext({ viewport: { width: 834, height: 1194 } });
  try {
    const ownerPage = await signIn(ownerContext, owner);
    const inbox = await signIn(recipientContext, recipient);
    const errors: string[] = [];
    inbox.on('pageerror', (error) => errors.push(error.message));
    const grants = await ownerGrants(ownerPage, await recipientKey(inbox));
    expect(grants.ownerReports).toBe(0);
    const invitation = (id: string, estimateScope: string) => ({
      id,
      projectId: grants.project,
      state: 'active',
      coOwner: false,
      estimateScope,
      shareHistory: false,
      expiresAt: '2026-12-01T00:00:00.000Z',
    });
    let listed = [invitation(withEstimate, 'estimate-full'), invitation(assessmentOnly, 'none')];
    const sent: string[] = [];
    inbox.on('request', (request) => {
      // Publishing this account's sharing key is not sharing data.
      const url = request.url();
      if (
        request.method() !== 'GET' &&
        url.includes('/api/v1/') &&
        !url.endsWith('/sharing-identity')
      )
        sent.push(url);
    });
    await recipientContext.route('**/api/v1/invitations', (route) =>
      route.fulfill({ json: { invitations: listed } }),
    );
    await recipientContext.route('**/api/v1/invitations/*/**', (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1/invitations/', '');
      const envelope = grants.envelopes[path];
      return envelope
        ? route.fulfill({
            json: { ...(envelope as object), senderId: owner, senderKey: grants.senderKey },
          })
        : route.fulfill({ status: 404, json: { error: 'not_found' } });
    });

    await inbox.goto('/invitations');
    const rows = inbox.locator('.invitation-panel .session-list > li');
    const full = rows.filter({ has: inbox.getByRole('button', { name: 'Full estimate sample' }) });
    const plain = rows.filter({
      hasNot: inbox.getByRole('button', { name: 'Full estimate sample' }),
    });
    await full.getByRole('button', { name: 'Full estimate sample' }).click();
    await expect(full.locator('[data-control-id="estimate.scope.projection"]')).toBeVisible();
    await full.getByRole('button', { name: 'Open shared content' }).click();
    await expect(full.getByText('Synthetic chapel')).toBeVisible();
    const editor = full.locator('[data-control-id="recipient-report.author"]');
    await editor.locator('summary').click();
    const finances = editor.locator('[data-control-id="recipient-report.finances"]');
    await expect(finances.locator('option')).toHaveText([
      'No estimate figures',
      'Estimate summary',
      'Full estimate',
    ]);
    await finances.selectOption('full');
    await editor.getByLabel('Notes').fill('Private recipient notes');
    await editor.locator('[data-control-id="recipient-report.format"]').selectOption('XLSX');
    await editor.getByRole('button', { name: 'Save my report' }).click();
    await expect(editor.getByRole('status')).toHaveText('Saved on this device');

    await plain.getByRole('button', { name: 'Open shared content' }).click();
    const limited = plain.locator('[data-control-id="recipient-report.author"]');
    await limited.locator('summary').click();
    await expect(
      limited.locator('[data-control-id="recipient-report.finances"] option'),
    ).toHaveText(['No estimate figures']);
    await expect(limited.locator('[data-control-id="recipient-report.no-estimate"]')).toHaveText(
      'This project does not share estimate figures with you.',
    );
    await limited.locator('[data-control-id="recipient-report.format"]').selectOption('XLSX');
    await limited.getByRole('button', { name: 'Save my report' }).click();
    await expect(limited.getByRole('status')).toHaveText('Saved on this device');

    await expect(
      inbox.getByRole('region', { name: 'My reports from shared projects' }),
    ).toBeVisible();
    const saved = inbox.locator('.recipient-reports');
    const fullReport = saved.locator(`[data-recipient-report="${withEstimate}"]`);
    const plainReport = saved.locator(`[data-recipient-report="${assessmentOnly}"]`);
    await expect(fullReport).toContainText('Recipient draft · Full estimate · XLSX');
    await expect(plainReport).toContainText('Recipient draft · No estimate figures · XLSX');
    const fullFile = await download(inbox, fullReport);
    expect(fullFile.name).toBe('calirestore-recipient-draft.xlsx');
    expect(fullFile.bytes.toString()).toContain(label);
    expect(fullFile.bytes.toString()).toContain('HUF');
    expect(fullFile.bytes.toString()).toContain('Private recipient notes');
    const plainFile = await download(inbox, plainReport);
    expect(plainFile.bytes.toString()).toContain(label);
    expect(plainFile.bytes.toString()).toContain('Upper plaster');
    expect(plainFile.bytes.toString()).not.toContain('HUF');
    const stored = await inbox.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('calirestore-vault');
        request.onsuccess = () => resolve(request.result);
      });
      const read = (table: string) =>
        new Promise<unknown[]>((resolve) => {
          const request = db.transaction(table).objectStore(table).getAll();
          request.onsuccess = () => resolve(request.result as unknown[]);
        });
      const result = {
        recipient: JSON.stringify(await read('encrypted-recipient-reports')),
        reports: (await read('encrypted-reports')).length,
      };
      db.close();
      return result;
    });
    expect(stored.recipient).toContain(withEstimate);
    expect(stored.recipient).not.toContain('Private recipient notes');
    expect(stored.reports).toBe(0);
    await inbox.screenshot({
      path: info.outputPath('recipient-reports-portrait.png'),
      fullPage: true,
    });

    // The owner revokes the first grant: the recipient keeps that draft, with a warning.
    listed = [invitation(assessmentOnly, 'none')];
    await inbox.getByRole('button', { name: 'Refresh invitations' }).click();
    await expect(full).toHaveCount(0);
    await expect(fullReport.getByRole('note')).toHaveText(
      'Your access to this project has ended. This copy stays on this device and is no longer updated.',
    );
    await expect(plainReport.getByRole('note')).toHaveCount(0);
    expect((await download(inbox, fullReport)).bytes.toString()).toContain(label);
    await chooseLanguage(inbox, 'hu');
    await expect(fullReport.getByRole('note')).toHaveText(
      'A projekthez való hozzáférése megszűnt. Ez a példány ezen az eszközön marad, és már nem frissül.',
    );
    await chooseLanguage(inbox, 'en');
    await inbox.setViewportSize({ width: 1194, height: 834 });
    await inbox.screenshot({
      path: info.outputPath('recipient-reports-landscape.png'),
      fullPage: true,
    });
    expect((await new AxeBuilder({ page: inbox }).analyze()).violations).toEqual([]);

    inbox.once('dialog', (dialog) => dialog.accept());
    await fullReport.locator('[data-control-id="recipient-report.remove"]').click();
    await expect(fullReport).toHaveCount(0);
    await expect(plainReport).toBeVisible();
    expect(sent).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await ownerContext.close();
    await recipientContext.close();
  }
});
