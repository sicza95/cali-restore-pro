# Handoff

Shared by Codex and Claude. Update at the end of every working session. Newest entry first; keep the "Current state" block accurate and trim the log to the last ~10 entries (older detail lives in git history and milestone docs).

## Current state

- **Branch:** `main`, pushing directly per `AGENTS.md`.
- **Last milestone:** M-16 measured estimates and draft outputs ([evidence](../m16-measured-integration.md)), followed by `3c33d33` workspace/shell refresh and dev launcher, then `d2f0e33` onboarding docs.
- **Quality baseline:** [2026-11-14 review](../reviews/2026-11-14-quality-baseline.md) — code 7, architecture 7, UX 4, UI 5. Re-checked against fresh screenshots from `d2f0e33`; ratings unchanged, one finding corrected, one retired.
- **Active roadmap phase:** Phase 0 complete → Phase 1 step 1, planned in [editor convergence](../plan/editor-convergence.md). Commit 1 of that plan is done.
- **Suite status after commit 1:** `npm run check` passes. `npm test` 11/11 from a cold Storybook server, no retries. `npm run test:app` 16 passed, 1 skipped (`invitations.spec.ts` needs its `M06_*` session variables). `npm run test:files` was 21/21 on `d2f0e33` and was not re-run; commit 1 touches none of its files.
- **Not run:** `test:files` (since `d2f0e33`), `test:sync`, `test:estimates`, `build-storybook`, Go tests, backup and smoke scripts.

## Next step

Commit 2 of the [editor convergence plan](../plan/editor-convergence.md): make `EditorWorkspace` a controlled shell, with stories, DOM and the Storybook suite unchanged.

## Open questions for the owner

1. Numeric point form: keep it inside a "Details" disclosure as the accessible fallback (recommended), or drop it?
2. Land the convergence on `main` throughout, or put the commit that swaps the shipped drawing screen through a short-lived branch and PR (recommended)?
3. Is the 390 px phone layout a supported target, or only iPad and desktop?

## Log

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
