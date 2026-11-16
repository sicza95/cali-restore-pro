import { test, expect, type Locator, type Page } from '@playwright/test';
import { setupRememberedVault } from './vault-setup';
import { expectTaskLanguage } from './copy-guard';

const objectName = 'North elevation sandstone balustrade';
const surfaceName = 'Lower cornice and frieze, west bay';
const phaseName = 'Consolidation and cleaning of the weathered stone';

/**
 * Lists the fields in `scope` whose shown value is wider than the room inside the field: the
 * selected option of a select, or an input's value. The text is measured with the field's own
 * font, against its content box (a select's end padding holds the chevron).
 */
async function clippedFields(scope: Locator) {
  return scope.evaluate((root) => {
    const context = document.createElement('canvas').getContext('2d')!;
    const fields = root.querySelectorAll<HTMLSelectElement | HTMLInputElement>('select, input');
    return [...fields].flatMap((field) => {
      if (!field.getClientRects().length) return [];
      const text =
        field instanceof HTMLSelectElement ? (field.selectedOptions[0]?.text ?? '') : field.value;
      const style = getComputedStyle(field);
      context.font = style.font;
      const room =
        field.clientWidth -
        parseFloat(style.paddingInlineStart) -
        parseFloat(style.paddingInlineEnd);
      const width = context.measureText(text).width;
      return width > room + 0.5
        ? [`${field.dataset.controlId}: "${text}" needs ${Math.ceil(width)} px, has ${room} px`]
        : [];
    });
  });
}

/** Summary amounts that wrap inside the number or spill out of their cell. */
async function brokenAmounts(page: Page) {
  return page.locator('.estimate-totals').evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>('dd')].flatMap((amount) => {
      const range = document.createRange();
      range.selectNodeContents(amount);
      const lines = new Set([...range.getClientRects()].map(({ top }) => Math.round(top))).size;
      return lines > 1 || amount.scrollWidth > amount.clientWidth
        ? [`${amount.dataset.estimateResult}: "${amount.textContent}" on ${lines} lines`]
        : [];
    }),
  );
}

/** Whole values, 44 px targets, no sideways page scroll and task language on one estimate step. */
async function expectWholeRows(page: Page, key: string, screen: string, path: string) {
  await page.locator(`[data-control-id="estimate.step.${key}"]`).click();
  const step = page.locator(`#estimate-step-${key}`);
  await expect(step).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', page.viewportSize()!.width);
  expect.soft(await clippedFields(step), `clipped fields on ${screen}`).toEqual([]);
  expect.soft(await brokenAmounts(page), `broken amounts on ${screen}`).toEqual([]);
  for (const control of await step.locator('select, input, button, a').all()) {
    if (!(await control.isVisible())) continue;
    const box = (await control.boundingBox())!;
    expect
      .soft(box.height, `touch target ${await control.getAttribute('data-control-id')}`)
      .toBeGreaterThanOrEqual(44);
  }
  await expectTaskLanguage(page, screen);
  await step.screenshot({ path });
}

test('estimate rows show whole values at tablet sizes in EN and HU', async ({ page }, info) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'restorer@example.test',
          state: 'active',
          role: 'member',
        },
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/projects');
  await setupRememberedVault(page);
  await page.getByLabel('Project name').fill('Long row fixture');
  await page.getByRole('button', { name: 'New project' }).click();
  for (const [control, name, select] of [
    ['project.object.rename', objectName, 'project.object.select'],
    ['project.surface.rename', surfaceName, 'project.surface.select'],
  ]) {
    const form = page.locator(`form:has([data-control-id="${control}"])`);
    await form.locator('input').fill(name);
    await form.locator(`[data-control-id="${control}"]`).click();
    await expect(page.locator(`[data-control-id="${select}"]`)).toContainText(name);
  }
  await page.locator('[data-control-id="project.review.estimates"]').click();
  const phase = (id: string) => page.locator(`[data-control-id="estimate.phase.${id}"]`);
  const finance = (id: string) => page.locator(`[data-control-id="estimate.finance.${id}"]`);
  await page.locator('[data-control-id="estimate.step.phases"]').click();
  await phase('newName').fill(phaseName);
  await phase('add').click();
  await phase('scopeSurface').selectOption({ label: objectName + ' / ' + surfaceName });
  await phase('time').fill('123456.75');
  await phase('rate').fill('987654.5');
  await phase('material').fill('12345678.25');
  await page.locator('[data-control-id="estimate.step.extras"]').click();
  await finance('newExtra').click();
  await finance('extraName').fill('Scaffolding for the full height of the elevation');
  await finance('extraScope').selectOption({ label: objectName });
  await finance('extraMethod').selectOption('hourly');
  await finance('extraRate').fill('987654.5');
  await finance('extraHours').fill('123456.75');
  for (const language of ['en', 'hu'] as const) {
    if (language === 'hu') await page.getByLabel('App language').selectOption('hu');
    for (const viewport of [
      { width: 1194, height: 834 },
      { width: 834, height: 1194 },
    ]) {
      await page.setViewportSize(viewport);
      for (const key of ['phases', 'extras']) {
        const screen = `estimate ${key} ${language} ${viewport.width}`;
        await expectWholeRows(
          page,
          key,
          screen,
          info.outputPath(`estimate-${key}-${language}-${viewport.width}.png`),
        );
        if (key === 'phases')
          await page.screenshot({
            path: info.outputPath(`estimate-page-${language}-${viewport.width}.png`),
            fullPage: true,
          });
      }
    }
  }
  // The link under the phase area names the whole surface, however long, and wraps.
  const open = { en: 'Open surface: ', hu: 'Felület megnyitása: ' };
  await page.locator('[data-control-id="estimate.step.phases"]').click();
  await expect(phase('scopeLink')).toHaveText(open.hu + objectName + ' / ' + surfaceName);
  await page.getByLabel('Az alkalmazás nyelve').selectOption('en');
  await expect(phase('scopeLink')).toHaveText(open.en + objectName + ' / ' + surfaceName);
});
