import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export async function verifyFinalReport(page: Page, info: TestInfo, projectPath: string) {
  const report = (key: string) => page.locator(`[data-control-id="report.review.${key}"]`);
  const dialog = page.getByRole('dialog');
  for (const format of ['PDF', 'XLSX'] as const) {
    await report('format').selectOption(format);
    if (format === 'PDF') await report('resolution').selectOption('150');
    await expect(report('final')).toBeEnabled();
    await report('final').click();
    await expect(dialog).toContainText('Final report from selected assessments.');
    await expect(dialog).toContainText('Source issued estimate version 1');
    await expect(dialog).not.toContainText('Draft preview');
    for (const viewport of [
      { width: 1194, height: 834 },
      { width: 834, height: 1194 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(dialog.locator('.report-scroll')).toHaveJSProperty(
        'scrollWidth',
        await dialog.locator('.report-scroll').evaluate((node) => node.clientWidth),
      );
      await page.screenshot({ path: info.outputPath(`final-${format}-${viewport.width}.png`) });
    }
    const pending = page.waitForEvent('download');
    await report('download').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(`calirestore-report-final.${format.toLowerCase()}`);
    await download.saveAs(info.outputPath(`final-report.${format.toLowerCase()}`));
    const bytes = await readFile((await download.path())!);
    if (format === 'PDF') expect(bytes.toString('latin1')).toMatch(/^%PDF-1.4/);
    else {
      expect(bytes.toString()).toContain('Final report from selected assessments.');
      expect(bytes.toString()).toContain('Source issued estimate version');
      expect(bytes.toString()).not.toContain('Draft export');
    }
    await report('cancel').click();
  }
  const saved = await page.evaluate(async (projectPath) => {
    const load = (path: string): Promise<unknown> => import(path);
    const { LocalVault } = (await load(
      '/src/platform/vault/vault.ts',
    )) as typeof import('../src/platform/vault/vault');
    const { reportRepository } = (await load(
      '/src/platform/reports/persistence.ts',
    )) as typeof import('../src/platform/reports/persistence');
    const vault = new LocalVault('00000000-0000-4000-8000-000000000001', () => undefined);
    try {
      await vault.unlock();
      return (await reportRepository(vault).load(projectPath.split('/').at(-1)!))!.document;
    } finally {
      vault.close();
    }
  }, projectPath);
  expect(saved.issuance!.estimate.version).toBe(1);
  expect(saved.issuance!.estimate.id).toBe(saved.settings.estimate);
  expect(Date.parse(saved.issuance!.issuedAt)).toBeGreaterThan(0);
  await report('language').selectOption('hu');
  await report('final').click();
  await expect(dialog).toContainText('Végleges jelentés a kijelölt felmérésekből.');
  await expect(dialog).toContainText('A forrásként használt kiadott becslés verziója 1');
  await page.screenshot({ path: info.outputPath('final-hu.png') });
  await report('cancel').click();
  await report('language').selectOption('en');
  await report('preview').click();
  await expect(dialog).toContainText('Draft preview from selected assessments.');
  const pending = page.waitForEvent('download');
  await report('download').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('calirestore-report-draft.xlsx');
  expect((await readFile((await download.path())!)).toString()).toContain('Draft export');
  await report('cancel').click();
}
