# Handoff

Shared by Codex and Claude. Update at the end of every working session. Newest entry first; keep the "Current state" block accurate and trim the log to the last ~10 entries (older detail lives in git history and milestone docs).

## Current state

- **Branch:** `main` at the orchestrator's handoff commit on top of `f088345` (all Verified). PRs #19, #20 and #21 landed by fast-forward and GitHub marks them merged. PRs #22 to #24 landed as one re-signed chain via [PR #25](https://github.com/sicza95/cali-restore-pro/pull/25) (closed with a pointer); #26 and #27 landed by fast-forward and show merged. The owner allows direct and force pushes to `main` (2026-11-15), so no more chain PRs.
- **Target devices:** iPad and desktop only (owner decision, 2026-11-15; [ADR 0003](../adr/0003-ipad-and-desktop-only.md)). Phone widths are not supported for now.
- **Last milestone:** M-16 measured estimates and draft outputs ([evidence](../milestones/m16-measured-integration.md)). Milestone records now live in [`docs/milestones/`](../milestones/); see also the [architecture overview](../architecture.md) and [ADRs](../adr/).
- **Quality baseline:** [2026-11-14 review](../reviews/2026-11-14-quality-baseline.md), re-scored 2026-11-15 at `7016b48`: code 8, architecture 8, UX 6, UI 6 (was 7, 7, 4, 5).
- **Active roadmap phase:** Phases 0 to 4 of the baseline are done. Remaining work is in GitHub issues; the re-score lists what moves each rating next.
- **CI:** one workflow `ci.yml` with four parallel jobs: Frontend checks, Unit tests (Vitest), Go tests, Platform E2E.
- **Suite status:** see the latest log entry.
- **Not run:** `test:sync`, `test:estimates` (locally, this batch), backup scripts.

## Next step

