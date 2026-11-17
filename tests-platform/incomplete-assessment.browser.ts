import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { orientedJpeg } from './fixtures/images';

const owner = '00000000-0000-4000-8000-000000000001';

test('empty and partial assessments survive reopening and a draft estimate workbook', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
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
    async ({ owner, jpeg }) => {
      const load = (path: string): Promise<unknown> => import(path);
      const { LocalVault } = (await load(
        '/src/platform/vault/vault.ts',
      )) as typeof import('../src/platform/vault/vault');
      const { newProject, newSurface, localProjects } = (await load(
        '/src/platform/projects/projects.ts',
      )) as typeof import('../src/platform/projects/projects');
      const { measuredAssessments } = (await load(
        '/tests-platform/fixtures/measured-assessment.ts',
      )) as typeof import('./fixtures/measured-assessment');
      const vault = new LocalVault(owner, () => undefined);
      try {
        await vault.create('ab'.repeat(32), true);
        const project = newProject('Incomplete fixture', 'Wall', 'Empty', 'EUR');
        const partial = newSurface('Partial');
        project.objects[0]!.surfaces.push(partial);
        const image = await vault
          .files()
          .stage(
            project.id,
            new File([new Uint8Array(jpeg)], 'synthetic.jpg', { type: 'image/jpeg' }),
          );
        const { current } = measuredAssessments(image.id);
        delete current.calibration;
        partial.images = [{ id: image.id, role: 'mapping' }];
        partial.assessments = [current];
        const saved = await localProjects(vault).save(project);
        const reopened = (await localProjects(vault).list()).find(({ id }) => id === saved.id)!;
        return {
          path: '/projects/' + saved.id,
          expected: JSON.stringify(current),
          actual: JSON.stringify(reopened.objects[0]!.surfaces[1]!.assessments![0]),
          empty: reopened.objects[0]!.surfaces[0]!.assessments ?? [],
        };
      } finally {
        vault.close();
      }
    },
    { owner, jpeg: Array.from(orientedJpeg) },
  );
  expect(fixture.actual).toBe(fixture.expected);
  expect(fixture.empty).toEqual([]);
  const phase = (id: string) => page.locator(`[data-control-id="estimate.phase.${id}"]`);
  const finance = (id: string) => page.locator(`[data-control-id="estimate.finance.${id}"]`);
  const step = (id: string) => page.locator(`[data-control-id="estimate.step.${id}"]`).click();
  const report = (id: string) => page.locator(`[data-control-id="report.review.${id}"]`);
  await page.goto(fixture.path + '/estimates');
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await step('phases');
  await phase('newName').fill('Manual empty');
  await phase('add').click();
  await phase('scopeSurface').selectOption({ label: 'Wall / Empty' });
  await phase('time').fill('3');
  await phase('rate').fill('12');
  await phase('material').fill('7');
  await phase('newName').fill('Partial area');
  await phase('add').click();
  await phase('scopeSurface').selectOption({ label: 'Wall / Partial' });
  await phase('mask').selectOption({ label: 'Cleaning scope' });
  await phase('time').fill('4');
  await phase('price').selectOption('area');
  await phase('rate').fill('10');
  await phase('material').fill('8');
  await expect(page.locator('[data-estimate-result="total"]')).toHaveText('—');
  await step('issue');
  await expect(finance('issue')).toBeDisabled();
  await expect(finance('snapshot')).toBeEnabled();
  await finance('snapshot').click();
  await expect(page.getByText('Version saved on this device. Not synced yet.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await step('phases');
  await expect(phase('phase').locator('option')).toHaveCount(2);
  await phase('phase').selectOption({ label: 'Partial area' });
  await expect(phase('time')).toHaveValue('4');
  await expect(phase('rate')).toHaveValue('10');
  await expect(phase('material')).toHaveValue('8');
  await expect(phase('mask').locator('option:checked')).toHaveText('Cleaning scope');
  await phase('phase').selectOption({ label: 'Manual empty' });
  await expect(phase('time')).toHaveValue('3');
  await expect(phase('rate')).toHaveValue('12');
  await expect(phase('material')).toHaveValue('7');
  await page.locator('[data-control-id="project.review.outputs"]').click();
  await report('finances').selectOption('full');
  await expect(report('estimateVersion').locator('option:checked')).toHaveText('v1 · Draft');
  await report('format').selectOption('XLSX');
  await report('workbook').selectOption('editable');
  await report('preview').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Draft estimate (not issued)');
  await expect(dialog).toContainText('Measurement unavailable for this version.');
  await expect(dialog).toContainText('Manual empty');
  await expect(dialog).toContainText('Partial area');
  await expect(dialog).toContainText('50%');
  await expect(dialog).toContainText('€43.00');
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: info.outputPath(`incomplete-${viewport.width}.png`) });
  }
  const download = page.waitForEvent('download');
  await report('download').click();
  const bytes = await readFile((await (await download).path())!, 'utf8');
  expect(bytes).toContain('Draft estimate (not issued)');
  expect(bytes).toContain('Manual empty');
  expect(bytes).toContain('Partial area');
  expect(bytes).not.toContain('r="F3"'); // Missing area has no numeric cell.
  expect(bytes).toContain('r="L3"><v>10</v>');
  expect(bytes).toContain('r="M3"><v>8</v>');
  await report('cancel').click();
  await report('language').selectOption('hu');
  await report('preview').click();
  await expect(dialog).toContainText('Becsléspiszkozat (nem kiadott)');
  await expect(dialog).toContainText('Ehhez a verzióhoz nincs mérés.');
  await page.screenshot({ path: info.outputPath('incomplete-hu.png') });
});
