import type { Page } from '@playwright/test';
import { menuControl } from '../src/ui/account-access/navigation-controls';

/** Below 1100 px the account navigation sits behind the Menu disclosure. */
export async function showAppNavigation(page: Page) {
  const toggle = page.locator(`[data-control-id="${menuControl.id}"]`);
  if (!(await toggle.isVisible())) return;
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}
