import { expect } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import { controls, otherAccount, required } from './flow';
import type { ProjectsFlow } from './flow';

/**
 * Back on "Upper plaster" from the project page, checks the saved settings and roles, then
 * archives, finds and restores the project. Starts on a surface page of "East Chapel".
 */
export async function archiveAndRestore(flow: ProjectsFlow, info: TestInfo) {
  const { page } = flow;
  const control = (id: string) => controls(page, id);
  await control('surface.project').click();
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
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore project' })).toBeVisible();
  await control('project.library').click();
  await expect(page.getByRole('link', { name: 'East Chapel' })).toHaveCount(0);
  await page.getByLabel('Show archived').check();
  await expect(control('projects.open')).toHaveText('East Chapel');
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('missing');
  await expect(control('projects.open')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search projects' }).clear();

  await control('projects.open').click();
  await page.getByRole('button', { name: 'Restore project' }).click();
}

/**
 * An unknown surface, another account on the same browser, the locked libraries page and a
 * signed-out session each show the surface's data nowhere.
 */
export async function verifyUnavailable(flow: ProjectsFlow) {
  const { page } = flow;
  const projectPath = required(flow.projectPath, 'projectPath');
  const surfacePath = required(flow.surfacePath, 'surfacePath');
  const control = (id: string) => controls(page, id);
  await page.goto(projectPath + '/surfaces/00000000-0000-4000-8000-000000000099');
  await expect(
    page.getByText('This project or surface is unavailable on this device.'),
  ).toBeVisible();
  await expect(control('surface.project')).toHaveText('East Chapel'); // the project still exists
  await expect(page.locator('.project-workspace').getByText('East Chapel')).toHaveCount(0);
  await expect(control('originals.attach')).toHaveCount(0);
  flow.account = otherAccount;
  await page.goto(surfacePath);
  await expect(
    page.getByText('This project or surface is unavailable on this device.'),
  ).toBeVisible();
  await expect(page.getByText('plaster-detail.dng')).toHaveCount(0);
  await page.goto('/settings/preferences');
  await page.locator('[data-control-id="settings.libraries"]').click();
  await expect(page).toHaveURL('/settings/libraries');
  const rates = page.locator('[data-control-id="libraries.rates"]');
  await expect(rates).toBeEnabled();
  await expect(rates).toHaveAccessibleDescription(/Saved on this device/);
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
  await expect(control('originals.attach')).toHaveCount(0);
}
