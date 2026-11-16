import { expect } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import { drawingControl } from '../drawing-review';
import { setupRememberedVault } from '../vault-setup';
import { expectPageTrail } from '../app-navigation';
import { controls, review } from './flow';
import type { ProjectsFlow } from './flow';

/**
 * Sets up a remembered vault, creates "East Chapel" with the object "North wall" and the surface
 * "Upper plaster" in imperial units, and opens the surface. Ends on the surface page in photo mode
 * with no originals.
 */
export async function createProjectHierarchy(flow: ProjectsFlow, info: TestInfo) {
  const { page } = flow;
  const control = (id: string) => controls(page, id);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/projects');
  await setupRememberedVault(page);
  for (const id of ['projects.search', 'projects.sort', 'projects.restore', 'projects.offline']) {
    await expect(control(id)).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath('project-library.png') });
  await page.getByLabel('Project name').fill('East Chapel');
  await control('projects.create').click();
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
  flow.projectPath = new URL(page.url()).pathname;
  for (const id of [
    'project.library',
    'project.collaboration',
    'project.backup',
    'project.sync.enable',
  ]) {
    await expect(control(id)).toBeVisible();
  }
  await control('project.surface').click();
  flow.surfacePath = new URL(page.url()).pathname;
  expect(flow.surfacePath).toMatch(/^\/projects\/[a-f0-9-]{36}\/surfaces\/[a-f0-9-]{36}$/);
  await expect(control('surface.project')).toHaveText('East Chapel');
  // One title per surface page (#39); the object (step 2) is plain text, not a link.
  await expectPageTrail(page, 'Projects › East Chapel › North wall › Upper plaster', 2);
  await expect(control('project.collaboration')).toHaveCount(0);
  await expect(review(page, 'view.photo')).toBeDisabled();
  await expect(review(page, 'review.prepare')).toHaveAttribute('aria-disabled', 'true');
  await drawingControl(page, 'mode.drawing').click();
  await expect(drawingControl(page, 'tool.brush')).toBeDisabled();
  await expect(drawingControl(page, 'layer.select')).toHaveCount(0);
  await drawingControl(page, 'mode.photo').click();
}
