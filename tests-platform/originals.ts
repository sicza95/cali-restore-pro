import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Shared by the draft source (#72) and reference change (#75) checks of the projects flow. */
export const reason = 'Resolve the drawing drafts before changing this original.';
export const hiddenReason =
  'This original has drawing drafts. To resolve them, make it the first original with the Mapping role.';
export const control = (page: Page, id: string) => page.locator(`[data-control-id="${id}"]`);
export const original = (page: Page, name: string) => {
  const row = page.locator('.project-originals li').filter({ hasText: name });
  return {
    remove: row.locator('[data-control-id="originals.remove"]'),
    role: row.locator('[data-control-id="originals.change-role"]'),
  };
};

/** From a surface page to the project page, with "North wall" and `surface` selected again. */
export async function projectPage(page: Page, surface: string) {
  await control(page, 'surface.project').click();
  await page
    .getByRole('combobox', { name: 'Object', exact: true })
    .selectOption({ label: 'North wall' });
  await page
    .getByRole('combobox', { name: 'Surface', exact: true })
    .selectOption({ label: surface });
}

export async function attach(page: Page, name: string, buffer: Buffer) {
  await page.getByLabel('Original file', { exact: true }).setInputFiles({
    name,
    mimeType: 'image/png',
    buffer,
  });
  await control(page, 'originals.attach').click();
  await expect(page.locator('.project-originals').getByText(name)).toBeVisible();
}

/** A 640 × 480 plaster-like PNG. */
export async function plasterPng(page: Page) {
  return Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#9c9481';
      context.fillRect(0, 0, 640, 480);
      context.fillStyle = '#4f483c';
      for (let i = 0; i < 10; i++) context.fillRect(30 + i * 60, 40 + (i % 4) * 100, 30, 80);
      return canvas.toDataURL('image/png').split(',')[1]!;
    }),
    'base64',
  );
}
