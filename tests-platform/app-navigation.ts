import { expect, type Page } from '@playwright/test';
import { menuControl } from '../src/ui/account-access/navigation-controls';

/**
 * Signed in, the menu sidebar is pinned by default; a test that hid it pins it again, so its links
 * are on screen.
 */
export async function showAppNavigation(page: Page) {
  const toggle = page.locator(`[data-control-id="${menuControl.id}"]`);
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(page.locator('#app-navigation')).toBeVisible();
}

/** Opens the account menu (the round photo at the right of the top bar). */
export async function openAccountMenu(page: Page) {
  const button = page.locator('[data-control-id="app.nav.account-menu"]');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await expect(page.locator('#account-menu')).toBeVisible();
}

/** Signs out from the account menu. */
export async function signOutFromMenu(page: Page) {
  await openAccountMenu(page);
  await page.locator('[data-control-id="app.nav.sign-out"]').click();
}

/**
 * Switches the app language: the select on signed-out pages, the account menu when signed in.
 * The menu is closed again afterwards.
 */
export async function chooseLanguage(page: Page, lang: string) {
  const select = page.locator('[data-control-id="app.nav.language"]');
  if (await select.isVisible()) return select.selectOption(lang);
  await openAccountMenu(page);
  // Playwright's scroll-into-view moves the page for items in the sticky top bar, which would
  // shift a canvas a test has measured; a person's click does not scroll, so dispatch the clicks.
  const choice = page.locator(`[data-control-id="app.menu.language.${lang}"]`);
  if (!(await choice.isVisible()))
    await page.locator('[data-control-id="app.menu.language"]').dispatchEvent('click');
  await choice.dispatchEvent('click');
  await page.keyboard.press('Escape');
  await expect(page.locator('#account-menu')).toHaveCount(0);
}

/**
 * The page has one `h1`, the last step of `trail` (steps joined by " › "), and the breadcrumbs
 * show every step. The step at index `plain` is text without a link, like a surface's object (#39).
 */
export async function expectPageTrail(page: Page, trail: string, plain?: number) {
  const steps = trail.split(' › ');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText([steps.at(-1)!]);
  const items = page.locator('.app-breadcrumbs li');
  await expect(items).toHaveText(steps);
  if (plain !== undefined) await expect(items.nth(plain).locator('a')).toHaveCount(0);
}

export const openProfile = async (page: Page) => {
  await openAccountMenu(page);
  await page.locator('[data-control-id="app.menu.profile"]').click();
};
/** Opens a row of the Settings page (a `<details id>`) and returns it. */
export const openSetting = async (page: Page, id: string) => {
  const row = page.locator(`details#${id}`);
  if (!(await row.evaluate((el) => (el as HTMLDetailsElement).open)))
    await row.locator(':scope > summary').click();
  return row;
};
export const confirmDialog = (page: Page) => page.getByRole('dialog', { name: 'Confirm it’s you' });
/** Every password change is refused for want of a recent confirmation. */
export const refuseChanges = (page: Page, counted: () => void = () => {}) =>
  page.route('**/api/v1/auth/change-password', (route) => {
    counted();
    return route.fulfill({ status: 403, json: { error: 'credential_confirmation_required' } });
  });
/** Starts a password change, which asks "Confirm it's you", and confirms with a password. */
export const confirmChange = async (page: Page) => {
  const option = await openSetting(page, 'password');
  await option.getByLabel('New password', { exact: true }).fill('a new synthetic password value');
  await option.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(confirmDialog(page)).toBeVisible();
  await confirmDialog(page).getByLabel('Current password').fill('synthetic password');
  await confirmDialog(page).getByRole('button', { name: 'Confirm', exact: true }).click();
};

/** The sign-in address shown in the Profile section of Settings. */
export const profileEmail = (page: Page, email: string) =>
  page.locator('.settings-static').getByText(email, { exact: true });
