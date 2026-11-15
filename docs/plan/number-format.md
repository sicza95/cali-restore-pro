# Number and unit formatting — Phase 2, step 2

15 November 2026 · Status: planned · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md), Phase 2 item 2, UX finding 2 · Targets: iPad and desktop

Goal: every number on screen is rounded for its unit and written the way the reader's language writes numbers. No raw floats such as `0.00113388 ft²`, no `1.5` in Hungarian where `1,5` belongs, no money as a bare `1234.5`. Calculations, saved data and machine-readable exports (CSV, XLSX) do not change.

## Where things stand

Found on `main` at `28fb559`. Each screen formats its own numbers, five different ways:

| Kind                            | Examples on screen today                                                                                                 | Where                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Six significant digits          | `0.00113388 ft²` and `12.3457%` in surface measurements and checkpoints                                                  | `SurfaceMeasurements.tsx`, `SurfaceCheckpoints.tsx` (`maximumSignificantDigits: 6`)                    |
| Decimal strings, trailing zeros | Measured phase area `0.000123456789012345 m²`, labour hours, calculated productivity (`quantityText` only strips zeros)  | `PhaseInputs.tsx`, `EstimateReview.tsx`, `ReportEstimatePreview.tsx`                                   |
| Money as bare decimals          | Results `430`, `20.00`; the version total; report subtotals. Always a point, no grouping, no currency sign.              | `EstimateReview.tsx`, `ReportEstimatePreview.tsx`                                                      |
| User input echoed back          | Saved version list: `12.5 HUF/cm² · Productivity 2.5 · ×1,5`, `Contingency · -5%`, `Tax · 20%` (whatever the user typed) | `EstimateReview.tsx`                                                                                   |
| Fixed decimals, English only    | `toFixed(2) m²` and `toFixed(1)%` in the editor; `13,565 B` (browser locale, not app language) for original files        | `Area.tsx`, `LayerPanel.tsx`, `LayerMeasurements.tsx`, `CalibrationDialog.tsx`, `ProjectOriginals.tsx` |
| Report preview and visual files | 15 significant digits on screen, up to 18 fraction digits in PDF and SVG output                                          | `ReportPreview.tsx`, `export-visual.ts`                                                                |

Already fine: integer counts with `toLocaleString(language)` in account and admin screens; the zoom percentage (an integer).

Not in scope: CSV and XLSX values (exact machine numbers on purpose); editable inputs (the user's own text, parsed as typed); dates, including the ISO timestamp in the report preview (a separate follow-up).

## Approach

One module, `src/platform/format/number.ts`, used by every screen above. It wraps `Intl.NumberFormat` (cached per language and precision) and knows each unit's precision:

| Unit               | Fraction digits | Example EN    | Example HU      |
| ------------------ | --------------- | ------------- | --------------- |
| m², ft²; m, ft     | up to 2         | `1,234.57 m²` | `1234,57 m²`    |
| cm², in²; cm, in   | up to 1         | `12.5 cm²`    | `12,5 cm²`      |
| %                  | up to 1         | `37.5%`       | `37,5%`         |
| hours              | up to 2         | `2.25`        | `2,25`          |
| money              | the currency's  | `HUF 1,234`   | `1234 Ft`       |
| rates (money/unit) | currency's to 4 | `€12.345/m²`  | `12,345 EUR/m²` |

Small values keep two significant digits instead of rounding to zero, up to four fraction digits: `0.00113388 ft²` becomes `0.0011 ft²` (HU `0,0011 ft²`); anything smaller reads `< 0.0001 ft²`. A real zero stays `0`. Hungarian follows CLDR: decimal comma, a space between thousands from five digits on (`12 345`, but `1234`).

Rejected alternative: per-screen `Intl.NumberFormat` calls with agreed options. That is what exists now, and it drifted five ways.

## Commits

Each commit keeps `npm run check`, `npm test` and `npm run test:files` green.

1. **`docs(plan): number and unit formatting`** — this plan.
2. **`feat(format): shared number and unit formatter`** — the module and a Node-only test (`tests/number-format.spec.ts`, run by `npm test`) covering EN and HU decimals, grouping, small and large values, zero, negatives, missing values, money and rates.
3. **`fix(ui): format measured areas and percentages`** — surface measurements, checkpoints (including signed deltas), the measured phase area, the editor's `Area`, coverage and calibration area, file sizes. The editor gets the language through `EditorCopy`.
4. **`fix(estimates): format money, hours and rates`** — estimate results, the saved version list, the report's estimate section; test lookups that read `430` or `20.00` updated.
5. **`fix(reports): format the report preview and visual exports`** — `ReportPreview.tsx` and `export-visual.ts` use the unit-aware formatter; CSV and XLSX unchanged.
6. **`test(copy): no raw floats on screen`** — `copy-guard.ts` also fails on a number with five or more fraction digits; a negative run with the old formatter must fail.

## Verification

`npm run check`, `npm test`, `npm run test:files`, `npm run test:estimates` (estimate output changes). Before and after screenshots of the estimate page (EN and HU), checkpoints, measurements and the report preview.
