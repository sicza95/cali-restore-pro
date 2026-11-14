import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { dng } from './fixtures/images';

async function openFreshVault(page: Page, origin = '') {
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
  await page.goto(origin + '/projects');
  await page.getByRole('button', { name: 'Set up vault' }).click();
  await page.getByLabel('I saved the recovery key').check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
}

test('download and restore an encrypted project through the controls in a fresh browser vault', async ({
  page,
  browser,
}, info) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await openFreshVault(page);
  await page.getByLabel('Project name').fill('East Chapel');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Original file', { exact: true }).setInputFiles({
    name: 'plaster-detail.dng',
    mimeType: 'image/x-adobe-dng',
    buffer: dng,
  });
  await page.getByRole('button', { name: 'Attach original', exact: true }).click();
  await expect(page.getByText('plaster-detail.dng')).toBeVisible();
  const originalPath = new URL(page.url()).pathname;
  await page.getByRole('link', { name: 'Open surface', exact: true }).click();
  const control = (key: string) => page.locator('[data-control-id="surface.review.' + key + '"]');
  await expect(control('calibrate')).toHaveAttribute('aria-disabled', 'false');
  await control('calibrate').click();
  await control('unit').selectOption('m');
  await control('width').fill('2');
  await control('height').fill('3');
  await control('apply').click();
  await expect(page.getByRole('region', { name: 'Surface measurements' })).toContainText('6 m²');
  const checkpoint = (p: Page, key: string) =>
    p.locator('[data-control-id="checkpoint.review.' + key + '"]');
  await checkpoint(page, 'mode').click();
  await checkpoint(page, 'name').fill('Baseline assessment');
  await checkpoint(page, 'create').click();
  await expect(
    checkpoint(page, 'version').locator('option').filter({ hasText: 'Baseline assessment' }),
  ).toHaveCount(1);
  await page.locator('[data-control-id="surface.project"]').click();
  await page.getByText('Export encrypted backup', { exact: true }).click();
  await page.getByRole('button', { name: 'Prepare backup' }).click();
  const key = page.getByRole('textbox', { name: 'Backup key', exact: true });
  await expect(key).toHaveValue(/^[a-f0-9]{64}$/);
  const code = await key.inputValue();
  await page.getByLabel('I saved the backup key').check();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download backup' }).click();
  const archive = info.outputPath('download.crproject');
  await (await downloaded).saveAs(archive);
  await page.screenshot({ path: info.outputPath('backup-landscape.png'), fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const fresh = await browser.newContext({ viewport: { width: 834, height: 1194 } });
  try {
    const target = await fresh.newPage();
    await openFreshVault(target, 'http://127.0.0.1:4186');
    await expect.poll(() => target.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect(target.getByRole('link', { name: 'East Chapel' })).toHaveCount(0);
    await fresh.setOffline(true);
    await target.getByText('Import encrypted backup', { exact: true }).click();
    await target.getByLabel('Backup file').setInputFiles(archive);
    await target.getByLabel('Backup key', { exact: true }).fill('00'.repeat(32));
    await target.getByRole('button', { name: 'Restore as a local copy' }).click();
    await expect(target.getByRole('alert').filter({ hasText: 'Restore failed' })).toBeVisible();
    await expect(target.getByRole('link', { name: 'East Chapel' })).toHaveCount(0);
    await target.screenshot({ path: info.outputPath('backup-portrait.png'), fullPage: true });
    expect((await new AxeBuilder({ page: target }).analyze()).violations).toEqual([]);
    await target.getByLabel('Backup key', { exact: true }).fill(code);
    await target.getByRole('button', { name: 'Restore as a local copy' }).click();
    await expect(target.getByRole('heading', { name: 'East Chapel' })).toBeVisible();
    await expect(target.getByText('plaster-detail.dng')).toBeVisible();
    await expect(
      target.getByRole('listitem').getByRole('combobox', { name: 'Image role' }),
    ).toHaveValue('mapping');
    await target.getByRole('link', { name: 'Open surface', exact: true }).click();
    await expect(target.locator('.surface-canvas img')).toHaveJSProperty('naturalWidth', 48);
    await expect(target.getByRole('region', { name: 'Surface measurements' })).toContainText(
      '6 m²',
    );
    await checkpoint(target, 'mode').click();
    await checkpoint(target, 'version').selectOption({ label: 'Baseline assessment' });
    await expect(
      target.getByRole('figure', { name: 'Baseline assessment' }).getByRole('img'),
    ).toHaveJSProperty('naturalWidth', 48);
    await expect(target.locator('.review-facts dd').first()).toHaveText('6 m²');
    expect(new URL(target.url()).pathname).not.toContain(originalPath);
  } finally {
    await fresh.close();
  }
});

test('authenticates all original chunks and rolls back a cancelled or aborted import', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const vaultModule = '/src/platform/vault/vault.ts';
    const storeModule = '/src/platform/vault/store.ts';
    const projectModule = '/src/platform/projects/projects.ts';
    const formatModule = '/src/platform/vault/file-format.ts';
    const { LocalVault } = (await import(
      vaultModule
    )) as typeof import('../src/platform/vault/vault');
    const { accountRange, connect, fileTable } = (await import(
      storeModule
    )) as typeof import('../src/platform/vault/store');
    const { localProjects, newProject } = (await import(
      projectModule
    )) as typeof import('../src/platform/projects/projects');
    const { chunkBytes } = (await import(
      formatModule
    )) as typeof import('../src/platform/vault/file-format');
    const source = new LocalVault('source', () => undefined);
    await source.create('ab'.repeat(32), false);
    const project = newProject('Hidden chapel', 'Hidden object', 'Hidden surface', 'HUF');
    const bytes = new Uint8Array(chunkBytes + 3);
    bytes.fill(237);
    bytes.set([12, 13, 14], chunkBytes);
    const original = await source.files().stage(
      project.id,
      new File([bytes], 'hidden-original.dng', {
        type: 'image/x-adobe-dng',
      }),
    );
    const [object] = project.objects;
    const [surface] = object!.surfaces;
    surface!.images.push({ id: original.id, role: 'mapping' });
    object!.surfaces.push({
      ...surface!,
      id: crypto.randomUUID(),
      images: [{ id: original.id, role: 'reference' }],
    });
    await localProjects(source).save(project);
    const { blob, code } = await source.projectBackups().export(project.id);
    await source.forget(true);
    source.close();

    const target = new LocalVault('destination', () => undefined);
    await target.create('cd'.repeat(32), false);
    const backups = target.projectBackups();
    const db = await connect();
    const counts = async () => ({
      projects: (await localProjects(target).list()).length,
      files: await new Promise<number>((resolve, reject) => {
        const request = db
          .transaction(fileTable)
          .objectStore(fileTable)
          .count(accountRange('destination'));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
    });
    const rejected = (promise: Promise<unknown>) =>
      promise.then(
        () => false,
        () => true,
      );
    const last = new Uint8Array(await blob.slice(-1).arrayBuffer());
    last[0] = last[0]! ^ 1;
    const wrong = await rejected(backups.import(blob, '00'.repeat(32)));
    const corrupt = await rejected(backups.import(new Blob([blob.slice(0, -1), last]), code));
    const truncated = await rejected(backups.import(blob.slice(0, -1), code));
    const trailing = await rejected(backups.import(new Blob([blob, last]), code));
    const cancel = new AbortController();
    const cancelled = await rejected(
      backups.import(blob, code, {
        signal: cancel.signal,
        progress: () => cancel.abort(),
      }),
    );

    // Abort after queuing the project and some file rows, before IDB can commit.
    const add = IDBObjectStore.prototype.add;
    let injected = false;
    IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
      const request = add.call(this, value, key);
      if (this.name === fileTable && Array.isArray(key) && key[2] === 1) {
        // Abort after the write callbacks have all run, to model a storage failure.
        request.onsuccess = () => {
          injected = true;
          this.transaction.abort();
        };
      }
      return request;
    };
    let aborted: boolean;
    try {
      aborted = await rejected(backups.import(blob, code));
    } finally {
      IDBObjectStore.prototype.add = add;
    }
    const afterFailures = await counts();
    const restored = await backups.import(blob, code);
    target.lock();
    await target.unlock('cd'.repeat(32));
    const [reopened] = await localProjects(target).list();
    const refs = reopened!.objects[0]!.surfaces.flatMap((entry) => entry.images);
    const ref = { project: reopened!.id, id: refs[0]!.id };
    const metadata = await target.files().metadata(ref);
    const chunks: Uint8Array[] = [];
    for await (const chunk of target.files().original(ref)) chunks.push(chunk);
    const matches =
      chunks.length === 2 &&
      chunks.every(
        (chunk, index) =>
          chunk.length === (index === 0 ? chunkBytes : 3) &&
          chunk.every((byte, offset) => byte === bytes[index * chunkBytes + offset]),
      );
    const raw = new TextDecoder().decode(await blob.arrayBuffer());
    const afterRecovery = await counts();
    await target.files().removeLocal(ref);
    const missingOriginal = await rejected(target.projectBackups().export(restored.id));
    db.close();
    target.close();

    return {
      wrong,
      corrupt,
      truncated,
      trailing,
      cancelled,
      injected,
      aborted,
      afterFailures,
      afterRecovery,
      metadata,
      matches,
      missingOriginal,
      ciphertext: ![
        'Hidden chapel',
        'Hidden object',
        'Hidden surface',
        'hidden-original.dng',
        code,
      ].some((value) => raw.includes(value)),
      independent: restored.id !== project.id && ref.id !== original.id,
      deduplicated: refs[0]!.id === refs[1]!.id,
      roles: refs.map((entry) => entry.role),
      hierarchy: [
        reopened!.name,
        reopened!.objects[0]!.name,
        reopened!.objects[0]!.surfaces[0]!.name,
      ],
      currency: reopened!.settings.currency,
    };
  });

  expect(result).toEqual({
    wrong: true,
    corrupt: true,
    truncated: true,
    trailing: true,
    cancelled: true,
    injected: true,
    aborted: true,
    afterFailures: { projects: 0, files: 0 },
    afterRecovery: { projects: 1, files: 4 },
    metadata: { name: 'hidden-original.dng', type: 'image/x-adobe-dng', size: 1048579 },
    matches: true,
    missingOriginal: true,
    ciphertext: true,
    independent: true,
    deduplicated: true,
    roles: ['mapping', 'reference'],
    hierarchy: ['Hidden chapel', 'Hidden object', 'Hidden surface'],
    currency: 'HUF',
  });
});
