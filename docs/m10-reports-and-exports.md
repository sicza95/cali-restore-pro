# M-10 · Report and export workflow

## Baseline

Continued from clean `041dcc305645b17c717c7286a217571f91b684fb`. GnuPG verified fingerprint `1FDDA447D1F9C8EF889B7D248F44ED13ED6879B0`. GitHub marked the baseline Verified and reported the same SHA on `main`. Read the M-09 handoff, estimation plan and coverage matrix. Implementation commit `45da7c7` was signed and locally verified with the same fingerprint.

## Delivered

- Report and output routes share one project draft. Explicit save captures surface selections, primary/comparison choices, selected reference IDs, language, units, content, notes, branding, issued estimate ID and format options. IndexedDB v7 uses an account-bound encrypted report store and its own authenticated purpose, reusing revision compare-and-swap, vault stamp and lock handling. Reopen restores the last save. Unsaved edits remain in the form after a failed save. Drafts record the source project revision and flag later revisions.
- Preview detaches the selected content and effective branding. It supports independent EN/HU, inherited per-surface area units or an output override, maps, legend, area/category/layer quantities and comparisons. Current assessment reports missing measurement. Initial and follow-up examples carry illustrative labels. Reference choices show ordinal placeholders without original names, bytes or metadata. PDF/SVG/PNG/CSV/XLSX choices remain preview-only, with resolution and workbook controls where applicable.
- Owner previews use an explicitly selected issued estimate snapshot and its stored result components. Summary contains the M-09 allowlist. Full itemization adds phase rate, hours, work, materials and subtotal from the issued input/result. Estimate totals cover the full issued selection, so previews omit the quote when the report excludes any of its surfaces. They keep stored totals and mark stale provenance after saved estimate or project changes. Editable workbook mode requires an available full estimate in the preview.
- Invitation previews are estimate-only and consume the currently decrypted grant. Assessment-only and history scopes expose no estimate preview. Summary grants cannot produce itemization. Full grants include publication freshness, with an unknown state for older grants. Full snapshot project binding is checked on decode. Existing synthetic grant payloads remain labelled and use their existing review display.
- Preview preparation can be cancelled, errors can be retried, and closing the modal clears the preview. Download and final issuance are gated on encoders and qualified measurements. No project assessment is restored, edited or sent as a side effect of report review.

## Verification

- `npm run check`, `npm run test:estimates` (8), `npm run test:files` (10, with the issued-estimate report journey on the production app at port 4186), and `npm run test:sync` (2).
- `npm run build-storybook` and `npm test -- --config playwright.built.config.ts` (11). Storybook reported its existing bundle-size advisory.
- Browser checks exercise encrypted draft reopen, scoped HPKE summary and full grants, immutable totals and rates, omission of unselected content and original filenames, independent report language/units, cancellation and disabled final/download. Axe reported zero violations in the exercised previews.
- Reviewed authenticated Chromium report screenshots at 1194 × 834, 834 × 1194 and 390 × 844, including dark portrait and the issued-estimate ledger. Preserved the framed-sheet direction, existing DM Sans and tokens. The preview answers which assessment versions and prices are included. Review identified the legacy “Sample total” label on issued totals, now “Estimate total.” Design source lint reported zero failures and one advisory for missing-value dashes.

## M-11 handoff and remaining gates

1. Add authorized client encoders for PDF, SVG, PNG, CSV and XLSX using detached selected content. For editable XLSX, define a separate full-scope input contract that covers the selected inputs, extras and formulas. The existing report view model is sufficient for rendering its preview, not for rebuilding an editable workbook. Inspect actual payloads and metadata, test cancellation and memory limits, and keep the fixture label in encoded outputs.
2. Connect real selected-revision geometry, scale, calibration, and references once those providers exist. Assessment versions beyond current are illustrative checkpoints in this slice. Project revision/timestamp and estimate provenance are captured separately from fixture selection. Only M-16 can qualify real measured results on target devices.
3. Report drafts are device-local. Portable project backup refuses estimate-bearing or report-bearing projects until those stores can be recovered atomically. Cloud sync, device transfer, deletion reachability and independent collaborative editing remain open. This slice does not refresh active grants or establish a new authorization path for recipient project reports.
4. Fixture tests use authenticated browser paths with mocked account/invitation endpoints and real local cryptography. Physical iPad/Safari/Pencil and service-backed release qualification remain open.
