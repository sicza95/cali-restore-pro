# Copy audit — Phase 2, step 1

15 November 2026 · Status: in progress · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md), Phase 2 item 1, UX findings 2 and 3 · Targets: iPad and desktop

Goal: every screen speaks the conservator's language. Engineering terms become task words, status notes that describe the build (not the user's work) leave the screen, and internal identifiers stop showing. Behaviour, control ids and layouts do not change.

## Where things stand

Found on `main` at `e1b065e`. Copy lives in about 27 files as `en`/`hu` objects or `[en, hu]` pairs; the heaviest are `src/platform/estimates/copy.ts` (237 lines), `src/ui/editor/drawing-review/copy.ts` (175), `src/platform/reports/copy.ts` and `src/ui/account-access/projects/surface-copy.ts`.

| Kind                                | Examples on screen today                                                                                                                                                                                                                                                                                                                              | Where                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Stale build notes                   | "Geometry is not connected yet." M-16 connected measured areas, so this is now false.                                                                                                                                                                                                                                                                 | `estimates/copy.ts` `transient`                                    |
| Real limits, worded as build status | "Estimate backup/restore is not connected. Portable project backups are blocked once an estimate is saved." The limit is real (`project-backups.ts` refuses an estimate-inclusive backup), but it shows on the estimate header instead of where the user backs up. The report page has the same pattern ("…require report-inclusive backup support"). | `estimates/copy.ts` `recoveryLimit`, `reports/copy.ts` `transient` |
| Version-control words               | "Commit draft", "Review commit mode", "Retained commits", "No committed marks in this review", "Committed phase layer", "Measuring committed geometry…", "Assign a committed phase layer…", "Commit or discard the drawing drafts before restoring."                                                                                                  | drawing, estimates, checkpoint copy                                |
| Harness words ("review", "scope")   | Page titles "Estimate review", "Report review", "Output review"; "Split review phase", "Combine review phases", "Review history", "Review version", "Independent mask scope", "Selected estimate scope", "Draft review".                                                                                                                              | estimates, reports, drawing copy                                   |
| Crypto and storage words            | "Encrypted input version · r4 · EUR", "Encrypted version saved locally. Not cloud-synced.", "Read-only encrypted sample", "Client-side restoration estimate."                                                                                                                                                                                         | `estimates/copy.ts`, `EstimateReview.tsx:290`                      |
| Connection status                   | "Platform connection", "Connected", "Check connection" in the account area.                                                                                                                                                                                                                                                                           | `account-access/constants.ts`                                      |
| Internal ids                        | Layer UUIDs in surface measurements when a layer has no name (`SurfaceMeasurements.tsx:74` falls back to `entry.id`); the phase id in the shared estimate (`SharedEstimateProjection.tsx:71`); `r{revision}` in the estimate version list; "restoration-v1" as "Calculation version" in the report.                                                   | listed                                                             |
| Not in scope here                   | Raw floats such as `0.00113388 ft²` (Phase 2 item 2, number formatting); control `description` and `valueSource` strings in the registries (developer documentation, not rendered); Storybook story notes ("not connected in this UI story", which describe the story honestly).                                                                      | —                                                                  |

Tests: most platform tests find controls by `data-control-id`, but `tests` and `tests-platform` also hold about 350 `getByText` / `getByRole(…, { name })` lookups. Three of them name strings this plan changes. Each copy commit updates the lookups it breaks, preferring a control id over a new string.

## Approach

Write the vocabulary down first, then change copy one area at a time, then guard it.

1. A short glossary fixes each replacement once, in EN and HU, so the same idea reads the same everywhere (for example, "commit" becomes "save" in the editor and the estimate).
2. Each area is one commit, so screenshots and tests can be checked per screen.
3. A guard test fails if a banned engineering term reappears in rendered text.

Copy changes only. Keys may be renamed when the old name misleads (`transient`), but control ids never change, so the registries and parity test stay valid.

Rejected alternative: a central i18n catalogue first. That is Phase 3 item 3. Doing it now would mix a structural move with wording changes and make every diff unreadable. The glossary is written so the catalogue can adopt it later.

## Commits

Each commit keeps `npm run check`, `npm test` and `npm run test:files` green. Copy commits look at the affected screenshots at 1194 and 834 px, landscape and portrait, in EN, and at one HU screenshot per area.

