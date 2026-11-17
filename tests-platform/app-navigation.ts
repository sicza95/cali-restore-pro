import { expect, type Page } from '@playwright/test';
import { menuControl } from '../src/ui/account-access/navigation-controls';
import { compactQuery } from '../src/ui/app-shell/useCompactLayout';

/**
 * Below 1100 px the account navigation sits in the drawer behind the Menu button. The shell picks
 * its layout from a media-query listener, which runs at the next rendering step after a resize, so
 * first wait until its mode matches the viewport (#136).
 */
export async function showAppNavigation(page: Page) {
  const shell = page.locator('.account-shell');
  const compact = await page.evaluate((query) => window.matchMedia(query).matches, compactQuery);
  if (compact) await expect(shell).not.toHaveAttribute('data-nav', /^(sidebar|rail)$/);
  else await expect(shell).not.toHaveAttribute('data-nav', 'compact');
  if ((await shell.getAttribute('data-nav')) !== 'compact') return;
  const toggle = page.locator(`[data-control-id="${menuControl.id}"]`);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.locator('#app-drawer')).toBeVisible();
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
