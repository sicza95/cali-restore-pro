import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export async function verifyRawMaskExport(page: Page) {
  await page.route('**/raw-mask-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Mask export</title>' }),
  );
  await page.goto('/raw-mask-test');
  const result = await page.evaluate(async () => {
    const load = (path: string): Promise<unknown> => import(path);
    const { exportReport } = (await load(
      '/src/platform/reports/export.ts',
    )) as typeof import('../src/platform/reports/export');
    const { rawMaskExport } = (await load(
      '/src/platform/reports/raw-mask.ts',
    )) as typeof import('../src/platform/reports/raw-mask');
    const { measuredAssessments } = (await load(
      '/tests-platform/fixtures/measured-assessment.ts',
    )) as typeof import('./fixtures/measured-assessment');
    const { rect } = (await load(
      '/src/platform/projects/planar-transform.ts',
    )) as typeof import('../src/platform/projects/planar-transform');
    const { current, checkpoint } = measuredAssessments('private-photo');
    // Deliberately different crop, master and appearance: raw output ignores them all.
    current.frame.input.crop = [100, 20, 50, 50];
    current.frame.input.rotation = 90;
    current.frame.input.flip = true;
    current.master = [rect([120, 20, 20, 20])];
    current.layers[0]!.mask = [rect([10, 10, 80, 60]), [...rect([20, 20, 10, 10])].reverse()];
    current.drawing![1]!.visible = false;
    current.drawing![1]!.opacity = 0;
    const payload = rawMaskExport(current, current.layers[0]!.id);
    const signal = new AbortController().signal;
    async function pixels(value: typeof payload) {
      const blob = await exportReport(value, signal);
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        return {
          type: blob.type,
          width: bitmap.width,
          height: bitmap.height,
          data: Array.from(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data),
        };
      } finally {
        bitmap.close();
      }
    }
    const cancel = new AbortController();
    const pending = exportReport(payload, cancel.signal);
    cancel.abort();
    const cancelled = await pending.then(
      () => false,
      (error: DOMException) => error.name === 'AbortError',
    );
    return {
      image: await pixels(payload),
      empty: await pixels({ ...payload, mask: [] }),
      checkpoint: await pixels(
        rawMaskExport(checkpoint.assessment, checkpoint.assessment.layers[0]!.id),
      ),
      cancelled,
    };
  });
  expect(result.cancelled).toBe(true);
  expect(result.image.type).toBe('image/png');
  expect([result.image.width, result.image.height]).toEqual([200, 100]);
  expect([result.checkpoint.width, result.checkpoint.height]).toEqual([200, 100]);
  // Compare every pixel: no background, grid, labels, other layer or transformed crop.
  const actual: number[] = [];
  const expected: number[] = [];
  const saved: number[] = [];
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 200; x++) {
      const inside = x >= 10 && x < 90 && y >= 10 && y < 70;
      const hole = x >= 20 && x < 30 && y >= 20 && y < 30;
      actual.push(result.image.data[(y * 200 + x) * 4 + 3]!);
      expected.push(inside && !hole ? 255 : 0);
      saved.push(x < 50 ? 255 : 0);
    }
  }
  expect(actual).toEqual(expected);
  expect(result.image.data.filter((_, i) => i % 4 !== 3).every((v) => v === 0)).toBe(true);
  expect(result.empty.data.every((v) => v === 0)).toBe(true);
  expect(result.checkpoint.data.filter((_, i) => i % 4 === 3)).toEqual(saved);
}
