# Handoff

Shared by Codex and Claude. Update at the end of every working session. Newest entry first; keep the "Current state" block accurate and trim the log to the last ~10 entries (older detail lives in git history and milestone docs).

## Current state

- **Branch:** `main`, pushing directly per `AGENTS.md`. Convergence commit 4 landed through [PR #14](https://github.com/sicza95/cali-restore-pro/pull/14); commit 5 went straight to `main`.
- **Last milestone:** M-16 measured estimates and draft outputs ([evidence](../m16-measured-integration.md)), followed by `3c33d33` workspace/shell refresh and dev launcher, then `d2f0e33` onboarding docs.
- **Quality baseline:** [2026-11-14 review](../reviews/2026-11-14-quality-baseline.md) — code 7, architecture 7, UX 4, UI 5. Re-checked against fresh screenshots from `d2f0e33`; ratings unchanged, one finding corrected, one retired.
- **Active roadmap phase:** Phase 1 step 1 ([editor convergence](../plan/editor-convergence.md)) is done and ticked in the quality baseline. Phase 1 step 2 ([pointer drawing first](../plan/editor-pointer-first.md)) is in progress: commit 1 (inspector split) is on `main`; the owner accepted decisions 1 to 3 as recommended.
- **Suite status:** see the latest log entry.
- **Not run:** `test:app` (since commit 1), `test:sync`, `test:estimates`, Go tests, backup and smoke scripts.

## Next step

Open one branch for commits 2 to 6 of [pointer drawing first](../plan/editor-pointer-first.md) and start commit 2: `path.apply` and `path.cancel` move into the tool chip with a live point count, Enter applies and Escape cancels on the canvas or rail. Check the chip at 834 and 390 px.

## Open questions for the owner

1. Is the 390 px phone layout a supported target, or only iPad and desktop?

## Log

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
