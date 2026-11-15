# Handoff

Shared by Codex and Claude. Update at the end of every working session. Newest entry first; keep the "Current state" block accurate and trim the log to the last ~10 entries (older detail lives in git history and milestone docs).

## Current state

- **Branch:** `main` at `2787ff5` (Verified). Step 4 landed by fast-forwarding `main` to the [PR #17](https://github.com/sicza95/cali-restore-pro/pull/17) head, which GitHub marks merged. The remote `refactor/retire-drawing-adapter` and `feat/canvas-first-layout` branches are deleted (both were already in `main`).
- **Target devices:** iPad and desktop only (owner decision, 2026-11-15). Phone widths are not supported for now.
- **Last milestone:** M-16 measured estimates and draft outputs ([evidence](../m16-measured-integration.md)), followed by `3c33d33` workspace/shell refresh and dev launcher, then `d2f0e33` onboarding docs.
- **Quality baseline:** [2026-11-14 review](../reviews/2026-11-14-quality-baseline.md) — code 7, architecture 7, UX 4, UI 5. Re-checked against fresh screenshots from `d2f0e33`; ratings unchanged, one finding corrected, one retired.
- **Active roadmap phase:** Phase 1 is done and on `main`. Phase 2 (UX and copy) step 1 is planned in [copy audit](../plan/copy-audit.md); the owner accepted all four decisions as recommended.
- **Suite status:** see the latest log entry.
- **Not run:** `test:app` (since commit 1), `test:sync`, `test:estimates`, Go tests, backup and smoke scripts.

## Next step

Owner answers the four decisions in [copy audit](../plan/copy-audit.md). Then commit the plan to `main` and start commit 1 (glossary) on `copy/task-language`.

## Open questions for the owner

1. Should the 390 px checks and screenshots in `tests-platform/drawing-review.ts` and `projects.browser.ts` be removed now that phones are not a target, or kept as a guard?

## Log

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
