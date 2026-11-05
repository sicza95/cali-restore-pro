import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('project hierarchy and encrypted originals reopen from the local vault', async ({
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
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/projects');
  await page.getByLabel(/Remember this browser/).check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
  await page.getByLabel('I saved the recovery key').check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
  await page.getByLabel('Project name').fill('East Chapel');
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('heading', { name: 'East Chapel' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Surface', exact: true })).toHaveValue(
    /^[0-9a-f-]{36}$/,
  );
  await page.getByRole('textbox', { name: 'Add object' }).fill('North wall');
  await page.getByRole('button', { name: 'Add object' }).click();
  await page.getByRole('textbox', { name: 'Add surface' }).fill('Upper plaster');
  await page.getByRole('button', { name: 'Add surface' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Surface', exact: true }).locator('option:checked'),
  ).toHaveText('Upper plaster');
  await expect(
    page.getByRole('combobox', { name: 'Object', exact: true }).locator('option:checked'),
  ).toHaveText('North wall');
  await page.getByLabel('Currency code').fill('USD');
  await page
    .getByRole('combobox', { name: 'North wall · Units', exact: true })
    .selectOption('imperial');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Upper plaster · Imperial')).toBeVisible();
  await page.getByLabel('Original file', { exact: true }).setInputFiles({
    name: 'plaster-detail.dng',
    mimeType: 'image/x-adobe-dng',
    buffer: Buffer.from([1, 2, 3]),
  });
  await page.getByRole('combobox', { name: 'Image role', exact: true }).selectOption('reference');
  await page.getByRole('button', { name: 'Attach original', exact: true }).click();
  await expect(page.getByText('plaster-detail.dng')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('projects-landscape.png'), fullPage: true });
  await page.reload();
  await expect(page.getByText('East Chapel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await page
    .getByRole('combobox', { name: 'Object', exact: true })
    .selectOption({ label: 'North wall' });
  await page
    .getByRole('combobox', { name: 'Surface', exact: true })
    .selectOption({ label: 'Upper plaster' });
  await expect(page.getByText('plaster-detail.dng')).toBeVisible();
  await expect(page.getByLabel('Currency code')).toHaveValue('USD');
  await expect(
    page.getByRole('listitem').getByRole('combobox', { name: 'Image role' }),
  ).toHaveValue('reference');
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.screenshot({ path: info.outputPath('projects-portrait.png'), fullPage: true });
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore project' })).toBeVisible();
  await page.getByRole('link', { name: 'All projects' }).click();
  await expect(page.getByRole('link', { name: 'East Chapel' })).toHaveCount(0);
  await page.getByLabel('Show archived').check();
  await expect(page.getByRole('link', { name: 'East Chapel' })).toBeVisible();
});

test('project revisions reject stale edits and vault forget removes encrypted documents', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const vaultModule = '/src/platform/vault/vault.ts';
    const storeModule = '/src/platform/vault/store.ts';
    const projectModule = '/src/platform/projects/projects.ts';
    const { LocalVault } = (await import(
      vaultModule
    )) as typeof import('../src/platform/vault/vault');
    const { connect, projectTable } = (await import(
      storeModule
    )) as typeof import('../src/platform/vault/store');
    const { localProjects, newProject } = (await import(
      projectModule
    )) as typeof import('../src/platform/projects/projects');
    const vault = new LocalVault('test-account', () => undefined);
    await vault.create('bb'.repeat(32), true);
    const projects = localProjects(vault);
    const project = await projects.save(newProject('Hidden project', 'Object', 'Surface', 'EUR'));
    await projects.save({ ...project, name: 'New hidden name' });
    const stale = await projects.save({ ...project, name: 'Stale edit' }).then(
      () => false,
      () => true,
    );
    const db = await connect();
    const read = () =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(projectTable).objectStore(projectTable).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const raw = JSON.stringify(await read());
    const [saved] = await projects.list();
    vault.lock();
    const locked = await projects.list().then(
      () => false,
      () => true,
    );
    await vault.forget(true);
    const forgotten = (await read()).length === 0;
    db.close();
    vault.close();
    return {
      stale,
      locked,
      forgotten,
      hidden: !raw.includes('hidden name'),
      revision: saved?.revision,
      name: saved?.name,
    };
  });
  expect(result).toEqual({
    stale: true,
    locked: true,
    forgotten: true,
    hidden: true,
    revision: 2,
    name: 'New hidden name',
  });
});
