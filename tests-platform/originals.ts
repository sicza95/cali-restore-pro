import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { drawingControl } from './drawing-review';
import { createItem, openItem } from './project-browser';

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

/**
 * From a surface page of "North wall" to `surface`'s originals outside drawing: up to the object's
 * surfaces in the project browser, then the surface page opened again in photo mode, so its
 * drafts and journals are read afresh. The project page that listed originals is gone (ADR 0011);
 * originals and their guards live on the surface page.
 */
export async function originalsPage(page: Page, surface: string) {
  await control(page, 'surface.object').click();
  await openItem(page, surface);
  await drawingControl(page, 'mode.photo').click();
  await expect(page.locator('.project-originals')).toBeVisible();
}

/** From a surface page to a new surface of "North wall", opened in photo mode. */
export async function newSurface(page: Page, name: string) {
  await control(page, 'surface.object').click();
  await createItem(page, name);
  await openItem(page, name);
  await expect(drawingControl(page, 'mode.photo')).toBeVisible();
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