UX next by the re-score: the surface header (#39), which would also free first-screen space for the photo canvas, and the warning treatment (#38); then the truncated estimate rows (#35). A physical iPad session (#49) should try the new photo gestures with fingers and Pencil.

## Open questions for the owner

None open. (2026-11-15: the owner removed the 390 px checks, issue #47.)

## Log

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Photo setup by gesture (#34)

- Plan: [`docs/plan/photo-gestures.md`](../plan/photo-gestures.md), pushed first (`5339ceb`).
- Photo setup pans by drag and arrow keys and zooms by pinch, Ctrl/⌘ + wheel and + − (0 fits), reusing the drawing canvas's wheel and key rules; the Left / Right / Up / Down buttons and their controls and copy are gone, and a hint names the gestures (EN, HU). The canvas is focusable with a label, the hint as its description and `aria-keyshortcuts`. The picker row is compact on this tab too, with the photo counter in it, and the canvas runs to the bottom of the first screen: 52 % of the first screen at 1194 × 834 (was 47 %), 68 % at 834 × 1194 (was 55 %).
- Found and fixed on the way: zoom anchored on the wrong origin (the preparation preview sets `transform-origin: 0 0`), and `user-select: none` with `touch-action: none` on the photo canvas slowing multi-finger taps on the drawing canvas by about 450 ms (bisected; cause in Chrome not established).
- Verified: `npm run check`, `test:unit` (214), `test:files` (22; the projects flow also 3 of 3 with `--repeat-each 3`), `npm test` (16), `test:sync` (2), `test:estimates` (8), `test:app` (16 passed, 1 skipped) on disposable `calirestore-qa-photo` (removed with volumes), `build-storybook`. Looked at `photo-en-light-1194` and `photo-hu-light-834`.
- Not run: Go tests; a real iPad (pinch and drag were tested with CDP touch events only).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Phase 2 items 4 and 5 confirmed; baseline re-scored (#33)

- Item 4 (app shell) confirmed against [its plan](../plan/app-shell.md) in code, tests (`navigation.spec.ts` drawer focus, Escape, focus return) and screenshots; ticked, with #39 left. Item 5 (styled controls) confirmed the same way; a temporary probe in `copy-guard.ts` (not committed) listed the visible primaries on every guarded screen. One gap fixed: under the checkpoints tab the embedded pattern editor's "Save pattern version" was a second primary; it is now primary only on the libraries page (`PatternReview.tsx`). Ticked.
- Re-scored the baseline with evidence (new section "Re-score after Phases 1 to 4"): code 8, architecture 8, UX 6, UI 6 (was 7, 7, 4, 5), with what holds, why not higher, and what would move each rating. Fixed the stale 390 px sentence in Phase 2.
- Verified: `npm run check`, `test:unit` (210), `test:files` (22) and `npm test` (16) after the `PatternReview` change.
- Not run: `test:app`, `test:sync`, `test:estimates` (one class attribute changed in the editor), Go tests.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · File-level lint disables removed (#32)

- Plan: [`docs/plan/lint-disables.md`](../plan/lint-disables.md), pushed first (`ffdd08a`).
- The eleven `/* eslint-disable solid/reactivity */` file headers are gone. Their 37 findings: 27 deferred commands passed to `run`/`onRun` (now declared once via `customReactiveFunctions` in `eslint.config.js`), 8 props read once at setup that are fixed for the mount (now `untrack(...)` with the reason; each parent checked: keyed `<Show>` or `<For>` rows), and 4 nested reads moved to locals at the start of the command or derivation. Two line disables in `SurfaceWorkspace.tsx` became unused and went; one stays with its reason.
- Verified: `npm run check`, `test:unit` (210), `npm test` (16), `test:files` (22), `test:estimates` (8), `test:sync` (2), `test:app` (16 passed, 1 skipped) on disposable `calirestore-qa-lint` (removed with volumes), `build-storybook`.
- Not run: Go tests, physical iPad.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Breadcrumbs kept vault names after lock (#58)

- The flaky check in `project-reviews.browser.ts` was hiding a real bug. The app shell's breadcrumb read project and surface names from a cache in `AppContext` that `ProjectWorkspace` filled with **every** local project's name and that was never cleared. A probe showed: after "Lock vault" the breadcrumb still read "Projects > East Chapel > Outputs", and an archived project's review (which says "unavailable") always named the project once the list loaded. The old check passed only when it ran before the list loaded.
- Fix: `provideNames(source)` replaces `publishNames`: the names last only as long as the providing component, so they leave the shell when the workspace unmounts (vault locked, signed out, another account). `ProjectWorkspace` now provides only the names the page shows: the route's project and surface, and nothing for an archived project's review.
- Test: the flow asserts the breadcrumb names the project while unlocked, not after locking, and waits for the project list to load before checking the archived case. Without the fix each check fails 3 of 3; with it the flow passed 20 of 20 (`--repeat-each 20`).
- Verified: `npm run check`, `test:unit` (210), `npm test` (16), `test:files` (22), `test:estimates` (8), `test:sync` (2), `test:app` (16 passed, 1 skipped) on disposable `calirestore-qa-names` (removed with volumes), `build-storybook`.
- Not run: Go tests, physical iPad. Not covered by a test: sign-out followed by another sign-in without a reload (same unmount path as locking).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Colour tokens (#31)

- Plan: [`docs/plan/colour-tokens.md`](../plan/colour-tokens.md), pushed first (`1c28461`).
- `tokens.css` gains `--cr-backdrop`, `--cr-dialog-backdrop`, `--cr-photo-label(-ink)`, `--cr-mask-guide` and `--cr-specimen(-ink)` (same in both themes). The drawer, both dialog backdrops, the sign-in photo panel, canvas caption, thumbnail labels, mask strokes and the hatch pattern use them. Intended changes: one dialog backdrop for both dialogs, one label colour for photo labels, one guide colour for strokes and hatch.
- New `src/ui/colour-literals.test.ts`; Vitest now includes `src/ui/**/*.test.ts`. Exceptions: data defaults (new layer colours, report accent); `src/platform` exports are not scanned.
- Verified: `npm run check`, `test:unit` (210; negative run failed as expected), `npm test` (16), `test:files` (22 on rerun), `build-storybook`. Pixel diff of all screenshots against `main`: only the intended changes and timestamps.
- Found: `project-reviews.browser.ts:348` is flaky on `main` too (previous account's project name still visible after switching accounts), issue #58.
- Not run: `test:app`, `test:sync`, `test:estimates` (no flow or copy change), Go tests.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Report exports use the catalogue (#57)

- New `src/platform/reports/export-copy.ts` (workbook sheet names and headings). `export-editable.ts` and `export.worker.ts` read it; the PDF `/Lang` and SVG `xml:lang` use `parseLanguage`. The inline-language guard in `src/platform/i18n/guard.test.ts` now covers `src/platform/reports/` too.
- New `export-editable.test.ts` pins the EN and HU sheet names and headings (nothing covered them before); they match the old strings.
- Verified: `npm run check`, `test:unit` (209), `test:files` (22, includes the XLSX and PDF downloads), `test:estimates` (8).
- Not run: `npm test`, `test:sync`, `test:app` (no UI change).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Central i18n catalogue (#30)

- Plan: [`docs/plan/i18n-catalogue.md`](../plan/i18n-catalogue.md), pushed first (`db59e77`).
- New `src/platform/i18n/`: `Language`, `languages`, `languageNames`, `parseLanguage`; `defineCopy({ en, hu })` (type: HU must have exactly EN's keys, same function parameters, nested shapes) and `defineCopyPairs`; `banned-terms.ts`, now shared with `tests-platform/copy-guard.ts`.
- Every EN/HU catalogue is declared with `defineCopy` in a `copy.ts` / `*-copy.ts` module. Inline copy moved out of `ProjectBackup`, `ProjectKeyTransfer`, `OfflineOriginals(Page)`, `PrivateLibraries`, `PresetInputs`, `account-access/constants.ts` and `settings/constants.ts` (now `settings-copy.ts`). All inline `language === 'hu'` choices in `src/ui` are gone, including `ProjectLifecycle` and `AccountDeletion` (new `lifecycle-copy.ts`, `deletion-copy.ts`).
- `test:unit` now checks: EN/HU parity over every catalogue, glossary banned terms in every catalogue string, copy only in copy modules, and no inline language comparison in `src/ui`. Negative run: one HU key removed → `typecheck` TS2741 and `test:unit` fail.
- The banned-terms check found five HU strings no screen guard reached; reworded (_pillanatkép_ → _másolat_ in sharing, _rögzített_ → _offline elérhető_ on the offline originals page) and added to the glossary. No other text changed.
- Verified: `npm run check`, `test:unit` (207), `npm test` (16), `test:files` (22), `test:estimates` (8), `test:sync` (2), `test:app` (16 passed, 1 skipped) on disposable `calirestore-qa-i18n` (removed with volumes), `build-storybook`. Looked at `estimate-1194` and `estimate-hu`: unchanged.
- Not run: Go tests (no Go change), physical iPad.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · 390 px checks removed, feature folders

- Drift on start: `main` was 8 commits ahead of this handoff (app shell, styled controls, sync test, issue-closing rule). Those sessions did not add a log entry.
- #47 (owner: remove): the 390 × 844 viewport is gone from seven platform tests, with the phone dock assertions in `drawing-review.ts` and the `projects-phone` screenshot; `estimate-hu-390.png` is now `estimate-hu.png`. ADR 0003 updated. The phone CSS (640 px media queries in `editor/`) stays but is untested.
- #29: `src/ui/account-access/` split by a script that moves files with `git mv` and rewrites every relative import (code, CSS, `new URL` workers, tests): `account/` (sign-in forms, vault, `AccountScreen`), `settings/`, `projects/`, `project-review/` (the review page with the shared `fields.tsx` and `styles.css`), `estimates/`, `reports/`, `sharing/` (was `invitations/`). `account-access/` keeps 13 shared core files (session state, API, types, navigation, global styles). Only import lines changed. Baseline Phase 3 item 4 ticked; architecture overview updated.
- ESLint now ignores `.claude/**`: leftover side-session worktrees made `npm run lint` fail with 727 parser errors.
- Verified: `npm run check`, `test:unit` (200), `npm test` (16), `test:files` (22), `test:estimates` (8), `test:sync` (2), `test:app` (16 passed, 1 skipped) on disposable `calirestore-qa-folders` (removed with volumes), `build-storybook`.
- Not run: Go tests (no Go change), physical iPad.

### 2026-11-15 · Claude (orchestrator on the owner's Windows machine) · Estimate steps and router

- Merged [PR #25](https://github.com/sicza95/cali-restore-pro/pull/25) (PRs 22 to 24) at the owner's request; closed #22 to #24 with a pointer.
- Two side sessions in their own worktrees; both hit the usage limit once and resumed:
  - [PR #26](https://github.com/sicza95/cali-restore-pro/pull/26): the estimate screen is a summary plus five steps (Objects → Work phases → Extras → Adjustments and tax → Save and issue), one primary per step, logic moved to `useEstimateDraft.ts` without behaviour change. Page height at 1194 about 2,640 px → 1,490 px (Phase 2 item 3).
  - [PR #27](https://github.com/sicza95/cali-restore-pro/pull/27): `src/ui/router/` (typed route table with access levels, guards, `?next=`, deep links) and `src/ui/app-context/` (`AppProvider`, `useApp()`); screens no longer take `model`. ADR 0006. One intended difference: `/offline-originals/` with a trailing slash now opens the page (Phase 3 item 2).
- Landed by fast-forward: `main` → #26 head, then #27 rebased onto it (re-signed, `git range-diff` identical, force-pushed to its own branch) → #27 head, then this handoff commit. GitHub marks #26 and #27 merged. (A chain PR #28 was opened first for CI; it shows merged because its head is on `main`.)
- Verified: both PRs green on all four CI jobs; the chain again on its own PR. Sessions ran `npm run check`, `test:unit` (197), `npm test` (16), `test:files` (22), `test:estimates` (8, #26) and `test:app` (16 passed, 1 skipped, #27).
- Not run: `test:sync`; `test:estimates` on #27's changes alone; physical iPad.

### 2026-11-15 · Claude (orchestrator on the owner's Windows machine) · Roadmap batch: formatting, CI, Vitest, Go split, docs

- Merged [PR #19](https://github.com/sicza95/cali-restore-pro/pull/19) (copy audit) at the owner's request, then ran five side sessions in their own worktrees, each ending in a signed PR:
  - [PR #20](https://github.com/sicza95/cali-restore-pro/pull/20): one CI workflow with parallel jobs (Phase 4 item 1). Merged.
  - [PR #21](https://github.com/sicza95/cali-restore-pro/pull/21): shared number and unit formatter (`Intl.NumberFormat`, EN and HU) on every screen with areas, money, hours or percentages, and a guard against raw floats (Phase 2 item 2). Merged.
  - [PR #22](https://github.com/sicza95/cali-restore-pro/pull/22): `internal/identity` split into 9 domain packages, no behaviour change, Go tests green at every commit (Phase 3 item 5).
  - [PR #23](https://github.com/sicza95/cali-restore-pro/pull/23): `docs/m*.md` moved to `docs/milestones/` with an index, new `docs/architecture.md` and `docs/adr/` (template + 0001 to 0005) (Phase 4 item 2).
  - [PR #24](https://github.com/sicza95/cali-restore-pro/pull/24): Vitest, 182 tests for `src/platform` (estimates, geometry, vault crypto, revision queue) and a parallel CI job (Phase 3 item 1). No bugs found; the revision queue sends drafts in project-ID order, one per project.
- #22 to #24 were replayed onto `main` after #21 and re-signed as [PR #25](https://github.com/sicza95/cali-restore-pro/pull/25), because force-pushing the PR branches was blocked.
- Verified: all four CI jobs green on #25 (the whole chain); every commit Verified. Side sessions also ran `npm run check`, `npm test`, `npm run test:files`, `npm run test:unit`, `go test ./...` and `test:app` (Go split) locally.
- Not run: `test:sync`, `test:estimates` on the combined chain.
- Not done: the remote branches of merged PRs are not deleted (deleting them was blocked).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Copy audit commit 8: done, PR opened

- Pushed commit 7 (`55d8068`); Verified.
- Ticked Phase 2 item 1 in the quality baseline. UX finding 3 is retired, finding 2 partly (raw floats remain until item 2). The UX rating stays at 4.
- Opened [PR #19](https://github.com/sicza95/cali-restore-pro/pull/19) into `main` with before and after screenshots (orphan branch `pr-assets/copy-audit`).
- At the owner's request, folded PR #18 into the branch: cherry-picked its commit, re-signed as `53567b2`, and closed PR #18 with a pointer to #19.
- Verified: `npm run check`, `npm run test:files` (22 passed, including the new `project-trash.browser.ts`), `npm test` (12 passed).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Copy audit commit 7: guard test

- Pushed commit 6 (`c8b35e3`); Verified. A side session, started from a task card, ran in this same folder (no worktree available) and opened [PR #18](https://github.com/sicza95/cali-restore-pro/pull/18) into `copy/task-language`: the hosted trash shows real project names when the device has them. The folder was back on `copy/task-language` with a clean tree afterwards.
- New `tests-platform/copy-guard.ts`: `expectTaskLanguage` before ten screenshots on the audited screens. Banned terms, UUIDs and `r4`-style revisions fail; "encrypted backup" is allowed; open dialogs (file previews) are skipped.
- Verified: `npm run check`, `npm run test:files` (21 passed), `npm test` (12 passed). Negative run: a "Committed" estimate note failed the guard.
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests (no app code changed).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Copy audit commit 6: no internal ids on screen

- Pushed commit 5 (`b887828`); Verified.
- Unnamed layers in surface measurements show their kind and number instead of a UUID; shared full estimates show phase names. Also found and fixed: project UUIDs in the hosted trash ("Deleted project 1"), image UUIDs in the sync list ("Mapping 1"), "Revision 4" on a shared project. Admin job ids stay (support reference).
- Follow-up: the trash can't show real names without the local vault (names are encrypted on the server).
- Verified: `npm run check`, `npm run test:files` (21 passed), `npm run test:sync` (2 passed), `npm test` (12 passed).
- Not run: `test:app` (the trash panel is not covered by any suite), `test:estimates`, Go tests.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Copy audit commit 5: connection status

- Pushed commit 4 (`24e8cb3`); Verified.
- The page footer reads "Server: Online · Check again" (HU "Szerver: Elérhető · Újra ellenőrzés") instead of "Platform connection: Connected · Check connection". `app.spec.ts` updated.
- Verified: `npm run check`, `npm run test:files` (21 passed), `npm test` (12 passed), and **`npm run test:app` (16 passed, 1 skipped: `invitations.spec.ts` without its `M06_*` variables)** on a disposable Compose project `calirestore-qa-copy`, removed afterwards with its volumes. First `test:app` run since step 3 of Phase 1.
- Not run: `test:sync`, `test:estimates` (no estimate copy changed), Go tests.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Copy audit commit 4: reports and outputs

- Pushed commit 3 (`9ea287e`); Verified.
- Report copy (EN and HU): "Objects and surfaces", "Values only", "Draft", "Preparing the report…", plain older-draft, freshness and earlier-version notes; the page note no longer mentions backups.
- Departure from the plan: the calculation version and revision rows stay in the preview dialog, because it shows exactly the rows of the downloaded file. Glossary rule 5 now says so.
- Tests: two lookups updated (one HU).
- Verified: `npm run check`, `npm run test:files` (21 passed), `npm test` (12 passed), `npm run build-storybook`. Looked at `output-1194`.
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Copy audit commit 3: editor wording

- Pushed commit 2 (`c67546e`); Verified.
- Drawing, checkpoint and surface photo copy (EN and HU) follow the glossary: "Save draft", "Save marks: After each stroke / When I choose", "Undo steps kept", "History", "No saved marks yet.", "Several marks"; mode tabs "Photo setup", "Drawing", "Checkpoints"; checkpoint "Save checkpoint", "Restore checkpoint", "Measurements", "Area unit". The HU pattern editor no longer says _előnézeti_ for "review". The app's checkpoint overrides that now match the base were removed.
- Found and fixed: the editor's save status was English only, said "on this iPad" on every device, and its error label had Storybook's fake "last saved 14:27". `SaveStatus` takes `labels` and `retryLabel`; `EditorCopy` has `save` and `retry` in EN and HU.
- Tests: four lookups updated (one was a regex the string search missed; see process notes and the `copy-change` skill).
- Verified: `npm run check`, `npm run test:files` (21 passed), `npm test` (12 passed), `npm run build-storybook`. Looked at `drawing-834-open`, `drawing-834-closed`, `drawing-1194-open` and `checkpoint-1194`.
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests. No HU screenshot of the editor (the flows only take one for the estimate page).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Copy audit commit 2: estimate page

- Estimate copy (EN and HU) follows the glossary: page titles "Estimate", "Report", "Outputs"; one note instead of the stale "Geometry is not connected yet" and the backup notice; "Phase area", "Phase layer", "Objects in this estimate", "Results", "Split phase". The HU split help no longer names M-14. The version line is "Version 1 · Issued · <date> · HUF" (new `estimate-version.ts`); "restoration-v1" is off the screen.
- Found and fixed: a project with a saved estimate failed its backup with the misleading "check your originals… 512 MiB" error. New `BackupUnavailable` and `projectBackups().gap()`; the backup panel says so when opened and disables "Prepare backup". Recorded in [estimation and outputs](../plan/estimation-and-outputs.md).
- Tests: three string lookups updated; `estimates.browser.ts` checks the refusal's gap and the panel message, with a `project-backup-gap.png` screenshot.
- Verified: `npm run check`, `npm run build-storybook`, `npm test` (12 passed), `npm run test:files` (21 passed after fixing one HU heading lookup, see process notes). Looked at `estimate-1194`, `estimate-hu-390` and `project-backup-gap`.
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Copy audit commit 1: glossary

- Committed the plan with the owner's decisions as `b0239e5` on `main`, signed. **Not pushed**: the permission classifier blocked `git push` to `main` (the owner's message accepted the decisions but didn't ask for a push).
- On `copy/task-language`: [copy glossary](../copy-glossary.md) as `1852b79`, signed, not pushed. Six rules, 20 terms in EN and HU, the words that stay, and how the guard matches them. Found: the HU split help names milestone M-14 on screen.
- Verified: `npm run check`. Later, at the owner's request, pushed `main` and `copy/task-language`; both commits Verified.
- Not run: `npm test`, `test:files` (docs only), `test:app`, `test:sync`, `test:estimates`, Go tests.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Phase 2 step 1 planned

- Committed and pushed `e1b065e` (step 4 merge and iPad/desktop decision); Verified.
- Wrote [copy audit](../plan/copy-audit.md): a glossary, four copy commits by area (estimates, editor, reports, account), one commit that stops showing internal ids, a guard test against banned terms, and a docs commit. The owner accepted all four decisions as recommended (one branch and PR, the glossary terms, the backup limit on the backup panel, plain wording for the connection panel).
- Found: "Geometry is not connected yet" on the estimate page is false since M-16. The estimate backup limit is real (`project-backups.ts` refuses estimate-inclusive backups), so the plan moves it to the backup panel instead of deleting it.
- Verified: nothing run (docs only).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 4 merged, phone width dropped

- Merged [PR #17](https://github.com/sicza95/cali-restore-pro/pull/17) at the owner's request by pushing `2787ff5` to `main`. Before the push: both CI checks passed, all four commits were Verified and the merge was a fast-forward. GitHub marks the PR merged.
- Owner decision: iPad and desktop only; phones are not supported for now. Recorded in the quality baseline's Phase 2 (item 4 no longer mentions phone) and closed the old open question. The 390 px test checks are unchanged (new open question 1).
- At the owner's request, deleted the remote `refactor/retire-drawing-adapter` and `feat/canvas-first-layout` branches after checking that both were already in `main`.
- Verified: nothing run (docs only).
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 4 commit 4, PR opened

- Ticked Phase 1 item 4 in the quality baseline and retired architecture weakness 3 ("Two editor implementations"). The architecture rating stays at 7, since weaknesses 1, 2, 4 and 5 still hold. The plan's status is "done, in review".
- Opened the step 4 PR (link in the PR list). It has no screenshots: commits 2 and 3 were checked pixel by pixel against the commit before and show no visible change.
- Verified: `npm run check` on the docs commit. The code commits' suite runs are in the entries below.
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 4 commit 3: one host for the drawing panels

- Pushed commit 2 (`529ec4e`); Verified.
- `DrawingLayers`, `DrawingHistory`, `DrawingToolSettings` and `DrawingToolOptions` lost every prop and branch that existed only for the adapter; see the plan's "As built" note. Four unread copy keys are gone (EN and HU). 197 lines removed, 21 added.
- Verified: `npm run check`, `npm run build-storybook`, `npm test` (12 passed), `npm run test:files` (21 passed, parity green). Screenshots against commit 2: no visible change.
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests. Committed and pushed.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 4 commit 2: adapter deleted

- Pushed `refactor/retire-drawing-adapter` with commit 1 (`f79525e`); Verified.
- Deleted `DrawingReviewAdapter.tsx` and its adapter-only CSS (326 lines in all). The registry's `composition` now names the workspace, and the `DrawingWorkspace` doc comment no longer names the adapter.
- Verified: `npm run check`, `npm run build-storybook`, `npm test` (12 passed), `npm run test:files` (21 passed; parity green). Screenshots against commit 1: no visible change (five identical; three show only run-to-run noise, confirmed by a second run on the same code).
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests. Committed on the branch, not pushed.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 4 commit 1: parity test

- Pushed the step 4 plan (`ec20f87`) to `main`; GitHub reports Verified. Created `refactor/retire-drawing-adapter`.
- `tests-platform/drawing-review.ts` adds `recordDrawingControls` (a `MutationObserver` over the whole flow) and `expectDrawingParity`. It runs at the end of `verifyDrawingReview` and asserts that the rendered `surface.draw.*` ids equal the registry. Result: all 67 ids, no gaps, no dead ids. A negative run with a fake registered id failed as expected.
- Verified: `npm run check`, `npm run build-storybook`, `npm test` and `npm run test:files` (21 passed); `npm test` 12 passed.
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests. Committed on the branch, not pushed.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 3 merged, step 4 planned

- Reviewed PR #16. Both CI workflows passed, all ten commits are Verified, and it fast-forwards cleanly. Merged at the owner's request by pushing `de28868` to `main`; GitHub marked the PR merged.
- Deleted `pr-assets/step3`; deleted the local `feat/canvas-first-layout` branch.
- Wrote [step 4's plan](../plan/editor-retire-adapter.md). `DrawingReviewAdapter` has no importers. Four CSS rule groups plus two more classes serve only it. `DrawingLayers` (`list`), `DrawingHistory` (`controls`) and `DrawingToolSettings` (`actions`, `toolOptions`, `numeric`) keep props only for a second host. No test checks that every registered `surface.draw.*` id renders.
- Verified: nothing run (docs only; no code changed).
- Owner accepted decisions 1 and 2. The plan, the handoff and the process notes are committed on `main`, not pushed.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 3: inspector scroll fixed on the PR branch

- The owner chose to fix the scroll on the step 3 branch. `LayerPanel` now listens for `toggle` in the capture phase on its body (the event doesn't bubble) and reveals the selected row when any disclosure inside the body closes. Opening one is left alone, so its fields stay in view.
- `drawing-review.ts` checks the row is in view on arrival in the short portrait state, right after "Enter by number" closes. This is the check that failed before the fix.
- Refreshed the PR screenshots on `pr-assets/step3`.
- Verified: see the PR body for suite results.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 3 commits 6 and 7 pushed, PR opened

- Committed and pushed commit 6 as `08d0c58` (`fix(editor): phone width`); GitHub reports Verified.
- Commit 7 (`test(editor): cover canvas-first layout`): `drawing-review.ts` checks the photo fills the canvas on one axis at 1194, 834 and 390 px, that `view.zoom` sits inside "Enter by number", and that the selected layer row is in view after each grip toggle. Wheel, keys and footer zoom were already covered by `canvas-zoom.ts`. Ticked Phase 1 item 3 in the quality baseline.
- Found: the short portrait inspector can show no layer row after "Enter by number" is opened and closed (open question 2). The test checks the row after a toggle, which is what the plan promises, not on arrival.
- Opened [PR #16](https://github.com/sicza95/cali-restore-pro/pull/16). Screenshots `drawing-{1194,834,390}-{closed,open}.png` and `drawing-{834,390}-tall.png` are on the orphan branch `pr-assets/step3` and embedded in the PR.
- Verified: `npm run check`, `npm run build-storybook`, `npm test` (12 passed), `npm run test:files` (21 passed).
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests, physical Pencil.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 3 commit 5 pushed, commit 6: phone width

- Committed and pushed commit 5 as `b53d0f5` (`feat(surfaces): bring the editor up in drawing mode`); GitHub reports Verified.
- Commit 6 (in the working tree, **not committed**): at 640 px and below the shell's `.cr-canvas-region` becomes a two-row grid. The photo, rail and labels share row 1; the tool chip docks in row 2 as an opaque bar (no shadow, radius or blur, top rule) instead of floating over the photo. The rail's `max-height` now refers to the photo row, so it scrolls rather than covering the bar. The drawing workspace's old phone offsets for the chip are gone. Storybook's shell gets the same dock at phone width.
- Footer: at 640 px the shell already hides the mask opacity and per-stroke label, so the drawing footer shows only zoom out, the readout, zoom in and "Reference only". No change needed; the toggle's label wraps to two lines at 390 px.
- `drawing-review.ts`: at 640 px and below, the chip starts at or below the photo's bottom edge and inside the canvas region, and the rail ends above the photo's bottom edge.
- Fixed before commit: the first try used `grid-area: 1 / 1`, so the rail still reached 35 px into the bar (see process notes).
- Looked at `drawing-390-closed` and `drawing-390-tall`: the whole photo is visible, the chip bar wraps to two rows (Shape select; points, Apply mark, Cancel) under it. The rail shows 7 of 8 tools closed and 6 tall and scrolls for the rest.
- Verified: `npm run check`, `npm run build-storybook`, `npm test` (12 passed), `npm run test:files` (21 passed).
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 3 commit 4 pushed, commit 5: compact surface chrome in drawing mode

- Committed and pushed commit 4 as `b9a6c62` (`feat(editor): two-height portrait inspector`); GitHub reports Verified.
- Commit 5 (in the working tree, **not committed**): in drawing mode `.surface-navigation` gets `data-compact`. The surface and photo selects sit side by side in one row, and Previous and Next become 44 px chevron icon buttons. They keep their visible-text names (hidden span plus `title`) and control ids. Photo review and checkpoint review are unchanged.
- The "Committed masks are saved to this surface…" notice is now the `title` of the editor's save status (new optional `saveDetail` on `EditorWorkspace`, `detail` on `SaveStatus`). The paragraph stays in the DOM for screen readers but is visually hidden in the workspace. `DrawingReviewAdapter` is unchanged.
- Found in the screenshots: after the change, the surface select showed "Surface 1" on the Upper plaster page. Solid set the select's `value` before its options existed. Options now carry `selected` too. `drawing-review.ts` asserts that the checked surface option matches the page heading; with the fix removed, this check fails ("Surface 1").
- Verified: `npm run check`, `npm run build-storybook`, `npm test` (12 passed), `npm run test:files` (21 passed, run again after the fix). Looked at `drawing-834-closed`, `drawing-834-tall` and `drawing-390-closed`. At 834 px the picker row is one line and the notice is gone; the editor header moved up about 45 px (from about 495 px to about 450 px). At 390 px the row fits (the "Open another surface" label wraps to two lines) and the surface name is truncated in its select; the chip still covers the photo (commit 6).
- Still above the editor in portrait: vault bar, "Project data saved on this device", the back links, the surface heading (repeated in the editor header) and the mode tabs. The plan does not cover them, so the canvas still starts below the fold at 834 × 1194. Left for Phase 2's app shell unless the owner wants more here.
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests; Storybook geometry comparison (the shell's default path is unchanged).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 3 commit 4: portrait inspector height

- The owner accepted the rail overlap at fit (the rail covers about 70 px of the photo's left edge; reachable after zooming in). Open question 2 is closed.
- Shell: new optional `inspectorSize` prop on `EditorWorkspace` (`tall`, `onTall`, `label`, `controlId`). With it, at 960 px and below the workspace sets `data-inspector="short|tall"`: short is 196 px; tall is `minmax(var(--cr-canvas-min), 2fr) minmax(0, 3fr)` (about 60 %), with a canvas minimum of 480 px (410 px at 640 px and below) so the rail and chip still fit. Without the prop nothing changes (Storybook keeps 286 px). Focus mode still hides the inspector.
- `LayerPanel` renders the grip (`IconButton`, chevron, `aria-expanded`, 44 px, top right) when given `size`, and keeps the selected layer row in view inside the body when the selection, the height or the tab changes. It scrolls the body itself; `scrollIntoView` would scroll the page too.
- `DrawingWorkspace` owns the state (short by default) and passes `surface.draw.view.inspector`, labelled "Larger inspector" / "Nagyobb panel", registered in `registry.ts`.
- `tests-platform/drawing-review.ts`: at 834 and 390 px the grip is a 44 px target, tall is taller than short, a `drawing-<width>-tall.png` screenshot of the editor, axe in the tall state, then back to short.
- Fixed before commit: in the first tall screenshot at 834 px the canvas was shorter than the rail (the rail was clipped and the chip sat on it). Hence the canvas minimum.
- Verified on the final code: `npm run check`, `npm run build-storybook`, `npm test` (12 passed), `npm run test:files` (21 passed; one earlier failure was the test itself, see process notes). Looked at `drawing-834-closed`, `drawing-834-tall`, `drawing-390-closed` and `drawing-390-tall`. 834 short: grip at the top right, draft note and Details visible. 834 tall: the whole rail, the chip clear of it, the selected layer row at the top of the inspector. 390 tall: the whole rail; the chip still covers the photo (commit 6).
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests; the step 1 Storybook geometry comparison (the shell's default path is unchanged).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 3 commit 3: fit the photo to the canvas

- Pushed `feat/canvas-first-layout` at `a19167d` (commit 2) at the owner's request; Verified.
- The photo is contained in the canvas box and centred: the workspace viewport is a size container, and `.drawing-photo` is sized by `min(100cqw, 100cqh * ratio)` with `aspect-ratio`, from a `--drawing-ratio` variable `DrawingCanvas` sets from the source frame. The `max-height: calc(var(--cr-editor-height) - 200px)` cap is gone. Pointer mapping reads the photo's box, so input code is unchanged.
- `test:files` caught one fallout: `verifyDetailDrawing` tapped the photo at 6 % / 6 %, which now lands on the tool rail's Navigate button. The tap moved to the top-right corner (94 % / 6 %). `verifyPointerPath` passed unchanged.
- Verified: `npm run check`, `npm run build-storybook`, `npm test` (12 passed), `npm run test:files` (21 passed after the test fix). Looked at `drawing-1194-closed`, `drawing-834-closed` and `drawing-390-closed`: the photo fills the canvas width at every width; at 834 px the 100 px band above the photo is gone and the photo is centred vertically. At 390 px the chip still covers the photo (commit 6).
- Open question for the owner: the rail now covers the photo's left edge at fit (see above).
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 3 commit 2: compact zoom controls in the footer

- Pushed `main` (`d9d2e5b`, the step 3 plan) and `feat/canvas-first-layout` at the owner's request.
- New `DrawingViewControls.tsx`: zoom out (`view.zoomOut`), a readout that fits when pressed (`view.fit`, shows "125 %", named "Fit · 125 %"), zoom in (`view.zoomIn`), then the "Reference only" toggle. The numeric `view.zoom` field moved into "Enter by number" under Coordinates. Both new ids are in `registry.ts`.
- `DrawingCanvas` scales the pan offset when zoom changes from outside, so the buttons and the numeric field zoom around the middle of the canvas instead of drifting.
- `tests-platform/canvas-zoom.ts` covers the buttons, the readout name and text, the centre point within 1 px, and zoom out disabled at fit.
- Fixed before commit: the first screenshots showed the readout and the plus icon white on white (the app's global `button` rule again). `.drawing-zoom .cr-button` now sets `--cr-ink`.
- Verified: `npm run check`, `npm run build-storybook`, `npm test` (12 passed), `npm run test:files` (21 passed; rerun after the colour fix). Looked at `drawing-1194-closed`, `drawing-834-open` and `drawing-390-closed`: the footer is one row at every width.
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 3 commit 1: wheel, trackpad and keyboard zoom

- The owner accepted all five step 3 decisions as recommended. The plan with the decisions is commit `d9d2e5b` on local `main`; **not pushed** (the permission classifier blocked `git push` to `main`; see [process notes](process-notes.md)).
- On `feat/canvas-first-layout`: new `canvas-zoom.ts` with `zoomAt`, used by pinch, the wheel and the keys. Ctrl/⌘ + wheel and trackpad pinch zoom around the pointer (exponential, capped at one 1.25× step per event); a plain wheel pans when zoomed in and is left to the page at fit; `+`/`=`, `-` and `0` on the focused canvas zoom in, out and fit. Maximum zoom 800 % for pinch, wheel, keys and the numeric field in both hosts.
- New `tests-platform/canvas-zoom.ts`, run in `projects.browser.ts` after `verifyDrawingInput`: plain wheel at fit not cancelled, Ctrl + wheel to 125 % with the photo point under the pointer within 1 px, plain wheel pans when zoomed, keys to 156.25 %, back, up to 800 % and fit.
- Verified: `npm run check`, `npm run build-storybook`, `npm test` (12 passed), `npm run test:files` (21 passed).
- Process: started `docs/handoff/process-notes.md` and living skills in `.claude/skills/` (`session-ritual`, `signed-commit`, `editor-ui-verify`); `CLAUDE.md` points at both.
- Not run: `test:app`, `test:sync`, `test:estimates`, Go tests. No screenshots inspected for this commit (no layout change).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · PR #15 merged, Phase 1 step 3 plan

- Reviewed and merged [PR #15](https://github.com/sicza95/cali-restore-pro/pull/15) by fast-forwarding `main` to `e2014fa`, as PR #14 was, so the signed commits keep their signatures (all six checked Verified). Both CI checks passed. No blocking findings.
- Wrote [`docs/plan/editor-canvas-first.md`](../plan/editor-canvas-first.md): wheel, trackpad and keyboard zoom through one zoom helper, compact footer zoom controls (the numeric zoom moves into "Enter by number"), the photo fitted to the canvas, a two-height portrait inspector, a compact surface page row in drawing mode, a docked chip at phone width, and tests. Five decisions; the owner accepted all as recommended (800 % max zoom, Ctrl/⌘ + wheel zooms, two-height inspector, compact surface chrome in commit 5, one PR).
- No code changed, no tests run.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 2 commit 6: tests for pointer-first drawing

- New `verifyPointerPath` in `tests-platform/drawing-input.ts`, run after `verifyPointerStroke` with "Enter by number" closed. Pen: Apply is disabled at "0 points"; three taps show "3 points", and Apply in the chip adds a mark (undone again). Three more taps and Enter on the canvas add a mark. Two taps and Escape return to "0 points". Shape: two rectangle corner taps and Apply add a mark. The pen and Enter/Escape checks added to `verifyPointerStroke` in commit 2 moved here.
- `projects.browser.ts` asserts the disclosure is closed on first load with a photo. New `closeDetails(page)` helper next to `openDetails`.
- The viewport loop in `verifyDrawingReview` checks touch targets for Apply and Cancel in the chip and the header undo with the disclosure closed, then `point.x` with it open. It saves `drawing-<width>-closed.png` and `drawing-<width>-open.png` and runs axe in both states at 1194, 834 and 390 px.
- Fixed a commit 5 regression found in the 834 px screenshot: at 960 px and below, the inspector body only used the left column once the footer was hidden. `.cr-inspector-body:last-child` now spans both.
- The plan's "drag a rectangle" became two corner taps, because the canvas places shape points by tap. The plan now has an "As built" section listing every departure. Ticked Phase 1 item 2 in the quality baseline and marked the plan done.
- Verified: `npm run check`, `npm test` (12), `npm run test:files` (21), `npm run build-storybook`. Looked at the closed screenshots at all three widths and the open one at 834 px.
- Not verified: `test:app`, dark theme in the app, tab order by hand, physical Pencil.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 2 commit 5: close Details by default

- New `DrawingDetails.tsx`: the disclosure is now "Enter by number" / "Megadás számokkal", closed by default. Its open state lives in a module-scope signal, so it stays as left for the rest of the session (across surfaces and tabs), with nothing written to storage. The numeric panel inside it is labelled "Coordinates".
- For brush, eraser, pen and shape, the tool settings show "Draw on the photo, or [enter points by number]". The button opens the disclosure and focuses its first field. That line replaces the path and shape help in the workspace, and the canvas has `aria-describedby` pointing at it while it shows.
- `LayerPanel` hides its footer unless the inspector is empty, has `onCalibrate`, or some layer has an area. The drawing has neither, so its "Coverage —" and disabled calibration button are gone. Storybook passes both and keeps the footer.
- **Moved ahead from commit 6:** `openDetails(page)` in `tests-platform/drawing-review.ts`, called before the first numeric field or save mode in `verifyDrawingReview`, `verifyDrawingInput`, `checkpoint-review.ts` and the reopen flow in `projects.browser.ts`. Without it this commit would not keep `test:files` green.
- Verified: `npm run check`, `npm test` (12), `npm run test:files` (21), `npm run build-storybook`. A temporary probe (not committed) confirmed that on first use the disclosure is closed, the canvas description is the help line, the button focuses `place.x`, and the inspector looks right at 1194 px closed and open.
- Not verified: `test:app`, dark theme, 834 and 390 px with the disclosure closed (commit 6).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 2 commit 4: drafts and history outside Details

- `EditorHistory` gained optional `undoLabel`, `redoLabel` and `controlId`. In the drawing workspace the shell's header undo and redo carry the descriptive names ("Undo · Brush stroke · Master mask") and the `history.undo` and `history.redo` ids. They are disabled while saving, as the inspector pair was inside its busy fieldset.
- `EditorWorkspace` gained `inspectorLead`, passed to `LayerPanel` as `lead` and rendered above the layer list. The drawing puts a draft bar there (`DrawingDraftBar`: layer, pending count, Commit, Discard) while the selected layer has a draft. Commit is the inspector's only primary button.
- `DrawingHistory` takes `controls={false}` in the workspace, so "Details" keeps save mode, the retained-history line and the locked notice. The unused adapter keeps the full history panel. Label text is shared through `historyLabel`.
- The shell hides redo at 640 px and below; the drawing workspace shows it again, because the header pair is now the only redo button.
- Verified: `npm run check`, `npm test` (12), `npm run test:files` (21), `npm run build-storybook`. Temporary screenshots (not committed) of the inspector with a pending draft at 1194 px and of the header at 390 px.
- Not verified: `test:app`, dark theme in the app.

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 2 commit 3: one layer list

- `EditorLayer` gained optional `meta` and `expanded`. `LayerPanel` gained `tree`, `rowControlId(kind)` and `onToggleExpand`, forwarded by `EditorWorkspace` as `layerTree`, `layerControlId` and `onToggleLayerExpand`. Rows show `meta` under the name, and folders nest to any depth in both modes.
- **Departure from the plan:** the plan assumed the drawing could use `LayerPanel`'s grouped layout. It can't without losing behaviour: the drawing list selects the master and folders, keeps damage and phase layers in stacking order (which `layer.up`/`down` change), and puts phases inside folders. So `tree` lists the layers in model order as one tree, with the master and folders as selectable rows and a separate open/close button (`layer.expand`) on each folder. Without `tree` the grouped layout is unchanged, so Storybook keeps its DOM.
- With `onToggleExpand`, a closed folder's rows leave the DOM (as the old list did); without it they stay `hidden`, as before.
- `DrawingLayers` takes `list={false}` in the workspace: its add row and properties now sit under the shell list, outside "Details". The unused `DrawingReviewAdapter` keeps the old list until step 4 retires it. Meta text (`layerMeta`) and the folder toggle (`toggleFolder`) are shared by both.
- The workspace passes no layers until a surface and photo are ready (the old list was hidden then too). The tool heading in the workspace is now `h2`, because axe flagged a jump from the shell's `h1` once the old list's `h3` was gone.
- Fixed a step 1 bug: inside the app, the global `button` rule made shell layer names white on white. `.cr-layer-select`, `.cr-group-header` and the folder toggle now set `--cr-ink`.
- Verified: `npm run check`, `npm test` (12), `npm run test:files` (21), `npm run build-storybook`. Looked at the inspector at 1194 px from the top, including a collapsed and an expanded folder.
- Not verified: `test:app`, dark theme in the app, a Storybook geometry comparison (`ui.spec.ts` layout and axe checks pass).

### 2026-11-15 · Claude (Claude Code on the owner's Windows machine) · Step 2 commit 2: apply and cancel from the canvas

- New `DrawingSketchActions.tsx` holds Apply, Cancel and an optional live point count ("3 points" / "3 pont", `aria-live="polite"`). In `DrawingWorkspace` they sit in the tool chip through `DrawingToolOptions actions`, and `DrawingToolSettings actions={false}` drops them from the inspector; `DrawingReviewAdapter` keeps them in its inspector. Control ids are unchanged and each is still rendered once.
- The chip shows the actions whenever pen or shape is active (or the node tool has a mark), with Apply disabled until the sketch is valid, rather than only once a point exists: existing tests expect a disabled Apply right after choosing the shape tool, and the keyboard path needs Apply after "Add point".
- Enter applies and Escape cancels when focus is on the canvas or on the active tool's rail button (not other rail buttons, so Enter still switches tools). The canvas (`view.canvas`) is now `tabindex="-1"` and takes focus on pointerdown, because the cancelled pointerdown otherwise leaves focus where it was.
- The chip wraps (`flex-wrap`, max width of the canvas). At 640 px and below it starts right of the rail (it was partly covered at 390 px) and hides the layer name; the shell's layer name span gained the `cr-context-layer` class for that.
- `verifyPointerStroke` now also taps three pen points, sees "3 points", presses Enter and sees the mark count rise, then taps two points, presses Escape and sees "0 points".
- Verified: `npm run check`, `npm test` (12), `npm run test:files` (21), `npm run build-storybook`; looked at the fresh drawing screenshots at 834 and 390 px (390 wraps to three rows, nothing clipped).
- Not verified: `test:app`, tab order by hand, dark theme screenshots.

### 2026-11-14 · Claude (Claude Code on the owner's Windows machine) · Step 2 commit 1: split the drawing inspector

- `DrawingInspector.tsx` is gone. `DrawingToolSettings.tsx` holds the heading and help, brush toggles and strength, path operation, the node tool's mark picker, close path and Apply/Cancel (plus `DrawingToolOptions` for the chip). `DrawingNumericEntry.tsx` holds `place.x/y`, `brush.dot`, `point.add`, `point.select`, `point.x/y`, curve, handles and `point.delete`.
- `DrawingReviewAdapter` passes numeric entry into the settings' `numeric` slot, so its DOM is unchanged. `DrawingWorkspace` renders settings above "Details" and numeric entry inside it, in its own panel named "Enter by number" / "Megadás számokkal" (new `numericEntry` copy). "Details" stays open. Apply/Cancel sit with settings until commit 2 moves them to the chip.
- Verified: `npm run check`, `npm test` (12), `npm run test:files` (21) pass; looked at the fresh `drawing-1194.png`.
- Verified too: `npm run build-storybook` succeeds.
- Not verified: `test:app`, keyboard tab order by hand.

### 2026-11-14 · Claude (Claude Code on the owner's Windows machine) · Phase 1 step 2 plan

- Wrote [`docs/plan/editor-pointer-first.md`](../plan/editor-pointer-first.md). Main finding: closing "Details" as it is today would hide Apply for pen and shape paths, draft Commit and Discard, layer creation and properties, and every brush setting, because `DrawingInspector`, `DrawingHistory` and `DrawingLayers` all sit inside it. The plan moves those out (tool chip, inspector, shell header and `LayerPanel`) in commits 1 to 4, closes the disclosure in commit 5 and adds pointer path tests in commit 6.
- Folded the old open question 1 (keep the numeric form) into the plan, using the step 1 recommendation: keep it inside "Details".
- Owner accepted decisions 1 to 3 as recommended: "Details" keeps the numeric form, save mode and history log; mark picking by tap waits; commit 1 to `main`, commits 2 to 6 through one PR.
- No code changed, no tests run.

### 2026-11-14 · Claude (Claude Code on the owner's Windows machine) · Convergence commit 5: tests for the converged editor

- Merged PR #14 (commit 4) after the owner's review.
- `verifyPointerStroke` in `tests-platform/drawing-input.ts`: in stroke history mode, a mouse drag across the photo with the brush adds one mark to the selected layer, the undo button names it "Brush stroke", and undo removes it. `projects.browser.ts` runs it after `verifyDrawingInput`.
- The axe pass on `.drawing-workspace` now runs at 1194, 834 and 390 px instead of once at 390 px. The screenshots at those widths came with commit 4.
- Ticked Phase 1 item 1 in the quality baseline and marked the convergence plan done.
- Verified: `npx playwright test --config playwright.files.config.ts projects.browser.ts` passes.
- Not verified: `npm run test:app` (not re-run since commit 1), dark theme.

### 2026-11-14 · Claude (Claude Code on the owner's Windows machine) · Convergence commit 4: drawing review through the shell

- Committed and pushed commit 3 as `7f52584` (signed, verified on GitHub). Commit 4 is on `feat/drawing-workspace`.
- `EditorWorkspace` is generic over the tool id and forwards `tools`, `toolsLabel`, `toolReason` and `toolControlId` to `ToolRail`. The tool chip takes its icon from the tool list. `onMaskOpacity` is optional; without it the footer has no opacity slider.
- New `DrawingWorkspace` (`src/ui/editor/drawing-review/`) builds `createDrawingReview` and `createDrawingTools` as `DrawingReviewAdapter` does and maps them onto the shell; helpers in `workspace-props.ts`, shell strings in EN and HU in `workspace-copy.ts`, layout in `workspace.css`. `SurfaceDrawing` renders it; `SurfaceWorkspace` passes the surface name as title and project / object as breadcrumb. `DrawingReviewAdapter` is unused by the route and stays until step 4.
- Placement: rail on the canvas; brush width and shape kind in the tool chip (`DrawingToolOptions`, split out of `DrawingInspector` behind `toolOptions={false}`, so control ids stay unique); point fields, history and layer management in a "Details" disclosure, open by default; reference-only, zoom and fit in the footer; feedback as a status notice; resolve-draft dialog as a shell child. Keyboard shortcuts and every `surface.draw.*` id are unchanged.
- Save state: failed or recovery conflict → error, busy → saving, pending draft marks → draft, else saved.
- Layer swatches now render from `EditorLayer.swatch` (`data-fill` and `--cr-swatch-color`); the sample id classes still apply, so Storybook looks the same.
- New `src/ui/components.css` holds every component stylesheet; `ui.css` is now `base.css` plus that file. The app imports only `components.css`, because the app root has `.cr-root` and `base.css` turned account buttons' text to the ink colour (axe contrast failures on estimates, backups, reports and pattern review).
- The app rail has eight tools, so at ≤640 px it scrolls instead of hiding tools five and later.
- Test change: the layout check in `tests-platform/drawing-review.ts` now reads the shell's rail, canvas and inspector and expects the rail to float on the canvas's left edge; the axe pass covers `.drawing-workspace`. No other selector changed.
- Deviations from the plan: no `PhotoStrip` in the footer (it is hard-wired to sample photos; the surface page already has a photo picker). Shell strings live in `workspace-copy.ts`, not in `drawingCopy`; only `details` was added there. The shell's zoom readout is not used, since the footer has the zoom field.
- Verified: `npm run check`, `npm test` 12/12, `npm run test:files` 21/21, `npm run build-storybook`, `npm run build`. Screenshots at 1194, 834 and 390 px checked by eye.
- Not verified / known: `npm run test:app` not re-run. Portrait inspector is 286 px tall, so the details form scrolls in a small box. At 390 px the footer is cramped. The inspector footer shows "Coverage —" and a disabled calibration button, which mean nothing here yet. Folders nested more than one level show only in the details list. Dark theme not checked. The shell header repeats the CaliRestore brand inside the account layout.

### 2026-11-14 · Claude (Claude Code on the owner's Windows machine) · Convergence commit 3: ToolRail takes its tools

- `ToolRail` is generic over the tool id and accepts `tools`, `label`, `disabledReason` and `controlId`. Without them it renders the same seven tools, `editor.tool.*` ids and "Drawing tools" name as before. `toolControlId` in `tool-rail/constants.ts` is the shared default for the rail and its registry.
- A tool with a reason gets `aria-disabled`, the reason as `title`, and `aria-describedby` pointing at a visually hidden `<id>-reason` span; clicking or pressing it does not call `onChange`. It stays focusable, as in `DrawingReviewAdapter`.
- Difference from `DrawingReviewAdapter`: the reason span sits inside the button, not beside it, so the rail's children stay one button per tool (`responsive.css` hides tools with `.cr-tool:nth-child(n + 5)`). Disabled tools show their icon at 45% opacity.
- `label` is beyond the plan's list; the application rail has a translated name.
- New story `Editor/Tool rail/Custom tools` and a Storybook test for a supplied list, custom control ids and the unavailable tool.
- Verified: `npm run check`, `npm test` 12/12, `npm run test:files` 21/21, `npm run build-storybook`, `npm run build`.
- Not verified: `npm run test:app` was not re-run. The new story was not reviewed by eye; the disabled styling is untested in the dark theme and at 390 px, where the fifth and later tools are hidden.

### 2026-11-14 · Claude (Claude Code on the owner's Windows machine) · Convergence commit 2: controlled shell

- `EditorWorkspace` holds no signals. Layers, active layer, tool, history, save state, focus mode, mask opacity, zoom label and copy are props; `canvas`, `toolOptions`, `inspectorDetail`, `footerStart` and `children` are slots. The root element is configurable through `as` and its height reads `--cr-editor-height` (default `100dvh`).
- `EditorLayer` and `EditorCopy` are in `src/ui/editor/types.ts`; `LayerId` is `string`. English shell strings are in `editorCopy` (`src/ui/editor/constants.ts`).
- `LayerPanel` renders master, folders, loose damage layers and phases from `layers`, keyed by id so rows keep focus when the model replaces a layer object. Measurements and coverage are derived from layer areas. `LayerRow` and `LayerMeasurements` are split out.
- `src/stories/EditorReviewAdapter.tsx` owns every signal; the sample surface moved to `src/stories/editor-review/`. `Direction.stories.tsx` renders the adapter, because the shell can no longer render without data.
- Beyond the plan's prop list: `empty`, `focus`/`onFocus`, `maskOpacity`/`onMaskOpacity`, `zoom`, `onCalibrate`, `onExport` and `children`, all needed to keep today's stories.
- Deferred: `EditorLayer.swatch` is populated but not rendered. Swatches still use the `cr-swatch--<id>` class, because rendering from data would change the DOM. Commit 4 has to render it, since application layer ids are UUIDs.
- Verified: `#storybook-root` markup, element boxes and focused element are byte-identical before and after for all eight Workspace stories and the Direction story at 1194, 834 and 390 px wide, and after each of 16 interactions (86 snapshots). `npm run check`, `npm test` 11/11, `npm run test:files` 21/21, `npm run build-storybook`, `npm run build`.
- Not verified: `npm run test:app` was not re-run. No screenshot review was done beyond the geometry comparison.

### 2026-11-14 · Claude (Claude Code on the owner's Windows machine) · Convergence commit 1: green baseline

- Committed and pushed the baseline re-check and the Phase 1 plan as `bbce8a9` (signed, verified on GitHub).
- `tests-platform/app-navigation.ts` adds `showAppNavigation`, which opens the Menu disclosure when it is showing. `identity.spec.ts` and `settings.spec.ts` call it before using "Sign out" and "Account profile" at 834 px. No application code changed.
- `tests/warm-up.ts` is a Playwright global setup that loads one story before the workers start, so the first test on each worker no longer races the Storybook dev server's first compile. `playwright.built.config.ts` inherits it.
- Verified: `npm run check`; `npm test` 11/11 with the server started cold by Playwright; `npm run test:app` 16 passed, 1 skipped against a fresh disposable Compose project (`calirestore-qa-commit1`, ports 18093/18094), removed with its volumes afterwards. The development stack was not touched.
- Not verified: the Storybook suite against the static build (`playwright.built.config.ts`) and `npm run test:files` were not re-run.

### 2026-11-14 · Claude (Claude Code on the owner's Windows machine) · Baseline re-check and Phase 1 plan

- Committed and pushed the onboarding docs as `d2f0e33`; GitHub reports the signature as verified (`reason: valid`).
- Ran `npm run check`, `npm test`, `npm run test:app` and `npm run test:files`. The app suite used a freshly built disposable Compose project (`calirestore-qa-baseline`, ports 18093/18094), removed with its volumes afterwards. The development stack `calirestore-ui-dev-main` was not touched.
- Compared the new screenshots with the review and added a "Re-check on current main" section. Corrected UX 1 (pointer drawing already exists; the form only dominates the inspector), retired the "sidebar floats mid-page" finding (sticky sidebar in full-page captures), recorded three new findings.
- Wrote the Phase 1 step 1 plan. No code changed.
- Git and trust note: this session ran directly on Windows with the signing key available, so it committed and pushed itself. `CLAUDE.md` now distinguishes this from the Linux VM sessions.

### 2026-11-14 · Claude · Onboarding and quality baseline

- Discovered the repo, plan pack, milestone docs and recent history.
- `tsc --noEmit` and `eslint` pass (Node 22 VM). Storybook rendered at iPad landscape and portrait; app screens reviewed from the 16:11 Playwright run.
- Added `CLAUDE.md`, this handoff and `docs/reviews/2026-11-14-quality-baseline.md`; linked the handoff from `AGENTS.md`.
- Not done: no code changes; nothing committed by Claude (signing key is on the owner's machine).
