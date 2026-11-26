import { expect } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import {
  browserControl,
  browserItem,
  browserReady,
  inspect,
  openItem,
  openProjectSettings,
} from '../project-browser';
import { originalsPage } from '../originals';
import { controls, otherAccount, required } from './flow';
import type { ProjectsFlow } from './flow';

/**
 * Back on "Upper plaster" (from another surface page of "North wall"), checks the saved originals, roles and settings, then archives the
 * project in its settings dialog, finds it with the browser's archived filter and restores it.
 * Starts on a surface page of "East Chapel"; ends in the restored project's objects.
 */
export async function archiveAndRestore(flow: ProjectsFlow, info: TestInfo) {
  const { page } = flow;
  const control = (id: string) => controls(page, id);
  // Originals are listed on their surface's page.
  await originalsPage(page, 'Upper plaster');
  await expect(page.locator('.project-originals').getByText('plaster-detail.dng')).toBeVisible();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'plaster-detail.dng' })
      .getByRole('combobox', { name: 'Image role' }),
  ).toHaveValue('reference');
  await control('surface.project').click();
  // The project's currency is set on the project; children show it read-only.
  await inspect(page, 'North wall');
  await browserControl(page, 'browser.action.manage').click();
  await expect(page.getByRole('dialog')).toContainText('USD');
  await expect(
    page.getByRole('dialog').locator('[data-control-id$=".restoration.units"]'),
  ).toHaveValue('imperial');
  await browserControl(page.getByRole('dialog'), 'browser.dialog.close').click();
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 834);
  await page.screenshot({ path: info.outputPath('projects-portrait.png'), fullPage: true });
  const settings = await openProjectSettings(page);
  await settings.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Restore project' })).toBeVisible();
  await settings.locator('[data-control-id="browser.dialog.close"]').click();
  await expect(page.locator('.project-browser-notice')).toContainText('archived');
  await expect(browserControl(page, 'browser.new')).toHaveAttribute('aria-disabled', 'true');
  await control('project.library').click();
  await browserReady(page);
  await expect(browserItem(page, 'East Chapel')).toHaveCount(0);
  await browserControl(page, 'browser.find').click();
  const query = browserControl(page, 'browser.query');
  await query.fill('archived:true');
  await expect(browserItem(page, 'East Chapel')).toHaveCount(1);
  await query.fill('archived:true missing');
  await expect(browserItem(page, 'East Chapel')).toHaveCount(0);
  await query.fill('archived:true');
  await openItem(page, 'East Chapel');
  const restore = await openProjectSettings(page);
  await restore.getByRole('button', { name: 'Restore project' }).click();
  await expect(restore.getByRole('button', { name: 'Archive', exact: true })).toBeVisible();
  await restore.locator('[data-control-id="browser.dialog.close"]').click();
  await page.setViewportSize({ width: 1194, height: 834 });
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
  // The pattern library has its own entry in the menu sidebar.
  await page.locator('[data-control-id="app.nav.libraries"]').click();
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
