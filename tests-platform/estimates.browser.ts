import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { input } from '../tests-estimates/fixtures';

test('encrypted estimate and preset persistence, immutable versions, isolation and lock', async ({
  page,
}) => {
  await page.goto('/');
  const fixture = input();
  const result = await page.evaluate(async (fixture) => {
    const load = (path: string): Promise<unknown> => import(path);
    const { LocalVault } = (await load(
      '/src/platform/vault/vault.ts',
    )) as typeof import('../src/platform/vault/vault');
    const { estimateRepository, presetRepository } = (await load(
      '/src/platform/estimates/persistence.ts',
    )) as typeof import('../src/platform/estimates/persistence');
    const { snapshot, summary } = (await load(
      '/src/platform/estimates/snapshots.ts',
    )) as typeof import('../src/platform/estimates/snapshots');
    const { sealScope, openScope, localSharingKey } = (await load(
      '/src/platform/projects/fixture-sharing.ts',
    )) as typeof import('../src/platform/projects/fixture-sharing');
    const { connect, estimateTable, presetTable } = (await load(
      '/src/platform/vault/store.ts',
    )) as typeof import('../src/platform/vault/store');
    const owner = '00000000-0000-4000-8000-000000000011';
    const recipient = '00000000-0000-4000-8000-000000000012';
    const project = crypto.randomUUID();
    fixture.project = project;
    fixture.phases[0]!.quantity!.project = project;
    const vault = new LocalVault(owner, () => undefined);
    const other = new LocalVault(recipient, () => undefined);
    await vault.create('aa'.repeat(32), false);
    await other.create('bb'.repeat(32), false);
    const issued = snapshot(fixture, 1, true);
    const doc = { schema: 1 as const, draft: fixture, snapshots: [issued] };
    const repository = estimateRepository(vault);
    await repository.save(project, 0, doc);
    const incompleteBackup = await vault
      .projectBackups()
      .export(project)
      .then(
        () => false,
        () => true,
      );
    const stale = await repository.save(project, 0, doc).then(
      () => false,
      () => true,
    );
    const altered = structuredClone(doc);
    altered.snapshots[0]!.createdAt = 'changed';
    const immutable = await repository.save(project, 1, altered).then(
      () => false,
      () => true,
    );
    const preset = {
      id: crypto.randomUUID(),
      version: 1,
      name: 'Private sentinel',
      kind: 'rate' as const,
      value: '72.125',
      unit: 'hourly' as const,
      currency: 'EUR',
      archived: false,
    };
    await presetRepository(vault).save(preset);
    await presetRepository(vault).save({ ...preset, version: 2, value: '99' });
    const history = await presetRepository(vault).list();
    const isolation =
      (await estimateRepository(other).load(project)) === undefined &&
      (await presetRepository(other).list()).length === 0;
    const senderKey = await localSharingKey(vault);
    const receiverKey = await localSharingKey(other);
    const context = { project, invitation: crypto.randomUUID(), sender: owner, recipient };
    const projection = summary(issued, 2);
    const grant = await sealScope(
      senderKey.pair,
      receiverKey.publicKey,
      context,
      'estimate-summary',
      projection,
    );
    const opened = await openScope(
      receiverKey.pair,
      senderKey.publicKey,
      grant,
      context,
      'estimate-summary',
    );
    const wrongScope = await openScope(
      receiverKey.pair,
      senderKey.publicKey,
      { ...grant, scope: 'estimate-full' },
      context,
      'estimate-full',
    ).then(
      () => false,
      () => true,
    );
    const db = await connect();
    const raw = await Promise.all(
      [estimateTable, presetTable].map(
        (table) =>
          new Promise<unknown>((resolve) => {
            const request = db.transaction(table).objectStore(table).getAll();
            request.onsuccess = () => resolve(request.result);
          }),
      ),
    );
    db.close();
    vault.lock();
    await vault.unlock('aa'.repeat(32));
    const reopened = await estimateRepository(vault).load(project);
    const handle = vault.estimates();
    vault.lock();
    const locked = await handle.list().then(
      () => false,
      () => true,
    );
    await vault.unlock('aa'.repeat(32));
    const tamperDB = await connect();
    await new Promise<void>((resolve) => {
      const tx = tamperDB.transaction(estimateTable, 'readwrite');
      const store = tx.objectStore(estimateTable);
      const request = store.get([owner, project]);
      request.onsuccess = () => {
        const row = request.result;
        row.envelope.ciphertext = 'AAAA';
        store.put(row, [owner, project]);
      };
      tx.oncomplete = () => resolve();
    });
    tamperDB.close();
    const tamper = await estimateRepository(vault)
      .load(project)
      .then(
        () => false,
        () => true,
      );
    vault.close();
    other.close();
    return {
      incompleteBackup,
      stale,
      immutable,
      isolation,
      locked,
      tamper,
      wrongScope,
      raw: JSON.stringify(raw),
      total: reopened?.document.snapshots[0]?.result.total,
      history: history.map((p) => p.value),
      opened,
    };
  }, fixture);
  expect(result).toMatchObject({
    stale: true,
    incompleteBackup: true,
    immutable: true,
    isolation: true,
    locked: true,
    tamper: true,
    wrongScope: true,
    total: '230.00',
    history: ['72.125', '99'],
  });
  expect(result.raw).not.toContain('Private sentinel');
  expect(result.raw).not.toContain('Cleaning');
  expect(result.opened[0]).toContain('stale');
  expect(result.opened[0]).not.toContain('hours');
});

