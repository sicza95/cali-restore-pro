# M-11 · Client-side export verification and M-12 handoff

## Baseline and workflow

Started from `28b8896ea91f5b7c967dff155bccf40d2a6e2337`. GnuPG verified fingerprint `1FDDA447D1F9C8EF889B7D248F44ED13ED6879B0`, and GitHub reported the same SHA as Verified on `main`.

Implementation commit `3ad3116` was signed and locally verified with the same fingerprint.

The owner can download the detached report preview from Reports or Outputs. An isolated browser worker encodes the selected content. Closing the preview, cancelling, navigating away or locking the vault aborts the job. Publication rechecks the active project revision and unlocked vault. The download uses a generic filename and leaves encrypted source records untouched. Final report issuance remains unavailable until selected measurements can be qualified.

- PDF uses printable A4 pages rendered at the selected resolution. Its raster pages preserve localized glyphs and maps, and have no selectable text layer. PNG uses the selected resolution in both pixel dimensions and physical density. SVG uses text and composited fixture vectors, with optional branding logos decoded and re-encoded as inline PNG pixels.
- CSV and snapshot XLSX carry structured numeric values, units, missing values and draft provenance. Map and reference entries in these formats are textual. CSV quotes multiline fields and neutralizes formula-like user values. Snapshot XLSX uses literal text cells and numeric cells.
- Editable XLSX adds visible estimate, phase, extra and adjustment sheets. A separate allowlist captures the issued selection, active effort and rate inputs, included extras, adjustments and effective tax. Formula caches come from the issued calculation. Editing uses native spreadsheet arithmetic and rounding within spreadsheet numeric precision. The report sheet preserves the issued totals as a snapshot. An estimate is omitted if any of its issued surfaces is outside the report. Summary-only workbooks carry no editable sheets or private phase/input data. Recipient project exports remain behind the existing route boundary.
- The encoder caps selection sizes, logo pixel count, raster canvas area and file sizes. PDF additionally caps pages and uses a single page canvas at a time. Oversize errors leave the preview open for another attempt.

## Verification

- `npm run check`, `npm run test:estimates` (8), `npm run test:files` (11 with production-build downloads), `npm run test:sync` (2), `npm run build-storybook` and the built Storybook browser suite (11). The existing Storybook chunk-size advisory remains. Corrected the baseline arithmetic test to pass the project binding required by the M-10 full-scope parser.
- Browser payload checks cover EN/HU independent of the app, selected checkpoint geometry, primary/comparison areas in ft², missing current measurement, selected reference ordinal, PNG density and metadata, SVG element and sanitized logo scope, PDF xref and metadata, CSV quoting, numeric XLSX cells, editable formulas and cached totals. Cancellation, oversized PNG rejection and refusal of summary-to-editable escalation are exercised. The production-build owner journey downloads both workbook modes and reconciles to the issued HUF 630 total after the visible draft rate changes.
- Poppler opened and rendered the A4 PDF. Reviewed both pages and the PNG for accented labels, selected fixture maps and the EUR 378 total. An independent XLSX reader opened both workbooks, verified ZIP CRCs, formula presence and numeric caches, including 5 hours, the EUR −15 adjustment and the EUR 378 total. The CSV parsed with four columns per record. Reviewed the authenticated download dialog at both iPad orientations and the phone layout. The exercised previews had zero axe violations.

## M-12 handoff and remaining gates

1. Take the signed M-11 evidence commit as the baseline. Read the [implementation plan](plan/README.md), [M-10 report handoff](m10-reports-and-exports.md) and [coverage matrix](plan/requirements-coverage.md).
2. Implement bounded originals, proxies/tiles, orientation and color, worker cancellation and evidence for each supported import variant. Keep originals encrypted. Keep source metadata out of normal exports unless an authorized user explicitly requests a permitted field.
3. M-16 must connect and verify real selected-revision geometry, scale, calibration, maps and reference pixels. Test physical iPad/Safari, real output extent, high-resolution memory limits and workbook recalculation in supported spreadsheet applications. The M-11 fixture evidence does not qualify final measured outputs.
4. Carry forward the M-09/M-10 recovery, sync, report/estimate deletion reachability and collaboration limits. The owner draft export adds no recipient report authorization, server-side plaintext rendering or portable-store recovery.
