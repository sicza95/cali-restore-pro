import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Helpers for the three-level project browser (`/projects`, `/projects/:p`,
 * `/projects/:p/objects/:o`, ADR 0011). Flows that used to fill the long project form create,
 * open and configure items through these instead.
 */
export const browserControl = (scope: Page | Locator, id: string) =>
  scope.locator(`[data-control-id="${id}"]`);

/** The tile or row of the item with exactly this name on the current level. */
export const browserItem = (page: Page, name: string) =>
  page.locator('[data-browser-item]').filter({
    has: page.locator('.browser-item-name').getByText(name, { exact: true }),
  });

/** Waits until the browser has listed its level (the toolbar is on screen). */
export async function browserReady(page: Page) {
  await expect(browserControl(page, 'browser.new')).toBeVisible();
}

/** New (far left) → name dialog → Create. Returns the new item's ID; it is selected. */
export async function createItem(page: Page, name: string) {
  await browserReady(page);
  await browserControl(page, 'browser.new').click();
  const dialog = page.getByRole('dialog');
  await browserControl(dialog, 'browser.dialog.name').fill(name);
  await browserControl(dialog, 'browser.dialog.confirm').click();
  await expect(dialog).toHaveCount(0);
  const item = browserItem(page, name);
  await expect(item).toHaveAttribute('aria-selected', 'true');
  return (await item.getAttribute('data-browser-item'))!;
}

/** Opens an item with a double click and waits for the next level or surface page. */
export async function openItem(page: Page, name: string) {
  const item = browserItem(page, name);
  await item.click();
  const before = page.url();
  await item.dblclick();
  await expect(page).not.toHaveURL(before);
}

/** Creates a project at the root and opens it. Returns its path, `/projects/<id>`. */
export async function createProjectViaBrowser(page: Page, name: string, origin = '') {
  if (!/\/projects$/.test(new URL(page.url()).pathname)) await page.goto(origin + '/projects');
  const id = await createItem(page, name);
  await openItem(page, name);
  await expect(page).toHaveURL(new RegExp('/projects/' + id + '$'));
  await browserReady(page);
  return '/projects/' + id;
}

export type CreatedHierarchy = {
  projectPath: string;
  objectPath: string;
  surfacePath: string;
  project: string;
  object: string;
  surface: string;
};

/**
 * Root → project → object → surface, each made with New and opened. Ends on the surface page.
 * Replaces the old "New project" form, which made "Object 1 / Surface 1" by itself.
 */
export async function createHierarchyViaBrowser(
  page: Page,
  names: { project: string; object?: string; surface?: string },
  origin = '',
): Promise<CreatedHierarchy> {
  const objectName = names.object ?? 'Object 1';
  const surfaceName = names.surface ?? 'Surface 1';
  const projectPath = await createProjectViaBrowser(page, names.project, origin);
  const object = await createItem(page, objectName);
  await openItem(page, objectName);
  const objectPath = projectPath + '/objects/' + object;
  await expect(page).toHaveURL(new RegExp(objectPath + '$'));
  const surface = await createItem(page, surfaceName);
  await openItem(page, surfaceName);
  const surfacePath = projectPath + '/surfaces/' + surface;
  await expect(page).toHaveURL(new RegExp(surfacePath + '$'));
  return {
    projectPath,
    objectPath,
    surfacePath,
    project: projectPath.split('/').pop()!,
    object,
    surface,
  };
}

/** Follows the breadcrumb link to a level shown in the trail (stays in the app, no reload). */
export async function followTrail(page: Page, path: string) {
  await page.locator(`.app-breadcrumbs a[href="${path}"]`).click();
  await expect(page).toHaveURL(new RegExp(path + '$'));
}

/** Executes an item action from the bar or its responsive overflow menu. */
export async function runItemAction(page: Page, action: string) {
  const id =
    action === 'rename' || action === 'delete' ? 'browser.' + action : 'browser.action.' + action;
  const button = browserControl(page, id);
  if (await button.isVisible()) await button.click();
  else {
    await openToolbarOverflow(page);
    await browserControl(page, 'browser.menu.' + action).click();
  }
}

export async function openToolbarOverflow(page: Page) {
  const overflow = browserControl(page, 'browser.actions.overflow');
  if ((await overflow.getAttribute('aria-expanded')) !== 'true') await overflow.click();
}

/** Advanced project/account settings remain available in the overflow menu. */
export async function openProjectSettings(page: Page) {
  await openToolbarOverflow(page);
  await browserControl(page, 'browser.settings').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The gear at the root: account defaults links, offline originals and the hosted trash. */
export const openRootSettings = openProjectSettings;

/** Opens a project's estimate (or other review) through the project settings dialog. */
export async function openProjectReview(page: Page, review: 'estimates' | 'reports' | 'outputs') {
  const dialog = await openProjectSettings(page);
  await browserControl(dialog, 'project.review.' + review).click();
  await expect(page).toHaveURL(new RegExp('/' + review + '$'));
}

/** Opens the inspector when it is closed. */
export async function showInspector(page: Page) {
  const toggle = browserControl(page, 'browser.inspector');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(page.locator('.browser-inspector')).toBeVisible();
}

/** Selects an item and opens the inspector on it. */
export async function inspect(page: Page, name: string) {
  await browserItem(page, name).click();
  await showInspector(page);
  await expect(page.locator('.browser-inspector')).toContainText(name);
  return page.locator('.browser-inspector');
}

/**
 * Overrides one restoration default of the inspected item (units, areaUnit, currency,
 * reportLanguage) and waits until the override is saved.
 */
export async function overrideRestoration(page: Page, key: string, value: string) {
  await runItemAction(page, 'manage');
  const inspector = page.getByRole('dialog');
  const toggle = inspector.locator(`[data-control-id$=".restoration.${key}.override"]`);
  if (!(await toggle.isChecked())) await toggle.check();
  const field = inspector.locator(`[data-control-id$=".restoration.${key}"]`);
  await expect(field).toBeEnabled();
  await field.selectOption(value);
  await expect(field).toHaveValue(value);
  await expect(toggle).toBeChecked();
  await expect(page.locator('.project-workspace-status')).toHaveCount(0);
  await browserControl(inspector, 'browser.dialog.close').click();
}
