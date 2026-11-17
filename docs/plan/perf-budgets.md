# Desktop performance budgets (provisional)

Issue #50, IMG-05. The owner decided on 2026-11-17 that the first budgets are for desktop Chromium, use a synthetic 8K fixture and are checked by a report-only CI job against a recorded baseline. They are **provisional**: they stop a gross regression from going unnoticed, they do not qualify the iPad. Numbers from a physical iPad (Safari and Home Screen, Apple Pencil, sustained 8K editing) replace them under #49, and until then IMG-05 stays Partial.

## What is measured

One Playwright spec, `tests-platform/perf-profile.browser.ts` (`npm run test:perf`, config `playwright.perf.config.ts`, Chromium only), runs this flow against the Vite dev server at 1194 × 834 and writes `perf-results/profile.json`:

1. Set up a vault, create a project, object and surface (the same helper as the projects flow).
2. Build a synthetic 8192 × 4096 JPEG in the page (gradient, brick courses, cracks, tiled noise; about 13.8 MB, no real photo) and attach it through the original-file input. **Import** is the time from the Attach click until Prepare is enabled, so it covers encryption, the decode worker, the proxy and the tile pyramid.
3. Open the drawing canvas and add a layer.
4. **Zoom**: 120 Ctrl + wheel steps in and out around two points (fit to the 800 % cap and back).
5. **Pan**: at 800 %, 160 wheel steps in both axes and six hand-tool drags.
6. **Draw**: 12 brush strokes of 60 points each at fit zoom, waiting for each mark to commit.
7. **Export**: on a second page, an 8000 × 4000 raw mask (3000-vertex outline, 900-vertex hole), three times in a row through `exportReport` and its worker.

Metrics:

- **JS heap**: CDP `Performance.getMetrics` (`JSHeapUsedSize`), sampled every 100 ms during each phase for the peak, and after `HeapProfiler.collectGarbage` for the retained value.
- **Frame time**: a `requestAnimationFrame` loop in the page records the gap between frames during zoom, pan and draw; the report keeps p95, max, frames over 33.4 ms (two refreshes at 60 Hz) and long-task time (`PerformanceObserver`, `longtask`).
- **Durations**: wall clock around the import and each export. The first export includes loading the worker; the budgeted value is the median of three.
- CDP script, layout and style time per phase are in the JSON for diagnosis; they are not budgeted.

## Budgets

Recorded on a Windows 11 laptop (12th Gen Intel Core i7-12800H, 32 GB, Chrome 157, Playwright 1.62.1) on 2026-11-17, three runs. Budgets sit well above what was measured because the CI runner is slower and noisier and nothing here has been compared with a device yet.

| Metric                      | Measured (3 runs) | Provisional budget | Why this figure                                                          |
| --------------------------- | ----------------- | ------------------ | ------------------------------------------------------------------------ |
| Peak JS heap, whole flow    | 244.7 to 244.9 MB | 400 MB             | The peak is the import; it is reached on the main thread (see below).    |
| JS heap after drawing       | 10.4 MB           | 50 MB              | Retained heap after GC, so it shows leaks, not transient buffers.        |
| Import, 8K JPEG             | 1.21 to 1.27 s    | 5 s                | Interactive wait; the worker has its own 120 s ceiling.                  |
| Frame p95, zoom/pan/draw    | 16.8 to 16.9 ms   | 33.4 ms            | At most two refresh intervals at 60 Hz for the 95th percentile frame.    |
| Frame max, zoom/pan/draw    | 17.0 to 17.4 ms   | 250 ms             | Zoom and pan; draw reached 33.5 to 66.8 ms (earlier runs up to 183 ms).  |
| Frames over 33.4 ms         | 1 to 4            | 20                 | Summed over the three loops (about 1700 frames).                         |
| Long-task time              | 165 to 276 ms     | 1000 ms            | Summed over the three loops.                                             |
| Export 8000 × 4000 (median) | 268 to 299 ms     | 2 s                | Earlier runs reached 0.4 to 0.85 s, so variance is high; budget is wide. |
| Peak JS heap, export page   | 1.4 to 1.5 MB     | 20 MB              | Main thread only; the encoder runs in a worker.                          |

Machine-readable form: `perf/budgets.json`. Variance over the three runs was small except the draw maximum and the export time, which are the metrics most likely to warn on a noisy runner.

## Baseline and comparison

`perf/baseline.json` holds the median of three runs, with the min and max of each metric and the hardware. `npm run perf:compare` (`scripts/perf-compare.mjs`) reads `perf-results/profile.json` and prints one row per metric with the baseline, the delta and the budget. It prints a `WARNING` line for a value over its budget, and, when the baseline was recorded on the same CPU model, for a regression over the metric's percentage and absolute floor. Against a baseline from other hardware (CI against the laptop) it skips the regression check and says so, because only a same-machine comparison is meaningful. It always exits 0 once it has compared; only a missing or unreadable input exits 1. Under GitHub Actions it also writes `::warning::` annotations and the step summary.

Record a new baseline after an intended change, or for a new machine (for example the CI runner once its first numbers exist):

```sh
npm run test:perf      # three times, copying perf-results/profile.json each time
node scripts/perf-compare.mjs --record <label> run1.json run2.json run3.json
```

## CI

The `Desktop perf profile (report only)` job in `.github/workflows/ci.yml` follows the informational browser job of #51: `continue-on-error: true`, its own 10 minute limit, parallel to the other jobs, so a red or warning result never blocks a merge. It installs Chromium only, runs the spec (about 40 s locally plus the install), prints the comparison, and uploads `profile.json` for 14 days. It can become a gate only after iPad numbers exist and the budgets are reset from them.

## Limits of these numbers

- Desktop Chromium on a development server (unbundled, unminified). The numbers say nothing about iPad Safari, touch, Apple Pencil, thermal throttling or Home Screen memory limits (#49).
- JS heap is the main thread only. The image and export workers' heaps, decoded bitmaps and GPU memory are not visible through `Performance.getMetrics`, so "peak memory" for IMG-05 stays open.
- Headless Chromium paces `requestAnimationFrame` at 60 Hz regardless of load, so frame time shows main-thread stalls, not GPU cost. The input is synthetic mouse and wheel events, not touch.
- The fixture is a synthetic JPEG. RAW, HEIC and large PNG sources, and PDF/XLSX report export at 8K, are not profiled. The export is the raw mask PNG, the only export that scales with source dimensions.

## Findings while building the profile

- **PNG sources over about 17 MB are rejected as damaged.** `pngFrame` in `src/platform/images/raster.ts` scans at most 4096 chunks. Chrome writes about 4 KB IDAT chunks, so a 17 MB 8K PNG fails with "This image is damaged or incomplete", although the encoded-size cap is 64 MiB. A lossless 8K PNG photo is likely to hit this. The profile uses JPEG for that reason.
- **A raw mask cannot be exported at 8K.** `assertRawMask` caps the area at 32 Mpx, and 8192 × 4096 (33.5 Mpx) and 7680 × 4320 (33.2 Mpx) are over it. The profile exports 8000 × 4000, the largest 2:1 size under the cap.
- **The main-thread JS heap peaks at about 245 MB during the import of a 13.8 MB JPEG** and returns to about 7 MB. It is the dominant peak of the flow and the first number to check on a device.
