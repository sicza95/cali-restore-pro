# Handoff

Shared by Codex and Claude. Update at the end of every working session. Newest entry first; keep the "Current state" block accurate and trim the log to the last ~10 entries (older detail lives in git history and milestone docs).

## Current state

- **Branch:** `main`, pushing directly per `AGENTS.md`.
- **Last milestone:** M-16 measured estimates and draft outputs ([evidence](../m16-measured-integration.md)), followed by `3c33d33` workspace/shell refresh and dev launcher, then `d2f0e33` onboarding docs.
- **Quality baseline:** [2026-11-14 review](../reviews/2026-11-14-quality-baseline.md) — code 7, architecture 7, UX 4, UI 5. Re-checked against fresh screenshots from `d2f0e33`; ratings unchanged, one finding corrected, one retired.
- **Active roadmap phase:** Phase 0 complete → Phase 1 step 1, planned in [editor convergence](../plan/editor-convergence.md). Commits 1 to 3 of that plan are done.
- **Suite status after commit 3:** `npm run check` passes. `npm test` 12/12. `npm run test:files` 21/21. `npm run build-storybook` and `npm run build` succeed. `npm run test:app` was 16 passed, 1 skipped after commit 1 and was not re-run; commits 2 and 3 change nothing the application renders.
- **Not run:** `test:app` (since commit 1), `test:sync`, `test:estimates`, Go tests, backup and smoke scripts.

## Next step

Commit 4 of the [editor convergence plan](../plan/editor-convergence.md): render drawing review through `EditorWorkspace` with a new `DrawingWorkspace` adapter. `EditorWorkspace` does not yet forward a tool list, reasons or control ids to `ToolRail`, and its `tool` prop is still typed as the review `Tool`; commit 4 has to add that. Open question 2 (branch and PR for this commit) should be answered first.

## Open questions for the owner

1. Numeric point form: keep it inside a "Details" disclosure as the accessible fallback (recommended), or drop it?
2. Land the convergence on `main` throughout, or put the commit that swaps the shipped drawing screen through a short-lived branch and PR (recommended)?
3. Is the 390 px phone layout a supported target, or only iPad and desktop?

## Log

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