test('estimate route saves and reopens manual pricing with tablet layouts', async ({
  page,
}, info) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'restorer@example.test',
          state: 'active',
          role: 'member',
        },
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.goto(
    process.env.ESTIMATE_APP_ORIGIN ? process.env.ESTIMATE_APP_ORIGIN + '/projects' : '/projects',
  );
  await page.getByLabel('Remember this browser').check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
  await page.getByLabel('I saved the recovery key').check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
  await page.getByLabel('Project name').fill('Fixture estimate');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.locator('[data-control-id="project.review.estimates"]').click();
  const phase = (id: string) => page.locator(`[data-control-id="estimate.phase.${id}"]`);
  const finance = (id: string) => page.locator(`[data-control-id="estimate.finance.${id}"]`);
  await phase('newName').fill('Manual cleaning allowance');
  await phase('add').click();
  await phase('scopeSurface').selectOption({ label: 'Object 1 / Surface 1' });
  await phase('time').fill('10');
  await phase('rate').fill('40');
  await phase('material').fill('30');
  await expect(page.locator('[data-estimate-result="total"]')).toHaveText('430');
  await phase('multiplier').fill('2');
  await phase('keepHours').click();
  await phase('multiplier').fill('3');
  await phase('adjustHours').click();
  await expect(phase('time')).toHaveValue('15');
  await expect(page.locator('[data-estimate-result="total"]')).toHaveText('630');
  await page.getByLabel('Preset name', { exact: true }).fill('Studio hourly');
  await page.getByRole('button', { name: 'Save rate preset', exact: true }).click();
  await expect(page.getByText('Saved encrypted', { exact: true })).toBeVisible();
  await finance('issue').click();
  await expect(page.getByText('Encrypted version saved locally. Not cloud-synced.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await expect(phase('time')).toHaveValue('15');
  await expect(page.locator('[data-estimate-result="total"]')).toHaveText('630');
  await phase('rate').fill('88');
  await expect(
    page.getByRole('status').filter({ hasText: 'Encrypted input version' }),
  ).toContainText('40');
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    await page.screenshot({
      path: info.outputPath(`estimate-${viewport.width}.png`),
      fullPage: true,
    });
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.locator('[data-control-id="project.review.outputs"]').click();
  const report = (id: string) => page.locator(`[data-control-id="report.review.${id}"]`);
  await report('finances').selectOption('summary');
  await expect(report('estimateVersion').locator('option:checked')).toHaveText('v1');
  await report('format').selectOption('XLSX');
  await expect(report('workbook').locator('option')).toHaveCount(1);
  await report('preview').click();
  const preview = page.getByRole('dialog');
  await expect(preview).toContainText('630');
  await expect(preview).toContainText('restoration-v1');
  await expect(preview).not.toContainText('Manual cleaning allowance');
  await expect(preview).not.toContainText('40 HUF/h');
  const summaryDownload = page.waitForEvent('download');
  await report('download').click();
  const summaryFile = await summaryDownload;
  expect(summaryFile.suggestedFilename()).toBe('calirestore-report-draft.xlsx');
  const summaryBytes = await readFile((await summaryFile.path())!, 'utf8');
  expect(summaryBytes).toContain('<v>630</v>');
  expect(summaryBytes).not.toContain('Manual cleaning allowance');
  expect(summaryBytes).not.toContain('<f>');
  await report('cancel').click();
  await report('finances').selectOption('full');
  await report('workbook').selectOption('editable');
  await report('version').selectOption('baseline');
  await report('preview').click();
  await expect(preview).toContainText('630');
  await expect(preview).toContainText('40 HUF/h');
  await expect(preview).not.toContainText('88 HUF/h');
  await expect(preview).toContainText('Illustrative checkpoint');
  await expect(preview).toContainText('Editable estimate');
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(preview).toBeVisible();
    await expect(preview.locator('.report-scroll')).toHaveJSProperty(
      'scrollWidth',
      await preview.locator('.report-scroll').evaluate((node) => node.clientWidth),
    );
    await page.screenshot({ path: info.outputPath(`issued-report-${viewport.width}.png`) });
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const editableDownload = page.waitForEvent('download');
  await report('download').click();
  const editableBytes = await readFile((await (await editableDownload).path())!, 'utf8');
  expect(editableBytes).toContain('Manual cleaning allowance');
  expect(editableBytes).toMatch(/r="L2"><v>40<\/v>/);
  expect(editableBytes).not.toContain('Studio hourly');
  expect(editableBytes).toContain('<f>');
  await report('cancel').click();
  await page.locator('[data-control-id="project.review.estimates"]').click();
  await page.getByLabel('App language').selectOption('hu');
  await expect(page.getByRole('button', { name: 'Becslési verzió mentése' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('estimate-hu-390.png'), fullPage: true });
});
