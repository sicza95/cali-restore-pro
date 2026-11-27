import { expect } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import { drawingControl } from '../drawing-review';
import { expectPageTrail } from '../app-navigation';
import {
  runItemAction,
  browserControl,
  browserItem,
  createItem,
  inspect,
  openItem,
  openProjectSettings,
  openRootSettings,
  overrideRestoration,
} from '../project-browser';
import { controls, review } from './flow';
import type { ProjectsFlow } from './flow';

/**
 * Sets up a remembered vault, creates "East Chapel" (currency USD) with the object "North wall"
 * (imperial units) and its surface "Upper plaster" through the project browser, and opens the
 * surface. Ends on the surface page in photo mode with no originals.
 */
export async function createProjectHierarchy(flow: ProjectsFlow, info: TestInfo) {
  const { page } = flow;
  const control = (id: string) => controls(page, id);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/projects');
  for (const id of ['browser.new', 'browser.sort', 'browser.find', 'browser.actions.overflow']) {
    await expect(browserControl(page, id)).toBeVisible();
  }
  // Import is the New button's second option; offline originals sit behind the root gear.
  await expect(browserControl(page, 'browser.import')).toBeVisible();
  const root = await openRootSettings(page);
  await expect(root.locator('[data-control-id="projects.offline"]')).toBeVisible();
  await root.locator('[data-control-id="browser.dialog.close"]').click();
  await page.screenshot({ path: info.outputPath('project-library.png') });

  await createItem(page, 'East Chapel');
  await inspect(page, 'East Chapel');
  await overrideRestoration(page, 'currency', 'USD');
  await openItem(page, 'East Chapel');
  await expect(page.getByRole('heading', { level: 1, name: 'East Chapel' })).toBeVisible();
  flow.projectPath = new URL(page.url()).pathname;
  // A new project is empty in the browser (ADR 0011): no default object or surface.
  await expect(page.locator('[data-browser-item]')).toHaveCount(0);
  await createItem(page, 'North wall');
  await inspect(page, 'North wall');
  await overrideRestoration(page, 'units', 'imperial');
  const settings = await openProjectSettings(page);
  for (const id of ['project.collaboration', 'project.backup', 'project.sync.enable']) {
    await expect(settings.locator(`[data-control-id="${id}"]`)).toBeVisible();
  }
  await settings.locator('[data-control-id="browser.dialog.close"]').click();
  await expect(control('project.library')).toBeVisible();
  await openItem(page, 'North wall');
  const objectPath = new URL(page.url()).pathname;
  await createItem(page, 'Upper plaster');
  // The surface inherits the object's imperial units.
  await inspect(page, 'Upper plaster');
  await runItemAction(page, 'manage');
  await expect(
    page.getByRole('dialog').locator('[data-control-id$=".restoration.units"]'),
  ).toHaveValue('imperial');
  await browserControl(page.getByRole('dialog'), 'browser.dialog.close').click();
  await openItem(page, 'Upper plaster');
  flow.surfacePath = new URL(page.url()).pathname;
  expect(flow.surfacePath).toMatch(/^\/projects\/[a-f0-9-]{36}\/surfaces\/[a-f0-9-]{36}$/);
  await expect(control('surface.project')).toHaveText('East Chapel');
  // One title per surface page (#39); the object step links to its surfaces in the browser.
  await expectPageTrail(page, 'Projects › East Chapel › North wall › Upper plaster');
  await expect(control('surface.object')).toHaveAttribute('href', objectPath);
  await expect(control('project.collaboration')).toHaveCount(0);
  await expect(browserItem(page, 'Upper plaster')).toHaveCount(0);
  await expect(review(page, 'view.photo')).toBeDisabled();
  await expect(review(page, 'review.prepare')).toHaveAttribute('aria-disabled', 'true');
  await drawingControl(page, 'mode.drawing').click();
  await expect(drawingControl(page, 'tool.brush')).toBeDisabled();
  await expect(drawingControl(page, 'layer.select')).toHaveCount(0);
  await drawingControl(page, 'mode.photo').click();
}
