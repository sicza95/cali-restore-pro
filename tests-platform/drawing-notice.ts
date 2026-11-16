import { expect, type Page } from '@playwright/test';
import { drawingCopy } from '../src/ui/editor/drawing-review/copy';

type Notice = 'changed' | 'committed' | 'discarded';
const language = (page: Page) => page.locator('[data-control-id="app.nav.language"]');

/**
 * With a drawing notice shown, switching the app language must switch the notice too (#83): it
 * kept the language it was first shown in. Checks EN, then HU, then EN again; leaves English.
 */
export async function expectNoticeFollowsLanguage(page: Page, notice: Notice) {
  const status = page.locator('.drawing-workspace .drawing-workspace-feedback');
  for (const lang of ['en', 'hu', 'en'] as const) {
    await language(page).selectOption(lang);
    const copy = drawingCopy(lang);
    await expect(status, `drawing notice ${lang}`).toHaveText(`${copy[notice]} · ${copy.damage}`);
  }
}
