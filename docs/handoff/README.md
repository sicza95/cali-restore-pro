# Handoff

Shared by Codex and Claude. Update at the end of every working session. Newest entry first; keep the "Current state" block accurate and trim the log to the last ~10 entries (older detail lives in git history and milestone docs).

## Current state

- **Branch:** `feat/canvas-first-layout` (step 3, one PR; pushed up to commit 1). Before that: `main`, pushing directly per `AGENTS.md`; step 2 commits 2 to 6 go on `feat/pointer-drawing-first` and land through one PR. Convergence commit 4 landed through [PR #14](https://github.com/sicza95/cali-restore-pro/pull/14); commit 5 went straight to `main`.
- **Last milestone:** M-16 measured estimates and draft outputs ([evidence](../m16-measured-integration.md)), followed by `3c33d33` workspace/shell refresh and dev launcher, then `d2f0e33` onboarding docs.
- **Quality baseline:** [2026-11-14 review](../reviews/2026-11-14-quality-baseline.md) — code 7, architecture 7, UX 4, UI 5. Re-checked against fresh screenshots from `d2f0e33`; ratings unchanged, one finding corrected, one retired.
- **Active roadmap phase:** Phase 1 steps 1 ([editor convergence](../plan/editor-convergence.md)) and 2 ([pointer drawing first](../plan/editor-pointer-first.md)) are done and ticked in the quality baseline. All of step 2 is on `main` ([PR #15](https://github.com/sicza95/cali-restore-pro/pull/15) merged as `e2014fa`). Step 3 ([canvas-first layout](../plan/editor-canvas-first.md)) is planned; the owner accepted all five decisions as recommended. Its seven commits go on `feat/canvas-first-layout` for one PR.
- **Suite status:** see the latest log entry.
- **Not run:** `test:app` (since commit 1), `test:sync`, `test:estimates`, Go tests, backup and smoke scripts.

## Next step

Step 3 commit 3 (`fix(editor): fit the photo to the canvas`) on `feat/canvas-first-layout`.

## Open questions for the owner

1. Is the 390 px phone layout a supported target, or only iPad and desktop?

## Log

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
