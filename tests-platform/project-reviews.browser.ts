import AxeBuilder from '@axe-core/playwright';
import { orientedJpeg } from './fixtures/images';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { estimateControls } from '../src/ui/account-access/project-review/estimate-controls';
import { reportControls } from '../src/ui/account-access/project-review/report-controls';
import { projectTable, reportTable, revisionQueueTable } from '../src/platform/vault/store';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const controls = [...estimateControls, ...reportControls];

function control(page: Page, id: string) {
  expect(controls.some((contract) => contract.id === id)).toBe(true);
  return page.locator(`[data-control-id="${id}"]`);
}

async function openVault(page: Page) {
  await page.getByLabel(/Remember this browser/).check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
  await page.getByLabel('I saved the recovery key').check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
}

async function revisions(page: Page, tables = [projectTable, revisionQueueTable]) {
  return page.evaluate(async (tables) => {
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
  }, tables);
}

async function inspectReview(page: Page, info: TestInfo, label: string, ids: string[]) {
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    for (const id of ids) {
      const box = (await control(page, id).first().boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: info.outputPath(`${label}-${viewport.width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1194, height: 834 });
}

test.use({ hasTouch: true, viewport: { width: 1194, height: 834 } });

test('owner reviews work phases, scoped inputs and independent report output through opaque routes', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  let account = owner;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const phase = (key: string) => control(page, 'estimate.phase.' + key);
  const finance = (key: string) => control(page, 'estimate.finance.' + key);
  const report = (key: string) => control(page, 'report.review.' + key);
  const nav = (key: string) => control(page, 'project.review.' + key);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: { id: account, email: 'restorer@example.test', state: 'active', role: 'member' },
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.goto('/projects');
  await openVault(page);
  await page.getByLabel('Project name').fill('East Chapel');
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('heading', { name: 'East Chapel' })).toBeVisible();
  const path = new URL(page.url()).pathname;
  expect(path).toMatch(/^\/projects\/[a-f0-9-]{36}$/);
  await page.getByLabel('Original file', { exact: true }).setInputFiles({
    name: 'private-source.jpg',
    mimeType: 'image/jpeg',
    buffer: orientedJpeg,
  });
  await page
    .locator('.project-originals form')
    .getByRole('combobox', { name: 'Image role' })
    .selectOption('reference');
  await page.getByRole('button', { name: 'Attach original' }).click();
  await expect(page.getByText('private-source.jpg')).toBeVisible();
  await page.getByLabel('Add object').fill('North wall');
  await page.getByRole('button', { name: 'Add object' }).click();
  await page
    .getByRole('combobox', { name: 'North wall · Units', exact: true })
    .selectOption('imperial');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Surface 1 · Imperial')).toBeVisible();
  const before = await revisions(page);
  await nav('estimates').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(path + '/estimates');
  await expect(nav('estimates')).toHaveAttribute('aria-current', 'page');
  await expect(finance('snapshot')).toBeDisabled();
  await phase('newName').fill('Surface cleaning');
  await phase('newName').press('Enter');
  await expect(phase('name')).toHaveValue('Surface cleaning');
  await phase('scopeSurface').selectOption({ label: 'Object 1 / Surface 1' });
  await phase('draw').tap();
  await expect(page.getByText(/^Independent scope draft/)).toBeVisible();
  await phase('split').click();
  await expect(phase('name')).toHaveValue('Surface cleaning · Split');
  await phase('cloneFrom').selectOption({ label: 'Surface cleaning' });
  await phase('clone').tap();
  await phase('earlier').click();
  await expect(phase('phase').locator('option').first()).toHaveText('Surface cleaning · Split');
  await phase('combineWith').selectOption({ label: 'Surface cleaning' });
  await phase('combine').click();
  await expect(phase('name')).toHaveValue(/^Combined/);
  await expect(phase('restore')).toHaveCount(2);
  await phase('archive').click();
  await page
    .getByRole('listitem')
    .filter({ has: page.getByText('Surface cleaning', { exact: true }) })
    .getByRole('button', { name: 'Restore phase' })
    .click();
  await phase('duplicate').tap();
  await expect(phase('name')).toHaveValue('Surface cleaning · Copy');
  await phase('archive').click();
  await phase('name').fill('Dry surface cleaning');
  await phase('time').fill('4');
  await expect(phase('productivityOutput')).toHaveAttribute('readonly', '');
  await phase('multiplier').fill('0');
  await expect(phase('multiplier')).toHaveAttribute('aria-invalid', 'true');
  await expect(phase('keepHours')).toBeDisabled();
  await phase('cancel').tap();
  await expect(phase('multiplier')).toHaveValue('1');
  await phase('multiplier').fill('1,5');
  await expect(phase('adjustHours')).toBeEnabled();
  await phase('keepHours').tap();
  await expect(phase('time')).toHaveValue('4');
  await phase('measurement').selectOption('stale');
  await phase('acknowledge').tap();
  await expect(phase('measurement')).toHaveValue('ready');
  await phase('mode').selectOption('productivity');
  await expect(phase('hoursOutput')).toHaveValue('—');
  await phase('productivity').fill('2');
  await phase('price').selectOption('area');
  await phase('units').selectOption('cm²');
  await expect(phase('rate')).toHaveAccessibleName(/\/cm²/);
  await phase('productivity').fill('2,5');
  await phase('rate').fill('-12');
  await expect(phase('rate')).toHaveAttribute('aria-invalid', 'true');
  await phase('rate').fill('12.50');
  await phase('units').selectOption('m²');
  await expect(phase('rate')).toHaveValue('125000');
  await phase('units').selectOption('cm²');
  await expect(phase('rate')).toHaveValue('12.5');
  await expect(phase('productivity')).toHaveValue('2.5');
  await phase('material').fill('3');
  await finance('newExtra').tap();
  await finance('extraName').fill('Lighting');
  await finance('extraScope').selectOption({ label: 'North wall' });
  await finance('extraMethod').selectOption('hourly');
  await finance('extraHours').fill('-3');
  await expect(finance('extraHours')).toHaveAttribute('aria-invalid', 'true');
  await expect(finance('snapshot')).toBeDisabled();
  await finance('selection').selectOption('selected');
  await expect(finance('snapshot')).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Object 1', exact: true }).tap();
  await finance('newAdjustment').click();
  await finance('adjustmentName').fill('Contingency');
  await finance('adjustmentPercent').fill('101');
  await expect(finance('snapshot')).toBeDisabled();
  await finance('adjustmentPercent').fill('-5');
  await finance('tax').check();
  await finance('taxPercent').fill('101');
  await expect(finance('snapshot')).toBeDisabled();
  await finance('taxPercent').fill('20');
  await finance('tax').uncheck();
  await expect(finance('taxPercent')).toHaveCount(0);
  await finance('tax').check();
  await expect(finance('taxPercent')).toHaveValue('20');
  await finance('assumptions').fill('Review cleaning access.');
  await finance('snapshot').tap();
  const captured = page.getByRole('status').filter({ hasText: 'Encrypted input version' });
  await expect(captured).toContainText('12.5');
  await expect(captured).toContainText('Object 1');
  await expect(captured).not.toContainText('Lighting');
  await phase('rate').fill('88');
  await expect(captured).toContainText('12.5');
  await finance('snapshot').tap();
  await expect(finance('version')).toHaveValue('2');
  await finance('version').selectOption('1');
  await expect(captured).toContainText('12.5');
  await expect(finance('issue')).toBeDisabled();
  await inspectReview(page, info, 'estimate', [
    'estimate.phase.add',
    'estimate.phase.price',
    'estimate.finance.snapshot',
  ]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await nav('reports').tap();
  await expect(page).toHaveURL(path + '/reports');
  await report('version').nth(1).selectOption('followup');
  await expect(report('version').first()).toHaveValue('current');
  await report('preview').tap();
  const inherited = page.getByRole('dialog');
  await expect(inherited).toContainText('Measurement unavailable for this version.');
  await expect(inherited).toContainText('Output area units · m²');
  await expect(inherited).toContainText('Output area units · ft²');
  await expect(inherited.getByRole('img', { name: 'Illustrative map' })).toHaveCount(1);
  await report('cancel').tap();
  await report('includeObject').nth(1).uncheck();
  await report('includeSurface').uncheck();
  await expect(report('preview')).toBeDisabled();
  await report('includeSurface').check();
  await report('version').selectOption('baseline');
  await report('compare').selectOption('followup');
  await report('references').click();
  await report('reference').check();
  await report('language').selectOption('hu');
  await expect(page.getByLabel('App language')).toHaveValue('en');
  await report('units').selectOption('ft²');
  await report('map').uncheck();
  await report('legend').uncheck();
  await report('detail').check();
  await report('notes').fill('Inspect fragile edges.');
  await report('branding').selectOption('override');
  await report('studio').fill('Chapel Studio');
  await report('footer').fill('Conservation review');
  await nav('outputs').tap();
  await expect(page).toHaveURL(path + '/outputs');
  await expect(report('language')).toHaveValue('hu');
  await expect(report('units')).toHaveValue('ft²');
  await report('format').selectOption('PNG');
  await report('resolution').selectOption('600');
  await report('format').selectOption('XLSX');
  await expect(report('resolution')).toHaveCount(0);
  await expect(report('workbook').locator('option')).toHaveCount(1);
  await expect(report('download')).toBeHidden();
  await expect(report('final')).toBeDisabled();
  await report('preview').focus();
  await page.keyboard.press('Enter');
  const draft = page.getByRole('dialog');
  await expect(report('download')).toBeEnabled();
  await expect(draft).toHaveAccessibleName('Restaurálási jelentés');
  await expect(draft.locator('article')).toHaveAttribute('lang', 'hu');
  await expect(draft).toContainText('Numerikus pillanatkép');
  await expect(draft).toContainText('64,58 ft²');
  await expect(draft).toContainText('Összehasonlítás');
  await expect(draft).toContainText('Chapel Studio');
  await expect(draft).toContainText('Referenciafotó 1');
  await expect(draft).not.toContainText('North wall');
  await expect(draft).not.toContainText('private-source.jpg');
  await expect(draft.locator('svg')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(report('preview')).toBeFocused();
  await inspectReview(page, info, 'output', [
    'report.review.preview',
    'report.review.format',
    'report.review.includeSurface',
  ]);
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await report('preview').tap();
    const cancel = (await report('cancel').boundingBox())!;
    expect(cancel.width).toBeGreaterThanOrEqual(44);
    expect(cancel.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: info.outputPath(`report-preview-${viewport.width}.png`) });
    await report('cancel').tap();
    await expect(draft).toHaveCount(0);
  }
  await page.getByLabel('App language').selectOption('hu');
  await expect(page.getByRole('heading', { name: 'Exportálási előnézet' })).toBeVisible();
  await report('language').selectOption('en');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width: 834, height: 1194 });
  await report('preview').tap();
  await expect(draft).toHaveAccessibleName('Restoration report');
  await expect(draft.locator('article')).toHaveAttribute('lang', 'en');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('report-preview-dark-834.png') });
  await report('cancel').tap();
  await page.getByLabel('Az alkalmazás nyelve').selectOption('en');
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await revisions(page)).toEqual(before);
  await page.goBack();
  await expect(page).toHaveURL(path + '/reports');
  await expect(report('units')).toHaveValue('ft²');
  await report('save').click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Report draft saved on this device.' }),
  ).toBeVisible();
  const stored = await revisions(page, [reportTable]);
  expect(stored[0]).toHaveLength(1);
  expect(JSON.stringify(stored)).not.toContain('Inspect fragile edges.');
  expect(JSON.stringify(stored)).not.toContain('Chapel Studio');
  await page.goto(path + '/outputs');
  await expect(report('preview')).toHaveCount(0);
  await expect(page.getByText('East Chapel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await expect(report('preview')).toBeVisible();
  await expect(report('units')).toHaveValue('ft²');
  await expect(report('language')).toHaveValue('en');
  await expect(report('studio')).toHaveValue('Chapel Studio');
  await expect(report('compare')).toHaveValue('followup');
  await page.getByRole('button', { name: 'Lock vault' }).click();
  await expect(report('preview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await page.locator('[data-control-id="project.review.parent"]').click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore project' })).toBeVisible();
  await page.goto(path + '/outputs');
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await expect(report('preview')).toHaveCount(0);
  await expect(page.getByText('East Chapel')).toHaveCount(0);
  account = other;
  await page.goto(path + '/estimates?scope=estimate-full');
  await openVault(page);
  await expect(
    page.getByText('This project or surface is unavailable on this device.'),
  ).toBeVisible();
  await expect(finance('snapshot')).toHaveCount(0);
  await expect(page.getByText('East Chapel')).toHaveCount(0);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'authentication_required' } }),
  );
  await page.goto(path + '/reports');
  await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/login?' + new URLSearchParams({ next: path + '/reports' }),
  );
  expect(pageErrors).toEqual([]);
});
