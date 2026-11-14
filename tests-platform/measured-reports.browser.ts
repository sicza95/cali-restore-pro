import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { orientedJpeg } from './fixtures/images';

const owner = '00000000-0000-4000-8000-000000000001';

test('reconciles a committed checkpoint estimate with scoped production downloads', async ({
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
      const { localProjects, newProject } = (await load(
        '/src/platform/projects/projects.ts',
      )) as typeof import('../src/platform/projects/projects');
      const { measuredAssessments } = (await load(
        '/tests-platform/fixtures/measured-assessment.ts',
      )) as typeof import('./fixtures/measured-assessment');
      const vault = new LocalVault(owner, () => undefined);
      try {
        await vault.create('ab'.repeat(32), true);
        const project = newProject('Measured chapel', 'East wall', 'Plaster', 'EUR');
        const stage = (name: string) =>
          vault
            .files()
            .stage(project.id, new File([new Uint8Array(jpeg)], name, { type: 'image/jpeg' }));
        const mapping = await stage('PRIVATE-MAPPING.jpg');
        const reference = await stage('PRIVATE-REFERENCE.jpg');
        const excluded = await stage('PRIVATE-EXCLUDED.jpg');
        const { current, checkpoint } = measuredAssessments(mapping.id);
        const surface = project.objects[0]!.surfaces[0]!;
        surface.images = [
          { id: mapping.id, role: 'mapping' },
          { id: reference.id, role: 'reference' },
          { id: excluded.id, role: 'reference' },
        ];
        surface.checkpoints = [checkpoint];
        surface.assessments = [current];
        await localProjects(vault).save(project);
        return {
          path: '/projects/' + project.id,
          checkpoint: checkpoint.id,
          privateIds: [mapping.id, reference.id, excluded.id],
        };
      } finally {
        vault.close();
      }
    },
    { owner, jpeg: Array.from(orientedJpeg) },
  );

  const phase = (key: string) => page.locator('[data-control-id="estimate.phase.' + key + '"]');
  const finance = (key: string) => page.locator('[data-control-id="estimate.finance.' + key + '"]');
  const report = (key: string) => page.locator('[data-control-id="report.review.' + key + '"]');
  await page.goto(fixture.path + '/estimates');
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await phase('newName').fill('Clean plaster');
  await phase('add').click();
  await phase('scopeSurface').selectOption({ label: 'East wall / Plaster' });
  await phase('mask').selectOption({ label: 'Cleaning scope' });
  await expect(page.locator('[data-measured-phase-area]')).toContainText('6 m²');
  await phase('time').fill('3');
  await phase('rate').fill('10');
  await phase('assessment').selectOption(fixture.checkpoint);
  await expect(page.locator('[data-measured-phase-area]')).toContainText('4 m²');
  await expect(phase('time')).toHaveValue('3');
  await expect(finance('issue')).toBeDisabled();
  await phase('acknowledge').click();
  await phase('mode').selectOption('productivity');
  await phase('productivity').fill('2');
  await expect(phase('hoursOutput')).toHaveValue('2');
  await expect(page.locator('[data-estimate-result="total"]')).toHaveText('20.00');
  await finance('issue').click();
  await expect(page.getByText('Encrypted version saved locally. Not cloud-synced.')).toBeVisible();

  await page.locator('[data-control-id="project.review.outputs"]').click();
  await report('format').selectOption('SVG');
  await report('finances').selectOption('full');
  await report('preview').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Estimate omitted');
  await report('cancel').click();
  await report('version').selectOption(fixture.checkpoint);
  await report('compare').selectOption('current');
  await report('references').click();
  await report('reference').first().check();
  await report('preview').click();
  await expect(dialog).toContainText('Initial on-site survey');
  await expect(dialog).toContainText('20.00');
  await expect(dialog.getByRole('img', { name: 'Assessment map' })).toHaveCount(2);
  await expect(dialog.getByRole('img', { name: 'Reference photo 1' })).toHaveJSProperty(
    'naturalWidth',
    48,
  );
  await expect(dialog.getByRole('img', { name: 'Reference photo 2' })).toHaveCount(0);
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(dialog.locator('.report-scroll')).toHaveJSProperty(
      'scrollWidth',
      await dialog.locator('.report-scroll').evaluate((node) => node.clientWidth),
    );
    await page.screenshot({ path: info.outputPath('measured-' + viewport.width + '.png') });
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const download = page.waitForEvent('download');
  await report('download').click();
  const text = await readFile((await (await download).path())!, 'utf8');
  expect(text.match(/data:image\/jpeg;base64,/g)).toHaveLength(1);
  expect(text).toContain('Initial on-site survey');
  expect(text).toContain('Estimate total · 20 EUR');
  for (const privateText of ['PRIVATE-', '#abcdef', 'Reference photo 2', ...fixture.privateIds])
    expect(text).not.toContain(privateText);
  await report('cancel').click();
  await report('format').selectOption('XLSX');
  await report('workbook').selectOption('editable');
  await report('preview').click();
  await expect(dialog).toContainText('Editable estimate');
  const workbook = page.waitForEvent('download');
  await report('download').click();
  const bytes = await readFile((await (await workbook).path())!, 'utf8');
  expect(bytes).toContain('<v>20</v>');
  expect(bytes).toContain('Clean plaster');
  expect(bytes).toContain('<f>');
  expect(bytes).not.toContain('data:image');
});
