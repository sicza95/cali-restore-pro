# M-10 · Report and export workflow

## Baseline

Continued from clean `3c62a4bb76533ba97df053802676cb6c50320fe6`. GitHub marked the baseline Verified and reported the same SHA on `main`. Inputs: the M-09 evidence, estimation plan and coverage matrix. Implementation commit `536273c` was signed.

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
3. Report drafts are device-local and included in [portable backup v2](m07-portable-backups.md), restored atomically with the project and estimate records. Cloud sync, device transfer, deletion reachability and independent collaborative editing remain open. This slice does not refresh active grants; recipient reports follow [ADR 0008](../adr/0008-recipient-own-reports.md) (below).
4. Fixture tests use authenticated browser paths with mocked account/invitation endpoints and real local cryptography. Physical iPad/Safari/Pencil and service-backed release qualification remain open.

## 2026-11-17 owner decision: saved draft estimates

Owner reports may select a saved unissued estimate version as well as an issued version. A draft is labelled in the report language, and unavailable dependent values remain unavailable. Incomplete estimates still cannot be issued; sharing grants retain their issued-version rules.

## 2026-11-17 owner decision: recipient reports (#55)

A recipient can author their own report built only from content in their active grants ([ADR 0008](../adr/0008-recipient-own-reports.md)). The Invitations page shows **Write my own report** under an opened shared project and **My reports from shared projects** below the inbox.

- **Within the grant.** The form offers the shared surfaces (names and units from the assessment snapshot), notes, report language, PDF or XLSX, and estimate figures only up to the grant: none for assessment-only, the summary for a summary grant, summary or full for a full grant, and only once that estimate has been opened. `authorRecipientReport` filters again on save and stores only the chosen level (a summary chosen from a full grant keeps the totals, not the itemization). History grants and original files are not added to the report.
- **Recipient's vault only.** Drafts are sealed in the recipient vault's `encrypted-recipient-reports` table under `[account, project, invitation]`, with a purpose bound to project, invitation and revision. The owner's project, estimate and report tables and portable backups never read them. No server, API or migration change.
- **Always a draft.** Recipient exports reuse the client encoders with a `recipient` flag; the PDF heading note and the XLSX first row read "Recipient draft from shared content. Not issued by the project owner." (EN/HU). Files are named `calirestore-recipient-draft.pdf|xlsx`. There is no final issuance path.
- **After revocation.** A saved draft whose grant is no longer listed as active stays in the list with "Your access to this project has ended. This copy stays on this device and is no longer updated." It can still be exported or deleted, not edited.

Evidence: `src/platform/recipient-reports/scope.test.ts` (grant levels, assessment-only without figures, summary narrowing, inactive grant refusal, stored-draft validation) and `src/platform/vault/recipient-reports.test.ts` (keying by project and invitation, revision checks, sealed rows bound to their key, no rows in the owner report table or backup rows). `tests-platform/recipient-reports.browser.ts` runs an owner context that seals a project snapshot and a full estimate grant plus an assessment-only grant with real local cryptography, and a recipient context (mocked invitation endpoints) that authors both reports, checks the offered levels, downloads labelled XLSX files (figures only in the full one), confirms the stored rows are ciphertext and the report table stays empty, sees the revocation warning in EN and HU, exports after revocation, deletes, and passes axe at 834 × 1194 and 1194 × 834.

Open: recipient drafts are not synced or backed up off the device, and physical-device qualification remains with M-16.
