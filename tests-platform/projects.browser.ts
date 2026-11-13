import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { projectControls } from '../src/ui/account-access/projects/project-controls';

import { surfaceControls } from '../src/ui/account-access/projects/surface-review-controls';
import { verifyCheckpointReview } from './checkpoint-review';
import { drawingControl, verifyDrawingReview } from './drawing-review';
import { projectTable, revisionQueueTable } from '../src/platform/vault/store';
import { verifyAlignmentGuides, verifyCalibrationGuides, verifyPhotoMatrix } from './photo-review';
import { dng } from './fixtures/images';
import { setupRememberedVault } from './vault-setup';

test.use({ hasTouch: true });

test('project hierarchy and encrypted originals reopen from the local vault', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  let account = '00000000-0000-4000-8000-000000000001';
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: {
          id: account,
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
  await setupRememberedVault(page);
  const controls = (id: string) => {
    expect(projectControls.some((control) => control.id === id)).toBe(true);
    return page.locator(`[data-control-id="${id}"]`);
  };
  for (const id of ['projects.search', 'projects.sort', 'projects.restore', 'projects.offline']) {
    await expect(controls(id)).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath('project-library.png') });
  await page.getByLabel('Project name').fill('East Chapel');
  await controls('projects.create').click();
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
  const projectPath = new URL(page.url()).pathname;
  for (const id of [
    'project.library',
    'project.collaboration',
    'project.backup',
    'project.sync.enable',
  ]) {
    await expect(controls(id)).toBeVisible();
  }
  await controls('project.surface').click();
  const surfacePath = new URL(page.url()).pathname;
  expect(surfacePath).toMatch(/^\/projects\/[a-f0-9-]{36}\/surfaces\/[a-f0-9-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Upper plaster' })).toBeVisible();
  await expect(controls('surface.project')).toHaveText('East Chapel');
  await expect(controls('project.collaboration')).toHaveCount(0);
  const review = (id: string) => {
    const key = 'surface.' + id;
    expect(surfaceControls.some((control) => control.id === key)).toBe(true);
    return page.locator('[data-control-id="' + key + '"]');
  };
  await expect(review('view.photo')).toBeDisabled();
  await expect(review('review.prepare')).toHaveAttribute('aria-disabled', 'true');
  await drawingControl(page, 'mode.drawing').click();
  await expect(drawingControl(page, 'tool.brush')).toBeDisabled();
  await expect(drawingControl(page, 'layer.select')).toHaveCount(0);
  await drawingControl(page, 'mode.photo').click();
  const attach = page.getByLabel('Original file', { exact: true });
  const png = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#b4afa2';
      context.fillRect(0, 0, 640, 480);
      context.strokeStyle = '#756e60';
      context.lineWidth = 3;
      for (let row = 0; row < 8; row++) {
        context.strokeRect(row % 2 ? -64 : 0, row * 60, 128, 60);
        for (let col = 1; col < 6; col++) {
          context.strokeRect(col * 128 - (row % 2 ? 64 : 0), row * 60, 128, 60);
        }
      }
      return canvas.toDataURL('image/png').split(',')[1]!;
    }),
    'base64',
  );
  const revisions = () =>
    page.evaluate(
      async (tables) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('calirestore-vault');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const tx = db.transaction(tables);
          return await Promise.all(
            tables.map(
              (table) =>
                new Promise<unknown[]>((resolve, reject) => {
                  const request = tx.objectStore(table).getAll();
                  request.onsuccess = () => resolve(request.result);
                  request.onerror = () => reject(request.error);
                }),
            ),
          );
        } finally {
          db.close();
        }
      },
      [projectTable, revisionQueueTable],
    );
  await attach.setInputFiles({
    name: 'damaged.png',
    mimeType: 'image/png',
    buffer: png.subarray(0, 24),
  });
  await controls('originals.attach').click();
  await expect(page.getByRole('alert')).toContainText('damaged or incomplete');
  await expect(page.locator('.project-originals li')).toHaveText('No originals on this surface.');
  await expect(attach).toHaveValue(/damaged\.png$/);
  await attach.setInputFiles({ name: 'wall.png', mimeType: 'image/png', buffer: png });
  await controls('originals.attach').click();
  await expect(review('review.prepare')).toHaveAttribute('aria-disabled', 'false');
  const beforeReview = await revisions();
  expect(beforeReview[0]).toEqual([expect.objectContaining({ revision: expect.any(Number) })]);
  await verifyDrawingReview(page, info);
  await verifyCheckpointReview(page, info);
  expect(await revisions()).toEqual(beforeReview);
  await review('review.prepare').focus();
  await page.keyboard.press('Enter');
  await review('review.cropWidth').fill('101');
  await expect(review('review.apply')).toBeDisabled();
  await review('review.cropWidth').fill('80');
  await review('review.apply').click();
  await expect(page.getByText('Applied for this review session.')).toBeVisible();
  await review('review.prepare').click();
  await expect(review('review.cropWidth')).toHaveValue('80');
  await review('review.cropWidth').fill('50');
  await review('review.cancel').click();
  await review('review.prepare').click();
  await expect(review('review.cropWidth')).toHaveValue('80');
  const zoom = review('view.zoom');
  await zoom.fill('250');
  await expect(page.locator('.surface-tile-ready').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('image-tiles-landscape.png'), fullPage: true });
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(page.locator('.surface-tile-ready').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('image-tiles-portrait.png'), fullPage: true });
  await page.setViewportSize({ width: 1194, height: 834 });
  await verifyPhotoMatrix(page, info);
  await review('review.calibrate').click();
  await expect(review('review.unit')).toHaveValue('in');
  await expect(review('review.apply')).toBeDisabled();
  await review('review.width').fill('10');
  await review('review.height').fill('12');
  await verifyCalibrationGuides(page);
  expect(await revisions()).toEqual(beforeReview);
  await page.setViewportSize({ width: 1194, height: 834 });
  await attach.setInputFiles({ name: 'wall-detail.png', mimeType: 'image/png', buffer: png });
  await controls('originals.attach').click();
  await expect(review('view.next')).toBeEnabled();
  await review('view.next').click();
  await expect(review('review.align')).toHaveAttribute('aria-disabled', 'false');
  await review('review.align').click();
  await expect(review('review.auto')).toBeDisabled();
  await review('review.compare').check();
  await expect(page.locator('.surface-canvas img')).toHaveCount(2);
  await verifyAlignmentGuides(page);
  const beforeAlignment = await revisions();
  await review('review.offsetX').fill('10');
  await review('review.apply').click();
  expect(await revisions()).toEqual(beforeAlignment);
  await review('view.previous').click();
  await expect(review('review.prepare')).toHaveAttribute('aria-disabled', 'false');
  await review('review.prepare').click();
  await expect(review('review.cropWidth')).toHaveValue('100');
  await attach.setInputFiles({
    name: 'plaster-detail.dng',
    mimeType: 'image/x-adobe-dng',
    buffer: dng,
  });
  await page
    .locator('.project-originals form')
    .getByRole('combobox', { name: 'Image role', exact: true })
    .selectOption('reference');
  await controls('originals.attach').click();
  await expect(page.locator('.project-originals').getByText('plaster-detail.dng')).toBeVisible();
  await review('view.photo').selectOption({ label: '3 · plaster-detail.dng' });
  await expect(page.locator('.surface-canvas img')).toHaveJSProperty('naturalWidth', 48);
  await expect(review('review.prepare')).toHaveAttribute('aria-disabled', 'false');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('projects-landscape.png'), fullPage: true });
  await page.goBack();
  await expect(page).toHaveURL(projectPath);
  await expect(page.getByRole('heading', { name: 'East Chapel' })).toBeVisible();
  await page.goto(surfacePath);
  await expect(page.getByRole('heading', { name: 'Upper plaster' })).toHaveCount(0);
  await expect(drawingControl(page, 'mode.drawing')).toHaveCount(0);
  await expect(page.getByText('East Chapel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await expect(page.locator('.project-originals').getByText('plaster-detail.dng')).toBeVisible();
  await drawingControl(page, 'mode.drawing').click();
  await expect(drawingControl(page, 'layer.select')).toHaveCount(1);
  await expect(drawingControl(page, 'layer.select')).toContainText('0 · Mark');
  await drawingControl(page, 'mode.photo').click();
  await page.screenshot({ path: info.outputPath('surface-reopened.png') });
  await controls('surface.project').click();
  await page
    .getByRole('combobox', { name: 'Object', exact: true })
    .selectOption({ label: 'North wall' });
  await page
    .getByRole('combobox', { name: 'Surface', exact: true })
    .selectOption({ label: 'Upper plaster' });
  await expect(page.locator('.project-originals').getByText('plaster-detail.dng')).toBeVisible();
  await expect(page.getByLabel('Currency code')).toHaveValue('USD');
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'plaster-detail.dng' })
      .getByRole('combobox', { name: 'Image role' }),
  ).toHaveValue('reference');
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 834);
  await page.screenshot({ path: info.outputPath('projects-portrait.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: info.outputPath('projects-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore project' })).toBeVisible();
  await page.getByRole('link', { name: 'All projects' }).click();
  await expect(page.getByRole('link', { name: 'East Chapel' })).toHaveCount(0);
  await page.getByLabel('Show archived').check();
  await expect(controls('projects.open')).toHaveText('East Chapel');
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('missing');
  await expect(controls('projects.open')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search projects' }).clear();

  await controls('projects.open').click();
  await page.getByRole('button', { name: 'Restore project' }).click();
  await page.goto(projectPath + '/surfaces/00000000-0000-4000-8000-000000000099');
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await expect(
    page.getByText('This project or surface is unavailable on this device.'),
  ).toBeVisible();
  await expect(page.getByText('East Chapel')).toHaveCount(0);
  await expect(controls('originals.attach')).toHaveCount(0);
  account = '00000000-0000-4000-8000-000000000002';
  await page.goto(surfacePath);
  await setupRememberedVault(page);
  await expect(
    page.getByText('This project or surface is unavailable on this device.'),
  ).toBeVisible();
  await expect(page.getByText('plaster-detail.dng')).toHaveCount(0);
  await page.goto('/settings/preferences');
  await page.locator('[data-control-id="settings.libraries"]').click();
  await expect(page).toHaveURL('/settings/libraries');
  await expect(page.getByRole('heading', { name: 'Pattern editor' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unlock with recovery key' })).toBeVisible();
  const rates = page.locator('[data-control-id="libraries.rates"]');
  await expect(rates).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await expect(rates).toBeEnabled();
  await expect(rates).toHaveAccessibleDescription(/Encrypted on this device/);
  await expect(page.locator('[data-control-id="libraries.productivity"]')).toBeEnabled();
  await expect(page.locator('[data-control-id="libraries.branding"]')).toHaveAttribute(
    'href',
    '/settings/preferences#report-branding',
  );
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'authentication_required' } }),
  );
  await page.goto(surfacePath);
  await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/login?' + new URLSearchParams({ next: surfacePath }),
  );
  await expect(controls('originals.attach')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
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
