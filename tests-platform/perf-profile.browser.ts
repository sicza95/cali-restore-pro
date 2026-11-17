import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { drawingControl, selectedLayer } from './drawing-controls';
import { attachInput, controls, review, startFlow } from './projects-flow/flow';
import { createProjectHierarchy } from './projects-flow/hierarchy';
import { exportSize, fixture, syntheticJpeg } from './perf/fixtures';
import { installFrameRecorder, runPhase, settledHeapMB, startMetrics } from './perf/measure';

/**
 * Desktop Chromium performance profile (#50): imports a synthetic 8K image through the app, runs
 * a sustained zoom, pan and draw loop on the drawing canvas, then exports an 8000 x 4000 raw mask.
 * Writes perf-results/profile.json for scripts/perf-compare.mjs. Report-only: it asserts that the
 * flow worked, never a budget. Budgets and method: docs/plan/perf-budgets.md.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'Profiling uses CDP (Chromium only)');

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

test('8K import, sustained zoom, pan and draw, and export are profiled', async ({ page }, info) => {
  test.setTimeout(240_000);
  const flow = await startFlow(page);
  await createProjectHierarchy(flow, info);
  const cdp = await startMetrics(page);
  await installFrameRecorder(page);
  const png = await syntheticJpeg(page);
  // Measured after the fixture is built and collected, so the import phase starts from the app's own heap.
  const startHeapMB = await settledHeapMB(cdp);
  await attachInput(page).setInputFiles({
    name: 'synthetic-8k.jpg',
    mimeType: 'image/jpeg',
    buffer: png,
  });
  const importPhase = await runPhase(page, cdp, async () => {
    await controls(page, 'originals.attach').click();
    const prepare = review(page, 'review.prepare');
    await expect
      .poll(
        async () => {
          const alert = page.getByRole('alert');
          if (await alert.count()) return 'alert: ' + (await alert.first().innerText());
          return await prepare.getAttribute('aria-disabled');
        },
        { timeout: 120_000, intervals: [50] },
      )
      .toBe('false');
  });
  const afterImportMB = await settledHeapMB(cdp);

  const c = (key: string) => drawingControl(page, key);
  const marks = async () =>
    Number((await selectedLayer(page).textContent())?.match(/(\d+) · Mark/)?.[1]);
  await c('mode.drawing').click();
  await c('layer.add').click();
  await c('tool.select').click();
  await c('view.canvas').scrollIntoViewIfNeeded();
  // The page can scroll or reflow when a tool opens, so each phase measures the photo again.
  let box = (await page.locator('.drawing-photo img').boundingBox())!;
  const at = (x: number, y: number) => [box.x + x * box.width, box.y + y * box.height] as const;
  const measure = async () => {
    await c('view.canvas').scrollIntoViewIfNeeded();
    box = (await page.locator('.drawing-photo img').boundingBox())!;
  };
  await page.mouse.move(...at(0.5, 0.5));
  const wheel = async (deltaY: number, ctrl: boolean, deltaX = 0) => {
    if (ctrl) await page.keyboard.down('Control');
    await page.mouse.wheel(deltaX, deltaY);
    if (ctrl) await page.keyboard.up('Control');
  };

  // Zoom: Ctrl + wheel in and out around two points, from fit toward the 800% cap and back.
  const zoom = await runPhase(
    page,
    cdp,
    async () => {
      for (let round = 0; round < 3; round++) {
        await page.mouse.move(...at(round % 2 ? 0.3 : 0.7, 0.5));
        for (let i = 0; i < 20; i++) await wheel(-100, true);
        for (let i = 0; i < 20; i++) await wheel(100, true);
      }
    },
    true,
  );

  // Pan: zoomed in, wheel scrolling and hand-tool drags back and forth.
  await page.mouse.move(...at(0.5, 0.5));
  for (let i = 0; i < 12; i++) await wheel(-100, true);
  const zoomPercent = Number(await c('view.zoom').inputValue());
  expect(zoomPercent).toBeGreaterThan(200);
  const pan = await runPhase(
    page,
    cdp,
    async () => {
      for (let round = 0; round < 4; round++) {
        for (let i = 0; i < 20; i++) await wheel(30, false, 30);
        for (let i = 0; i < 20; i++) await wheel(-30, false, -30);
      }
      await c('tool.hand').click();
      await page.mouse.move(...at(0.5, 0.5));
      for (let round = 0; round < 6; round++) {
        await page.mouse.down();
        await page.mouse.move(...at(0.2, 0.3), { steps: 25 });
        await page.mouse.move(...at(0.5, 0.5), { steps: 25 });
        await page.mouse.up();
      }
    },
    true,
  );
  await c('view.fit').click();

  // Draw: brush strokes of 60 points at fit zoom; each stroke is committed to the mask.
  await c('tool.brush').click();
  await measure();
  const draw = await runPhase(
    page,
    cdp,
    async () => {
      for (let stroke = 0; stroke < 12; stroke++) {
        const y = 0.1 + stroke * 0.07;
        await page.mouse.move(...at(0.15, y));
        await page.mouse.down();
        for (let step = 1; step <= 60; step++)
          await page.mouse.move(...at(0.15 + step * 0.012, y + Math.sin(step / 4) * 0.03));
        await page.mouse.up();
        await expect.poll(marks).toBe(stroke + 1);
      }
    },
    true,
  );
  await expect.poll(marks).toBe(12);
  const afterDrawMB = await settledHeapMB(cdp);
  expect(flow.pageErrors).toEqual([]);

  // Export: a fresh page, an 8000 x 4000 raw mask with a 3000-vertex outline and a 900-vertex hole (the mask cap is 4096 edges).
  const exportPage = await page.context().newPage();
  await exportPage.route('**/perf-export', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Export profile</title>',
    }),
  );
  await exportPage.goto('/perf-export');
  const exportCdp = await startMetrics(exportPage);
  let exported = { bytes: 0, type: '', ms: [] as number[] };
  const exportPhase = await runPhase(exportPage, exportCdp, async () => {
    exported = await exportPage.evaluate(async ({ width, height }) => {
      const module = '/src/platform/reports/export.ts';
      const { exportReport } = (await import(
        module
      )) as typeof import('../src/platform/reports/export');
      const ring = (radius: number, wobble: number, length: number) =>
        Array.from({ length }, (_, i) => {
          const angle = (i / length) * Math.PI * 2;
          const r = radius * (1 + wobble * Math.sin(angle * 40));
          return [width / 2 + r * Math.cos(angle), height / 2 + r * Math.sin(angle)] as const;
        });
      const payload = {
        kind: 'raw-mask' as const,
        format: 'PNG' as const,
        width,
        height,
        mask: [ring(1800, 0.1, 3000), ring(600, 0.05, 900).reverse()],
      };
      const ms: number[] = [];
      let blob = new Blob();
      for (let run = 0; run < 3; run++) {
        const started = performance.now();
        blob = await exportReport(payload, new AbortController().signal);
        ms.push(performance.now() - started);
      }
      return { bytes: blob.size, type: blob.type, ms };
    }, exportSize);
  });
  expect(exported.type).toBe('image/png');
  const exportHeapMB = await settledHeapMB(exportCdp);

  const result = {
    schema: 1,
    recordedAt: new Date().toISOString(),
    environment: {
      chromium: page.context().browser()!.version(),
      platform: `${os.platform()} ${os.arch()}`,
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model ?? '',
      memoryGB: Math.round(os.totalmem() / 1024 ** 3),
      ci: Boolean(process.env.CI),
      server: 'vite dev (unbundled)',
      viewport: page.viewportSize(),
    },
    fixture: {
      ...fixture,
      jpegBytes: png.length,
      exportMask: exportSize,
      exportBytes: exported.bytes,
    },
    metrics: {
      heapStartMB: startHeapMB,
      heapAfterImportMB: afterImportMB,
      heapPeakMB: Math.max(
        importPhase.heapPeakMB,
        zoom.heapPeakMB,
        pan.heapPeakMB,
        draw.heapPeakMB,
      ),
      heapAfterDrawMB: afterDrawMB,
      zoomPercentReached: zoomPercent,
      importMs: importPhase.durationMs,
      zoomFrameP95Ms: zoom.frames!.p95Ms,
      panFrameP95Ms: pan.frames!.p95Ms,
      drawFrameP95Ms: draw.frames!.p95Ms,
      zoomFrameMaxMs: zoom.frames!.maxMs,
      panFrameMaxMs: pan.frames!.maxMs,
      drawFrameMaxMs: draw.frames!.maxMs,
      slowFrames: zoom.frames!.slowFrames + pan.frames!.slowFrames + draw.frames!.slowFrames,
      longTaskMs: Math.round(
        zoom.frames!.longTaskMs + pan.frames!.longTaskMs + draw.frames!.longTaskMs,
      ),
      exportFirstMs: Math.round(exported.ms[0]!),
      exportMedianMs: Math.round(median(exported.ms)),
      exportHeapPeakMB: exportPhase.heapPeakMB,
      exportHeapAfterMB: exportHeapMB,
    },
    phases: { import: importPhase, zoom, pan, draw, export: exportPhase },
  };
  await mkdir('perf-results', { recursive: true });
  await writeFile('perf-results/profile.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.metrics, null, 2));
});