1. **`docs(copy): glossary for task language`**
   - New `docs/copy-glossary.md`: banned terms, their replacements in EN and HU, and two rules. A note that describes the build goes in docs, not on screen. A real limit stays on screen, said once, where the user acts on it.
   - As built: [copy glossary](../copy-glossary.md), with six rules, a table of 20 terms and the words that stay. Found while writing it: the Hungarian split help names a milestone on screen ("A maszkok az M-14-ben határozhatók meg."); commit 2 fixes it. Because HU used _előnézet_ (preview) for "review", the guard matches HU terms as phrases.
   - Proposed core terms (decision 2): commit → save; committed → saved; draft stays; "review" dropped from page titles and actions; scope → "what's included" or the concrete noun ("Phase area", "Objects in this estimate"); encrypted/client-side → dropped, or "saved on this device"; revision `r4` → "version 4" or hidden; calculation version → kept only in exported files.

2. **`copy(estimates): task language on the estimate page`**
   - `estimates/copy.ts` EN and HU, and `EstimateReview.tsx` where it joins strings.
   - Delete the stale geometry note. Replace the header notes with one line about where the estimate is saved.
   - Move the backup limit to the project's backup panel (`ProjectBackup.tsx`), shown only when the project has a saved estimate or report draft: "Backups don't include estimates or report drafts yet. Keep this device's copy until they do." (decision 3). Record the limit in [estimation and outputs](estimation-and-outputs.md).
   - Version list: "Version 4 · EUR · <date>" instead of "Encrypted input version · r4 · EUR".

3. **`copy(editor): save, not commit, in the surface editor`**
   - `drawing-review/copy.ts` (EN and HU) and `checkpoint-copy.ts`: "Commit draft" → "Save draft"; "Review commit mode" → "Save marks"; "Manual batches" → "When I choose"; "Retained commits" → "Undo steps kept"; "Review history" → "History"; "No committed marks in this review." → "No saved marks yet."
   - Check the canvas chip's "Apply mark" and the draft bar agree with the new words.

4. **`copy(reports): task language in reports and outputs`**
   - `reports/copy.ts` EN and HU: page titles without "review", "Draft review" → "Draft", the backup note removed (it moved in commit 2). "Calculation version" stays in exported CSV, XLSX and PDF rows (an audit value) and leaves the on-screen preview.

5. **`copy(account): connection status in plain words`**
   - `account-access/constants.ts`: "Platform connection" → "Server"; "Connected" → "Online"; "Check connection" → "Check again". Only if decision 4 keeps the panel.

6. **`fix(ui): stop showing internal ids`**
   - `SurfaceMeasurements.tsx`: an unnamed layer shows its kind and number ("Damage layer 2"), not its UUID.
   - `SharedEstimateProjection.tsx`: show the phase name, not `phase.id`.
   - A search for other `.id}` text nodes in `src/ui` (attribute uses are fine).

7. **`test(copy): banned terms stay off screen`**
   - `tests-platform/copy-guard.ts`: at each point where the flows already take a screenshot, read the page's visible text and fail on any banned term from the glossary (EN and HU lists, whole words, case-insensitive), printing the term and the screen. Run at the end of the existing flows in `projects.browser.ts`, so it adds no new navigation.
   - A UUID pattern check on the same text.
   - Negative run: put one banned term back and see the test fail.

8. **`docs(plan): step 1 done`**
   - Tick Phase 2 item 1 in the quality baseline; re-rate UX findings 2 and 3 (2 keeps the raw floats until item 2). As-built notes here; update the handoff.

Expected size: copy diffs of about 150 to 250 changed lines in all, a new test of about 80 lines, and the glossary.

## Decisions

On 15 November 2026 the owner accepted the recommendations for all four decisions.

1. **Branch and PR, or straight to `main`?** Recommended: one branch `copy/task-language` and one PR, with before and after screenshots of the estimate page, the editor inspector and the report page, because every commit changes shipped screens.
2. **The glossary's core terms** (commit 1 above). Recommended: accept them as proposed. The owner is asked to check the Hungarian wording in the PR, since the HU strings change too.
3. **Backup limit placement.** Recommended: say it on the backup panel, only when it applies. Alternative: keep it on the estimate and report pages too.
4. **The "Platform connection" panel.** Recommended: keep it with plain wording (it helps when the server is down). Alternative: remove it and rely on the save and sync states.

## Out of scope

Number and unit formatting (Phase 2 item 2); restructuring the estimate page (item 3); the app shell and breadcrumbs (item 4); controls and button hierarchy (item 5); a central i18n catalogue (Phase 3 item 3); registry descriptions; Storybook story notes.
