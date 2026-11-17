import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectTaskLanguage } from './copy-guard';

export async function verifyRawMaskDownload(page: Page, info: TestInfo, checkpoint: string) {
  const control = (key: string) => page.locator('[data-control-id="report.raw.' + key + '"]');
  await control('layer').selectOption({ label: 'Cleaning scope' });
  for (const [version, extent] of [
    ['current', 150],
    [checkpoint, 100],
  ] as const) {
    await control('version').selectOption(version);
    await control('layer').selectOption({ label: 'Cleaning scope' });
    const event = page.waitForEvent('download');
    await control('download').click();
    const download = await event;
    expect(download.suggestedFilename()).toBe('calirestore-raw-mask.png');
    const bytes = await readFile((await download.path())!);
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([200, 100]);
    const alpha = await page.evaluate(
      async ({ bytes, extent }) => {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
        );
        try {
          const canvas = new OffscreenCanvas(image.width, image.height);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(image, 0, 0);
          const sample = (x: number) => Array.from(ctx.getImageData(x, 50, 1, 1).data);
          return [sample(extent - 1), sample(extent)];
        } finally {
          image.close();
        }
      },
      { bytes: Array.from(bytes), extent },
    );
    expect(alpha).toEqual([
      [0, 0, 0, 255],
      [0, 0, 0, 0],
    ]);
  }
  const panel = page.getByRole('region', { name: 'Raw mask', exact: true });
  await expect(control('version').locator('option:checked')).toHaveText('Initial on-site survey');
  for (const width of [1194, 834]) {
    await page.setViewportSize({ width, height: width === 1194 ? 834 : 1194 });
    await control('download').scrollIntoViewIfNeeded();
    await expect(panel).toHaveJSProperty(
      'scrollWidth',
      await panel.evaluate((node) => node.clientWidth),
    );
    await expectTaskLanguage(page, 'raw mask EN ' + width);
    await panel.screenshot({ path: info.outputPath('raw-mask-en-' + width + '.png') });
  }
  await page.getByLabel('App language').selectOption('hu');
  await page.emulateMedia({ colorScheme: 'dark' });
  const hu = page.getByRole('region', { name: 'Nyers maszk', exact: true });
  await expect(control('download')).toHaveText('Nyers maszk letöltése PNG-ként');
  await expectTaskLanguage(page, 'raw mask HU');
  await hu.screenshot({ path: info.outputPath('raw-mask-hu-834.png') });
}
